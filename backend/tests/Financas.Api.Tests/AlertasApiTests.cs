using System.Net;
using System.Text.Json.Nodes;
using Financas.Services.Dtos;
using Financas.Services.Push;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Financas.Api.Tests;

/// <summary>O Expo falso das provas da API: guarda o que lhe pedem para enviar.</summary>
public sealed class ExpoFalso : IExpoPushClient
{
    public List<MensagemPush> Enviadas { get; } = [];

    public Task<IReadOnlyList<ResultadoPush>> EnviarAsync(IReadOnlyList<MensagemPush> mensagens, CancellationToken ct = default)
    {
        Enviadas.AddRange(mensagens);
        return Task.FromResult<IReadOnlyList<ResultadoPush>>([.. mensagens.Select(_ => new ResultadoPush(true, false, null))]);
    }
}

/// <summary>A API com o Expo falso (nunca se chama o Expo a sério) e o segredo do cron em <c>Alertas:SegredoCron</c> se for dado.</summary>
public sealed class FabricaAlertas : FabricaApi
{
    public ExpoFalso Expo { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureTestServices(services => services.AddSingleton<IExpoPushClient>(Expo));
    }
}

// GET /api/alertas, /api/dispositivos e o POST /api/interno/alertas/enviar (cron) por HTTP
public class AlertasApiTests : IClassFixture<FabricaAlertas>
{
    private const string Segredo = "segredo-do-cron";
    private const string Token = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";

    private readonly FabricaAlertas _fabrica;
    private readonly HttpClient _cliente;
    private readonly string _uid = $"api-{Guid.NewGuid():N}";

    public AlertasApiTests(FabricaAlertas fabrica)
    {
        _fabrica = fabrica;
        _cliente = fabrica.Cliente(_uid);
    }

    private static async Task<JsonNode> Json(HttpClient cliente, string url)
    {
        var resposta = await cliente.GetAsync(url);
        resposta.EnsureSuccessStatusCode();
        return JsonNode.Parse(await resposta.Content.ReadAsStringAsync())!;
    }

    // Um orçamento excedido e uma despesa mensal a vencer amanhã (hoje é 5 de outubro de 2026)
    private async Task ComAlertasAsync(HttpClient cliente)
    {
        (await cliente.PostJsonAsync("/api/orcamentos", new { categoria = "lazer", limite = 100 })).EnsureSuccessStatusCode();
        (await cliente.PostJsonAsync("/api/despesas-extras", new { titulo = "Cinema", valor = 100, categoria = "lazer" })).EnsureSuccessStatusCode();
        (await cliente.PostJsonAsync("/api/despesas-fixas", new { titulo = "Renda", valor = 550, diaDebito = 6 })).EnsureSuccessStatusCode();
    }

    private static HttpRequestMessage Enviar(string? segredo)
    {
        var pedido = new HttpRequestMessage(HttpMethod.Post, "/api/interno/alertas/enviar");
        if (segredo is not null)
        {
            pedido.Headers.Add("X-Cron-Secret", segredo);
        }

        return pedido;
    }

    // ---- GET /api/alertas ----

    [Fact]
    public async Task Alertas_sem_autenticacao_401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _fabrica.CreateClient().GetAsync("/api/alertas")).StatusCode);
    }

    [Fact]
    public async Task Sem_nada_a_dizer_devolve_lista_vazia()
    {
        Assert.Empty((await Json(_cliente, "/api/alertas")).AsArray());
    }

    [Fact]
    public async Task Alertas_tem_a_forma_que_a_app_espera()
    {
        await ComAlertasAsync(_cliente);

        var alertas = (await Json(_cliente, "/api/alertas")).AsArray();

        Assert.Equal(2, alertas.Count);
        var excedido = alertas[0]!;
        Assert.Equal("orcamento-excedido", excedido["tipo"]!.GetValue<string>());
        Assert.Equal("critico", excedido["severidade"]!.GetValue<string>());
        Assert.Equal("Orçamento de Lazer ultrapassado", excedido["titulo"]!.GetValue<string>());
        Assert.Equal("Gastaste 100,00 € de 100,00 € em Lazer: limite ultrapassado.", excedido["mensagem"]!.GetValue<string>());
        Assert.False(string.IsNullOrEmpty(excedido["referencia"]!.GetValue<string>()));
        Assert.Equal("2026-10-05", excedido["data"]!.GetValue<string>());
        var renda = alertas[1]!;
        Assert.Equal("despesa-a-vencer", renda["tipo"]!.GetValue<string>());
        Assert.Equal("aviso", renda["severidade"]!.GetValue<string>());
        Assert.Equal("Renda sai amanhã — 550,00 €", renda["titulo"]!.GetValue<string>());
        Assert.Equal("2026-10-06", renda["data"]!.GetValue<string>());
    }

    [Fact]
    public async Task Alertas_na_lingua_do_Accept_Language_e_so_do_proprio_utilizador()
    {
        await ComAlertasAsync(_cliente);
        var pedido = new HttpRequestMessage(HttpMethod.Get, "/api/alertas");
        pedido.Headers.Add("Accept-Language", "en");

        var resposta = await _cliente.SendAsync(pedido);

        var alertas = JsonNode.Parse(await resposta.Content.ReadAsStringAsync())!.AsArray();
        Assert.Equal("Leisure budget exceeded", alertas[0]!["titulo"]!.GetValue<string>());
        Assert.Empty((await Json(_fabrica.Cliente($"outro-{Guid.NewGuid():N}"), "/api/alertas")).AsArray());
    }

    // ---- /api/dispositivos ----

    [Fact]
    public async Task Registar_listar_e_apagar_dispositivo()
    {
        var registado = await _cliente.PostJsonAsync("/api/dispositivos", new { token = Token, plataforma = "android", idioma = "pt" });
        Assert.Equal(HttpStatusCode.OK, registado.StatusCode);
        var dispositivo = await registado.LerAsync<DispositivoDto>();
        Assert.Equal("android", dispositivo.Plataforma);
        Assert.Equal("pt", dispositivo.Idioma);

        // Registar outra vez é seguro (renova)
        Assert.Equal(HttpStatusCode.OK, (await _cliente.PostJsonAsync("/api/dispositivos", new { token = Token, plataforma = "android" })).StatusCode);
        Assert.Single((await Json(_cliente, "/api/dispositivos")).AsArray());

        Assert.Equal(HttpStatusCode.NoContent, (await _cliente.DeleteAsync($"/api/dispositivos?token={Uri.EscapeDataString(Token)}")).StatusCode);
        Assert.Empty((await Json(_cliente, "/api/dispositivos")).AsArray());
        Assert.Equal(HttpStatusCode.NoContent, (await _cliente.DeleteAsync($"/api/dispositivos?token={Uri.EscapeDataString(Token)}")).StatusCode);
    }

    [Fact]
    public async Task Dispositivo_invalido_da_400()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _cliente.PostJsonAsync("/api/dispositivos", new { token = "nao-e-um-token", plataforma = "android" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _cliente.PostJsonAsync("/api/dispositivos", new { token = Token, plataforma = "windows" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _cliente.PostJsonAsync("/api/dispositivos", new { plataforma = "android" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _cliente.DeleteAsync("/api/dispositivos")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _fabrica.CreateClient().PostJsonAsync("/api/dispositivos", new { token = Token, plataforma = "android" })).StatusCode);
    }

    // ---- POST /api/interno/alertas/enviar ----

    [Fact]
    public async Task Sem_segredo_configurado_o_endpoint_do_cron_esta_desativado_404()
    {
        // A fábrica deste teste não tem Alertas:SegredoCron
        using var cliente = _fabrica.CreateClient();

        Assert.Equal(HttpStatusCode.NotFound, (await cliente.SendAsync(Enviar(null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await cliente.SendAsync(Enviar(Segredo))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await cliente.SendAsync(Enviar(""))).StatusCode);
    }

    [Fact]
    public async Task Com_segredo_configurado_exige_o_cabecalho_certo()
    {
        using var fabrica = new FabricaAlertas { Configuracao = { ["Alertas:SegredoCron"] = Segredo } };
        using var anonimo = fabrica.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.SendAsync(Enviar(null))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.SendAsync(Enviar("errado"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.SendAsync(Enviar(Segredo + "x"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.SendAsync(Enviar(""))).StatusCode);
        // Um utilizador autenticado, sem o segredo, também não pode
        Assert.Equal(HttpStatusCode.Unauthorized, (await fabrica.Cliente("alguem").SendAsync(Enviar(null))).StatusCode);
        Assert.Empty(fabrica.Expo.Enviadas);
    }

    [Fact]
    public async Task O_cron_envia_os_alertas_uma_vez_e_responde_com_o_resumo()
    {
        using var fabrica = new FabricaAlertas { Configuracao = { ["Alertas:SegredoCron"] = Segredo } };
        var cliente = fabrica.Cliente($"api-{Guid.NewGuid():N}");
        await ComAlertasAsync(cliente);
        (await cliente.PostJsonAsync("/api/dispositivos", new { token = Token, plataforma = "android", idioma = "pt" })).EnsureSuccessStatusCode();
        using var cron = fabrica.CreateClient();

        var primeira = await cron.SendAsync(Enviar(Segredo));

        Assert.Equal(HttpStatusCode.OK, primeira.StatusCode);
        var resumo = JsonNode.Parse(await primeira.Content.ReadAsStringAsync())!;
        Assert.Equal(1, resumo["utilizadores"]!.GetValue<int>());
        Assert.Equal(1, resumo["dispositivos"]!.GetValue<int>());
        Assert.Equal(2, resumo["alertasEnviados"]!.GetValue<int>());
        Assert.Equal(0, resumo["alertasJaEnviados"]!.GetValue<int>());
        Assert.Equal(0, resumo["falhas"]!.GetValue<int>());
        Assert.Equal(0, resumo["dispositivosRemovidos"]!.GetValue<int>());
        Assert.Equal(2, fabrica.Expo.Enviadas.Count);
        Assert.Contains(fabrica.Expo.Enviadas, m => m.Titulo == "Renda sai amanhã — 550,00 €" && m.Token == Token);

        // A segunda chamada no mesmo dia não repete nada
        var segunda = JsonNode.Parse(await (await cron.SendAsync(Enviar(Segredo))).Content.ReadAsStringAsync())!;
        Assert.Equal(0, segunda["alertasEnviados"]!.GetValue<int>());
        Assert.Equal(2, segunda["alertasJaEnviados"]!.GetValue<int>());
        Assert.Equal(2, fabrica.Expo.Enviadas.Count);
    }
}
