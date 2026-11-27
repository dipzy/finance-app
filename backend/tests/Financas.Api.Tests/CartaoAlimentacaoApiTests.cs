using System.Net;
using System.Text.Json.Nodes;
using Financas.Services.Dtos;

namespace Financas.Api.Tests;

// O cartão de alimentação e o estado das despesas mensais na folha, por HTTP
public class CartaoAlimentacaoApiTests(FabricaApi fabrica) : IClassFixture<FabricaApi>
{
    private readonly HttpClient _cliente = fabrica.Cliente($"api-{Guid.NewGuid():N}");

    private async Task<JsonNode> Json(string url) => JsonNode.Parse(await (await _cliente.GetAsync(url)).Content.ReadAsStringAsync())!;

    private static string Titulo(JsonNode? linha) => linha!["titulo"]!.GetValue<string>();

    [Fact]
    public async Task Saldo_do_cartao_pagar_com_ele_e_409_quando_nao_chega()
    {
        Assert.Equal(0, (await Json("/api/conta/cartao-alimentacao"))["saldo"]!.GetValue<decimal>());
        Assert.Equal(HttpStatusCode.NoContent, (await _cliente.PutJsonAsync("/api/conta/cartao-alimentacao", new { saldo = 98.5 })).StatusCode);
        (await _cliente.PostJsonAsync("/api/conta/movimentos", new { valor = 500 })).EnsureSuccessStatusCode();

        var criada = await _cliente.PostJsonAsync("/api/despesas-extras", new { titulo = "Almoço", valor = 8.5, meioPagamento = "cartaoAlimentacao" });
        Assert.Equal(HttpStatusCode.Created, criada.StatusCode);
        Assert.Equal(90, (await Json("/api/conta/cartao-alimentacao"))["saldo"]!.GetValue<decimal>());
        Assert.Equal(500, (await _cliente.GetJsonAsync<SaldoDto>("/api/conta/saldo")).Saldo);

        var extra = (await Json("/api/despesas-extras?mes=2026-10")).AsArray().Single()!;
        Assert.Equal("cartaoAlimentacao", extra["meioPagamento"]!.GetValue<string>());

        var semSaldo = await _cliente.PostJsonAsync("/api/despesas-extras", new { titulo = "Jantar", valor = 200, meioPagamento = "cartaoAlimentacao" });
        Assert.Equal(HttpStatusCode.Conflict, semSaldo.StatusCode);
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await _cliente.PostJsonAsync("/api/despesas-extras", new { titulo = "x", valor = 1, meioPagamento = "multibanco" })).StatusCode);

        // Sem meio de pagamento é da conta
        (await _cliente.PostJsonAsync("/api/despesas-extras", new { titulo = "Cinema", valor = 10 })).EnsureSuccessStatusCode();
        Assert.Equal(490, (await _cliente.GetJsonAsync<SaldoDto>("/api/conta/saldo")).Saldo);
        var despesasMes = (await Json("/api/folha/2026-10"))["despesasMes"]!.AsArray();
        Assert.True(despesasMes.Single(l => Titulo(l) == "Almoço")!["cartaoAlimentacao"]!.GetValue<bool>());
        Assert.False(despesasMes.Single(l => Titulo(l) == "Cinema")!.AsObject().ContainsKey("cartaoAlimentacao"));
    }

    [Fact]
    public async Task As_despesas_mensais_da_folha_dizem_se_estao_pagas()
    {
        (await _cliente.PostJsonAsync("/api/conta/movimentos", new { valor = 1000 })).EnsureSuccessStatusCode();
        (await _cliente.PostJsonAsync("/api/despesas-fixas", new { titulo = "Renda", valor = 300, diaDebito = 1 })).EnsureSuccessStatusCode();
        (await _cliente.PostJsonAsync("/api/despesas-fixas", new { titulo = "Ginásio", valor = 30, diaDebito = 28 })).EnsureSuccessStatusCode();
        await _cliente.GetAsync("/api/conta/saldo"); // débito automático da renda (dia 1)

        var despesas = (await Json("/api/folha/2026-10"))["despesas"]!.AsArray();
        var renda = despesas.Single(l => Titulo(l) == "Renda")!;
        Assert.Equal("pago", renda["estado"]!.GetValue<string>());
        Assert.Equal("2026-10-05", renda["data"]!.GetValue<string>());
        Assert.Equal("por-pagar", despesas.Single(l => Titulo(l) == "Ginásio")!["estado"]!.GetValue<string>());
    }
}
