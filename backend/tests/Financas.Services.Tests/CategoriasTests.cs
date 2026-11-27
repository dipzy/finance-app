using Financas.DAL.Entidades;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// Sugestão da categoria de uma despesa pelo título (Regras/Categorias.cs). Funções puras.
public class CategoriasTests
{
    private static readonly DateTimeOffset Inicio = new(2026, 9, 1, 10, 0, 0, TimeSpan.Zero);

    private static DespesaExtra Extra(string titulo, string? categoria, int minutos = 0) => new()
    {
        UtilizadorId = "u",
        Id = Guid.NewGuid().ToString("N"),
        Titulo = titulo,
        Valor = 10,
        Data = new DateOnly(2026, 9, 1),
        Mes = "2026-09",
        Categoria = categoria,
        CriadoEm = Inicio.AddMinutes(minutos),
    };

    [Theory]
    [InlineData("Continente", "supermercado")]
    [InlineData("Pingo Doce Saldanha", "supermercado")]
    [InlineData("LIDL", "supermercado")]
    [InlineData("Minipreço", "supermercado")]
    [InlineData("Galp", "combustivel")]
    [InlineData("BP autoestrada", "combustivel")]
    [InlineData("Gasolina", "combustivel")]
    [InlineData("Uber", "transportes")]
    [InlineData("Bolt", "transportes")]
    [InlineData("CP Lisboa-Porto", "transportes")]
    [InlineData("Via Verde", "transportes")]
    [InlineData("Farmácia", "saude")]
    [InlineData("Dentista", "saude")]
    [InlineData("Médico de família", "saude")]
    [InlineData("Restaurante O Zé", "restauracao")]
    [InlineData("Café", "restauracao")]
    [InlineData("McDonald's", "restauracao")]
    [InlineData("Pizzaria Lusa", "restauracao")]
    [InlineData("Uber Eats", "restauracao")]
    [InlineData("Glovo", "restauracao")]
    [InlineData("Netflix", "lazer")]
    [InlineData("Spotify", "lazer")]
    [InlineData("Cinema NOS", "lazer")]
    [InlineData("Temu", "compras")]
    [InlineData("Amazon", "compras")]
    [InlineData("H&M", "compras")]
    [InlineData("IKEA", "casa")]
    [InlineData("Galp Energia", "casa")]
    [InlineData("Oficina do carro", "carro")]
    [InlineData("Seguro automóvel", "carro")]
    [InlineData("Vodafone fibra", "telecomunicacoes")]
    [InlineData("Telecomunicações", "telecomunicacoes")]
    [InlineData("Propinas", "educacao")]
    [InlineData("Ryanair", "viagens")]
    [InlineData("Hotel no Porto", "viagens")]
    [InlineData("Prenda da mãe", "presentes")]
    public void Palavras_chave_reconhecem_a_categoria(string titulo, string esperada)
    {
        var sugestao = Categorias.Sugerir(titulo, []);
        Assert.Equal(esperada, sugestao.Categoria);
        Assert.Equal(OrigemSugestao.PalavraChave, sugestao.Origem);
    }

    [Fact]
    public void Expressoes_ganham_as_palavras_soltas()
    {
        Assert.Equal("restauracao", Categorias.PorPalavraChave("Uber Eats - jantar"));
        Assert.Equal("transportes", Categorias.PorPalavraChave("Uber para o aeroporto"));
        Assert.Equal("restauracao", Categorias.PorPalavraChave("Bolt Food"));
        Assert.Equal("restauracao", Categorias.PorPalavraChave("Padaria Portuguesa"));
        Assert.Equal("supermercado", Categorias.PorPalavraChave("Padaria do bairro"));
    }

    [Fact]
    public void Palavras_curtas_so_contam_inteiras()
    {
        // "cp" (comboios) não pode apanhar "compras", nem "bp" apanhar "bpi"
        Assert.Null(Categorias.PorPalavraChave("Compras"));
        Assert.Null(Categorias.PorPalavraChave("Transferência BPI"));
        Assert.Null(Categorias.PorPalavraChave("CPU nova"));
        // ... e as que têm * apanham o início de palavras maiores
        Assert.Equal("saude", Categorias.PorPalavraChave("Farmacias Holon"));
    }

    [Fact]
    public void A_primeira_palavra_reconhecida_do_titulo_decide()
    {
        Assert.Equal("restauracao", Categorias.PorPalavraChave("Jantar de Natal"));
        Assert.Equal("presentes", Categorias.PorPalavraChave("Natal: jantar"));
    }

    [Fact]
    public void Sem_nada_reconhecido_e_outros()
    {
        Assert.Equal(new SugestaoCategoria("outros", OrigemSugestao.PorDefeito), Categorias.Sugerir("Coisa estranha", []));
        Assert.Equal(new SugestaoCategoria("outros", OrigemSugestao.PorDefeito), Categorias.Sugerir("   ", []));
        Assert.Equal(new SugestaoCategoria("outros", OrigemSugestao.PorDefeito), Categorias.Sugerir(null, []));
    }

    [Fact]
    public void O_historico_do_utilizador_ganha_as_palavras_chave_e_conta_a_mais_recente()
    {
        var historico = new[]
        {
            Extra("Continente", "casa", minutos: 1),
            Extra("continente ", "compras", minutos: 5), // a mais recente (mesmo título sem maiúsculas nem espaços)
            Extra("Continente", "supermercado", minutos: 3),
            Extra("Outra coisa", "lazer", minutos: 9),
        };

        var sugestao = Categorias.Sugerir("CONTINENTE", historico);
        Assert.Equal(new SugestaoCategoria("compras", OrigemSugestao.Historico), sugestao);
    }

    [Fact]
    public void O_historico_compara_sem_acentos_e_ignora_as_despesas_sem_categoria()
    {
        var historico = new[]
        {
            Extra("Ginásio", "lazer"),
            Extra("Pastelaria", null, minutos: 10), // antiga, sem categoria: não conta
        };

        Assert.Equal(new SugestaoCategoria("lazer", OrigemSugestao.Historico), Categorias.Sugerir("ginasio", historico));
        Assert.Equal(new SugestaoCategoria("restauracao", OrigemSugestao.PalavraChave), Categorias.Sugerir("Pastelaria", historico));
    }

    [Fact]
    public void Lista_nomes_e_as_despesas_sem_categoria_contam_como_outros()
    {
        Assert.Equal(14, Categorias.Todas.Count);
        Assert.Equal("outros", Categorias.Todas[^1]);
        Assert.All(Categorias.Todas, c => Assert.True(Categorias.EValida(c)));
        Assert.False(Categorias.EValida("Restauracao"));
        Assert.Equal("outros", Categorias.DaDespesa(null));
        Assert.Equal("outros", Categorias.DaDespesa("nao-existe"));
        Assert.Equal("Restauração", Categorias.Nome("restauracao"));
        Assert.Equal("Carro", Categorias.Nome("carro"));
        Assert.Equal("Telecomunicações", Categorias.Nome("telecomunicacoes"));
        Assert.Equal("Outros", Categorias.Nome(null));
        Assert.Equal(0, Categorias.Ordem("supermercado"));
        Assert.Equal(13, Categorias.Ordem(null));
    }
}
