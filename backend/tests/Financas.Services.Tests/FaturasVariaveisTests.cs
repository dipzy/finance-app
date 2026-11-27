using Financas.DAL.Entidades;
using Financas.Services.Dtos;

namespace Financas.Services.Tests;

// Despesas de valor variável (água, luz, gás): sem débito automático, paga-se com o valor real da fatura
public class FaturasVariaveisTests : TestesServicos
{
    private Task<string> Luz(decimal estimativa = 50, int? dia = null, bool variavel = true) =>
        Fixas.AdicionarAsync(Uid, new NovaDespesaFixaPedido("Luz", estimativa, dia, null, null, null, Variavel: variavel, UnidadeConsumo: "kWh"));

    private async Task<DespesaFixaDto> DaLuz() => Assert.Single(await ListarFixas());

    [Fact]
    public async Task Uma_despesa_variavel_nunca_e_debitada_sozinha()
    {
        HojeE(2026, 10, 10);
        await Adicionar(1000);
        await Luz(dia: 5);
        await Fixas.AdicionarAsync(Uid, new NovaDespesaFixaPedido("Renda", 300, 5, null, null, null)); // igual, mas de valor fixo

        await CalcularSaldoDisponivel();

        Assert.Equal(700, await GetSaldo()); // só a renda saiu
        Assert.Equal("Renda", Assert.Single(await PagamentosDoMes("2026-10")).Titulo);
    }

    [Fact]
    public async Task Pagar_a_fatura_usa_o_valor_real_e_a_estimativa_passa_a_ser_a_media_das_ultimas_tres()
    {
        HojeE(2026, 10, 10);
        await Adicionar(1000);
        var id = await Luz(50);

        Assert.Equal(ResultadoDebito.Debitada, await Fixas.PagarFaturaAsync(Uid, id, new PagarFaturaPedido(62.30m, 280)));
        Assert.Equal(937.70m, await GetSaldo());
        var outubro = Assert.Single(await PagamentosDoMes("2026-10"));
        Assert.Equal((62.30m, 280m, false), (outubro.Valor, outubro.Consumo, outubro.Parcial));
        Assert.Equal(62.30m, (await DaLuz()).Valor); // com uma só fatura, a estimativa é essa

        HojeE(2026, 11, 3);
        await Fixas.PagarFaturaAsync(Uid, id, new PagarFaturaPedido(40, 190));
        Assert.Equal(51.15m, (await DaLuz()).Valor); // (62,30 + 40) / 2

        HojeE(2026, 12, 3);
        await Fixas.PagarFaturaAsync(Uid, id, new PagarFaturaPedido(50));
        HojeE(2027, 1, 3);
        await Fixas.PagarFaturaAsync(Uid, id, new PagarFaturaPedido(80));
        Assert.Equal(56.67m, (await DaLuz()).Valor); // as 3 últimas: 40, 50 e 80
        Assert.Equal(1000 - 62.30m - 40 - 50 - 80, await GetSaldo());
    }

    [Fact]
    public async Task O_que_ja_foi_pago_em_parte_conta_e_so_a_diferenca_sai_da_conta()
    {
        HojeE(2026, 10, 10);
        await Adicionar(1000);
        var id = await Luz(50);

        await Fixas.DebitarParcialAsync(Uid, id, 20);
        Assert.Equal(980, await GetSaldo());

        Assert.Equal(ResultadoDebito.Debitada, await Fixas.PagarFaturaAsync(Uid, id, new PagarFaturaPedido(62.30m)));
        Assert.Equal(937.70m, await GetSaldo()); // saíram só os 42,30 que faltavam
        Assert.Equal(62.30m, Assert.Single(await PagamentosDoMes("2026-10")).Valor);
    }

    [Fact]
    public async Task Pagar_a_fatura_duas_vezes_ou_sem_saldo_nao_mexe_na_conta()
    {
        HojeE(2026, 10, 10);
        await Adicionar(30);
        var id = await Luz(50);

        Assert.Equal(ResultadoDebito.SaldoInsuficiente, await Fixas.PagarFaturaAsync(Uid, id, new PagarFaturaPedido(62.30m)));
        Assert.Equal(30, await GetSaldo());
        Assert.Empty(await PagamentosDoMes("2026-10"));

        await Adicionar(100);
        await Fixas.PagarFaturaAsync(Uid, id, new PagarFaturaPedido(62.30m));
        Assert.Equal(ResultadoDebito.JaDebitada, await Fixas.PagarFaturaAsync(Uid, id, new PagarFaturaPedido(10)));
        Assert.Equal(67.70m, await GetSaldo());
    }

    [Fact]
    public async Task Numa_despesa_de_valor_fixo_a_fatura_nao_mexe_na_estimativa()
    {
        HojeE(2026, 10, 10);
        await Adicionar(1000);
        var id = await Luz(50, variavel: false);

        await Fixas.PagarFaturaAsync(Uid, id, new PagarFaturaPedido(62.30m));
        var despesa = await DaLuz();
        Assert.Equal((50m, false), (despesa.Valor, despesa.Variavel));
    }
}
