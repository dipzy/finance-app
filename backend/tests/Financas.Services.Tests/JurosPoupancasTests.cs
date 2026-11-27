using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

public class RegrasJurosPoupancasTests
{
    [Fact]
    public void Os_juros_do_mes_sao_a_taxa_a_dividir_por_12_menos_o_imposto()
    {
        // 1000 € a 3%: 2,50 € brutos por mês; com 28% de retenção ficam 1,80 €
        Assert.Equal((2.50m, 1.80m), RegrasPoupancas.JurosDoMes(1000, 3, 28));
        Assert.Equal((2.50m, 2.50m), RegrasPoupancas.JurosDoMes(1000, 3, 0));
        // Sem saldo, sem taxa ou sem dias a contar: nada
        Assert.Equal((0m, 0m), RegrasPoupancas.JurosDoMes(0, 3, 28));
        Assert.Equal((0m, 0m), RegrasPoupancas.JurosDoMes(1000, 0, 28));
        Assert.Equal((0m, 0m), RegrasPoupancas.JurosDoMes(1000, 3, 28, 0m));
    }

    [Fact]
    public void O_primeiro_mes_conta_so_os_dias_que_faltavam()
    {
        Assert.Equal(1m, RegrasPoupancas.FracaoDoPrimeiroMes(new DateOnly(2026, 10, 1)));
        Assert.Equal(22m / 31m, RegrasPoupancas.FracaoDoPrimeiroMes(new DateOnly(2026, 10, 10)));
        Assert.Equal(1m / 28m, RegrasPoupancas.FracaoDoPrimeiroMes(new DateOnly(2027, 2, 28)));
    }

    [Fact]
    public void Os_meses_por_creditar_sao_os_fechados_depois_do_ultimo_creditado()
    {
        Poupanca P(string? ate, bool automaticos = true, decimal? taxa = 3m) => new()
        {
            UtilizadorId = "u",
            Id = "p",
            Nome = "x",
            TaxaAnual = taxa,
            JurosAutomaticos = automaticos,
            JurosDesde = new DateOnly(2026, 8, 15),
            JurosCreditadosAte = ate,
        };

        Assert.Equal(["2026-08", "2026-09"], RegrasPoupancas.MesesDeJurosPorCreditar(P(null), "2026-10"));
        Assert.Equal(["2026-10", "2026-11"], RegrasPoupancas.MesesDeJurosPorCreditar(P("2026-09"), "2026-12"));
        Assert.Empty(RegrasPoupancas.MesesDeJurosPorCreditar(P("2026-09"), "2026-10")); // outubro ainda não acabou
        Assert.Empty(RegrasPoupancas.MesesDeJurosPorCreditar(P(null, automaticos: false), "2026-10"));
        Assert.Empty(RegrasPoupancas.MesesDeJurosPorCreditar(P(null, taxa: null), "2026-10"));
    }

    [Fact]
    public void A_projecao_soma_contribuicoes_e_juros_sobre_juros()
    {
        var sem = RegrasPoupancas.Projetar(1000, 0, 3, 28, 12);
        Assert.Equal(13, sem.Pontos.Count); // o ponto 0 e um por mês
        Assert.Equal(new PontoProjecao(0, 1000), sem.Pontos[0]);
        Assert.Equal(0, sem.Contribuicoes);
        Assert.Equal(sem.SaldoFinal, 1000 + sem.JurosLiquidos);
        Assert.InRange(sem.JurosLiquidos, 21m, 22m); // ~2,16% líquidos num ano

        var com = RegrasPoupancas.Projetar(1000, 100, 3, 28, 12);
        Assert.Equal(1200, com.Contribuicoes);
        Assert.Equal(1000 + 1200 + com.JurosLiquidos, com.SaldoFinal);
        Assert.True(com.JurosLiquidos > sem.JurosLiquidos);

        // Sem taxa é só somar as contribuições
        Assert.Equal(2200, RegrasPoupancas.Projetar(1000, 100, 0, 28, 12).SaldoFinal);
    }
}

public class JurosPoupancasTests : TestesServicos
{
    private Task<string> Nova(decimal saldo, decimal? taxa, bool automaticos = true, decimal? retencao = null) =>
        Poupancas.AdicionarAsync(Uid, new NovaPoupancaPedido(
            "Conta poupança", TipoContribuicao.Valor, "0", saldo, null,
            ContribuicaoAutomatica: false, TaxaAnual: taxa, Retencao: retencao, JurosAutomaticos: automaticos));

    private async Task<PoupancaDto> Unica() => Assert.Single(await Poupancas.ListarAsync(Uid));

    [Fact]
    public async Task Os_juros_de_cada_mes_somam_se_ao_saldo_quando_o_mes_acaba()
    {
        HojeE(2026, 10, 10);
        await Nova(1000, 3);

        // Durante outubro ainda não há nada a somar, mas já se vê o que rende por mês
        HojeE(2026, 10, 20);
        await CalcularSaldoDisponivel();
        var durante = await Unica();
        Assert.Equal((1000m, 0m, 1.80m), (durante.Saldo, durante.JurosRecebidos, durante.JurosMes));

        // Em novembro entram os juros de outubro, só dos 22 dias que restavam quando começou (10 a 31)
        HojeE(2026, 11, 2);
        await CalcularSaldoDisponivel();
        await CalcularSaldoDisponivel(); // abrir a app outra vez não soma outra vez
        var novembro = await Unica();
        Assert.Equal((1001.27m, 1.27m), (novembro.Saldo, novembro.JurosRecebidos)); // 2,50 × 22/31 = 1,77 bruto; 1,27 líquido

        // Se a app ficou fechada vários meses, somam-se os que faltam por ordem (juros sobre juros)
        HojeE(2027, 1, 5);
        await CalcularSaldoDisponivel();
        var janeiro = await Unica();
        Assert.Equal((1004.88m, 4.88m), (janeiro.Saldo, janeiro.JurosRecebidos)); // + 1,80 de novembro e + 1,81 de dezembro
    }

    [Fact]
    public async Task Sem_juros_automaticos_a_taxa_so_serve_para_a_estimativa()
    {
        HojeE(2026, 10, 10);
        var id = await Nova(5000, 4, automaticos: false, retencao: 0);

        HojeE(2027, 3, 1);
        await CalcularSaldoDisponivel();
        var ppr = await Unica();
        Assert.Equal((5000m, 0m, 16.67m), (ppr.Saldo, ppr.JurosRecebidos, ppr.JurosMes)); // sem retenção: 5000 × 4% / 12

        var projecao = await Poupancas.ProjetarAsync(Uid, id, 24, comContribuicoes: false);
        Assert.Equal((24, 4m, 5000m), (projecao.Meses, projecao.TaxaAnual, projecao.SaldoInicial));
        Assert.Equal(5000 + projecao.JurosLiquidos, projecao.SaldoFinal);
        Assert.Equal(projecao.JurosBrutos, projecao.JurosLiquidos); // retenção a 0

        // Outro cenário: uma taxa à escolha
        var pessimista = await Poupancas.ProjetarAsync(Uid, id, 24, taxa: 1, comContribuicoes: false);
        Assert.True(pessimista.SaldoFinal < projecao.SaldoFinal);
    }

    [Fact]
    public async Task Juros_automaticos_precisam_da_taxa_e_a_projecao_valida_os_pedidos()
    {
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Nova(100, null));
        var id = await Nova(100, null, automaticos: false);

        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Poupancas.ProjetarAsync(Uid, id, 12)); // sem taxa
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Poupancas.AlterarAsync(Uid, id, new AlterarPoupancaPedido(null, null, null, null, JurosAutomaticos: true)));

        await Poupancas.AlterarAsync(Uid, id, new AlterarPoupancaPedido(null, null, null, null, TaxaAnual: 2.5m, JurosAutomaticos: true));
        var ligada = await Unica();
        Assert.Equal((2.5m, true), (ligada.TaxaAnual, ligada.JurosAutomaticos));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Poupancas.ProjetarAsync(Uid, id, 0));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Poupancas.ProjetarAsync(Uid, id, 601));

        // Tirar a taxa desliga os juros
        await Poupancas.AlterarAsync(Uid, id, new AlterarPoupancaPedido(null, null, null, null, Limpar: ["taxaAnual"]));
        var desligada = await Unica();
        Assert.Equal((null, false), (desligada.TaxaAnual, desligada.JurosAutomaticos));
    }
}
