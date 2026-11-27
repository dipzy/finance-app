using Financas.DAL;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Financas.Services.Tests.Postgres;

// As migrações verdadeiras (pasta Migrations da DAL), aplicadas numa base de dados PostgreSQL vazia,
// como na Neon no primeiro arranque da API. Nada aqui tem a lista de tabelas escrita à mão: tudo é
// comparado com o modelo do EF Core, por isso as migrações novas ficam cobertas sem mexer nestes testes.
[Collection(ColecaoPostgres.Nome)]
[Trait(ColecaoPostgres.Trait, ColecaoPostgres.Nome)]
public class MigracoesPostgresTests(PostgresFixture postgres) : TestesServicosPostgres(postgres)
{
    [FactPostgres]
    public async Task Todas_as_migracoes_aplicam_numa_base_de_dados_vazia_e_nao_fica_nenhuma_por_aplicar()
    {
        // O Ambiente já correu InicializarBaseDeDadosAsync, que em PostgreSQL faz MigrateAsync
        var db = A.Db();
        Assert.True(db.Database.IsNpgsql());
        Assert.NotEmpty(db.Database.GetMigrations());
        Assert.Equal(db.Database.GetMigrations(), await db.Database.GetAppliedMigrationsAsync());
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }

    [FactPostgres]
    public async Task As_tabelas_e_colunas_criadas_pelas_migracoes_sao_as_do_modelo()
    {
        var db = A.Db();
        var colunas = await ColunasAsync(db);

        foreach (var entidade in db.Model.GetEntityTypes())
        {
            // Tipos guardados dentro de uma coluna JSON (ToJson) não têm colunas próprias
            if (entidade.IsMappedToJson() || entidade.GetTableName() is not { } tabela)
            {
                continue;
            }

            var origem = StoreObjectIdentifier.Table(tabela, entidade.GetSchema());
            foreach (var propriedade in entidade.GetProperties())
            {
                if (propriedade.GetColumnName(origem) is not { } nome)
                {
                    continue;
                }

                Assert.True(colunas.TryGetValue((tabela, nome), out var coluna), $"Falta a coluna {tabela}.{nome} na base de dados");

                // Dinheiro: numeric(12,2) (ou a precisão que o modelo disser), nunca "numeric" sem limites
                if ((Nullable.GetUnderlyingType(propriedade.ClrType) ?? propriedade.ClrType) == typeof(decimal))
                {
                    Assert.Equal(("numeric", propriedade.GetPrecision(), propriedade.GetScale()), (coluna.Tipo, coluna.Precisao, coluna.Escala));
                }

                // NOT NULL igual ao modelo (os tipos "owned" e as subclasses partilham a tabela e
                // têm colunas que podem ser nulas mesmo que a propriedade não seja: ficam de fora)
                if (!entidade.IsOwned() && entidade.BaseType is null)
                {
                    Assert.True(propriedade.IsNullable == coluna.Nula, $"{tabela}.{nome}: NULL no modelo = {propriedade.IsNullable}, na base de dados = {coluna.Nula}");
                }
            }
        }
    }

    [FactPostgres]
    public async Task Aplicar_outra_vez_nao_faz_nada_e_as_migracoes_tambem_se_desfazem()
    {
        // O arranque da API corre isto sempre: com tudo aplicado não pode falhar
        await A.NovoScope().InicializarBaseDeDadosAsync();

        // Desfazer tudo (os métodos Down de cada migração, da mais recente para a primeira)...
        var db = A.Db();
        await db.Database.MigrateAsync(Migration.InitialDatabase);
        Assert.Empty(await db.Database.GetAppliedMigrationsAsync());
        // Só ficam as tabelas do próprio EF Core (__EFMigrationsHistory e, conforme a versão, a do lock)
        var tabelas = (await ColunasAsync(db)).Keys.Select(c => c.Tabela).Distinct();
        Assert.DoesNotContain(tabelas, t => !t.StartsWith("__EF", StringComparison.Ordinal));

        // ... e voltar a aplicar: a base de dados fica utilizável como antes
        await db.Database.MigrateAsync();
        await Adicionar(10);
        Assert.Equal(10, await GetSaldo());
    }

    private sealed record Coluna(string Tipo, int? Precisao, int? Escala, bool Nula);

    // information_schema: o "catálogo" do PostgreSQL com as tabelas e colunas que existem mesmo
    private static async Task<Dictionary<(string Tabela, string Nome), Coluna>> ColunasAsync(FinancasDbContext db)
    {
        var linhas = await db.Database
            .SqlQueryRaw<LinhaColuna>(
                """
                SELECT table_name::text AS "Tabela", column_name::text AS "Nome", data_type::text AS "Tipo",
                       numeric_precision::int AS "Precisao", numeric_scale::int AS "Escala",
                       (is_nullable = 'YES') AS "Nula"
                FROM information_schema.columns
                WHERE table_schema = 'public'
                """)
            .ToListAsync();
        return linhas.ToDictionary(l => (l.Tabela, l.Nome), l => new Coluna(l.Tipo, l.Precisao, l.Escala, l.Nula));
    }

    private sealed record LinhaColuna(string Tabela, string Nome, string Tipo, int? Precisao, int? Escala, bool Nula);
}
