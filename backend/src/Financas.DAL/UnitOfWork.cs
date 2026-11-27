using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Financas.DAL;

/// <summary>
/// Unidade de trabalho: grava de uma vez o que os repositórios mudaram e corre operações
/// numa transação da base de dados.
/// </summary>
public interface IUnitOfWork
{
    /// <summary>Grava as alterações feitas através dos repositórios (fora de uma transação explícita).</summary>
    Task<int> SaveChangesAsync(CancellationToken ct = default);

    /// <summary>
    /// Corre <paramref name="operacao"/> numa transação: ou fica tudo gravado ou nada. No fim grava
    /// as alterações e faz commit.
    /// <para>
    /// Se outro pedido mudou entretanto os mesmos dados (conflito de concorrência: versão diferente
    /// ou chave repetida), a transação é desfeita e a operação corre outra vez do princípio, com os
    /// dados novos, até <see cref="UnitOfWork.MaximoTentativas"/> vezes. Por isso a operação tem de
    /// ler dentro dela tudo aquilo de que depende (as entidades lidas antes deixam de estar ligadas).
    /// </para>
    /// </summary>
    Task<T> ExecuteInTransactionAsync<T>(Func<CancellationToken, Task<T>> operacao, CancellationToken ct = default);

    /// <inheritdoc cref="ExecuteInTransactionAsync{T}"/>
    Task ExecuteInTransactionAsync(Func<CancellationToken, Task> operacao, CancellationToken ct = default);
}

/// <summary>Os dados mudaram enquanto a operação corria, mesmo depois de a repetir.</summary>
public sealed class ConflitoDeConcorrenciaException(Exception causa)
    : Exception("Os dados foram alterados por outro pedido ao mesmo tempo. Tenta outra vez.", causa);

internal sealed class UnitOfWork(FinancasDbContext db, ILogger<UnitOfWork> logger) : IUnitOfWork
{
    public const int MaximoTentativas = 3;

    public Task<int> SaveChangesAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);

    public async Task ExecuteInTransactionAsync(Func<CancellationToken, Task> operacao, CancellationToken ct = default) =>
        await ExecuteInTransactionAsync(
            async c =>
            {
                await operacao(c);
                return true;
            },
            ct);

    public async Task<T> ExecuteInTransactionAsync<T>(Func<CancellationToken, Task<T>> operacao, CancellationToken ct = default)
    {
        // Já dentro de uma transação (uma operação que usa outra): faz parte dela
        if (db.Database.CurrentTransaction is not null)
        {
            return await operacao(ct);
        }

        for (var tentativa = 1; ; tentativa++)
        {
            // Cada tentativa começa sem entidades em memória: tudo é lido outra vez da base de dados
            db.ChangeTracker.Clear();
            await using var transacao = await db.Database.BeginTransactionAsync(ct);
            try
            {
                var resultado = await operacao(ct);
                await db.SaveChangesAsync(ct);
                await transacao.CommitAsync(ct);
                return resultado;
            }
            catch (Exception erro) when (EConflito(erro))
            {
                await transacao.RollbackAsync(CancellationToken.None);
                db.ChangeTracker.Clear();
                if (tentativa >= MaximoTentativas)
                {
                    logger.LogWarning(erro, "Conflito de concorrência que se manteve em {Tentativas} tentativas", tentativa);
                    throw new ConflitoDeConcorrenciaException(erro);
                }

                logger.LogInformation(
                    "Conflito de concorrência (tentativa {Tentativa} de {Maximo}): a repetir a operação",
                    tentativa,
                    MaximoTentativas);
            }
        }
    }

    // Conflitos que se resolvem repetindo a operação com os dados novos
    internal static bool EConflito(Exception erro) => erro switch
    {
        // Outro pedido mudou a linha (Versao diferente) ou apagou-a
        DbUpdateConcurrencyException => true,
        // Outro pedido inseriu a mesma chave (ex.: o mesmo pagamento do mês, ou o utilizador)
        DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } } => true,
        DbUpdateException { InnerException: SqliteException { SqliteErrorCode: 19, SqliteExtendedErrorCode: 1555 or 2067 } } => true,
        // PostgreSQL desistiu de uma das transações (conflito de serialização ou deadlock)
        PostgresException { SqlState: PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.DeadlockDetected } => true,
        DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.DeadlockDetected } } => true,
        // O EF Core embrulha estes erros transitórios numa RetryLimitExceededException (a estratégia de repetição está a 0,
        // ver LigacaoBaseDeDados): o que importa é a causa
        RetryLimitExceededException { InnerException: { } causa } => EConflito(causa),
        _ => false,
    };
}
