using System.Net;
using System.Text.Json.Nodes;
using Financas.Api.Autenticacao;
using Financas.Services.Dtos;

namespace Financas.Api.Tests;

// Grupos, despesas partilhadas, acertos e mealheiros por HTTP: rotas, JSON e quem pode o quê
public class PartilhadoApiTests(FabricaApi fabrica) : IClassFixture<FabricaApi>
{
    private readonly string _eu = $"eu-{Guid.NewGuid():N}";
    private readonly string _ana = $"ana-{Guid.NewGuid():N}";
    private readonly string _emailAna = $"ana-{Guid.NewGuid():N}@exemplo.pt";

    private HttpClient Cliente(string uid, string? emailConfirmado = null)
    {
        var cliente = fabrica.Cliente(uid);
        if (emailConfirmado is not null) cliente.DefaultRequestHeaders.Add(AutenticacaoPorCabecalho.CabecalhoEmail, emailConfirmado);
        return cliente;
    }

    private static async Task<JsonNode> Json(HttpClient cliente, string url)
    {
        var resposta = await cliente.GetAsync(url);
        resposta.EnsureSuccessStatusCode();
        return JsonNode.Parse(await resposta.Content.ReadAsStringAsync())!;
    }

    private async Task<string> GrupoComAna(HttpClient eu, HttpClient ana)
    {
        var grupo = (await (await eu.PostJsonAsync("/api/grupos", new { nome = "Casa" })).LerAsync<CriadoDto>()).Id;
        var convite = await eu.PostJsonAsync($"/api/grupos/{grupo}/convites", new { email = _emailAna });
        Assert.Equal(HttpStatusCode.Created, convite.StatusCode);
        var id = (await convite.LerAsync<CriadoDto>()).Id;
        Assert.Equal(HttpStatusCode.NoContent, (await ana.PostAsync($"/api/grupos/convites/{id}/aceitar", null)).StatusCode);
        return grupo;
    }

    [Fact]
    public async Task Convites_recebidos_so_com_email_confirmado_no_token()
    {
        var eu = Cliente(_eu);
        var grupo = (await (await eu.PostJsonAsync("/api/grupos", new { nome = "Casa" })).LerAsync<CriadoDto>()).Id;
        await eu.PostJsonAsync($"/api/grupos/{grupo}/convites", new { email = _emailAna });

        var semEmail = await Json(Cliente(_ana), "/api/grupos/convites/recebidos");
        Assert.False(semEmail["emailConfirmado"]!.GetValue<bool>());

        // Mudar o email do perfil não chega
        Assert.True((await Cliente(_ana).PutJsonAsync("/api/perfil", new { email = _emailAna, name = "Ana" })).IsSuccessStatusCode);
        Assert.Empty((await Json(Cliente(_ana), "/api/grupos/convites/recebidos"))["convites"]!.AsArray());

        var comEmail = await Json(Cliente(_ana, _emailAna), "/api/grupos/convites/recebidos");
        var convite = comEmail["convites"]!.AsArray().Single()!;
        Assert.Equal("Casa", convite["grupoNome"]!.GetValue<string>());
        Assert.Equal("pendente", convite["estado"]!.GetValue<string>());
    }

    [Fact]
    public async Task Despesa_fixa_dividida_por_http_valor_e_a_minha_parte_e_o_debito_vai_para_o_grupo()
    {
        var eu = Cliente(_eu);
        var ana = Cliente(_ana, _emailAna);
        var grupo = await GrupoComAna(eu, ana);
        (await eu.PostJsonAsync("/api/conta/movimentos", new { valor = 1000 })).EnsureSuccessStatusCode();

        var criada = await eu.PostJsonAsync("/api/despesas-fixas", new
        {
            titulo = "Renda",
            valor = 800,
            diaDebito = 1,
            divisao = new { grupoId = grupo, modo = "percentagem", participantes = new object[] { new { uid = _eu, peso = 75 }, new { uid = _ana, peso = 25 } } },
        });
        Assert.Equal(HttpStatusCode.Created, criada.StatusCode);
        var id = (await criada.LerAsync<CriadoDto>()).Id;

        // O valor da despesa é só a minha parte; o total e a divisão ficam guardados
        var fixa = (await Json(eu, "/api/despesas-fixas")).AsArray().Single()!;
        Assert.Equal(600m, fixa["valor"]!.GetValue<decimal>());
        Assert.Equal(800m, fixa["valorTotal"]!.GetValue<decimal>());
        Assert.Equal("percentagem", fixa["divisao"]!["modo"]!.GetValue<string>());

        Assert.Equal(HttpStatusCode.OK, (await eu.PostAsync($"/api/despesas-fixas/{id}/debitar", null)).StatusCode);

        // Em parcial não se paga, e a despesa do grupo só se desfaz anulando o pagamento
        Assert.Equal(HttpStatusCode.BadRequest, (await eu.PostJsonAsync($"/api/despesas-fixas/{id}/debitar-parcial", new { valor = 100 })).StatusCode);
        var atividade = (await Json(eu, $"/api/grupos/{grupo}/atividade")).AsArray();
        var despesa = atividade.Single(a => a!["tipo"]!.GetValue<string>() == "despesa")!;
        Assert.False(despesa["podeApagar"]!.GetValue<bool>());
        Assert.Equal(200m, (await Json(ana, $"/api/grupos/{grupo}/saldos"))["meuSaldo"]!.GetValue<decimal>() * -1);
    }

    [Fact]
    public async Task Despesa_saldos_acerto_e_resumo()
    {
        var eu = Cliente(_eu);
        var ana = Cliente(_ana, _emailAna);
        var grupo = await GrupoComAna(eu, ana);

        var grupos = (await Json(eu, "/api/grupos")).AsArray();
        Assert.Equal("admin", grupos.Single()!["minhaRole"]!.GetValue<string>());

        var criada = await eu.PostJsonAsync($"/api/grupos/{grupo}/despesas", new
        {
            titulo = "Jantar",
            valor = 50,
            modo = "valores",
            participantes = new object[] { new { uid = _eu, peso = 20 }, new { uid = _ana, peso = 30 } },
        });
        Assert.Equal(HttpStatusCode.Created, criada.StatusCode);
        var despesa = (await criada.LerAsync<CriadoDto>()).Id;

        // A parte da Ana só conta no saldo do grupo depois de ela aceitar
        Assert.Equal(0m, (await Json(ana, $"/api/grupos/{grupo}/saldos"))["meuSaldo"]!.GetValue<decimal>());
        Assert.Equal(HttpStatusCode.NoContent, (await ana.PostJsonAsync($"/api/despesas-partilhadas/{despesa}/aceitar", new { })).StatusCode);

        var saldos = await Json(ana, $"/api/grupos/{grupo}/saldos");
        Assert.Equal(-30m, saldos["meuSaldo"]!.GetValue<decimal>());
        var t = saldos["transferencias"]!.AsArray().Single()!;
        Assert.Equal(_ana, t["deUid"]!.GetValue<string>());

        Assert.Equal(HttpStatusCode.Created, (await ana.PostJsonAsync($"/api/grupos/{grupo}/acertos", new { deUid = _ana, paraUid = _eu, valor = 30 })).StatusCode);
        Assert.Equal(0m, (await Json(ana, $"/api/grupos/{grupo}/saldos"))["meuSaldo"]!.GetValue<decimal>());

        var atividade = (await Json(eu, $"/api/grupos/{grupo}/atividade")).AsArray();
        Assert.Equal(["acerto", "despesa"], atividade.Select(a => a!["tipo"]!.GetValue<string>()).Order());

        var resumo = await Json(eu, "/api/partilhado/resumo?mes=2026-10");
        Assert.Equal(20m, resumo["minhaParteMes"]!.GetValue<decimal>());
        Assert.Equal(50m, resumo["pagoPorMimMes"]!.GetValue<decimal>());

        // A Ana não apaga a despesa que eu paguei; a parte dela nos gastos também não se apaga
        Assert.Equal(HttpStatusCode.BadRequest, (await ana.DeleteAsync($"/api/despesas-partilhadas/{despesa}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await eu.DeleteAsync($"/api/despesas-partilhadas/{despesa}")).StatusCode);
    }

    [Fact]
    public async Task Quem_nao_e_membro_recebe_404_em_tudo()
    {
        var eu = Cliente(_eu);
        var ana = Cliente(_ana, _emailAna);
        var grupo = await GrupoComAna(eu, ana);
        var estranho = Cliente($"x-{Guid.NewGuid():N}");
        var mealheiro = (await (await eu.PostJsonAsync($"/api/grupos/{grupo}/poupancas-partilhadas", new { nome = "Férias" })).LerAsync<CriadoDto>()).Id;

        Assert.Equal(HttpStatusCode.NotFound, (await estranho.GetAsync($"/api/grupos/{grupo}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await estranho.GetAsync($"/api/grupos/{grupo}/saldos")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await estranho.GetAsync($"/api/grupos/{grupo}/membros")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await estranho.GetAsync($"/api/poupancas-partilhadas/{mealheiro}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await estranho.PostJsonAsync($"/api/poupancas-partilhadas/{mealheiro}/levantar", new { valor = 1 })).StatusCode);

        // Removida, a Ana passa a estranha
        Assert.Equal(HttpStatusCode.NoContent, (await eu.DeleteAsync($"/api/grupos/{grupo}/membros/{_ana}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ana.GetAsync($"/api/grupos/{grupo}/saldos")).StatusCode);
    }

    [Fact]
    public async Task Papel_invalido_e_400()
    {
        var eu = Cliente(_eu);
        var ana = Cliente(_ana, _emailAna);
        var grupo = await GrupoComAna(eu, ana);

        Assert.Equal(HttpStatusCode.BadRequest, (await eu.PutJsonAsync($"/api/grupos/{grupo}/membros/{_ana}/role", new { role = 99 })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await eu.PutJsonAsync($"/api/grupos/{grupo}/membros/{_ana}/role", new { role = "admin" })).StatusCode);
    }
}
