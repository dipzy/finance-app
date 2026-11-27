using Financas.Services;

namespace Financas.Api.Middleware;

/// <summary>
/// Põe a linguagem do pedido (pt/en) no <see cref="Textos"/> a partir do cabeçalho
/// <c>Accept-Language</c>. O erro seguinte de cada resposta (títulos e detalhes dos ProblemDetails)
/// e o relatório PDF são traduzidos com essa linguagem; em falta usa-se português ("pt").
/// </summary>
public static class Idioma
{
    public static IApplicationBuilder UseIdioma(this IApplicationBuilder app) =>
        app.Use(async (contexto, proximo) =>
        {
            Textos.Linguagem = PrefereIngles(contexto) ? "en" : "pt";
            await proximo();
        });

    private static bool PrefereIngles(HttpContext contexto)
    {
        var aceite = contexto.Request.Headers.AcceptLanguage.ToString();
        return aceite.StartsWith("en", StringComparison.OrdinalIgnoreCase);
    }
}