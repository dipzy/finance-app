using System.Globalization;
using System.Threading.RateLimiting;
using Financas.Api.Autenticacao;
using Financas.Api.Registos;
using Financas.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace Financas.Api.Limites;

/// <summary>Limites de pedidos (secção "LimitesPedidos" do appsettings).</summary>
public sealed class OpcoesLimitesPedidos
{
    public const string Seccao = "LimitesPedidos";

    /// <summary>Pedidos por minuto, por utilizador, em todos os endpoints (exceto /saude).</summary>
    public int PorMinuto { get; set; } = 120;

    /// <summary>Pedidos por minuto, por utilizador, nos endpoints pesados (PDF e importações).</summary>
    public int PesadosPorMinuto { get; set; } = 10;
}

/// <summary>
/// Rate limiting com o middleware do ASP.NET Core (<c>AddRateLimiter</c>/<c>UseRateLimiter</c>).
/// <para>
/// Janela fixa de 1 minuto por "partição": o uid do utilizador autenticado, ou o IP sem sessão.
/// Há um limite global (todos os pedidos) e uma política mais apertada, <see cref="Pesados"/>, posta
/// com <c>[EnableRateLimiting(LimitesPedidos.Pesados)]</c> nos endpoints que gastam mais servidor
/// (o PDF e as importações). Um pedido a mais responde 429 com ProblemDetails em português e o
/// cabeçalho Retry-After. O <c>/saude</c> (Render e keep-alive) nunca é limitado.
/// </para>
/// <para>
/// Os contadores vivem na memória do processo: com uma só instância (Render grátis) chega. Com várias,
/// cada uma contava à parte (seria preciso um contador partilhado, ex.: Redis).
/// </para>
/// </summary>
public static class LimitesPedidos
{
    public const string Pesados = "pesados";

    public static IServiceCollection AddLimitesPedidos(this IServiceCollection services)
    {
        services.AddOptions<OpcoesLimitesPedidos>().BindConfiguration(OpcoesLimitesPedidos.Seccao);
        services.AddRateLimiter(limites =>
        {
            limites.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            limites.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(contexto =>
                contexto.Request.Path.StartsWithSegments("/saude")
                    ? RateLimitPartition.GetNoLimiter("saude")
                    : RateLimitPartition.GetFixedWindowLimiter(Chave(contexto), _ => PorMinuto(Opcoes(contexto).PorMinuto)));

            limites.AddPolicy(Pesados, contexto =>
                RateLimitPartition.GetFixedWindowLimiter(Chave(contexto), _ => PorMinuto(Opcoes(contexto).PesadosPorMinuto)));

            limites.OnRejected = async (rejeitado, ct) =>
            {
                var contexto = rejeitado.HttpContext;
                var segundos = rejeitado.Lease.TryGetMetadata(MetadataName.RetryAfter, out var espera)
                    ? (int)Math.Ceiling(espera.TotalSeconds)
                    : 60;
                contexto.Response.Headers.RetryAfter = segundos.ToString(CultureInfo.InvariantCulture);
                contexto.RequestServices.GetRequiredService<ILoggerFactory>()
                    .CreateLogger(typeof(LimitesPedidos))
                    .LogWarning("Limite de pedidos atingido em {Caminho}", contexto.Request.Path);

                await contexto.RequestServices.GetRequiredService<IProblemDetailsService>().WriteAsync(new ProblemDetailsContext
                {
                    HttpContext = contexto,
                    ProblemDetails = new ProblemDetails
                    {
                        Status = StatusCodes.Status429TooManyRequests,
                        Title = Textos.T("Demasiados pedidos"),
                        Detail = Textos.T($"Fizeste demasiados pedidos seguidos. Espera {segundos} segundos e tenta outra vez."),
                    },
                });
            };
        });
        return services;
    }

    // O uid (hash) de quem está autenticado; sem sessão, o IP
    private static string Chave(HttpContext contexto) =>
        RegistosPedidos.Hash(contexto) is { } utilizador
            ? $"u:{utilizador}"
            : $"ip:{contexto.Connection.RemoteIpAddress}";

    private static OpcoesLimitesPedidos Opcoes(HttpContext contexto) =>
        contexto.RequestServices.GetRequiredService<IOptions<OpcoesLimitesPedidos>>().Value;

    private static FixedWindowRateLimiterOptions PorMinuto(int limite) => new()
    {
        PermitLimit = Math.Max(1, limite),
        Window = TimeSpan.FromMinutes(1),
        QueueLimit = 0,
        AutoReplenishment = true,
    };
}
