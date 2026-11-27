using System.Runtime.CompilerServices;
using Serilog;
using Serilog.Events;

namespace Financas.Api.Registos;

/// <summary>
/// O Sentry (erros em produção). Só liga com DSN (<c>Sentry__Dsn</c>); sem DSN nada disto corre.
/// Os métodos estão à parte e sem "inlining" para as DLLs do Sentry só serem carregadas quando há DSN.
/// Sem dados pessoais: sem PII e sem corpos dos pedidos.
/// </summary>
internal static class IntegracaoSentry
{
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static void LigarAoHost(WebApplicationBuilder builder)
    {
        builder.WebHost.UseSentry(opcoes =>
        {
            opcoes.Dsn = builder.Configuration["Sentry:Dsn"];
            opcoes.Environment = builder.Environment.EnvironmentName;
            opcoes.SendDefaultPii = false;
            opcoes.MaxRequestBodySize = Sentry.Extensibility.RequestSize.None;
            opcoes.TracesSampleRate = builder.Configuration.GetValue("Sentry:TracesSampleRate", 0d);
        });
    }

    /// <summary>Os logs de nível Error (com o rasto) vão para o Sentry e os Information ficam como migalhas.</summary>
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static void LigarAoSerilog(LoggerConfiguration logs)
    {
        logs.WriteTo.Sentry(opcoes =>
        {
            opcoes.InitializeSdk = false; // o SDK já foi iniciado pelo UseSentry
            opcoes.MinimumEventLevel = LogEventLevel.Error;
            opcoes.MinimumBreadcrumbLevel = LogEventLevel.Information;
        });
    }
}
