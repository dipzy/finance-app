using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Financas.Api.Autenticacao;
using Financas.DAL;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

namespace Financas.Api.Tests;

/// <summary>
/// A API inteira a correr em memória (WebApplicationFactory), com:
/// <list type="bullet">
///   <item>SQLite em memória (partilhado, vivo enquanto a fábrica existir) em vez de PostgreSQL;</item>
///   <item>autenticação de teste: o cabeçalho <c>X-Utilizador: &lt;uid&gt;</c> em vez de um token do Firebase;</item>
///   <item>um relógio falso (FakeTimeProvider) para pôr a API em qualquer dia.</item>
/// </list>
/// Tudo o resto (controllers, validação, ProblemDetails, serviços, DAL) é o código verdadeiro.
/// </summary>
public class FabricaApi : WebApplicationFactory<Program>
{
    public static readonly TimeZoneInfo Lisboa = TimeZoneInfo.FindSystemTimeZoneById("Europe/Lisbon");

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private readonly string _ligacao = $"Data Source=api-testes-{Guid.NewGuid():N};Mode=Memory;Cache=Shared";
    private readonly SqliteConnection _manterViva;

    public FabricaApi()
    {
        // A base de dados em memória só existe enquanto houver uma ligação aberta
        SqliteNativo.Garantir();
        _manterViva = new SqliteConnection(_ligacao);
        _manterViva.Open();
        DefinirHoje(2026, 10, 5);
    }

    /// <summary>Ambiente do ASP.NET Core ("Testes" por defeito; alguns testes usam Production/Development).</summary>
    public string Ambiente { get; init; } = "Testes";

    /// <summary>Registar a autenticação de teste (cabeçalho X-Utilizador).</summary>
    public bool AutenticacaoDeTeste { get; init; } = true;

    public Dictionary<string, string?> Configuracao { get; init; } = [];

    public FakeTimeProvider Relogio { get; } = new() { AutoAdvanceAmount = TimeSpan.FromMilliseconds(1) };

    public void DefinirHoje(int ano, int mes, int dia, int hora = 12) =>
        Relogio.AdjustTime(new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(new DateTime(ano, mes, dia, hora, 0, 0), Lisboa)));

    /// <summary>Um cliente HTTP autenticado como o utilizador <paramref name="uid"/>.</summary>
    public HttpClient Cliente(string uid)
    {
        var cliente = CreateClient();
        cliente.DefaultRequestHeaders.Add(AutenticacaoPorCabecalho.Cabecalho, uid);
        return cliente;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Ambiente);
        builder.UseSetting("ConnectionStrings:Financas", _ligacao);
        // Limites de pedidos altos nos testes (os testes dos limites põem os seus em Configuracao)
        builder.UseSetting("LimitesPedidos:PorMinuto", "100000");
        builder.UseSetting("LimitesPedidos:PesadosPorMinuto", "100000");
        // Sem as linhas de log de cada pedido na saída dos testes
        builder.UseSetting("Serilog:MinimumLevel:Default", "Warning");
        foreach (var (chave, valor) in Configuracao)
        {
            builder.UseSetting(chave, valor);
        }

        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<TimeProvider>(Relogio);
            if (AutenticacaoDeTeste)
            {
                services
                    .AddAuthentication(AutenticacaoPorCabecalho.Esquema)
                    .AddScheme<AuthenticationSchemeOptions, AutenticacaoPorCabecalho>(AutenticacaoPorCabecalho.Esquema, null);
            }
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            _manterViva.Dispose();
        }
    }
}

internal static class ExtensoesHttp
{
    public static async Task<T> LerAsync<T>(this HttpResponseMessage resposta)
    {
        resposta.EnsureSuccessStatusCode();
        return (await resposta.Content.ReadFromJsonAsync<T>(FabricaApi.Json))!;
    }

    public static async Task<T> GetJsonAsync<T>(this HttpClient cliente, string url) => await (await cliente.GetAsync(url)).LerAsync<T>();

    public static Task<HttpResponseMessage> PostJsonAsync(this HttpClient cliente, string url, object corpo) =>
        cliente.PostAsJsonAsync(url, corpo, FabricaApi.Json);

    public static Task<HttpResponseMessage> PutJsonAsync(this HttpClient cliente, string url, object corpo) =>
        cliente.PutAsJsonAsync(url, corpo, FabricaApi.Json);

    public static Task<HttpResponseMessage> PatchJsonAsync(this HttpClient cliente, string url, object corpo) =>
        cliente.PatchAsJsonAsync(url, corpo, FabricaApi.Json);
}
