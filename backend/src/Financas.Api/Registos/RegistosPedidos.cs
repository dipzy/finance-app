using System.Security.Cryptography;
using System.Text;
using Financas.Api.Autenticacao;
using Financas.DAL.Auditoria;
using Serilog;
using Serilog.Context;
using Serilog.Events;

namespace Financas.Api.Registos;

/// <summary>
/// Logs estruturados com o Serilog (consola: o Render mostra o stdout) e a origem dos pedidos para o
/// registo de alterações.
/// <para>
/// O que <b>nunca</b> vai para os logs: o token (cabeçalho Authorization), a ligação à base de dados
/// e os corpos dos pedidos (valores de dinheiro). O pedido aparece só com o método, o caminho (sem
/// a query string), o estado e o tempo. O utilizador aparece como um hash curto do uid
/// (<see cref="HashUtilizador"/>): dá para seguir os pedidos de uma pessoa sem expor o uid.
/// </para>
/// </summary>
public static class RegistosPedidos
{
    /// <summary>Serilog configurado pela secção "Serilog" do appsettings (níveis, consola, formato).</summary>
    public static IServiceCollection AddRegistos(this IServiceCollection services, IConfiguration configuracao)
    {
        var sentry = SentryAtivo(configuracao);
        services.AddSerilog((servicos, logs) =>
        {
            logs
                .ReadFrom.Configuration(configuracao)
                .ReadFrom.Services(servicos)
                .Enrich.FromLogContext();

            // Erros (e rastos) para o Sentry, só com DSN. O SDK já foi iniciado pelo UseSentry (ver Program.cs)
            if (sentry)
            {
                IntegracaoSentry.LigarAoSerilog(logs);
            }
        });

        // Registo de alterações: a origem de cada alteração é o pedido HTTP ("PATCH /api/...")
        services.AddHttpContextAccessor();
        services.AddScoped<IOrigemPedido, OrigemPedidoHttp>();
        return services;
    }

    /// <summary>O Sentry só está ligado se houver DSN (<c>Sentry__Dsn</c>); sem DSN fica desligado.</summary>
    public static bool SentryAtivo(IConfiguration configuracao) => !string.IsNullOrWhiteSpace(configuracao["Sentry:Dsn"]);

    /// <summary>
    /// Uma linha por pedido ("HTTP GET /api/conta/saldo respondeu 200 em 35 ms"), com o id do pedido e
    /// o hash do utilizador.
    /// </summary>
    public static IApplicationBuilder UseRegistoPedidos(this IApplicationBuilder app) =>
        app.UseSerilogRequestLogging(opcoes =>
        {
            opcoes.MessageTemplate = "HTTP {RequestMethod} {RequestPath} respondeu {StatusCode} em {Elapsed:0} ms";

            // Erros do servidor como Error; o /saude (keep-alive de 10 em 10 minutos) só em Debug
            opcoes.GetLevel = (contexto, _, erro) =>
                erro is not null || contexto.Response.StatusCode >= 500 ? LogEventLevel.Error
                : contexto.Request.Path.StartsWithSegments("/saude") ? LogEventLevel.Debug
                : LogEventLevel.Information;
            opcoes.EnrichDiagnosticContext = (diagnostico, contexto) =>
            {
                diagnostico.Set("RequestId", contexto.TraceIdentifier);
                if (Hash(contexto) is { } utilizador)
                {
                    diagnostico.Set("Utilizador", utilizador);
                }
            };
        });

    /// <summary>
    /// Depois da autenticação: todas as linhas de log escritas durante o pedido levam o id do pedido e o
    /// hash do utilizador.
    /// </summary>
    public static IApplicationBuilder UseContextoRegistos(this IApplicationBuilder app) =>
        app.Use(async (contexto, seguinte) =>
        {
            using (LogContext.PushProperty("RequestId", contexto.TraceIdentifier))
            using (LogContext.PushProperty("Utilizador", Hash(contexto)))
            {
                await seguinte(contexto);
            }
        });

    /// <summary>Os primeiros 12 carateres hexadecimais do SHA-256 do uid.</summary>
    public static string HashUtilizador(string uid) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(uid)))[..12].ToLowerInvariant();

    internal static string? Hash(HttpContext contexto) =>
        contexto.User.Identity?.IsAuthenticated == true ? HashUtilizador(contexto.User.IdUtilizador()) : null;
}

/// <summary>A origem das alterações (registo de alterações): "MÉTODO /caminho" do pedido atual.</summary>
internal sealed class OrigemPedidoHttp(IHttpContextAccessor acessor) : IOrigemPedido
{
    public string? Origem =>
        acessor.HttpContext?.Request is { } pedido ? $"{pedido.Method} {pedido.Path}" : null;

    public string? Utilizador =>
        acessor.HttpContext?.User.Identity?.IsAuthenticated == true ? acessor.HttpContext.User.IdUtilizador() : null;
}
