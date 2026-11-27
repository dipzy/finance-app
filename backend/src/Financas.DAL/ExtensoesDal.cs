using Financas.DAL.Auditoria;
using Financas.DAL.Repositorios;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;

namespace Financas.DAL;

/// <summary>Registo da camada de dados na injeção de dependências e preparação da base de dados.</summary>
public static class ExtensoesDal
{
    /// <summary>Nome da ligação em <c>ConnectionStrings</c> (variável de ambiente <c>ConnectionStrings__Financas</c>).</summary>
    public const string NomeLigacao = "Financas";

    /// <summary>
    /// Regista o DbContext (PostgreSQL ou SQLite, conforme a ligação), a unidade de trabalho e os
    /// repositórios. Tudo "scoped": um DbContext por pedido HTTP.
    /// </summary>
    public static IServiceCollection AddDal(this IServiceCollection services, IConfiguration configuracao)
    {
        // Registo de alterações: o contexto (de onde vem o pedido) e o interceptor, um por pedido
        services.TryAddSingleton(TimeProvider.System);
        services.AddScoped<ContextoAuditoria>();
        services.AddScoped<InterceptorAuditoria>();

        services.AddDbContext<FinancasDbContext>((servicos, opcoes) =>
        {
            // Lida só quando o primeiro DbContext é criado: os testes podem mudar a configuração antes
            var ligacao = configuracao.GetConnectionString(NomeLigacao);
            if (string.IsNullOrWhiteSpace(ligacao))
            {
                throw new InvalidOperationException(
                    $"Falta a ligação à base de dados: define ConnectionStrings:{NomeLigacao} " +
                    $"(variável de ambiente ConnectionStrings__{NomeLigacao}).");
            }

            LigacaoBaseDeDados.Configurar(opcoes, ligacao);
            opcoes.AddInterceptors(servicos.GetRequiredService<InterceptorAuditoria>());
        });

        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IVerificadorBaseDeDados, VerificadorBaseDeDados>();
        services.AddScoped<IUtilizadoresRepository, UtilizadoresRepository>();
        services.AddScoped<IDespesasFixasRepository, DespesasFixasRepository>();
        services.AddScoped<IPagamentosRepository, PagamentosRepository>();
        services.AddScoped<IDespesasExtrasRepository, DespesasExtrasRepository>();
        services.AddScoped<IPoupancasRepository, PoupancasRepository>();
        services.AddScoped<IContribuicoesPoupancaRepository, ContribuicoesPoupancaRepository>();
        services.AddScoped<IJurosPoupancaRepository, JurosPoupancaRepository>();
        services.AddScoped<IDividasRepository, DividasRepository>();
        services.AddScoped<IMesesRepository, MesesRepository>();
        services.AddScoped<IOrcamentosRepository, OrcamentosRepository>();
        services.AddScoped<IObjetivosRepository, ObjetivosRepository>();
        services.AddScoped<IGastosRecorrentesRepository, GastosRecorrentesRepository>();
        services.AddScoped<IRegrasCategoriaRepository, RegrasCategoriaRepository>();
        services.AddScoped<IContaDadosRepository, ContaDadosRepository>();
        services.AddScoped<IDispositivosPushRepository, DispositivosPushRepository>();
        services.AddScoped<IAlertasEnviadosRepository, AlertasEnviadosRepository>();
        services.AddScoped<IRegistosAlteracaoRepository, RegistosAlteracaoRepository>();
        services.AddScoped<IParceirosConvitesRepository, ParceirosConvitesRepository>();
        services.AddScoped<IGruposRepository, GruposRepository>();
        services.AddScoped<IGrupoMembrosRepository, GrupoMembrosRepository>();
        services.AddScoped<IPoupancasPartilhadasRepository, PoupancasPartilhadasRepository>();
        services.AddScoped<IPoupancasPartilhadasMembrosRepository, PoupancasPartilhadasMembrosRepository>();
        services.AddScoped<IDespesasPartilhadasRepository, DespesasPartilhadasRepository>();
        return services;
    }

    /// <summary>
    /// No arranque: em PostgreSQL aplica as migrações que faltam (pasta Migrations); em SQLite
    /// (desenvolvimento e testes) cria as tabelas diretamente a partir do modelo.
    /// </summary>
    public static async Task InicializarBaseDeDadosAsync(this IServiceProvider servicos, CancellationToken ct = default)
    {
        await using var scope = servicos.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FinancasDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(ExtensoesDal));

        if (db.Database.IsNpgsql())
        {
            logger.LogInformation("PostgreSQL: a aplicar as migrações em falta");
            await db.Database.MigrateAsync(ct);
        }
        else
        {
            logger.LogInformation("SQLite: a criar as tabelas (se ainda não existirem)");
            await db.Database.EnsureCreatedAsync(ct);
        }
    }
}
