using System.Net;
using System.Text.Json.Nodes;
using Financas.Services.Dtos;

namespace Financas.Api.Tests;

// Gastos recorrentes, pesquisa, Idempotency-Key e registo de alterações por HTTP
public class NovasFuncoesApiTests(FabricaApi fabrica) : IClassFixture<FabricaApi>
{
    private readonly HttpClient _cliente = fabrica.Cliente($"api-{Guid.NewGuid():N}");
    private readonly HttpClient _outro = fabrica.Cliente($"outro-{Guid.NewGuid():N}");

    private static async Task<JsonNode> Json(HttpClient cliente, string url)
    {
        var resposta = await cliente.GetAsync(url);
        resposta.EnsureSuccessStatusCode();
        return JsonNode.Parse(await resposta.Content.ReadAsStringAsync())!;
    }

    private static HttpRequestMessage ComChave(string chave, object corpo)
    {
        var pedido = new HttpRequestMessage(HttpMethod.Post, "/api/despesas-extras")
        {
            Content = System.Net.Http.Json.JsonContent.Create(corpo, options: FabricaApi.Json),
        };
        pedido.Headers.Add("Idempotency-Key", chave);
        return pedido;
    }

    [Fact]
    public async Task Idempotency_Key_a_primeira_vez_201_as_seguintes_200_com_o_mesmo_id_e_cobra_uma_vez()
    {
        (await _cliente.PostJsonAsync("/api/conta/movimentos", new { valor = 100 })).EnsureSuccessStatusCode();
        var chave = Guid.NewGuid().ToString();

        var primeira = await _cliente.SendAsync(ComChave(chave, new { titulo = "Jantar", valor = 20 }));
        var segunda = await _cliente.SendAsync(ComChave(chave, new { titulo = "Jantar", valor = 20 }));

        Assert.Equal(HttpStatusCode.Created, primeira.StatusCode);
        Assert.Equal(HttpStatusCode.OK, segunda.StatusCode);
        Assert.Equal((await primeira.LerAsync<CriadoDto>()).Id, (await segunda.LerAsync<CriadoDto>()).Id);
        Assert.Equal(80, (await _cliente.GetJsonAsync<SaldoDto>("/api/conta/saldo")).Saldo);

        // Mais de 64 caracteres: 400
        var comprida = await _cliente.SendAsync(ComChave(new string('x', 65), new { titulo = "Jantar", valor = 20 }));
        Assert.Equal(HttpStatusCode.BadRequest, comprida.StatusCode);
    }

    [Fact]
    public async Task Gastos_recorrentes_criar_gera_hoje_pausar_alterar_apagar_e_outro_utilizador_nao_ve()
    {
        var criado = await _cliente.PostJsonAsync("/api/gastos-recorrentes", new { titulo = "Café", valor = 1.2, frequencia = "diaria" });
        Assert.Equal(HttpStatusCode.Created, criado.StatusCode);
        var id = (await criado.LerAsync<CriadoDto>()).Id;

        var lista = (await Json(_cliente, "/api/gastos-recorrentes")).AsArray();
        Assert.Equal("diaria", lista.Single()!["frequencia"]!.GetValue<string>());
        var gerado = (await Json(_cliente, "/api/despesas-extras?mes=2026-10")).AsArray().Single()!;
        Assert.Equal(id, gerado["gastoRecorrenteId"]!.GetValue<string>());

        Assert.Equal(HttpStatusCode.NoContent, (await _cliente.PatchJsonAsync($"/api/gastos-recorrentes/{id}", new { ativo = false, valor = 1.5 })).StatusCode);
        var alterado = await Json(_cliente, $"/api/gastos-recorrentes/{id}");
        Assert.False(alterado["ativo"]!.GetValue<bool>());
        Assert.Equal(1.5m, alterado["valor"]!.GetValue<decimal>());

        // Validação em português
        var invalido = await _cliente.PostJsonAsync("/api/gastos-recorrentes", new { titulo = "x", valor = 1, frequencia = "semanal", diaSemana = 8 });
        Assert.Equal(HttpStatusCode.BadRequest, invalido.StatusCode);
        Assert.Contains("diaSemana", await invalido.Content.ReadAsStringAsync());

        // Outro utilizador
        Assert.Empty((await Json(_outro, "/api/gastos-recorrentes")).AsArray());
        Assert.Equal(HttpStatusCode.NotFound, (await _outro.GetAsync($"/api/gastos-recorrentes/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _outro.PatchJsonAsync($"/api/gastos-recorrentes/{id}", new { ativo = true })).StatusCode);
        await _outro.DeleteAsync($"/api/gastos-recorrentes/{id}");

        Assert.Equal(HttpStatusCode.NoContent, (await _cliente.DeleteAsync($"/api/gastos-recorrentes/{id}")).StatusCode);
        Assert.Empty((await Json(_cliente, "/api/gastos-recorrentes")).AsArray());
    }

    [Fact]
    public async Task Pesquisa_por_texto_filtros_e_validacao_so_com_os_dados_de_quem_pede()
    {
        await _cliente.PostJsonAsync("/api/despesas-extras", new { titulo = "Café Delta", valor = 2, categoria = "restauracao" });
        await _cliente.PostJsonAsync("/api/despesas-extras/historicas", new { titulo = "CAFE", valor = 3, data = "2026-05-01" });
        await _cliente.PostJsonAsync("/api/despesas-extras", new { titulo = "Continente", valor = 40 });
        await _outro.PostJsonAsync("/api/despesas-extras", new { titulo = "Café", valor = 9 });

        var resultado = await _cliente.GetJsonAsync<PesquisaDespesasDto>("/api/despesas-extras/pesquisa?texto=cafe");
        Assert.Equal(2, resultado.Total);
        Assert.Equal(5, resultado.Soma);
        Assert.Equal("Café Delta", resultado.Itens[0].Titulo);

        var filtrado = await _cliente.GetJsonAsync<PesquisaDespesasDto>(
            "/api/despesas-extras/pesquisa?texto=caf&de=2026-10-01&ate=2026-10-31&meioPagamento=conta&valorMin=1&valorMax=5&categoria=restauracao&pagina=1&tamanho=10");
        Assert.Equal("Café Delta", filtrado.Itens.Single().Titulo);

        Assert.Equal(HttpStatusCode.BadRequest, (await _cliente.GetAsync("/api/despesas-extras/pesquisa?tamanho=500")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _cliente.GetAsync("/api/despesas-extras/pesquisa?categoria=nada")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _cliente.GetAsync("/api/despesas-extras/pesquisa?valorMin=5&valorMax=1")).StatusCode);
    }

    [Fact]
    public async Task Registo_de_alteracoes_com_a_origem_do_pedido_e_so_de_quem_pede()
    {
        var id = (await (await _cliente.PostJsonAsync("/api/despesas-fixas", new { titulo = "Combustível Carro", valor = 60 })).LerAsync<CriadoDto>()).Id;
        // Terminar uma despesa sem pagamentos apaga-a
        (await _cliente.PostAsync($"/api/despesas-fixas/{id}/terminar", null)).EnsureSuccessStatusCode();

        var pagina = await Json(_cliente, "/api/alteracoes?entidade=DespesaFixa");
        var itens = pagina["itens"]!.AsArray();
        Assert.Equal(["apagada", "criada"], itens.Select(i => i!["acao"]!.GetValue<string>()));
        var criada = itens.Single(i => i!["acao"]!.GetValue<string>() == "criada")!;
        Assert.Equal("Combustível Carro", criada["descricao"]!.GetValue<string>());
        Assert.Equal("POST /api/despesas-fixas", criada["origem"]!.GetValue<string>());
        Assert.Equal(60, criada["alteracoes"]!["Valor"]!["para"]!.GetValue<decimal>());

        Assert.Equal(0, (await Json(_outro, "/api/alteracoes"))["total"]!.GetValue<int>());
        Assert.Equal(HttpStatusCode.BadRequest, (await _cliente.GetAsync("/api/alteracoes?pagina=0")).StatusCode);
    }
}

// Limites de pedidos: cada teste com a sua API (os contadores são por processo)
public class LimitesPedidosApiTests
{
    [Fact]
    public async Task Pedidos_a_mais_respondem_429_em_portugues_e_saude_nunca_e_limitada()
    {
        using var fabrica = new FabricaApi { Configuracao = { ["LimitesPedidos:PorMinuto"] = "3" } };
        var cliente = fabrica.Cliente("limites");
        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await cliente.GetAsync("/api/conta/saldo")).StatusCode);
        }

        var recusado = await cliente.GetAsync("/api/conta/saldo");
        Assert.Equal(HttpStatusCode.TooManyRequests, recusado.StatusCode);
        Assert.True(recusado.Headers.Contains("Retry-After"));
        var problema = JsonNode.Parse(await recusado.Content.ReadAsStringAsync())!;
        Assert.Equal("Demasiados pedidos", problema["title"]!.GetValue<string>());
        Assert.Equal(429, problema["status"]!.GetValue<int>());

        // Outro utilizador tem o seu próprio limite; /saude nunca conta
        Assert.Equal(HttpStatusCode.OK, (await fabrica.Cliente("outro").GetAsync("/api/conta/saldo")).StatusCode);
        for (var i = 0; i < 10; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await cliente.GetAsync("/saude")).StatusCode);
        }
    }

    [Fact]
    public async Task O_PDF_tem_um_limite_mais_apertado()
    {
        using var fabrica = new FabricaApi { Configuracao = { ["LimitesPedidos:PesadosPorMinuto"] = "1" } };
        var cliente = fabrica.Cliente("pdf");
        Assert.Equal(HttpStatusCode.OK, (await cliente.GetAsync("/api/relatorios/mes/2026-10.pdf")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await cliente.GetAsync("/api/relatorios/mes/2026-10.pdf")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await cliente.GetAsync("/api/conta/saldo")).StatusCode);
    }
}
