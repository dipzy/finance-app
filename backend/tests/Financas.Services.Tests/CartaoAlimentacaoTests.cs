using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// O cartão de alimentação: um saldo à parte do Saldo Disponível, que carrega no dia do salário e
// paga as despesas extras marcadas com ele. "Hoje" = 5 de outubro de 2026.
public class CartaoAlimentacaoTests : TestesServicos
{
    private IEstatisticasService Estatisticas => A.Servico<IEstatisticasService>();

    private async Task<decimal> SaldoCartao() => (await Conta.ObterCartaoAlimentacaoAsync(Uid)).Saldo;

    private Task<string> ExtraComCartao(string titulo, decimal valor, DateOnly? data = null) =>
        Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido(titulo, valor, data, null, MeioPagamento.CartaoAlimentacao));

    [Fact]
    public async Task No_dia_do_salario_o_cartao_carrega_uma_vez_e_fica_no_recebimento()
    {
        HojeE(2026, 10, 1);
        await GuardarSalario("1500", 1, cartao: "160,50");
        await CalcularSaldoDisponivel();
        await CalcularSaldoDisponivel(); // outra vez no mesmo dia: não carrega de novo
        await Salario.ProcessarRecebimentoAsync(Uid);

        var cartao = await Conta.ObterCartaoAlimentacaoAsync(Uid);
        Assert.Equal((160.5m, 160.5m), (cartao.Saldo, cartao.ValorMensal));
        Assert.Equal(1500, await GetSaldo()); // o cartão não entra no Saldo Disponível
        Assert.Equal(160.5m, (await Meses.ObterAsync(Uid, "2026-10"))!.Recebimento!.CartaoAlimentacao);
        Assert.Equal(160.5m, (await Salario.ObterAsync(Uid))!.UltimoRecebimento!.CartaoAlimentacao);

        // No mês seguinte carrega outra vez
        HojeE(2026, 11, 1);
        await CalcularSaldoDisponivel();
        Assert.Equal(321, await SaldoCartao());
    }

    [Fact]
    public async Task Por_dia_util_o_cartao_carrega_valor_vezes_os_dias_uteis_do_mes()
    {
        // Outubro de 2026 tem 22 dias úteis e novembro 21
        HojeE(2026, 10, 1);
        await Salario.GuardarAsync(Uid, new GuardarSalarioPedido("1500", 1, "0", "7,50"));
        await CalcularSaldoDisponivel();

        var cartao = await Conta.ObterCartaoAlimentacaoAsync(Uid);
        Assert.Equal((165m, 165m), (cartao.Saldo, cartao.ValorMensal));
        Assert.Equal(165m, (await Meses.ObterAsync(Uid, "2026-10"))!.Recebimento!.CartaoAlimentacao);

        HojeE(2026, 11, 1);
        await CalcularSaldoDisponivel();
        Assert.Equal(165m + 157.5m, await SaldoCartao());

        // Texto vazio volta ao valor fixo mensal
        await Salario.GuardarAsync(Uid, new GuardarSalarioPedido("1500", 1, "100", ""));
        Assert.Equal(100m, (await Conta.ObterCartaoAlimentacaoAsync(Uid)).ValorMensal);
    }

    [Fact]
    public async Task Sem_cartao_configurado_nada_muda()
    {
        HojeE(2026, 10, 1);
        await GuardarSalario("1500", 1);
        await CalcularSaldoDisponivel();
        Assert.Equal(0, await SaldoCartao());
        Assert.Null((await Meses.ObterAsync(Uid, "2026-10"))!.Recebimento!.CartaoAlimentacao);
    }

    [Fact]
    public async Task Pagar_com_o_cartao_sai_do_cartao_e_nao_da_conta_editar_e_apagar_acertam_o_certo()
    {
        await Adicionar(1000);
        await Conta.DefinirCartaoAlimentacaoAsync(Uid, 160);

        var id = await ExtraComCartao("Almoço", 40);
        Assert.Equal((1000m, 120m), (await GetSaldo(), await SaldoCartao()));
        Assert.Equal(MeioPagamento.CartaoAlimentacao, (await ExtrasDoMes("2026-10")).Single().MeioPagamento);

        // Mudar o valor acerta o cartão pela diferença
        await Extras.AlterarAsync(Uid, id, new AlterarDespesaExtraPedido(null, 50, null));
        Assert.Equal((1000m, 110m), (await GetSaldo(), await SaldoCartao()));

        // Mudar para a conta: o valor volta ao cartão e sai da conta (e ao contrário)
        await Extras.AlterarAsync(Uid, id, new AlterarDespesaExtraPedido(null, null, null, null, MeioPagamento.Conta));
        Assert.Equal((950m, 160m), (await GetSaldo(), await SaldoCartao()));
        await Extras.AlterarAsync(Uid, id, new AlterarDespesaExtraPedido(null, 30, null, null, MeioPagamento.CartaoAlimentacao));
        Assert.Equal((1000m, 130m), (await GetSaldo(), await SaldoCartao()));

        // Apagar devolve ao cartão
        await Extras.RemoverAsync(Uid, id);
        Assert.Equal((1000m, 160m), (await GetSaldo(), await SaldoCartao()));
    }

    [Fact]
    public async Task O_cartao_nao_fica_negativo_e_nada_muda_quando_nao_chega()
    {
        await Adicionar(1000);
        await Conta.DefinirCartaoAlimentacaoAsync(Uid, 20);

        var erro = await Assert.ThrowsAsync<ConflitoException>(() => ExtraComCartao("Supermercado", 25.5m));
        Assert.Equal(
            "O cartão de alimentação só tem 20.00 €: não chega para 25.50 €. Paga com a conta, ou acerta primeiro o saldo do cartão.",
            erro.Message);
        Assert.Empty(await ExtrasDoMes("2026-10"));
        Assert.Equal((1000m, 20m), (await GetSaldo(), await SaldoCartao()));

        // Passar uma da conta para o cartão também é verificado
        var id = await AdicionarExtra("Jantar", 30);
        await Assert.ThrowsAsync<ConflitoException>(() =>
            Extras.AlterarAsync(Uid, id, new AlterarDespesaExtraPedido(null, null, null, null, MeioPagamento.CartaoAlimentacao)));
        Assert.Equal((970m, 20m), (await GetSaldo(), await SaldoCartao()));

        // Exatamente o saldo do cartão chega
        await ExtraComCartao("Café", 20);
        Assert.Equal(0, await SaldoCartao());
    }

    [Fact]
    public async Task As_historicas_pagas_com_o_cartao_nao_mexem_em_saldos()
    {
        await Extras.AdicionarHistoricaAsync(Uid, new DespesaHistoricaPedido("Almoço", 8, Dia(2026, 4, 2), null, MeioPagamento.CartaoAlimentacao));
        Assert.Equal((0m, 0m), (await GetSaldo(), await SaldoCartao()));
        Assert.Equal(MeioPagamento.CartaoAlimentacao, (await ExtrasDoMes("2026-04")).Single().MeioPagamento);
    }

    [Fact]
    public async Task Na_folha_aparecem_mas_nao_contam_nos_totais_nem_tiram_ao_Disponivel_nem_ao_Previsto()
    {
        await Adicionar(1000);
        await Conta.DefinirCartaoAlimentacaoAsync(Uid, 100);
        await AdicionarFixa("Renda", 300, diaDebito: 20);
        await ExtraComCartao("Almoço", 12);
        await AdicionarExtra("Cinema", 8);

        var folha = await Folha.ObterDadosAsync(Uid, "2026-10");
        Assert.True(folha.DespesasMes.Single(l => l.Titulo == "Almoço").CartaoAlimentacao);
        Assert.Null(folha.DespesasMes.Single(l => l.Titulo == "Cinema").CartaoAlimentacao);
        Assert.Equal(8, Calculos.TotaisFolha(folha).DespesasMes); // o almoço (cartão) é à parte: só o cinema conta
        Assert.Equal(992, folha.SaldoConta); // só o cinema saiu da conta

        var saldos = await Conta.CalcularSaldosAsync(Uid, null);
        Assert.Equal((992m, 692m), (saldos.Disponivel, saldos.Previsto));
        Assert.Equal(308, (await Estatisticas.EvolucaoAsync(Uid, 1))[0].Gasto); // renda (por pagar) + o cinema; o almoço (cartão) não conta
    }

    [Fact]
    public async Task A_evolucao_traz_o_que_o_cartao_carrega_e_o_que_se_gastou_com_ele_a_parte_da_conta()
    {
        await Adicionar(1000);
        await GuardarSalario("1500", 25, "150");
        await Conta.DefinirCartaoAlimentacaoAsync(Uid, 100);
        await ExtraComCartao("Almoço", 12);
        await ExtraComCartao("Jantar", 20);
        await AdicionarExtra("Cinema", 8);

        var mes = (await Estatisticas.EvolucaoAsync(Uid, 1))[0];

        Assert.Equal((150m, 32m), (mes.CartaoCarregado, mes.CartaoGasto));
        Assert.Equal(1500m, mes.Entrou); // o cartão não entra no que entrou
        Assert.Equal(8m, mes.DespesasExtras); // nem os gastos com ele nos gastos da conta
    }

    [Fact]
    public async Task Sem_cartao_a_evolucao_traz_zeros()
    {
        await GuardarSalario("1500", 25);

        var mes = (await Estatisticas.EvolucaoAsync(Uid, 1))[0];

        Assert.Equal((0m, 0m), (mes.CartaoCarregado, mes.CartaoGasto));
    }
}
