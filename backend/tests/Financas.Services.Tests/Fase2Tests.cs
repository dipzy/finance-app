using Financas.DAL.Entidades;
using Financas.Services.Dtos;

namespace Financas.Services.Tests;

// Porte de __tests__/fase2.test.ts: poupanças em lista, despesas anuais, dívidas e histórico do mês.
// (As regras puras desse ficheiro estão em CalculosTests.)

public class PoupancasTests : TestesServicos
{
    protected override Task PrepararAsync() => GuardarSalario("1276", 25);

    [Fact]
    public async Task No_dia_do_salario_cada_contribuicao_sai_da_conta_e_soma_se_ao_saldo_da_poupanca()
    {
        var rev = await AdicionarPoupanca("Revolut/C.A", TipoContribuicao.Valor, "600", 2000);
        var ppr = await AdicionarPoupanca("PPR", TipoContribuicao.Valor, "50", 300);
        HojeE(2026, 10, 25);

        Assert.Equal(626, await CalcularSaldoDisponivel()); // 1276 - 600 - 50
        var saldos = (await Poupancas.ListarAsync(Uid)).ToDictionary(p => p.Id, p => p.Saldo);
        Assert.Equal(new Dictionary<string, decimal> { [rev] = 2600, [ppr] = 350 }, saldos);

        // E fica no histórico do mês
        var recebimento = (await Meses.ObterAsync(Uid, "2026-10"))?.Recebimento;
        Assert.Equal((1276m, 626m), (recebimento!.Salario, recebimento.Liquido));
        Assert.All(await Poupancas.ListarAsync(Uid), p => Assert.Equal("2026-10", p.UltimaContribuicaoMes));
    }

    [Fact]
    public async Task Contribuicao_manual_so_e_transferida_ao_pressionar_e_nao_duplica_no_mes()
    {
        await Adicionar(1000);
        var id = await Poupancas.AdicionarAsync(
            Uid,
            new NovaPoupancaPedido("Revolut", TipoContribuicao.Valor, "100", 0, null, ContribuicaoAutomatica: false));
        HojeE(2026, 10, 25);

        Assert.Equal(2276, await CalcularSaldoDisponivel()); // o salário não desconta a contribuição manual
        Assert.Equal(ResultadoContribuicaoPoupanca.Adicionada, await Poupancas.ContribuirManualmenteAsync(Uid, id));
        Assert.Equal(ResultadoContribuicaoPoupanca.JaAdicionada, await Poupancas.ContribuirManualmenteAsync(Uid, id));
        Assert.Equal(2176, await GetSaldo());
        var poupanca = Assert.Single(await Poupancas.ListarAsync(Uid));
        Assert.Equal((100m, "2026-10"), (poupanca.Saldo, poupanca.UltimaContribuicaoMes));
    }

    private async Task<string> ManualDesdeAgosto()
    {
        HojeE(2026, 8, 10);
        await Adicionar(1000);
        var id = await Poupancas.AdicionarAsync(
            Uid,
            new NovaPoupancaPedido("PPR", TipoContribuicao.Valor, "100", 0, null, ContribuicaoAutomatica: false));
        HojeE(2026, 10, 5);
        return id;
    }

    [Fact]
    public async Task Uma_contribuicao_manual_esquecida_aparece_em_atraso_e_pode_ser_regularizada_depois()
    {
        var id = await ManualDesdeAgosto();

        // Agosto e setembro ficaram por enviar (julho é anterior à poupança; outubro ainda vai a tempo)
        var emAtraso = await Poupancas.ContribuicoesEmAtrasoAsync(Uid);
        Assert.Equal([("2026-08", 100m), ("2026-09", 100m)], emAtraso.Select(c => (c.Mes, c.Valor)));
        Assert.All(emAtraso, c => Assert.Equal((id, "PPR"), (c.PoupancaId, c.Nome)));

        // Regularizar setembro: sai da conta agora e soma ao saldo, mas não conta como a deste mês
        Assert.Equal(ResultadoContribuicaoPoupanca.Adicionada, await Poupancas.ContribuirManualmenteAsync(Uid, id, "2026-09"));
        Assert.Equal(ResultadoContribuicaoPoupanca.JaAdicionada, await Poupancas.ContribuirManualmenteAsync(Uid, id, "2026-09"));
        Assert.Equal(900, await GetSaldo());
        var poupanca = Assert.Single(await Poupancas.ListarAsync(Uid));
        Assert.Equal((100m, null), (poupanca.Saldo, poupanca.UltimaContribuicaoMes));
        Assert.Equal(["2026-08"], (await Poupancas.ContribuicoesEmAtrasoAsync(Uid)).Select(c => c.Mes));

        // O mês atual continua por enviar e é independente dos anteriores
        Assert.Equal(ResultadoContribuicaoPoupanca.Adicionada, await Poupancas.ContribuirManualmenteAsync(Uid, id));
        Assert.Equal("2026-10", Assert.Single(await Poupancas.ListarAsync(Uid)).UltimaContribuicaoMes);
        Assert.Equal(["2026-08"], (await Poupancas.ContribuicoesEmAtrasoAsync(Uid)).Select(c => c.Mes));
    }

    [Fact]
    public async Task Regularizar_um_mes_so_vale_nos_ultimos_3_meses_e_depois_do_inicio_da_poupanca()
    {
        var id = await ManualDesdeAgosto();

        foreach (var mes in new[] { "2026-07", "2026-06", "2026-11" }) // antes do início, há muito tempo, no futuro
        {
            await Assert.ThrowsAsync<PedidoInvalidoException>(() => Poupancas.ContribuirManualmenteAsync(Uid, id, mes));
        }

        Assert.Equal(1000, await GetSaldo());
        Assert.Equal(0, Assert.Single(await Poupancas.ListarAsync(Uid)).Saldo);
    }

    [Fact]
    public async Task Regularizar_um_mes_sem_saldo_na_conta_nao_mexe_em_nada()
    {
        var id = await ManualDesdeAgosto();
        await Subtrair(950); // sobram 50, e a contribuição é de 100

        Assert.Equal(ResultadoContribuicaoPoupanca.SaldoInsuficiente, await Poupancas.ContribuirManualmenteAsync(Uid, id, "2026-09"));
        Assert.Equal(["2026-08", "2026-09"], (await Poupancas.ContribuicoesEmAtrasoAsync(Uid)).Select(c => c.Mes));
        Assert.Equal(50, await GetSaldo());
    }

    [Fact]
    public async Task As_automaticas_nunca_ficam_em_atraso_e_passar_a_manual_conta_a_partir_desse_mes()
    {
        HojeE(2026, 8, 10);
        var id = await AdicionarPoupanca("PPR", TipoContribuicao.Valor, "100", 0);
        HojeE(2026, 10, 5);
        Assert.Empty(await Poupancas.ContribuicoesEmAtrasoAsync(Uid));

        // O que saiu sozinho antes não vira "por enviar": só conta a partir de outubro
        await Poupancas.AlterarAsync(Uid, id, new AlterarPoupancaPedido(null, null, null, null, ContribuicaoAutomatica: false));
        Assert.Empty(await Poupancas.ContribuicoesEmAtrasoAsync(Uid));
        HojeE(2026, 11, 5);
        Assert.Equal(["2026-10"], (await Poupancas.ContribuicoesEmAtrasoAsync(Uid)).Select(c => c.Mes));
    }

    [Fact]
    public async Task Apagar_a_poupanca_apaga_tambem_o_registo_das_contribuicoes()
    {
        var id = await ManualDesdeAgosto();
        await Poupancas.ContribuirManualmenteAsync(Uid, id, "2026-09");

        await Poupancas.RemoverAsync(Uid, id);

        Assert.Empty(await Poupancas.ListarAsync(Uid));
        Assert.Empty(await Poupancas.ContribuicoesEmAtrasoAsync(Uid));
    }

    [Fact]
    public async Task Contribuicao_automatica_em_dia_fixo_e_processada_uma_vez_e_pode_tentar_outra_vez_sem_saldo()
    {
        await Adicionar(50);
        await Poupancas.AdicionarAsync(
            Uid,
            new NovaPoupancaPedido("Revolut", TipoContribuicao.Valor, "100", 0, null, DiaContribuicao: 5));
        HojeE(2026, 10, 5);

        Assert.Equal(50, await CalcularSaldoDisponivel());
        Assert.Null(Assert.Single(await Poupancas.ListarAsync(Uid)).UltimaContribuicaoMes);

        await Adicionar(500);
        Assert.Equal(450, await CalcularSaldoDisponivel());
        Assert.Equal(450, await CalcularSaldoDisponivel());
        var poupanca = Assert.Single(await Poupancas.ListarAsync(Uid));
        Assert.Equal((100m, "2026-10"), (poupanca.Saldo, poupanca.UltimaContribuicaoMes));
    }

    [Fact]
    public async Task A_configuracao_antiga_de_PPR_Poupanca_e_convertida_na_lista_na_primeira_utilizacao()
    {
        await GuardarPprPoupanca(TipoContribuicao.Valor, "50", TipoContribuicao.Valor, "600");
        HojeE(2026, 10, 25);

        Assert.Equal(626, await CalcularSaldoDisponivel());
        Assert.Equal([("PPR", 50m), ("Poupança", 600m)], (await Poupancas.ListarAsync(Uid)).Select(p => (p.Nome, p.Saldo)));
    }

    [Fact]
    public async Task Sem_nenhuma_poupanca_configurada_entra_o_salario_todo()
    {
        HojeE(2026, 10, 25);
        Assert.Equal(1276, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task Reforco_fora_do_dia_do_salario_sai_da_conta_e_entra_na_poupanca()
    {
        await Adicionar(1000);
        var rev = await AdicionarPoupanca("Revolut/C.A", TipoContribuicao.Valor, "0", 0);
        await Poupancas.TransferirDaContaAsync(Uid, rev, 250);
        Assert.Equal(750, await CalcularSaldoDisponivel());
        Assert.Equal(250, (await Poupancas.ListarAsync(Uid))[0].Saldo);
    }

    [Fact]
    public async Task Levantar_ou_acertar_o_saldo_de_uma_poupanca_nao_mexe_na_conta()
    {
        await Adicionar(1000);
        var rev = await AdicionarPoupanca("Certificados", TipoContribuicao.Valor, "0", 3000);
        await Poupancas.AjustarSaldoAsync(Uid, rev, -500);
        Assert.Equal(2500, (await Poupancas.ListarAsync(Uid))[0].Saldo);
        await Poupancas.DefinirSaldoAsync(Uid, rev, 3100.5m);
        Assert.Equal(3100.5m, (await Poupancas.ListarAsync(Uid))[0].Saldo);
        Assert.Equal(1000, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task Transferir_para_uma_poupanca_que_nao_existe_nao_tira_dinheiro_da_conta()
    {
        await Adicionar(1000);
        await Assert.ThrowsAsync<NaoEncontradoException>(() => Poupancas.TransferirDaContaAsync(Uid, "nao-existe", 250));
        Assert.Equal(1000, await GetSaldo());
    }
}

public class DespesasAnuaisTests : TestesServicos
{
    [Fact]
    public async Task Aparecem_so_no_seu_mes_sao_pagas_no_dia_e_contam_no_previsto_desse_mes()
    {
        await Adicionar(1000);
        await AdicionarFixa("Seguro Carro", 715.2m, diaDebito: 10, periodicidade: Periodicidade.Anual, mesAnual: 11);

        Assert.Equal(1000, await CalcularSaldoPrevisto()); // outubro: não conta

        HojeE(2026, 11, 5);
        Assert.Equal(284.8m, await CalcularSaldoPrevisto()); // novembro: por pagar
        HojeE(2026, 11, 10);
        Assert.Equal(284.8m, await CalcularSaldoDisponivel()); // pago no dia 10
        Assert.Single(await PagamentosDoMes("2026-11"));

        HojeE(2026, 12, 10);
        Assert.Equal(284.8m, await CalcularSaldoPrevisto()); // dezembro: já não conta
    }
}

public class DividasTests : TestesServicos
{
    [Fact]
    public async Task O_valor_em_falta_desce_com_cada_prestacao_paga()
    {
        await Adicionar(1000);
        var prestacao = await AdicionarFixa("Carro", 162, diaDebito: 1);
        await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Carro", 7179, "2026-10", prestacao));

        await CalcularSaldoDisponivel(); // paga a prestação de outubro
        var carro = Assert.Single(await Dividas.ListarComEstadoAsync(Uid));
        Assert.Equal((7017m, 162m, (decimal?)162m, (int?)44), (carro.EmFalta, carro.Pago, carro.Prestacao, carro.MesesEmFalta));

        HojeE(2026, 11, 1);
        await CalcularSaldoDisponivel();
        Assert.Equal(6855, (await Dividas.ListarComEstadoAsync(Uid))[0].EmFalta);
    }

    [Fact]
    public async Task Sem_prestacao_ligada_fica_com_o_valor_registado()
    {
        await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Dentista", 7409.15m, "2026-10", null));
        var dentista = (await Dividas.ListarComEstadoAsync(Uid))[0];
        Assert.Equal((7409.15m, (int?)null), (dentista.EmFalta, dentista.MesesEmFalta));
    }

    [Fact]
    public async Task Desligar_a_prestacao_com_limpar_fixaId()
    {
        var prestacao = await AdicionarFixa("Carro", 162, diaDebito: 1);
        var id = await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Carro", 7179, "2026-10", prestacao));
        await Dividas.AlterarAsync(Uid, id, new AlterarDividaPedido("Carro", 7000, null, null, ["fixaId"]));
        var carro = (await Dividas.ListarAsync(Uid))[0];
        Assert.Equal((7000m, (string?)null), (carro.ValorInicial, carro.FixaId));
    }
}

public class HistoricoDoMesTests : TestesServicos
{
    [Fact]
    public async Task O_saldo_no_inicio_do_mes_fica_como_saldo_final_do_anterior_e_inicial_do_novo()
    {
        await Adicionar(500);
        await CalcularSaldoDisponivel();
        Assert.Equal(500, (await Meses.ObterAsync(Uid, "2026-10"))?.SaldoInicial);

        await Adicionar(250);
        HojeE(2026, 11, 2);
        await CalcularSaldoDisponivel();
        Assert.Equal(750, (await Meses.ObterAsync(Uid, "2026-10"))?.SaldoFinal);
        Assert.Equal(750, (await Meses.ObterAsync(Uid, "2026-11"))?.SaldoInicial);

        // Abrir outra vez no mesmo mês não muda o saldo inicial
        await Adicionar(100);
        await CalcularSaldoDisponivel();
        Assert.Equal(750, (await Meses.ObterAsync(Uid, "2026-11"))?.SaldoInicial);
    }

    [Fact]
    public async Task O_saldo_inicial_e_registado_antes_do_salario_desse_dia()
    {
        await Adicionar(100);
        await GuardarSalario("1000", 1);
        HojeE(2026, 11, 1);
        Assert.Equal(1100, await CalcularSaldoDisponivel());
        var novembro = await Meses.ObterAsync(Uid, "2026-11");
        Assert.Equal(100, novembro?.SaldoInicial);
        Assert.Equal(1000, novembro?.Recebimento?.Liquido);
    }
}
