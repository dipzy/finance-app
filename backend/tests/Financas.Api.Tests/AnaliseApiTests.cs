using System.Net;
using System.Text.Json.Nodes;
using Financas.Services.Dtos;

namespace Financas.Api.Tests;

// Análise por HTTP: comparação com o mês anterior e previsão do fim do mês ("hoje" = 5 de outubro de 2026).
// As regras estão testadas em Financas.Services.Tests/AnaliseTests.cs.
public class AnaliseApiTests(FabricaApi fabrica) : IClassFixture<FabricaApi>
{
    private HttpClient Cliente() => fabrica.Cliente($"api-{Guid.NewGuid():N}");

    private static async Task<JsonNode> Json(HttpResponseMessage resposta) =>
        JsonNode.Parse(await resposta.Content.ReadAsStringAsync())!;

    private static async Task Gasto(HttpClient cliente, string titulo, decimal valor, string data, string categoria) =>
        Assert.Equal(
            HttpStatusCode.Created,
            (await cliente.PostJsonAsync("/api/despesas-extras", new { titulo, valor, data, categoria })).StatusCode);

    [Fact]
    public async Task Comparacao_do_mes_atual_e_de_um_mes_passado()
    {
        var cliente = Cliente();
        await Gasto(cliente, "Jantar", 20, "2026-09-03", "restauracao");
        await Gasto(cliente, "Jantar", 100, "2026-09-20", "restauracao");
        await Gasto(cliente, "Jantar", 44, "2026-10-02", "restauracao");
        await Gasto(cliente, "Cinema", 12, "2026-10-04", "lazer");

        var json = await Json(await cliente.GetAsync("/api/estatisticas/comparacao"));
        Assert.Equal("2026-10", json["mes"]!.GetValue<string>());
        Assert.Equal("2026-09", json["mesAnterior"]!.GetValue<string>());
        Assert.Equal(5, json["ateDia"]!.GetValue<int>());
        Assert.Equal(56, json["gastosDiaADia"]!["atual"]!.GetValue<decimal>());
        Assert.Equal(20, json["gastosDiaADia"]!["anterior"]!.GetValue<decimal>());
        Assert.Equal(180, json["gastosDiaADia"]!["variacao"]!.GetValue<decimal>());
        var categorias = json["categorias"]!.AsArray();
        Assert.Equal("restauracao", categorias[0]!["categoria"]!.GetValue<string>());
        Assert.Equal(24, categorias[0]!["diferenca"]!.GetValue<decimal>());
        // "novo": a variação vem a null (o campo não falta)
        Assert.True(categorias[1]!.AsObject().ContainsKey("variacao"));
        Assert.Null(categorias[1]!["variacao"]);

        // Setembro inteiro contra agosto: sem ateDia (null)
        var setembro = await Json(await cliente.GetAsync("/api/estatisticas/comparacao?mes=2026-09"));
        Assert.True(setembro.AsObject().ContainsKey("ateDia"));
        Assert.Null(setembro["ateDia"]);
        Assert.Equal(120, setembro["gastosDiaADia"]!["atual"]!.GetValue<decimal>());

        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.GetAsync("/api/estatisticas/comparacao?mes=outubro")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.GetAsync("/api/estatisticas/comparacao?mes=2026-12")).StatusCode);
    }

    [Fact]
    public async Task Previsao_do_fim_do_mes()
    {
        var cliente = Cliente();
        (await cliente.PostJsonAsync("/api/despesas-fixas", new { titulo = "Renda", valor = 300 })).EnsureSuccessStatusCode();
        await Gasto(cliente, "Compras", 300, "2026-09-10", "supermercado");
        (await cliente.PutJsonAsync("/api/conta/saldo", new { saldo = 1000 })).EnsureSuccessStatusCode();

        var p = await cliente.GetJsonAsync<PrevisaoFimMesDto>("/api/estatisticas/previsao");
        Assert.Equal("2026-10", p.Mes);
        Assert.Equal(1000, p.SaldoAtual);
        Assert.Equal(300, p.PorPagarFixas);
        Assert.Equal(10, p.MediaDiaria); // 300 € / 30 dias de setembro
        Assert.Equal(26, p.DiasRestantes);
        Assert.Equal(260, p.EstimativaGastos);
        Assert.Equal(440, p.PrevisaoFinal);
        Assert.Equal("1 mês", p.Base);
    }

    [Fact]
    public async Task Sem_token_401_e_cada_utilizador_so_ve_os_seus_numeros()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await fabrica.CreateClient().GetAsync("/api/estatisticas/comparacao")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await fabrica.CreateClient().GetAsync("/api/estatisticas/previsao")).StatusCode);

        var dono = Cliente();
        await Gasto(dono, "Jantar", 50, "2026-10-01", "restauracao");
        (await dono.PutJsonAsync("/api/conta/saldo", new { saldo = 800 })).EnsureSuccessStatusCode();

        var outro = Cliente();
        var comparacao = await outro.GetJsonAsync<ComparacaoMesDto>("/api/estatisticas/comparacao");
        Assert.Empty(comparacao.Categorias);
        Assert.Equal(0, comparacao.GastosDiaADia.Atual);
        var previsao = await outro.GetJsonAsync<PrevisaoFimMesDto>("/api/estatisticas/previsao");
        Assert.Equal((0m, 0m, 0m), (previsao.SaldoAtual, previsao.MediaDiaria, previsao.PrevisaoFinal));

        Assert.Equal(800, (await dono.GetJsonAsync<PrevisaoFimMesDto>("/api/estatisticas/previsao")).SaldoAtual);
    }
}

// Poupanças com contribuição manual por HTTP: estado, "contarNoPrevisto" e o previsto
public class PoupancasPorEnviarApiTests(FabricaApi fabrica) : IClassFixture<FabricaApi>
{
    [Fact]
    public async Task Contribuicao_manual_conta_no_previsto_ate_ser_enviada()
    {
        var cliente = fabrica.Cliente($"api-{Guid.NewGuid():N}");
        (await cliente.PutJsonAsync("/api/conta/saldo", new { saldo = 1000 })).EnsureSuccessStatusCode();
        var resposta = await cliente.PostJsonAsync("/api/poupancas", new { nome = "PPR", tipo = "valor", valor = "50", saldo = 0, contribuicaoAutomatica = false });
        Assert.Equal(HttpStatusCode.Created, resposta.StatusCode);
        var id = (await resposta.LerAsync<CriadoDto>()).Id;

        var lista = (await Json(await cliente.GetAsync("/api/poupancas"))).AsArray();
        Assert.True(lista[0]!["contarNoPrevisto"]!.GetValue<bool>());
        Assert.Equal(50, lista[0]!["valorMensal"]!.GetValue<decimal>());
        var saldos = await Json(await cliente.GetAsync("/api/conta/saldos"));
        Assert.Equal(950, saldos["previsto"]!.GetValue<decimal>());
        Assert.Equal(50, saldos["poupancasPorEnviar"]!.GetValue<decimal>());

        (await cliente.PatchJsonAsync($"/api/poupancas/{id}", new { contarNoPrevisto = false })).EnsureSuccessStatusCode();
        Assert.Equal(1000, (await Json(await cliente.GetAsync("/api/conta/saldos")))["previsto"]!.GetValue<decimal>());
        (await cliente.PatchJsonAsync($"/api/poupancas/{id}", new { contarNoPrevisto = true })).EnsureSuccessStatusCode();
        Assert.Equal(50, (await cliente.GetJsonAsync<PrevisaoFimMesDto>("/api/estatisticas/previsao")).PoupancasPorEnviar);

        (await cliente.PostAsync($"/api/poupancas/{id}/contribuir", null)).EnsureSuccessStatusCode();
        var enviada = (await Json(await cliente.GetAsync("/api/poupancas"))).AsArray()[0]!;
        Assert.Equal("2026-10-05", enviada["ultimaContribuicaoEm"]!.GetValue<string>());
        var depois = await Json(await cliente.GetAsync("/api/conta/saldos"));
        Assert.Equal((950m, 0m), (depois["previsto"]!.GetValue<decimal>(), depois["poupancasPorEnviar"]!.GetValue<decimal>()));

        // Outro utilizador não vê nem mexe nesta poupança
        var outro = fabrica.Cliente($"outro-{Guid.NewGuid():N}");
        Assert.Equal(0, (await Json(await outro.GetAsync("/api/conta/saldos")))["poupancasPorEnviar"]!.GetValue<decimal>());
        Assert.Equal(HttpStatusCode.NotFound, (await outro.PatchJsonAsync($"/api/poupancas/{id}", new { contarNoPrevisto = false })).StatusCode);
    }

    private static async Task<JsonNode> Json(HttpResponseMessage resposta) =>
        JsonNode.Parse(await resposta.Content.ReadAsStringAsync())!;
}
