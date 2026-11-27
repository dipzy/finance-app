namespace Financas.Services.Regras;

/// <summary>Quanto falta, em quantos meses e com quantos juros se acaba de pagar um crédito (ver <see cref="Amortizacao.Projetar"/>).</summary>
/// <param name="Meses">Quantas prestações faltam (a última pode ser menor que as outras).</param>
/// <param name="Juros">Os juros que ainda vai pagar.</param>
/// <param name="Selo">O imposto do selo sobre esses juros.</param>
/// <param name="Total">Capital + juros que ainda vai pagar (sem selo nem seguros).</param>
/// <param name="Viavel">Falso quando a prestação não cobre os juros do mês: a dívida nunca desce.</param>
public sealed record ProjecaoCredito(int Meses, decimal Juros, decimal Selo, decimal Total, bool Viavel);

/// <summary>Um cenário do simulador de uma dívida: o que acontece depois de uma amortização (ou de pagar mais por mês).</summary>
/// <param name="Prestacao">A prestação mensal (capital + juros) neste cenário; sem seguros nem selo.</param>
/// <param name="PrestacaoTotal">O que o credor debita no primeiro mês: prestação + selo + seguros.</param>
/// <param name="Meses">Quantas prestações faltam depois (0 = a dívida fica paga).</param>
/// <param name="Fim">O mês da última prestação (null se já não há prestações ou se a dívida nunca acaba).</param>
/// <param name="Juros">Os juros que ainda falta pagar neste cenário.</param>
/// <param name="Comissao">A comissão de reembolso antecipado da amortização.</param>
/// <param name="AmortizadoAgora">O capital pago já (a amortização).</param>
/// <param name="TotalAPagar">Tudo o que sai do bolso: amortização + comissão + prestações até ao fim (com selo e seguros).</param>
/// <param name="PoupancaJuros">Os juros que se deixam de pagar, em relação a não fazer nada.</param>
/// <param name="PoupancaLiquida">O que realmente se ganha: o total a pagar sem fazer nada menos o total deste cenário (juros, selo e seguros poupados, menos a comissão).</param>
/// <param name="MesesPoupados">Quantas prestações a menos, em relação a não fazer nada.</param>
/// <param name="Viavel">Falso quando a prestação não cobre os juros.</param>
public sealed record CenarioDivida(
    decimal Prestacao,
    decimal PrestacaoTotal,
    int Meses,
    string? Fim,
    decimal Juros,
    decimal Comissao,
    decimal AmortizadoAgora,
    decimal TotalAPagar,
    decimal PoupancaJuros,
    decimal PoupancaLiquida,
    int MesesPoupados,
    bool Viavel);

/// <summary>
/// Crédito com prestação constante (sistema francês): cada mês os juros são o capital em dívida vezes a taxa
/// mensal (TAN / 12) e o resto da prestação amortiza o capital. Tudo em euros com cêntimos, arredondado
/// mês a mês como os bancos fazem; a última prestação é a que fecha a conta.
/// <para>
/// O que o credor debita por mês é a prestação (capital + juros) mais o imposto do selo sobre os juros
/// (<see cref="ImpostoSeloJuros"/>) e os seguros: estes dois não amortizam nada.
/// </para>
/// </summary>
public static class Amortizacao
{
    /// <summary>Limite de meses das projeções (100 anos): corta o que nunca acabaria.</summary>
    public const int LimiteMeses = 1200;

    /// <summary>O imposto do selo sobre os juros do crédito, em % (4%).</summary>
    public const decimal ImpostoSeloJuros = 4m;

    /// <summary>A taxa de um mês a partir da TAN em % ("6,5" → 0,005416...).</summary>
    public static decimal TaxaMensal(decimal taxaAnualPercentagem) => taxaAnualPercentagem / 100m / 12m;

    public static decimal Juros(decimal capital, decimal taxaAnualPercentagem) =>
        Calculos.Centimos(capital * TaxaMensal(taxaAnualPercentagem));

    public static decimal Selo(decimal juros) => Calculos.Centimos(juros * ImpostoSeloJuros / 100m);

    /// <summary>A prestação constante que paga <paramref name="capital"/> em <paramref name="meses"/> prestações.</summary>
    public static decimal Prestacao(decimal capital, decimal taxaAnualPercentagem, int meses)
    {
        if (capital <= 0 || meses <= 0)
        {
            return 0m;
        }

        var r = (double)TaxaMensal(taxaAnualPercentagem);
        if (r == 0)
        {
            return Calculos.Centimos(capital / meses);
        }

        // P = C * r / (1 - (1 + r)^-n)  (em double: a potência de 1200 meses não cabe num decimal)
        var prestacao = (double)capital * r / (1 - Math.Pow(1 + r, -meses));
        return Calculos.Centimos((decimal)prestacao);
    }

    /// <summary>
    /// Da prestação que o credor debita (<paramref name="prestacaoTotal"/>) tira os seguros e o selo do mês:
    /// o que sobra é a prestação de capital + juros, a única que conta para a amortização.
    /// </summary>
    public static decimal PrestacaoSemEncargos(decimal prestacaoTotal, decimal encargosMensais, decimal capital, decimal taxaAnualPercentagem) =>
        Math.Max(0m, Calculos.Centimos(prestacaoTotal - encargosMensais - Selo(Juros(capital, taxaAnualPercentagem))));

    /// <summary>
    /// Pagar <paramref name="prestacao"/> (mais <paramref name="extraMensal"/>) todos os meses até acabar:
    /// quantas prestações, que juros e que total. Se a prestação não chega para os juros do primeiro mês,
    /// a dívida não desce nunca e <see cref="ProjecaoCredito.Viavel"/> é falso.
    /// </summary>
    public static ProjecaoCredito Projetar(decimal capital, decimal taxaAnualPercentagem, decimal prestacao, decimal extraMensal = 0m)
    {
        if (capital <= 0)
        {
            return new ProjecaoCredito(0, 0m, 0m, 0m, true);
        }

        var pagamento = prestacao + extraMensal;
        if (pagamento <= 0 || pagamento <= Juros(capital, taxaAnualPercentagem))
        {
            return new ProjecaoCredito(0, 0m, 0m, 0m, false);
        }

        var saldo = capital;
        var juros = 0m;
        var total = 0m;
        var meses = 0;
        while (saldo > 0 && meses < LimiteMeses)
        {
            var jurosDoMes = Juros(saldo, taxaAnualPercentagem);
            var pago = Math.Min(pagamento, saldo + jurosDoMes);
            saldo = Calculos.Centimos(saldo + jurosDoMes - pago);
            juros += jurosDoMes;
            total += pago;
            meses++;
        }

        return new ProjecaoCredito(meses, Calculos.Centimos(juros), Selo(juros), Calculos.Centimos(total), saldo <= 0);
    }

    /// <summary>
    /// O capital que falta pagar: parte do capital que faltava em <paramref name="desde"/> e, mês a mês até
    /// <paramref name="mesAtual"/>, soma os juros e desconta o que foi pago (<paramref name="pagoPorMes"/>, o
    /// que o credor debitou, menos os seguros e o selo). O mês atual só conta se já tem pagamento: antes
    /// disso ainda não venceram os juros desse mês. Um mês passado sem pagamento continua a render juros.
    /// </summary>
    public static decimal CapitalEmFalta(
        decimal capitalEmDesde,
        string desde,
        decimal taxaAnualPercentagem,
        decimal encargosMensais,
        IReadOnlyDictionary<string, decimal> pagoPorMes,
        string mesAtual)
    {
        var saldo = capitalEmDesde;
        var mes = desde;
        for (var i = 0; i < LimiteMeses && Meses.AntesOuIgual(mes, mesAtual) && saldo > 0; i++)
        {
            var pago = pagoPorMes.GetValueOrDefault(mes);
            if (pago <= 0 && mes == mesAtual)
            {
                break;
            }

            var juros = Juros(saldo, taxaAnualPercentagem);
            var amortizacao = pago > 0 ? Math.Max(0m, pago - encargosMensais - Selo(juros)) : 0m;
            saldo = Math.Max(0m, Calculos.Centimos(saldo + juros - amortizacao));
            mes = Meses.Seguinte(mes);
        }

        return saldo;
    }

    /// <summary>
    /// Compara o que acontece se amortizar <paramref name="amortizacao"/> agora, em duas versões: manter a
    /// prestação (a dívida acaba mais cedo) ou reduzir a prestação (a dívida acaba no mesmo mês).
    /// <paramref name="prestacao"/> é a de capital + juros (sem seguros nem selo).
    /// </summary>
    public static (CenarioDivida ManterPrestacao, CenarioDivida? ReduzirPrestacao) SimularAmortizacao(
        decimal capital,
        decimal taxaAnualPercentagem,
        decimal prestacao,
        decimal encargosMensais,
        decimal amortizacao,
        decimal comissaoPercentagem,
        string primeiroMes)
    {
        var atual = Projetar(capital, taxaAnualPercentagem, prestacao);
        var amortizar = Math.Min(Math.Max(0m, amortizacao), capital);
        var comissao = ComissaoDe(amortizar, comissaoPercentagem);
        var restante = Calculos.Centimos(capital - amortizar);

        var manter = Cenario(restante, taxaAnualPercentagem, prestacao, encargosMensais, amortizar, comissao, atual, primeiroMes,
            Projetar(restante, taxaAnualPercentagem, prestacao));

        CenarioDivida? reduzir = null;
        if (atual.Viavel && atual.Meses > 0)
        {
            var novaPrestacao = Prestacao(restante, taxaAnualPercentagem, atual.Meses);
            reduzir = Cenario(restante, taxaAnualPercentagem, novaPrestacao, encargosMensais, amortizar, comissao, atual, primeiroMes,
                Projetar(restante, taxaAnualPercentagem, novaPrestacao));
        }

        return (manter, reduzir);
    }

    /// <summary>Pagar o capital todo agora: sem mais prestações nem juros, mas com a comissão de reembolso.</summary>
    public static CenarioDivida SimularAmortizacaoTotal(
        decimal capital,
        decimal taxaAnualPercentagem,
        decimal prestacao,
        decimal encargosMensais,
        decimal comissaoPercentagem,
        string primeiroMes) =>
        SimularAmortizacao(capital, taxaAnualPercentagem, prestacao, encargosMensais, capital, comissaoPercentagem, primeiroMes).ManterPrestacao;

    /// <summary>Pagar mais <paramref name="extraMensal"/> em cada prestação (sem amortização de uma vez).</summary>
    public static CenarioDivida SimularExtraMensal(
        decimal capital,
        decimal taxaAnualPercentagem,
        decimal prestacao,
        decimal encargosMensais,
        decimal extraMensal,
        string primeiroMes)
    {
        var atual = Projetar(capital, taxaAnualPercentagem, prestacao);
        var extra = Math.Max(0m, extraMensal);
        return Cenario(capital, taxaAnualPercentagem, prestacao + extra, encargosMensais, 0m, 0m, atual, primeiroMes,
            Projetar(capital, taxaAnualPercentagem, prestacao, extra));
    }

    /// <summary>A situação de hoje, sem fazer nada (a base de comparação dos cenários).</summary>
    public static CenarioDivida SimularAtual(decimal capital, decimal taxaAnualPercentagem, decimal prestacao, decimal encargosMensais, string primeiroMes)
    {
        var atual = Projetar(capital, taxaAnualPercentagem, prestacao);
        return Cenario(capital, taxaAnualPercentagem, prestacao, encargosMensais, 0m, 0m, atual, primeiroMes, atual);
    }

    public static decimal ComissaoDe(decimal amortizado, decimal comissaoPercentagem) =>
        Calculos.Centimos(amortizado * Math.Max(0m, comissaoPercentagem) / 100m);

    // O que sai do bolso até ao fim: capital + juros + selo + seguros de cada mês que falta
    private static decimal TotalSemAmortizacao(ProjecaoCredito projecao, decimal encargosMensais) =>
        projecao.Total + projecao.Selo + (encargosMensais * projecao.Meses);

    private static CenarioDivida Cenario(
        decimal capitalDoCenario,
        decimal taxaAnualPercentagem,
        decimal prestacao,
        decimal encargosMensais,
        decimal amortizado,
        decimal comissao,
        ProjecaoCredito atual,
        string primeiroMes,
        ProjecaoCredito projecao)
    {
        var comparavel = atual.Viavel && projecao.Viavel;
        var total = Calculos.Centimos(amortizado + comissao + TotalSemAmortizacao(projecao, encargosMensais));
        var totalAtual = Calculos.Centimos(TotalSemAmortizacao(atual, encargosMensais));
        return new CenarioDivida(
            prestacao,
            capitalDoCenario > 0 ? Calculos.Centimos(prestacao + encargosMensais + Selo(Juros(capitalDoCenario, taxaAnualPercentagem))) : 0m,
            projecao.Meses,
            projecao.Viavel && projecao.Meses > 0 ? Meses.Somar(primeiroMes, projecao.Meses - 1) : null,
            projecao.Juros,
            comissao,
            amortizado,
            total,
            comparavel ? Calculos.Centimos(atual.Juros - projecao.Juros) : 0m,
            comparavel ? Calculos.Centimos(totalAtual - total) : 0m,
            comparavel ? atual.Meses - projecao.Meses : 0,
            projecao.Viavel);
    }

    // ---- Várias dívidas: bola de neve ou avalanche ----

    /// <summary>Uma dívida para comparar estratégias (sem taxa: 0%).</summary>
    public sealed record DividaEstrategia(string Id, string Titulo, decimal Capital, decimal TaxaAnual, decimal Prestacao);

    /// <summary>Como acaba cada dívida numa estratégia: <paramref name="Mes"/> é a prestação (a contar de 1) em que fica paga.</summary>
    public sealed record FimDeDivida(string Id, string Titulo, int Mes);

    /// <summary>O resultado de uma estratégia: quando tudo fica pago, que juros custa e por que ordem as dívidas acabam.</summary>
    public sealed record ResultadoEstrategia(int Meses, decimal Juros, bool Viavel, IReadOnlyList<FimDeDivida> Ordem);

    public enum Estrategia
    {
        /// <summary>Cada dívida paga só a sua prestação: nada se reencaminha (o que acontece hoje).</summary>
        SoPrestacoes,

        /// <summary>O extra (e as prestações das dívidas já pagas) vai para a dívida mais pequena primeiro.</summary>
        BolaDeNeve,

        /// <summary>O extra (e as prestações das dívidas já pagas) vai para a dívida com a taxa mais alta primeiro.</summary>
        Avalanche,
    }

    /// <summary>
    /// Pagar várias dívidas ao mesmo tempo. Todas pagam a sua prestação; o <paramref name="extraMensal"/> e, a
    /// partir do mês seguinte a uma dívida ficar paga, a prestação dela, vão para a dívida da vez (conforme
    /// a <paramref name="estrategia"/>). Com <see cref="Estrategia.SoPrestacoes"/> nada se reencaminha.
    /// </summary>
    public static ResultadoEstrategia SimularEstrategia(IReadOnlyList<DividaEstrategia> dividas, decimal extraMensal, Estrategia estrategia)
    {
        var ativas = dividas.Where(d => d.Capital > 0).ToList();
        var saldos = ativas.Select(d => d.Capital).ToArray();
        var fim = new int?[ativas.Count];
        var juros = 0m;

        // Ordem em que o extra é aplicado (índices); fixa durante a simulação
        var ordem = Enumerable.Range(0, ativas.Count)
            .OrderBy(i => estrategia == Estrategia.Avalanche ? -ativas[i].TaxaAnual : ativas[i].Capital)
            .ThenBy(i => ativas[i].Capital)
            .ToList();

        var meses = 0;
        while (saldos.Any(s => s > 0) && meses < LimiteMeses)
        {
            meses++;
            var reencaminhar = estrategia != Estrategia.SoPrestacoes;
            var bolsa = reencaminhar ? Math.Max(0m, extraMensal) : 0m;

            for (var i = 0; i < ativas.Count; i++)
            {
                if (saldos[i] <= 0)
                {
                    // Dívida já paga: a prestação dela passa para a bolsa (só a partir do mês seguinte ao fim)
                    bolsa += reencaminhar ? ativas[i].Prestacao : 0m;
                    continue;
                }

                var jurosDoMes = Juros(saldos[i], ativas[i].TaxaAnual);
                juros += jurosDoMes;
                var pago = Math.Min(ativas[i].Prestacao, saldos[i] + jurosDoMes);
                saldos[i] = Calculos.Centimos(saldos[i] + jurosDoMes - pago);
                // O que sobra da última prestação também vai para a bolsa
                bolsa += reencaminhar ? ativas[i].Prestacao - pago : 0m;
            }

            foreach (var i in ordem)
            {
                if (bolsa <= 0)
                {
                    break;
                }

                if (saldos[i] <= 0)
                {
                    continue;
                }

                var pagar = Math.Min(bolsa, saldos[i]);
                saldos[i] = Calculos.Centimos(saldos[i] - pagar);
                bolsa = Calculos.Centimos(bolsa - pagar);
            }

            for (var i = 0; i < ativas.Count; i++)
            {
                if (saldos[i] <= 0 && fim[i] is null)
                {
                    fim[i] = meses;
                }
            }
        }

        return new ResultadoEstrategia(
            meses,
            Calculos.Centimos(juros),
            saldos.All(s => s <= 0),
            [.. Enumerable.Range(0, ativas.Count)
                .Where(i => fim[i] is not null)
                .OrderBy(i => fim[i])
                .ThenBy(i => ativas[i].Titulo, StringComparer.CurrentCultureIgnoreCase)
                .Select(i => new FimDeDivida(ativas[i].Id, ativas[i].Titulo, fim[i]!.Value))]);
    }
}
