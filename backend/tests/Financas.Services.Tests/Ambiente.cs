using Financas.DAL;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Time.Testing;

namespace Financas.Services.Tests;

/// <summary>
/// Um ambiente de testes para a camada de serviços, com a DAL verdadeira (repositórios, unidade de
/// trabalho e EF Core) sobre uma base de dados SQLite em memória, nova em cada teste.
/// <para>
/// Porquê SQLite verdadeiro e não "fakes" dos repositórios: as regras que mais importam aqui
/// (transações, versões contra alterações concorrentes, índices únicos, conversões de tipos)
/// vivem na base de dados e no EF Core. Os testes das regras puras estão em CalculosTests.
/// </para>
/// <para>
/// Cada <see cref="Servico{T}"/> abre um "scope" novo (um DbContext novo), como um pedido HTTP:
/// assim nenhum teste depende de entidades que ficaram em memória de uma chamada anterior.
/// </para>
/// <para>
/// O mesmo ambiente serve para PostgreSQL a sério (<see cref="CriarAsync(string)"/>, usado pelos
/// testes da pasta Postgres/): muda só a ligação, o resto (DAL, serviços, relógio) é igual.
/// </para>
/// </summary>
public sealed class Ambiente : IAsyncDisposable
{
    public static readonly TimeZoneInfo Lisboa = TimeZoneInfo.FindSystemTimeZoneById("Europe/Lisbon");

    // A base de dados em memória vive enquanto houver uma ligação aberta: esta fica aberta até ao fim
    // do teste. Em PostgreSQL não é precisa (null).
    private readonly SqliteConnection? _manterViva;
    private readonly ServiceProvider _servicos;
    private readonly List<AsyncServiceScope> _scopes = [];

    private Ambiente(string ligacao)
    {
        var configuracao = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:Financas"] = ligacao })
            .Build();

        var services = new ServiceCollection();
        services.AddLogging(l => l.SetMinimumLevel(LogLevel.Warning));
        // Cada leitura do relógio avança 1 ms: o que é criado no mesmo teste fica por ordem de criação
        services.AddSingleton<TimeProvider>(Relogio);
        services.AddSingleton<Financas.DAL.Auditoria.IOrigemPedido>(Origem);
        services.AddDal(configuracao);
        services.AddServices(configuracao);
        // O Expo (push) nunca é chamado a sério nos testes
        services.AddSingleton<Financas.Services.Push.IExpoPushClient>(Expo);
        _servicos = services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = true });

        if (LigacaoBaseDeDados.ESqlite(ligacao))
        {
            SqliteNativo.Garantir();
            _manterViva = new SqliteConnection(ligacao);
        }

        DefinirHoje(2026, 10, 5);
    }

    /// <summary>Um ambiente novo, com a base de dados criada e "hoje" = 5 de outubro de 2026.</summary>
    public static Task<Ambiente> CriarAsync() =>
        CriarAsync($"Data Source=testes-{Guid.NewGuid():N};Mode=Memory;Cache=Shared");

    /// <summary>
    /// Um ambiente sobre a base de dados de <paramref name="ligacao"/>. Prepara-a como a API no
    /// arranque (<c>InicializarBaseDeDadosAsync</c>): em SQLite cria as tabelas a partir do modelo;
    /// em PostgreSQL aplica as migrações verdadeiras da pasta Migrations.
    /// </summary>
    public static async Task<Ambiente> CriarAsync(string ligacao)
    {
        var ambiente = new Ambiente(ligacao);
        if (ambiente._manterViva is not null)
        {
            await ambiente._manterViva.OpenAsync();
        }

        await ambiente._servicos.InicializarBaseDeDadosAsync();
        return ambiente;
    }

    public FakeTimeProvider Relogio { get; } = new() { AutoAdvanceAmount = TimeSpan.FromMilliseconds(1) };

    /// <summary>O Expo falso: o que foi "enviado" por push.</summary>
    public FalsoExpoPushClient Expo { get; } = new();

    /// <summary>Quem "faz o pedido" nos testes (só conta para as alterações a dados sem dono, como os mealheiros). Sem origem: "sistema".</summary>
    public OrigemTeste Origem { get; } = new();

    /// <summary>Muda o "hoje" (ao meio-dia em Lisboa, como os testes da app com jest.setSystemTime).</summary>
    public void DefinirHoje(int ano, int mes, int dia, int hora = 12, int minuto = 0)
    {
        var local = new DateTime(ano, mes, dia, hora, minuto, 0, DateTimeKind.Unspecified);
        // AdjustTime permite andar para trás no tempo (alguns testes voltam a setembro)
        Relogio.AdjustTime(new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, Lisboa)));
    }

    /// <summary>Um serviço num scope novo (como num pedido HTTP novo).</summary>
    public T Servico<T>()
        where T : notnull
    {
        var scope = _servicos.CreateAsyncScope();
        _scopes.Add(scope);
        return scope.ServiceProvider.GetRequiredService<T>();
    }

    /// <summary>Um scope novo, para usar vários serviços sobre o mesmo DbContext.</summary>
    public IServiceProvider NovoScope()
    {
        var scope = _servicos.CreateAsyncScope();
        _scopes.Add(scope);
        return scope.ServiceProvider;
    }

    /// <summary>O DbContext, para preparar dados como as versões antigas da app os deixavam.</summary>
    internal FinancasDbContext Db() => Servico<FinancasDbContext>();

    public async ValueTask DisposeAsync()
    {
        foreach (var scope in _scopes)
        {
            await scope.DisposeAsync();
        }

        await _servicos.DisposeAsync();
        if (_manterViva is not null)
        {
            await _manterViva.DisposeAsync();
        }
    }
}
