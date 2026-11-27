using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Financas.DAL;

/// <summary>
/// Usada só pelas ferramentas do EF Core (<c>dotnet ef migrations add ...</c>): cria um DbContext
/// para PostgreSQL sem precisar de uma base de dados a correr (gerar uma migração só compara o
/// modelo com o snapshot em Migrations/). As migrações são sempre geradas para PostgreSQL.
/// </summary>
internal sealed class FabricaDesignTime : IDesignTimeDbContextFactory<FinancasDbContext>
{
    public FinancasDbContext CreateDbContext(string[] args)
    {
        var opcoes = new DbContextOptionsBuilder<FinancasDbContext>()
            .UseNpgsql("Host=localhost;Database=financas;Username=postgres")
            .Options;
        return new FinancasDbContext(opcoes);
    }
}
