using System.Net;
using Financas.Api.Registos;
using Microsoft.Extensions.Configuration;

namespace Financas.Api.Tests;

// Sentry na API: só com Sentry__Dsn; sem DSN fica desligado e a API funciona igual
public class SentryApiTests
{
    private static IConfiguration Config(string? dsn) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Sentry:Dsn"] = dsn }).Build();

    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("https://chave@o0.ingest.sentry.io/0", true)]
    public void So_esta_ativo_com_DSN(string? dsn, bool ativo) => Assert.Equal(ativo, RegistosPedidos.SentryAtivo(Config(dsn)));

    [Fact]
    public async Task Sem_DSN_a_API_arranca_e_responde()
    {
        using var fabrica = new FabricaApi();
        Assert.Equal(HttpStatusCode.OK, (await fabrica.CreateClient().GetAsync("/saude")).StatusCode);
    }

}
