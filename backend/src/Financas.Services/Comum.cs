using System.Globalization;
using Financas.DAL.Entidades;

namespace Financas.Services;

/// <summary>Ids dos registos novos (os vindos do Firestore mantêm o id original).</summary>
internal static class Ids
{
    public static string Novo() => Guid.NewGuid().ToString("N");
}

/// <summary>Ordenações usadas nas listas (as mesmas da app).</summary>
internal static class Ordenacao
{
    // Como o localeCompare do JavaScript: por ordem alfabética portuguesa
    private static readonly StringComparer Nomes = CriarComparador();

    public static List<Poupanca> Poupancas(IEnumerable<Poupanca> poupancas) =>
        [.. poupancas.OrderBy(p => p.Ordem ?? 0).ThenBy(p => p.Nome, Nomes)];

    public static List<Divida> Dividas(IEnumerable<Divida> dividas) =>
        [.. dividas.OrderBy(d => d.Titulo, Nomes)];

    private static StringComparer CriarComparador()
    {
        try
        {
            return StringComparer.Create(CultureInfo.GetCultureInfo("pt-PT"), ignoreCase: false);
        }
        catch (CultureNotFoundException)
        {
            return StringComparer.InvariantCulture;
        }
    }
}

/// <summary>Leitura de datas/horas vindas do Firestore (texto ISO 8601).</summary>
internal static class Instantes
{
    public static DateTimeOffset? Ler(string? texto) =>
        DateTimeOffset.TryParse(
            texto,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var instante)
            ? instante.ToUniversalTime()
            : null;
}
