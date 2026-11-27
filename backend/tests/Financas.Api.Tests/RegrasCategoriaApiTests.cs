using System.Net;
using System.Text.Json.Nodes;
using Financas.Services.Dtos;

namespace Financas.Api.Tests;

// /api/regras-categoria por HTTP: rotas, validação, 409, só os dados de quem pede e o efeito nas despesas
public class RegrasCategoriaApiTests(FabricaApi fabrica) : IClassFixture<FabricaApi>
{
    private readonly HttpClient _cliente = fabrica.Cliente($"api-{Guid.NewGuid():N}");
    private readonly HttpClient _outro = fabrica.Cliente($"outro-{Guid.NewGuid():N}");

    private static async Task<JsonNode> Json(HttpClient cliente, string url)
    {
        var resposta = await cliente.GetAsync(url);
        resposta.EnsureSuccessStatusCode();
        return JsonNode.Parse(await resposta.Content.ReadAsStringAsync())!;
    }

    [Fact]
    public async Task Sem_autenticacao_401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await fabrica.CreateClient().GetAsync("/api/regras-categoria")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await fabrica.CreateClient().GetAsync("/api/regras-categoria/sugerir?descricao=x")).StatusCode);
    }

    [Fact]
    public async Task Criar_listar_substituir_e_apagar()
    {
        var criada = await _cliente.PostJsonAsync("/api/regras-categoria", new { texto = "Padaria do Bairro", categoria = "supermercado", prioridade = 2 });
        Assert.Equal(HttpStatusCode.Created, criada.StatusCode);
        var id = (await criada.LerAsync<CriadoDto>()).Id;

        var regra = (await Json(_cliente, "/api/regras-categoria")).AsArray().Single()!;
        Assert.Equal(id, regra["id"]!.GetValue<string>());
        Assert.Equal("Padaria do Bairro", regra["texto"]!.GetValue<string>());
        Assert.Equal("supermercado", regra["categoria"]!.GetValue<string>());
        Assert.True(regra["ativa"]!.GetValue<bool>());
        Assert.Equal(2, regra["prioridade"]!.GetValue<int>());

        var substituida = await _cliente.PutJsonAsync($"/api/regras-categoria/{id}", new { texto = "Padaria Nova", categoria = "restauracao", ativa = false });
        Assert.Equal(HttpStatusCode.NoContent, substituida.StatusCode);
        var depois = (await Json(_cliente, "/api/regras-categoria")).AsArray().Single()!;
        Assert.Equal("Padaria Nova", depois["texto"]!.GetValue<string>());
        Assert.False(depois["ativa"]!.GetValue<bool>());
        Assert.Equal(0, depois["prioridade"]!.GetValue<int>());

        Assert.Equal(HttpStatusCode.NoContent, (await _cliente.DeleteAsync($"/api/regras-categoria/{id}")).StatusCode);
        Assert.Empty((await Json(_cliente, "/api/regras-categoria")).AsArray());
        Assert.Equal(HttpStatusCode.NotFound, (await _cliente.PutJsonAsync($"/api/regras-categoria/{id}", new { texto = "x", categoria = "casa" })).StatusCode);
    }

    [Fact]
    public async Task Validacao_e_conflito()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _cliente.PostJsonAsync("/api/regras-categoria", new { texto = "", categoria = "casa" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _cliente.PostJsonAsync("/api/regras-categoria", new { texto = "x", categoria = "nao-existe" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _cliente.PostJsonAsync("/api/regras-categoria", new { texto = new string('x', 101), categoria = "casa" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _cliente.PostJsonAsync("/api/regras-categoria", new { texto = "   ", categoria = "casa" })).StatusCode);

        (await _cliente.PostJsonAsync("/api/regras-categoria", new { texto = "Ginásio", categoria = "saude" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await _cliente.PostJsonAsync("/api/regras-categoria", new { texto = "GINASIO", categoria = "lazer" })).StatusCode);
    }

    [Fact]
    public async Task Sugerir_devolve_a_categoria_a_origem_e_o_texto_da_regra()
    {
        (await _cliente.PostJsonAsync("/api/regras-categoria", new { texto = "netflix", categoria = "educacao" })).EnsureSuccessStatusCode();

        var minha = await Json(_cliente, "/api/regras-categoria/sugerir?descricao=NETFLIX.COM");
        Assert.Equal("educacao", minha["categoria"]!.GetValue<string>());
        Assert.Equal("regra", minha["origem"]!.GetValue<string>());
        Assert.Equal("netflix", minha["regra"]!.GetValue<string>());

        var padrao = await Json(_cliente, "/api/regras-categoria/sugerir?descricao=Recheio%20Cash");
        Assert.Equal("supermercado", padrao["categoria"]!.GetValue<string>());
        Assert.Equal("regra-padrao", padrao["origem"]!.GetValue<string>());

        var nada = await Json(_cliente, "/api/regras-categoria/sugerir?descricao=Coisa%20estranha");
        Assert.Equal("outros", nada["categoria"]!.GetValue<string>());
        Assert.Equal("por-defeito", nada["origem"]!.GetValue<string>());
        Assert.Null(nada["regra"]);

        // As regras de um utilizador não valem para outro
        Assert.Equal("lazer", (await Json(_outro, "/api/regras-categoria/sugerir?descricao=NETFLIX.COM"))["categoria"]!.GetValue<string>());
        Assert.Empty((await Json(_outro, "/api/regras-categoria")).AsArray());
    }

    [Fact]
    public async Task As_regras_padrao_estao_disponiveis_para_a_app_mostrar()
    {
        var padrao = (await Json(_cliente, "/api/regras-categoria/padrao")).AsArray();
        Assert.NotEmpty(padrao);
        Assert.Contains(padrao, r => r!["texto"]!.GetValue<string>() == "continente" && r["categoria"]!.GetValue<string>() == "supermercado");
    }

    [Fact]
    public async Task Despesa_extra_sem_categoria_usa_a_regra_do_utilizador()
    {
        (await _cliente.PostJsonAsync("/api/regras-categoria", new { texto = "lojinha do zé", categoria = "presentes" })).EnsureSuccessStatusCode();

        var id = (await (await _cliente.PostJsonAsync("/api/despesas-extras", new { titulo = "Lojinha do Zé", valor = 5, data = "2026-10-05" })).LerAsync<CriadoDto>()).Id;

        var despesa = (await Json(_cliente, "/api/despesas-extras?mes=2026-10")).AsArray().Single(d => d!["id"]!.GetValue<string>() == id)!;
        Assert.Equal("presentes", despesa["categoria"]!.GetValue<string>());
        // Pelo endpoint antigo, a mesma resposta (agora com a origem "regra")
        Assert.Equal("regra", (await Json(_cliente, "/api/despesas-extras/sugerir-categoria?titulo=Lojinha%20do%20Z%C3%A9"))["origem"]!.GetValue<string>());
    }
}
