using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

/// <summary>Um alerta e a chave que o identifica (alerta + período), para não o enviar duas vezes por push.</summary>
internal sealed record AlertaCalculado(AlertaDto Alerta, string Chave);

// Alertas proativos: o que o utilizador devia ver sem ter de ir procurar. Só lê (não recebe o salário, não
// faz débitos): é o que GET /api/alertas devolve e o que o envio por push usa (AlertasEnvioService).
//
//   - orçamento do mês a 80% (aviso) ou a 100% (excedido) do limite; e, ainda abaixo dos 80%, o aviso de ritmo
//     (já passou da parte do mês que lhe cabia e ao ritmo atual passa o limite: ver RitmoOrcamento);
//   - despesa mensal por pagar cujo dia de débito é daqui a 3 dias ou menos (a vencer) ou já passou (vencida);
//   - prestação de uma dívida (a despesa mensal ligada) nas mesmas condições: dívida a vencer / vencida.
//     A despesa de uma dívida só aparece como dívida, nunca duas vezes;
//   - objetivo de poupança atrasado;
//   - pagamento de um acerto de contas do grupo que ainda não confirmei (o dinheiro só entra na conta ao confirmar);
//   - despesa que outro membro do grupo adicionou e cuja minha parte ainda não aceitei (diz quanto me cabe pagar);
//   - gastos fora do normal em comparação com os últimos 3 meses: categoria já acima da média, despesa mensal
//     que subiu (ex.: a eletricidade) e um gasto isolado muito maior que o habitual (ver GastosAnormais).
//
// A chave de cada alerta inclui o período: os avisos de orçamento, as despesas e prestações a vencer e os
// objetivos, as categorias e as despesas que subiram contam uma vez por mês (um gasto isolado, uma vez); as vencidas repetem-se uma vez por dia enquanto não forem pagas.
internal sealed class AlertasService(
    IOrcamentosService orcamentos,
    IObjetivosService objetivos,
    IDividasService dividas,
    IDespesasFixasRepository fixas,
    IPagamentosRepository pagamentos,
    IDespesasExtrasRepository extras,
    IDespesasPartilhadasRepository partilhadas,
    IUtilizadoresRepository utilizadores,
    Relogio relogio) : IAlertasService
{
    public async Task<IReadOnlyList<AlertaDto>> ListarAsync(string uid, CancellationToken ct = default) =>
        [.. (await CalcularAsync(uid, ct)).Select(a => a.Alerta)];

    internal async Task<IReadOnlyList<AlertaCalculado>> CalcularAsync(string uid, CancellationToken ct = default)
    {
        var hoje = relogio.Hoje;
        var mes = Meses.De(hoje);
        var alertas = new List<AlertaCalculado>();

        // ---- Orçamentos ----
        foreach (var o in await orcamentos.EstadoAsync(uid, mes, ct))
        {
            var nome = Categorias.Nome(o.Categoria);
            if (o.Estado == EstadoOrcamento.Ok)
            {
                // Ainda abaixo dos 80%, mas a gastar-se depressa: avisa antes de estourar
                if (o.Previsto is { } previsto && RitmoOrcamento.Aviso(o.Gasto, o.Limite, previsto, o.Estado, hoje))
                {
                    var doMes = RegrasAlertas.Percentagem(RitmoOrcamento.PercentagemDoMes(hoje));
                    alertas.Add(new AlertaCalculado(
                        new AlertaDto(
                            TipoAlerta.OrcamentoRitmo,
                            SeveridadeAlerta.Aviso,
                            Textos.T($"{nome} a gastar depressa: {RegrasAlertas.Percentagem(o.Percentagem)}% do orçamento"),
                            Textos.T($"Já gastaste {RegrasAlertas.Euros(o.Gasto)} de {RegrasAlertas.Euros(o.Limite)} em {nome} ({RegrasAlertas.Percentagem(o.Percentagem)}%) e o mês só vai a {doMes}%. A este ritmo chegas a {RegrasAlertas.Euros(previsto)} no fim do mês."),
                            o.Id,
                            hoje),
                        $"orcamento-ritmo:{o.Id}:{mes}"));
                }

                continue;
            }

            if (o.Estado == EstadoOrcamento.Ultrapassado)
            {
                alertas.Add(new AlertaCalculado(
                    new AlertaDto(
                        TipoAlerta.OrcamentoExcedido,
                        SeveridadeAlerta.Critico,
                        Textos.T($"Orçamento de {nome} ultrapassado"),
                        Textos.T($"Gastaste {RegrasAlertas.Euros(o.Gasto)} de {RegrasAlertas.Euros(o.Limite)} em {nome}: limite ultrapassado."),
                        o.Id,
                        hoje),
                    $"orcamento-excedido:{o.Id}:{mes}"));
            }
            else
            {
                alertas.Add(new AlertaCalculado(
                    new AlertaDto(
                        TipoAlerta.OrcamentoAviso,
                        SeveridadeAlerta.Aviso,
                        Textos.T($"Orçamento de {nome} a {RegrasAlertas.Percentagem(o.Percentagem)}%"),
                        Textos.T($"Já gastaste {RegrasAlertas.Euros(o.Gasto)} de {RegrasAlertas.Euros(o.Limite)} em {nome} este mês."),
                        o.Id,
                        hoje),
                    $"orcamento-aviso:{o.Id}:{mes}"));
            }
        }

        // ---- Despesas mensais e prestações das dívidas ----
        var listaFixas = await fixas.ListarAsync(uid, ct);
        var pagamentosDoMes = await pagamentos.ListarDoMesAsync(uid, mes, ct);
        var dividasComEstado = await dividas.ListarComEstadoAsync(uid, ct);
        var fixasDeDividas = dividasComEstado
            .Where(d => !string.IsNullOrEmpty(d.FixaId))
            .Select(d => d.FixaId!)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var fixa in listaFixas.Where(f => !fixasDeDividas.Contains(f.Id)))
        {
            if (RegrasAlertas.VencimentoPorPagar(fixa, pagamentosDoMes, hoje) is not { } vencimento)
            {
                continue;
            }

            var falta = FaltaPagar(fixa, pagamentosDoMes, mes);
            var dia = vencimento.Dia.Day;
            alertas.Add(vencimento.EmAtraso
                ? new AlertaCalculado(
                    new AlertaDto(
                        TipoAlerta.DespesaVencida,
                        SeveridadeAlerta.Critico,
                        Textos.T($"{fixa.Titulo} por pagar desde o dia {dia}"),
                        Textos.T($"A despesa {fixa.Titulo} ({RegrasAlertas.Euros(falta)}) devia ter sido paga no dia {dia}."),
                        fixa.Id,
                        vencimento.Dia),
                    $"despesa-vencida:{fixa.Id}:{hoje:yyyy-MM-dd}")
                : new AlertaCalculado(
                    new AlertaDto(
                        TipoAlerta.DespesaAVencer,
                        SeveridadeAlerta.Aviso,
                        Textos.T($"{fixa.Titulo} sai {RegrasAlertas.QuandoVence(vencimento)} — {RegrasAlertas.Euros(falta)}"),
                        Textos.T($"A despesa {fixa.Titulo} ({RegrasAlertas.Euros(falta)}) vence no dia {dia}."),
                        fixa.Id,
                        vencimento.Dia),
                    $"despesa-a-vencer:{fixa.Id}:{mes}"));
        }

        foreach (var divida in dividasComEstado.Where(d => d.EmFalta > 0m && !string.IsNullOrEmpty(d.FixaId)))
        {
            var prestacao = listaFixas.FirstOrDefault(f => f.Id == divida.FixaId);
            if (prestacao is null || RegrasAlertas.VencimentoPorPagar(prestacao, pagamentosDoMes, hoje) is not { } vencimento)
            {
                continue;
            }

            var falta = FaltaPagar(prestacao, pagamentosDoMes, mes);
            var dia = vencimento.Dia.Day;
            alertas.Add(vencimento.EmAtraso
                ? new AlertaCalculado(
                    new AlertaDto(
                        TipoAlerta.DividaVencida,
                        SeveridadeAlerta.Critico,
                        Textos.T($"Prestação da dívida {divida.Titulo} em atraso desde o dia {dia}"),
                        Textos.T($"A prestação de {RegrasAlertas.Euros(falta)} devia ter sido paga no dia {dia}. Em falta: {RegrasAlertas.Euros(divida.TotalAPagar())}."),
                        divida.Id,
                        vencimento.Dia),
                    $"divida-vencida:{divida.Id}:{hoje:yyyy-MM-dd}")
                : new AlertaCalculado(
                    new AlertaDto(
                        TipoAlerta.DividaAVencer,
                        SeveridadeAlerta.Aviso,
                        Textos.T($"Prestação da dívida {divida.Titulo} vence {RegrasAlertas.QuandoVence(vencimento)}"),
                        Textos.T($"A prestação de {RegrasAlertas.Euros(falta)} vence no dia {dia}. Em falta: {RegrasAlertas.Euros(divida.TotalAPagar())}."),
                        divida.Id,
                        vencimento.Dia),
                    $"divida-a-vencer:{divida.Id}:{mes}"));
        }

        // ---- Objetivos de poupança ----
        foreach (var objetivo in await objetivos.ListarAsync(uid, ct))
        {
            if (objetivo.Estado != EstadoObjetivo.Atrasado)
            {
                continue;
            }

            alertas.Add(new AlertaCalculado(
                new AlertaDto(
                    TipoAlerta.ObjetivoAtrasado,
                    SeveridadeAlerta.Aviso,
                    Textos.T($"Objetivo {objetivo.Nome} atrasado"),
                    Textos.T($"Já tens {RegrasAlertas.Euros(objetivo.ValorAtual)} de {RegrasAlertas.Euros(objetivo.ValorAlvo)}: faltam {RegrasAlertas.Euros(objetivo.EmFalta)} para o objetivo."),
                    objetivo.Id,
                    hoje),
                $"objetivo-atrasado:{objetivo.Id}:{mes}"));
        }

        // ---- Acertos de contas por confirmar (a referência é o grupo, para a app abrir o grupo certo) ----
        var porConfirmar = await partilhadas.ListarAcertosPorConfirmarAsync(uid, ct);
        var nomes = await utilizadores.NomesAsync(porConfirmar.Select(a => a.DeUid), ct);
        foreach (var acerto in porConfirmar)
        {
            var nome = nomes[acerto.DeUid];
            alertas.Add(new AlertaCalculado(
                new AlertaDto(
                    TipoAlerta.AcertoPorConfirmar,
                    SeveridadeAlerta.Aviso,
                    Textos.T($"Confirma que recebeste {RegrasAlertas.Euros(acerto.Valor)}"),
                    Textos.T($"{nome} diz que te pagou {RegrasAlertas.Euros(acerto.Valor)}. Confirma no grupo que recebeste para o valor entrar na tua conta."),
                    acerto.GrupoId,
                    acerto.Data),
                $"acerto-por-confirmar:{acerto.Id}"));
        }

        // ---- Despesas do grupo em que tenho a parte por aceitar (diz quanto me cabe pagar) ----
        var porAceitar = await partilhadas.ListarPartesPorAceitarAsync(uid, ct);
        var pagadores = await utilizadores.NomesAsync(porAceitar.Select(x => x.Despesa.PagadorUid).Distinct(), ct);
        foreach (var (despesa, parte) in porAceitar)
        {
            var nome = pagadores.GetValueOrDefault(despesa.PagadorUid) ?? "";
            alertas.Add(new AlertaCalculado(
                new AlertaDto(
                    TipoAlerta.DespesaPartilhadaPorAceitar,
                    SeveridadeAlerta.Aviso,
                    Textos.T($"Nova despesa no grupo: deves {RegrasAlertas.Euros(parte.Valor)}"),
                    Textos.T($"{nome} adicionou \"{despesa.Titulo}\" ao grupo e a tua parte é {RegrasAlertas.Euros(parte.Valor)}. Abre o grupo para aceitar ou recusar."),
                    despesa.GrupoId,
                    despesa.Data),
                $"despesa-por-aceitar:{parte.Id}:{parte.Valor}"));
        }

        // ---- Gastos fora do normal (em comparação com os últimos 3 meses) ----
        alertas.AddRange(await GastosForaDoNormalAsync(uid, hoje, mes, ct));

        // Os mais graves primeiro; depois os que vencem mais cedo
        return
        [
            .. alertas
                .OrderByDescending(a => a.Alerta.Severidade)
                .ThenBy(a => a.Alerta.Data)
                .ThenBy(a => a.Alerta.Tipo)
                .ThenBy(a => a.Alerta.Titulo, StringComparer.Ordinal),
        ];
    }

    // No máximo 3 categorias, 3 despesas mensais e 2 gastos isolados de cada vez: ver GastosAnormais
    private const int MaximoCategorias = 3;
    private const int MaximoDespesasFixas = 3;
    private const int MaximoGastosIsolados = 2;

    private async Task<IReadOnlyList<AlertaCalculado>> GastosForaDoNormalAsync(string uid, DateOnly hoje, string mes, CancellationToken ct)
    {
        var alertas = new List<AlertaCalculado>();
        var desde = Meses.PrimeiroDia(Meses.Somar(mes, -GastosAnormais.MesesDeHistorico));
        var gastos = await extras.ListarEntreAsync(uid, desde, hoje, ct);

        foreach (var c in GastosAnormais.CategoriasAcimaDaMedia(gastos, mes).Take(MaximoCategorias))
        {
            var nome = Categorias.Nome(c.Categoria);
            alertas.Add(new AlertaCalculado(
                new AlertaDto(
                    TipoAlerta.CategoriaAcimaDaMedia,
                    SeveridadeAlerta.Aviso,
                    Textos.T($"{nome} acima do habitual: +{RegrasAlertas.Percentagem(c.Subida)}%"),
                    Textos.T($"Este mês já gastaste {RegrasAlertas.Euros(c.GastoAtual)} em {nome}. Nos últimos meses a média foi {RegrasAlertas.Euros(c.Media)}."),
                    c.Categoria,
                    hoje),
                $"categoria-acima-da-media:{c.Categoria}:{mes}"));
        }

        var pagamentosRecentes = (await pagamentos.ListarAsync(uid, ct))
            .Where(p => Meses.AntesOuIgual(Meses.Somar(mes, -GastosAnormais.MesesDeHistorico), p.Mes) && Meses.AntesOuIgual(p.Mes, mes));
        foreach (var d in GastosAnormais.DespesasFixas(pagamentosRecentes, mes).Take(MaximoDespesasFixas))
        {
            alertas.Add(new AlertaCalculado(
                new AlertaDto(
                    TipoAlerta.DespesaFixaSubiu,
                    SeveridadeAlerta.Aviso,
                    Textos.T($"{d.Titulo} subiu {RegrasAlertas.Percentagem(d.Subida)}%"),
                    Textos.T($"Este mês pagaste {RegrasAlertas.Euros(d.Valor)} em {d.Titulo}. A média dos últimos meses foi {RegrasAlertas.Euros(d.Media)}."),
                    d.FixaId,
                    d.Data),
                $"despesa-fixa-subiu:{d.FixaId}:{mes}"));
        }

        foreach (var g in GastosAnormais.Isolados(gastos, hoje).Take(MaximoGastosIsolados))
        {
            var nome = Categorias.Nome(g.Categoria);
            alertas.Add(new AlertaCalculado(
                new AlertaDto(
                    TipoAlerta.GastoIncomum,
                    SeveridadeAlerta.Aviso,
                    Textos.T($"Gasto fora do normal: {g.Titulo}"),
                    Textos.T($"Gastaste {RegrasAlertas.Euros(g.Valor)} em {g.Titulo} ({nome}). O habitual nesta categoria são cerca de {RegrasAlertas.Euros(g.Mediana)}."),
                    g.Id,
                    g.Data),
                $"gasto-incomum:{g.Id}"));
        }

        return alertas;
    }

    // O que ainda falta pagar da despesa neste mês (um pagamento parcial já pagou uma parte)
    private static decimal FaltaPagar(DespesaFixa fixa, IReadOnlyCollection<PagamentoFixa> pagamentosDoMes, string mes)
    {
        var pagamento = Calculos.PagamentoNoMes(fixa, pagamentosDoMes, mes);
        return pagamento is { Estado: EstadoPagamento.Pago, Parcial: true }
            ? Math.Max(0m, Calculos.Centimos(fixa.Valor - pagamento.Valor))
            : fixa.Valor;
    }
}
