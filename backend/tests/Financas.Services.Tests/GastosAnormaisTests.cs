using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// Gastos fora do normal: regras puras (GastosAnormais) e os alertas que dão (AlertasService).
// "Hoje" nos testes de serviço é 25 de outubro de 2026; o histórico são julho, agosto e setembro.
public class GastosAnormaisRegrasTests
{
    private static int _id;

    private static DespesaExtra Extra(string mes, decimal valor, string? categoria = "restauracao", int dia = 10, string? recorrente = null) => new()
    {
        UtilizadorId = "u",
        Id = $"e{++_id}",
        Titulo = $"Gasto {_id}",
        Valor = valor,
        Mes = mes,
        Data = new DateOnly(int.Parse(mes[..4]), int.Parse(mes[5..]), dia),
        Categoria = categoria,
        GastoRecorrenteId = recorrente,
    };

    private static PagamentoFixa Pagamento(string mes, decimal valor, string fixa = "luz", bool parcial = false) => new()
    {
        UtilizadorId = "u",
        Id = PagamentoFixa.IdDe(mes, fixa),
        FixaId = fixa,
        Mes = mes,
        Titulo = "Eletricidade",
        Valor = valor,
        Parcial = parcial,
        Data = new DateOnly(int.Parse(mes[..4]), int.Parse(mes[5..]), 5),
        Estado = EstadoPagamento.Pago,
    };

    // ---- Categorias ----

    [Fact]
    public void Uma_categoria_40_por_cento_acima_da_media_dos_meses_anteriores_da_alerta()
    {
        DespesaExtra[] extras = [Extra("2026-07", 100), Extra("2026-08", 110), Extra("2026-09", 90), Extra("2026-10", 150)];

        var c = Assert.Single(GastosAnormais.CategoriasAcimaDaMedia(extras, "2026-10"));

        Assert.Equal(("restauracao", 150m, 100m, 50m), (c.Categoria, c.GastoAtual, c.Media, c.Subida));
    }

    [Fact]
    public void A_media_so_conta_os_meses_com_gasto_mas_precisa_de_pelo_menos_dois()
    {
        // Julho sem gasto: média de agosto e setembro (100 e 120 = 110)
        var c = Assert.Single(GastosAnormais.CategoriasAcimaDaMedia([Extra("2026-08", 100), Extra("2026-09", 120), Extra("2026-10", 200)], "2026-10"));
        Assert.Equal(110m, c.Media);

        // Só um mês de histórico: não há com que comparar
        Assert.Empty(GastosAnormais.CategoriasAcimaDaMedia([Extra("2026-09", 100), Extra("2026-10", 500)], "2026-10"));
    }

    [Theory]
    [InlineData(139, false)] // 39 % acima: ainda dentro do normal
    [InlineData(140, true)] // exatamente 40 %
    public void O_limiar_de_40_por_cento_e_inclusivo(decimal gastoAtual, bool alerta)
    {
        DespesaExtra[] extras = [Extra("2026-08", 100), Extra("2026-09", 100), Extra("2026-10", gastoAtual)];
        Assert.Equal(alerta, GastosAnormais.CategoriasAcimaDaMedia(extras, "2026-10").Count == 1);
    }

    [Fact]
    public void Percentagem_grande_mas_diferenca_pequena_nao_da_alerta()
    {
        // 10 € para 18 €: +80 %, mas só 8 € a mais (abaixo dos 15 € mínimos)
        Assert.Empty(GastosAnormais.CategoriasAcimaDaMedia([Extra("2026-08", 10), Extra("2026-09", 10), Extra("2026-10", 18)], "2026-10"));
        // Média de 5 €: pequena demais
        Assert.Empty(GastosAnormais.CategoriasAcimaDaMedia([Extra("2026-08", 5), Extra("2026-09", 5), Extra("2026-10", 60)], "2026-10"));
    }

    [Fact]
    public void Os_gastos_dos_recorrentes_e_de_outros_meses_nao_entram_na_conta()
    {
        DespesaExtra[] extras =
        [
            Extra("2026-08", 100), Extra("2026-09", 100),
            Extra("2026-10", 100), Extra("2026-10", 500, recorrente: "netflix"), // o recorrente é esperado
            Extra("2026-05", 900), // fora dos 3 meses do histórico
        ];
        Assert.Empty(GastosAnormais.CategoriasAcimaDaMedia(extras, "2026-10"));
    }

    [Fact]
    public void As_categorias_vem_da_que_mais_subiu_em_euros()
    {
        DespesaExtra[] extras =
        [
            Extra("2026-08", 100, "lazer"), Extra("2026-09", 100, "lazer"), Extra("2026-10", 160, "lazer"),
            Extra("2026-08", 100, "saude"), Extra("2026-09", 100, "saude"), Extra("2026-10", 300, "saude"),
        ];
        Assert.Equal(["saude", "lazer"], GastosAnormais.CategoriasAcimaDaMedia(extras, "2026-10").Select(c => c.Categoria));
    }

    [Fact]
    public void Sem_categoria_conta_como_outros()
    {
        var c = Assert.Single(GastosAnormais.CategoriasAcimaDaMedia([Extra("2026-08", 100, null), Extra("2026-09", 100, null), Extra("2026-10", 200, null)], "2026-10"));
        Assert.Equal("outros", c.Categoria);
    }

    // ---- Despesas mensais ----

    [Fact]
    public void A_eletricidade_que_subiu_40_por_cento_da_alerta()
    {
        PagamentoFixa[] pagamentos = [Pagamento("2026-07", 45), Pagamento("2026-08", 45), Pagamento("2026-09", 45), Pagamento("2026-10", 63)];

        var d = Assert.Single(GastosAnormais.DespesasFixas(pagamentos, "2026-10"));

        Assert.Equal(("luz", 63m, 45m, 40m), (d.FixaId, d.Valor, d.Media, d.Subida));
        Assert.Equal(new DateOnly(2026, 10, 5), d.Data);
    }

    [Fact]
    public void Despesa_mensal_so_alerta_a_partir_de_30_por_cento_e_5_euros_e_com_2_pagamentos_anteriores()
    {
        Assert.Empty(GastosAnormais.DespesasFixas([Pagamento("2026-08", 100), Pagamento("2026-09", 100), Pagamento("2026-10", 129)], "2026-10")); // 29 %
        Assert.Single(GastosAnormais.DespesasFixas([Pagamento("2026-08", 100), Pagamento("2026-09", 100), Pagamento("2026-10", 130)], "2026-10")); // 30 %
        Assert.Empty(GastosAnormais.DespesasFixas([Pagamento("2026-08", 10), Pagamento("2026-09", 10), Pagamento("2026-10", 14)], "2026-10")); // +40 %, mas só 4 €
        Assert.Empty(GastosAnormais.DespesasFixas([Pagamento("2026-09", 100), Pagamento("2026-10", 300)], "2026-10")); // um só mês antes
    }

    [Fact]
    public void Pagamentos_parciais_nao_contam()
    {
        PagamentoFixa[] pagamentos =
        [
            Pagamento("2026-08", 100), Pagamento("2026-09", 100),
            Pagamento("2026-10", 200, parcial: true), // só uma parte
        ];
        Assert.Empty(GastosAnormais.DespesasFixas(pagamentos, "2026-10"));
        // Um mês anterior parcial não estraga a média
        Assert.Single(GastosAnormais.DespesasFixas([Pagamento("2026-07", 20, parcial: true), Pagamento("2026-08", 100), Pagamento("2026-09", 100), Pagamento("2026-10", 200)], "2026-10"));
    }

    [Fact]
    public void Cada_despesa_mensal_compara_so_com_o_seu_historico()
    {
        PagamentoFixa[] pagamentos =
        [
            Pagamento("2026-08", 100, "agua"), Pagamento("2026-09", 100, "agua"), Pagamento("2026-10", 100, "agua"),
            Pagamento("2026-08", 40, "luz"), Pagamento("2026-09", 40, "luz"), Pagamento("2026-10", 80, "luz"),
        ];
        var d = Assert.Single(GastosAnormais.DespesasFixas(pagamentos, "2026-10"));
        Assert.Equal("luz", d.FixaId);
    }

    // ---- Gastos isolados ----

    private static DespesaExtra[] HistoricoDeRestaurantes() =>
    [
        Extra("2026-07", 10), Extra("2026-07", 12), Extra("2026-08", 11), Extra("2026-08", 9), Extra("2026-09", 10), Extra("2026-09", 12),
    ];

    [Fact]
    public void Um_gasto_recente_3_vezes_acima_do_tipico_da_categoria_e_incomum()
    {
        var grande = Extra("2026-10", 120, dia: 24);
        var incomum = Assert.Single(GastosAnormais.Isolados([.. HistoricoDeRestaurantes(), grande], new DateOnly(2026, 10, 25)));

        Assert.Equal((grande.Id, 120m, 10.5m), (incomum.Id, incomum.Valor, incomum.Mediana)); // a mediana de 9, 10, 10, 11, 12, 12
    }

    [Fact]
    public void Gastos_incomuns_precisam_de_historico_valor_minimo_e_serem_recentes()
    {
        var hoje = new DateOnly(2026, 10, 25);
        // Pouco histórico (4 gastos): não se sabe o que é típico
        Assert.Empty(GastosAnormais.Isolados([.. HistoricoDeRestaurantes().Take(4), Extra("2026-10", 120, dia: 24)], hoje));
        // Abaixo de 50 € nunca é incomum
        Assert.Empty(GastosAnormais.Isolados([.. HistoricoDeRestaurantes(), Extra("2026-10", 45, dia: 24)], hoje));
        // Com um típico de 30 €, só a partir de 90 € (3 vezes) é incomum
        DespesaExtra[] caros = [Extra("2026-07", 30), Extra("2026-07", 30), Extra("2026-08", 30), Extra("2026-08", 30), Extra("2026-09", 30), Extra("2026-09", 30)];
        Assert.Empty(GastosAnormais.Isolados([.. caros, Extra("2026-10", 89, dia: 24)], hoje));
        Assert.Single(GastosAnormais.Isolados([.. caros, Extra("2026-10", 90, dia: 24)], hoje));
        // Demasiado antigo (há 5 dias)
        Assert.Empty(GastosAnormais.Isolados([.. HistoricoDeRestaurantes(), Extra("2026-10", 120, dia: 20)], hoje));
        // Gerado por um gasto recorrente
        Assert.Empty(GastosAnormais.Isolados([.. HistoricoDeRestaurantes(), Extra("2026-10", 120, dia: 24, recorrente: "r")], hoje));
        // Hoje, ontem e anteontem contam
        Assert.Single(GastosAnormais.Isolados([.. HistoricoDeRestaurantes(), Extra("2026-10", 120, dia: 25)], hoje));
        Assert.Single(GastosAnormais.Isolados([.. HistoricoDeRestaurantes(), Extra("2026-10", 120, dia: 23)], hoje));
        Assert.Empty(GastosAnormais.Isolados([.. HistoricoDeRestaurantes(), Extra("2026-10", 120, dia: 22)], hoje));
    }

    [Fact]
    public void O_tipico_de_cada_categoria_e_independente()
    {
        // 120 € em restauração é incomum, mas em "casa" (onde o típico é alto) não
        var casa = Enumerable.Range(0, 6).Select(i => Extra(i < 3 ? "2026-08" : "2026-09", 110, "casa")).ToList();
        var resultado = GastosAnormais.Isolados([.. HistoricoDeRestaurantes(), .. casa, Extra("2026-10", 120, "restauracao", 24), Extra("2026-10", 120, "casa", 24)], new DateOnly(2026, 10, 25));
        Assert.Equal(["restauracao"], resultado.Select(g => g.Categoria));
    }
}

public class GastosAnormaisAlertasTests : TestesServicos
{
    private IAlertasService Alertas => A.Servico<IAlertasService>();

    protected override Task PrepararAsync()
    {
        HojeE(2026, 10, 25);
        return Task.CompletedTask;
    }

    // Um de cada vez: o contexto da base de dados não aceita pedidos em paralelo
    private async Task Historico(string categoria, params (DateOnly Data, decimal Valor)[] gastos)
    {
        foreach (var g in gastos)
        {
            await Extras.AdicionarHistoricaAsync(Uid, new DespesaHistoricaPedido($"Gasto {Guid.NewGuid():N}", g.Valor, g.Data, categoria));
        }
    }

    private async Task<IReadOnlyList<AlertaDto>> Anormais() =>
        [.. (await Alertas.ListarAsync(Uid)).Where(a => a.Tipo is TipoAlerta.CategoriaAcimaDaMedia or TipoAlerta.DespesaFixaSubiu or TipoAlerta.GastoIncomum)];

    [Fact]
    public async Task Sem_historico_nao_ha_alertas_de_gastos_fora_do_normal()
    {
        await Adicionar(5000);
        await AdicionarExtra("Jantar", 500, Dia(2026, 10, 24));
        Assert.Empty(await Anormais());
    }

    [Fact]
    public async Task Uma_categoria_acima_da_media_da_um_aviso_com_os_valores()
    {
        await Adicionar(5000);
        await Historico("lazer", (Dia(2026, 8, 5), 100), (Dia(2026, 9, 5), 100));
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Concerto", 180, Dia(2026, 10, 10), "lazer"));

        var alerta = Assert.Single(await Anormais());

        Assert.Equal((TipoAlerta.CategoriaAcimaDaMedia, SeveridadeAlerta.Aviso, "lazer"), (alerta.Tipo, alerta.Severidade, alerta.Referencia));
        Assert.Equal("Lazer acima do habitual: +80%", alerta.Titulo);
        Assert.Equal("Este mês já gastaste 180,00 € em Lazer. Nos últimos meses a média foi 100,00 €.", alerta.Mensagem);
    }

    [Fact]
    public async Task A_eletricidade_que_subiu_da_um_aviso_na_data_do_pagamento()
    {
        await Adicionar(5000);
        var luz = await AdicionarFixa("Eletricidade", 63, diaDebito: 5);
        foreach (var (mes, valor) in new[] { ("2026-08", 45m), ("2026-09", 45m) })
        {
            await Fixas.RegistarPagamentoHistoricoAsync(Uid, mes, luz, new RegistarPagamentoPedido("Eletricidade", valor, new DateOnly(int.Parse(mes[..4]), int.Parse(mes[5..]), 5)));
        }

        await CalcularSaldoDisponivel(); // paga a de outubro: 63 €

        var alerta = Assert.Single(await Anormais());
        Assert.Equal((TipoAlerta.DespesaFixaSubiu, luz, new DateOnly(2026, 10, 25)), (alerta.Tipo, alerta.Referencia, alerta.Data));
        Assert.Equal("Eletricidade subiu 40%", alerta.Titulo);
        Assert.Equal("Este mês pagaste 63,00 € em Eletricidade. A média dos últimos meses foi 45,00 €.", alerta.Mensagem);
    }

    [Fact]
    public async Task Um_gasto_isolado_muito_grande_da_um_aviso_e_so_nos_ultimos_dias()
    {
        await Adicionar(5000);
        await Historico(
            "restauracao",
            (Dia(2026, 7, 3), 10), (Dia(2026, 7, 9), 12), (Dia(2026, 8, 3), 11), (Dia(2026, 8, 9), 9), (Dia(2026, 9, 3), 10), (Dia(2026, 9, 9), 12));
        var grande = await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Jantar de grupo", 120, Dia(2026, 10, 24), "restauracao"));

        var alerta = Assert.Single(await Anormais(), a => a.Tipo == TipoAlerta.GastoIncomum);
        Assert.Equal((grande, new DateOnly(2026, 10, 24)), (alerta.Referencia, alerta.Data));
        Assert.Equal("Gasto fora do normal: Jantar de grupo", alerta.Titulo);
        Assert.Equal("Gastaste 120,00 € em Jantar de grupo (Restauração). O habitual nesta categoria são cerca de 10,50 €.", alerta.Mensagem);

        // Daqui a uma semana já não é "recente"
        HojeE(2026, 11, 1);
        Assert.DoesNotContain(await Anormais(), a => a.Tipo == TipoAlerta.GastoIncomum);
    }

    [Fact]
    public async Task Os_alertas_de_gastos_fora_do_normal_ficam_limitados()
    {
        await Adicionar(50000);
        foreach (var categoria in new[] { "lazer", "saude", "casa", "compras", "viagens" })
        {
            await Historico(categoria, (Dia(2026, 8, 5), 100), (Dia(2026, 9, 5), 100));
            await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido($"Gasto de {categoria}", 200, Dia(2026, 10, 10), categoria));
        }

        Assert.Equal(3, (await Anormais()).Count(a => a.Tipo == TipoAlerta.CategoriaAcimaDaMedia)); // as 3 maiores
    }

    [Fact]
    public async Task Em_ingles_os_alertas_vem_traduzidos()
    {
        await Adicionar(5000);
        await Historico("lazer", (Dia(2026, 8, 5), 100), (Dia(2026, 9, 5), 100));
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Concerto", 180, Dia(2026, 10, 10), "lazer"));

        Textos.Linguagem = "en";
        try
        {
            var alerta = Assert.Single(await Anormais());
            Assert.Equal("Leisure above usual: +80%", alerta.Titulo);
            Assert.Equal("This month you have already spent 180.00 € on Leisure. Over the last months the average was 100.00 €.", alerta.Mensagem);
        }
        finally
        {
            Textos.Linguagem = "pt";
        }
    }
}
