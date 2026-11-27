using System.Net;
using System.Net.Http.Json;
using Financas.Services.Dtos;

namespace Financas.Api.Tests;

// DELETE /api/conta (e POST /api/conta/apagar): apagar a conta e os dados, só com a confirmação
public class ApagarContaApiTests(FabricaApi fabrica) : IClassFixture<FabricaApi>
{
    private readonly HttpClient _cliente = fabrica.Cliente($"api-{Guid.NewGuid():N}");
    private readonly HttpClient _outro = fabrica.Cliente($"outro-{Guid.NewGuid():N}");

    private static Task<HttpResponseMessage> Delete(HttpClient cliente, object? corpo)
    {
        var pedido = new HttpRequestMessage(HttpMethod.Delete, "/api/conta");
        if (corpo is not null)
        {
            pedido.Content = JsonContent.Create(corpo, options: FabricaApi.Json);
        }

        return cliente.SendAsync(pedido);
    }

    private async Task DadosAsync(HttpClient cliente)
    {
        (await cliente.PostJsonAsync("/api/conta/movimentos", new { valor = 500 })).EnsureSuccessStatusCode();
        (await cliente.PostJsonAsync("/api/despesas-extras", new { titulo = "Jantar", valor = 20, data = "2026-10-05" })).EnsureSuccessStatusCode();
        (await cliente.PostJsonAsync("/api/regras-categoria", new { texto = "jantar", categoria = "restauracao" })).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Sem_autenticacao_401()
    {
        var pedido = new HttpRequestMessage(HttpMethod.Delete, "/api/conta") { Content = JsonContent.Create(new { confirmacao = "APAGAR" }) };
        Assert.Equal(HttpStatusCode.Unauthorized, (await fabrica.CreateClient().SendAsync(pedido)).StatusCode);
    }

    [Fact]
    public async Task Sem_a_confirmacao_certa_400_e_nada_e_apagado()
    {
        await DadosAsync(_cliente);

        Assert.Equal(HttpStatusCode.BadRequest, (await Delete(_cliente, null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Delete(_cliente, new { })).StatusCode);
        var errada = await Delete(_cliente, new { confirmacao = "sim" });
        Assert.Equal(HttpStatusCode.BadRequest, errada.StatusCode);
        Assert.Equal("application/problem+json", errada.Content.Headers.ContentType?.MediaType);

        Assert.Single(await _cliente.GetJsonAsync<List<DespesaExtraDto>>("/api/despesas-extras"));
        Assert.Equal(480, (await _cliente.GetJsonAsync<SaldoDto>("/api/conta/saldo")).Saldo);
    }

    [Fact]
    public async Task Com_a_confirmacao_apaga_tudo_do_utilizador_e_nao_mexe_nos_outros()
    {
        await DadosAsync(_cliente);
        await DadosAsync(_outro);

        var resposta = await Delete(_cliente, new { confirmacao = "APAGAR" });

        Assert.Equal(HttpStatusCode.NoContent, resposta.StatusCode);
        Assert.Empty(await _cliente.GetJsonAsync<List<DespesaExtraDto>>("/api/despesas-extras"));
        Assert.Empty(await _cliente.GetJsonAsync<List<RegraCategoriaDto>>("/api/regras-categoria"));
        Assert.Equal(0, (await _cliente.GetJsonAsync<SaldoDto>("/api/conta/saldo")).Saldo);
        Assert.Single(await _outro.GetJsonAsync<List<DespesaExtraDto>>("/api/despesas-extras"));
        Assert.Single(await _outro.GetJsonAsync<List<RegraCategoriaDto>>("/api/regras-categoria"));
        Assert.Equal(480, (await _outro.GetJsonAsync<SaldoDto>("/api/conta/saldo")).Saldo);
    }

    [Fact]
    public async Task Tambem_funciona_por_POST_apagar_para_quem_nao_envia_corpo_no_DELETE()
    {
        await DadosAsync(_cliente);

        Assert.Equal(HttpStatusCode.BadRequest, (await _cliente.PostJsonAsync("/api/conta/apagar", new { confirmacao = "talvez" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _cliente.PostJsonAsync("/api/conta/apagar", new { confirmacao = "APAGAR" })).StatusCode);

        Assert.Empty(await _cliente.GetJsonAsync<List<DespesaExtraDto>>("/api/despesas-extras"));
    }
}
