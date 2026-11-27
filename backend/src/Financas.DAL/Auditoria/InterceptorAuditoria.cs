using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Financas.DAL.Entidades;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Financas.DAL.Auditoria;

/// <summary>
/// Registo de alterações com um <see cref="SaveChangesInterceptor"/> do EF Core.
/// <para>
/// O EF Core chama <see cref="SavingChangesAsync"/> mesmo antes de gravar. Aqui percorre-se o
/// <c>ChangeTracker</c>: para cada entidade <see cref="IAuditavel"/> criada, alterada ou apagada
/// junta-se uma <see cref="RegistoAlteracao"/> ao mesmo DbContext. Assim o registo vai no mesmo
/// SaveChanges e na mesma transação que a alteração: ou ficam os dois ou nenhum.
/// </para>
/// <para>
/// Com as repetições da <see cref="UnitOfWork"/> (conflito de concorrência): a tentativa falhada é
/// desfeita na base de dados e o <c>ChangeTracker.Clear()</c> esquece as linhas de registo que ela
/// tinha juntado; a tentativa seguinte junta as suas. Fica só um registo por alteração.
/// </para>
/// <para>
/// Nenhum serviço ou repositório sabe que isto existe: é configurado uma vez, no
/// <c>AddDbContext</c> (ver <see cref="ExtensoesDal"/>).
/// </para>
/// </summary>
internal sealed class InterceptorAuditoria(ContextoAuditoria contexto, TimeProvider tempo) : SaveChangesInterceptor
{
    // Campos técnicos que mudam sozinhos e não dizem nada a quem lê o histórico
    private static readonly HashSet<string> Ignorados =
    [
        nameof(IAuditavel.UtilizadorId),
        nameof(IAuditavel.Id),
        nameof(IVersionado.Versao),
        nameof(GastoRecorrente.UltimaGeracao),
        nameof(DespesaExtra.CriadoEm),
        nameof(DespesaExtra.ChaveIdempotencia),
    ];

    private static readonly JsonSerializerOptions Json = new()
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Registar(eventData.Context);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Registar(eventData.Context);
        return ValueTask.FromResult(result);
    }

    private void Registar(DbContext? db)
    {
        if (db is null || contexto.Desligado)
        {
            return;
        }

        // O EF só compara os valores (DetectChanges) depois deste ponto: sem isto, uma propriedade
        // mudada numa entidade lida ainda aparecia como "Unchanged"
        db.ChangeTracker.DetectChanges();

        var quando = tempo.GetUtcNow().UtcDateTime;
        var origem = contexto.Origem;
        var registos = new List<RegistoAlteracao>();
        foreach (var entrada in db.ChangeTracker.Entries<IAuditavel>())
        {
            var acao = entrada.State switch
            {
                EntityState.Added => AcaoAlteracao.Criada,
                EntityState.Modified => AcaoAlteracao.Alterada,
                EntityState.Deleted => AcaoAlteracao.Apagada,
                _ => (AcaoAlteracao?)null,
            };
            if (acao is null)
            {
                continue;
            }

            var alteracoes = Alteracoes(entrada, acao.Value);
            if (acao == AcaoAlteracao.Alterada && alteracoes.Count == 0)
            {
                continue; // só mudaram campos técnicos (ex.: a versão)
            }

            // Os dados partilhados sem dono (um mealheiro) ficam em nome de quem fez o pedido
            var dono = string.IsNullOrEmpty(entrada.Entity.UtilizadorId) ? contexto.Utilizador : entrada.Entity.UtilizadorId;
            if (string.IsNullOrEmpty(dono))
            {
                continue;
            }

            registos.Add(new RegistoAlteracao
            {
                Id = Guid.NewGuid().ToString("N"),
                UtilizadorId = dono,
                Entidade = entrada.Metadata.ClrType.Name,
                EntidadeId = entrada.Entity.Id,
                Descricao = Cortar(entrada.Entity.Descricao, 200),
                Acao = acao.Value,
                Quando = quando,
                Alteracoes = alteracoes.Count == 0 ? null : alteracoes.ToJsonString(),
                Origem = origem,
            });
        }

        db.Set<RegistoAlteracao>().AddRange(registos);
    }

    private static JsonObject Alteracoes(EntityEntry<IAuditavel> entrada, AcaoAlteracao acao)
    {
        var resultado = new JsonObject();
        foreach (var propriedade in entrada.Properties)
        {
            var nome = propriedade.Metadata.Name;
            if (Ignorados.Contains(nome) || propriedade.Metadata.IsShadowProperty())
            {
                continue;
            }

            var antes = acao == AcaoAlteracao.Criada ? null : propriedade.OriginalValue;
            var depois = acao == AcaoAlteracao.Apagada ? null : propriedade.CurrentValue;
            if (acao == AcaoAlteracao.Alterada && (!propriedade.IsModified || Equals(antes, depois)))
            {
                continue;
            }

            if (antes is null && depois is null)
            {
                continue;
            }

            var campo = new JsonObject();
            if (antes is not null) campo["de"] = JsonSerializer.SerializeToNode(antes, antes.GetType(), Json);
            if (depois is not null) campo["para"] = JsonSerializer.SerializeToNode(depois, depois.GetType(), Json);
            resultado[nome] = campo;
        }

        return resultado;
    }

    private static string? Cortar(string? texto, int maximo) =>
        texto is null || texto.Length <= maximo ? texto : texto[..maximo];
}
