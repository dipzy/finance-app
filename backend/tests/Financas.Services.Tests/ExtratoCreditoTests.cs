using Financas.Services.Dtos;
using Financas.Services.Extratos;
using Financas.Services.Relatorios;
using QuestPDF.Fluent;
using QuestPDF.Helpers;

namespace Financas.Services.Tests;

// Ler o extrato de um crédito em PDF. Os números são os de um extrato real; o nome, a morada, o NIF e o IBAN
// são inventados (e o contrato também). As linhas de texto são as que o leitor de PDF devolve.
public class ExtratoCreditoTests : TestesServicos
{
    private static readonly string[] Linhas =
    [
        "EXTRATO",
        "Mod: Extrato V20170206",
        "JOANA EXEMPLO DA SILVA",
        "R DAS FLORES 10 2ºESQ",
        "1000-001 LISBOA",
        "6/2026 / XX 123456",
        "NÚMERO DO EXTRATO 6 / 2026",
        "DATA EMISSÃO DO EXTRATO 25-09-2026",
        "Nº DE CONTRIBUINTE / Nº CLIENTE 999999990 / 12345678",
        "CONTRATO Nº XX 123456 DATA CONTRATO 01-04-2026",
        "CATEGORIA DO CONTRATO Crédito Pessoal-Finalidade Educação, Saúde e Energias Renováveis",
        "TAN 3,3000 % (Fixa) CAPITAL INICIAL 7.766,69 €",
        "CAPITAL AMORTIZADO 597,59 €",
        "CAPITAL VENCIDO 0,00 €",
        "CAPITAL VINCENDO 7.169,10 €",
        "PRÓXIMA PRESTAÇÃO DO CONTRATO 6 de 60 DATA DE VENCIMENTO 05-10-2026",
        "TAN 3,3000 % (Fixa) MONTANTE TOTAL DA PRESTAÇÃO 156,28 €",
        "CAPITAL 120,54 €",
        "JUROS 19,72 € Imposto do selo 0,79 €",
        "SEGURO VIDA 2,95 €",
        "SEGURO PPT 12,28 €",
        "PAGAMENTO POR DÉBITO DIRETO",
        "IBAN PT50000000000000000000000",
        "No Montepio Crédito a satisfação dos nossos clientes é a nossa prioridade.",
    ];

    // O extrato da Cofidis: tabelas com a etiqueta por cima do valor, datas aaaa-mm-dd e "Nº DOSSIER" em vez de
    // número de contrato. Os valores são os de um extrato real; o nome, a morada, o dossier e o IBAN são inventados.
    // As palavras soltas ("ZYXyVWVSXv"...) são o código de barras do PDF, que o leitor também devolve.
    private static readonly string[] LinhasCofidis =
    [
        "EXTRATO Nº DOSSIER",
        "50000000000001",
        "Crédito Automóvel Cofidis",
        "Data de emissão do extrato",
        "2026-10-01",
        "Capital em dívida à data de emissão do extrato EI;JTeqYDcIZUYIU;EVEIUpeJ ZYXyVWVSXv 521",
        "7072,74 Z2gtBKTjaI",
        "ylOnQQCW84",
        "Próxima prestação do contrato oFS1TVUitI",
        "7 de 60 yPVCzQdoZr",
        "nGisKwMhwI",
        "Data de vencimento da próxima prestação vLLLppvLpv",
        "2026-10-10",
        "JOANA EXEMPLO DA SILVA",
        "Montante total da próxima prestação",
        "162,59 R DAS FLORES 10",
        "1000-001 LISBOA",
        "MENSAGENS PARA SI .......................",
        "CONDIÇÕES INICIAIS DO CONTRATO .......................",
        "Data do contrato Capital inicial Prazo TAN Indexante Spread",
        "8.426 % (se TAN variável) (se TAN variável)",
        "2026-03-16 7700,53 60 meses",
        "- -",
        "CONDIÇÕES DO CONTRATO À DATA DE EMISSÃO DO EXTRATO .......................",
        "Prazo TAN Indexante Spread Seguro",
        "60 meses 8.426 % (se TAN variável) (se TAN variável) Sim",
        "- -",
        "DETALHE DO CAPITAL À DATA DE EMISSÃO DO EXTRATO .......................",
        "Capital Amortizado Capital Vencido Capital Vincendo Capital em dívida",
        "(Já pago) (por regularizar) (por amortizar) (à data de emissão do extrato)",
        "627,79 0,00 7072,74 7072,74",
        "DETALHE DOS VALORES A PAGAR (não inclui eventuais valores em incumprimento) .......................",
        "Montante total da próxima prestação: 162,59",
        "Capital 107,32 Juros 49,66",
        "IS juros remuneratórios 1,99 Prémio seguro 3,62",
        "Total a pagar (prestação + serviços): 162,59",
        "INFORMAÇÃO SOBRE PAGAMENTO ....................... 50000000000001",
        "Forma de pagamento Débito Direto",
        "IBAN da conta a debitar PT50000000000000000000000",
        "Cofidis (sucursal da S.A. francesa Cofidis), NIPC/CRC Lisboa 980125995, com sede em Lisboa.",
    ];

    private static ExtratoCreditoDto Ler(params string[] linhas) => InterpretadorExtratoCredito.Interpretar(linhas);

    private static string[] Sem(params string[] prefixos) => [.. Linhas.Where(l => !prefixos.Any(p => l.Contains(p)))];

    // ---- O interpretador ----

    [Fact]
    public void Le_o_contrato_o_capital_e_a_proxima_prestacao()
    {
        var e = Ler(Linhas);

        Assert.Equal(("Montepio Crédito", "XX 123456"), (e.Credor, e.NumeroContrato));
        Assert.Equal("Crédito Pessoal-Finalidade Educação, Saúde e Energias Renováveis", e.Categoria);
        Assert.Equal((new DateOnly(2026, 4, 1), new DateOnly(2026, 9, 25)), (e.DataContrato, e.EmitidoEm));
        Assert.Equal((3.3m, 7766.69m, 597.59m, 0m, 7169.10m), (e.TaxaAnual, e.CapitalInicial, e.CapitalAmortizado, e.CapitalVencido, e.CapitalVincendo));
        Assert.Equal((6, 60, new DateOnly(2026, 10, 5)), (e.PrestacaoNumero, e.PrestacaoTotal, e.Vencimento));
        Assert.Equal((156.28m, 120.54m, 19.72m, 0.79m, 15.23m), (e.PrestacaoValor, e.PrestacaoCapital, e.PrestacaoJuros, e.PrestacaoSelo, e.PrestacaoSeguros));
        Assert.Empty(e.Avisos); // as contas batem certo
    }

    [Fact]
    public void Nao_devolve_dados_pessoais()
    {
        var json = System.Text.Json.JsonSerializer.Serialize(Ler(Linhas));
        foreach (var pessoal in new[] { "JOANA", "FLORES", "999999990", "12345678", "PT50", "LISBOA" })
        {
            Assert.DoesNotContain(pessoal, json, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void Aceita_maiusculas_minusculas_e_sem_acentos()
    {
        var e = Ler([.. Linhas.Select(l => l.ToLowerInvariant().Replace("ç", "c").Replace("ã", "a").Replace("é", "e").Replace("ó", "o").Replace("ú", "u"))]);
        Assert.Equal((7169.10m, 6, 156.28m), (e.CapitalVincendo, e.PrestacaoNumero, e.PrestacaoValor));
    }

    [Fact]
    public void Capital_em_atraso_da_um_aviso()
    {
        var e = Ler([.. Linhas.Select(l => l.StartsWith("CAPITAL VENCIDO") ? "CAPITAL VENCIDO 120,54 €" : l.StartsWith("CAPITAL VINCENDO") ? "CAPITAL VINCENDO 7.048,56 €" : l)]);
        Assert.Equal(120.54m, e.CapitalVencido);
        Assert.Contains(e.Avisos, a => a.Contains("atraso") && a.Contains("120,54"));
    }

    [Fact]
    public void Sem_seguros_nem_selo_a_prestacao_e_so_capital_e_juros()
    {
        var e = Ler([.. Sem("SEGURO").Select(l => l.StartsWith("MONTANTE") || l.Contains("MONTANTE") ? "TAN 3,3000 % (Fixa) MONTANTE TOTAL DA PRESTAÇÃO 140,26 €" : l.StartsWith("JUROS") ? "JUROS 19,72 €" : l)]);
        Assert.Equal((0m, 0m, 140.26m), (e.PrestacaoSelo, e.PrestacaoSeguros, e.PrestacaoValor));
        Assert.Empty(e.Avisos);
    }

    [Fact]
    public void Uma_prestacao_que_nao_bate_com_a_soma_das_partes_avisa()
    {
        var e = Ler([.. Linhas.Select(l => l.Contains("MONTANTE TOTAL") ? "TAN 3,3000 % (Fixa) MONTANTE TOTAL DA PRESTAÇÃO 200,00 €" : l)]);
        Assert.Contains(e.Avisos, a => a.Contains("não bate certo"));
    }

    [Fact]
    public void O_capital_que_nao_bate_com_inicial_menos_amortizado_avisa()
    {
        var e = Ler([.. Linhas.Select(l => l.StartsWith("CAPITAL VINCENDO") ? "CAPITAL VINCENDO 5.000,00 €" : l)]);
        Assert.Contains(e.Avisos, a => a.Contains("capital em dívida"));
    }

    [Fact]
    public void Sem_capital_vincendo_calcula_o_que_falta()
    {
        var e = Ler(Sem("CAPITAL VINCENDO"));
        Assert.Equal(7169.10m, e.CapitalVincendo);
    }

    [Theory]
    [InlineData("TAN 6.5 %", 6.5)]
    [InlineData("TAN 12 %", 12)]
    [InlineData("TAN 0,0000 %", 0)]
    public void A_taxa_aceita_ponto_ou_virgula(string linha, double taxa)
    {
        var e = Ler([.. Linhas.Select(l => l.StartsWith("TAN 3,3000 % (Fixa) CAPITAL") ? linha + " (Fixa) CAPITAL INICIAL 7.766,69 €" : l)]);
        Assert.Equal((decimal)taxa, e.TaxaAnual);
    }

    [Theory]
    [InlineData("TAN")]
    [InlineData("CAPITAL INICIAL")]
    [InlineData("PRÓXIMA PRESTAÇÃO")]
    [InlineData("TAN 3,3000 % (Fixa) MONTANTE")]
    [InlineData("CONTRATO Nº")]
    public void Sem_as_pecas_essenciais_nao_e_um_extrato_que_se_saiba_ler(string prefixo)
    {
        // Tira as linhas que começam por este texto (em "TAN" cai também o resto: a taxa é essencial)
        var linhas = prefixo == "TAN" ? [.. Linhas.Select(l => l.Replace("TAN", "XXX"))] : Sem(prefixo);
        Assert.Throws<PedidoInvalidoException>(() => Ler(linhas));
    }

    [Fact]
    public void Um_texto_qualquer_nao_e_um_extrato()
    {
        var erro = Assert.Throws<PedidoInvalidoException>(() => Ler("Olá", "isto é uma fatura da luz", "TOTAL 50,00 €"));
        Assert.Contains("Não reconheci", erro.Message);
    }

    [Fact]
    public void Uma_prestacao_depois_do_fim_do_contrato_nao_faz_sentido()
    {
        Assert.Throws<PedidoInvalidoException>(() => Ler([.. Linhas.Select(l => l.StartsWith("PRÓXIMA PRESTAÇÃO") ? "PRÓXIMA PRESTAÇÃO DO CONTRATO 61 de 60 DATA DE VENCIMENTO 05-10-2026" : l)]));
    }

    // ---- O extrato da Cofidis ----

    private static string[] CofidisSem(params string[] prefixos) => [.. LinhasCofidis.Where(l => !prefixos.Any(p => l.StartsWith(p)))];

    [Fact]
    public void Cofidis_le_o_dossier_o_capital_e_a_proxima_prestacao()
    {
        var e = Ler(LinhasCofidis);

        Assert.Equal(("Cofidis", "50000000000001", "Crédito Automóvel Cofidis"), (e.Credor, e.NumeroContrato, e.Categoria));
        Assert.Equal((new DateOnly(2026, 3, 16), new DateOnly(2026, 10, 1)), (e.DataContrato, e.EmitidoEm));
        Assert.Equal((8.426m, 7700.53m, 627.79m, 0m, 7072.74m), (e.TaxaAnual, e.CapitalInicial, e.CapitalAmortizado, e.CapitalVencido, e.CapitalVincendo));
        Assert.Equal((7, 60, new DateOnly(2026, 10, 10)), (e.PrestacaoNumero, e.PrestacaoTotal, e.Vencimento));
        Assert.Equal((162.59m, 107.32m, 49.66m, 1.99m, 3.62m), (e.PrestacaoValor, e.PrestacaoCapital, e.PrestacaoJuros, e.PrestacaoSelo, e.PrestacaoSeguros));
        Assert.Empty(e.Avisos); // as contas batem certo
    }

    [Fact]
    public void Cofidis_nao_devolve_dados_pessoais()
    {
        var json = System.Text.Json.JsonSerializer.Serialize(Ler(LinhasCofidis));
        foreach (var pessoal in new[] { "JOANA", "FLORES", "LISBOA", "PT50", "980125995" })
        {
            Assert.DoesNotContain(pessoal, json, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void Cofidis_aceita_maiusculas_minusculas_e_sem_acentos()
    {
        var e = Ler([.. LinhasCofidis.Select(l => l.ToUpperInvariant().Replace("Ç", "C").Replace("Ã", "A").Replace("É", "E").Replace("Ó", "O").Replace("Õ", "O").Replace("Í", "I").Replace("À", "A"))]);
        Assert.Equal(("50000000000001", 7072.74m, 7, 162.59m), (e.NumeroContrato, e.CapitalVincendo, e.PrestacaoNumero, e.PrestacaoValor));
    }

    [Fact]
    public void Cofidis_sem_o_dossier_no_cabecalho_usa_o_do_pagamento()
    {
        var e = Ler([.. LinhasCofidis.Select(l => l.StartsWith("EXTRATO") ? "EXTRATO" : l).Where(l => l != "50000000000001")]);
        Assert.Equal("50000000000001", e.NumeroContrato);
    }

    [Fact]
    public void Cofidis_sem_o_detalhe_do_capital_calcula_o_que_ja_foi_pago()
    {
        var e = Ler(CofidisSem("627,79"));
        Assert.Equal((627.79m, 0m, 7072.74m), (e.CapitalAmortizado, e.CapitalVencido, e.CapitalVincendo));
        Assert.Empty(e.Avisos);
    }

    [Fact]
    public void Cofidis_com_capital_vencido_da_um_aviso()
    {
        var e = Ler([.. LinhasCofidis.Select(l => l.StartsWith("627,79") ? "627,79 107,32 6965,42 7072,74" : l)]);
        Assert.Equal(107.32m, e.CapitalVencido);
        Assert.Contains(e.Avisos, a => a.Contains("atraso") && a.Contains("107,32"));
    }

    [Fact]
    public void Cofidis_uma_prestacao_que_nao_bate_com_a_soma_das_partes_avisa()
    {
        var e = Ler([.. LinhasCofidis.Select(l => l.StartsWith("Capital 107,32") ? "Capital 100,00 Juros 49,66" : l)]);
        Assert.Contains(e.Avisos, a => a.Contains("não bate certo"));
    }

    [Theory]
    [InlineData("EXTRATO Nº DOSSIER")]
    [InlineData("Próxima prestação")]
    [InlineData("Data de vencimento")]
    [InlineData("Montante total da próxima prestação:")]
    [InlineData("2026-03-16 7700,53")]
    public void Cofidis_sem_as_pecas_essenciais_nao_e_um_extrato_que_se_saiba_ler(string prefixo)
    {
        // Sem o dossier no cabeçalho ainda há o do pagamento: tira-se também
        var linhas = prefixo.Contains("DOSSIER") ? CofidisSem(prefixo, "INFORMAÇÃO SOBRE PAGAMENTO") : CofidisSem(prefixo);
        var erro = Assert.Throws<PedidoInvalidoException>(() => Ler(linhas));
        Assert.Contains("Não reconheci", erro.Message);
    }

    // ---- Do PDF ao extrato (com um PDF feito para o teste: a mesma disposição, dados inventados) ----

    // O Lato vem dentro do QuestPDF; a letra do relatório (Inter) é um subconjunto sem o hífen nem os parênteses
    private const string Letra = "Lato";

    private static byte[] FazerPdf(Action<QuestPDF.Fluent.ColumnDescriptor>? extra = null)
    {
        ConfiguracaoPdf.Configurar();
        return Document.Create(documento => documento.Page(pagina =>
        {
            pagina.Size(PageSizes.A4);
            pagina.Margin(40);
            pagina.DefaultTextStyle(s => s.FontFamily(Letra).FontSize(10));
            pagina.Content().Column(coluna =>
            {
                coluna.Spacing(4);
                coluna.Item().Text("EXTRATO");
                coluna.Item().Text("JOANA EXEMPLO DA SILVA");
                coluna.Item().Row(l => { l.RelativeItem().Text("DATA EMISSÃO DO EXTRATO"); l.RelativeItem().Text("25-09-2026"); });
                coluna.Item().Row(l => { l.RelativeItem().Text("CONTRATO Nº XX 123456"); l.RelativeItem().Text("DATA CONTRATO 01-04-2026"); });
                coluna.Item().Text("CATEGORIA DO CONTRATO Crédito Pessoal");
                // A etiqueta e o valor ficam à mesma altura mas em blocos diferentes, e o valor um pouco acima (como no PDF do banco)
                coluna.Item().Row(l =>
                {
                    l.RelativeItem().Text("TAN 3,3000 % (Fixa)");
                    l.RelativeItem().Text("CAPITAL INICIAL");
                    l.AutoItem().TranslateY(-1.2f).Text("7.766,69 €");
                });
                coluna.Item().Row(l => { l.RelativeItem().Text(""); l.RelativeItem().Text("CAPITAL AMORTIZADO"); l.AutoItem().Text("597,59 €"); });
                coluna.Item().Row(l => { l.RelativeItem().Text(""); l.RelativeItem().Text("CAPITAL VENCIDO"); l.AutoItem().TranslateY(1.0f).Text("0,00 €"); });
                coluna.Item().Row(l => { l.RelativeItem().Text(""); l.RelativeItem().Text("CAPITAL VINCENDO"); l.AutoItem().Text("7.169,10 €"); });
                coluna.Item().Row(l => { l.RelativeItem().Text("PRÓXIMA PRESTAÇÃO DO CONTRATO 6 de 60"); l.RelativeItem().Text("DATA DE VENCIMENTO 05-10-2026"); });
                coluna.Item().Row(l => { l.RelativeItem().Text("TAN 3,3000 % (Fixa)"); l.RelativeItem().Text("MONTANTE TOTAL DA PRESTAÇÃO"); l.AutoItem().Text("156,28 €"); });
                coluna.Item().Row(l => { l.RelativeItem().Text("CAPITAL"); l.RelativeItem().Text("120,54 €"); });
                coluna.Item().Row(l => { l.RelativeItem().Text("JUROS"); l.RelativeItem().Text("19,72 €"); l.RelativeItem().Text("Imposto do selo"); l.AutoItem().Text("0,79 €"); });
                coluna.Item().Row(l => { l.RelativeItem().Text("SEGURO VIDA"); l.RelativeItem().Text("2,95 €"); });
                coluna.Item().Row(l => { l.RelativeItem().Text("SEGURO PPT"); l.RelativeItem().Text("12,28 €"); });
                coluna.Item().Text("IBAN PT50000000000000000000000");
                extra?.Invoke(coluna);
            });
        })).GeneratePdf();
    }

    [Fact]
    public void Do_PDF_ao_extrato_as_palavras_da_mesma_linha_juntam_se_pela_posicao()
    {
        var linhas = LeitorPdf.Linhas(FazerPdf());

        // Cada etiqueta fica na mesma linha do seu valor, mesmo que o valor esteja um pouco acima ou abaixo
        Assert.Contains(linhas, l => l.Contains("CAPITAL INICIAL") && l.Contains("7.766,69"));
        Assert.Contains(linhas, l => l.Contains("CAPITAL VENCIDO") && l.Contains("0,00"));

        var e = InterpretadorExtratoCredito.Interpretar(linhas);
        Assert.Equal(("XX 123456", 3.3m, 7766.69m, 597.59m, 0m, 7169.10m), (e.NumeroContrato, e.TaxaAnual, e.CapitalInicial, e.CapitalAmortizado, e.CapitalVencido, e.CapitalVincendo));
        Assert.Equal((6, 60, new DateOnly(2026, 10, 5), 156.28m), (e.PrestacaoNumero, e.PrestacaoTotal, e.Vencimento, e.PrestacaoValor));
        Assert.Equal((120.54m, 19.72m, 0.79m, 15.23m), (e.PrestacaoCapital, e.PrestacaoJuros, e.PrestacaoSelo, e.PrestacaoSeguros));
        Assert.Empty(e.Avisos);
    }

    [Fact]
    public async Task Ler_e_aplicar_pelo_servico_reconhece_o_mesmo_contrato_no_extrato_seguinte()
    {
        var pdf = Convert.ToBase64String(FazerPdf());

        var primeira = await Dividas.LerExtratoAsync(Uid, pdf);
        Assert.Null(primeira.DividaId); // ainda não há dívida deste contrato
        Assert.Equal("XX 123456", primeira.Extrato.NumeroContrato);

        var id = await Dividas.AplicarExtratoAsync(Uid, new AplicarExtratoPedido(primeira.Extrato, null, "Crédito pessoal", null));

        var segunda = await Dividas.LerExtratoAsync(Uid, pdf);
        Assert.Equal((id, "Crédito pessoal"), (segunda.DividaId, segunda.DividaTitulo));
    }

    [Fact]
    public void Um_pdf_estragado_ou_que_nao_e_um_extrato_da_erro_claro()
    {
        var estragado = Assert.Throws<PedidoInvalidoException>(() => LeitorPdf.Linhas("%PDF-1.7 lixo lixo lixo"u8.ToArray()));
        Assert.Contains("PDF", estragado.Message);

        // Um PDF válido de outra coisa
        ConfiguracaoPdf.Configurar();
        var fatura = Document.Create(d => d.Page(p =>
        {
            p.Size(PageSizes.A4);
            p.DefaultTextStyle(s => s.FontFamily(Letra));
            p.Content().Text("Fatura da luz. Total: 50,00 €");
        })).GeneratePdf();
        Assert.Throws<PedidoInvalidoException>(() => InterpretadorExtratoCredito.Interpretar(LeitorPdf.Linhas(fatura)));
    }
}
