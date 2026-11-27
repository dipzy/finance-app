using Financas.Services.Interfaces;

namespace Financas.Services.Tests;

/// <summary>Reprodução do GET /api/grupos (500 em produção).</summary>
public class GruposReproducaoTests : TestesServicos
{
    private IGruposService Grupos => A.Servico<IGruposService>();

    [Fact]
    public async Task Listar_QuandoTenhoUmGrupo_DevolveOHistograma()
    {
        var id = await Grupos.CriarAsync(Uid, "Família");
        Assert.NotEmpty(id);

        var lista = await Grupos.ListarAsync(Uid);

        var grupo = Assert.Single(lista);
        Assert.Equal("Família", grupo.Nome);
    }

    [Fact]
    public async Task Obter_QuandoSouMembro_DevolveOGrupo()
    {
        var id = await Grupos.CriarAsync(Uid, "Família");

        var grupo = await Grupos.ObterAsync(Uid, id);

        Assert.NotNull(grupo);
        Assert.Equal("Família", grupo.Nome);
    }
}
