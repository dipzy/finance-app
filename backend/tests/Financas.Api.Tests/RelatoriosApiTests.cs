using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace Financas.Api.Tests;

// O relatório mensal em PDF por HTTP: autenticação, tipo do conteúdo e só os dados de quem pede
public partial class RelatoriosApiTests(FabricaApi fabrica) : IClassFixture<FabricaApi>
{
    private readonly string _uid = $"api-{Guid.NewGuid():N}";

    [GeneratedRegex(@"/Type\s*/Page(?![a-zA-Z])")]
    private static partial Regex ObjetoPagina();

    private static int Paginas(byte[] pdf) => ObjetoPagina().Matches(Encoding.Latin1.GetString(pdf)).Count;

    [Fact]
    public async Task Devolve_o_PDF_do_mes()
    {
        var resposta = await fabrica.Cliente(_uid).GetAsync("/api/relatorios/mes/2026-10.pdf");

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        Assert.Equal("application/pdf", resposta.Content.Headers.ContentType?.MediaType);
        Assert.Equal("financas-2026-10.pdf", resposta.Content.Headers.ContentDisposition?.FileName);
        var bytes = await resposta.Content.ReadAsByteArrayAsync();
        Assert.Equal("%PDF-", Encoding.ASCII.GetString(bytes, 0, 5));
        Assert.True(Paginas(bytes) >= 1);
    }

    [Fact]
    public async Task Sem_token_401_e_mes_invalido_ou_futuro_400()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await fabrica.CreateClient().GetAsync("/api/relatorios/mes/2026-10.pdf")).StatusCode);

        var cliente = fabrica.Cliente(_uid);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.GetAsync("/api/relatorios/mes/2026-13.pdf")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await cliente.GetAsync("/api/relatorios/mes/2027-01.pdf")).StatusCode);
    }

    [Fact]
    public async Task Cada_utilizador_so_ve_os_seus_dados()
    {
        // O utilizador A tem extras que chegam para mais de uma página; o B não tem nada
        var a = fabrica.Cliente(_uid);
        (await a.PostJsonAsync("/api/conta/movimentos", new { valor = 5000 })).EnsureSuccessStatusCode();
        for (var i = 1; i <= 45; i++)
        {
            (await a.PostJsonAsync("/api/despesas-extras", new { titulo = $"Despesa {i}", valor = 10 + i, data = "2026-10-02" })).EnsureSuccessStatusCode();
        }

        var b = fabrica.Cliente($"outro-{Guid.NewGuid():N}");
        var pdfA = await (await a.GetAsync("/api/relatorios/mes/2026-10.pdf")).Content.ReadAsByteArrayAsync();
        var respostaB = await b.GetAsync("/api/relatorios/mes/2026-10.pdf");

        Assert.Equal(HttpStatusCode.OK, respostaB.StatusCode);
        Assert.True(Paginas(pdfA) >= 2);
        Assert.Equal(1, Paginas(await respostaB.Content.ReadAsByteArrayAsync()));
    }
}
