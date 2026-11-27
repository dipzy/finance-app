using Financas.DAL.Entidades;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// Porte de __tests__/calculos.test.ts e da parte "regras (sem Firebase)" de __tests__/fase2.test.ts:
// os mesmos casos e os mesmos números. Funções puras: não há base de dados.
public class CalculosTests
{
    private static readonly DateOnly Outubro5 = new(2026, 10, 5);
    private const string Outubro = "2026-10";

    private static DespesaFixa Fixa(string id = "f", decimal valor = 600, Action<DespesaFixa>? ajustar = null)
    {
        var fixa = new DespesaFixa { UtilizadorId = "u", Id = id, Titulo = "Renda", Valor = valor, DiaDebito = 1 };
        ajustar?.Invoke(fixa);
        return fixa;
    }

    private static PagamentoFixa Pago(string fixaId, decimal valor, string mes = Outubro, EstadoPagamento estado = EstadoPagamento.Pago) => new()
    {
        UtilizadorId = "u",
        Id = PagamentoFixa.IdDe(mes, fixaId),
        FixaId = fixaId,
        Mes = mes,
        Titulo = fixaId,
        Valor = valor,
        Data = Meses.PrimeiroDia(mes),
        Estado = estado,
    };

    private static ConfiguracaoPprPoupanca Config(
        TipoContribuicao pprTipo = TipoContribuicao.Percentagem,
        string pprValor = "10",
        TipoContribuicao poupancaTipo = TipoContribuicao.Valor,
        string poupancaValor = "200") =>
        new() { PprTipo = pprTipo, PprValor = pprValor, PoupancaTipo = poupancaTipo, PoupancaValor = poupancaValor };

    private static readonly DadosFinanceirosAntigos Antigo = new() { Salario = "1000", PprPercentagem = "5", PoupancaPercentagem = "20" };

    // ---- meses ----

    [Fact]
    public void Meses_formato_AAAA_MM()
    {
        Assert.Equal("2026-10", Meses.De(Outubro5));
        Assert.Equal("2026-01", Meses.De(new DateOnly(2026, 1, 1)));
        Assert.True(Meses.EValido("2026-10"));
        Assert.False(Meses.EValido("2026-13"));
        Assert.False(Meses.EValido("2026-1"));
    }

    [Fact]
    public void Mes_seguinte_e_anterior_passando_o_ano()
    {
        Assert.Equal("2027-01", Meses.Seguinte("2026-12"));
        Assert.Equal("2025-12", Meses.Anterior("2026-01"));
        Assert.Equal("2026-11", Meses.Seguinte("2026-10"));
    }

    [Fact]
    public void Mes_de_uma_data_no_formato_atual_e_antigo()
    {
        Assert.Equal("2026-10", Meses.DaData("2026-10-05"));
        Assert.Equal("2026-09", Meses.DaData("28/09/2026"));
        Assert.Null(Meses.DaData((string?)null));
    }

    // ---- saldos ----

    [Fact]
    public void Saldo_Disponivel_e_sempre_a_conta_corrente() =>
        Assert.Equal(1234.56m, Calculos.CalcularSaldos(1234.56m, [], [], Outubro).Disponivel);

    [Fact]
    public void Saldo_Previsto_e_o_Disponivel_menos_as_despesas_mensais_por_pagar()
    {
        var fixas = new[] { Fixa("renda", 600), Fixa("luz", 45.1m), Fixa("net", 35) };
        var pagamentos = new[] { Pago("renda", 600) }; // já paga: já saiu da conta
        Assert.Equal(new Saldos(1000, 919.9m, 80.1m), Calculos.CalcularSaldos(1000, fixas, pagamentos, Outubro));
    }

    [Fact]
    public void Uma_despesa_paga_noutro_mes_volta_a_ficar_por_pagar() =>
        Assert.Equal(400, Calculos.CalcularSaldos(1000, [Fixa("renda")], [Pago("renda", 600, "2026-09")], Outubro).Previsto);

    [Fact]
    public void As_despesas_terminadas_ou_que_ainda_nao_comecaram_nao_contam()
    {
        var fixas = new[] { Fixa("velha", ajustar: f => f.Fim = "2026-09"), Fixa("nova", ajustar: f => f.Inicio = "2026-11"), Fixa("atual", 50) };
        Assert.Equal(50, Calculos.CalcularSaldos(1000, fixas, [], Outubro).PorPagar);
    }

    [Fact]
    public void Pagas_conta_o_valor_pago_mesmo_que_a_despesa_tenha_mudado_de_valor() =>
        Assert.Equal(new TotaisFixas(159.25m, 0, 159.25m), Calculos.SepararDespesasFixas([Fixa("dentista", 160)], [Pago("dentista", 159.25m)], Outubro));

    [Fact]
    public void Pagamento_parcial_conta_apenas_o_valor_restante_no_previsto()
    {
        var pagamento = Pago("renda", 40);
        pagamento.Parcial = true;
        var fixas = new[] { Fixa("renda", 100) };

        Assert.Equal(EstadoFixa.Parcial, Calculos.EstadoNoMes(fixas[0], [pagamento], Outubro));
        Assert.Equal(new TotaisFixas(40, 60, 100), Calculos.SepararDespesasFixas(fixas, [pagamento], Outubro));
        Assert.Equal(new Saldos(1000, 940, 60), Calculos.CalcularSaldos(1000, fixas, [pagamento], Outubro));
    }

    [Fact]
    public void Pagamentos_de_despesas_entretanto_terminadas_continuam_no_historico_do_mes() =>
        Assert.Equal(20, Calculos.SepararDespesasFixas([Fixa("ginasio", 20, f => f.Fim = Outubro)], [Pago("ginasio", 20)], Outubro).Debitadas);

    [Fact]
    public void Reconhece_os_pagamentos_guardados_pela_versao_anterior_na_propria_despesa()
    {
        var antiga = Fixa("renda", ajustar: f =>
        {
            f.Debitado = true;
            f.MesDebitado = Outubro;
        });
        Assert.Equal(EstadoFixa.Pago, Calculos.EstadoNoMes(antiga, [], Outubro));
        Assert.Equal(new TotaisFixas(600, 0, 600), Calculos.SepararDespesasFixas([antiga], [], Outubro));
        // "Anulado" da versão anterior: fica só por pagar
        Assert.Equal(EstadoFixa.PorPagar, Calculos.EstadoNoMes(Fixa(ajustar: f => f.AnuladoMes = Outubro), [], Outubro));
    }

    [Fact]
    public void Centimos_arredonda_e_nunca_devolve_menos_zero()
    {
        Assert.Equal(0.3m, Calculos.Centimos(0.1m + 0.2m));
        Assert.Equal("0.00", Calculos.Centimos(0.3m - 0.1m - 0.2m).ToString("0.00", System.Globalization.CultureInfo.InvariantCulture));
        Assert.Equal("0", Calculos.Centimos(-0.001m).ToString(System.Globalization.CultureInfo.InvariantCulture));
        Assert.Equal(12.35m, Calculos.Centimos(12.345m));
        Assert.Equal(127.6m, Calculos.Centimos(1276m * 0.1m));
    }

    // ---- PPR e Poupança (configuração antiga) ----

    [Fact]
    public void Percentagem_do_salario_ou_valor_fixo()
    {
        Assert.Equal(150, Calculos.CalcularPprComConfig(Config(), null, 1500));
        Assert.Equal(200, Calculos.CalcularPoupancaComConfig(Config(), null, 1500));
    }

    [Fact]
    public void Zero_e_mesmo_zero_por_cento_e_o_campo_vazio_usa_o_valor_por_defeito()
    {
        Assert.Equal(0, Calculos.CalcularPprComConfig(Config(pprValor: "0"), null, 1500));
        Assert.Equal(100, Calculos.CalcularPprComConfig(Config(pprValor: ""), null, 1000));
        Assert.Equal(150, Calculos.CalcularPoupancaComConfig(Config(poupancaTipo: TipoContribuicao.Percentagem, poupancaValor: ""), null, 1000));
    }

    [Fact]
    public void Sem_configuracao_usa_as_percentagens_da_versao_anterior()
    {
        Assert.Equal(50, Calculos.CalcularPprComConfig(null, Antigo, 1000));
        Assert.Equal(200, Calculos.CalcularPoupancaComConfig(null, Antigo, 1000));
    }

    [Fact]
    public void Aceita_virgula_decimal() => Assert.Equal(125, Calculos.CalcularPprComConfig(Config(pprValor: "12,5"), null, 1000));

    [Fact]
    public void Salario_base_o_configurado_ou_se_nao_houver_o_antigo()
    {
        Assert.Equal(1500, Calculos.ValorSalarioBase(new ConfiguracaoSalario { Valor = "1500", DiaRecebimento = 25 }, Antigo));
        Assert.Equal(1000, Calculos.ValorSalarioBase(null, Antigo));
        Assert.Equal(0, Calculos.ValorSalarioBase(null, null));
    }

    // ---- dia do salário ----

    private static readonly ConfiguracaoSalario Salario = new() { Valor = "1500", DiaRecebimento = 25 };

    private static DateTimeOffset EmLisboa(int ano, int mes, int dia, int hora) =>
        new(TimeZoneInfo.ConvertTimeToUtc(new DateTime(ano, mes, dia, hora, 0, 0), Ambiente.Lisboa));

    [Fact]
    public void Entra_o_salario_e_saem_logo_o_PPR_e_a_Poupanca()
    {
        var recebimento = Calculos.CalcularRecebimento(1500, Config(), null, null);
        Assert.Equal((1500m, 150m, 200m, 1150m), (recebimento.Salario, recebimento.Ppr, recebimento.Poupanca, recebimento.Liquido));
    }

    [Fact]
    public void So_no_dia_de_recebimento()
    {
        Assert.True(Calculos.DeveReceberSalario(Salario, new DateOnly(2026, 10, 25), Ambiente.Lisboa));
        Assert.False(Calculos.DeveReceberSalario(Salario, new DateOnly(2026, 10, 24), Ambiente.Lisboa));
        Assert.False(Calculos.DeveReceberSalario(Salario, new DateOnly(2026, 10, 26), Ambiente.Lisboa));
    }

    [Fact]
    public void So_uma_vez_por_mes()
    {
        var recebidoEsteMes = Salario with { RecebidoEm = EmLisboa(2026, 10, 25, 8) };
        var recebidoMesPassado = Salario with { RecebidoEm = EmLisboa(2026, 9, 25, 8) };
        Assert.False(Calculos.DeveReceberSalario(recebidoEsteMes, new DateOnly(2026, 10, 25), Ambiente.Lisboa));
        Assert.True(Calculos.DeveReceberSalario(recebidoMesPassado, new DateOnly(2026, 10, 25), Ambiente.Lisboa));
    }

    [Fact]
    public void O_mes_do_ultimo_recebimento_e_contado_em_Lisboa()
    {
        // 23:30 UTC de 31 de agosto = 00:30 de 1 de setembro em Lisboa: o salário de setembro já entrou
        var recebido = Salario with { DiaRecebimento = 1, RecebidoEm = new DateTimeOffset(2026, 8, 31, 23, 30, 0, TimeSpan.Zero) };
        Assert.False(Calculos.DeveReceberSalario(recebido, new DateOnly(2026, 9, 1), Ambiente.Lisboa));
    }

    [Fact]
    public void Dia_31_recebe_no_ultimo_dia_dos_meses_mais_curtos()
    {
        var dia31 = Salario with { DiaRecebimento = 31 };
        Assert.True(Calculos.DeveReceberSalario(dia31, new DateOnly(2026, 9, 30), Ambiente.Lisboa)); // setembro tem 30 dias
        Assert.True(Calculos.DeveReceberSalario(dia31, new DateOnly(2026, 2, 28), Ambiente.Lisboa)); // fevereiro de 2026 tem 28
        Assert.False(Calculos.DeveReceberSalario(dia31, new DateOnly(2026, 10, 30), Ambiente.Lisboa)); // outubro tem 31
        Assert.Equal(29, Calculos.DiaEfetivo(31, new DateOnly(2028, 2, 10))); // 2028 é bissexto
    }

    [Fact]
    public void Sem_configuracao_nao_recebe() => Assert.False(Calculos.DeveReceberSalario(null, Outubro5, Ambiente.Lisboa));

    // ---- débito das despesas mensais ----

    [Fact]
    public void A_mao_a_partir_do_dia_de_debito_sem_dia_definido_a_qualquer_altura()
    {
        Assert.True(Calculos.PodeDebitar(1, Outubro5));
        Assert.True(Calculos.PodeDebitar(5, Outubro5));
        Assert.False(Calculos.PodeDebitar(6, Outubro5));
        Assert.True(Calculos.PodeDebitar(null, Outubro5));
        Assert.True(Calculos.PodeDebitar(31, new DateOnly(2026, 9, 30))); // dia 31 em setembro passa para 30
    }

    [Fact]
    public void Automatico_so_com_dia_definido_ja_no_dia_a_contar_este_mes_e_sem_registo_este_mes()
    {
        Assert.True(Calculos.DeveDebitarAutomaticamente(Fixa(ajustar: f => f.DiaDebito = 1), [], Outubro5));
        Assert.False(Calculos.DeveDebitarAutomaticamente(Fixa(ajustar: f => f.DiaDebito = 10), [], Outubro5));
        Assert.False(Calculos.DeveDebitarAutomaticamente(Fixa(ajustar: f => f.DiaDebito = null), [], Outubro5));
        Assert.False(Calculos.DeveDebitarAutomaticamente(Fixa(), [Pago("f", 600)], Outubro5));
        Assert.False(Calculos.DeveDebitarAutomaticamente(Fixa(ajustar: f => f.Fim = "2026-09"), [], Outubro5));
        Assert.False(Calculos.DeveDebitarAutomaticamente(Fixa(ajustar: f =>
        {
            f.Debitado = true;
            f.MesDebitado = Outubro;
        }), [], Outubro5));
    }

    [Fact]
    public void Automatico_nao_acontece_com_o_debito_automatico_desligado_na_despesa()
    {
        Assert.True(Calculos.DeveDebitarAutomaticamente(Fixa(ajustar: f => f.DiaDebito = 1), [], Outubro5));
        Assert.False(Calculos.DeveDebitarAutomaticamente(Fixa(ajustar: f =>
        {
            f.DiaDebito = 1;
            f.DebitoAutomatico = false;
        }), [], Outubro5));
    }

    [Fact]
    public void Automatico_nao_volta_a_debitar_um_pagamento_desfeito_a_mao_este_mes_mas_no_mes_seguinte_sim()
    {
        var desfeita = Fixa(ajustar: f => f.NaoDebitarAutomaticamenteEm = Outubro);
        Assert.Equal(EstadoFixa.PorPagar, Calculos.EstadoNoMes(desfeita, [], Outubro));
        Assert.False(Calculos.DeveDebitarAutomaticamente(desfeita, [], Outubro5));
        Assert.True(Calculos.DeveDebitarAutomaticamente(desfeita, [], new DateOnly(2026, 11, 5)));
        Assert.False(Calculos.DeveDebitarAutomaticamente(Fixa(ajustar: f => f.AnuladoMes = Outubro), [], Outubro5));
    }

    [Fact]
    public void Despesa_ativa_no_mes()
    {
        Assert.True(Calculos.AtivaNoMes(Fixa(), Outubro)); // sem início (antiga): conta sempre
        Assert.False(Calculos.AtivaNoMes(Fixa(ajustar: f => f.Inicio = "2026-10"), "2026-09"));
        Assert.True(Calculos.AtivaNoMes(Fixa(ajustar: f =>
        {
            f.Inicio = "2026-10";
            f.Fim = "2026-12";
        }), "2026-12"));
        Assert.False(Calculos.AtivaNoMes(Fixa(ajustar: f => f.Fim = "2026-12"), "2027-01"));
    }

    // ---- Fase 2: poupanças em lista, despesas anuais e dívidas ----

    private static Poupanca NovaPoupanca(string id = "p", string nome = "Revolut/C.A", TipoContribuicao tipo = TipoContribuicao.Valor, string valor = "600") =>
        new() { UtilizadorId = "u", Id = id, Nome = nome, Tipo = tipo, Valor = valor, Saldo = 0 };

    [Fact]
    public void Contribuicao_valor_fixo_ou_percentagem_do_salario()
    {
        Assert.Equal(600, Calculos.ContribuicaoDe(TipoContribuicao.Valor, "600", 1276));
        Assert.Equal(127.6m, Calculos.ContribuicaoDe(TipoContribuicao.Percentagem, "10", 1276));
        Assert.Equal(50.5m, Calculos.ContribuicaoDe(TipoContribuicao.Valor, "50,5", 1276));
    }

    [Fact]
    public void Dia_do_salario_com_a_lista_de_poupancas()
    {
        var lista = new[] { NovaPoupanca("rev"), NovaPoupanca("ppr", "PPR", valor: "50") };
        var recebimento = Calculos.CalcularRecebimento(1276, null, null, lista);
        Assert.Equal((1276m, 50m, 600m, 626m), (recebimento.Salario, recebimento.Ppr, recebimento.Poupanca, recebimento.Liquido));
        Assert.Equal([new Contribuicao("rev", "Revolut/C.A", 600), new Contribuicao("ppr", "PPR", 50)], recebimento.Contribuicoes);
    }

    [Fact]
    public void Configuracao_antiga_convertida_em_lista_sem_configuracao_nao_cria_nada()
    {
        Assert.Equal(
            [new PoupancaNova("PPR", TipoContribuicao.Valor, "50", 0, 0), new PoupancaNova("Poupança", TipoContribuicao.Percentagem, "15", 0, 1)],
            Calculos.PoupancasDaConfigAntiga(Config(TipoContribuicao.Valor, "50", TipoContribuicao.Percentagem, "15"), null));
        Assert.Empty(Calculos.PoupancasDaConfigAntiga(null, null));
    }

    [Fact]
    public void Despesas_anuais_so_contam_no_seu_mes()
    {
        var seguro = new DespesaFixa
        {
            UtilizadorId = "u",
            Id = "s",
            Titulo = "Seguro Carro",
            Valor = 715.2m,
            Periodicidade = Periodicidade.Anual,
            MesAnual = 3,
            Inicio = "2026-01",
        };
        Assert.True(Calculos.AtivaNoMes(seguro, "2026-03"));
        Assert.True(Calculos.AtivaNoMes(seguro, "2027-03"));
        Assert.False(Calculos.AtivaNoMes(seguro, "2026-04"));
        seguro.MesAnual = null;
        Assert.False(Calculos.AtivaNoMes(seguro, "2026-03")); // mês por escolher
    }

    [Fact]
    public void Divida_o_valor_em_falta_desce_com_as_prestacoes_pagas_desde_o_registo()
    {
        var carro = new Divida { UtilizadorId = "u", Id = "d", Titulo = "Carro", ValorInicial = 7179, Desde = "2026-10", FixaId = "prest" };
        PagamentoFixa P(string mes) => Pago("prest", 162, mes);

        // 6855 / 162 = 42.3 -> 43 prestações
        Assert.Equal(
            new EstadoDivida(6855, 324, 43),
            Calculos.CalcularDivida(carro, [P("2026-09"), P("2026-10"), P("2026-11")], 162));

        carro.FixaId = null;
        Assert.Equal(new EstadoDivida(7179, 0, null), Calculos.CalcularDivida(carro, [], null));

        carro.FixaId = "prest";
        carro.ValorInicial = 100;
        Assert.Equal(0, Calculos.CalcularDivida(carro, [P("2026-10")], 162).EmFalta); // nunca negativo
    }

    [Theory]
    [InlineData(2026, 10, 22)] // começa à quinta, termina ao sábado
    [InlineData(2026, 11, 21)] // 30 dias, 1 e 29 caem ao domingo
    [InlineData(2026, 2, 20)]  // 28 dias certos: 4 semanas
    [InlineData(2028, 2, 21)]  // bissexto: o dia 29 é terça
    public void DiasUteis_contaSegundaASexta(int ano, int mes, int esperado) =>
        Assert.Equal(esperado, Calculos.DiasUteis(ano, mes));

    [Fact]
    public void CartaoDoMes_porDiaUtilMultiplicaPeloMes_senaoUsaOValorFixo()
    {
        var porDia = new ConfiguracaoSalario { Valor = "1500", CartaoPorDiaUtil = "7,50", CartaoAlimentacao = "100" };
        Assert.Equal(165m, Calculos.CartaoDoMes(porDia, new DateOnly(2026, 10, 1))); // 22 x 7,50
        Assert.Equal(157.5m, Calculos.CartaoDoMes(porDia, new DateOnly(2026, 11, 1))); // 21 x 7,50

        var fixo = new ConfiguracaoSalario { Valor = "1500", CartaoAlimentacao = "160" };
        Assert.Equal(160m, Calculos.CartaoDoMes(fixo, new DateOnly(2026, 10, 1)));

        // valor por dia a zero não anula o fixo; sem nada configurado dá 0
        var zero = new ConfiguracaoSalario { Valor = "1500", CartaoPorDiaUtil = "0", CartaoAlimentacao = "160" };
        Assert.Equal(160m, Calculos.CartaoDoMes(zero, new DateOnly(2026, 10, 1)));
        Assert.Equal(0m, Calculos.CartaoDoMes(null, new DateOnly(2026, 10, 1)));
    }
}
