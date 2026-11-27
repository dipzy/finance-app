using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// Análise: comparação com o mês anterior e previsão do fim do mês. Primeiro as regras puras
// (Calculos, com datas fixas), depois os serviços com a DAL verdadeira (SQLite em memória, FakeTimeProvider).
public class AnaliseCalculosTests
{
    private static DespesaExtra E(decimal valor, DateOnly? data, string? categoria = null, MeioPagamento meio = MeioPagamento.Conta, string? recorrente = null) => new()
    {
        UtilizadorId = "u",
        Id = Guid.NewGuid().ToString("N"),
        Titulo = "x",
        Valor = valor,
        Data = data,
        Mes = data is { } d ? Meses.De(d) : null,
        Categoria = categoria,
        MeioPagamento = meio,
        GastoRecorrenteId = recorrente,
    };

    private static GastoRecorrente R(
        string id,
        decimal valor,
        Frequencia frequencia,
        DateOnly inicio,
        int? diaSemana = null,
        int? diaMes = null,
        DateOnly? fim = null,
        bool ativo = true,
        MeioPagamento meio = MeioPagamento.Conta) => new()
    {
        UtilizadorId = "u",
        Id = id,
        Titulo = id,
        Valor = valor,
        Frequencia = frequencia,
        DiaSemana = diaSemana,
        DiaMes = diaMes,
        Inicio = inicio,
        Fim = fim,
        Ativo = ativo,
        MeioPagamento = meio,
    };

    private static DateOnly Dia(int ano, int mes, int dia) => new(ano, mes, dia);

    // ---- Comparação ----

    [Theory]
    [InlineData(120, 100, 20)]
    [InlineData(50, 100, -50)]
    [InlineData(100, 30, 233.3)]
    [InlineData(0, 40, -100)]
    public void Variacao_em_percentagem_com_uma_casa(decimal atual, decimal anterior, decimal variacao) =>
        Assert.Equal(variacao, Calculos.Variacao(atual, anterior));

    [Fact]
    public void Sem_valor_no_mes_anterior_a_variacao_e_null()
    {
        Assert.Null(Calculos.Variacao(10, 0));
        Assert.Null(Calculos.Variacao(0, 0));
        Assert.Equal(new Comparacao(24.1m, 0, 24.1m, null), Calculos.Comparar(24.1m, 0));
        Assert.Equal(new Comparacao(10, 12.5m, -2.5m, -20m), Calculos.Comparar(10, 12.5m));
    }

    [Fact]
    public void Categorias_ordenadas_pela_maior_diferenca_a_subir_ou_a_descer()
    {
        var comparacao = Calculos.CompararCategorias(
            [new GastoCategoria("restauracao", 158, 5), new GastoCategoria("supermercado", 200, 4), new GastoCategoria("lazer", 30, 1)],
            [new GastoCategoria("restauracao", 134, 4), new GastoCategoria("supermercado", 260, 5), new GastoCategoria("transportes", 30, 2)]);

        Assert.Equal(
            new[]
            {
                new ComparacaoCategoria("supermercado", 200, 260, -60, -23.1m),
                // Empate de 30 €: pela ordem das categorias (transportes antes de lazer)
                new ComparacaoCategoria("transportes", 0, 30, -30, -100),
                new ComparacaoCategoria("lazer", 30, 0, 30, null),
                new ComparacaoCategoria("restauracao", 158, 134, 24, 17.9m),
            },
            comparacao);
    }

    [Fact]
    public void Ate_ao_dia_corta_os_gastos_depois_desse_dia_e_os_sem_data()
    {
        var extras = new[] { E(1, Dia(2026, 9, 1)), E(2, Dia(2026, 9, 15)), E(4, Dia(2026, 9, 16)), E(8, null) };
        Assert.Equal(3, Calculos.AteAoDia(extras, 15).Sum(e => e.Valor));
        // 31 de outubro contra setembro (30 dias): setembro inteiro
        Assert.Equal(7, Calculos.AteAoDia(extras, 31).Sum(e => e.Valor));
    }

    // ---- Previsão ----

    [Fact]
    public void Media_dos_ultimos_tres_meses_completos_mais_os_recorrentes_que_faltam()
    {
        var hoje = Dia(2026, 10, 15); // quinta-feira
        var extras = new[]
        {
            E(500, Dia(2026, 6, 20)), // antes dos 3 meses: não conta
            E(310, Dia(2026, 7, 10)),
            E(300, Dia(2026, 8, 31)),
            E(310, Dia(2026, 9, 1)),
            E(80, Dia(2026, 9, 5), meio: MeioPagamento.CartaoAlimentacao), // não sai da conta
            E(45, Dia(2026, 9, 7), recorrente: "ginasio"), // do recorrente ativo: entra pelas repetições
            E(12, Dia(2026, 9, 8), recorrente: "apagado"), // de um recorrente que já não existe: conta na média
            E(99, Dia(2026, 10, 2)), // deste mês: não conta na média
        };
        var recorrentes = new[]
        {
            R("ginasio", 5, Frequencia.Semanal, Dia(2026, 1, 5), diaSemana: 1), // segundas: 19 e 26
            R("almoco", 7, Frequencia.Diaria, Dia(2026, 9, 1), meio: MeioPagamento.CartaoAlimentacao), // cartão: não conta
            R("pausa", 3, Frequencia.Diaria, Dia(2026, 9, 1), ativo: false),
            R("curto", 1, Frequencia.Diaria, Dia(2026, 10, 1), fim: Dia(2026, 10, 20)), // 16 a 20
            R("renda-garagem", 3, Frequencia.Mensal, Dia(2026, 1, 31), diaMes: 31), // 31 de outubro
            R("futuro", 2, Frequencia.Diaria, Dia(2026, 10, 30)), // 30 e 31
        };

        var e = Calculos.EstimarGastosAteFimDoMes(extras, recorrentes, hoje);

        // (310 + 300 + 310 + 12) / 92 dias = 10,1304...
        Assert.Equal(10.13m, e.MediaDiaria);
        Assert.Equal(16, e.DiasRestantes);
        Assert.Equal(10 + 5 + 3 + 4, e.Recorrentes);
        Assert.Equal(Calculos.Centimos(932m / 92 * 16) + 22, e.Estimativa); // 162,09 + 22
        Assert.Equal(184.09m, e.Estimativa);
        Assert.Equal(3, e.MesesBase);
    }

    [Fact]
    public void A_estimativa_reparte_se_por_categoria_e_a_soma_e_o_total()
    {
        var hoje = Dia(2026, 10, 15); // quinta-feira: faltam 16 dias
        // Julho a setembro: 92 dias
        var extras = new[]
        {
            E(184, Dia(2026, 8, 10), "restauracao"),
            E(92, Dia(2026, 9, 10), "lazer"),
            E(92, Dia(2026, 7, 10)), // sem categoria: "outros"
        };
        var ginasio = R("ginasio", 5, Frequencia.Semanal, Dia(2026, 1, 5), diaSemana: 1); // segundas: 19 e 26
        ginasio.Categoria = "lazer";

        var e = Calculos.EstimarGastosAteFimDoMes(extras, [ginasio], hoje);

        // restauração 184/92 × 16 = 32; lazer 92/92 × 16 + 10 do ginásio = 26; outros 92/92 × 16 = 16
        Assert.Equal(
            new[] { new EstimativaCategoria("restauracao", 32), new EstimativaCategoria("lazer", 26), new EstimativaCategoria("outros", 16) },
            e.PorCategoria);
        Assert.Equal(e.Estimativa, e.PorCategoria!.Sum(c => c.Estimativa));
        Assert.Equal(74, e.Estimativa);

        // Num mês inteiro (outubro tem 31 dias): restauração 184/92 × 31 = 62; lazer 31 + 4 segundas de ginásio (5, 12, 19 e 26) = 51; outros 31
        Assert.Equal(
            new[] { new EstimativaCategoria("restauracao", 62), new EstimativaCategoria("lazer", 51), new EstimativaCategoria("outros", 31) },
            e.PorCategoriaDoMes);
    }

    [Fact]
    public void Sem_gastos_nem_recorrentes_nao_ha_categorias()
    {
        var e = Calculos.EstimarGastosAteFimDoMes([], [], Dia(2026, 10, 15));
        Assert.Empty(e.PorCategoria!);
    }

    [Fact]
    public void Com_menos_historico_a_media_usa_so_os_meses_que_ha()
    {
        var hoje = Dia(2026, 10, 10);
        var e = Calculos.EstimarGastosAteFimDoMes([E(300, Dia(2026, 9, 12)), E(50, Dia(2026, 10, 1))], [], hoje);
        Assert.Equal(1, e.MesesBase);
        Assert.Equal(10, e.MediaDiaria); // 300 / 30 dias de setembro
        Assert.Equal(21, e.DiasRestantes);
        Assert.Equal(210, e.Estimativa);
    }

    [Fact]
    public void Sem_historico_usa_o_ritmo_deste_mes()
    {
        var hoje = Dia(2026, 10, 4);
        var e = Calculos.EstimarGastosAteFimDoMes([E(30, Dia(2026, 10, 1)), E(10, Dia(2026, 10, 4)), E(99, Dia(2026, 10, 6))], [], hoje);
        Assert.Equal(0, e.MesesBase);
        Assert.Equal(10, e.MediaDiaria); // 40 € em 4 dias (o de dia 6 ainda não aconteceu)
        Assert.Equal(27, e.DiasRestantes);
        Assert.Equal(270, e.Estimativa);

        var vazio = Calculos.EstimarGastosAteFimDoMes([], [], hoje);
        Assert.Equal((0m, 0m, 0), (vazio.MediaDiaria, vazio.Estimativa, vazio.MesesBase));
    }

    [Theory]
    [InlineData(2026, 10, 31, 0)] // último dia: já não falta nada
    [InlineData(2026, 2, 28, 0)]
    [InlineData(2028, 2, 28, 1)] // ano bissexto: ainda falta o dia 29
    [InlineData(2026, 4, 30, 0)]
    [InlineData(2026, 12, 1, 30)]
    public void Fim_do_mes(int ano, int mes, int dia, int diasRestantes)
    {
        var hoje = Dia(ano, mes, dia);
        var recorrentes = new[] { R("cafe", 1, Frequencia.Diaria, Dia(2025, 1, 1)) };
        var e = Calculos.EstimarGastosAteFimDoMes([E(10, Dia(2025, 1, 1))], recorrentes, hoje);
        Assert.Equal(diasRestantes, e.DiasRestantes);
        // O café diário só conta os dias que faltam (nunca os do mês seguinte)
        Assert.Equal(diasRestantes, e.Recorrentes);
        Assert.Equal(3, e.MesesBase);
    }

    [Fact]
    public void Em_janeiro_os_tres_meses_sao_os_do_ano_anterior()
    {
        var hoje = Dia(2027, 1, 10);
        var e = Calculos.EstimarGastosAteFimDoMes([E(920, Dia(2026, 10, 1)), E(1000, Dia(2026, 9, 30))], [], hoje);
        Assert.Equal(3, e.MesesBase);
        Assert.Equal(10, e.MediaDiaria); // 920 / (31 + 30 + 31)
        Assert.Equal(21, e.DiasRestantes);
    }
}

public class AnaliseServicosTests : TestesServicos
{
    // "Hoje" = 5 de outubro de 2026 (segunda-feira)
    private IEstatisticasService Estatisticas => A.Servico<IEstatisticasService>();
    private IGastosRecorrentesService Recorrentes => A.Servico<IGastosRecorrentesService>();

    private Task<string> Gasto(string titulo, decimal valor, DateOnly data, string categoria) =>
        Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido(titulo, valor, data, categoria));

    [Fact]
    public async Task No_mes_atual_compara_com_o_mes_anterior_ate_ao_mesmo_dia()
    {
        await Adicionar(2000);
        await AdicionarFixa("Renda", 500);
        await Gasto("Jantar", 20, Dia(2026, 9, 3), "restauracao");
        await Gasto("Jantar grande", 100, Dia(2026, 9, 20), "restauracao"); // depois do dia 5: fora
        await Gasto("Continente", 60, Dia(2026, 9, 5), "supermercado");
        await Gasto("Jantar", 44, Dia(2026, 10, 2), "restauracao");
        await Gasto("Cinema", 12, Dia(2026, 10, 4), "lazer");

        var c = await Estatisticas.ComparacaoAsync(Uid, null);

        Assert.Equal(("2026-10", "2026-09", (int?)5), (c.Mes, c.MesAnterior, c.AteDia));
        Assert.Equal(new ComparacaoValorDto(56, 80, -24, -30), c.GastosDiaADia);
        Assert.Equal(500, c.DespesasFixas.Atual);
        Assert.Equal(
            new[]
            {
                new ComparacaoCategoriaDto("supermercado", 0, 60, -60, -100),
                new ComparacaoCategoriaDto("restauracao", 44, 20, 24, 120),
                new ComparacaoCategoriaDto("lazer", 12, 0, 12, null),
            },
            c.Categorias);
    }

    [Fact]
    public async Task Num_mes_passado_compara_meses_completos()
    {
        await Adicionar(2000);
        await Gasto("Jantar", 20, Dia(2026, 8, 3), "restauracao");
        await Gasto("Jantar", 30, Dia(2026, 8, 30), "restauracao");
        await Gasto("Jantar", 25, Dia(2026, 9, 29), "restauracao");

        var c = await Estatisticas.ComparacaoAsync(Uid, "2026-09");

        Assert.Equal(("2026-09", "2026-08", (int?)null), (c.Mes, c.MesAnterior, c.AteDia));
        Assert.Equal(new ComparacaoValorDto(25, 50, -25, -50), c.GastosDiaADia);
        Assert.Equal(new ComparacaoCategoriaDto("restauracao", 25, 50, -25, -50), Assert.Single(c.Categorias));

        // Cada utilizador só vê os seus gastos; um mês futuro não tem comparação
        Assert.Empty((await Estatisticas.ComparacaoAsync("outro", "2026-09")).Categorias);
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Estatisticas.ComparacaoAsync(Uid, "2026-11"));
    }

    [Fact]
    public async Task Previsao_conta_com_as_fixas_por_pagar_a_media_e_os_recorrentes()
    {
        await AdicionarFixa("Renda", 300);
        await AdicionarExtra("Coisas", 310, Dia(2026, 7, 10));
        await AdicionarExtra("Coisas", 310, Dia(2026, 8, 10));
        await AdicionarExtra("Coisas", 300, Dia(2026, 9, 10));
        // Às segundas: hoje já foi gerado; faltam 12, 19 e 26
        await Recorrentes.AdicionarAsync(Uid, new NovoGastoRecorrentePedido("Ginásio", 5, Frequencia.Semanal, DiaSemana: 1));
        await Conta.DefinirSaldoAsync(Uid, 1000);

        var p = await Estatisticas.PrevisaoAsync(Uid);

        Assert.Equal("2026-10", p.Mes);
        Assert.Equal(1000, p.SaldoAtual);
        Assert.Equal(300, p.PorPagarFixas);
        Assert.Equal(10, p.MediaDiaria); // 920 € / 92 dias
        Assert.Equal(26, p.DiasRestantes);
        Assert.Equal(15, p.GastosRecorrentes);
        Assert.Equal(275, p.EstimativaGastos);
        Assert.Equal(425, p.PrevisaoFinal);
        // A repartição por categoria (para o simulador da app) soma a estimativa
        Assert.Equal(p.EstimativaGastos, p.Categorias!.Sum(c => c.Estimativa));
        Assert.Equal(("3 meses", 3), (p.Base, p.MesesBase));
        // A previsão simples (só as fixas) continua a ser a dos saldos
        Assert.Equal(700, await CalcularSaldoPrevisto());
    }

    [Fact]
    public async Task Previsao_no_ultimo_dia_do_mes_e_o_saldo_menos_as_fixas()
    {
        HojeE(2026, 10, 31);
        await AdicionarFixa("Internet", 30);
        await AdicionarExtra("Café", 31, Dia(2026, 10, 20));
        await Conta.DefinirSaldoAsync(Uid, 500);

        var p = await Estatisticas.PrevisaoAsync(Uid);

        Assert.Equal((0, 0m), (p.DiasRestantes, p.EstimativaGastos));
        Assert.Equal(("este mês", 0), (p.Base, p.MesesBase));
        Assert.Equal(1, p.MediaDiaria); // 31 € em 31 dias
        Assert.Equal(470, p.PrevisaoFinal);
    }
}

// Poupanças com contribuição manual: "por enviar" / "enviada" e "Contar no previsto"
public class PoupancasPorEnviarTests : TestesServicos
{
    private IEstatisticasService Estatisticas => A.Servico<IEstatisticasService>();

    private static Poupanca P(string valor, bool automatica, bool contar, string? ultimoMes, TipoContribuicao tipo = TipoContribuicao.Valor) => new()
    {
        UtilizadorId = "u",
        Id = Guid.NewGuid().ToString("N"),
        Nome = "x",
        Tipo = tipo,
        Valor = valor,
        ContribuicaoAutomatica = automatica,
        ContarNoPrevisto = contar,
        UltimaContribuicaoMes = ultimoMes,
    };

    [Fact]
    public void So_as_manuais_por_enviar_que_contam_no_previsto_entram()
    {
        var poupancas = new[]
        {
            P("50", automatica: false, contar: true, ultimoMes: "2026-09"), // por enviar: conta
            P("10", automatica: false, contar: true, ultimoMes: null, tipo: TipoContribuicao.Percentagem), // 10% de 2000
            P("70", automatica: false, contar: true, ultimoMes: "2026-10"), // já enviada
            P("30", automatica: false, contar: false, ultimoMes: null), // não conta no previsto
            P("90", automatica: true, contar: true, ultimoMes: null), // automática: sai sozinha
        };
        Assert.Equal(250, Calculos.PoupancasPorEnviar(poupancas, "2026-10", 2000));
        Assert.True(Calculos.PorEnviarNoMes(poupancas[0], "2026-10"));
        Assert.False(Calculos.PorEnviarNoMes(poupancas[2], "2026-10"));

        var saldos = Calculos.CalcularSaldos(1000, [], [], "2026-10", 250);
        Assert.Equal(new Saldos(1000, 750, 0, 250), saldos);
    }

    [Fact]
    public async Task Previsto_e_previsao_descontam_a_contribuicao_manual_ate_ser_enviada()
    {
        await Adicionar(1000);
        var id = await Poupancas.AdicionarAsync(
            Uid,
            new NovaPoupancaPedido("PPR", TipoContribuicao.Valor, "50", 0, null, ContribuicaoAutomatica: false));

        var poupanca = Assert.Single(await Poupancas.ListarAsync(Uid));
        Assert.Equal((true, 50m, (DateOnly?)null), (poupanca.ContarNoPrevisto, poupanca.ValorMensal, poupanca.UltimaContribuicaoEm));
        var saldos = await Conta.CalcularSaldosAsync(Uid, null);
        Assert.Equal((1000m, 950m, 0m, 50m), (saldos.Disponivel, saldos.Previsto, saldos.PorPagar, saldos.PoupancasPorEnviar));
        var previsao = await Estatisticas.PrevisaoAsync(Uid);
        Assert.Equal((50m, 950m), (previsao.PoupancasPorEnviar, previsao.PrevisaoFinal)); // sem gastos: estimativa 0

        // Num mês passado não conta (só se sabe deste)
        Assert.Equal(0, (await Conta.CalcularSaldosAsync(Uid, "2026-09")).PoupancasPorEnviar);

        // "Contar no previsto" desligado: deixa de contar
        await Poupancas.AlterarAsync(Uid, id, new AlterarPoupancaPedido(null, null, null, null, ContarNoPrevisto: false));
        Assert.Equal(1000, await CalcularSaldoPrevisto());
        await Poupancas.AlterarAsync(Uid, id, new AlterarPoupancaPedido(null, null, null, null, ContarNoPrevisto: true));
        Assert.Equal(950, await CalcularSaldoPrevisto());

        // Enviada: sai da conta, fica a data e já não conta como por enviar
        Assert.Equal(ResultadoContribuicaoPoupanca.Adicionada, await Poupancas.ContribuirManualmenteAsync(Uid, id));
        var enviada = Assert.Single(await Poupancas.ListarAsync(Uid));
        Assert.Equal(("2026-10", (DateOnly?)Dia(2026, 10, 5)), (enviada.UltimaContribuicaoMes, enviada.UltimaContribuicaoEm));
        Assert.Equal(950, await CalcularSaldoPrevisto());
        Assert.Equal(0, (await Conta.CalcularSaldosAsync(Uid, null)).PoupancasPorEnviar);

        // No mês seguinte volta a estar por enviar
        HojeE(2026, 11, 2);
        Assert.Equal(50, (await Conta.CalcularSaldosAsync(Uid, null)).PoupancasPorEnviar);
    }
}
