using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Financas.DAL.Configuracoes;

/// <summary>
/// Guardar um objeto de valor (ex.: a configuração do salário) como JSON numa coluna de texto.
/// <para>
/// Serve para dados que são sempre lidos e escritos inteiros e nunca filtrados em SQL. Funciona igual
/// em PostgreSQL e SQLite. O <see cref="ValueComparer"/> compara o JSON, para o EF perceber quando o
/// objeto mudou (os records com listas não se comparam bem só com Equals).
/// </para>
/// </summary>
internal static class Json
{
    private static readonly JsonSerializerOptions Opcoes = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static string Serializar<T>(T valor) => JsonSerializer.Serialize(valor, Opcoes);

    public static T? Desserializar<T>(string json) => JsonSerializer.Deserialize<T>(json, Opcoes);

    public static PropertyBuilder<T?> ComoJson<T>(this PropertyBuilder<T?> propriedade)
        where T : class
    {
        var comparador = new ValueComparer<T?>(
            (a, b) => Serializar(a) == Serializar(b),
            v => v == null ? 0 : Serializar(v).GetHashCode(),
            // Os objetos são imutáveis: a "fotografia" pode ser o próprio objeto
            v => v);

        propriedade.HasConversion(
            v => Serializar(v),
            texto => Desserializar<T>(texto),
            comparador);
        return propriedade;
    }
}
