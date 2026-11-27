using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Financas.Services.Regras;

/// <summary>Leitura de valores e datas escritos à mão (porte de utils/formatos.ts).</summary>
public static partial class Formatos
{
    [GeneratedRegex(@"^-?\d{1,3}(\.\d{3})+$")]
    private static partial Regex Milhares();

    // O que o parseFloat do JavaScript aceita no início do texto
    [GeneratedRegex(@"^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?")]
    private static partial Regex InicioNumero();

    [GeneratedRegex(@"^(\d{4})-(\d{2})-(\d{2})$")]
    private static partial Regex DataIso();

    [GeneratedRegex(@"^(\d{2})/(\d{2})/(\d{4})$")]
    private static partial Regex DataPt();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Espacos();

    /// <summary>
    /// Converte texto em número aceitando o formato português ("1.500,50", "12,5", "10 €").
    /// Com vírgula, os pontos são separadores de milhares; sem vírgula, "1.500" também é mil e
    /// quinhentos (grupos de 3 dígitos), mas "1.5" e "12.50" continuam a ser decimais.
    /// Texto vazio ou inválido vale 0.
    /// </summary>
    public static decimal ParseValor(string? texto)
    {
        if (string.IsNullOrEmpty(texto))
        {
            return 0m;
        }

        var limpo = new string(texto.Where(c => !char.IsWhiteSpace(c) && c != '€').ToArray());
        var temVirgula = limpo.Contains(',');
        var normalizado = temVirgula || Milhares().IsMatch(limpo)
            ? SubstituirPrimeira(limpo.Replace(".", ""), ',', '.')
            : limpo;

        var numero = InicioNumero().Match(normalizado);
        return numero.Success
            && decimal.TryParse(numero.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var valor)
            ? valor
            : 0m;
    }

    /// <summary>"2026-10-02" (formato atual) ou "02/10/2026" (versões antigas), sem validar o dia.</summary>
    public static (int Ano, int Mes, int Dia)? LerPartesData(string? data)
    {
        if (data is null)
        {
            return null;
        }

        var iso = DataIso().Match(data);
        if (iso.Success)
        {
            return (int.Parse(iso.Groups[1].Value), int.Parse(iso.Groups[2].Value), int.Parse(iso.Groups[3].Value));
        }

        var pt = DataPt().Match(data);
        if (pt.Success)
        {
            return (int.Parse(pt.Groups[3].Value), int.Parse(pt.Groups[2].Value), int.Parse(pt.Groups[1].Value));
        }

        return null;
    }

    /// <summary>Uma data guardada como texto (ISO ou dd/mm/aaaa), se existir mesmo (31/02 não existe).</summary>
    public static DateOnly? LerData(string? data)
    {
        if (LerPartesData(data) is not { } p || p.Mes is < 1 or > 12 || p.Ano is < 1 or > 9999)
        {
            return null;
        }

        return p.Dia >= 1 && p.Dia <= DateTime.DaysInMonth(p.Ano, p.Mes) ? new DateOnly(p.Ano, p.Mes, p.Dia) : null;
    }

    /// <summary>Títulos comparados sem maiúsculas, acentos nem espaços a mais ("Ginásio" = "ginasio ").</summary>
    public static string NormalizarTitulo(string? titulo)
    {
        if (string.IsNullOrEmpty(titulo))
        {
            return "";
        }

        // NFD separa as letras dos acentos (á = a + ´); depois tiram-se os acentos (U+0300 a U+036F)
        var semAcentos = new StringBuilder(titulo.Length);
        foreach (var c in titulo.Normalize(NormalizationForm.FormD))
        {
            if (c is < '̀' or > 'ͯ')
            {
                semAcentos.Append(c);
            }
        }

        return Espacos().Replace(semAcentos.ToString(), " ").Trim().ToLowerInvariant();
    }

    private static string SubstituirPrimeira(string texto, char de, char para)
    {
        var i = texto.IndexOf(de);
        return i < 0 ? texto : string.Concat(texto.AsSpan(0, i), para.ToString(), texto.AsSpan(i + 1));
    }
}
