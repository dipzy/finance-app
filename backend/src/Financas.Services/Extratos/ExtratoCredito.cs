using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Financas.Services.Dtos;
using UglyToad.PdfPig;

namespace Financas.Services.Extratos;

/// <summary>
/// Lê o texto de um PDF, linha a linha. Os extratos dos bancos põem cada valor ao lado da sua etiqueta, mas
/// no fluxo de texto do PDF podem vir noutra ordem: por isso as palavras agrupam-se pela posição na página
/// (as que estão à mesma altura formam uma linha) e não pela ordem em que o PDF as guarda.
/// </summary>
internal static class LeitorPdf
{
    private const int MaximoPaginas = 6;

    // Duas palavras com menos de 3 pontos de diferença na vertical estão na mesma linha
    private const double TolerânciaLinha = 3.0;

    public static IReadOnlyList<string> Linhas(byte[] pdf)
    {
        try
        {
            using var documento = PdfDocument.Open(pdf);
            var linhas = new List<string>();
            foreach (var pagina in documento.GetPages().Take(MaximoPaginas))
            {
                var palavras = pagina.GetWords().OrderByDescending(p => p.BoundingBox.Bottom).ToList();
                var linha = new List<(double X, string Texto)>();
                var alturaDaLinha = double.NaN;
                foreach (var palavra in palavras)
                {
                    if (!double.IsNaN(alturaDaLinha) && Math.Abs(palavra.BoundingBox.Bottom - alturaDaLinha) > TolerânciaLinha)
                    {
                        linhas.Add(Juntar(linha));
                        linha.Clear();
                    }

                    if (linha.Count == 0)
                    {
                        alturaDaLinha = palavra.BoundingBox.Bottom;
                    }

                    linha.Add((palavra.BoundingBox.Left, palavra.Text));
                }

                if (linha.Count > 0)
                {
                    linhas.Add(Juntar(linha));
                }
            }

            return linhas;
        }
        catch (Exception erro) when (erro is not PedidoInvalidoException)
        {
            // Não se guarda nem regista o conteúdo: o PDF tem dados pessoais
            throw new PedidoInvalidoException("Não consegui abrir o PDF. Confirma que é o extrato do crédito e que não tem palavra-passe.");
        }
    }

    private static string Juntar(List<(double X, string Texto)> palavras) =>
        string.Join(' ', palavras.OrderBy(p => p.X).Select(p => p.Texto));
}

/// <summary>
/// Interpreta o texto de um extrato de crédito ao consumo. Conhece dois formatos: o "Extrato V20170206" do
/// Montepio Crédito (etiqueta e valor na mesma linha: TAN, CAPITAL INICIAL, CAPITAL AMORTIZADO, PRÓXIMA PRESTAÇÃO...)
/// e o extrato de crédito da Cofidis (tabelas com a etiqueta por cima do valor, datas aaaa-mm-dd e "Nº DOSSIER" em
/// vez de número de contrato). Só devolve o contrato e a próxima prestação: o nome, a morada, o NIF e o IBAN que
/// vêm no PDF não são lidos nem guardados.
/// </summary>
internal static partial class InterpretadorExtratoCredito
{
    private const string Dinheiro = @"(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})";
    private const string Data = @"(\d{2}[-/.]\d{2}[-/.]\d{4})";
    private const string DataIso = @"(\d{4}-\d{2}-\d{2})";

    // As linhas à volta de uma etiqueta onde a Cofidis pode pôr o valor (por baixo, com texto solto no meio)
    private const int LinhasAbaixo = 5;

    private static readonly CultureInfo Pt = CultureInfo.GetCultureInfo("pt-PT");

    // ---- Montepio ----

    [GeneratedRegex($@"^CONTRATO N[O°]?\s+(.+?)\s+DATA CONTRATO\s+{Data}")]
    private static partial Regex ContratoEData();

    [GeneratedRegex(@"\bTAN\s+(\d+(?:[.,]\d+)?)\s*%")]
    private static partial Regex Taxa();

    [GeneratedRegex($@"CAPITAL INICIAL\s+{Dinheiro}")]
    private static partial Regex CapitalInicial();

    [GeneratedRegex($@"CAPITAL AMORTIZADO\s+{Dinheiro}")]
    private static partial Regex CapitalAmortizado();

    [GeneratedRegex($@"CAPITAL VENCIDO\s+{Dinheiro}")]
    private static partial Regex CapitalVencido();

    [GeneratedRegex($@"CAPITAL VINCENDO\s+{Dinheiro}")]
    private static partial Regex CapitalVincendo();

    [GeneratedRegex(@"PROXIMA PRESTACAO DO CONTRATO\s+(\d+)\s+DE\s+(\d+)")]
    private static partial Regex NumeroDaPrestacao();

    [GeneratedRegex($@"DATA DE VENCIMENTO\s+{Data}")]
    private static partial Regex Vencimento();

    [GeneratedRegex($@"MONTANTE TOTAL DA PRESTACAO\s+{Dinheiro}")]
    private static partial Regex TotalDaPrestacao();

    [GeneratedRegex($@"^CAPITAL\s+{Dinheiro}")]
    private static partial Regex CapitalDaPrestacao();

    [GeneratedRegex($@"^JUROS\s+{Dinheiro}")]
    private static partial Regex JurosDaPrestacao();

    [GeneratedRegex($@"IMPOSTO DO SELO\s+{Dinheiro}")]
    private static partial Regex SeloDepois();

    [GeneratedRegex($@"{Dinheiro}\s*(?:EUR|€)?\s*IMPOSTO DO SELO")]
    private static partial Regex SeloAntes();

    [GeneratedRegex($@"^SEGURO\s+(.+?)\s+{Dinheiro}")]
    private static partial Regex Seguro();

    [GeneratedRegex($@"DATA EMISSAO DO EXTRATO\s+{Data}")]
    private static partial Regex Emissao();

    // ---- Cofidis ----

    [GeneratedRegex(@"\bDOSSIER\b")]
    private static partial Regex EtiquetaDossier();

    [GeneratedRegex(@"\b(\d{8,})\b")]
    private static partial Regex NumeroDoDossier();

    [GeneratedRegex(@"^INFORMACAO SOBRE PAGAMENTO\b.*?(\d{8,})$")]
    private static partial Regex DossierNoPagamento();

    [GeneratedRegex(@"^DATA DE EMISSAO DO EXTRATO\b")]
    private static partial Regex EtiquetaEmissaoCofidis();

    [GeneratedRegex(@"^PROXIMA PRESTACAO DO CONTRATO\b")]
    private static partial Regex EtiquetaProximaCofidis();

    [GeneratedRegex(@"^(\d+) DE (\d+)\b")]
    private static partial Regex NumeroDaPrestacaoCofidis();

    [GeneratedRegex(@"^DATA DE VENCIMENTO DA PROXIMA PRESTACAO\b")]
    private static partial Regex EtiquetaVencimentoCofidis();

    [GeneratedRegex(DataIso)]
    private static partial Regex DataEmIso();

    // "Data do contrato / Capital inicial / Prazo" são colunas da mesma linha: 2026-03-16 7700,53 60 meses
    [GeneratedRegex($@"{DataIso}\s+{Dinheiro}\s+(\d+)\s*MESES")]
    private static partial Regex CondicoesIniciaisCofidis();

    [GeneratedRegex(@"^CONDICOES DO CONTRATO A DATA DE EMISSAO\b")]
    private static partial Regex EtiquetaCondicoesAtuaisCofidis();

    [GeneratedRegex(@"(\d+(?:[.,]\d+)?)\s*%")]
    private static partial Regex Percentagem();

    // Capital amortizado, vencido, vincendo e em dívida: quatro valores seguidos
    [GeneratedRegex($@"^{Dinheiro}\s+{Dinheiro}\s+{Dinheiro}\s+{Dinheiro}\b")]
    private static partial Regex DetalheDoCapitalCofidis();

    [GeneratedRegex(@"^CAPITAL EM DIVIDA A DATA DE EMISSAO DO EXTRATO\b")]
    private static partial Regex EtiquetaCapitalEmDividaCofidis();

    [GeneratedRegex($@"^{Dinheiro}")]
    private static partial Regex DinheiroNoInicio();

    [GeneratedRegex($@"MONTANTE TOTAL DA PROXIMA PRESTACAO\s*:\s*{Dinheiro}")]
    private static partial Regex TotalDaPrestacaoCofidis();

    [GeneratedRegex($@"(?:^|\s)JUROS\s+{Dinheiro}")]
    private static partial Regex JurosDaPrestacaoCofidis();

    [GeneratedRegex($@"\bIS JUROS REMUNERATORIOS\s+{Dinheiro}")]
    private static partial Regex SeloDaPrestacaoCofidis();

    [GeneratedRegex($@"\bPREMIO SEGURO\s+{Dinheiro}")]
    private static partial Regex SeguroCofidis();

    // O que os dois formatos têm em comum depois de lidos
    private sealed record Lido(
        string Credor,
        string NumeroContrato,
        string? Categoria,
        DateOnly? DataContrato,
        DateOnly? Emitido,
        decimal Taxa,
        decimal Inicial,
        decimal Amortizado,
        decimal Vencido,
        decimal Vincendo,
        int Numero,
        int Prazo,
        DateOnly Vencimento,
        decimal Total,
        decimal Capital,
        decimal Juros,
        decimal Selo,
        decimal Seguros);

    public static ExtratoCreditoDto Interpretar(IReadOnlyList<string> linhasOriginais)
    {
        var linhas = linhasOriginais.Select(Normalizar).ToList();

        var lido = LerMontepio(linhas, linhasOriginais)
            ?? LerCofidis(linhas, linhasOriginais)
            // Sem estas peças isto não é (ou não é um) extrato de crédito que se saiba ler
            ?? throw new PedidoInvalidoException(
                "Não reconheci este extrato. Só leio extratos de crédito com TAN, capital e próxima prestação (testado com o Montepio Crédito e a Cofidis).");

        return Validar(lido);
    }

    private static Lido? LerMontepio(IReadOnlyList<string> linhas, IReadOnlyList<string> linhasOriginais)
    {
        var taxa = Primeiro(linhas, Taxa()) is { } t
            ? decimal.Parse(t.Groups[1].Value.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture)
            : (decimal?)null;
        var inicial = Dinheiros(linhas, CapitalInicial());
        var proxima = Primeiro(linhas, NumeroDaPrestacao());
        var vencimento = Primeiro(linhas, Vencimento()) is { } v ? DataDe(v.Groups[1].Value) : null;
        var total = Dinheiros(linhas, TotalDaPrestacao());

        if (taxa is null || inicial is null || proxima is null || vencimento is null || total is null)
        {
            return null;
        }

        var contrato = Primeiro(linhas, ContratoEData());
        var numeroContrato = contrato?.Groups[1].Value.Trim()
            ?? throw new PedidoInvalidoException("Não encontrei o número do contrato no extrato.");
        var dataContrato = contrato.Groups[2].Success ? DataDe(contrato.Groups[2].Value) : null;

        var amortizado = Dinheiros(linhas, CapitalAmortizado()) ?? 0m;
        var vencido = Dinheiros(linhas, CapitalVencido()) ?? 0m;
        var vincendo = Dinheiros(linhas, CapitalVincendo()) ?? Math.Max(0m, inicial.Value - amortizado - vencido);

        var selo = Dinheiros(linhas, SeloDepois()) ?? Dinheiros(linhas, SeloAntes()) ?? 0m;
        var seguros = linhas.Select(l => Seguro().Match(l)).Where(m => m.Success).Sum(m => Numero(m.Groups[2].Value));

        var emitido = Primeiro(linhas, Emissao()) is { } e ? DataDe(e.Groups[1].Value) : null;

        var categoria = linhasOriginais
            .Select(l => (Linha: l, Posicao: l.IndexOf("CATEGORIA DO CONTRATO", StringComparison.OrdinalIgnoreCase)))
            .Where(l => l.Posicao >= 0)
            .Select(l => l.Linha[(l.Posicao + "CATEGORIA DO CONTRATO".Length)..].Trim())
            .FirstOrDefault(c => c.Length > 0);

        return new Lido(
            linhas.Any(l => l.Contains("MONTEPIO", StringComparison.Ordinal)) ? "Montepio Crédito" : "Crédito",
            numeroContrato,
            categoria,
            dataContrato,
            emitido,
            taxa.Value,
            inicial.Value,
            amortizado,
            vencido,
            vincendo,
            int.Parse(proxima.Groups[1].Value, CultureInfo.InvariantCulture),
            int.Parse(proxima.Groups[2].Value, CultureInfo.InvariantCulture),
            vencimento.Value,
            total.Value,
            Dinheiros(linhas, CapitalDaPrestacao()) ?? 0m,
            Dinheiros(linhas, JurosDaPrestacao()) ?? 0m,
            selo,
            seguros);
    }

    // Os extratos da Cofidis não têm número de contrato: identificam-no pelo "Nº DOSSIER", que fica igual em todos os extratos
    private static Lido? LerCofidis(IReadOnlyList<string> linhas, IReadOnlyList<string> linhasOriginais)
    {
        var dossier = (Abaixo(linhas, EtiquetaDossier(), NumeroDoDossier()) ?? Primeiro(linhas, DossierNoPagamento()))?.Groups[1].Value;
        var iniciais = Primeiro(linhas, CondicoesIniciaisCofidis());
        var proxima = Abaixo(linhas, EtiquetaProximaCofidis(), NumeroDaPrestacaoCofidis());
        var vencimento = Abaixo(linhas, EtiquetaVencimentoCofidis(), DataEmIso()) is { } v ? DataDeIso(v.Groups[1].Value) : null;
        var total = Dinheiros(linhas, TotalDaPrestacaoCofidis());

        // A taxa em vigor é a das condições "à data de emissão"; se faltar, serve a das condições iniciais
        var percentagem = Abaixo(linhas, EtiquetaCondicoesAtuaisCofidis(), Percentagem()) ?? Primeiro(linhas, Percentagem());

        if (dossier is null || iniciais is null || proxima is null || vencimento is null || total is null || percentagem is null)
        {
            return null;
        }

        var taxa = decimal.Parse(percentagem.Groups[1].Value.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture);
        var inicial = Numero(iniciais.Groups[2].Value);

        decimal amortizado, vencido, vincendo;
        if (Primeiro(linhas, DetalheDoCapitalCofidis()) is { } capital)
        {
            amortizado = Numero(capital.Groups[1].Value);
            vencido = Numero(capital.Groups[2].Value);
            vincendo = Numero(capital.Groups[3].Value);
        }
        else if (Abaixo(linhas, EtiquetaCapitalEmDividaCofidis(), DinheiroNoInicio()) is { } emDivida)
        {
            // Só o capital em dívida: o que já foi pago é a diferença para o capital inicial
            vencido = 0m;
            vincendo = Numero(emDivida.Groups[1].Value);
            amortizado = Math.Max(0m, inicial - vincendo);
        }
        else
        {
            return null;
        }

        var emitido = Abaixo(linhas, EtiquetaEmissaoCofidis(), DataEmIso()) is { } e ? DataDeIso(e.Groups[1].Value) : null;

        // O produto ("Crédito Automóvel Cofidis") é a única linha do extrato que começa por "Crédito"
        var categoria = linhasOriginais.FirstOrDefault(l => Normalizar(l).StartsWith("CREDITO ", StringComparison.Ordinal))?.Trim();

        return new Lido(
            "Cofidis",
            dossier,
            categoria,
            DataDeIso(iniciais.Groups[1].Value),
            emitido,
            taxa,
            inicial,
            amortizado,
            vencido,
            vincendo,
            int.Parse(proxima.Groups[1].Value, CultureInfo.InvariantCulture),
            int.Parse(proxima.Groups[2].Value, CultureInfo.InvariantCulture),
            vencimento.Value,
            total.Value,
            Dinheiros(linhas, CapitalDaPrestacao()) ?? 0m,
            Dinheiros(linhas, JurosDaPrestacaoCofidis()) ?? 0m,
            Dinheiros(linhas, SeloDaPrestacaoCofidis()) ?? 0m,
            linhas.Select(l => SeguroCofidis().Match(l)).Where(m => m.Success).Sum(m => Numero(m.Groups[1].Value)));
    }

    private static ExtratoCreditoDto Validar(Lido lido)
    {
        var avisos = new List<string>();

        if (lido.Numero < 1 || lido.Prazo < lido.Numero)
        {
            throw new PedidoInvalidoException("O número da prestação no extrato não faz sentido.");
        }

        var soma = lido.Capital + lido.Juros + lido.Selo + lido.Seguros;
        if (Math.Abs(soma - lido.Total) > 0.05m)
        {
            avisos.Add("A prestação do extrato não bate certo com a soma das partes (capital, juros, selo e seguros): confirma os valores.");
        }

        if (Math.Abs(lido.Inicial - lido.Amortizado - (lido.Vencido + lido.Vincendo)) > 0.05m)
        {
            avisos.Add("O capital em dívida do extrato não bate certo com o capital inicial menos o amortizado: confirma os valores.");
        }

        if (lido.Vencido > 0)
        {
            avisos.Add($"O extrato tem capital em atraso: {lido.Vencido.ToString("N2", Pt)} €.");
        }

        if (lido.Emitido is null)
        {
            avisos.Add("Não encontrei a data de emissão do extrato: usei a data de hoje.");
        }

        return new ExtratoCreditoDto(
            lido.Credor,
            lido.NumeroContrato,
            lido.Categoria,
            lido.DataContrato,
            lido.Emitido ?? DateOnly.FromDateTime(DateTime.UtcNow),
            lido.Taxa,
            lido.Inicial,
            lido.Amortizado,
            lido.Vencido,
            lido.Vincendo,
            lido.Numero,
            lido.Prazo,
            lido.Vencimento,
            lido.Total,
            lido.Capital,
            lido.Juros,
            lido.Selo,
            lido.Seguros,
            avisos);
    }

    // Maiúsculas, sem acentos e com "nº" → "NO": as etiquetas comparam-se sempre assim
    private static string Normalizar(string texto)
    {
        var sb = new StringBuilder(texto.Length);
        foreach (var c in texto.Normalize(NormalizationForm.FormKD))
        {
            if (char.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            {
                sb.Append(char.ToUpperInvariant(c));
            }
        }

        return Regex.Replace(sb.ToString(), @"\s+", " ").Trim();
    }

    private static Match? Primeiro(IReadOnlyList<string> linhas, Regex regex) =>
        linhas.Select(l => regex.Match(l)).FirstOrDefault(m => m.Success);

    // Procura o valor na linha da etiqueta e nas que vêm a seguir: os extratos em tabela põem-no por baixo
    private static Match? Abaixo(IReadOnlyList<string> linhas, Regex etiqueta, Regex valor)
    {
        for (var i = 0; i < linhas.Count; i++)
        {
            if (!etiqueta.IsMatch(linhas[i]))
            {
                continue;
            }

            for (var j = i; j < Math.Min(linhas.Count, i + 1 + LinhasAbaixo); j++)
            {
                var m = valor.Match(linhas[j]);
                if (m.Success)
                {
                    return m;
                }
            }
        }

        return null;
    }

    // O primeiro valor em euros ("7.766,69") que segue a etiqueta
    private static decimal? Dinheiros(IReadOnlyList<string> linhas, Regex regex) =>
        Primeiro(linhas, regex) is { } m ? Numero(m.Groups[1].Value) : null;

    private static decimal Numero(string texto) =>
        decimal.Parse(texto.Replace(".", "", StringComparison.Ordinal).Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture);

    private static DateOnly? DataDe(string texto)
    {
        var partes = texto.Split('-', '/', '.');
        return partes.Length == 3
            && int.TryParse(partes[0], out var dia)
            && int.TryParse(partes[1], out var mes)
            && int.TryParse(partes[2], out var ano)
            && mes is >= 1 and <= 12
            && dia >= 1 && dia <= DateTime.DaysInMonth(Math.Clamp(ano, 1, 9999), mes)
            ? new DateOnly(ano, mes, dia)
            : null;
    }

    // As datas da Cofidis vêm como 2026-10-10
    private static DateOnly? DataDeIso(string texto) =>
        DateOnly.TryParseExact(texto, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var data) ? data : null;
}
