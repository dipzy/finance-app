using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// Alertas proativos (AlertasService): orçamentos, despesas e dívidas a vencer, objetivos atrasados.
// "Hoje" nos testes é 5 de outubro de 2026.
public class AlertasTests : TestesServicos
{
    private IAlertasService Alertas => A.Servico<IAlertasService>();

    private Task<IReadOnlyList<AlertaDto>> Listar(string? uid = null) => Alertas.ListarAsync(uid ?? Uid);

    private Task GastarEm(string categoria, decimal valor) =>
        Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido($"Gasto {Guid.NewGuid():N}", valor, null, categoria));

    private Task<string> Orcamento(string categoria, decimal limite) =>
        A.Servico<IOrcamentosService>().AdicionarAsync(Uid, new NovoOrcamentoPedido(categoria, limite));

    // ---- Regras puras ----

    [Theory]
    [InlineData(5, 0)] // hoje
    [InlineData(6, 1)]
    [InlineData(8, 3)] // o limite do aviso
    [InlineData(2, -3)] // em atraso
    public void O_vencimento_conta_os_dias_ate_ao_dia_de_debito(int diaDebito, int dias)
    {
        var fixa = Fixa(diaDebito);

        var vencimento = RegrasAlertas.VencimentoPorPagar(fixa, [], new DateOnly(2026, 10, 5));

        Assert.NotNull(vencimento);
        Assert.Equal(dias, vencimento!.Dias);
        Assert.Equal(new DateOnly(2026, 10, diaDebito), vencimento.Dia);
        Assert.Equal(dias < 0, vencimento.EmAtraso);
    }

    [Fact]
    public void Sem_alerta_quando_falta_mais_de_3_dias_sem_dia_de_debito_ou_ja_paga()
    {
        var hoje = new DateOnly(2026, 10, 5);
        Assert.Null(RegrasAlertas.VencimentoPorPagar(Fixa(9), [], hoje)); // daqui a 4 dias
        Assert.Null(RegrasAlertas.VencimentoPorPagar(Fixa(null), [], hoje));
        var paga = new PagamentoFixa
        {
            UtilizadorId = "u", Id = "2026-10_f", FixaId = "f", Mes = "2026-10", Titulo = "Renda", Valor = 550,
            Data = hoje, Estado = EstadoPagamento.Pago,
        };
        Assert.Null(RegrasAlertas.VencimentoPorPagar(Fixa(3), [paga], hoje));
        // Pagamento parcial ainda é "por pagar"
        paga.Parcial = true;
        Assert.NotNull(RegrasAlertas.VencimentoPorPagar(Fixa(3), [paga], hoje));
    }

    [Fact]
    public void Dia_31_nos_meses_curtos_vence_no_ultimo_dia()
    {
        var vencimento = RegrasAlertas.VencimentoPorPagar(Fixa(31), [], new DateOnly(2026, 11, 28));

        Assert.Equal(new DateOnly(2026, 11, 30), vencimento!.Dia);
        Assert.Equal(2, vencimento.Dias);
    }

    private static DespesaFixa Fixa(int? diaDebito) => new()
    {
        UtilizadorId = "u", Id = "f", Titulo = "Renda", Valor = 550, DiaDebito = diaDebito, Inicio = "2026-01", CriadoEm = DateTimeOffset.UnixEpoch,
    };

    // ---- Orçamentos ----

    [Fact]
    public async Task Orcamento_a_80_por_cento_da_aviso_e_a_100_por_cento_excedido()
    {
        var restauracao = await Orcamento("restauracao", 200);
        var lazer = await Orcamento("lazer", 100);
        var compras = await Orcamento("compras", 100);
        var casa = await Orcamento("casa", 100);
        await GastarEm("restauracao", 170); // 85%
        await GastarEm("lazer", 100); // 100%
        await GastarEm("compras", 79.99m); // 79,99%: ainda não
        await GastarEm("casa", 80); // 80% exatos: aviso

        // Dia 5: os 79,99 € de "compras" ainda não chegam aos 80%, mas já vão muito à frente do mês (o aviso de
        // ritmo é à parte: ver RitmoAlertasTests)
        var alertas = (await Listar()).Where(a => a.Tipo != TipoAlerta.OrcamentoRitmo).ToList();

        Assert.Equal(3, alertas.Count);
        var excedido = alertas[0]; // os mais graves primeiro
        Assert.Equal(TipoAlerta.OrcamentoExcedido, excedido.Tipo);
        Assert.Equal(SeveridadeAlerta.Critico, excedido.Severidade);
        Assert.Equal("Orçamento de Lazer ultrapassado", excedido.Titulo);
        Assert.Equal("Gastaste 100,00 € de 100,00 € em Lazer: limite ultrapassado.", excedido.Mensagem);
        Assert.Equal(lazer, excedido.Referencia);
        Assert.Equal(new DateOnly(2026, 10, 5), excedido.Data);

        var avisos = alertas.Skip(1).ToList();
        Assert.All(avisos, a => Assert.Equal(TipoAlerta.OrcamentoAviso, a.Tipo));
        Assert.All(avisos, a => Assert.Equal(SeveridadeAlerta.Aviso, a.Severidade));
        var rest = avisos.Single(a => a.Referencia == restauracao);
        Assert.Equal("Orçamento de Restauração a 85%", rest.Titulo);
        Assert.Equal("Já gastaste 170,00 € de 200,00 € em Restauração este mês.", rest.Mensagem);
        Assert.Equal("Orçamento de Casa a 80%", avisos.Single(a => a.Referencia == casa).Titulo);
        Assert.DoesNotContain(alertas, a => a.Referencia == compras);
    }

    [Fact]
    public async Task So_contam_as_despesas_do_mes_atual()
    {
        await Orcamento("lazer", 100);
        await Extras.AdicionarHistoricaAsync(Uid, new DespesaHistoricaPedido("Cinema", 150, new DateOnly(2026, 9, 20), "lazer"));

        Assert.Empty(await Listar());
    }

    // ---- Despesas mensais ----

    [Fact]
    public async Task Despesa_por_pagar_a_3_dias_ou_menos_avisa_e_depois_do_dia_esta_vencida()
    {
        var hoje = await AdicionarFixa("Ginásio", 30, diaDebito: 5);
        var amanha = await AdicionarFixa("Renda", 550, diaDebito: 6);
        var emDoisDias = await AdicionarFixa("Internet", 40, diaDebito: 7);
        await AdicionarFixa("Seguro", 100, diaDebito: 9); // 4 dias: ainda não
        await AdicionarFixa("Condomínio", 20); // sem dia de débito
        var atrasada = await AdicionarFixa("Água", 25.5m, diaDebito: 2);

        var alertas = await Listar();

        Assert.Equal(4, alertas.Count);
        var vencida = alertas[0];
        Assert.Equal(TipoAlerta.DespesaVencida, vencida.Tipo);
        Assert.Equal(SeveridadeAlerta.Critico, vencida.Severidade);
        Assert.Equal("Água por pagar desde o dia 2", vencida.Titulo);
        Assert.Equal("A despesa Água (25,50 €) devia ter sido paga no dia 2.", vencida.Mensagem);
        Assert.Equal(atrasada, vencida.Referencia);
        Assert.Equal(new DateOnly(2026, 10, 2), vencida.Data);

        Assert.Equal("Ginásio sai hoje — 30,00 €", alertas.Single(a => a.Referencia == hoje).Titulo);
        Assert.Equal("Renda sai amanhã — 550,00 €", alertas.Single(a => a.Referencia == amanha).Titulo);
        var dois = alertas.Single(a => a.Referencia == emDoisDias);
        Assert.Equal("Internet sai dia 7 — 40,00 €", dois.Titulo);
        Assert.Equal("A despesa Internet (40,00 €) vence no dia 7.", dois.Mensagem);
        Assert.Equal(TipoAlerta.DespesaAVencer, dois.Tipo);
        Assert.Equal(SeveridadeAlerta.Aviso, dois.Severidade);
        // Dentro dos avisos, os que vencem primeiro vêm primeiro
        Assert.Equal([hoje, amanha, emDoisDias], alertas.Skip(1).Select(a => a.Referencia));
    }

    [Fact]
    public async Task Despesa_paga_nao_alerta_e_a_parcial_alerta_o_que_falta()
    {
        var paga = await AdicionarFixa("Renda", 550, diaDebito: 3);
        var parcial = await AdicionarFixa("Cartão", 100, diaDebito: 4);
        await Adicionar(2000);
        await Fixas.DebitarAsync(Uid, paga);
        await Fixas.DebitarParcialAsync(Uid, parcial, 40);

        var alertas = await Listar();

        var alerta = Assert.Single(alertas);
        Assert.Equal(parcial, alerta.Referencia);
        Assert.Equal("A despesa Cartão (60,00 €) devia ter sido paga no dia 4.", alerta.Mensagem);
    }

    [Fact]
    public async Task Despesa_anual_so_alerta_no_mes_dela()
    {
        await AdicionarFixa("Seguro", 700, diaDebito: 5, periodicidade: Periodicidade.Anual, mesAnual: 3);
        Assert.Empty(await Listar());

        var deste = await AdicionarFixa("IMI", 300, diaDebito: 6, periodicidade: Periodicidade.Anual, mesAnual: 10);
        Assert.Equal(deste, Assert.Single(await Listar()).Referencia);
    }

    // ---- Dívidas ----

    [Fact]
    public async Task A_prestacao_de_uma_divida_aparece_como_divida_e_a_despesa_nao_se_repete()
    {
        var prestacao = await AdicionarFixa("Crédito carro", 200, diaDebito: 6);
        var divida = await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Carro", 5000, "2026-01", prestacao));

        var alerta = Assert.Single(await Listar());

        Assert.Equal(TipoAlerta.DividaAVencer, alerta.Tipo);
        Assert.Equal(SeveridadeAlerta.Aviso, alerta.Severidade);
        Assert.Equal("Prestação da dívida Carro vence amanhã", alerta.Titulo);
        Assert.Equal("A prestação de 200,00 € vence no dia 6. Em falta: 5000,00 €.", alerta.Mensagem);
        Assert.Equal(divida, alerta.Referencia);
        Assert.Equal(new DateOnly(2026, 10, 6), alerta.Data);
    }

    [Fact]
    public async Task Prestacao_em_atraso_e_vencida_e_depois_de_paga_ou_a_divida_saldada_nao_alerta()
    {
        var prestacao = await AdicionarFixa("Crédito carro", 200, diaDebito: 2);
        await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Carro", 5000, "2026-01", prestacao));

        var vencida = Assert.Single(await Listar());
        Assert.Equal(TipoAlerta.DividaVencida, vencida.Tipo);
        Assert.Equal(SeveridadeAlerta.Critico, vencida.Severidade);
        Assert.Equal("Prestação da dívida Carro em atraso desde o dia 2", vencida.Titulo);

        await Adicionar(1000);
        await Fixas.DebitarAsync(Uid, prestacao);
        Assert.Empty(await Listar());
    }

    [Fact]
    public async Task Divida_ja_paga_toda_nao_alerta()
    {
        var prestacao = await AdicionarFixa("Crédito", 200, diaDebito: 6);
        await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Pequena", 100, "2026-09", prestacao));
        await Fixas.RegistarPagamentoHistoricoAsync(Uid, "2026-09", prestacao, new RegistarPagamentoPedido("Crédito", 100, new DateOnly(2026, 9, 1)));

        Assert.Empty(await Listar());
    }

    // ---- Objetivos ----

    [Fact]
    public async Task Objetivo_atrasado_alerta_e_no_bom_caminho_nao()
    {
        HojeE(2026, 5, 1);
        var atrasado = await A.Servico<IObjetivosService>().AdicionarAsync(Uid, new NovoObjetivoPedido("Férias", 1200, "2026-12", null, 0));
        await A.Servico<IObjetivosService>().AdicionarAsync(Uid, new NovoObjetivoPedido("Carro novo", 1200, "2026-12", null, 1100));
        HojeE(2026, 10, 5);

        var alerta = Assert.Single(await Listar());

        Assert.Equal(TipoAlerta.ObjetivoAtrasado, alerta.Tipo);
        Assert.Equal(SeveridadeAlerta.Aviso, alerta.Severidade);
        Assert.Equal("Objetivo Férias atrasado", alerta.Titulo);
        Assert.Equal("Já tens 0,00 € de 1200,00 €: faltam 1200,00 € para o objetivo.", alerta.Mensagem);
        Assert.Equal(atrasado, alerta.Referencia);
    }

    // ---- Geral ----

    [Fact]
    public async Task Sem_nada_a_dizer_nao_ha_alertas_e_cada_utilizador_so_ve_os_seus()
    {
        Assert.Empty(await Listar());
        await AdicionarFixa("Renda", 550, diaDebito: 6);

        Assert.Single(await Listar());
        Assert.Empty(await Listar("outro"));
    }

    [Fact]
    public async Task Os_textos_vem_na_lingua_do_pedido()
    {
        await Orcamento("supermercado", 100);
        await GastarEm("supermercado", 100);
        await AdicionarFixa("Renda", 550, diaDebito: 6);
        await AdicionarFixa("Água", 25, diaDebito: 2);

        Textos.Linguagem = "en";
        try
        {
            var alertas = await Listar();

            Assert.Equal("Groceries budget exceeded", alertas.Single(a => a.Tipo == TipoAlerta.OrcamentoExcedido).Titulo);
            Assert.Equal(
                "You spent 100.00 € of 100.00 € on Groceries: limit exceeded.",
                alertas.Single(a => a.Tipo == TipoAlerta.OrcamentoExcedido).Mensagem);
            Assert.Equal("Renda due tomorrow — 550.00 €", alertas.Single(a => a.Tipo == TipoAlerta.DespesaAVencer).Titulo);
            Assert.Equal("Água unpaid since day 2", alertas.Single(a => a.Tipo == TipoAlerta.DespesaVencida).Titulo);
            Assert.Equal("The expense Água (25.00 €) should have been paid on day 2.", alertas.Single(a => a.Tipo == TipoAlerta.DespesaVencida).Mensagem);
        }
        finally
        {
            Textos.Linguagem = "pt";
        }
    }

    [Fact]
    public async Task So_le_nao_recebe_o_salario_nem_debita_nada()
    {
        await GuardarSalario("1000", 5);
        await AdicionarFixa("Renda", 550, diaDebito: 3);
        await Adicionar(2000);

        await Listar();

        Assert.Equal(2000m, await GetSaldo());
        Assert.Empty(await PagamentosDoMes("2026-10"));
    }
}
