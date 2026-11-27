using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// A previsão do cartão de alimentação, à parte da conta: os gastos pagos com o cartão não entram na previsão
// da conta e têm a sua própria (saldo + o que ainda carrega - o que se prevê gastar).
public class CartaoPrevisaoRegrasTests
{
    private static DateOnly Dia(int ano, int mes, int dia) => new(ano, mes, dia);

    private static DespesaExtra E(decimal valor, DateOnly data, MeioPagamento meio, string? recorrente = null) => new()
    {
        UtilizadorId = "u",
        Id = Guid.NewGuid().ToString("N"),
        Titulo = "x",
        Valor = valor,
        Data = data,
        Mes = Meses.De(data),
        MeioPagamento = meio,
        GastoRecorrenteId = recorrente,
    };

    private static GastoRecorrente R(string id, decimal valor, MeioPagamento meio, int diaSemana) => new()
    {
        UtilizadorId = "u",
        Id = id,
        Titulo = id,
        Valor = valor,
        Frequencia = Frequencia.Semanal,
        DiaSemana = diaSemana,
        Inicio = Dia(2026, 1, 5),
        MeioPagamento = meio,
        Ativo = true,
        CriadoEm = DateTimeOffset.UnixEpoch,
    };

    [Fact]
    public void So_os_gastos_pagos_com_o_cartao_dao_a_media_e_os_recorrentes_do_cartao_somam_as_repeticoes_que_faltam()
    {
        var hoje = Dia(2026, 10, 15); // quinta-feira: faltam 16 dias; segundas 19 e 26
        var extras = new[]
        {
            E(92, Dia(2026, 7, 10), MeioPagamento.CartaoAlimentacao),
            E(92, Dia(2026, 8, 10), MeioPagamento.CartaoAlimentacao),
            E(92, Dia(2026, 9, 10), MeioPagamento.CartaoAlimentacao),
            E(1000, Dia(2026, 8, 12), MeioPagamento.Conta), // da conta: não conta no cartão
            E(40, Dia(2026, 9, 14), MeioPagamento.CartaoAlimentacao, recorrente: "almoco"), // de um recorrente ativo: entra pelas repetições
        };
        var recorrentes = new[]
        {
            R("almoco", 4, MeioPagamento.CartaoAlimentacao, diaSemana: 1),
            R("ginasio", 30, MeioPagamento.Conta, diaSemana: 1), // da conta: não conta no cartão
        };

        var e = Calculos.EstimarGastosCartaoAteFimDoMes(extras, recorrentes, hoje);

        // 276 € em 92 dias = 3 €/dia × 16 dias = 48, mais 2 segundas × 4 €
        Assert.Equal(3m, e.MediaDiaria);
        Assert.Equal(8m, e.Recorrentes);
        Assert.Equal(56m, e.Estimativa);
    }

    [Fact]
    public void Sem_gastos_com_o_cartao_nao_ha_estimativa()
    {
        var e = Calculos.EstimarGastosCartaoAteFimDoMes([E(50, Dia(2026, 9, 10), MeioPagamento.Conta)], [], Dia(2026, 10, 15));
        Assert.Equal(new EstimativaCartao(0m, 0m, 0m), e);
    }

    [Fact]
    public void Sem_historico_usa_o_ritmo_deste_mes()
    {
        // 30 € nos primeiros 10 dias = 3 €/dia, 21 dias por vir
        var e = Calculos.EstimarGastosCartaoAteFimDoMes([E(30, Dia(2026, 10, 3), MeioPagamento.CartaoAlimentacao)], [], Dia(2026, 10, 10));
        Assert.Equal((3m, 63m), (e.MediaDiaria, e.Estimativa));
    }

    private static ConfiguracaoSalario Salario(int dia, DateTimeOffset? recebidoEm = null) =>
        new() { Valor = "1500", DiaRecebimento = dia, CartaoAlimentacao = "150", RecebidoEm = recebidoEm };

    [Fact]
    public void O_cartao_ainda_vai_carregar_se_o_dia_do_salario_nao_chegou_e_o_salario_deste_mes_nao_entrou()
    {
        var fuso = TimeZoneInfo.Utc;
        Assert.Equal(150m, Calculos.CartaoPorReceber(Salario(25), Dia(2026, 10, 15), fuso));
        Assert.Equal(0m, Calculos.CartaoPorReceber(Salario(10), Dia(2026, 10, 15), fuso)); // o dia já passou
        Assert.Equal(0m, Calculos.CartaoPorReceber(Salario(15), Dia(2026, 10, 15), fuso)); // hoje: processa-se à parte
        Assert.Equal(0m, Calculos.CartaoPorReceber(Salario(25, new DateTimeOffset(2026, 10, 2, 9, 0, 0, TimeSpan.Zero)), Dia(2026, 10, 15), fuso)); // já entrou
        Assert.Equal(150m, Calculos.CartaoPorReceber(Salario(25, new DateTimeOffset(2026, 9, 25, 9, 0, 0, TimeSpan.Zero)), Dia(2026, 10, 15), fuso)); // entrou em setembro
        Assert.Equal(0m, Calculos.CartaoPorReceber(null, Dia(2026, 10, 15), fuso));
    }
}

public class CartaoPrevisaoServicoTests : TestesServicos
{
    private IEstatisticasService Estatisticas => A.Servico<IEstatisticasService>();

    [Fact]
    public async Task Sem_cartao_a_previsao_nao_traz_o_cartao()
    {
        await Adicionar(500);

        Assert.Null((await Estatisticas.PrevisaoAsync(Uid)).Cartao);
    }

    [Fact]
    public async Task Sem_cartao_no_salario_nao_traz_o_cartao_mesmo_com_saldo_ou_gastos_com_ele()
    {
        await Adicionar(1000);
        await Salario.GuardarAsync(Uid, new GuardarSalarioPedido("1500", 25, null)); // sem cartão de alimentação
        await Conta.DefinirCartaoAlimentacaoAsync(Uid, 60);
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Almoço", 20, null, "restauracao", MeioPagamento.CartaoAlimentacao));

        Assert.Null((await Estatisticas.PrevisaoAsync(Uid)).Cartao);
    }

    [Fact]
    public async Task O_cartao_tem_a_sua_previsao_e_os_gastos_com_ele_nao_entram_na_da_conta()
    {
        await Adicionar(1000);
        await Salario.GuardarAsync(Uid, new GuardarSalarioPedido("1500", 25, "150"));
        await Conta.DefinirCartaoAlimentacaoAsync(Uid, 60);
        // Hoje é dia 5: 20 € no cartão em 5 dias = 4 €/dia, 26 dias por vir = 104 €
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Almoço", 20, null, "restauracao", MeioPagamento.CartaoAlimentacao));

        var p = await Estatisticas.PrevisaoAsync(Uid);

        // Os 20 € do cartão não contam na estimativa de gastos da conta
        Assert.Equal(0m, p.EstimativaGastos);
        var cartao = Assert.IsType<PrevisaoCartaoDto>(p.Cartao);
        Assert.Equal(40m, cartao.Saldo); // 60 - 20
        Assert.Equal(150m, cartao.CargaPorReceber); // o salário é dia 25
        Assert.Equal(4m, cartao.MediaDiaria);
        Assert.Equal(104m, cartao.EstimativaGastos);
        Assert.Equal(86m, cartao.PrevisaoFinal); // 40 + 150 - 104
        Assert.Equal(0m, cartao.Falta);
    }

    [Fact]
    public async Task Se_o_cartao_nao_chegar_diz_quanto_teria_de_sair_da_conta()
    {
        await Adicionar(1000);
        await Salario.GuardarAsync(Uid, new GuardarSalarioPedido("1500", 1, "100")); // dia 1: já passou, não carrega mais
        await Conta.DefinirCartaoAlimentacaoAsync(Uid, 50);
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Almoço", 20, null, "restauracao", MeioPagamento.CartaoAlimentacao));

        var cartao = Assert.IsType<PrevisaoCartaoDto>((await Estatisticas.PrevisaoAsync(Uid)).Cartao);

        Assert.Equal((30m, 0m, 104m), (cartao.Saldo, cartao.CargaPorReceber, cartao.EstimativaGastos));
        Assert.Equal(-74m, cartao.PrevisaoFinal);
        Assert.Equal(74m, cartao.Falta);
    }
}
