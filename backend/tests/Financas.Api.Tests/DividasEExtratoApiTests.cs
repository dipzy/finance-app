using System.Net;
using System.Text.Json.Nodes;

namespace Financas.Api.Tests;

// Dívidas com taxa, simulador, extrato do credor (PDF) e extrato bancário (CSV/OFX) pelo HTTP: rotas, validação, forma do JSON
// (nomes em camelCase, datas em texto, campos vazios omitidos, enums como texto). As contas estão em Financas.Services.Tests.
public class DividasEExtratoApiTests(FabricaApi fabrica) : IClassFixture<FabricaApi>
{
    private readonly string _uid = $"api-{Guid.NewGuid():N}";

    private HttpClient Cliente() => fabrica.Cliente(_uid);

    private static async Task<JsonNode> Json(HttpResponseMessage resposta) =>
        JsonNode.Parse(await resposta.Content.ReadAsStringAsync())!;

    private static readonly object Extrato = new
    {
        credor = "Montepio Crédito",
        numeroContrato = "XX 123456",
        categoria = "Crédito Pessoal",
        dataContrato = "2026-04-01",
        emitidoEm = "2026-09-25",
        taxaAnual = 3.3,
        capitalInicial = 7766.69,
        capitalAmortizado = 597.59,
        capitalVencido = 0,
        capitalVincendo = 7169.10,
        prestacaoNumero = 6,
        prestacaoTotal = 60,
        vencimento = "2026-10-05",
        prestacaoValor = 156.28,
        prestacaoCapital = 120.54,
        prestacaoJuros = 19.72,
        prestacaoSelo = 0.79,
        prestacaoSeguros = 15.23,
        avisos = Array.Empty<string>(),
    };

    // ---- Dívidas com taxa ----

    [Fact]
    public async Task Uma_divida_com_contrato_devolve_o_resumo_sem_enviar_os_campos_vazios()
    {
        var cliente = Cliente();
        var criada = await cliente.PostJsonAsync("/api/dividas", new
        {
            titulo = "Crédito", valorInicial = 7169.10, desde = "2026-10", taxaAnual = 3.3, valorFinanciado = 7766.69, entrada = 1000, prazoMeses = 60, encargosMensais = 15.23,
        });
        Assert.Equal(HttpStatusCode.Created, criada.StatusCode);

        var divida = (await Json(await cliente.GetAsync("/api/dividas/estado"))).AsArray().Single()!.AsObject();

        Assert.Equal(3.3m, divida["taxaAnual"]!.GetValue<decimal>());
        Assert.Equal(7766.69m, divida["valorFinanciado"]!.GetValue<decimal>());
        Assert.False(divida.ContainsKey("numeroContrato")); // vazio: não vai
        Assert.False(divida.ContainsKey("extrato"));

        var resumo = divida["resumo"]!.AsObject();
        Assert.Equal(8766.69m, resumo["precoTotal"]!.GetValue<decimal>());
        Assert.Equal(597.59m, resumo["capitalAmortizado"]!.GetValue<decimal>());
        Assert.Equal(19.72m, resumo["jurosProximaPrestacao"]!.GetValue<decimal>());
        // Sem prestação ligada não há como saber quando acaba: sem prazo, sem fim e marcada como inviável
        Assert.False(resumo["viavel"]!.GetValue<bool>());
        Assert.False(resumo.ContainsKey("mesesRestantes"));
        Assert.False(resumo.ContainsKey("fim"));
    }

    [Fact]
    public async Task Uma_divida_sem_taxa_continua_igual_a_antes()
    {
        var cliente = Cliente();
        (await cliente.PostJsonAsync("/api/dividas", new { titulo = "Dentista", valorInicial = 100, desde = "2026-10" })).EnsureSuccessStatusCode();

        var divida = (await Json(await cliente.GetAsync("/api/dividas/estado"))).AsArray().Single()!.AsObject();
        Assert.False(divida.ContainsKey("resumo"));
        Assert.False(divida.ContainsKey("taxaAnual"));
        Assert.True(divida.ContainsKey("mesesEmFalta")); // a app distingue null de um número
    }

    [Theory]
    [InlineData("taxaAnual", 101)]
    [InlineData("taxaAnual", -1)]
    [InlineData("prazoMeses", 0)]
    [InlineData("prazoMeses", 1201)]
    [InlineData("valorFinanciado", -5)]
    [InlineData("comissaoReembolso", 120)]
    public async Task Os_campos_do_contrato_sao_validados(string campo, double valor)
    {
        var corpo = new JsonObject { ["titulo"] = "X", ["valorInicial"] = 10, ["desde"] = "2026-10", [campo] = valor };
        var resposta = await Cliente().PostJsonAsync("/api/dividas", corpo);
        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        Assert.Contains(campo, (await Json(resposta))["errors"]!.ToJsonString());
    }

    [Fact]
    public async Task Um_inicio_de_contrato_invalido_e_recusado_e_limpar_aceita_so_campos_conhecidos()
    {
        var cliente = Cliente();
        var recusada = await cliente.PostJsonAsync("/api/dividas", new { titulo = "X", valorInicial = 10, desde = "2026-10", inicioContrato = "10/2026" });
        Assert.Equal(HttpStatusCode.BadRequest, recusada.StatusCode);

        var id = (await (await cliente.PostJsonAsync("/api/dividas", new { titulo = "X", valorInicial = 10, desde = "2026-10", taxaAnual = 5 })).LerAsync<Financas.Services.Dtos.CriadoDto>()).Id;
        Assert.Equal(HttpStatusCode.NoContent, (await cliente.PatchJsonAsync($"/api/dividas/{id}", new { limpar = new[] { "taxaAnual" } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PatchJsonAsync($"/api/dividas/{id}", new { limpar = new[] { "titulo" } })).StatusCode);
    }

    // ---- Simulador ----

    [Fact]
    public async Task O_simulador_responde_com_os_cenarios_e_so_com_os_que_foram_pedidos()
    {
        var cliente = Cliente();
        (await cliente.PostJsonAsync("/api/conta/movimentos", new { valor = 5000 })).EnsureSuccessStatusCode();
        var fixa = (await (await cliente.PostJsonAsync("/api/despesas-fixas", new { titulo = "Crédito", valor = 156.28, diaDebito = 5 })).LerAsync<Financas.Services.Dtos.CriadoDto>()).Id;
        var id = (await (await cliente.PostJsonAsync("/api/dividas", new
        {
            titulo = "Crédito", valorInicial = 7169.10, desde = "2026-10", fixaId = fixa, taxaAnual = 3.3, encargosMensais = 15.23, comissaoReembolso = 0.5,
        })).LerAsync<Financas.Services.Dtos.CriadoDto>()).Id;

        var sem = await Json(await cliente.PostJsonAsync($"/api/dividas/{id}/simulacao", new { }));
        Assert.Equal(7169.10m, sem["capitalEmFalta"]!.GetValue<decimal>());
        Assert.Equal(140.26m, sem["atual"]!["prestacao"]!.GetValue<decimal>());
        Assert.Equal(0, sem["amortizacaoTotal"]!["meses"]!.GetValue<int>());
        Assert.Equal(35.85m, sem["amortizacaoTotal"]!["comissao"]!.GetValue<decimal>());
        Assert.False(sem.AsObject().ContainsKey("manterPrestacao"));
        Assert.False(sem.AsObject().ContainsKey("extraMensal"));
        Assert.False(sem["amortizacaoTotal"]!.AsObject().ContainsKey("fim")); // já não há prestações

        var com = await Json(await cliente.PostJsonAsync($"/api/dividas/{id}/simulacao", new { amortizacao = 2000, extraMensal = 50 }));
        Assert.True(com["manterPrestacao"]!["meses"]!.GetValue<int>() < com["atual"]!["meses"]!.GetValue<int>());
        Assert.Matches(@"^\d{4}-\d{2}$", com["atual"]!["fim"]!.GetValue<string>());
        Assert.NotNull(com["reduzirPrestacao"]);
        Assert.NotNull(com["extraMensal"]);
    }

    [Fact]
    public async Task O_simulador_recusa_com_o_motivo_em_portugues()
    {
        var cliente = Cliente();
        var id = (await (await cliente.PostJsonAsync("/api/dividas", new { titulo = "Dentista", valorInicial = 100, desde = "2026-10" })).LerAsync<Financas.Services.Dtos.CriadoDto>()).Id;

        var semTaxa = await cliente.PostJsonAsync($"/api/dividas/{id}/simulacao", new { amortizacao = 10 });
        Assert.Equal(HttpStatusCode.BadRequest, semTaxa.StatusCode);
        Assert.Contains("taxa", (await Json(semTaxa))["detail"]!.GetValue<string>());

        Assert.Equal(HttpStatusCode.NotFound, (await cliente.PostJsonAsync("/api/dividas/nao-existe/simulacao", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync($"/api/dividas/{id}/simulacao", new { amortizacao = -5 })).StatusCode);
    }

    [Fact]
    public async Task As_estrategias_respondem_com_as_tres_comparacoes()
    {
        var cliente = Cliente();
        var fixa = (await (await cliente.PostJsonAsync("/api/despesas-fixas", new { titulo = "Cartão", valor = 100, diaDebito = 5 })).LerAsync<Financas.Services.Dtos.CriadoDto>()).Id;
        (await cliente.PostJsonAsync("/api/dividas", new { titulo = "Cartão", valorInicial = 1000, desde = "2026-10", fixaId = fixa, taxaAnual = 18 })).EnsureSuccessStatusCode();

        var resposta = await Json(await cliente.PostJsonAsync("/api/dividas/estrategias", new { extraMensal = 50 }));

        Assert.Equal(50, resposta["extraMensal"]!.GetValue<decimal>());
        Assert.Single(resposta["dividas"]!.AsArray());
        foreach (var nome in new[] { "soPrestacoes", "bolaDeNeve", "avalanche" })
        {
            Assert.True(resposta[nome]!["viavel"]!.GetValue<bool>());
            Assert.True(resposta[nome]!["meses"]!.GetValue<int>() > 0);
        }

        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/dividas/estrategias", new { extraMensal = -1 })).StatusCode);
    }

    // ---- Extrato do credor (PDF) ----

    [Fact]
    public async Task Aplicar_um_extrato_cria_a_divida_e_o_estado_traz_a_proxima_prestacao()
    {
        var cliente = Cliente();
        var aplicado = await cliente.PostJsonAsync("/api/dividas/extrato/aplicar", new { extrato = Extrato, titulo = "Crédito pessoal" });
        Assert.Equal(HttpStatusCode.OK, aplicado.StatusCode);
        var id = (await Json(aplicado))["id"]!.GetValue<string>();

        var divida = (await Json(await cliente.GetAsync("/api/dividas/estado"))).AsArray().Single()!.AsObject();
        Assert.Equal(id, divida["id"]!.GetValue<string>());
        Assert.Equal("XX 123456", divida["numeroContrato"]!.GetValue<string>());
        Assert.Equal("2026-10", divida["desde"]!.GetValue<string>());

        var extrato = divida["extrato"]!.AsObject();
        Assert.Equal("2026-10-05", extrato["vencimento"]!.GetValue<string>()); // datas em texto ISO
        Assert.Equal("2026-09-25", extrato["emitidoEm"]!.GetValue<string>());
        Assert.Equal(156.28m, extrato["prestacaoValor"]!.GetValue<decimal>());
        Assert.False(extrato["emAtraso"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Um_extrato_com_valores_impossiveis_e_recusado()
    {
        var cliente = Cliente();
        var invalido = new JsonObject
        {
            ["extrato"] = JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(Extrato)),
        };
        invalido["extrato"]!["taxaAnual"] = 500;
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/dividas/extrato/aplicar", invalido)).StatusCode);

        invalido["extrato"]!["taxaAnual"] = 3.3;
        invalido["extrato"]!["prestacaoNumero"] = 0;
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/dividas/extrato/aplicar", invalido)).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/dividas/extrato/aplicar", new { })).StatusCode); // sem extrato
        Assert.Empty((await Json(await cliente.GetAsync("/api/dividas"))).AsArray());
    }

    [Fact]
    public async Task Ler_um_ficheiro_que_nao_e_um_pdf_responde_400_com_o_motivo()
    {
        var cliente = Cliente();

        var texto = await cliente.PostJsonAsync("/api/dividas/extrato/ler", new { pdfBase64 = Convert.ToBase64String("não sou um pdf"u8.ToArray()) });
        Assert.Equal(HttpStatusCode.BadRequest, texto.StatusCode);
        Assert.Equal("Isto não é um PDF.", (await Json(texto))["detail"]!.GetValue<string>());

        var estragado = await cliente.PostJsonAsync("/api/dividas/extrato/ler", new { pdfBase64 = Convert.ToBase64String("%PDF-1.7 estragado"u8.ToArray()) });
        Assert.Equal(HttpStatusCode.BadRequest, estragado.StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/dividas/extrato/ler", new { pdfBase64 = "" })).StatusCode);
    }

    // ---- Extrato bancário ----

    [Fact]
    public async Task Previsao_e_importacao_do_extrato_bancario()
    {
        var cliente = Cliente();
        var movimentos = new[]
        {
            new { data = "2026-10-05", descricao = "Pingo Doce Lisboa", valor = 45.67, ocorrencia = 0, categoria = (string?)null },
            new { data = "2026-10-06", descricao = "Uber Trip", valor = 12.3, ocorrencia = 0, categoria = (string?)"lazer" },
        };

        var previsao = await Json(await cliente.PostJsonAsync("/api/despesas-extras/extrato/previsao", new { movimentos }));
        var primeiro = previsao["movimentos"]![0]!.AsObject();
        Assert.Equal("supermercado", primeiro["categoria"]!.GetValue<string>());
        Assert.Equal("palavra-chave", primeiro["origem"]!.GetValue<string>()); // enum como texto
        Assert.False(primeiro["jaImportado"]!.GetValue<bool>());
        Assert.False(primeiro.ContainsKey("possivelDuplicadoDe"));
        Assert.Equal("lazer", previsao["movimentos"]![1]!["categoria"]!.GetValue<string>()); // a escolhida

        var importada = await Json(await cliente.PostJsonAsync("/api/despesas-extras/extrato", new { movimentos }));
        Assert.Equal(2, importada["importados"]!.GetValue<int>());
        Assert.Equal(57.97m, importada["total"]!.GetValue<decimal>());
        Assert.Equal("2026-10", importada["meses"]![0]!.GetValue<string>());

        // Não mexeu na conta e as despesas estão lá
        Assert.Equal(0, (await Json(await cliente.GetAsync("/api/conta/saldo")))["saldo"]!.GetValue<decimal>());
        Assert.Equal(2, (await Json(await cliente.GetAsync("/api/despesas-extras?mes=2026-10"))).AsArray().Count);

        // Outra vez: nada de novo
        var repetida = await Json(await cliente.PostJsonAsync("/api/despesas-extras/extrato", new { movimentos }));
        Assert.Equal((0, 2), (repetida["importados"]!.GetValue<int>(), repetida["jaImportados"]!.GetValue<int>()));
    }

    [Fact]
    public async Task O_extrato_bancario_valida_o_pedido()
    {
        var cliente = Cliente();
        var bom = new { data = "2026-10-05", descricao = "Compra", valor = 10, ocorrencia = 0 };

        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/despesas-extras/extrato", new { movimentos = Array.Empty<object>() })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/despesas-extras/extrato", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/despesas-extras/extrato", new { movimentos = new[] { bom with { valor = 0 } } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/despesas-extras/extrato", new { movimentos = new[] { bom with { valor = -5 } } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/despesas-extras/extrato", new { movimentos = new[] { bom with { ocorrencia = -1 } } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/despesas-extras/extrato", new { movimentos = new[] { bom with { descricao = "" } } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/despesas-extras/extrato", new { movimentos = new[] { new { data = "2026-10-05", descricao = "x", valor = 1, ocorrencia = 0, categoria = "inventada" } } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/despesas-extras/extrato", new { movimentos = new[] { new { descricao = "x", valor = 1, ocorrencia = 0 } } })).StatusCode); // sem data
        Assert.Equal(HttpStatusCode.Unauthorized, (await fabrica.CreateClient().PostJsonAsync("/api/despesas-extras/extrato", new { movimentos = new[] { bom } })).StatusCode);
    }
}
