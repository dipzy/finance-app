using System.Net;
using System.Text.Json.Nodes;
using Financas.Services.Dtos;
using Financas.Services.Regras;

namespace Financas.Api.Tests;

// Testes de integração: pedidos HTTP verdadeiros contra a API em memória. Aqui interessa o que é
// "do HTTP": autenticação, rotas, validação, códigos de estado, ProblemDetails, forma do JSON e
// alguns fluxos de ponta a ponta. As regras de negócio estão testadas em Financas.Services.Tests.
public class ApiTests(FabricaApi fabrica) : IClassFixture<FabricaApi>
{
    // Um utilizador novo por teste (os testes da classe partilham a mesma base de dados)
    private readonly string _uid = $"api-{Guid.NewGuid():N}";

    private HttpClient Cliente() => fabrica.Cliente(_uid);

    private static async Task<JsonNode> Json(HttpResponseMessage resposta) =>
        JsonNode.Parse(await resposta.Content.ReadAsStringAsync())!;

    [Fact]
    public async Task Saude_responde_sem_autenticacao()
    {
        var resposta = await fabrica.CreateClient().GetAsync("/saude");
        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        Assert.Equal("ok", (await Json(resposta))["estado"]!.GetValue<string>());
    }

    [Fact]
    public async Task Sem_autenticacao_responde_401_com_ProblemDetails_em_portugues()
    {
        var resposta = await fabrica.CreateClient().GetAsync("/api/conta");
        Assert.Equal(HttpStatusCode.Unauthorized, resposta.StatusCode);
        Assert.Equal("application/problem+json", resposta.Content.Headers.ContentType?.MediaType);
        Assert.Equal("Sessão inválida ou expirada", (await Json(resposta))["title"]!.GetValue<string>());
    }

    [Fact]
    public async Task Cada_utilizador_so_ve_os_seus_dados()
    {
        var outro = fabrica.Cliente($"outro-{Guid.NewGuid():N}");
        (await Cliente().PostJsonAsync("/api/despesas-extras", new { titulo = "Jantar", valor = 20 })).EnsureSuccessStatusCode();

        Assert.Single(await Cliente().GetJsonAsync<List<DespesaExtraDto>>("/api/despesas-extras"));
        Assert.Empty(await outro.GetJsonAsync<List<DespesaExtraDto>>("/api/despesas-extras"));
        Assert.Equal(0, (await outro.GetJsonAsync<SaldoDto>("/api/conta/saldo")).Saldo);
    }

    [Fact]
    public async Task Despesas_extras_saem_da_conta_ao_registar_e_voltam_ao_apagar()
    {
        var cliente = Cliente();
        (await cliente.PostJsonAsync("/api/conta/movimentos", new { valor = 1000 })).EnsureSuccessStatusCode();

        var criada = await cliente.PostJsonAsync("/api/despesas-extras", new { titulo = "Jantar", valor = 45.5, data = "2026-10-05" });
        Assert.Equal(HttpStatusCode.Created, criada.StatusCode);
        var id = (await criada.LerAsync<CriadoDto>()).Id;
        Assert.Equal(954.5m, (await cliente.GetJsonAsync<SaldoDto>("/api/conta/saldo")).Saldo);

        Assert.Equal(HttpStatusCode.NoContent, (await cliente.DeleteAsync($"/api/despesas-extras/{id}")).StatusCode);
        Assert.Equal(1000, (await cliente.GetJsonAsync<SaldoDto>("/api/conta/saldo")).Saldo);
        Assert.Empty(await cliente.GetJsonAsync<List<DespesaExtraDto>>("/api/despesas-extras?mes=2026-10"));
    }

    [Fact]
    public async Task O_JSON_tem_os_nomes_e_valores_que_a_app_espera()
    {
        var cliente = Cliente();
        var criada = await cliente.PostJsonAsync("/api/despesas-fixas", new { titulo = "Seguro", valor = 715.2, periodicidade = "anual", mesAnual = 3 });
        var id = (await criada.LerAsync<CriadoDto>()).Id;
        (await cliente.PostJsonAsync("/api/dividas", new { titulo = "Dentista", valorInicial = 100, desde = "2026-10" })).EnsureSuccessStatusCode();

        var fixa = (await Json(await cliente.GetAsync("/api/despesas-fixas"))).AsArray().Single()!;
        Assert.Equal(id, fixa["id"]!.GetValue<string>());
        Assert.Equal("anual", fixa["periodicidade"]!.GetValue<string>()); // enum como texto
        Assert.Equal("2026-10", fixa["inicio"]!.GetValue<string>());
        Assert.False(fixa.AsObject().ContainsKey("fim")); // null não é enviado (fica undefined na app)

        // ... exceto onde a app distingue null de um número
        var divida = (await Json(await cliente.GetAsync("/api/dividas/estado"))).AsArray().Single()!.AsObject();
        Assert.True(divida.ContainsKey("mesesEmFalta"));
        Assert.Null(divida["mesesEmFalta"]);
    }

    [Fact]
    public async Task Debitar_devolve_o_resultado_como_na_app()
    {
        var cliente = Cliente();
        var id = (await (await cliente.PostJsonAsync("/api/despesas-fixas", new { titulo = "Renda", valor = 300, diaDebito = 20 })).LerAsync<CriadoDto>()).Id;

        async Task<string> Debitar() =>
            (await Json(await cliente.PostAsync($"/api/despesas-fixas/{id}/debitar?mes=2026-10", null)))["resultado"]!.GetValue<string>();

        Assert.Equal("saldo-insuficiente", await Debitar());
        (await cliente.PostJsonAsync("/api/conta/movimentos", new { valor = 1000 })).EnsureSuccessStatusCode();
        Assert.Equal("debitada", await Debitar());
        Assert.Equal("ja-debitada", await Debitar());

        var pagamento = Assert.Single(await cliente.GetJsonAsync<List<PagamentoFixaDto>>("/api/pagamentos?mes=2026-10"));
        Assert.Equal(PagamentoFixaDtoEsperado(id), pagamento with { Data = default });
        Assert.True((await cliente.PostAsync($"/api/despesas-fixas/{id}/anular", null)).IsSuccessStatusCode);
        Assert.Equal(1000, (await cliente.GetJsonAsync<Saldos>("/api/conta/saldos")).Disponivel);
        Assert.Empty(await cliente.GetJsonAsync<List<PagamentoFixaDto>>("/api/pagamentos?mes=2026-10"));
    }

    private static PagamentoFixaDto PagamentoFixaDtoEsperado(string id) =>
        new($"2026-10_{id}", id, "2026-10", "Renda", 300, default, DAL.Entidades.EstadoPagamento.Pago);

    [Fact]
    public async Task Dados_invalidos_respondem_400_com_os_erros_de_cada_campo()
    {
        var cliente = Cliente();

        var mes = await cliente.GetAsync("/api/conta/saldos?mes=2026-13");
        Assert.Equal(HttpStatusCode.BadRequest, mes.StatusCode);
        var problema = await Json(mes);
        Assert.Equal("Dados inválidos", problema["title"]!.GetValue<string>());
        Assert.NotNull(problema["errors"]!["mes"]);

        // Os erros vêm com os nomes do JSON e em português
        var semTitulo = await Json(await cliente.PostJsonAsync("/api/despesas-extras", new { valor = 10 }));
        Assert.Equal("titulo: obrigatório.", semTitulo["errors"]!["titulo"]![0]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/despesas-extras", new { titulo = "x", valor = -5 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PutJsonAsync("/api/salario", new { valor = "1500", diaRecebimento = 32 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.GetAsync("/api/pagamentos")).StatusCode);
    }

    [Fact]
    public async Task Alterar_o_que_nao_existe_responde_404()
    {
        var resposta = await Cliente().PatchJsonAsync("/api/despesas-fixas/nao-existe", new { titulo = "x" });
        Assert.Equal(HttpStatusCode.NotFound, resposta.StatusCode);
        var problema = await Json(resposta);
        Assert.Equal("Não encontrado", problema["title"]!.GetValue<string>());
        Assert.Equal("Despesa não encontrada.", problema["detail"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.NotFound, (await Cliente().GetAsync("/api/meses/2020-01")).StatusCode);
    }

    [Fact]
    public async Task Accept_Language_en_traduz_os_problem_details_para_ingles()
    {
        var cliente = fabrica.Cliente(_uid);
        cliente.DefaultRequestHeaders.Add("Accept-Language", "en");

        // 404 de negócio: o detail vem da mensagem da exceção da camada de serviços
        var resposta = await cliente.PatchJsonAsync("/api/despesas-fixas/nao-existe", new { titulo = "x" });
        var problema = await Json(resposta);
        Assert.Equal("Not found", problema["title"]!.GetValue<string>());
        Assert.Equal("Expense not found.", problema["detail"]!.GetValue<string>());

        // Validação de um DTO (400): título e erros de cada campo traduzidos
        var semTitulo = await Json(await cliente.PostJsonAsync("/api/despesas-extras", new { valor = 10 }));
        Assert.Equal("Invalid data", semTitulo["title"]!.GetValue<string>());
        Assert.Equal("titulo: required.", semTitulo["errors"]!["titulo"]![0]!.GetValue<string>());

        // Mensagem composta no serviço (interpolação) também traduzida
        await cliente.PostJsonAsync("/api/orcamentos", new { categoria = "restauracao", limite = 100 });
        var orcamentoRepetido = await Json(await cliente.PostJsonAsync("/api/orcamentos", new { categoria = "restauracao", limite = 50 }));
        Assert.Equal("Conflict", orcamentoRepetido["title"]!.GetValue<string>());
        Assert.Contains("Dining out", orcamentoRepetido["detail"]!.GetValue<string>());
    }

    [Fact]
    public async Task Configuracoes_ainda_por_fazer_respondem_204()
    {
        Assert.Equal(HttpStatusCode.NoContent, (await Cliente().GetAsync("/api/salario")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Cliente().GetAsync("/api/configuracoes/ppr-poupanca")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Cliente().GetAsync("/api/configuracoes/financeiro")).StatusCode);
    }

    [Fact]
    public async Task Folha_do_mes_importar_e_ler_por_HTTP()
    {
        var cliente = Cliente();
        var dados = new
        {
            mes = "2026-04",
            lucro = new object[] { new { titulo = "Ordenado", valor = 1276 }, new { titulo = "Alimen.", valor = 218, informativo = true } },
            despesas = new[] { new { titulo = "Carro", valor = 162 }, new { titulo = "Ginásio", valor = 20 } },
            poupanca = new[] { new { titulo = "PPR", valor = 50 } },
            despesasMes = new[] { new { titulo = "Temu", valor = 21.44, data = "2026-04-12" } },
            anual = Array.Empty<object>(),
            saldoConta = 745.12,
            falta = Array.Empty<object>(),
            saldoPoupanca = Array.Empty<object>(),
            totalAPagar = Array.Empty<object>(),
        };

        var resumo = await (await cliente.PostJsonAsync("/api/folha/2026-04/importar", new { dados, opcoes = new { atualizarSaldosPoupancas = false } }))
            .LerAsync<ResumoImportacaoDto>();
        Assert.Equal(["Carro", "Ginásio"], resumo.DespesasCriadas);
        Assert.Equal(1, resumo.ExtrasRegistadas);

        var folha = await cliente.GetJsonAsync<DadosFolhaMesDto>("/api/folha/2026-04");
        Assert.Equal(745.12m, folha.SaldoConta);
        Assert.Equal(new LinhaFolhaDto("Temu", 21.44m, new DateOnly(2026, 4, 12)), Assert.Single(folha.DespesasMes));
        Assert.True(folha.Lucro[1].Informativo);
        Assert.Equal(
            ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
            await cliente.GetJsonAsync<List<string>>("/api/folha/meses"));
    }

    [Fact]
    public async Task Migracao_do_Firestore_so_uma_vez()
    {
        var cliente = Cliente();
        Assert.Equal(new EstadoMigracaoDto(false, false), await cliente.GetJsonAsync<EstadoMigracaoDto>("/api/migracao/estado"));

        // Tal como a app o envia: os nomes dos documentos do Firestore
        var dump = JsonNode.Parse("""
            {
              "utilizador": {
                "email": "teste@exemplo.pt", "name": "Teste",
                "contaCorrente": { "saldo": 1234.5, "ultimaAtualizacao": "2026-10-01T08:00:00.000Z" },
                "salario": { "valor": "1500", "diaRecebimento": 25, "lastReceived": "2026-09-25T10:00:00.000Z" },
                "configPPRPoupanca": { "pprTipo": "percentagem", "pprValor": "10", "poupancaTipo": "valor", "poupancaValor": "200" },
                "migracoes": { "pagamentosPorMes": true, "poupancasLista": true }
              },
              "despesasFixas": [ { "id": "abc", "titulo": "Renda", "valor": 600, "diaDebito": 20, "inicio": "2026-01", "criadoEm": "2026-01-02T10:00:00.000Z" } ],
              "pagamentosFixas": [ { "id": "2026-09_abc", "fixaId": "abc", "mes": "2026-09", "titulo": "Renda", "valor": 600, "data": "2026-09-20", "estado": "pago" } ],
              "despesasExtras": [ { "id": "x1", "titulo": "Café", "valor": 1.2, "data": "2026-10-01", "mes": "2026-10", "descontadaDaConta": true, "criadoEm": "2026-10-01T09:00:00.000Z" } ],
              "poupancas": [ { "id": "p1", "nome": "PPR", "tipo": "percentagem", "valor": "10", "saldo": 300, "ordem": 0 } ],
              "dividas": [],
              "meses": [ { "id": "2026-09", "saldoInicial": 900, "saldoFinal": 1234.5 } ]
            }
            """)!;

        var resumo = await (await cliente.PostJsonAsync("/api/migracao", dump)).LerAsync<ResumoMigracaoDto>();
        Assert.Equal((1, 1, 1, 1), (resumo.DespesasFixas, resumo.PagamentosFixas, resumo.DespesasExtras, resumo.Poupancas));
        Assert.Equal(new EstadoMigracaoDto(true, true), await cliente.GetJsonAsync<EstadoMigracaoDto>("/api/migracao/estado"));
        Assert.Equal(1234.5m, (await cliente.GetJsonAsync<ContaCorrenteDto>("/api/conta")).Saldo);
        Assert.Equal("abc", Assert.Single(await cliente.GetJsonAsync<List<DespesaFixaDto>>("/api/despesas-fixas")).Id);

        var segunda = await cliente.PostJsonAsync("/api/migracao", dump);
        Assert.Equal(HttpStatusCode.Conflict, segunda.StatusCode);
        Assert.Contains("só é feita uma vez", (await Json(segunda))["detail"]!.GetValue<string>());
    }

    [Fact]
    public async Task O_dia_do_salario_por_HTTP_so_entra_uma_vez()
    {
        // Uma fábrica própria: este teste muda o relógio
        await using var propria = new FabricaApi();
        var cliente = propria.Cliente(_uid);
        (await cliente.PutJsonAsync("/api/salario", new { valor = "1500", diaRecebimento = 25 })).EnsureSuccessStatusCode();

        propria.DefinirHoje(2026, 10, 25);
        Assert.Equal(1500, (await cliente.GetJsonAsync<SaldoDto>("/api/conta/saldo")).Saldo);
        Assert.Equal(HttpStatusCode.NoContent, (await cliente.PostAsync("/api/salario/receber", null)).StatusCode);
        Assert.Equal(1500, (await cliente.GetJsonAsync<SaldoDto>("/api/conta/saldo")).Saldo);

        var salario = await cliente.GetJsonAsync<SalarioConfigDto>("/api/salario");
        Assert.NotNull(salario.LastReceived);
        Assert.Equal(1500, salario.UltimoRecebimento!.Liquido);
    }

    [Fact]
    public async Task CORS_so_para_as_origens_configuradas()
    {
        async Task<HttpResponseMessage> Preflight(string origem)
        {
            var pedido = new HttpRequestMessage(HttpMethod.Options, "/api/conta");
            pedido.Headers.Add("Origin", origem);
            pedido.Headers.Add("Access-Control-Request-Method", "GET");
            pedido.Headers.Add("Access-Control-Request-Headers", "authorization");
            return await fabrica.CreateClient().SendAsync(pedido);
        }

        var permitida = await Preflight("https://financas-app-2ffc6.web.app");
        Assert.Equal("https://financas-app-2ffc6.web.app", permitida.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.False((await Preflight("https://outro-site.example")).Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Documento_OpenAPI_disponivel()
    {
        var documento = await fabrica.CreateClient().GetStringAsync("/openapi/v1.json");
        Assert.Contains("/api/conta/saldo", documento);
        Assert.Contains("bearer", documento);
    }
}

// A autenticação pelo cabeçalho X-Utilizador nunca funciona em Production, mesmo que alguém a ligue
public class AutenticacaoDeDesenvolvimentoTests
{
    private static FabricaApi Fabrica(string ambiente) => new()
    {
        Ambiente = ambiente,
        AutenticacaoDeTeste = false,
        Configuracao = { ["Autenticacao:CabecalhoDesenvolvimento"] = "true" },
    };

    [Fact]
    public async Task Em_Production_o_cabecalho_e_ignorado()
    {
        await using var fabrica = Fabrica("Production");
        var resposta = await fabrica.Cliente("intruso").GetAsync("/api/conta");
        Assert.Equal(HttpStatusCode.Unauthorized, resposta.StatusCode);
    }

    [Fact]
    public async Task Em_Development_e_so_se_ligado_o_cabecalho_serve_para_experimentar_a_API()
    {
        await using var fabrica = Fabrica("Development");
        Assert.Equal(HttpStatusCode.OK, (await fabrica.Cliente("dev").GetAsync("/api/conta")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await fabrica.CreateClient().GetAsync("/api/conta")).StatusCode);
    }
}
