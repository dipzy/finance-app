using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Microsoft.EntityFrameworkCore;

namespace Financas.Services.Tests;

// Porte de __tests__/database.test.ts (que corria contra um Firestore falso): os mesmos cenários e
// os mesmos números, agora contra os serviços + DAL + SQLite. Cobrem os casos que já deram
// problemas: o saldo é o mesmo em todo o lado, as despesas extras saem da conta, o salário só
// entra uma vez, os pagamentos por mês, etc. "Hoje" é 5 de outubro de 2026, salvo indicação.

public class ContaCorrenteTests : TestesServicos
{
    [Fact]
    public async Task Adicionar_dinheiro_muda_o_Saldo_Disponivel_para_o_mesmo_valor_da_conta()
    {
        await Adicionar(500);
        await Adicionar(250.5m);

        Assert.Equal(750.5m, await GetSaldo());
        Assert.Equal(750.5m, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task Remover_dinheiro_tambem()
    {
        await Adicionar(500);
        await Subtrair(120);
        Assert.Equal(380, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task O_PPR_a_Poupanca_e_o_cartao_de_alimentacao_nao_mexem_no_saldo_fora_do_dia_do_salario()
    {
        await Adicionar(1000);
        await GuardarSalario("1500", 25, "150");
        await GuardarPprPoupanca(TipoContribuicao.Percentagem, "10", TipoContribuicao.Valor, "200");

        Assert.Equal(1000, await CalcularSaldoDisponivel());
    }
}

public class DespesasExtrasTests : TestesServicos
{
    [Fact]
    public async Task Saem_da_conta_ao_registar_e_voltam_ao_apagar()
    {
        await Adicionar(1000);
        await AdicionarExtra("Jantar", 45.5m, Dia(2026, 10, 5));

        Assert.Equal(954.5m, await CalcularSaldoDisponivel());

        var jantar = Assert.Single(await ExtrasDoMes("2026-10"));
        await Extras.RemoverAsync(Uid, jantar.Id);

        Assert.Equal(1000, await CalcularSaldoDisponivel());
        Assert.Empty(await ExtrasDoMes("2026-10"));
    }

    [Fact]
    public async Task Podem_ter_a_data_de_ontem_e_ficam_no_mes_dessa_data()
    {
        await Adicionar(1000);
        HojeE(2026, 11, 1);
        await AdicionarExtra("Jantar de ontem", 30, Dia(2026, 10, 31));
        await AdicionarExtra("Café", 1.2m); // sem data: hoje

        Assert.Equal(["Jantar de ontem"], (await ExtrasDoMes("2026-10")).Select(d => d.Titulo));
        Assert.Equal([("Café", (DateOnly?)Dia(2026, 11, 1))], (await ExtrasDoMes("2026-11")).Select(d => (d.Titulo, d.Data)));
        // Mesmo sendo de outubro, o dinheiro saiu da conta (que é a de hoje)
        Assert.Equal(968.8m, await CalcularSaldoDisponivel());
        Assert.Equal(30, await TotalExtras("2026-10"));
    }

    [Fact]
    public async Task A_lista_do_mes_vem_da_mais_recente_para_a_mais_antiga()
    {
        await AdicionarExtra("A", 1, Dia(2026, 10, 1));
        await AdicionarExtra("C", 1, Dia(2026, 10, 5));
        await AdicionarExtra("B", 1, Dia(2026, 10, 3));
        Assert.Equal(["C", "B", "A"], (await ExtrasDoMes("2026-10")).Select(d => d.Titulo));
    }

    [Fact]
    public async Task Editar_o_valor_acerta_a_conta_pela_diferenca_mudar_a_data_muda_o_mes()
    {
        await Adicionar(1000);
        await AdicionarExtra("Jantar", 50, Dia(2026, 10, 5));
        var jantar = Assert.Single(await ExtrasDoMes("2026-10"));

        await Extras.AlterarAsync(Uid, jantar.Id, new AlterarDespesaExtraPedido("Jantar fora", 42.5m, null));
        Assert.Equal(957.5m, await CalcularSaldoDisponivel());

        await Extras.AlterarAsync(Uid, jantar.Id, new AlterarDespesaExtraPedido(null, null, Dia(2026, 9, 30)));
        Assert.Empty(await ExtrasDoMes("2026-10"));
        var setembro = Assert.Single(await ExtrasDoMes("2026-09"));
        Assert.Equal(("Jantar fora", 42.5m, "2026-09"), (setembro.Titulo, setembro.Valor, setembro.Mes));
        Assert.Equal(957.5m, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task As_registadas_em_versoes_anteriores_nao_devolvem_dinheiro_ao_apagar_nem_ao_editar()
    {
        await Adicionar(1000);
        // Como a versão anterior a deixou: sem descontadaDaConta (o valor nunca saiu da conta)
        var db = A.Db();
        db.DespesasExtras.Add(new DespesaExtra
        {
            UtilizadorId = Uid,
            Id = "antiga",
            Titulo = "Cinema",
            Valor = 10,
            Data = Dia(2026, 10, 1),
            Mes = "2026-10",
            CriadoEm = new DateTimeOffset(2026, 10, 1, 0, 0, 0, TimeSpan.Zero),
        });
        await db.SaveChangesAsync();

        await Extras.AlterarAsync(Uid, "antiga", new AlterarDespesaExtraPedido(null, 12, null));
        Assert.Equal(1000, await CalcularSaldoDisponivel());
        await Extras.RemoverAsync(Uid, "antiga");
        Assert.Equal(1000, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task As_importadas_de_meses_passados_ficam_no_historico_sem_mexer_na_conta()
    {
        await Adicionar(1000);
        await Extras.AdicionarHistoricaAsync(Uid, new DespesaHistoricaPedido("Temu", 21.44m, Dia(2026, 4, 1)));
        Assert.Equal(1000, await CalcularSaldoDisponivel());
        Assert.Equal(21.44m, await TotalExtras("2026-04"));
    }

    [Fact]
    public async Task Nao_entram_de_novo_no_Saldo_Previsto_porque_ja_sairam_do_Disponivel()
    {
        await Adicionar(1000);
        await AdicionarExtra("Supermercado", 100, Dia(2026, 10, 5));
        await AdicionarFixa("Renda", 300, diaDebito: 20);

        Assert.Equal(900, await CalcularSaldoDisponivel());
        Assert.Equal(600, await CalcularSaldoPrevisto()); // 900 - 300 por pagar (e não 500)
    }

    [Fact]
    public async Task Somas_de_decimais_nao_deixam_lixo_no_saldo()
    {
        await Adicionar(0.3m);
        await AdicionarExtra("a", 0.1m);
        await AdicionarExtra("b", 0.2m);
        Assert.Equal(0, await CalcularSaldoDisponivel());
    }
}

public class DiaDoSalarioTests : TestesServicos
{
    protected override async Task PrepararAsync()
    {
        await GuardarSalario("1500", 25);
        await GuardarPprPoupanca(TipoContribuicao.Percentagem, "10", TipoContribuicao.Valor, "200");
    }

    [Fact]
    public async Task Entra_o_salario_e_saem_logo_o_PPR_e_a_Poupanca()
    {
        HojeE(2026, 10, 25);
        Assert.Equal(1150, await CalcularSaldoDisponivel()); // 1500 - 150 - 200

        var ultimo = (await Salario.ObterAsync(Uid))!.UltimoRecebimento!;
        Assert.Equal((1500m, 150m, 200m, 1150m), (ultimo.Salario, ultimo.Ppr, ultimo.Poupanca, ultimo.Liquido));
    }

    [Fact]
    public async Task So_entra_uma_vez_no_mesmo_mes_mesmo_abrindo_varios_ecras()
    {
        HojeE(2026, 10, 25);
        await CalcularSaldoDisponivel();
        await CalcularSaldoPrevisto();
        Assert.Null(await Salario.ProcessarRecebimentoAsync(Uid));
        Assert.Equal(1150, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task Guardar_a_configuracao_do_salario_nao_o_volta_a_pagar_no_mesmo_mes()
    {
        HojeE(2026, 10, 25);
        await CalcularSaldoDisponivel();
        await GuardarSalario("1500", 25, "150");
        Assert.Equal(1150, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task Volta_a_entrar_no_mes_seguinte()
    {
        HojeE(2026, 10, 25);
        await CalcularSaldoDisponivel();
        HojeE(2026, 11, 25);
        Assert.Equal(2300, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task Fora_do_dia_nao_entra_nada()
    {
        HojeE(2026, 10, 24);
        Assert.Equal(0, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task Dia_31_entra_no_dia_30_em_meses_de_30_dias()
    {
        await GuardarSalario("1000", 31);
        HojeE(2026, 9, 30);
        Assert.Equal(700, await CalcularSaldoDisponivel()); // 1000 - 10% - 200
    }

    [Fact]
    public async Task O_salario_entra_antes_dos_debitos_automaticos_do_dia_e_paga_os()
    {
        await AdicionarFixa("Renda", 600, diaDebito: 25);
        HojeE(2026, 10, 25);
        Assert.Equal(550, await CalcularSaldoDisponivel()); // 1150 - 600
    }

    [Fact]
    public async Task O_dia_e_contado_em_Lisboa_e_nao_em_UTC()
    {
        await GuardarSalario("1000", 1);
        // 23:30 UTC de 30 de setembro = 00:30 de 1 de outubro em Lisboa (hora de verão): já é dia de salário
        A.Relogio.AdjustTime(new DateTimeOffset(2026, 9, 30, 23, 30, 0, TimeSpan.Zero));
        Assert.Equal(700, await CalcularSaldoDisponivel());
        Assert.NotNull((await Meses.ObterAsync(Uid, "2026-10"))?.Recebimento);
    }
}

public class DespesasMensaisTests : TestesServicos
{
    private async Task<DespesaFixaDto> CriarRenda(int? diaDebito)
    {
        var id = await AdicionarFixa("Renda", 300, diaDebito);
        return (await ListarFixas()).Single(d => d.Id == id);
    }

    [Fact]
    public async Task O_debito_automatico_acontece_ao_calcular_o_saldo()
    {
        await Adicionar(1000);
        await CriarRenda(1);

        Assert.Equal(700, await CalcularSaldoDisponivel());
        var pagamento = Assert.Single(await PagamentosDoMes("2026-10"));
        Assert.Equal(("Renda", 300m, EstadoPagamento.Pago, Dia(2026, 10, 5)), (pagamento.Titulo, pagamento.Valor, pagamento.Estado, pagamento.Data));
        Assert.Equal(700, await CalcularSaldoPrevisto());
    }

    [Fact]
    public async Task Antes_do_dia_de_debito_fica_por_pagar_e_conta_no_previsto()
    {
        await Adicionar(1000);
        await CriarRenda(20);
        Assert.Equal(1000, await CalcularSaldoDisponivel());
        Assert.Equal(700, await CalcularSaldoPrevisto());
        Assert.Equal(new Regras.TotaisFixas(0, 300, 300), await Fixas.CalcularTotaisAsync(Uid, null));
    }

    [Fact]
    public async Task Categoria_despesa_fixa_pode_ser_guardada_editada_e_limpa()
    {
        await Adicionar(1000);
        var id = await Fixas.AdicionarAsync(Uid, new NovaDespesaFixaPedido("Carro", 162, 10, null, null, null, "transportes"));

        Assert.Equal("transportes", Assert.Single(await Fixas.ListarAsync(Uid)).Categoria);

        await Fixas.AlterarAsync(Uid, id, new AlterarDespesaFixaPedido(null, null, null, null, null, null, null, "saude"));
        Assert.Equal("saude", Assert.Single(await Fixas.ListarAsync(Uid)).Categoria);

        await Fixas.AlterarAsync(Uid, id, new AlterarDespesaFixaPedido(null, null, null, null, null, null, ["categoria"]));
        Assert.Null(Assert.Single(await Fixas.ListarAsync(Uid)).Categoria);
    }

    [Fact]
    public async Task Nao_paga_duas_vezes_no_mesmo_mes()
    {
        await Adicionar(1000);
        var renda = await CriarRenda(20);
        Assert.Equal(ResultadoDebito.Debitada, await Fixas.DebitarAsync(Uid, renda.Id));
        Assert.Equal(ResultadoDebito.JaDebitada, await Fixas.DebitarAsync(Uid, renda.Id));
        Assert.Equal(700, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task Pagamentos_parciais_acumulam_e_debitar_o_resto_liquida_a_despesa()
    {
        await Adicionar(1000);
        var renda = await CriarRenda(20);

        Assert.Equal(ResultadoDebito.Debitada, await Fixas.DebitarParcialAsync(Uid, renda.Id, 100));
        Assert.Equal(new Regras.TotaisFixas(100, 200, 300), await Fixas.CalcularTotaisAsync(Uid, null));
        Assert.Equal(900, await CalcularSaldoDisponivel());

        Assert.Equal(ResultadoDebito.Debitada, await Fixas.DebitarParcialAsync(Uid, renda.Id, 50));
        Assert.Equal(850, await CalcularSaldoDisponivel());
        Assert.Equal(150, Assert.Single(await PagamentosDoMes("2026-10")).Valor);

        Assert.Equal(ResultadoDebito.Debitada, await Fixas.DebitarAsync(Uid, renda.Id));
        Assert.Equal(700, await CalcularSaldoDisponivel());
        var pagamento = Assert.Single(await PagamentosDoMes("2026-10"));
        Assert.Equal(300, pagamento.Valor);
        Assert.False(pagamento.Parcial);
    }

    [Fact]
    public async Task Desfazer_devolve_o_valor_apaga_o_pagamento_e_o_debito_automatico_nao_o_volta_a_fazer_este_mes()
    {
        await Adicionar(1000);
        var renda = await CriarRenda(1);
        await CalcularSaldoDisponivel(); // débito automático

        Assert.True(await Fixas.AnularDebitoAsync(Uid, renda.Id));
        Assert.Equal(1000, await CalcularSaldoDisponivel()); // e não volta a debitar
        Assert.Empty(await PagamentosDoMes("2026-10")); // volta a ficar por pagar, sem registo

        Assert.Equal(ResultadoDebito.Debitada, await Fixas.DebitarAsync(Uid, renda.Id));
        Assert.Equal(700, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task Com_o_debito_automatico_desligado_a_despesa_so_se_paga_a_mao_e_ao_voltar_a_ligar_e_automatica()
    {
        await Adicionar(1000);
        var renda = await CriarRenda(1);
        await Fixas.AlterarAsync(Uid, renda.Id, new AlterarDespesaFixaPedido(null, null, null, null, null, null, null, DebitoAutomatico: false));

        Assert.Equal(1000, await CalcularSaldoDisponivel()); // tem dia, mas não se paga sozinha
        Assert.Empty(await PagamentosDoMes("2026-10"));
        Assert.False((await ListarFixas()).Single(d => d.Id == renda.Id).DebitoAutomatico);

        Assert.Equal(ResultadoDebito.Debitada, await Fixas.DebitarAsync(Uid, renda.Id)); // à mão continua a dar
        Assert.Equal(700, await CalcularSaldoDisponivel());

        Assert.True(await Fixas.AnularDebitoAsync(Uid, renda.Id));
        await Fixas.AlterarAsync(Uid, renda.Id, new AlterarDespesaFixaPedido(null, null, null, null, null, null, null, DebitoAutomatico: true));
        Assert.True((await ListarFixas()).Single(d => d.Id == renda.Id).DebitoAutomatico);
    }

    [Fact]
    public async Task Sem_saldo_suficiente_nao_debita()
    {
        await Adicionar(100);
        var renda = await CriarRenda(20);
        Assert.Equal(ResultadoDebito.SaldoInsuficiente, await Fixas.DebitarAsync(Uid, renda.Id));
        Assert.Equal(100, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task No_mes_seguinte_volta_a_ficar_por_pagar_e_o_debito_automatico_volta_a_correr()
    {
        await Adicionar(1000);
        await CriarRenda(1);
        await CalcularSaldoDisponivel(); // outubro pago

        HojeE(2026, 11, 5);
        Assert.Equal(400, await CalcularSaldoDisponivel());
        Assert.Single(await PagamentosDoMes("2026-11"));
        Assert.Single(await PagamentosDoMes("2026-10")); // o histórico de outubro fica
    }

    [Fact]
    public async Task Despesas_sem_dia_de_debito_podem_ser_pagas_a_mao_e_nunca_automaticamente()
    {
        await Adicionar(1000);
        var renda = await CriarRenda(null);
        Assert.Equal(1000, await CalcularSaldoDisponivel());
        Assert.Equal(ResultadoDebito.Debitada, await Fixas.DebitarAsync(Uid, renda.Id));
        Assert.Equal(700, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task Editar_o_valor_vale_daqui_para_a_frente_o_pagamento_ja_feito_guarda_o_valor_pago()
    {
        await Adicionar(1000);
        var renda = await CriarRenda(1);
        await CalcularSaldoDisponivel(); // paga 300 em outubro

        await Fixas.AlterarAsync(Uid, renda.Id, new AlterarDespesaFixaPedido("Renda casa", 320, null, null, null, null, null));
        Assert.Equal(300, (await PagamentosDoMes("2026-10"))[0].Valor);
        Assert.Equal(700, await CalcularSaldoDisponivel());

        HojeE(2026, 11, 5);
        Assert.Equal(380, await CalcularSaldoDisponivel()); // novembro já paga 320
        var novembro = (await PagamentosDoMes("2026-11"))[0];
        Assert.Equal(("Renda casa", 320m), (novembro.Titulo, novembro.Valor));
    }

    [Fact]
    public async Task Terminar_uma_despesa_ja_paga_este_mes_fica_no_historico_e_deixa_de_contar_a_partir_do_mes_seguinte()
    {
        await Adicionar(1000);
        var renda = await CriarRenda(1);
        await CalcularSaldoDisponivel();

        await Fixas.TerminarAsync(Uid, renda.Id);
        Assert.Equal("2026-10", (await ListarFixas())[0].Fim);

        HojeE(2026, 11, 5);
        Assert.Equal(700, await CalcularSaldoDisponivel());
        Assert.Equal(700, await CalcularSaldoPrevisto());
    }

    [Fact]
    public async Task Terminar_uma_despesa_que_nunca_foi_paga_apaga_a()
    {
        var renda = await CriarRenda(20);
        await Fixas.TerminarAsync(Uid, renda.Id);
        Assert.Empty(await ListarFixas());
    }

    [Fact]
    public async Task Pagamentos_de_meses_passados_importados_ficam_no_historico_sem_mexer_na_conta()
    {
        await Adicionar(1000);
        var id = await AdicionarFixa("Dentista", 159.25m, diaDebito: 20, inicio: "2026-04");
        await Fixas.RegistarPagamentoHistoricoAsync(Uid, "2026-04", id, new RegistarPagamentoPedido("Dentista", 156.28m, null));

        Assert.Equal(1000, await CalcularSaldoDisponivel());
        Assert.Equal(new Regras.TotaisFixas(156.28m, 0, 156.28m), await Fixas.CalcularTotaisAsync(Uid, "2026-04"));
    }

    [Fact]
    public async Task Limpar_o_dia_de_debito_passa_a_pagar_so_a_mao()
    {
        var id = await AdicionarFixa("Seguro", 100, diaDebito: 10, periodicidade: Periodicidade.Anual, mesAnual: 10);
        await Fixas.AlterarAsync(Uid, id, new AlterarDespesaFixaPedido(null, null, null, null, null, null, ["diaDebito"]));
        Assert.Null((await ListarFixas())[0].DiaDebito);

        await Assert.ThrowsAsync<PedidoInvalidoException>(() =>
            Fixas.AlterarAsync(Uid, id, new AlterarDespesaFixaPedido(null, null, null, null, null, null, ["titulo"])));
        await Assert.ThrowsAsync<NaoEncontradoException>(() =>
            Fixas.AlterarAsync(Uid, "nao-existe", new AlterarDespesaFixaPedido("x", null, null, null, null, null, null)));
    }
}

public class ConversaoDadosAntigosTests : TestesServicos
{
    [Fact]
    public async Task Pagamentos_guardados_na_despesa_passam_a_registos_por_mes_sem_pagar_outra_vez()
    {
        await Adicionar(700); // a renda já tinha saído
        var db = A.Db();
        db.DespesasFixas.AddRange(
            new DespesaFixa
            {
                UtilizadorId = Uid, Id = "renda", Titulo = "Renda", Valor = 300, DiaDebito = 1,
                Debitado = true, MesDebitado = "2026-10", CriadoEm = new DateTimeOffset(2026, 9, 1, 0, 0, 0, TimeSpan.Zero),
            },
            new DespesaFixa
            {
                UtilizadorId = Uid, Id = "luz", Titulo = "Luz", Valor = 40, DiaDebito = 1,
                AnuladoMes = "2026-10", CriadoEm = new DateTimeOffset(2026, 9, 2, 0, 0, 0, TimeSpan.Zero),
            });
        // Extra antiga sem mês (a data "28/09/2026" das versões antigas já convertida)
        db.DespesasExtras.Add(new DespesaExtra
        {
            UtilizadorId = Uid, Id = "cinema", Titulo = "Cinema", Valor = 10, Data = Dia(2026, 9, 28),
            CriadoEm = new DateTimeOffset(2026, 9, 28, 0, 0, 0, TimeSpan.Zero),
        });
        // Como um utilizador da versão anterior: conversões ainda por fazer
        var utilizador = await db.Utilizadores.SingleAsync(u => u.Id == Uid);
        utilizador.PagamentosPorMesConvertidos = false;
        utilizador.PoupancasListaConvertidas = false;
        await db.SaveChangesAsync();

        Assert.Equal(700, await CalcularSaldoDisponivel()); // nem a renda (paga) nem a luz (desfeita) são debitadas

        var pagamentos = await PagamentosDoMes("2026-10");
        Assert.Equal([("Renda", EstadoPagamento.Pago)], pagamentos.Select(p => (p.Titulo, p.Estado)));
        Assert.Null((await ListarFixas()).Single(f => f.Id == "renda").Debitado);
        Assert.Equal(["Cinema"], (await ExtrasDoMes("2026-09")).Select(d => d.Titulo));

        var depois = await A.Db().Utilizadores.AsNoTracking().SingleAsync(u => u.Id == Uid);
        Assert.True(depois.PagamentosPorMesConvertidos);
        Assert.True(depois.PoupancasListaConvertidas);
    }

    [Fact]
    public async Task So_corre_uma_vez()
    {
        await Preparacao.PrepararAsync(Uid);
        var db = A.Db();
        db.DespesasExtras.Add(new DespesaExtra
        {
            UtilizadorId = Uid, Id = "nova", Titulo = "X", Valor = 1, CriadoEm = new DateTimeOffset(2026, 10, 5, 0, 0, 0, TimeSpan.Zero),
        });
        await db.SaveChangesAsync();

        await Preparacao.PrepararAsync(Uid);
        Assert.Null((await A.Db().DespesasExtras.AsNoTracking().SingleAsync(e => e.Id == "nova")).Mes);
    }
}
