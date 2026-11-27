namespace Financas.Services.Tests.Postgres;

/// <summary>
/// Base dos testes de cenário em PostgreSQL: os mesmos atalhos de <see cref="TestesServicos"/>
/// (Adicionar, AdicionarExtra, CalcularSaldoDisponivel...), mas cada teste corre numa base de dados
/// PostgreSQL nova, criada pelas migrações. Assim os cenários portados leem-se igual aos de SQLite.
/// <para>
/// Cada classe concreta tem de ter <c>[Collection(ColecaoPostgres.Nome)]</c> (é isso que dá a
/// fixture ao construtor), <c>[Trait(ColecaoPostgres.Trait, ColecaoPostgres.Nome)]</c> e usar
/// <see cref="FactPostgresAttribute"/> em vez de <c>[Fact]</c>.
/// </para>
/// </summary>
public abstract class TestesServicosPostgres(PostgresFixture postgres) : TestesServicos
{
    protected PostgresFixture Postgres => postgres;

    protected override async Task<Ambiente> CriarAmbienteAsync() =>
        await Ambiente.CriarAsync(await postgres.CriarBaseDeDadosAsync());
}
