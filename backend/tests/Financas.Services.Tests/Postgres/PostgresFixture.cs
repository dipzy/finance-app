using Npgsql;
using Testcontainers.PostgreSql;

namespace Financas.Services.Tests.Postgres;

/// <summary>
/// Um servidor PostgreSQL verdadeiro para os testes, partilhado por todas as classes da coleção
/// <see cref="ColecaoPostgres"/>: arranca uma vez (um contentor Docker com o Testcontainers, que o
/// apaga no fim) e cada teste recebe uma <b>base de dados nova e vazia</b> nesse servidor
/// (<see cref="CriarBaseDeDadosAsync"/>), onde a API aplica as migrações verdadeiras.
/// <para>
/// Porquê testar também em PostgreSQL, se já há os testes em SQLite: os testes em SQLite criam as
/// tabelas a partir do modelo (<c>EnsureCreated</c>) e nunca correm as migrações, e o SQLite é muito
/// mais permissivo. Aqui apanham-se as diferenças que só aparecem na Neon: migrações que não aplicam,
/// <c>numeric(12,2)</c>, <c>timestamp with time zone</c> (só aceita UTC), <c>date</c>, índices
/// únicos, o <c>UPDATE ... WHERE "Versao" = ...</c> com dois pedidos ao mesmo tempo, transações
/// abortadas depois de um erro, comparações de texto sensíveis a maiúsculas...
/// </para>
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly List<string> _basesCriadas = [];
    private PostgreSqlContainer? _contentor;
    private string? _ligacaoServidor;

    public async Task InitializeAsync()
    {
        // O xUnit cria a fixture mesmo quando os testes vão ser ignorados: aí nem se toca no Docker
        if (!ConfiguracaoPostgres.Correr)
        {
            return;
        }

        if (ConfiguracaoPostgres.LigacaoExterna is { } externa)
        {
            _ligacaoServidor = externa;
            return;
        }

        // Sem Docker, StartAsync falha com a explicação do Testcontainers: com
        // FINANCAS_TESTES_POSTGRES=obrigatorio (CI) é isso que se quer ver, em vez de testes ignorados
        _contentor = new PostgreSqlBuilder(ConfiguracaoPostgres.Imagem).Build();
        await _contentor.StartAsync();
        _ligacaoServidor = _contentor.GetConnectionString();
    }

    /// <summary>
    /// Cria uma base de dados vazia (sem tabelas) e devolve a ligação a ela, no formato do Npgsql.
    /// As tabelas são criadas depois pelas migrações (ver <see cref="Ambiente.CriarAsync(string)"/>).
    /// </summary>
    public async Task<string> CriarBaseDeDadosAsync()
    {
        var servidor = _ligacaoServidor
            ?? throw new InvalidOperationException("O PostgreSQL dos testes não arrancou (ver FactPostgres).");

        // Nome único e só com letras minúsculas, números e _: não precisa de aspas no SQL
        var nome = $"teste_{Guid.NewGuid():N}";
        await ExecutarAsync(servidor, $"CREATE DATABASE {nome}");
        lock (_basesCriadas)
        {
            _basesCriadas.Add(nome);
        }

        return new NpgsqlConnectionStringBuilder(servidor) { Database = nome }.ConnectionString;
    }

    public async Task DisposeAsync()
    {
        if (_contentor is not null)
        {
            // O contentor vai embora com tudo o que lá está dentro
            await _contentor.DisposeAsync();
            return;
        }

        if (_ligacaoServidor is not null)
        {
            // Servidor externo: arrumar as bases de dados dos testes. FORCE fecha as ligações que
            // ainda estejam abertas (PostgreSQL 13 ou mais recente)
            NpgsqlConnection.ClearAllPools();
            foreach (var nome in _basesCriadas)
            {
                await ExecutarAsync(_ligacaoServidor, $"DROP DATABASE IF EXISTS {nome} WITH (FORCE)");
            }
        }
    }

    private static async Task ExecutarAsync(string ligacao, string sql)
    {
        await using var conexao = new NpgsqlConnection(ligacao);
        await conexao.OpenAsync();
        await using var comando = new NpgsqlCommand(sql, conexao);
        await comando.ExecuteNonQueryAsync();
    }
}

/// <summary>
/// As classes de testes com <c>[Collection(ColecaoPostgres.Nome)]</c> partilham a mesma
/// <see cref="PostgresFixture"/> (um só contentor para todas) e correm uma de cada vez.
/// </summary>
[CollectionDefinition(Nome)]
public sealed class ColecaoPostgres : ICollectionFixture<PostgresFixture>
{
    public const string Nome = "PostgreSQL";

    /// <summary>Trait para escolher (ou excluir) estes testes: <c>dotnet test --filter BaseDeDados=PostgreSQL</c>.</summary>
    public const string Trait = "BaseDeDados";
}
