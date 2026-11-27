using Financas.Services.Dtos;

namespace Financas.Services.Tests;

// Dívidas com taxa (créditos): o capital desce só com o que sobra dos juros, do selo e dos seguros; o simulador
// e as estratégias usam esse capital. Os números são os de um extrato real (capital 7 169,10 €, TAN 3,3 %,
// prestação 156,28 € = 120,54 de capital + 19,72 de juros + 0,79 de selo + 15,23 de seguros).
public class DividasContratoTests : TestesServicos
{
    private const decimal Capital = 7169.10m;

    protected override Task PrepararAsync()
    {
        HojeE(2026, 10, 25);
        return Task.CompletedTask;
    }

    private async Task<string> CriarCredito(decimal prestacao = 156.28m, decimal? comissao = null)
    {
        await Adicionar(5000);
        var fixa = await AdicionarFixa("Crédito", prestacao, diaDebito: 5);
        return await Dividas.AdicionarAsync(Uid, new NovaDividaPedido(
            "Crédito pessoal", Capital, "2026-10", fixa,
            TaxaAnual: 3.3m, ValorFinanciado: 7766.69m, Entrada: 1000m, PrazoMeses: 60, InicioContrato: "2026-05",
            ComissaoReembolso: comissao, EncargosMensais: 15.23m));
    }

    private async Task<DividaComEstadoDto> Estado() => Assert.Single(await Dividas.ListarComEstadoAsync(Uid));

    [Fact]
    public async Task Antes_de_pagar_a_prestacao_o_capital_e_o_registado_e_o_resumo_mostra_o_contrato()
    {
        await CriarCredito();
        var d = await Estado();

        Assert.Equal(Capital, d.EmFalta);
        Assert.Equal(0m, d.Pago);
        var r = d.Resumo!;
        Assert.Equal(19.72m, r.JurosProximaPrestacao);
        Assert.Equal("2026-10", r.PrimeiroMes);
        Assert.Equal(8766.69m, r.PrecoTotal); // financiado + entrada
        Assert.Equal(597.59m, r.CapitalAmortizado); // 7 766,69 - 7 169,10
        Assert.True(r.Viavel);
        Assert.InRange(r.MesesRestantes!.Value, 54, 56);
        Assert.NotNull(r.Fim);
        Assert.NotNull(r.JurosContrato);
        Assert.True(r.CustoTotalContrato > r.PrecoTotal);
    }

    [Fact]
    public async Task Cada_prestacao_paga_amortiza_so_o_que_sobra_dos_juros_do_selo_e_dos_seguros()
    {
        await CriarCredito();
        await CalcularSaldoDisponivel(); // debita a prestação de outubro (dia 5)

        var d = await Estado();
        Assert.Equal(156.28m, d.Pago); // o pago é o que saiu da conta, sem desconto
        Assert.Equal(7048.56m, d.EmFalta); // 7 169,10 + 19,72 - 140,26: só 120,54 de capital
        Assert.Equal("2026-11", d.Resumo!.PrimeiroMes); // a de outubro já foi paga
    }

    [Fact]
    public async Task Sem_taxa_a_divida_continua_a_descontar_a_prestacao_inteira()
    {
        await Adicionar(5000);
        var fixa = await AdicionarFixa("Carro", 162, diaDebito: 5);
        await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Carro", 7179, "2026-10", fixa));
        await CalcularSaldoDisponivel();

        var d = await Estado();
        Assert.Equal(7017m, d.EmFalta);
        Assert.Null(d.Resumo);
        Assert.Null(d.Extrato);
    }

    [Fact]
    public async Task O_simulador_compara_as_duas_amortizacoes_e_a_total()
    {
        var id = await CriarCredito(comissao: 0.5m);

        var s = await Dividas.SimularAsync(Uid, id, new SimularDividaPedido(Amortizacao: 2000m, ExtraMensal: 50m));

        Assert.Equal(Capital, s.CapitalEmFalta);
        Assert.Equal("2026-10", s.PrimeiroMes);
        Assert.Equal(140.26m, s.Atual.Prestacao); // 156,28 - 15,23 de seguros - 0,79 de selo
        Assert.Equal(156.28m, s.Atual.PrestacaoTotal);

        Assert.NotNull(s.ManterPrestacao);
        Assert.True(s.ManterPrestacao.Meses < s.Atual.Meses);
        Assert.Equal(10m, s.ManterPrestacao.Comissao); // 0,5 % de 2 000 €
        Assert.True(s.ManterPrestacao.PoupancaLiquida > 0);

        Assert.NotNull(s.ReduzirPrestacao);
        Assert.True(s.ReduzirPrestacao.Prestacao < s.Atual.Prestacao);

        Assert.Equal(0, s.AmortizacaoTotal.Meses);
        Assert.Equal(35.85m, s.AmortizacaoTotal.Comissao); // 0,5 % de 7 169,10
        Assert.Equal(s.Atual.Juros, s.AmortizacaoTotal.PoupancaJuros);

        Assert.NotNull(s.ExtraMensal);
        Assert.True(s.ExtraMensal.Meses < s.Atual.Meses);
    }

    [Fact]
    public async Task Sem_pedir_amortizacao_so_vem_a_total()
    {
        var id = await CriarCredito();
        var s = await Dividas.SimularAsync(Uid, id, new SimularDividaPedido(null, null));
        Assert.Null(s.ManterPrestacao);
        Assert.Null(s.ReduzirPrestacao);
        Assert.Null(s.ExtraMensal);
        Assert.Equal(0, s.AmortizacaoTotal.Meses);
    }

    [Fact]
    public async Task Simular_pede_taxa_e_prestacao()
    {
        var semTaxa = await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Dentista", 500, "2026-10", null));
        var erro = await Assert.ThrowsAsync<PedidoInvalidoException>(() => Dividas.SimularAsync(Uid, semTaxa, new SimularDividaPedido(100, null)));
        Assert.Contains("taxa", erro.Message);

        var semPrestacao = await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Cartão", 500, "2026-10", null, TaxaAnual: 18));
        var erro2 = await Assert.ThrowsAsync<PedidoInvalidoException>(() => Dividas.SimularAsync(Uid, semPrestacao, new SimularDividaPedido(100, null)));
        Assert.Contains("prestação", erro2.Message);

        await Assert.ThrowsAsync<NaoEncontradoException>(() => Dividas.SimularAsync(Uid, "nao-existe", new SimularDividaPedido(100, null)));
    }

    [Fact]
    public async Task As_estrategias_comparam_a_bola_de_neve_e_a_avalanche()
    {
        await Adicionar(5000);
        var cartao = await AdicionarFixa("Cartão", 100, diaDebito: 5);
        var carro = await AdicionarFixa("Carro", 200, diaDebito: 5);
        await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Cartão", 1000, "2026-10", cartao, TaxaAnual: 18));
        await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Carro", 5000, "2026-10", carro, TaxaAnual: 4));
        await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Sem prestação", 300, "2026-10", null));

        var c = await Dividas.CompararEstrategiasAsync(Uid, new CompararEstrategiasPedido(100));

        Assert.Equal(2, c.Dividas.Count);
        Assert.Equal(["Sem prestação"], c.Ignoradas);
        Assert.True(c.BolaDeNeve.Meses < c.SoPrestacoes.Meses);
        Assert.True(c.Avalanche.Juros <= c.BolaDeNeve.Juros);
        Assert.Equal("Cartão", c.Avalanche.Ordem[0].Titulo); // a taxa mais alta
    }

    // ---- Extrato do credor ----

    private static ExtratoCreditoDto Extrato(string numero = "XX 123456", DateOnly? emitido = null, decimal vincendo = 7169.10m, int prestacao = 6) => new(
        "Montepio Crédito", numero, "Crédito Pessoal", new DateOnly(2026, 4, 1), emitido ?? new DateOnly(2026, 9, 25),
        3.3m, 7766.69m, 597.59m, 0m, vincendo, prestacao, 60, new DateOnly(2026, 10, 5),
        156.28m, 120.54m, 19.72m, 0.79m, 15.23m, []);

    [Fact]
    public async Task Aplicar_um_extrato_cria_a_divida_com_o_contrato_e_a_proxima_prestacao()
    {
        var fixa = await AdicionarFixa("Crédito", 156.28m, diaDebito: 5);
        var id = await Dividas.AplicarExtratoAsync(Uid, new AplicarExtratoPedido(Extrato(), null, "Crédito pessoal", fixa));

        var d = await Estado();
        Assert.Equal(id, d.Id);
        Assert.Equal("Crédito pessoal", d.Titulo);
        Assert.Equal((Capital, "2026-10", fixa), (d.ValorInicial, d.Desde, d.FixaId));
        Assert.Equal((3.3m, 7766.69m, 60, "2026-05"), (d.TaxaAnual, d.ValorFinanciado, d.PrazoMeses, d.InicioContrato));
        Assert.Equal((15.23m, "XX 123456", "Montepio Crédito"), (d.EncargosMensais, d.NumeroContrato, d.Credor));

        var e = d.Extrato!;
        Assert.Equal(new DateOnly(2026, 9, 25), e.EmitidoEm);
        Assert.Equal((6, 60, new DateOnly(2026, 10, 5), 156.28m), (e.ProximaPrestacaoNumero, e.PrestacaoTotal, e.Vencimento, e.PrestacaoValor));
        Assert.Equal((120.54m, 19.72m, 0.79m, 15.23m), (e.PrestacaoCapital, e.PrestacaoJuros, e.PrestacaoSelo, e.PrestacaoSeguros));
        Assert.False(e.EmAtraso);

        // Com a prestação ligada, a conta fecha: 140,26 de capital + juros
        Assert.Equal(140.26m, d.Resumo!.PrestacaoSemEncargos);
    }

    [Fact]
    public async Task Um_extrato_novo_do_mesmo_contrato_atualiza_a_divida_em_vez_de_criar_outra()
    {
        var fixa = await AdicionarFixa("Crédito", 156.28m, diaDebito: 5);
        var id = await Dividas.AplicarExtratoAsync(Uid, new AplicarExtratoPedido(Extrato(), null, "Crédito pessoal", fixa));


        var novo = Extrato(emitido: new DateOnly(2026, 10, 26), vincendo: 7048.56m, prestacao: 7) with { Vencimento = new DateOnly(2026, 11, 5), CapitalAmortizado = 718.13m };
        var id2 = await Dividas.AplicarExtratoAsync(Uid, new AplicarExtratoPedido(novo, id, null, null));

        Assert.Equal(id, id2);
        var d = await Estado();
        Assert.Equal((7048.56m, "2026-11", fixa), (d.ValorInicial, d.Desde, d.FixaId));
        Assert.Equal(7, d.Extrato!.ProximaPrestacaoNumero);
        Assert.Equal("Crédito pessoal", d.Titulo); // o nome que escolheste mantém-se
    }

    [Fact]
    public async Task Um_extrato_mais_antigo_que_o_ultimo_importado_e_recusado()
    {
        var id = await Dividas.AplicarExtratoAsync(Uid, new AplicarExtratoPedido(Extrato(emitido: new DateOnly(2026, 10, 26)), null, null, null));
        await Assert.ThrowsAsync<ConflitoException>(() =>
            Dividas.AplicarExtratoAsync(Uid, new AplicarExtratoPedido(Extrato(emitido: new DateOnly(2026, 9, 25)), id, null, null)));
    }

    [Fact]
    public async Task Sem_titulo_a_divida_nova_chama_se_credito_e_o_numero_do_contrato()
    {
        await Dividas.AplicarExtratoAsync(Uid, new AplicarExtratoPedido(Extrato(), null, null, null));
        Assert.Equal("Crédito XX 123456", (await Estado()).Titulo);
    }

    [Fact]
    public async Task O_extrato_com_capital_em_atraso_marca_a_divida_em_atraso()
    {
        await Dividas.AplicarExtratoAsync(Uid, new AplicarExtratoPedido(Extrato() with { CapitalVencido = 120.54m }, null, null, null));
        var d = await Estado();
        Assert.True(d.Extrato!.EmAtraso);
        Assert.Equal(Capital + 120.54m, d.ValorInicial); // vencido + vincendo
    }

    [Fact]
    public async Task Aplicar_um_extrato_com_uma_prestacao_que_nao_existe_e_recusado()
    {
        await Assert.ThrowsAsync<PedidoInvalidoException>(() =>
            Dividas.AplicarExtratoAsync(Uid, new AplicarExtratoPedido(Extrato(), null, null, "nao-existe")));
    }

    [Fact]
    public async Task Ler_um_ficheiro_que_nao_e_pdf_ou_esta_estragado_da_erro_claro()
    {
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Dividas.LerExtratoAsync(Uid, "isto nao e base64!!", default));
        var texto = Convert.ToBase64String("isto não é um pdf"u8.ToArray());
        var erro = await Assert.ThrowsAsync<PedidoInvalidoException>(() => Dividas.LerExtratoAsync(Uid, texto, default));
        Assert.Contains("PDF", erro.Message);
    }

    // ---- Editar o contrato ----

    [Fact]
    public async Task Os_campos_do_contrato_alteram_se_e_limpam_se()
    {
        var id = await CriarCredito();
        await Dividas.AlterarAsync(Uid, id, new AlterarDividaPedido(null, null, null, null, ["entrada", "comissaoReembolso"], TaxaAnual: 4.1m, PrazoMeses: 72));

        var d = (await Dividas.ListarAsync(Uid)).Single();
        Assert.Equal((4.1m, 72, (decimal?)null), (d.TaxaAnual, d.PrazoMeses, d.Entrada));

        await Dividas.AlterarAsync(Uid, id, new AlterarDividaPedido(null, null, null, null, ["taxaAnual"]));
        Assert.Null((await Dividas.ListarAsync(Uid)).Single().TaxaAnual);

        await Assert.ThrowsAsync<PedidoInvalidoException>(() =>
            Dividas.AlterarAsync(Uid, id, new AlterarDividaPedido(null, null, null, null, ["titulo"])));
    }
}
