using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;
using Financas.DAL.Entidades;
using Financas.Services;

namespace Financas.Services.Regras;

/// <summary>De onde veio a categoria sugerida para uma despesa.</summary>
public enum OrigemSugestao
{
    /// <summary>Uma regra do próprio utilizador (ex.: "padaria do bairro" → supermercado).</summary>
    [JsonStringEnumMemberName("regra")]
    Regra,

    /// <summary>A categoria que o utilizador usou da última vez numa despesa com o mesmo nome.</summary>
    [JsonStringEnumMemberName("historico")]
    Historico,

    /// <summary>Uma palavra do nome (ex.: "Continente" → supermercado).</summary>
    [JsonStringEnumMemberName("palavra-chave")]
    PalavraChave,

    /// <summary>Uma das regras que vêm com a aplicação (comércios de Portugal, ver <see cref="RegrasPadrao"/>).</summary>
    [JsonStringEnumMemberName("regra-padrao")]
    RegraPadrao,

    /// <summary>Nada reconhecido: "outros".</summary>
    [JsonStringEnumMemberName("por-defeito")]
    PorDefeito,
}

/// <summary>A categoria sugerida para o nome de uma despesa (o utilizador pode escolher outra).</summary>
/// <param name="Regra">O texto da regra que serviu (só nas origens "regra" e "regra-padrao").</param>
public sealed record SugestaoCategoria(string Categoria, OrigemSugestao Origem, string? Regra = null);

/// <summary>
/// As categorias das despesas: uma lista fixa com chaves estáveis (são as que ficam guardadas
/// na base de dados e as que a app usa para o ícone e a cor). Os nomes são para mostrar (ex.: relatórios).
/// <para>
/// As despesas antigas, sem categoria (<c>null</c>), contam sempre como <see cref="Outros"/>.
/// </para>
/// </summary>
public static class Categorias
{
    public const string Outros = "outros";

    /// <summary>As chaves, pela ordem em que aparecem na app.</summary>
    public static readonly IReadOnlyList<string> Todas =
    [
        "supermercado",
        "restauracao",
        "transportes",
        "carro",
        "combustivel",
        "casa",
        "telecomunicacoes",
        "saude",
        "lazer",
        "compras",
        "educacao",
        "viagens",
        "presentes",
        Outros,
    ];

    private static readonly Dictionary<string, string> Nomes = new()
    {
        ["supermercado"] = "Supermercado",
        ["restauracao"] = "Restauração",
        ["transportes"] = "Transportes",
        ["carro"] = "Carro",
        ["combustivel"] = "Combustível",
        ["casa"] = "Casa",
        ["telecomunicacoes"] = "Telecomunicações",
        ["saude"] = "Saúde",
        ["lazer"] = "Lazer",
        ["compras"] = "Compras",
        ["educacao"] = "Educação",
        ["viagens"] = "Viagens",
        ["presentes"] = "Presentes",
        [Outros] = "Outros",
    };

    public static bool EValida([NotNullWhen(true)] string? categoria) => categoria is not null && Nomes.ContainsKey(categoria);

    /// <summary>A categoria com que uma despesa conta: as que não têm (ou têm uma desconhecida) contam como "outros".</summary>
    public static string DaDespesa(string? categoria) => EValida(categoria) ? categoria : Outros;

    /// <summary>O nome para mostrar ("restauracao" → "Restauração"; na linguagem do pedido, ver <see cref="Textos"/>).</summary>
    public static string Nome(string? categoria) => Textos.T(Nomes[DaDespesa(categoria)]);

    /// <summary>Posição na lista (para ordenar como na app).</summary>
    public static int Ordem(string? categoria) => Posicoes[DaDespesa(categoria)];

    private static readonly Dictionary<string, int> Posicoes = Todas.Select((c, i) => (c, i)).ToDictionary(p => p.c, p => p.i);

    // ---- Sugestão pelo nome ----

    // Palavras-chave (já sem acentos nem maiúsculas, como o NormalizarTitulo as deixa).
    //   "palavra"   a palavra inteira ("cp" não apanha "cpu")
    //   "palavra*"  também o início de uma palavra ("pizz*" apanha "pizza" e "pizzaria")
    //   "duas palavras"  a expressão inteira, que ganha às palavras soltas ("uber eats" antes de "uber")
    private static readonly (string Categoria, string[] Palavras)[] PalavrasChave =
    [
        ("supermercado",
        [
            "continente", "pingo doce", "lidl", "aldi", "mercadona", "minipreco", "auchan", "jumbo", "intermarche",
            "leclerc", "spar", "froiz", "coviran", "meu super", "supermercado*", "hipermercado*", "mercearia*",
            "talho", "peixaria*", "frutaria*", "padaria*",
        ]),
        ("restauracao",
        [
            "uber eats", "bolt food", "burger king", "pizza hut", "padaria portuguesa", "pequeno almoco", "five guys",
            "restaurant*", "cafe", "cafes", "cafetaria*", "pastelaria*", "snack*", "tasca*", "churrasqueira*",
            "marisqueira*", "cervejaria*", "pizz*", "sushi*", "burger*", "hamburg*", "mcdonald*", "kfc", "telepizza",
            "starbucks", "glovo", "jantar*", "almoco*", "lanche*", "brunch", "kebab*", "bar", "bares", "nandos",
        ]),
        ("transportes",
        [
            "via verde", "free now", "rede expressos", "uber", "bolt", "cabify", "freenow", "cp", "comboio*", "metro*",
            "carris", "stcp", "fertagus", "transtejo", "navegante", "andante", "passe", "flixbus", "portage*",
            "estacionamento*", "parquimetro*", "emel", "empark", "telpark", "taxi*", "autocarro*", "trotinete*",
        ]),
        ("carro",
        [
            "carro", "automovel*", "oficina*", "mecanico*", "pneu*", "revisao auto", "seguro auto", "inspecao automovel",
        ]),
        ("combustivel",
        [
            "galp", "bp", "repsol", "prio", "cepsa", "moeve", "shell", "combustive*", "gasolina*", "gasoleo*", "diesel",
            "abastec*",
        ]),
        ("casa",
        [
            "leroy merlin", "galp energia", "ikea", "aki", "bricomarche", "maxmat", "conforama", "jysk", "casa",
            "condominio*", "agua", "epal", "edp", "endesa", "goldenergy", "luz", "eletricidade*", "gas", "botija*",
            "limpeza*", "detergente*", "canalizador*", "eletricista*", "mobilia*", "moveis", "decoracao*",
            "lavandaria*", "renda",
        ]),
        ("telecomunicacoes",
        [
            "telecomunicacoes*", "telemovel*", "internet*", "fibra*", "operadora*", "vodafone", "meo", "nos", "nowo", "digi",
        ]),
        ("saude",
        [
            "seguro de saude", "farmac*", "dentista*", "medic*", "consulta*", "hospital*", "clinica*", "analises",
            "otica*", "oculista*", "fisioterap*", "psicolog*", "cuf", "lusiadas", "wells", "ginasio*",
        ]),
        ("lazer",
        [
            "prime video", "apple music", "nos cinemas", "netflix", "spotify", "disney*", "hbo", "youtube", "cinema*",
            "teatro*", "concerto*", "museu*", "festival*", "jogo*", "steam", "playstation", "psn", "xbox", "nintendo",
            "bowling", "padel", "deezer", "crunchyroll", "twitch",
        ]),
        ("compras",
        [
            "el corte ingles", "pull bear", "h m", "sport zone", "media markt", "radio popular", "flying tiger",
            "massimo dutti", "temu", "amazon", "shein", "zara", "fnac", "worten", "primark", "bershka", "stradivarius",
            "mango", "hm", "aliexpress", "ebay", "vinted", "olx", "decathlon", "mediamarkt", "pcdiga", "apple",
            "roupa*", "sapat*", "action", "lefties", "kiabi", "springfield", "sephora", "douglas",
        ]),
        ("educacao",
        [
            "material escolar", "propina*", "escola*", "colegio*", "universidade*", "faculdade*", "curso*",
            "formacao*", "explicac*", "livro*", "livraria*", "bertrand", "manuais", "udemy", "coursera",
            "papelaria*",
        ]),
        ("viagens",
        [
            "tap air portugal", "hotel*", "hostel*", "airbnb", "booking", "ryanair", "easyjet", "tap", "transavia",
            "vueling", "iberia", "expedia", "voo", "voos", "aviao", "viage*", "ferias", "alojamento*", "aeroporto*",
            "pousada*", "cruzeiro*",
        ]),
        ("presentes",
        [
            "dia da mae", "dia do pai", "presente*", "prenda*", "aniversario*", "natal", "casamento*", "batizado*",
            "oferta*", "flores", "florista*",
        ]),
    ];

    // As expressões (mais de uma palavra), das mais compridas para as mais curtas
    private static readonly (string Categoria, string[] Palavras)[] Expressoes =
    [
        .. PalavrasChave
            .SelectMany(c => c.Palavras.Where(p => p.Contains(' ')).Select(p => (c.Categoria, Palavras: p.Split(' '))))
            .OrderByDescending(e => e.Palavras.Length),
    ];

    private static readonly Dictionary<string, string> PalavrasExatas = CriarExatas();

    private static readonly (string Inicio, string Categoria)[] Inicios =
    [
        .. PalavrasChave.SelectMany(c => c.Palavras.Where(p => p.EndsWith('*')).Select(p => (p.TrimEnd('*'), c.Categoria))),
    ];

    private static Dictionary<string, string> CriarExatas()
    {
        var exatas = new Dictionary<string, string>();
        foreach (var (categoria, palavras) in PalavrasChave)
        {
            foreach (var palavra in palavras.Where(p => !p.Contains(' ') && !p.EndsWith('*')))
            {
                exatas.TryAdd(palavra, categoria);
            }
        }

        return exatas;
    }

    /// <summary>
    /// A categoria para uma despesa com este nome, sem regras do utilizador:
    /// ver <see cref="Sugerir(string?, IEnumerable{DespesaExtra}, IReadOnlyList{RegraCategoria}?)"/>.
    /// </summary>
    public static SugestaoCategoria Sugerir(string? titulo, IEnumerable<DespesaExtra> historicoDoUtilizador) =>
        Sugerir(titulo, historicoDoUtilizador, null);

    /// <summary>
    /// A categoria para uma despesa com este nome, por esta ordem:
    /// <list type="number">
    ///   <item>uma regra ativa do utilizador cujo texto o nome contém (a de maior prioridade; ver <see cref="RegraDoUtilizador"/>);</item>
    ///   <item>a que o utilizador escolheu da última vez numa despesa com o mesmo nome (sem acentos nem
    ///   maiúsculas: "Café" = "cafe"), a registada mais recentemente;</item>
    ///   <item>uma palavra-chave do nome (ex.: "Pingo Doce" → supermercado, "Uber Eats" → restauração);</item>
    ///   <item>uma das regras que vêm com a aplicação (<see cref="RegrasPadrao"/>);</item>
    ///   <item>senão, "outros".</item>
    /// </list>
    /// </summary>
    public static SugestaoCategoria Sugerir(
        string? titulo,
        IEnumerable<DespesaExtra> historicoDoUtilizador,
        IReadOnlyList<RegraCategoria>? regrasDoUtilizador)
    {
        var normalizado = Formatos.NormalizarTitulo(titulo);
        if (normalizado.Length == 0)
        {
            return new SugestaoCategoria(Outros, OrigemSugestao.PorDefeito);
        }

        if (regrasDoUtilizador is { Count: > 0 } && RegraDoUtilizador(normalizado, regrasDoUtilizador) is { } regra)
        {
            return new SugestaoCategoria(regra.Categoria, OrigemSugestao.Regra, regra.Texto);
        }

        var usada = historicoDoUtilizador
            .Where(e => EValida(e.Categoria) && Formatos.NormalizarTitulo(e.Titulo) == normalizado)
            .OrderByDescending(e => e.CriadoEm)
            .ThenByDescending(e => e.Data ?? DateOnly.MinValue)
            .FirstOrDefault();
        if (usada is not null)
        {
            return new SugestaoCategoria(usada.Categoria!, OrigemSugestao.Historico);
        }

        if (PorPalavraChave(normalizado) is { } categoria)
        {
            return new SugestaoCategoria(categoria, OrigemSugestao.PalavraChave);
        }

        return RegrasPadrao.Procurar(normalizado) is { } padrao
            ? new SugestaoCategoria(padrao.Categoria, OrigemSugestao.RegraPadrao, padrao.Texto)
            : new SugestaoCategoria(Outros, OrigemSugestao.PorDefeito);
    }

    /// <summary>
    /// A regra do utilizador que serve para uma descrição (já normalizada ou não): só as ativas, com uma
    /// categoria válida e cujo texto (sem maiúsculas nem acentos) a descrição contém. Se várias servirem,
    /// ganha a de maior prioridade, depois a de texto mais comprido, depois a criada primeiro.
    /// </summary>
    public static RegraCategoria? RegraDoUtilizador(string? descricao, IEnumerable<RegraCategoria> regras)
    {
        var normalizado = Formatos.NormalizarTitulo(descricao);
        if (normalizado.Length == 0)
        {
            return null;
        }

        return regras
            .Where(r => r.Ativa && EValida(r.Categoria))
            .Select(r => (Regra: r, Texto: Formatos.NormalizarTitulo(r.Texto)))
            .Where(r => r.Texto.Length > 0 && normalizado.Contains(r.Texto, StringComparison.Ordinal))
            .OrderByDescending(r => r.Regra.Prioridade)
            .ThenByDescending(r => r.Texto.Length)
            .ThenBy(r => r.Regra.CriadoEm)
            .ThenBy(r => r.Regra.Id, StringComparer.Ordinal)
            .Select(r => r.Regra)
            .FirstOrDefault();
    }

    /// <summary>A categoria pelas palavras-chave do nome, ou null se nenhuma for reconhecida.</summary>
    public static string? PorPalavraChave(string? titulo)
    {
        var palavras = Palavras(Formatos.NormalizarTitulo(titulo));
        if (palavras.Length == 0)
        {
            return null;
        }

        foreach (var (categoria, expressao) in Expressoes)
        {
            for (var i = 0; i + expressao.Length <= palavras.Length; i++)
            {
                if (palavras.AsSpan(i, expressao.Length).SequenceEqual(expressao))
                {
                    return categoria;
                }
            }
        }

        // Palavras soltas: a primeira do nome que for reconhecida ("Jantar de Natal" → restauração)
        foreach (var palavra in palavras)
        {
            if (PalavrasExatas.TryGetValue(palavra, out var exata))
            {
                return exata;
            }

            foreach (var (inicio, categoria) in Inicios)
            {
                if (palavra.StartsWith(inicio, StringComparison.Ordinal))
                {
                    return categoria;
                }
            }
        }

        return null;
    }

    // "mcdonald's - saldanha" → ["mcdonald", "s", "saldanha"] (tudo o que não é letra ou algarismo separa)
    private static string[] Palavras(string normalizado)
    {
        var palavras = new List<string>();
        var inicio = -1;
        for (var i = 0; i <= normalizado.Length; i++)
        {
            var letra = i < normalizado.Length && char.IsLetterOrDigit(normalizado[i]);
            if (letra && inicio < 0)
            {
                inicio = i;
            }
            else if (!letra && inicio >= 0)
            {
                palavras.Add(normalizado[inicio..i]);
                inicio = -1;
            }
        }

        return [.. palavras];
    }
}
