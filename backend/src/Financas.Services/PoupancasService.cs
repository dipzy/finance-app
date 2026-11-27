using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

// Contas poupança (Revolut/C.A, PPR, Trade Republic...): contribuição mensal + saldo.
// O saldo de cada poupança tem versão (como o da conta): movimentos ao mesmo tempo não se perdem.
internal sealed class PoupancasService(
    IUtilizadoresRepository utilizadores,
    IPoupancasRepository poupancas,
    IContribuicoesPoupancaRepository contribuicoes,
    IJurosPoupancaRepository juros,
    IObjetivosRepository objetivos,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IPoupancasService
{
    private static readonly string[] CamposQueSePodemLimpar = ["diaContribuicao", "taxaAnual"];

    // Com a contribuição do mês em euros (valorMensal: as percentagens são do salário de agora)
    public async Task<IReadOnlyList<PoupancaDto>> ListarAsync(string uid, CancellationToken ct = default)
    {
        var utilizador = await utilizadores.ObterAsync(uid, ct);
        var salario = Calculos.ValorSalarioBase(utilizador?.Salario, utilizador?.Financeiro);
        var jurosRecebidos = await juros.TotaisPorPoupancaAsync(uid, ct);
        return [.. Ordenacao.Poupancas(await poupancas.ListarAsync(uid, ct))
            .Select(p => p.ParaDto(Calculos.ContribuicaoDe(p.Tipo, p.Valor, salario), jurosRecebidos.GetValueOrDefault(p.Id)))];
    }

    public Task<string> AdicionarAsync(string uid, NovaPoupancaPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var poupanca = new Poupanca
                {
                    UtilizadorId = uid,
                    Id = Ids.Novo(),
                    Nome = pedido.Nome.Trim(),
                    Tipo = pedido.Tipo,
                    Valor = pedido.Valor.Trim(),
                    ContribuicaoAutomatica = pedido.ContribuicaoAutomatica,
                    ContarNoPrevisto = pedido.ContarNoPrevisto,
                    DiaContribuicao = pedido.DiaContribuicao,
                    Inicio = relogio.MesAtual, // antes de existir não há meses por enviar
                    Saldo = Calculos.Centimos(pedido.Saldo),
                    TaxaAnual = pedido.TaxaAnual is > 0m ? pedido.TaxaAnual : null,
                    Retencao = pedido.Retencao ?? 28m,
                    // Sem ordem: fica no fim (como o Date.now() da versão anterior)
                    Ordem = pedido.Ordem ?? agora.ToUnixTimeMilliseconds(),
                };
                if (pedido.JurosAutomaticos)
                {
                    if (poupanca.TaxaAnual is not > 0m) throw new PedidoInvalidoException("Para somar os juros ao saldo indica a taxa anual.");
                    AtivarJuros(poupanca);
                }

                poupancas.Adicionar(poupanca);
                return poupanca.Id;
            },
            ct);

    public Task AlterarAsync(string uid, string id, AlterarPoupancaPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var limpar = DespesasFixasService.ValidarLimpar(pedido.Limpar, CamposQueSePodemLimpar);
                var poupanca = await ObterAsync(uid, id, c);
                if (pedido.Nome is { } nome) poupanca.Nome = nome.Trim();
                if (pedido.Tipo is { } tipo) poupanca.Tipo = tipo;
                if (pedido.Valor is { } valor) poupanca.Valor = valor.Trim();
                if (pedido.Ordem is { } ordem) poupanca.Ordem = ordem;
                if (pedido.ContribuicaoAutomatica is { } automatica)
                {
                    // Passar a manual: conta a partir deste mês (o que saiu sozinho antes não fica "por enviar")
                    if (poupanca.ContribuicaoAutomatica && !automatica) poupanca.Inicio = relogio.MesAtual;
                    poupanca.ContribuicaoAutomatica = automatica;
                }

                if (pedido.ContarNoPrevisto is { } contar) poupanca.ContarNoPrevisto = contar;
                if (pedido.DiaContribuicao is { } dia) poupanca.DiaContribuicao = dia;
                if (limpar.Contains("diaContribuicao")) poupanca.DiaContribuicao = null;

                if (pedido.TaxaAnual is { } taxa) poupanca.TaxaAnual = taxa > 0m ? taxa : null;
                if (limpar.Contains("taxaAnual"))
                {
                    poupanca.TaxaAnual = null;
                    poupanca.JurosAutomaticos = false;
                }

                if (pedido.Retencao is { } retencao) poupanca.Retencao = retencao;
                if (pedido.JurosAutomaticos is { } automaticos)
                {
                    if (automaticos && !poupanca.JurosAutomaticos) AtivarJuros(poupanca);
                    else if (!automaticos) poupanca.JurosAutomaticos = false;
                }

                if (poupanca.JurosAutomaticos && poupanca.TaxaAnual is not > 0m)
                {
                    throw new PedidoInvalidoException("Para somar os juros ao saldo indica a taxa anual.");
                }
            },
            ct);

    // Os juros só contam daqui para a frente: o que o saldo já rendeu antes não se calcula
    private void AtivarJuros(Poupanca poupanca)
    {
        poupanca.JurosAutomaticos = true;
        poupanca.JurosDesde = relogio.Hoje;
        poupanca.JurosCreditadosAte = null;
    }

    // O saldo dela deixa de aparecer na app (o dinheiro não volta à conta). Os objetivos que seguiam
    // esta poupança ficam com o saldo que ela tinha, como valor escrito à mão (o progresso não se perde)
    public Task RemoverAsync(string uid, string id, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                if (await poupancas.ObterAsync(uid, id, c) is { } poupanca)
                {
                    foreach (var objetivo in await objetivos.ListarDaPoupancaAsync(uid, id, c))
                    {
                        objetivo.PoupancaId = null;
                        objetivo.ValorAtual = Calculos.Centimos(poupanca.Saldo);
                    }

                    poupancas.Remover(poupanca);
                }
            },
            ct);

    public Task AjustarSaldoAsync(string uid, string id, decimal valor, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var poupanca = await ObterAsync(uid, id, c);
                poupanca.Saldo = Calculos.Centimos(poupanca.Saldo + valor);
            },
            ct);

    public Task DefinirSaldoAsync(string uid, string id, decimal saldo, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var poupanca = await ObterAsync(uid, id, c);
                poupanca.Saldo = Calculos.Centimos(saldo);
            },
            ct);

    // Os dois saldos mudam na mesma transação
    public Task TransferirDaContaAsync(string uid, string id, decimal valor, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var poupanca = await ObterAsync(uid, id, c);
                var agora = relogio.Agora;
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var movimento = Calculos.Centimos(valor);
                poupanca.Saldo = Calculos.Centimos(poupanca.Saldo + movimento);
                utilizador.MovimentarSaldo(-movimento, agora);
            },
            ct);

    public async Task<IReadOnlyList<ContribuicaoEmAtrasoDto>> ContribuicoesEmAtrasoAsync(string uid, CancellationToken ct = default)
    {
        var mesAtual = relogio.MesAtual;
        var manuais = (await poupancas.ListarAsync(uid, ct)).Where(p => !p.ContribuicaoAutomatica && p.Inicio is not null).ToList();
        if (manuais.Count == 0)
        {
            return [];
        }

        var janela = RegrasPoupancas.MesesAVerificar(mesAtual);
        var enviadas = (await contribuicoes.ListarDesdeAsync(uid, janela[0], ct))
            .ToLookup(c => c.PoupancaId, c => c.Mes);
        var utilizador = await utilizadores.ObterAsync(uid, ct);
        var salario = Calculos.ValorSalarioBase(utilizador?.Salario, utilizador?.Financeiro);

        // Do mês mais antigo para o mais recente e, em cada mês, pela ordem das poupanças
        return [.. Ordenacao.Poupancas(manuais)
            .SelectMany(p => RegrasPoupancas
                .MesesPorEnviar(p, enviadas[p.Id].ToHashSet(StringComparer.Ordinal), mesAtual)
                .Select(mes => new ContribuicaoEmAtrasoDto(p.Id, p.Nome, mes, Calculos.Centimos(Calculos.ContribuicaoDe(p.Tipo, p.Valor, salario)))))
            .OrderBy(c => c.Mes, StringComparer.Ordinal)];
    }

    public Task<ResultadoContribuicaoPoupanca> ContribuirManualmenteAsync(string uid, string id, string? mes = null, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var poupanca = await ObterAsync(uid, id, c);
                if (poupanca.ContribuicaoAutomatica)
                {
                    throw new PedidoInvalidoException("Esta poupança está configurada para contribuição automática.");
                }

                var mesAtual = relogio.MesAtual;
                mes ??= mesAtual;
                // Do mês atual, ou de um dos últimos meses que ficou por enviar (nunca do futuro nem de há muito tempo)
                if (mes != mesAtual && !RegrasPoupancas.PodeRegularizar(poupanca, mes, mesAtual))
                {
                    throw new PedidoInvalidoException("Só se pode enviar a contribuição deste mês ou de um dos últimos 3 meses por enviar.");
                }

                if (poupanca.UltimaContribuicaoMes == mes || await contribuicoes.ExisteAsync(uid, id, mes, c))
                {
                    return ResultadoContribuicaoPoupanca.JaAdicionada;
                }

                var agora = relogio.Agora;
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var salario = Calculos.ValorSalarioBase(utilizador.Salario, utilizador.Financeiro);
                var valor = Calculos.ContribuicaoDe(poupanca.Tipo, poupanca.Valor, salario);
                if (valor <= 0m)
                {
                    throw new PedidoInvalidoException("A contribuição mensal tem de ser maior que zero.");
                }

                if (Calculos.Centimos(utilizador.Saldo) < valor)
                {
                    return ResultadoContribuicaoPoupanca.SaldoInsuficiente;
                }

                poupanca.Saldo = Calculos.Centimos(poupanca.Saldo + valor);
                // "Última contribuição" é a deste mês: regularizar um mês passado só fica no registo desse mês
                if (mes == mesAtual)
                {
                    poupanca.UltimaContribuicaoMes = mes;
                    poupanca.UltimaContribuicaoEm = relogio.Hoje;
                }

                contribuicoes.Adicionar(new ContribuicaoPoupanca
                {
                    UtilizadorId = uid,
                    PoupancaId = id,
                    Mes = mes,
                    Valor = valor,
                    Data = relogio.Hoje,
                });
                utilizador.MovimentarSaldo(-valor, agora);
                return ResultadoContribuicaoPoupanca.Adicionada;
            },
            ct);

    public async Task<decimal> ProcessarContribuicoesAutomaticasAsync(string uid, CancellationToken ct = default)
    {
        var hoje = relogio.Hoje;
        var mes = Meses.De(hoje);
        var candidatas = await poupancas.ListarAsync(uid, ct);
        var total = 0m;

        foreach (var poupanca in candidatas.Where(p =>
                     p.ContribuicaoAutomatica
                     && p.DiaContribuicao is { } dia
                     && Calculos.DiaEfetivo(dia, hoje) <= hoje.Day
                     && p.UltimaContribuicaoMes != mes))
        {
            total += await unitOfWork.ExecuteInTransactionAsync(
                async c =>
                {
                    var atual = await poupancas.ObterAsync(uid, poupanca.Id, c);
                    if (atual is null
                        || !atual.ContribuicaoAutomatica
                        || atual.DiaContribuicao is not { } dia
                        || Calculos.DiaEfetivo(dia, hoje) > hoje.Day
                        || atual.UltimaContribuicaoMes == mes)
                    {
                        return 0m;
                    }

                    var utilizador = await utilizadores.ObterAsync(uid, c);
                    if (utilizador is null) return 0m;

                    var salario = Calculos.ValorSalarioBase(utilizador.Salario, utilizador.Financeiro);
                    var valor = Calculos.ContribuicaoDe(atual.Tipo, atual.Valor, salario);
                    if (valor <= 0m || Calculos.Centimos(utilizador.Saldo) < valor) return 0m;

                    atual.Saldo = Calculos.Centimos(atual.Saldo + valor);
                    atual.UltimaContribuicaoMes = mes;
                    atual.UltimaContribuicaoEm = relogio.Hoje;
                    utilizador.MovimentarSaldo(-valor, relogio.Agora);
                    return valor;
                },
                ct);
        }

        return Calculos.Centimos(total);
    }

    // Os juros de cada mês já fechado somam-se ao saldo (cada mês uma vez; se a app esteve muitos meses sem abrir,
    // os meses em falta somam-se por ordem, com juros sobre juros). O saldo é o de agora: as contribuições do mês
    // que acabou de começar ainda não entraram, porque este passo corre antes delas
    public async Task<decimal> ProcessarJurosAsync(string uid, CancellationToken ct = default)
    {
        var mesAtual = relogio.MesAtual;
        var total = 0m;
        foreach (var candidata in (await poupancas.ListarAsync(uid, ct)).Where(p => RegrasPoupancas.MesesDeJurosPorCreditar(p, mesAtual).Count > 0))
        {
            total += await unitOfWork.ExecuteInTransactionAsync(
                async c =>
                {
                    var poupanca = await poupancas.ObterAsync(uid, candidata.Id, c);
                    if (poupanca is null || poupanca.TaxaAnual is not { } taxa) return 0m;

                    var somado = 0m;
                    foreach (var mes in RegrasPoupancas.MesesDeJurosPorCreditar(poupanca, mesAtual))
                    {
                        var primeiro = poupanca.JurosCreditadosAte is null && poupanca.JurosDesde is { } desde && Meses.De(desde) == mes;
                        var fracao = primeiro ? RegrasPoupancas.FracaoDoPrimeiroMes(poupanca.JurosDesde!.Value) : 1m;
                        var (bruto, liquido) = RegrasPoupancas.JurosDoMes(poupanca.Saldo, taxa, poupanca.Retencao, fracao);
                        poupanca.JurosCreditadosAte = mes;
                        if (liquido <= 0m) continue;

                        poupanca.Saldo = Calculos.Centimos(poupanca.Saldo + liquido);
                        somado += liquido;
                        juros.Adicionar(new JurosPoupanca
                        {
                            UtilizadorId = uid,
                            PoupancaId = poupanca.Id,
                            Mes = mes,
                            Bruto = bruto,
                            Liquido = liquido,
                            Data = relogio.Hoje,
                        });
                    }

                    return somado;
                },
                ct);
        }

        return Calculos.Centimos(total);
    }

    public async Task<ProjecaoPoupancaDto> ProjetarAsync(string uid, string id, int meses, decimal? taxa = null, bool comContribuicoes = true, CancellationToken ct = default)
    {
        if (meses is < 1 or > RegrasPoupancas.MaximoMesesProjecao)
        {
            throw new PedidoInvalidoException($"Escolhe entre 1 e {RegrasPoupancas.MaximoMesesProjecao} meses.");
        }

        var poupanca = await ObterAsync(uid, id, ct);
        var taxaUsada = taxa ?? poupanca.TaxaAnual ?? throw new PedidoInvalidoException("Indica a taxa anual para ver o que a poupança vai render.");
        if (taxaUsada is < 0m or > 100m)
        {
            throw new PedidoInvalidoException("A taxa tem de ser entre 0 e 100.");
        }

        var utilizador = await utilizadores.ObterAsync(uid, ct);
        var mensal = comContribuicoes
            ? Calculos.ContribuicaoDe(poupanca.Tipo, poupanca.Valor, Calculos.ValorSalarioBase(utilizador?.Salario, utilizador?.Financeiro))
            : 0m;
        var r = RegrasPoupancas.Projetar(poupanca.Saldo, mensal, taxaUsada, poupanca.Retencao, meses);
        return new ProjecaoPoupancaDto(
            meses,
            taxaUsada,
            poupanca.Retencao,
            Calculos.Centimos(poupanca.Saldo),
            Calculos.Centimos(mensal),
            r.SaldoFinal,
            r.Contribuicoes,
            r.JurosBrutos,
            r.JurosLiquidos,
            r.Pontos);
    }

    private async Task<Poupanca> ObterAsync(string uid, string id, CancellationToken ct) =>
        await poupancas.ObterAsync(uid, id, ct) ?? throw new NaoEncontradoException("Poupança não encontrada.");
}
