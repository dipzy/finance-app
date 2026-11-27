using System.Diagnostics.CodeAnalysis;
using System.Text.RegularExpressions;

namespace Financas.Services.Regras;

/// <summary>
/// Meses no formato "AAAA-MM" (ex.: "2026-10"), o mesmo da app.
/// <para>
/// São texto de propósito: com este formato a ordem alfabética é a ordem cronológica
/// ("2026-09" &lt; "2026-10"), tanto em C# (comparação ordinal) como na base de dados.
/// </para>
/// </summary>
public static partial class Meses
{
    /// <summary>Expressão regular de um mês válido (usada também na validação dos pedidos).</summary>
    public const string Padrao = @"^\d{4}-(0[1-9]|1[0-2])$";

    [GeneratedRegex(Padrao)]
    private static partial Regex Formato();

    public static bool EValido([NotNullWhen(true)] string? mes) => mes is not null && Formato().IsMatch(mes);

    public static string De(DateOnly data) => $"{data.Year:D4}-{data.Month:D2}";

    public static DateOnly PrimeiroDia(string mes) => new(int.Parse(mes[..4]), int.Parse(mes[5..7]), 1);

    /// <summary>O número do mês (1-12).</summary>
    public static int NumeroDoMes(string mes) => int.Parse(mes.AsSpan(5, 2));

    public static string Somar(string mes, int meses) => De(PrimeiroDia(mes).AddMonths(meses));

    /// <summary>Quantos meses vão de <paramref name="de"/> até <paramref name="ate"/> ("2026-10" → "2027-01" = 3; para trás é negativo).</summary>
    public static int Diferenca(string de, string ate) =>
        ((int.Parse(ate[..4]) - int.Parse(de[..4])) * 12) + NumeroDoMes(ate) - NumeroDoMes(de);

    /// <summary>Os últimos <paramref name="quantos"/> meses até <paramref name="ate"/> (inclusive), do mais antigo para o mais recente.</summary>
    public static IReadOnlyList<string> Ultimos(string ate, int quantos) =>
        [.. Enumerable.Range(0, Math.Max(0, quantos)).Select(i => Somar(ate, i - quantos + 1))];

    public static string Seguinte(string mes) => Somar(mes, 1);

    public static string Anterior(string mes) => Somar(mes, -1);

    /// <summary>a &lt; b (cronologicamente).</summary>
    public static bool Antes(string a, string b) => string.CompareOrdinal(a, b) < 0;

    /// <summary>a &lt;= b (cronologicamente).</summary>
    public static bool AntesOuIgual(string a, string b) => string.CompareOrdinal(a, b) <= 0;

    /// <summary>Mês de uma data guardada ("2026-10-02" ou, das versões antigas, "02/10/2026").</summary>
    public static string? DaData(string? data) =>
        Formatos.LerPartesData(data) is { } partes ? $"{partes.Ano:D4}-{partes.Mes:D2}" : null;

    public static string? DaData(DateOnly? data) => data is { } d ? De(d) : null;
}
