using Financas.DAL;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;

namespace Financas.Services.Tests;

// Que erros da base de dados a UnitOfWork repete (conflitos de concorrência) e quais deixa passar
public class ConflitosTests
{
    private static PostgresException Postgres(string sqlState) => new("erro", "ERROR", "ERROR", sqlState);

    [Fact]
    public void Um_deadlock_e_um_conflito()
    {
        Assert.True(UnitOfWork.EConflito(Postgres(PostgresErrorCodes.DeadlockDetected)));
        Assert.True(UnitOfWork.EConflito(new DbUpdateException("erro", Postgres(PostgresErrorCodes.DeadlockDetected))));
    }

    // Com a estratégia de repetição do EF a 0 (LigacaoBaseDeDados), o EF embrulha os erros transitórios do PostgreSQL
    // (deadlock, falha de serialização) numa RetryLimitExceededException: a causa é que conta
    [Theory]
    [InlineData(PostgresErrorCodes.DeadlockDetected)]
    [InlineData(PostgresErrorCodes.SerializationFailure)]
    public void Um_deadlock_embrulhado_pelo_EF_tambem_e_um_conflito(string sqlState)
    {
        var embrulhado = new RetryLimitExceededException("Máximo de repetições excedido", new DbUpdateException("erro", Postgres(sqlState)));

        Assert.True(UnitOfWork.EConflito(embrulhado));
    }

    [Fact]
    public void Outros_erros_embrulhados_pelo_EF_nao_sao_conflitos()
    {
        Assert.False(UnitOfWork.EConflito(new RetryLimitExceededException("x", new DbUpdateException("erro", Postgres(PostgresErrorCodes.SyntaxError)))));
        Assert.False(UnitOfWork.EConflito(new RetryLimitExceededException("x", new InvalidOperationException())));
        Assert.False(UnitOfWork.EConflito(new InvalidOperationException()));
    }
}
