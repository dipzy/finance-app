using Financas.DAL.Entidades;
using Financas.Services.Dtos;

namespace Financas.Services.Tests;

// Porte de __tests__/folhaMes.test.ts e das partes de __tests__/importarExcel.test.ts e
// __tests__/exportarExcel.test.ts que dependiam dos dados (a leitura e a escrita do ficheiro
// Excel continuam na app e nos testes TypeScript).

internal static class Folhas
{
    public static LinhaFolhaDto L(string titulo, decimal valor, bool? informativo = null) => new(titulo, valor, null, informativo);

    public static DadosFolhaMesDto Folha(
        string mes,
        IReadOnlyList<LinhaFolhaDto>? lucro = null,
        IReadOnlyList<LinhaFolhaDto>? despesas = null,
        IReadOnlyList<LinhaFolhaDto>? poupanca = null,
        IReadOnlyList<LinhaFolhaDto>? despesasMes = null,
        IReadOnlyList<LinhaFolhaDto>? anual = null,
        decimal? saldoConta = null,
        IReadOnlyList<LinhaFolhaDto>? falta = null,
        IReadOnlyList<LinhaFolhaDto>? saldoPoupanca = null,
        IReadOnlyList<LinhaFolhaDto>? totalAPagar = null) =>
        new(mes, lucro ?? [], despesas ?? [], poupanca ?? [], despesasMes ?? [], anual ?? [], saldoConta, falta ?? [], saldoPoupanca ?? [], totalAPagar ?? []);

    // Uma folha como a "Abril Ana" do livro Excel
    public static readonly DadosFolhaMesDto Abril = Folha(
        "2026-04",
        lucro: [L("Ordenado", 1276), L("Alimen.", 218, informativo: true)],
        despesas: [L("Carro", 162), L("Dentista", 156.28m), L("Ginásio", 20)],
        poupanca: [L("Revolut/C.A", 600), L("PPR", 50)],
        despesasMes: [L("Temu", 21.44m), L("Bilhetes UDL", 15.75m)],
        saldoConta: 745.12m);

    // A folha "Março Ana" do livro de teste (test-utils/livroExcel.ts), tal como a app a lê (ESPERADO)
    public static readonly DadosFolhaMesDto MarcoAna = Folha(
        "2026-03",
        lucro: [L("Salário", 1500), L("Alimentação", 150, informativo: true)],
        despesas: [L("Renda", 600), L("Internet", 35), L("Luz", 42.3m)],
        poupanca: [L("Conta poupança", 200), L("PPR", 50)],
        despesasMes: [L("Supermercado", 85.5m), L("Cinema", 12), L("Jantar fora", 40.95m), L("Prenda", 25)],
        anual: [L("Seguro carro", 300), L("IUC", 120)],
        saldoConta: 950.4m,
        falta: [L("Ginásio", 25), L("Combustível", 30)],
        saldoPoupanca: [L("Conta poupança total", 3000), L("Certificados", 1000)],
        totalAPagar: [L("Carro", 4000), L("Dentista", 1000)]);
}

public class ImportarFolhaTests : TestesServicos
{
    private static readonly DadosFolhaMesDto Abril = Folhas.Abril;

    private Task<ResumoImportacaoDto> Importar(DadosFolhaMesDto dados, OpcoesImportacaoDto? opcoes = null) =>
        Folha.ImportarAsync(Uid, dados.Mes, dados, opcoes);

    [Fact]
    public async Task Cria_as_despesas_mensais_e_regista_o_historico_do_mes_sem_mexer_na_conta_de_hoje()
    {
        await Adicionar(1000);
        var resumo = await Importar(Abril);

        Assert.Equal(["Carro", "Dentista", "Ginásio"], resumo.DespesasCriadas);
        Assert.Equal((3, 2), (resumo.PagamentosRegistados, resumo.ExtrasRegistadas));
        Assert.Equal(1000, await CalcularSaldoDisponivel());
        Assert.Equal(
            [("Carro", 162m), ("Dentista", 156.28m), ("Ginásio", 20m)],
            (await PagamentosDoMes("2026-04")).Select(p => (p.Titulo, p.Valor)).Order());
        Assert.Equal(37.19m, await TotalExtras("2026-04"));
    }

    [Fact]
    public async Task Importar_o_mesmo_mes_outra_vez_nao_duplica_nada()
    {
        await Importar(Abril);
        var segunda = await Importar(Abril);

        Assert.Empty(segunda.DespesasCriadas);
        Assert.Equal((0, 0), (segunda.PagamentosRegistados, segunda.ExtrasRegistadas));
        Assert.Equal(5, segunda.Ignoradas.Count);
        Assert.Equal(3, (await ListarFixas()).Count);
    }

    [Fact]
    public async Task O_mes_seguinte_reutiliza_as_despesas_mensais_com_o_mesmo_nome_sem_ligar_a_acentos_nem_maiusculas()
    {
        await Importar(Abril);
        await Importar(Abril with { Mes = "2026-05", Despesas = [Folhas.L("ginasio ", 20), Folhas.L("Telemóvel", 10)], DespesasMes = [] });

        Assert.Equal(["Carro", "Dentista", "Ginásio", "Telemóvel"], (await ListarFixas()).Select(f => f.Titulo));
        Assert.Equal(2, (await PagamentosDoMes("2026-05")).Count);
    }

    [Fact]
    public async Task As_despesas_criadas_pela_importacao_comecam_no_mes_importado_e_contam_dai_para_a_frente()
    {
        await Importar(Abril);
        Assert.All(await ListarFixas(), f => Assert.Equal("2026-04", f.Inicio));
        Assert.Equal(
            ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
            await Folha.MesesComDadosAsync(Uid));
    }

    [Fact]
    public async Task Anual_cria_despesas_anuais_com_o_mes_por_escolher_que_nao_contam_em_nenhum_mes()
    {
        await Adicionar(1000);
        var resumo = await Importar(Abril with { Anual = [Folhas.L("Seguro Carro", 715.2m), Folhas.L("Via Verde", 15)] });
        Assert.Equal(["Seguro Carro", "Via Verde"], resumo.AnuaisCriadas);

        var anuais = (await ListarFixas()).Where(f => f.Periodicidade == Periodicidade.Anual);
        Assert.Equal([("Seguro Carro", (int?)null), ("Via Verde", (int?)null)], anuais.Select(a => (a.Titulo, a.MesAnual)));
        Assert.Equal(1000, await CalcularSaldoDisponivel());

        // Reimportar não duplica
        Assert.Empty((await Importar(Abril with { Anual = [Folhas.L("seguro carro", 715.2m)] })).AnuaisCriadas);
    }

    [Fact]
    public async Task Lucro_Poupanca_Saldo_Conta_Saldo_Poupanca_e_Total_a_pagar_ficam_como_historico()
    {
        var resumo = await Importar(Abril with
        {
            SaldoPoupanca = [Folhas.L("Certificados", 3000)],
            TotalAPagar = [Folhas.L("Carro", 6990)],
        });
        Assert.Equal(["Lucro", "Poupança", "Saldo Poupança", "Total a pagar", "Saldo Conta"], resumo.Historico);

        var folha = await Folha.ObterDadosAsync(Uid, "2026-04");
        Assert.Equal([Folhas.L("Certificados", 3000)], folha.SaldoPoupanca);
        Assert.Equal([Folhas.L("Carro", 6990)], folha.TotalAPagar);
        // Sem pedir, não mexe nas poupanças nem nas dívidas atuais
        Assert.Empty(resumo.PoupancasAtualizadas);
        Assert.Empty(resumo.DividasAtualizadas);
    }

    [Fact]
    public async Task Se_pedido_atualiza_os_saldos_das_poupancas_e_as_dividas_com_os_valores_da_folha()
    {
        var certificados = await AdicionarPoupanca("Certificado de Aforro", TipoContribuicao.Valor, "0", 1500);
        var resumo = await Importar(
            Abril with
            {
                Mes = "2026-09",
                SaldoPoupanca = [Folhas.L("certificado de aforro", 3000), Folhas.L("Trade Republic", 4000)],
                TotalAPagar = [Folhas.L("Carro", 7179)],
            },
            new OpcoesImportacaoDto(AtualizarSaldosPoupancas: true, AtualizarDividas: true));

        Assert.Equal(["certificado de aforro", "Trade Republic"], resumo.PoupancasAtualizadas);
        var poupancas = await Poupancas.ListarAsync(Uid);
        Assert.Equal(
            [("Certificado de Aforro", 3000m, "0"), ("Trade Republic", 4000m, "0")],
            poupancas.Select(p => (p.Nome, p.Saldo, p.Valor)).Order());
        Assert.Equal(3000, poupancas.Single(p => p.Id == certificados).Saldo);

        // A dívida liga-se à despesa mensal "Carro" (criada pela importação) e desconta a partir de outubro
        var carro = Assert.Single(await Dividas.ListarComEstadoAsync(Uid));
        Assert.Equal(("Carro", 7179m, "2026-10", 7179m, (decimal?)162m), (carro.Titulo, carro.ValorInicial, carro.Desde, carro.EmFalta, carro.Prestacao));
    }

    [Fact]
    public async Task A_importacao_da_folha_nao_mexe_no_capital_das_dividas_com_taxa()
    {
        await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Carro", 7169.10m, "2026-10", null, TaxaAnual: 3.3m));
        await Importar(
            Abril with { Mes = "2026-09", TotalAPagar = [Folhas.L("Carro", 8000)] },
            new OpcoesImportacaoDto(AtualizarDividas: true));

        var carro = Assert.Single(await Dividas.ListarAsync(Uid));
        Assert.Equal((7169.10m, "2026-10"), (carro.ValorInicial, carro.Desde)); // o total a pagar da folha inclui juros futuros: não é o capital
    }

    [Fact]
    public async Task Duas_linhas_iguais_na_mesma_folha_sao_duas_despesas_extras_e_importar_outra_vez_nao_duplica()
    {
        var dados = Abril with { DespesasMes = [Folhas.L("Café", 2), Folhas.L("Café", 2)] };
        Assert.Equal(2, (await Importar(dados)).ExtrasRegistadas);
        Assert.Equal(0, (await Importar(dados)).ExtrasRegistadas);
        Assert.Equal(2, (await ExtrasDoMes("2026-04")).Count);
    }

    [Fact]
    public async Task Importar_um_mes_anterior_faz_a_despesa_que_ja_existia_contar_desde_esse_mes()
    {
        await Importar(Abril with { Mes = "2026-06", DespesasMes = [] });
        await Importar(Abril);

        var fixas = await ListarFixas();
        Assert.Equal(3, fixas.Count);
        Assert.All(fixas, f => Assert.Equal("2026-04", f.Inicio));
    }

    [Fact]
    public async Task Mes_atual_o_que_esta_na_Falta_fica_por_pagar_o_resto_fica_pago_sem_sair_da_conta()
    {
        await Adicionar(1000);
        var resumo = await Importar(Abril with { Mes = "2026-10", DespesasMes = [], Falta = [Folhas.L("ginasio", 20)] });

        Assert.Equal(["Ginásio"], resumo.PorPagar);
        Assert.Equal(2, resumo.PagamentosRegistados);
        Assert.Equal(["Carro", "Dentista"], (await PagamentosDoMes("2026-10")).Select(p => p.Titulo).Order());
        Assert.Equal(1000, await CalcularSaldoDisponivel());
    }

    [Fact]
    public async Task Meses_passados_a_Falta_nao_muda_nada_fica_tudo_pago()
    {
        var resumo = await Importar(Abril with { Falta = [Folhas.L("Ginásio", 20)] });
        Assert.Empty(resumo.PorPagar);
        Assert.Equal(3, resumo.PagamentosRegistados);
    }

    // De __tests__/importarExcel.test.ts: a folha "Março Ana" lida do livro de teste
    [Fact]
    public async Task Grava_as_despesas_e_as_despesas_do_mes_da_folha_lida_do_Excel_sem_mexer_na_conta_de_hoje()
    {
        await Adicionar(500);
        var resumo = await Importar(Folhas.MarcoAna);

        Assert.Equal(["Renda", "Internet", "Luz"], resumo.DespesasCriadas);
        Assert.Equal((3, 4), (resumo.PagamentosRegistados, resumo.ExtrasRegistadas));
        Assert.Equal(500, await CalcularSaldoDisponivel());
        Assert.Equal([35m, 42.3m, 600m], (await PagamentosDoMes("2026-03")).Select(p => p.Valor).Order());
        Assert.Equal(163.45m, await TotalExtras("2026-03"));

        // Importar a mesma folha outra vez não duplica nada
        var outraVez = await Importar(Folhas.MarcoAna);
        Assert.Empty(outraVez.DespesasCriadas);
        Assert.Equal((0, 0), (outraVez.PagamentosRegistados, outraVez.ExtrasRegistadas));
        Assert.Equal(7, outraVez.Ignoradas.Count);
    }
}

public class FolhaDoMesTests : TestesServicos
{
    [Fact]
    public async Task Tem_os_blocos_do_livro_Excel()
    {
        await Adicionar(900);
        await GuardarSalario("1276", 25, "180");
        await GuardarPprPoupanca(TipoContribuicao.Valor, "50", TipoContribuicao.Valor, "600");
        await AdicionarFixa("Carro", 162, diaDebito: 1);
        await AdicionarFixa("Dentista", 159.25m, diaDebito: 20);
        await CalcularSaldoDisponivel(); // paga o carro (dia 1)
        await AdicionarExtra("Jantar", 30, Dia(2026, 10, 4));

        var folha = await Folha.ObterDadosAsync(Uid, "2026-10");
        Assert.Equal([Folhas.L("Ordenado", 1276), Folhas.L("Alimen.", 180, informativo: true)], folha.Lucro);
        // Cada despesa mensal com o seu estado no mês (paga com a data do pagamento, ou por pagar)
        Assert.Equal(
            [
                new LinhaFolhaDto("Carro", 162, Dia(2026, 10, 5), Estado: EstadoLinha.Pago),
                new LinhaFolhaDto("Dentista", 159.25m, Estado: EstadoLinha.PorPagar),
            ],
            folha.Despesas);
        Assert.Equal([Folhas.L("PPR", 50), Folhas.L("Poupança", 600)], folha.Poupanca);
        Assert.Equal([new LinhaFolhaDto("Jantar", 30, Dia(2026, 10, 4))], folha.DespesasMes);
        Assert.Equal(708, folha.SaldoConta); // 900 - 162 - 30
        Assert.Equal([Folhas.L("Dentista", 159.25m)], folha.Falta);
    }

    [Fact]
    public async Task Despesa_paga_so_em_parte_mostra_o_que_ja_foi_pago_e_o_que_falta_pagar()
    {
        await Adicionar(500);
        var combustivel = await AdicionarFixa("Combustível", 100);
        await Fixas.DebitarParcialAsync(Uid, combustivel, 68.57m);

        var folha = await Folha.ObterDadosAsync(Uid, "2026-10");
        var linha = Assert.Single(folha.Despesas);
        Assert.Equal((EstadoLinha.Parcial, 68.57m, 31.43m), (linha.Estado, linha.Valor, linha.ValorEmFalta));
        Assert.Equal([Folhas.L("Combustível", 31.43m)], folha.Falta);
    }

    [Fact]
    public async Task Meses_passados_o_saldo_e_os_blocos_vem_do_que_foi_importado_sem_falta()
    {
        await Folha.ImportarAsync(Uid, "2026-04", Folhas.Abril, null);
        var folha = await Folha.ObterDadosAsync(Uid, "2026-04");
        Assert.Equal(745.12m, folha.SaldoConta);
        Assert.Equal(Folhas.Abril.Lucro, folha.Lucro);
        Assert.Equal(Folhas.Abril.Poupanca, folha.Poupanca);
        Assert.Empty(folha.Falta);
        Assert.Equal([162m, 156.28m, 20m], folha.Despesas.Select(d => d.Valor));
    }

    // De __tests__/exportarExcel.test.ts: os meses a exportar e o saldo atualizado antes de exportar
    [Fact]
    public async Task Exportar_os_meses_desde_o_primeiro_com_dados_ate_ao_atual_com_o_saldo_ja_atualizado()
    {
        await Adicionar(1000);
        await AdicionarFixa("Renda", 600, diaDebito: 1, inicio: "2026-08");

        await CalcularSaldoDisponivel(); // a exportação começa por aqui: a renda (dia 1) é debitada
        Assert.Equal(["2026-08", "2026-09", "2026-10"], await Folha.MesesComDadosAsync(Uid));
        Assert.Equal(400, (await Folha.ObterDadosAsync(Uid, "2026-10")).SaldoConta);
    }
}
