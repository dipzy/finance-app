namespace Financas.Services.Regras;

/// <summary>Uma regra de categorização: se a descrição contiver o texto, a categoria é esta.</summary>
public sealed record RegraPadrao(string Texto, string Categoria);

/// <summary>
/// As regras de categorização que vêm com a aplicação (comércios e operadoras de Portugal). Os textos
/// estão sem acentos nem maiúsculas e comparam-se <b>por palavras inteiras</b>: "bp" serve para "BP Lisboa"
/// mas não para "BPI"; "cp" não serve para "cpu". Se várias servirem, ganha a de texto mais comprido
/// ("uber eats" → restauração, antes de "uber" → transportes).
/// <para>
/// As regras do utilizador (<c>RegraCategoria</c>) têm sempre prioridade sobre estas (ver
/// <see cref="Categorias.Sugerir(string?, IEnumerable{Financas.DAL.Entidades.DespesaExtra}, IReadOnlyList{Financas.DAL.Entidades.RegraCategoria}?)"/>).
/// As categorias são as que já existem em <see cref="Categorias"/>.
/// </para>
/// </summary>
public static class RegrasPadrao
{
    public static readonly IReadOnlyList<RegraPadrao> Todas =
    [
        .. Grupo("supermercado",
            "continente", "pingo doce", "pingodoce", "lidl", "aldi", "auchan", "mercadona", "minipreco", "intermarche",
            "recheio", "jumbo", "e leclerc", "leclerc", "spar", "coviran", "meu super", "apolonia", "froiz"),
        .. Grupo("combustivel", "galp", "repsol", "bp", "prio", "cepsa", "moeve", "shell", "oz energia", "alves bandeira"),
        .. Grupo("transportes",
            "via verde", "viaverde", "uber", "bolt", "cabify", "free now", "freenow", "cp", "comboios de portugal",
            "metro", "metropolitano", "carris", "stcp", "fertagus", "transtejo", "soflusa", "navegante", "andante",
            "emel", "empark", "telpark", "flixbus", "rede expressos", "taxi"),
        .. Grupo("restauracao",
            "uber eats", "ubereats", "bolt food", "glovo", "mcdonalds", "mcdonald", "burger king", "kfc", "telepizza",
            "pizza hut", "dominos", "starbucks", "padaria portuguesa", "five guys", "nandos", "subway", "vitaminas"),
        .. Grupo("casa",
            "edp", "endesa", "iberdrola", "goldenergy", "galp energia", "epal", "ikea", "leroy merlin", "aki", "bricomarche",
            "maxmat", "conforama", "jysk"),
        .. Grupo("telecomunicacoes", "meo", "vodafone", "nowo", "digi", "altice", "nos comunicacoes"),
        .. Grupo("saude",
            "farmacia", "parafarmacia", "wells", "cuf", "lusiadas", "hospital da luz", "medis", "multicare", "clinica"),
        .. Grupo("lazer",
            "netflix", "spotify", "disney", "hbo", "prime video", "youtube premium", "apple tv", "twitch", "steam",
            "playstation", "xbox", "nintendo", "ticketline", "uci cinemas", "cinemas nos"),
        .. Grupo("compras",
            "zara", "primark", "worten", "fnac", "el corte ingles", "amazon", "aliexpress", "shein", "temu", "decathlon",
            "sport zone", "sportzone", "mediamarkt", "media markt", "radio popular", "pcdiga", "pc diga", "vinted", "olx",
            "kiabi", "sephora"),
        .. Grupo("educacao", "udemy", "coursera", "bertrand", "wook"),
        .. Grupo("viagens", "ryanair", "easyjet", "tap", "transavia", "booking", "airbnb", "vueling", "iberia", "expedia", "skyscanner"),
        .. Grupo("carro", "norauto", "midas", "euromaster", "feu vert"),
        .. Grupo("presentes", "florista", "interflora"),
    ];

    private static IEnumerable<RegraPadrao> Grupo(string categoria, params string[] textos) =>
        textos.Select(t => new RegraPadrao(t, categoria));

    /// <summary>A regra que serve para esta descrição (a de texto mais comprido), ou null.</summary>
    public static RegraPadrao? Procurar(string? descricao)
    {
        var palavras = PalavrasInteiras(descricao);
        if (palavras.Length == 0)
        {
            return null;
        }

        var enquadrada = $" {palavras} ";
        return Todas
            .Where(r => enquadrada.Contains($" {r.Texto} ", StringComparison.Ordinal))
            .OrderByDescending(r => r.Texto.Length)
            .FirstOrDefault();
    }

    /// <summary>
    /// A descrição sem acentos nem maiúsculas e só com letras e algarismos separados por um espaço
    /// ("McDonald's - Saldanha" → "mcdonald s saldanha").
    /// </summary>
    internal static string PalavrasInteiras(string? descricao)
    {
        var normalizado = Formatos.NormalizarTitulo(descricao);
        if (normalizado.Length == 0)
        {
            return "";
        }

        var texto = new System.Text.StringBuilder(normalizado.Length);
        var espaco = true;
        foreach (var c in normalizado)
        {
            if (char.IsLetterOrDigit(c))
            {
                texto.Append(c);
                espaco = false;
            }
            else if (!espaco)
            {
                texto.Append(' ');
                espaco = true;
            }
        }

        return texto.ToString().TrimEnd();
    }
}
