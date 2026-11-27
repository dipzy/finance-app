using Financas.Services.Regras;

namespace Financas.Services.Tests;

// O crédito do exemplo é o de um extrato real (valores arredondados): capital 7 169,10 €, TAN 3,3 %,
// prestação debitada 156,28 € = 120,54 de capital + 19,72 de juros + 0,79 de selo + 15,23 de seguros.
// Funções puras: não há base de dados.
public class AmortizacaoTests
{
    private const decimal Capital = 7169.10m;
    private const decimal Taxa = 3.3m;
    private const decimal Seguros = 15.23m;
    private const decimal PrestacaoDebitada = 156.28m;

    [Fact]
    public void Os_juros_e_o_selo_do_mes_batem_certo_com_o_extrato()
    {
        Assert.Equal(19.72m, Amortizacao.Juros(Capital, Taxa));
        Assert.Equal(0.79m, Amortizacao.Selo(19.72m));
    }

    [Fact]
    public void A_prestacao_de_capital_e_juros_e_o_debitado_sem_seguros_nem_selo()
    {
        // 156,28 - 15,23 - 0,79 = 140,26 = 120,54 de capital + 19,72 de juros
        Assert.Equal(140.26m, Amortizacao.PrestacaoSemEncargos(PrestacaoDebitada, Seguros, Capital, Taxa));
    }

    [Fact]
    public void A_prestacao_francesa_do_contrato_fica_perto_da_do_extrato()
    {
        // 7 766,69 € a 3,3 % em 60 meses: o banco cobra 140,26 (conta de dias); a fórmula dá 140,60
        var prestacao = Amortizacao.Prestacao(7766.69m, Taxa, 60);
        Assert.InRange(prestacao, 140m, 141m);
        Assert.Equal(0m, Amortizacao.Prestacao(0m, Taxa, 60));
        Assert.Equal(0m, Amortizacao.Prestacao(1000m, Taxa, 0));
    }

    [Fact]
    public void Sem_taxa_a_prestacao_e_so_dividir_pelos_meses()
    {
        Assert.Equal(100m, Amortizacao.Prestacao(1200m, 0m, 12));
    }

    [Fact]
    public void Projetar_acaba_a_divida_com_a_ultima_prestacao_mais_pequena()
    {
        var projecao = Amortizacao.Projetar(Capital, Taxa, 140.26m);

        Assert.True(projecao.Viavel);
        Assert.InRange(projecao.Meses, 54, 56); // 60 prestações no total, já pagas 5
        Assert.InRange(projecao.Juros, 550m, 590m);
        // capital + juros = o que se paga ao todo; o capital sai inteiro
        Assert.Equal(Capital + projecao.Juros, projecao.Total);
        Assert.Equal(Amortizacao.Selo(projecao.Juros), projecao.Selo);
    }

    [Fact]
    public void Projetar_sem_juros_e_capital_a_dividir_pela_prestacao()
    {
        var projecao = Amortizacao.Projetar(1000m, 0m, 300m);
        Assert.Equal(4, projecao.Meses);
        Assert.Equal(0m, projecao.Juros);
        Assert.Equal(1000m, projecao.Total);
    }

    [Fact]
    public void Prestacao_que_nao_cobre_os_juros_nunca_acaba()
    {
        var projecao = Amortizacao.Projetar(100000m, 12m, 500m); // juros do mês: 1000 €
        Assert.False(projecao.Viavel);
        Assert.Equal(0, projecao.Meses);
        Assert.False(Amortizacao.Projetar(1000m, 5m, 0m).Viavel);
    }

    [Fact]
    public void Sem_capital_nao_ha_nada_a_projetar()
    {
        var projecao = Amortizacao.Projetar(0m, 5m, 100m);
        Assert.True(projecao.Viavel);
        Assert.Equal(0, projecao.Meses);
    }

    [Fact]
    public void O_extra_mensal_encurta_a_divida_e_poupa_juros()
    {
        var sem = Amortizacao.Projetar(Capital, Taxa, 140.26m);
        var com = Amortizacao.Projetar(Capital, Taxa, 140.26m, 100m);

        Assert.True(com.Meses < sem.Meses);
        Assert.True(com.Juros < sem.Juros);
        Assert.Equal(Capital + com.Juros, com.Total);
    }

    // ---- O capital que falta ----

    [Fact]
    public void Capital_em_falta_desce_so_com_o_que_sobra_depois_dos_juros_do_selo_e_dos_seguros()
    {
        var pago = new Dictionary<string, decimal> { ["2026-10"] = PrestacaoDebitada };

        var emFalta = Amortizacao.CapitalEmFalta(Capital, "2026-10", Taxa, Seguros, pago, "2026-10");

        // 7 169,10 + 19,72 de juros - 140,26 = 7 048,56 (a prestação amortizou 120,54)
        Assert.Equal(7048.56m, emFalta);
    }

    [Fact]
    public void Capital_em_falta_nao_muda_no_mes_atual_enquanto_a_prestacao_nao_foi_paga()
    {
        var emFalta = Amortizacao.CapitalEmFalta(Capital, "2026-10", Taxa, Seguros, new Dictionary<string, decimal>(), "2026-10");
        Assert.Equal(Capital, emFalta);
    }

    [Fact]
    public void Um_mes_passado_sem_pagamento_continua_a_render_juros()
    {
        var emFalta = Amortizacao.CapitalEmFalta(Capital, "2026-10", Taxa, Seguros, new Dictionary<string, decimal>(), "2026-11");
        Assert.Equal(Capital + 19.72m, emFalta);
    }

    [Fact]
    public void Capital_em_falta_nunca_fica_negativo()
    {
        var pago = new Dictionary<string, decimal> { ["2026-10"] = 99999m };
        Assert.Equal(0m, Amortizacao.CapitalEmFalta(Capital, "2026-10", Taxa, Seguros, pago, "2026-10"));
    }

    // ---- Simulador ----

    [Fact]
    public void Amortizar_mantendo_a_prestacao_acaba_mais_cedo_e_poupa_juros()
    {
        var atual = Amortizacao.SimularAtual(Capital, Taxa, 140.26m, Seguros, "2026-10");
        var (manter, reduzir) = Amortizacao.SimularAmortizacao(Capital, Taxa, 140.26m, Seguros, 2000m, 0.5m, "2026-10");

        Assert.Equal(140.26m, manter.Prestacao);
        Assert.True(manter.Meses < atual.Meses);
        Assert.True(manter.PoupancaJuros > 0);
        Assert.Equal(10m, manter.Comissao); // 0,5 % de 2 000 €
        Assert.Equal(atual.Meses - manter.Meses, manter.MesesPoupados);
        Assert.NotNull(manter.Fim);

        // O que se ganha a sério desconta a comissão
        Assert.True(manter.PoupancaLiquida > manter.PoupancaJuros - manter.Comissao - 0.01m);
        Assert.Equal(Math.Round(atual.TotalAPagar - manter.TotalAPagar, 2), manter.PoupancaLiquida);

        // Reduzir a prestação: acaba no mesmo mês, mas paga menos por mês
        Assert.NotNull(reduzir);
        Assert.True(reduzir.Prestacao < 140.26m);
        Assert.InRange(reduzir.Meses, atual.Meses - 1, atual.Meses + 1); // o arredondamento da prestação pode somar um mês
        Assert.True(reduzir.PoupancaJuros > 0);
        Assert.True(reduzir.PoupancaJuros < manter.PoupancaJuros); // acabar mais cedo poupa mais juros
    }

    [Fact]
    public void A_amortizacao_total_deixa_a_divida_paga_e_so_custa_o_capital_e_a_comissao()
    {
        var atual = Amortizacao.SimularAtual(Capital, Taxa, 140.26m, Seguros, "2026-10");
        var total = Amortizacao.SimularAmortizacaoTotal(Capital, Taxa, 140.26m, Seguros, 2m, "2026-10");

        Assert.Equal(0, total.Meses);
        Assert.Null(total.Fim);
        Assert.Equal(0m, total.Juros);
        Assert.Equal(Capital, total.AmortizadoAgora);
        Assert.Equal(143.38m, total.Comissao); // 2 % de 7 169,10
        Assert.Equal(Capital + 143.38m, total.TotalAPagar);
        Assert.Equal(atual.Juros, total.PoupancaJuros);
        Assert.Equal(atual.MesesPoupados + atual.Meses, total.MesesPoupados);
    }

    [Fact]
    public void Amortizar_mais_do_que_o_capital_e_o_mesmo_que_amortizar_tudo()
    {
        var (manter, _) = Amortizacao.SimularAmortizacao(Capital, Taxa, 140.26m, Seguros, 999999m, 0m, "2026-10");
        Assert.Equal(Capital, manter.AmortizadoAgora);
        Assert.Equal(0, manter.Meses);
    }

    [Fact]
    public void Comissao_a_zero_e_por_defeito_e_nunca_negativa()
    {
        Assert.Equal(0m, Amortizacao.ComissaoDe(1000m, 0m));
        Assert.Equal(0m, Amortizacao.ComissaoDe(1000m, -1m));
    }

    [Fact]
    public void O_extra_mensal_simula_pagar_mais_todos_os_meses()
    {
        var atual = Amortizacao.SimularAtual(Capital, Taxa, 140.26m, Seguros, "2026-10");
        var extra = Amortizacao.SimularExtraMensal(Capital, Taxa, 140.26m, Seguros, 50m, "2026-10");

        Assert.Equal(190.26m, extra.Prestacao);
        Assert.True(extra.Meses < atual.Meses);
        Assert.Equal(0m, extra.AmortizadoAgora);
        Assert.True(extra.PoupancaLiquida > 0);
    }

    [Fact]
    public void O_fim_da_divida_conta_a_partir_do_primeiro_mes()
    {
        var atual = Amortizacao.SimularAtual(1000m, 0m, 500m, 0m, "2026-10");
        Assert.Equal(2, atual.Meses);
        Assert.Equal("2026-11", atual.Fim);
    }

    [Fact]
    public void A_prestacao_total_do_cenario_inclui_o_selo_e_os_seguros()
    {
        var atual = Amortizacao.SimularAtual(Capital, Taxa, 140.26m, Seguros, "2026-10");
        Assert.Equal(156.28m, atual.PrestacaoTotal); // 140,26 + 0,79 + 15,23
    }

    // ---- Várias dívidas ----

    private static readonly IReadOnlyList<Amortizacao.DividaEstrategia> TresDividas =
    [
        new("a", "Cartão", 1000m, 18m, 100m),
        new("b", "Carro", 5000m, 4m, 200m),
        new("c", "Dentista", 600m, 0m, 50m),
    ];

    [Fact]
    public void Reencaminhar_o_extra_acaba_antes_e_com_menos_juros_que_so_pagar_as_prestacoes()
    {
        var base_ = Amortizacao.SimularEstrategia(TresDividas, 100m, Amortizacao.Estrategia.SoPrestacoes);
        var neve = Amortizacao.SimularEstrategia(TresDividas, 100m, Amortizacao.Estrategia.BolaDeNeve);
        var avalanche = Amortizacao.SimularEstrategia(TresDividas, 100m, Amortizacao.Estrategia.Avalanche);

        Assert.True(base_.Viavel && neve.Viavel && avalanche.Viavel);
        Assert.True(neve.Meses < base_.Meses);
        Assert.True(avalanche.Meses < base_.Meses);
        Assert.True(neve.Juros < base_.Juros);
        // A avalanche ataca a taxa mais alta: nunca paga mais juros que a bola de neve
        Assert.True(avalanche.Juros <= neve.Juros);
    }

    [Fact]
    public void A_bola_de_neve_acaba_primeiro_a_divida_mais_pequena_e_a_avalanche_a_de_taxa_mais_alta()
    {
        var neve = Amortizacao.SimularEstrategia(TresDividas, 100m, Amortizacao.Estrategia.BolaDeNeve);
        var avalanche = Amortizacao.SimularEstrategia(TresDividas, 100m, Amortizacao.Estrategia.Avalanche);

        Assert.Equal("c", neve.Ordem[0].Id); // 600 € é a mais pequena
        Assert.Equal("a", avalanche.Ordem[0].Id); // 18 % é a taxa mais alta
        Assert.Equal(3, neve.Ordem.Count);
        Assert.Equal(neve.Meses, neve.Ordem[^1].Mes);
    }

    [Fact]
    public void Sem_extra_so_as_prestacoes_libertadas_ja_aceleram_a_bola_de_neve()
    {
        var base_ = Amortizacao.SimularEstrategia(TresDividas, 0m, Amortizacao.Estrategia.SoPrestacoes);
        var neve = Amortizacao.SimularEstrategia(TresDividas, 0m, Amortizacao.Estrategia.BolaDeNeve);
        Assert.True(neve.Meses <= base_.Meses);
        Assert.True(neve.Juros <= base_.Juros);
    }

    [Fact]
    public void Dividas_sem_capital_ficam_de_fora_das_estrategias()
    {
        var resultado = Amortizacao.SimularEstrategia(
            [new Amortizacao.DividaEstrategia("a", "Paga", 0m, 5m, 100m)], 50m, Amortizacao.Estrategia.Avalanche);
        Assert.Equal(0, resultado.Meses);
        Assert.True(resultado.Viavel);
        Assert.Empty(resultado.Ordem);
    }

    [Fact]
    public void Uma_divida_que_nunca_desce_marca_a_estrategia_como_inviavel()
    {
        var resultado = Amortizacao.SimularEstrategia(
            [new Amortizacao.DividaEstrategia("a", "Má", 100000m, 12m, 500m)], 0m, Amortizacao.Estrategia.SoPrestacoes);
        Assert.False(resultado.Viavel);
    }
}
