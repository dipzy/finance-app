using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// O ritmo dos orçamentos (aviso antes de estourar) e dos objetivos (o que se poupa contra o que é preciso).
// "Hoje" nos testes de serviço é 5 de outubro de 2026 (31 dias).
public class RitmoRegrasTests
{
    private static readonly DateOnly Dia15 = new(2026, 10, 15);

    [Fact]
    public void Previsto_estica_o_gasto_do_dia_a_dia_e_deixa_as_despesas_mensais_como_estao()
    {
        // 140 € em 15 dias = 9,33 €/dia × 31 dias
        Assert.Equal(289.33m, RitmoOrcamento.Prever(140, 0, Dia15));
        // A renda paga no dia 1 não se repete todos os dias
        Assert.Equal(400m, RitmoOrcamento.Prever(0, 400, Dia15));
        Assert.Equal(400m + 62m, RitmoOrcamento.Prever(30, 400, Dia15)); // 30/15 × 31
        // No último dia o previsto é o que já se gastou
        Assert.Equal(140m, RitmoOrcamento.Prever(140, 0, new DateOnly(2026, 10, 31)));
    }

    [Theory]
    [InlineData(15, 48.4)] // 15/31
    [InlineData(31, 100)]
    [InlineData(1, 3.2)]
    public void Percentagem_do_mes_ja_decorrida(int dia, double esperado) =>
        Assert.Equal((decimal)esperado, RitmoOrcamento.PercentagemDoMes(new DateOnly(2026, 10, dia)));

    [Fact]
    public void Aviso_quando_vai_muito_a_frente_do_mes_e_o_previsto_passa_o_limite()
    {
        // 70% gasto a 48,4% do mês: folga de 21,6 pontos, previsto 289 > 200
        Assert.True(RitmoOrcamento.Aviso(140, 200, 289.33m, EstadoOrcamento.Ok, Dia15));
    }

    [Theory]
    [InlineData(4)] // antes do dia 5, um só gasto distorce tudo
    [InlineData(1)]
    public void Sem_aviso_nos_primeiros_dias(int dia) =>
        Assert.False(RitmoOrcamento.Aviso(60, 100, 600, EstadoOrcamento.Ok, new DateOnly(2026, 10, dia)));

    [Fact]
    public void Sem_aviso_quando_ainda_se_gastou_pouco_ou_nao_vai_a_frente_do_mes()
    {
        Assert.False(RitmoOrcamento.Aviso(40, 100, 300, EstadoOrcamento.Ok, Dia15)); // 40%: abaixo do mínimo
        Assert.False(RitmoOrcamento.Aviso(55, 100, 120, EstadoOrcamento.Ok, Dia15)); // 55% a 48,4%: só 6,6 pontos à frente
        Assert.False(RitmoOrcamento.Aviso(70, 100, 100m, EstadoOrcamento.Ok, Dia15)); // o previsto não passa o limite
    }

    [Theory]
    [InlineData(EstadoOrcamento.Perto)] // já há o aviso dos 80%
    [InlineData(EstadoOrcamento.Ultrapassado)]
    public void Sem_aviso_de_ritmo_quando_ja_ha_aviso_de_limite(EstadoOrcamento estado) =>
        Assert.False(RitmoOrcamento.Aviso(90, 100, 200, estado, Dia15));

    [Fact]
    public void Sem_aviso_com_limite_a_zero() =>
        Assert.False(RitmoOrcamento.Aviso(10, 0, 20, EstadoOrcamento.Ok, Dia15));

    // ---- Objetivos ----

    [Fact]
    public void Contribuicao_abaixo_do_necessario_diz_quanto_falta_e_quando_se_chega_la()
    {
        // Faltam 700 em 3 meses (233,34/mês) e poupa-se 100/mês: 7 meses, de outubro a abril
        var r = RitmoObjetivos.Comparar(700, 233.34m, 100, "2026-10");

        Assert.Equal(100m, r.ContribuicaoMensal);
        Assert.Equal(-133.34m, r.Diferenca);
        Assert.Equal("2027-04", r.MesPrevisto);
    }

    [Fact]
    public void Contribuicao_acima_do_necessario_chega_antes_do_mes_alvo()
    {
        // Faltam 300 em 6 meses (50/mês) e poupa-se 100/mês: 3 meses, outubro a dezembro
        var r = RitmoObjetivos.Comparar(300, 50, 100, "2026-10");

        Assert.Equal(50m, r.Diferenca);
        Assert.Equal("2026-12", r.MesPrevisto);
    }

    [Fact]
    public void A_contribuicao_exata_chega_no_mes_alvo()
    {
        // 700 / 233,34 = 3,0000 -> o necessário por mês arredonda para cima, por isso 233,34 chega a 3 meses
        Assert.Equal("2026-12", RitmoObjetivos.Comparar(700, 233.34m, 233.34m, "2026-10").MesPrevisto);
        // Um cêntimo a menos já precisa de mais um mês
        Assert.Equal("2027-01", RitmoObjetivos.Comparar(700, 233.34m, 233.33m, "2026-10").MesPrevisto);
    }

    [Fact]
    public void Sem_contribuicao_ou_sem_nada_em_falta_nao_ha_mes_previsto()
    {
        Assert.Null(RitmoObjetivos.Comparar(700, 233.34m, 0, "2026-10").MesPrevisto);
        Assert.Null(RitmoObjetivos.Comparar(700, 233.34m, -5, "2026-10").MesPrevisto);
        Assert.Null(RitmoObjetivos.Comparar(0, 0, 100, "2026-10").MesPrevisto);
        Assert.Equal(-233.34m, RitmoObjetivos.Comparar(700, 233.34m, 0, "2026-10").Diferenca);
    }

    [Fact]
    public void Mais_de_cinquenta_anos_nao_e_uma_previsao() =>
        Assert.Null(RitmoObjetivos.Comparar(1_000_000, 100, 1, "2026-10").MesPrevisto);
}

public class RitmoAlertasTests : TestesServicos
{
    private IAlertasService Alertas => A.Servico<IAlertasService>();

    private Task GastarEm(string categoria, decimal valor) =>
        Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido($"Gasto {Guid.NewGuid():N}", valor, null, categoria));

    private Task<string> Orcamento(string categoria, decimal limite) =>
        A.Servico<IOrcamentosService>().AdicionarAsync(Uid, new NovoOrcamentoPedido(categoria, limite));

    [Fact]
    public async Task Orcamento_a_gastar_depressa_avisa_antes_dos_80_por_cento()
    {
        HojeE(2026, 10, 15);
        var id = await Orcamento("supermercado", 200);
        await GastarEm("supermercado", 140); // 70% a 48,4% do mês

        var alerta = Assert.Single(await Alertas.ListarAsync(Uid));

        Assert.Equal(TipoAlerta.OrcamentoRitmo, alerta.Tipo);
        Assert.Equal(SeveridadeAlerta.Aviso, alerta.Severidade);
        Assert.Equal("Supermercado a gastar depressa: 70% do orçamento", alerta.Titulo);
        Assert.Equal(
            "Já gastaste 140,00 € de 200,00 € em Supermercado (70%) e o mês só vai a 48,4%. A este ritmo chegas a 289,33 € no fim do mês.",
            alerta.Mensagem);
        Assert.Equal(id, alerta.Referencia);
        Assert.Equal(new DateOnly(2026, 10, 15), alerta.Data);
    }

    [Fact]
    public async Task Em_ingles_o_aviso_de_ritmo_vem_traduzido()
    {
        HojeE(2026, 10, 15);
        await Orcamento("supermercado", 200);
        await GastarEm("supermercado", 140);

        var anterior = Textos.Linguagem;
        Textos.Linguagem = "en";
        try
        {
            var alerta = Assert.Single(await Alertas.ListarAsync(Uid));
            Assert.Equal("Groceries: spending fast, 70% of the budget", alerta.Titulo);
            Assert.Equal(
                "You have spent 140.00 € of 200.00 € on Groceries (70%) and the month is only 48.4% through. At this pace you will reach 289.33 € by the end of the month.",
                alerta.Mensagem);
        }
        finally
        {
            Textos.Linguagem = anterior;
        }
    }

    [Fact]
    public async Task Nos_primeiros_dias_do_mes_nao_avisa()
    {
        HojeE(2026, 10, 4);
        await Orcamento("supermercado", 100);
        await GastarEm("supermercado", 60);

        Assert.Empty(await Alertas.ListarAsync(Uid));
    }

    [Fact]
    public async Task A_meio_do_mes_com_o_gasto_no_ritmo_certo_nao_avisa()
    {
        HojeE(2026, 10, 15);
        await Orcamento("supermercado", 200);
        await GastarEm("supermercado", 100); // 50% a 48,4% do mês

        Assert.Empty(await Alertas.ListarAsync(Uid));
    }

    [Fact]
    public async Task A_partir_dos_80_por_cento_fica_so_o_aviso_normal()
    {
        HojeE(2026, 10, 15);
        await Orcamento("supermercado", 100);
        await GastarEm("supermercado", 85);

        var alerta = Assert.Single(await Alertas.ListarAsync(Uid));
        Assert.Equal(TipoAlerta.OrcamentoAviso, alerta.Tipo);
    }

    [Fact]
    public async Task O_estado_do_orcamento_traz_o_previsto_so_no_mes_atual()
    {
        HojeE(2026, 10, 15);
        await Orcamento("supermercado", 200);
        await GastarEm("supermercado", 140);

        var orcamentos = A.Servico<IOrcamentosService>();
        Assert.Equal(289.33m, Assert.Single(await orcamentos.EstadoAsync(Uid, null)).Previsto);
        Assert.Null(Assert.Single(await orcamentos.EstadoAsync(Uid, "2026-09")).Previsto);
    }
}
