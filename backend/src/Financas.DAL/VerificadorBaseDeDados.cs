using Microsoft.EntityFrameworkCore;

namespace Financas.DAL;

/// <summary>Pergunta à base de dados se está a responder (para o /saude/pronta). O DbContext não sai da DAL.</summary>
public interface IVerificadorBaseDeDados
{
    /// <summary>
    /// True se consegue ligar e executar uma consulta simples; false se a base de dados não responde
    /// (ou se passar de <paramref name="espera"/>). Nunca lança exceções.
    /// </summary>
    Task<bool> EstaDisponivelAsync(TimeSpan espera, CancellationToken ct = default);
}

internal sealed class VerificadorBaseDeDados(FinancasDbContext db) : IVerificadorBaseDeDados
{
    public async Task<bool> EstaDisponivelAsync(TimeSpan espera, CancellationToken ct = default)
    {
        using var limite = CancellationTokenSource.CreateLinkedTokenSource(ct);
        limite.CancelAfter(espera);
        try
        {
            // Uma consulta a sério (SELECT 1): só abrir a ligação não prova que a base de dados responde
            await db.Database.ExecuteSqlRawAsync("SELECT 1", limite.Token);
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }
}
