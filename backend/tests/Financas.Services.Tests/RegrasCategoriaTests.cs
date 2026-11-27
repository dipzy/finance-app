using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// Regras de categorização automática: as do utilizador e as que vêm com a aplicação
public class RegrasCategoriaTests : TestesServicos
{
    private IRegrasCategoriaService Regras => A.Servico<IRegrasCategoriaService>();

    private Task<string> Regra(string texto, string categoria, bool? ativa = null, int? prioridade = null) =>
        Regras.AdicionarAsync(Uid, new NovaRegraCategoriaPedido(texto, categoria, ativa, prioridade));

    private static RegraCategoria Entidade(string texto, string categoria, bool ativa = true, int prioridade = 0, int minutos = 0) => new()
    {
        UtilizadorId = "u",
        Id = Guid.NewGuid().ToString("N"),
        Texto = texto,
        Categoria = categoria,
        Ativa = ativa,
        Prioridade = prioridade,
        CriadoEm = new DateTimeOffset(2026, 9, 1, 10, 0, 0, TimeSpan.Zero).AddMinutes(minutos),
    };

    // ---- Funções puras ----

    [Theory]
    [InlineData("CONTINENTE MODELO SALDANHA", "supermercado")]
    [InlineData("Compra Pingo Doce Lisboa", "supermercado")]
    [InlineData("PingoDoce 123", "supermercado")]
    [InlineData("Lidl Portugal", "supermercado")]
    [InlineData("ALDI Setúbal", "supermercado")]
    [InlineData("Auchan Alfragide", "supermercado")]
    [InlineData("Mercadona", "supermercado")]
    [InlineData("MINIPREÇO", "supermercado")]
    [InlineData("Intermarché", "supermercado")]
    [InlineData("Recheio Cash & Carry", "supermercado")]
    [InlineData("GALP Benfica", "combustivel")]
    [InlineData("Repsol A1", "combustivel")]
    [InlineData("BP Lisboa", "combustivel")]
    [InlineData("PRIO Energy", "combustivel")]
    [InlineData("Uber Eats Lisboa", "restauracao")]
    [InlineData("UBER *TRIP", "transportes")]
    [InlineData("McDonald's Colombo", "restauracao")]
    [InlineData("Worten Colombo", "compras")]
    [InlineData("Vodafone Portugal", "telecomunicacoes")]
    public void As_regras_padrao_servem_os_comercios_de_Portugal(string descricao, string categoria)
    {
        var regra = RegrasPadrao.Procurar(descricao);
        Assert.NotNull(regra);
        Assert.Equal(categoria, regra!.Categoria);
    }

    [Theory]
    [InlineData("Transferência BPI")] // "bp" só conta como palavra inteira
    [InlineData("CPU nova")]
    [InlineData("Qualquer coisa")]
    [InlineData("")]
    [InlineData(null)]
    public void As_regras_padrao_comparam_palavras_inteiras(string? descricao) => Assert.Null(RegrasPadrao.Procurar(descricao));

    [Fact]
    public void As_regras_padrao_so_usam_categorias_que_existem()
    {
        Assert.NotEmpty(RegrasPadrao.Todas);
        Assert.All(RegrasPadrao.Todas, r => Assert.True(Categorias.EValida(r.Categoria), r.Texto));
        // Os textos estão normalizados (senão nunca serviriam)
        Assert.All(RegrasPadrao.Todas, r => Assert.Equal(RegrasPadrao.PalavrasInteiras(r.Texto), r.Texto));
    }

    [Fact]
    public void As_regras_do_utilizador_ganham_ao_historico_as_palavras_chave_e_as_regras_padrao()
    {
        var regras = new[] { Entidade("continente", "casa") };

        var sugestao = Categorias.Sugerir("Continente Modelo", [], regras);

        Assert.Equal(new SugestaoCategoria("casa", OrigemSugestao.Regra, "continente"), sugestao);
        // Sem a regra, o comportamento de antes
        Assert.Equal(new SugestaoCategoria("supermercado", OrigemSugestao.PalavraChave), Categorias.Sugerir("Continente Modelo", [], []));
    }

    [Fact]
    public void A_comparacao_das_regras_e_sem_maiusculas_nem_acentos_e_por_contem()
    {
        var regras = new[] { Entidade("Pastelaria São João", "lazer") };

        Assert.Equal("lazer", Categorias.Sugerir("PASTELARIA SAO JOAO - Porto", [], regras).Categoria);
        Assert.Equal("lazer", Categorias.Sugerir("compra pastelaria são joão", [], regras).Categoria);
        Assert.NotEqual(OrigemSugestao.Regra, Categorias.Sugerir("Pastelaria São José", [], regras).Origem);
    }

    [Fact]
    public void Entre_regras_do_utilizador_ganha_a_maior_prioridade_depois_o_texto_mais_comprido_depois_a_mais_antiga()
    {
        var porPrioridade = new[] { Entidade("super", "casa", prioridade: 1), Entidade("super bock", "lazer", prioridade: 5) };
        Assert.Equal("lazer", Categorias.Sugerir("Super Bock Arena", [], porPrioridade).Categoria);

        var porPrioridadeInversa = new[] { Entidade("super", "casa", prioridade: 9), Entidade("super bock", "lazer", prioridade: 5) };
        Assert.Equal("casa", Categorias.Sugerir("Super Bock Arena", [], porPrioridadeInversa).Categoria);

        var porTexto = new[] { Entidade("super", "casa"), Entidade("super bock", "lazer") };
        Assert.Equal("lazer", Categorias.Sugerir("Super Bock Arena", [], porTexto).Categoria);

        var porIdade = new[] { Entidade("abc", "casa", minutos: 5), Entidade("abc", "lazer", minutos: 1) };
        Assert.Equal("lazer", Categorias.Sugerir("abc", [], porIdade).Categoria);
    }

    [Fact]
    public void As_regras_inativas_e_com_texto_vazio_nao_servem()
    {
        var regras = new[] { Entidade("continente", "casa", ativa: false), Entidade("   ", "lazer") };

        var sugestao = Categorias.Sugerir("Continente", [], regras);

        Assert.Equal(OrigemSugestao.PalavraChave, sugestao.Origem);
        Assert.Equal("supermercado", sugestao.Categoria);
    }

    [Fact]
    public void As_regras_padrao_so_entram_quando_as_palavras_chave_antigas_nao_servem()
    {
        // "prio" já era palavra-chave: mantém a origem de sempre
        Assert.Equal(OrigemSugestao.PalavraChave, Categorias.Sugerir("Prio Energy", [], []).Origem);
        // "recheio" só existe nas regras padrão
        Assert.Equal(new SugestaoCategoria("supermercado", OrigemSugestao.RegraPadrao, "recheio"), Categorias.Sugerir("Recheio Cash", [], []));
    }

    // ---- Serviço ----

    [Fact]
    public async Task Criar_listar_substituir_e_apagar_regras()
    {
        var id = await Regra("  Padaria do Bairro ", "supermercado", prioridade: 3);

        var lista = await Regras.ListarAsync(Uid);
        Assert.Equal(new RegraCategoriaDto(id, "Padaria do Bairro", "supermercado", true, 3), Assert.Single(lista));

        await Regras.SubstituirAsync(Uid, id, new NovaRegraCategoriaPedido("Padaria Nova", "restauracao", false, null));
        Assert.Equal(new RegraCategoriaDto(id, "Padaria Nova", "restauracao", false, 0), Assert.Single(await Regras.ListarAsync(Uid)));

        await Regras.RemoverAsync(Uid, id);
        Assert.Empty(await Regras.ListarAsync(Uid));
        await Regras.RemoverAsync(Uid, id); // apagar outra vez não dá erro
    }

    [Fact]
    public async Task O_texto_repetido_sem_acentos_nem_maiusculas_da_409_e_so_as_do_proprio_utilizador_contam()
    {
        await Regra("Ginásio", "saude");

        await Assert.ThrowsAsync<ConflitoException>(() => Regra("GINASIO ", "lazer"));
        var outra = await Regra("Natação", "saude");
        await Assert.ThrowsAsync<ConflitoException>(() =>
            Regras.SubstituirAsync(Uid, outra, new NovaRegraCategoriaPedido("ginasio", "saude", null, null)));
        // Substituir a mesma regra com o mesmo texto é permitido
        await Regras.SubstituirAsync(Uid, outra, new NovaRegraCategoriaPedido("Natação", "lazer", null, null));

        // Outro utilizador pode ter o mesmo texto
        await A.Servico<IRegrasCategoriaService>().AdicionarAsync("outro", new NovaRegraCategoriaPedido("Ginásio", "lazer"));
        Assert.Single(await Regras.ListarAsync("outro"));
    }

    [Fact]
    public async Task Texto_so_com_espacos_ou_regra_inexistente()
    {
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Regra("   ", "casa"));
        await Assert.ThrowsAsync<NaoEncontradoException>(() =>
            Regras.SubstituirAsync(Uid, "nao-existe", new NovaRegraCategoriaPedido("x", "casa")));
        var id = await Regra("coisa", "casa");
        await Assert.ThrowsAsync<NaoEncontradoException>(() =>
            Regras.SubstituirAsync("outro", id, new NovaRegraCategoriaPedido("coisa", "casa")));
    }

    [Fact]
    public async Task Sugerir_usa_as_regras_do_utilizador_e_so_as_dele()
    {
        await Regra("netflix", "educacao");

        Assert.Equal(new SugestaoCategoria("educacao", OrigemSugestao.Regra, "netflix"), await Regras.SugerirAsync(Uid, "NETFLIX.COM"));
        Assert.Equal("lazer", (await Regras.SugerirAsync("outro", "NETFLIX.COM")).Categoria);
        Assert.Equal("supermercado", (await Regras.SugerirAsync(Uid, "Lidl")).Categoria);
        Assert.Equal(new SugestaoCategoria("outros", OrigemSugestao.PorDefeito), await Regras.SugerirAsync(Uid, ""));
    }

    // ---- Integração: despesas sem categoria explícita ----

    [Fact]
    public async Task A_despesa_extra_sem_categoria_usa_as_regras_do_utilizador()
    {
        await Regra("lojinha do zé", "presentes");

        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Compra na Lojinha do Zé", 5, null));
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Continente", 5, null));
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Lojinha do Zé", 5, null, "casa")); // a categoria explícita ganha

        var lista = await ExtrasDoMes("2026-10");
        Assert.Equal("presentes", lista.Single(e => e.Titulo == "Compra na Lojinha do Zé").Categoria);
        Assert.Equal("supermercado", lista.Single(e => e.Titulo == "Continente").Categoria);
        Assert.Equal("casa", lista.Single(e => e.Titulo == "Lojinha do Zé").Categoria);
        Assert.Equal("presentes", (await Extras.SugerirCategoriaAsync(Uid, "lojinha do zé")).Categoria);
    }

    [Fact]
    public async Task A_despesa_historica_e_o_gasto_recorrente_usam_as_regras()
    {
        await Regra("tasca do tó", "lazer");

        var historica = await Extras.AdicionarHistoricaAsync(Uid, new DespesaHistoricaPedido("Tasca do Tó", 8, new DateOnly(2026, 9, 3)));
        await A.Servico<IGastosRecorrentesService>().AdicionarAsync(Uid, new NovoGastoRecorrentePedido("Tasca do Tó", 2, Frequencia.Mensal));

        var todas = await Extras.ListarAsync(Uid, null);
        Assert.Equal("lazer", todas.Single(e => e.Id == historica).Categoria);
        var recorrentes = await A.Servico<IGastosRecorrentesService>().ListarAsync(Uid);
        Assert.Equal("lazer", Assert.Single(recorrentes).Categoria);
        Assert.Contains(todas, e => e.GastoRecorrenteId is not null && e.Categoria == "lazer");
    }

    [Fact]
    public async Task Uma_regra_de_outro_utilizador_nao_afeta_as_minhas_despesas()
    {
        await A.Servico<IRegrasCategoriaService>().AdicionarAsync("outro", new NovaRegraCategoriaPedido("continente", "presentes"));

        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Continente", 5, null));

        Assert.Equal("supermercado", Assert.Single(await ExtrasDoMes("2026-10")).Categoria);
    }
}
