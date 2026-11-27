using Financas.Services.Interfaces;
using Financas.Services.Push;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Financas.Services;

/// <summary>Registo da camada de negócio na injeção de dependências.</summary>
public static class ExtensoesServices
{
    public static IServiceCollection AddServices(this IServiceCollection services, IConfiguration configuracao)
    {
        // Options pattern: secção "Relogio" do appsettings.json -> OpcoesRelogio
        services.AddOptions<OpcoesRelogio>().Bind(configuracao.GetSection(OpcoesRelogio.Seccao));

        // O relógio do sistema; os testes registam um FakeTimeProvider por cima deste
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<Relogio>();

        // Scoped: um por pedido HTTP, como o DbContext que usam por baixo
        services.AddScoped<IContaService, ContaService>();
        services.AddScoped<IPerfilService, PerfilService>();
        services.AddScoped<IConfiguracoesService, ConfiguracoesService>();
        services.AddScoped<ISalarioService, SalarioService>();
        services.AddScoped<IDespesasFixasService, DespesasFixasService>();
        services.AddScoped<IDespesasExtrasService, DespesasExtrasService>();
        services.AddScoped<IExtratoBancarioService, ExtratoBancarioService>();
        services.AddScoped<IPoupancasService, PoupancasService>();
        services.AddScoped<IDividasService, DividasService>();
        services.AddScoped<IMesesService, MesesService>();
        services.AddScoped<IPreparacaoDadosService, PreparacaoDadosService>();
        services.AddScoped<IFolhaMesService, FolhaMesService>();
        services.AddScoped<IMigracaoService, MigracaoService>();
        services.AddScoped<IOrcamentosService, OrcamentosService>();
        services.AddScoped<IObjetivosService, ObjetivosService>();
        services.AddScoped<IEstatisticasService, EstatisticasService>();
        services.AddScoped<IRelatorioPdfService, RelatorioPdfService>();
        services.AddScoped<IGastosRecorrentesService, GastosRecorrentesService>();
        services.AddScoped<IAlteracoesService, AlteracoesService>();
        services.AddScoped<Categorizador>();
        services.AddScoped<IRegrasCategoriaService, RegrasCategoriaService>();
        services.AddScoped<IApagarContaService, ApagarContaService>();
        services.AddScoped<AlertasService>();
        services.AddScoped<IAlertasService>(s => s.GetRequiredService<AlertasService>());
        services.AddScoped<IDispositivosService, DispositivosService>();
        services.AddScoped<IAlertasEnvioService, AlertasEnvioService>();

        // Notificações push (Expo): secção "Alertas" (Alertas__SegredoCron, ...) e um HttpClient para o Expo
        services.AddOptions<OpcoesAlertas>().Bind(configuracao.GetSection(OpcoesAlertas.Seccao));
        services.AddHttpClient<IExpoPushClient, ExpoPushClient>(http => http.Timeout = TimeSpan.FromSeconds(20));
        services.AddScoped<IGruposService, GruposService>();
        services.AddScoped<IPoupancasPartilhadasService, PoupancasPartilhadasService>();
        services.AddScoped<IPoupancasPartilhadasMembrosService, PoupancasPartilhadasMembrosService>();
        services.AddScoped<Push.NotificadorPartilhado>();
        services.AddScoped<PartilhadoService>();
        services.AddScoped<IPartilhadoService>(sp => sp.GetRequiredService<PartilhadoService>());
        services.AddScoped<IPartilhadoDeFixas>(sp => sp.GetRequiredService<PartilhadoService>());
        return services;
    }
}
