using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// O que já se gastou por categoria (o simulador): o mês atual até hoje e a média dos meses completos anteriores,
// separado entre a conta e o cartão de alimentação. Só valores reais, nenhuma previsão.
public class GastosCategoriasRegrasTests
{
    private static DespesaExtra E(decimal valor, string? categoria) => new()
    {
        UtilizadorId = "u",
        Id = Guid.NewGuid().ToString("N"),
        Titulo = "x",
        Valor = valor,
        Categoria = categoria,
    };

    [Fact]
    public void Os_totais_somam_por_categoria_a_maior_primeiro_e_as_sem_categoria_contam_como_outros()
    {
        var totais = Calculos.TotaisPorCategoria([E(10, "lazer"), E(50, "supermercado"), E(20, "lazer"), E(5, null)]);

        Assert.Equal(
            [("supermercado", 50m), ("lazer", 30m), ("outros", 5m)],
            totais.Select(t => (t.Categoria, t.Valor)).ToArray());
    }

    [Fact]
    public void A_media_divide_pelo_numero_de_meses_mesmo_que_a_categoria_so_tenha_gasto_em_alguns()
    {
        // 90 € em 3 meses = 30 € por mês, tenha havido gastos em 1 ou em 3 desses meses
        var totais = Calculos.TotaisPorCategoria([E(90, "supermercado")], divisor: 3);

        Assert.Equal(30m, Assert.Single(totais).Valor);
    }

    [Fact]
    public void As_despesas_mensais_pagas_somam_a_categoria_e_dizem_quanto_e_delas()
    {
        // Em 2 meses: (40 + 600) / 2 = 320 em casa, 300 dos quais de despesas mensais; as mensais sem categoria são "outros"
        var totais = Calculos.TotaisPorCategoria([E(40, "casa"), E(10, "lazer")], divisor: 2, fixas: [("casa", 600m), ("outros", 20m)]);

        Assert.Equal(
            [("casa", 320m, 300m), ("outros", 10m, 10m), ("lazer", 5m, 0m)],
            totais.Select(t => (t.Categoria, t.Valor, t.Fixas)).ToArray());
    }

    [Fact]
    public void Sem_gastos_nao_ha_categorias()
    {
        Assert.Empty(Calculos.TotaisPorCategoria([]));
    }

    [Fact]
    public void Os_meses_da_media_sao_os_completos_anteriores_a_contar_do_primeiro_gasto()
    {
        var hoje = new DateOnly(2026, 10, 15);

        Assert.Equal(["2026-08", "2026-09"], Calculos.MesesDaMedia(hoje, "2026-08"));
        // No máximo 6 meses, mesmo com mais histórico
        Assert.Equal(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"], Calculos.MesesDaMedia(hoje, "2025-01"));
        Assert.Equal(["2026-08", "2026-09"], Calculos.MesesDaMedia(hoje, "2025-01", quantos: 2));
    }

    [Fact]
    public void Se_o_primeiro_gasto_e_deste_mes_ainda_nao_ha_meses_completos()
    {
        Assert.Empty(Calculos.MesesDaMedia(new DateOnly(2026, 10, 15), "2026-10"));
    }
}

public class GastosCategoriasServicoTests : TestesServicos
{
    private IEstatisticasService Estatisticas => A.Servico<IEstatisticasService>();

    private Task Historica(string titulo, decimal valor, DateOnly data, string categoria, MeioPagamento meio = MeioPagamento.Conta) =>
        Extras.AdicionarHistoricaAsync(Uid, new DespesaHistoricaPedido(titulo, valor, data, categoria, meio));

    private static (string Categoria, decimal Valor)[] Pares(IReadOnlyList<ValorCategoriaDto> valores) =>
        [.. valores.Select(v => (v.Categoria, v.Valor))];

    [Fact]
    public async Task Separa_a_conta_do_cartao_e_o_mes_atual_da_media_dos_meses_completos()
    {
        HojeE(2026, 10, 15);
        await Adicionar(1000);
        await GuardarSalario("1500", 25, "150");
        await Conta.DefinirCartaoAlimentacaoAsync(Uid, 100);
        await Historica("Pingo Doce", 90, Dia(2026, 8, 10), "supermercado");
        await Historica("Pingo Doce", 30, Dia(2026, 9, 10), "supermercado");
        await Historica("Almoço", 40, Dia(2026, 9, 12), "restauracao", MeioPagamento.CartaoAlimentacao);
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Continente", 25, Dia(2026, 10, 3), "supermercado"));
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Almoço", 12, Dia(2026, 10, 4), "restauracao", MeioPagamento.CartaoAlimentacao));

        var g = await Estatisticas.GastosCategoriasAsync(Uid);

        Assert.Equal("2026-10", g.Mes);
        Assert.Equal(2, g.MesesBase); // agosto e setembro: o mês atual não entra na média
        Assert.Equal(150m, g.CartaoMensal);
        Assert.Equal([("supermercado", 25m)], Pares(g.Conta.MesAtual));
        Assert.Equal([("supermercado", 60m)], Pares(g.Conta.Media)); // (90 + 30) / 2
        var cartao = Assert.IsType<GastosDoMeioDto>(g.Cartao);
        Assert.Equal([("restauracao", 12m)], Pares(cartao.MesAtual));
        Assert.Equal([("restauracao", 20m)], Pares(cartao.Media)); // 40 / 2
    }

    [Fact]
    public async Task As_despesas_mensais_pagas_contam_na_conta_por_categoria_e_dizem_quanto_e_delas()
    {
        HojeE(2026, 9, 15);
        await Adicionar(5000);
        var renda = await Fixas.AdicionarAsync(Uid, new NovaDespesaFixaPedido("Renda", 600, 12, null, null, null, "casa"));
        await Fixas.DebitarAsync(Uid, renda); // setembro
        await Historica("Obras", 40, Dia(2026, 9, 10), "casa");
        HojeE(2026, 10, 15);
        await Fixas.DebitarAsync(Uid, renda); // outubro
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Cola", 10, Dia(2026, 10, 3), "casa"));

        var g = await Estatisticas.GastosCategoriasAsync(Uid);

        Assert.Equal(1, g.MesesBase); // só setembro está completo
        var mesAtual = Assert.Single(g.Conta.MesAtual);
        Assert.Equal(("casa", 610m, 600m), (mesAtual.Categoria, mesAtual.Valor, mesAtual.Fixas));
        var media = Assert.Single(g.Conta.Media);
        Assert.Equal(("casa", 640m, 600m), (media.Categoria, media.Valor, media.Fixas));
    }

    [Fact]
    public async Task Sem_historico_a_media_vem_vazia()
    {
        HojeE(2026, 10, 15);
        await Adicionar(1000);
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Continente", 25, Dia(2026, 10, 3), "supermercado"));

        var g = await Estatisticas.GastosCategoriasAsync(Uid);

        Assert.Equal(0, g.MesesBase);
        Assert.Empty(g.Conta.Media);
        Assert.Equal([("supermercado", 25m)], Pares(g.Conta.MesAtual));
    }

    [Fact]
    public async Task Sem_cartao_no_salario_nao_ha_cartao_mesmo_com_gastos_pagos_com_ele()
    {
        HojeE(2026, 10, 15);
        await GuardarSalario("1500", 25);
        await Historica("Almoço", 40, Dia(2026, 9, 12), "restauracao", MeioPagamento.CartaoAlimentacao);

        var g = await Estatisticas.GastosCategoriasAsync(Uid);

        Assert.Null(g.Cartao);
        Assert.Equal(0m, g.CartaoMensal);
        Assert.Empty(g.Conta.Media); // o gasto do cartão não vai parar à conta
    }

    [Fact]
    public async Task O_numero_de_meses_da_media_pode_ser_pedido()
    {
        HojeE(2026, 10, 15);
        foreach (var mes in new[] { 5, 6, 7, 8, 9 })
        {
            await Historica("Pingo Doce", 60, Dia(2026, mes, 10), "supermercado");
        }

        var tres = await Estatisticas.GastosCategoriasAsync(Uid, meses: 3);
        var todos = await Estatisticas.GastosCategoriasAsync(Uid);

        Assert.Equal(3, tres.MesesBase);
        Assert.Equal([("supermercado", 60m)], Pares(tres.Conta.Media));
        Assert.Equal(5, todos.MesesBase); // só desde maio há gastos
        Assert.Equal([("supermercado", 60m)], Pares(todos.Conta.Media));
    }
}
