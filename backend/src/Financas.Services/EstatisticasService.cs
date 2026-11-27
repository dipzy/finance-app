using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

// Números agregados para os gráficos da app (e para relatórios). Só leituras (a previsão, como o
// GET /api/conta/saldos, primeiro processa o salário e os débitos de hoje).
internal sealed class EstatisticasService(
    IDespesasExtrasRepository extras,
    IDespesasFixasRepository fixas,
    IPagamentosRepository pagamentos,
    IGastosRecorrentesRepository recorrentes,
    IFolhaMesService folha,
    IContaService conta,
    IUtilizadoresRepository utilizadores,
    Relogio relogio) : IEstatisticasService
{
    /// <summary>Quantos meses a evolução pode mostrar de uma vez.</summary>
    public const int MaximoMeses = 36;

    public async Task<GastosPorCategoriaDto> GastosPorCategoriaAsync(string uid, string? mes, CancellationToken ct = default)
    {
        mes ??= relogio.MesAtual;
        var gastos = Calculos.GastosPorCategoria(
            await extras.ListarDoMesAsync(uid, mes, ct),
            await pagamentos.ListarDoMesAsync(uid, mes, ct),
            await fixas.ListarAsync(uid, ct));
        var total = Calculos.Centimos(gastos.Sum(g => g.Total));
        return new GastosPorCategoriaDto(
            mes,
            total,
            [
                .. gastos.Select(g => new GastoCategoriaDto(
                    g.Categoria,
                    g.Total,
                    g.Quantidade,
                    total > 0 ? Math.Round(g.Total / total * 100m, 1, MidpointRounding.AwayFromZero) : 0m)),
            ]);
    }

    // Cada mês é a folha desse mês (FolhaMesService), com os totais de Calculos.TotaisFolha: os números
    // são os mesmos que o Resumo do mês mostra para esse mês (Entrou, Gasto e Poupado do Início)
    public async Task<IReadOnlyList<EvolucaoMesDto>> EvolucaoAsync(string uid, int meses = 12, string? ate = null, CancellationToken ct = default)
    {
        if (meses is < 1 or > MaximoMeses)
        {
            throw new PedidoInvalidoException($"Escolhe entre 1 e {MaximoMeses} meses.");
        }

        // Só até ao mês atual: os meses do futuro ainda não têm números
        var atual = relogio.MesAtual;
        var ultimo = ate is not null && Meses.Antes(ate, atual) ? ate : atual;
        var folhas = await folha.ObterVariosAsync(uid, Meses.Ultimos(ultimo, meses), ct);
        return
        [
            .. folhas.Select(f =>
            {
                var t = Calculos.TotaisFolha(f);
                var cartao = Calculos.CartaoDaFolha(f);
                return new EvolucaoMesDto(
                    f.Mes,
                    t.Lucro,
                    Calculos.Centimos(t.Despesas + t.DespesasMes),
                    t.Poupanca,
                    f.SaldoConta,
                    t.Despesas,
                    t.DespesasMes,
                    Math.Max(0, t.Total),
                    cartao.Carregado,
                    cartao.Gasto);
            }),
        ];
    }

    // Os totais (entrou, fixas, poupado) são os da folha de cada mês, como na evolução; os gastos do dia a
    // dia vêm das despesas extras (as mesmas linhas das Despesas do Mês da folha), para poderem ser
    // cortadas ao mesmo dia no mês atual e somadas por categoria
    public async Task<ComparacaoMesDto> ComparacaoAsync(string uid, string? mes, CancellationToken ct = default)
    {
        var atual = relogio.MesAtual;
        mes ??= atual;
        if (Meses.Antes(atual, mes))
        {
            throw new PedidoInvalidoException("Esse mês ainda não começou.");
        }

        var anterior = Meses.Anterior(mes);
        int? ateDia = mes == atual ? relogio.Hoje.Day : null;

        var folhas = await folha.ObterVariosAsync(uid, [anterior, mes], ct);
        var totaisAntes = Calculos.TotaisFolha(folhas[0]);
        var totaisAgora = Calculos.TotaisFolha(folhas[1]);

        IEnumerable<DAL.Entidades.DespesaExtra> extrasAntes = await extras.ListarDoMesAsync(uid, anterior, ct);
        if (ateDia is { } dia)
        {
            extrasAntes = Calculos.AteAoDia(extrasAntes, dia);
        }

        var categoriasAntes = Calculos.GastosPorCategoria(extrasAntes);
        var categoriasAgora = Calculos.GastosPorCategoria(await extras.ListarDoMesAsync(uid, mes, ct));

        return new ComparacaoMesDto(
            mes,
            anterior,
            ateDia,
            ParaDto(Calculos.Comparar(categoriasAgora.Sum(c => c.Total), categoriasAntes.Sum(c => c.Total))),
            ParaDto(Calculos.Comparar(totaisAgora.Despesas, totaisAntes.Despesas)),
            ParaDto(Calculos.Comparar(totaisAgora.Poupanca, totaisAntes.Poupanca)),
            ParaDto(Calculos.Comparar(totaisAgora.Lucro, totaisAntes.Lucro)),
            [
                .. Calculos.CompararCategorias(categoriasAgora, categoriasAntes)
                    .Select(c => new ComparacaoCategoriaDto(c.Categoria, c.Atual, c.Anterior, c.Diferenca, c.Variacao)),
            ]);
    }

    public async Task<PrevisaoFimMesDto> PrevisaoAsync(string uid, CancellationToken ct = default)
    {
        // Primeiro os saldos: recebe o salário, faz os débitos e gera os gastos recorrentes de hoje
        var saldos = await conta.CalcularSaldosAsync(uid, null, ct);
        var hoje = relogio.Hoje;
        // Todas as despesas extras (cada utilizador tem poucas): a mais antiga diz desde quando há histórico
        var estimativa = Calculos.EstimarGastosAteFimDoMes(
            await extras.ListarAsync(uid, ct),
            await recorrentes.ListarAsync(uid, ct),
            hoje);

        var cartao = await PrevisaoCartaoAsync(uid, await extras.ListarAsync(uid, ct), await recorrentes.ListarAsync(uid, ct), hoje, ct);
        return new PrevisaoFimMesDto(
            Meses.De(hoje),
            saldos.Disponivel,
            saldos.PorPagar,
            estimativa.Estimativa,
            estimativa.Recorrentes,
            Calculos.Centimos(saldos.Previsto - estimativa.Estimativa),
            estimativa.MediaDiaria,
            estimativa.DiasRestantes,
            estimativa.MesesBase switch
            {
                0 => "este mês",
                1 => "1 mês",
                var n => $"{n} meses",
            },
            estimativa.MesesBase,
            saldos.PoupancasPorEnviar,
            [.. (estimativa.PorCategoria ?? []).Select(c => new PrevisaoCategoriaDto(c.Categoria, c.Estimativa))],
            [.. (estimativa.PorCategoriaDoMes ?? []).Select(c => new PrevisaoCategoriaDto(c.Categoria, c.Estimativa))],
            cartao);
    }

    public async Task<GastosCategoriasDto> GastosCategoriasAsync(string uid, int meses = Calculos.MesesMediaGastos, CancellationToken ct = default)
    {
        var hoje = relogio.Hoje;
        var mesAtual = Meses.De(hoje);
        var comData = (await extras.ListarAsync(uid, ct)).Where(e => e.Data is not null).ToList();
        var pagos = await pagamentos.ListarAsync(uid, ct);
        var primeiroMes = comData.Count > 0 ? Meses.De(comData.Min(e => e.Data!.Value)) : mesAtual;
        // O histórico também começa no primeiro pagamento de uma despesa mensal
        if (pagos.Count > 0 && string.CompareOrdinal(pagos.Min(p => p.Mes), primeiroMes) < 0)
        {
            primeiroMes = pagos.Min(p => p.Mes);
        }

        var mesesBase = Calculos.MesesDaMedia(hoje, primeiroMes, Math.Clamp(meses, 1, MaximoMeses));

        // O que se pagou das despesas mensais, com a categoria de cada uma (as sem categoria, ou já apagadas, são "outros")
        var categoriaDaFixa = (await fixas.ListarAsync(uid, ct)).ToDictionary(f => f.Id, f => Categorias.DaDespesa(f.Categoria), StringComparer.Ordinal);
        List<(string Categoria, decimal Valor)> FixasPagas(Func<string, bool> mes) =>
        [
            .. pagos.Where(p => mes(p.Mes)).Select(p => (categoriaDaFixa.GetValueOrDefault(p.FixaId, Categorias.Outros), p.Valor)),
        ];

        // As despesas mensais saem da conta: só entram na parte da conta
        GastosDoMeioDto DoMeio(bool cartao)
        {
            var doMeio = comData.Where(e => e.PagaComCartao == cartao).ToList();
            var fixasDoMes = cartao ? [] : FixasPagas(m => m == mesAtual);
            var fixasDaMedia = cartao ? [] : FixasPagas(mesesBase.Contains);
            return new GastosDoMeioDto(
                Dto(Calculos.TotaisPorCategoria(doMeio.Where(e => e.Mes == mesAtual), 1, fixasDoMes)),
                Dto(Calculos.TotaisPorCategoria(doMeio.Where(e => mesesBase.Contains(e.Mes)), mesesBase.Count, fixasDaMedia)));
        }

        var cartaoMensal = Calculos.CartaoDoMes((await utilizadores.ObterAsync(uid, ct))?.Salario, hoje);
        return new GastosCategoriasDto(
            mesAtual,
            mesesBase.Count,
            DoMeio(cartao: false),
            cartaoMensal > 0m ? DoMeio(cartao: true) : null,
            Calculos.Centimos(cartaoMensal));
    }

    private static IReadOnlyList<ValorCategoriaDto> Dto(IReadOnlyList<ValorCategoria> valores) =>
        [.. valores.Select(v => new ValorCategoriaDto(v.Categoria, v.Valor, v.Fixas))];

    // O cartão de alimentação à parte da conta. Sem cartão configurado no Salário (valor mensal ou por dia útil), null:
    // a app esconde tudo o que é do cartão a quem não o usa (mesmo que tenha ficado algum saldo)
    private async Task<PrevisaoCartaoDto?> PrevisaoCartaoAsync(
        string uid,
        IReadOnlyList<DAL.Entidades.DespesaExtra> despesas,
        IReadOnlyList<DAL.Entidades.GastoRecorrente> gastosRecorrentes,
        DateOnly hoje,
        CancellationToken ct)
    {
        var utilizador = await utilizadores.ObterAsync(uid, ct);
        if (Calculos.CartaoDoMes(utilizador?.Salario, hoje) == 0m)
        {
            return null;
        }

        var saldo = Calculos.Centimos(utilizador?.SaldoCartaoAlimentacao ?? 0m);
        var carga = Calculos.CartaoPorReceber(utilizador?.Salario, hoje, relogio.Fuso);
        var estimativa = Calculos.EstimarGastosCartaoAteFimDoMes(despesas, gastosRecorrentes, hoje);
        var previsaoFinal = Calculos.Centimos(saldo + carga - estimativa.Estimativa);
        return new PrevisaoCartaoDto(
            saldo,
            carga,
            estimativa.MediaDiaria,
            estimativa.Recorrentes,
            estimativa.Estimativa,
            previsaoFinal,
            Math.Max(0m, -previsaoFinal));
    }

    private static ComparacaoValorDto ParaDto(Comparacao c) => new(c.Atual, c.Anterior, c.Diferenca, c.Variacao);
}
