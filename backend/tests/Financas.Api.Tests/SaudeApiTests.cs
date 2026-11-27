using System.Net;
using System.Text.Json.Nodes;
using Financas.DAL;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Financas.Api.Tests;

// /saude (sem base de dados) e /saude/pronta (testa a base de dados)
public class SaudeApiTests(FabricaApi fabrica) : IClassFixture<FabricaApi>
{
    private static async Task<JsonNode> Json(HttpResponseMessage resposta) =>
        JsonNode.Parse(await resposta.Content.ReadAsStringAsync())!;

    [Fact]
    public async Task Pronta_responde_200_sem_autenticacao_quando_a_base_de_dados_responde()
    {
        var resposta = await fabrica.CreateClient().GetAsync("/saude/pronta");

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        var corpo = await Json(resposta);
        Assert.Equal("pronta", corpo["estado"]!.GetValue<string>());
        Assert.Equal("ok", corpo["baseDeDados"]!.GetValue<string>());
    }

    [Fact]
    public async Task Pronta_nunca_e_limitada_como_o_saude()
    {
        using var limitada = new FabricaApi { Configuracao = { ["LimitesPedidos:PorMinuto"] = "1", ["LimitesPedidos:PesadosPorMinuto"] = "1" } };
        var cliente = limitada.CreateClient();

        for (var i = 0; i < 5; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await cliente.GetAsync("/saude/pronta")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await cliente.GetAsync("/saude")).StatusCode);
        }
    }

    [Fact]
    public async Task Saude_continua_sem_tocar_na_base_de_dados()
    {
        using var semBaseDeDados = new FabricaSemBaseDeDados();

        var viva = await semBaseDeDados.CreateClient().GetAsync("/saude");
        var pronta = await semBaseDeDados.CreateClient().GetAsync("/saude/pronta");

        Assert.Equal(HttpStatusCode.OK, viva.StatusCode);
        Assert.Equal("ok", (await Json(viva))["estado"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.ServiceUnavailable, pronta.StatusCode);
        var corpo = await Json(pronta);
        Assert.Equal("indisponivel", corpo["estado"]!.GetValue<string>());
        Assert.Equal("falha", corpo["baseDeDados"]!.GetValue<string>());
    }

    // A API com a base de dados "em baixo" (o verificador diz que não responde)
    private sealed class FabricaSemBaseDeDados : FabricaApi
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services => services.Replace(ServiceDescriptor.Scoped<IVerificadorBaseDeDados, BaseDeDadosEmBaixo>()));
        }
    }

    private sealed class BaseDeDadosEmBaixo : IVerificadorBaseDeDados
    {
        public Task<bool> EstaDisponivelAsync(TimeSpan espera, CancellationToken ct = default) => Task.FromResult(false);
    }
}
