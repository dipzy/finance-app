using Financas.DAL;
using Microsoft.EntityFrameworkCore;

namespace Financas.Services.Tests;

// Os testes em SQLite criam as tabelas a partir do modelo e nunca usam as migrações. Este teste
// (que não precisa de base de dados nem de Docker, corre sempre) apanha o esquecimento mais comum:
// mudar uma entidade ou uma configuração e não gerar a migração. Aplicar as migrações a sério é
// com os testes de Postgres/MigracoesPostgresTests.
public class ModeloEMigracoesTests
{
    [Fact]
    public void O_modelo_do_EF_Core_nao_tem_alteracoes_sem_migracao()
    {
        // O mesmo que a FabricaDesignTime usa para gerar as migrações: PostgreSQL, sem ligar ao servidor
        var opcoes = new DbContextOptionsBuilder<FinancasDbContext>()
            .UseNpgsql("Host=localhost;Database=financas;Username=postgres")
            .Options;
        using var db = new FinancasDbContext(opcoes);

        Assert.NotEmpty(db.Database.GetMigrations());
        Assert.False(
            db.Database.HasPendingModelChanges(),
            "O modelo mudou e falta a migração: dotnet ef migrations add NomeDaMudanca --project src/Financas.DAL");
    }
}
