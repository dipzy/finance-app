using System.Net;
using System.Text.Json.Nodes;
using Financas.Services.Dtos;
using Financas.Services.Regras;

namespace Financas.Api.Tests;

// Categorias, orçamentos, objetivos e estatísticas por HTTP: rotas, validação, códigos de estado,
// forma do JSON e que cada utilizador só vê os seus dados. As regras estão testadas em Financas.Services.Tests.
public class FuncoesDadosApiTests(FabricaApi fabrica) : IClassFixture<FabricaApi>
{
    private readonly string _uid = $"api-{Guid.NewGuid():N}";

    private HttpClient Cliente() => fabrica.Cliente(_uid);

    private HttpClient Outro() => fabrica.Cliente($"outro-{Guid.NewGuid():N}");

    private static async Task<JsonNode> Json(HttpResponseMessage resposta) =>
        JsonNode.Parse(await resposta.Content.ReadAsStringAsync())!;

    private static async Task<string> Criar(HttpClient cliente, string url, object corpo)
    {
        var resposta = await cliente.PostJsonAsync(url, corpo);
        Assert.Equal(HttpStatusCode.Created, resposta.StatusCode);
        return (await resposta.LerAsync<CriadoDto>()).Id;
    }

    [Fact]
    public async Task Sugerir_categoria_e_categoria_nas_despesas_extras()
    {
        var cliente = Cliente();
        var sugestao = await Json(await cliente.GetAsync("/api/despesas-extras/sugerir-categoria?titulo=Pingo%20Doce"));
        Assert.Equal("supermercado", sugestao["categoria"]!.GetValue<string>());
        Assert.Equal("palavra-chave", sugestao["origem"]!.GetValue<string>());

        // Sem categoria: fica a sugerida; com categoria: fica a escolhida; editar muda-a
        var sugerida = await Criar(cliente, "/api/despesas-extras", new { titulo = "Uber Eats", valor = 12.5 });
        var escolhida = await Criar(cliente, "/api/despesas-extras", new { titulo = "Uber Eats", valor = 9, categoria = "lazer" });
        (await cliente.PatchJsonAsync($"/api/despesas-extras/{sugerida}", new { categoria = "presentes" })).EnsureSuccessStatusCode();

        var extras = (await Json(await cliente.GetAsync("/api/despesas-extras?mes=2026-10"))).AsArray();
        Assert.Equal("presentes", extras.Single(e => e!["id"]!.GetValue<string>() == sugerida)!["categoria"]!.GetValue<string>());
        Assert.Equal("lazer", extras.Single(e => e!["id"]!.GetValue<string>() == escolhida)!["categoria"]!.GetValue<string>());

        // O histórico do utilizador ganha às palavras-chave: conta a despesa registada mais recentemente
        Assert.Equal(
            new SugestaoCategoria("lazer", OrigemSugestao.Historico),
            await cliente.GetJsonAsync<SugestaoCategoria>("/api/despesas-extras/sugerir-categoria?titulo=uber%20eats"));
        Assert.Equal("outros", (await cliente.GetJsonAsync<SugestaoCategoria>("/api/despesas-extras/sugerir-categoria")).Categoria);
    }

    [Fact]
    public async Task Categoria_desconhecida_responde_400_com_o_erro_do_campo()
    {
        var cliente = Cliente();
        var resposta = await cliente.PostJsonAsync("/api/despesas-extras", new { titulo = "x", valor = 1, categoria = "comida" });
        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        Assert.StartsWith("categoria: categoria desconhecida", (await Json(resposta))["errors"]!["categoria"]![0]!.GetValue<string>());

        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/orcamentos", new { categoria = "comida", limite = 10 })).StatusCode);
        var semLimite = await Json(await cliente.PostJsonAsync("/api/orcamentos", new { categoria = "lazer", limite = 0 }));
        Assert.Equal("limite: tem de ser maior que zero (máximo 9 999 999 999,99).", semLimite["errors"]!["limite"]![0]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/orcamentos", new { limite = 10 })).StatusCode);
    }

    [Fact]
    public async Task Orcamentos_CRUD_estado_e_409_na_categoria_repetida()
    {
        var cliente = Cliente();
        var id = await Criar(cliente, "/api/orcamentos", new { categoria = "restauracao", limite = 200 });

        var repetido = await cliente.PostJsonAsync("/api/orcamentos", new { categoria = "restauracao", limite = 50 });
        Assert.Equal(HttpStatusCode.Conflict, repetido.StatusCode);
        Assert.Equal("Já existe um orçamento para Restauração: altera esse.", (await Json(repetido))["detail"]!.GetValue<string>());

        (await cliente.PostJsonAsync("/api/conta/movimentos", new { valor = 500 })).EnsureSuccessStatusCode();
        await Criar(cliente, "/api/despesas-extras", new { titulo = "Jantar", valor = 164, data = "2026-10-03" });

        var estado = (await Json(await cliente.GetAsync("/api/orcamentos/estado"))).AsArray().Single()!;
        Assert.Equal(id, estado["id"]!.GetValue<string>());
        Assert.Equal("2026-10", estado["mes"]!.GetValue<string>());
        Assert.Equal(164, estado["gasto"]!.GetValue<decimal>());
        Assert.Equal(82, estado["percentagem"]!.GetValue<decimal>());
        Assert.Equal(36, estado["restante"]!.GetValue<decimal>());
        Assert.Equal("perto", estado["estado"]!.GetValue<string>());

        (await cliente.PatchJsonAsync($"/api/orcamentos/{id}", new { limite = 150 })).EnsureSuccessStatusCode();
        Assert.Equal(
            EstadoOrcamento.Ultrapassado,
            Assert.Single(await cliente.GetJsonAsync<List<EstadoOrcamentoDto>>("/api/orcamentos/estado?mes=2026-10")).Estado);
        Assert.Equal(0, Assert.Single(await cliente.GetJsonAsync<List<EstadoOrcamentoDto>>("/api/orcamentos/estado?mes=2026-09")).Gasto);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.GetAsync("/api/orcamentos/estado?mes=2026-13")).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await cliente.PatchJsonAsync("/api/orcamentos/nao-existe", new { limite = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await cliente.DeleteAsync($"/api/orcamentos/{id}")).StatusCode);
        Assert.Empty(await cliente.GetJsonAsync<List<OrcamentoDto>>("/api/orcamentos"));
    }

    [Fact]
    public async Task Um_utilizador_nao_ve_nem_mexe_nos_orcamentos_e_objetivos_de_outro()
    {
        var dono = Cliente();
        var outro = Outro();
        var orcamento = await Criar(dono, "/api/orcamentos", new { categoria = "lazer", limite = 30 });
        var objetivo = await Criar(dono, "/api/objetivos", new { nome = "Férias", valorAlvo = 600, mesAlvo = "2027-03" });

        Assert.Empty(await outro.GetJsonAsync<List<OrcamentoDto>>("/api/orcamentos"));
        Assert.Empty(await outro.GetJsonAsync<List<EstadoOrcamentoDto>>("/api/orcamentos/estado"));
        Assert.Empty(await outro.GetJsonAsync<List<ObjetivoDto>>("/api/objetivos"));
        Assert.Equal(HttpStatusCode.NotFound, (await outro.GetAsync($"/api/objetivos/{objetivo}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outro.PatchJsonAsync($"/api/orcamentos/{orcamento}", new { limite = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outro.PatchJsonAsync($"/api/objetivos/{objetivo}", new { nome = "Meu" })).StatusCode);
        (await outro.DeleteAsync($"/api/orcamentos/{orcamento}")).EnsureSuccessStatusCode();
        (await outro.DeleteAsync($"/api/objetivos/{objetivo}")).EnsureSuccessStatusCode();

        // Continuam lá, iguais, e o outro pode ter o seu orçamento de lazer
        Assert.Equal(30, Assert.Single(await dono.GetJsonAsync<List<OrcamentoDto>>("/api/orcamentos")).Limite);
        Assert.Equal("Férias", (await dono.GetJsonAsync<ObjetivoDto>($"/api/objetivos/{objetivo}")).Nome);
        await Criar(outro, "/api/orcamentos", new { categoria = "lazer", limite = 99 });

        // Sem autenticação: 401
        Assert.Equal(HttpStatusCode.Unauthorized, (await fabrica.CreateClient().GetAsync("/api/orcamentos")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await fabrica.CreateClient().GetAsync("/api/estatisticas/evolucao")).StatusCode);
    }

    [Fact]
    public async Task Objetivos_ligados_a_uma_poupanca_por_HTTP()
    {
        var cliente = Cliente();
        var poupanca = await Criar(cliente, "/api/poupancas", new { nome = "Revolut", tipo = "valor", valor = "100", saldo = 300 });
        var id = await Criar(cliente, "/api/objetivos", new { nome = "Carro", valorAlvo = 1000, mesAlvo = "2026-12", poupancaId = poupanca });

        var objetivo = (await Json(await cliente.GetAsync($"/api/objetivos/{id}"))).AsObject();
        Assert.Equal("Revolut", objetivo["poupancaNome"]!.GetValue<string>());
        Assert.Equal(300, objetivo["valorAtual"]!.GetValue<decimal>());
        Assert.Equal(233.34m, objetivo["valorPorMes"]!.GetValue<decimal>());
        Assert.Equal(3, objetivo["mesesRestantes"]!.GetValue<int>());
        Assert.Equal("no-bom-caminho", objetivo["estado"]!.GetValue<string>());

        // Desligar a poupança ("limpar"): fica o saldo dela como valor escrito à mão
        (await cliente.PatchJsonAsync($"/api/objetivos/{id}", new { limpar = new[] { "poupancaId" } })).EnsureSuccessStatusCode();
        var desligado = (await Json(await cliente.GetAsync($"/api/objetivos/{id}"))).AsObject();
        Assert.False(desligado.ContainsKey("poupancaId"));
        Assert.Equal(300, desligado["valorAtual"]!.GetValue<decimal>());

        var passado = await cliente.PostJsonAsync("/api/objetivos", new { nome = "X", valorAlvo = 10, mesAlvo = "2026-01" });
        Assert.Equal(HttpStatusCode.BadRequest, passado.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await cliente.PostJsonAsync("/api/objetivos", new { nome = "X", valorAlvo = 10, mesAlvo = "2026-12", poupancaId = "nao-existe" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/objetivos", new { nome = "X", valorAlvo = 0, mesAlvo = "2026-12" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostJsonAsync("/api/objetivos", new { nome = "X", valorAlvo = 10, mesAlvo = "12/2026" })).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await cliente.DeleteAsync($"/api/objetivos/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await cliente.GetAsync($"/api/objetivos/{id}")).StatusCode);
    }

    [Fact]
    public async Task Estatisticas_gastos_por_categoria_e_evolucao()
    {
        var cliente = Cliente();
        (await cliente.PostJsonAsync("/api/conta/movimentos", new { valor = 1000 })).EnsureSuccessStatusCode();
        await Criar(cliente, "/api/despesas-extras", new { titulo = "Continente", valor = 30, data = "2026-10-02" });
        await Criar(cliente, "/api/despesas-extras", new { titulo = "Galp", valor = 50, data = "2026-10-03" });

        var gastos = await cliente.GetJsonAsync<GastosPorCategoriaDto>("/api/estatisticas/categorias?mes=2026-10");
        Assert.Equal(80, gastos.Total);
        Assert.Equal(new[] { "combustivel", "supermercado" }, gastos.Categorias.Select(c => c.Categoria));
        Assert.Equal(62.5m, gastos.Categorias[0].Percentagem);

        var evolucao = (await Json(await cliente.GetAsync("/api/estatisticas/evolucao"))).AsArray();
        Assert.Equal(12, evolucao.Count);
        Assert.Equal("2025-11", evolucao[0]!["mes"]!.GetValue<string>());
        // Quando não se sabe o saldo final, vem null (não falta o campo)
        Assert.True(evolucao[0]!.AsObject().ContainsKey("saldoFinal"));
        Assert.Null(evolucao[0]!["saldoFinal"]);
        var outubro = evolucao[^1]!;
        Assert.Equal("2026-10", outubro["mes"]!.GetValue<string>());
        Assert.Equal(80, outubro["gasto"]!.GetValue<decimal>());
        Assert.Equal(80, outubro["despesasExtras"]!.GetValue<decimal>());
        Assert.Equal(0, outubro["despesasMensais"]!.GetValue<decimal>());
        Assert.Equal(0, outubro["livre"]!.GetValue<decimal>());
        Assert.Equal(920, outubro["saldoFinal"]!.GetValue<decimal>());

        Assert.Equal(3, (await cliente.GetJsonAsync<List<EvolucaoMesDto>>("/api/estatisticas/evolucao?meses=3&ate=2026-06")).Count);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.GetAsync("/api/estatisticas/evolucao?meses=0")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.GetAsync("/api/estatisticas/evolucao?meses=40")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.GetAsync("/api/estatisticas/categorias?mes=outubro")).StatusCode);
    }
}
