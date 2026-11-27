using Financas.DAL.Entidades;
using Microsoft.EntityFrameworkCore;

namespace Financas.DAL.Repositorios;

/// <summary>
/// Apagar a conta e os dados (RGPD). Operações em bloco, direto na base de dados (<c>ExecuteDelete</c> /
/// <c>ExecuteUpdate</c>): não passam pelo registo de alterações nem pelo rastreio do EF, por isso
/// não deixam linhas de histórico para trás. Correm na transação do pedido (ver <see cref="IUnitOfWork"/>).
/// </summary>
public interface IContaDadosRepository
{
    /// <summary>Todas as linhas de pertença a grupos do utilizador, incluindo os grupos que já deixou.</summary>
    Task<List<GrupoMembro>> ListarMembrosDoUtilizadorAsync(string uid, CancellationToken ct = default);

    /// <summary>
    /// Apaga o grupo todo: despesas partilhadas e partes, acertos, mealheiros (movimentos e contribuições),
    /// convites e membros. As despesas pessoais que eram partes de despesas do grupo ficam, sem ligação a ele.
    /// </summary>
    Task ApagarGrupoAsync(string grupoId, CancellationToken ct = default);

    /// <summary>
    /// Num grupo que continua a existir, troca o uid do utilizador por <paramref name="pseudonimo"/> em tudo o
    /// que as contas do grupo registam (quem criou o grupo, quem pagou, as partes, os acertos, os movimentos dos mealheiros): as
    /// contas dos outros membros continuam certas, mas nada fica ligado ao utilizador.
    /// </summary>
    Task AnonimizarNoGrupoAsync(string grupoId, string uid, string pseudonimo, CancellationToken ct = default);

    /// <summary>Apaga os convites enviados pelo utilizador e os dirigidos aos emails dados (normalizados).</summary>
    Task ApagarConvitesAsync(string uid, IReadOnlyCollection<string> emailsNormalizados, CancellationToken ct = default);

    /// <summary>
    /// Apaga tudo o que é só do utilizador: despesas, pagamentos, poupanças, dívidas, orçamentos, objetivos,
    /// regras, dispositivos, alertas enviados, contribuições para mealheiros, parcerias antigas, o registo de
    /// alterações e, por fim, o próprio utilizador.
    /// </summary>
    Task ApagarDadosPessoaisAsync(string uid, CancellationToken ct = default);
}

internal sealed class ContaDadosRepository(FinancasDbContext db) : IContaDadosRepository
{
    public Task<List<GrupoMembro>> ListarMembrosDoUtilizadorAsync(string uid, CancellationToken ct = default) =>
        db.GruposMembros.Where(m => m.Uid == uid).ToListAsync(ct);

    public async Task ApagarGrupoAsync(string grupoId, CancellationToken ct = default)
    {
        var despesasIds = await db.DespesasPartilhadas.Where(d => d.GrupoId == grupoId).Select(d => d.Id).ToListAsync(ct);
        var mealheirosIds = await db.PoupancasPartilhadas.Where(p => p.GrupoId == grupoId).Select(p => p.Id).ToListAsync(ct);

        // As despesas pessoais de quem partilhou (que ficam) deixam de apontar para despesas que vão desaparecer
        await db.DespesasExtras
            .Where(e => e.DespesaPartilhadaId != null && despesasIds.Contains(e.DespesaPartilhadaId!))
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.DespesaPartilhadaId, (string?)null), ct);

        await db.PartesDespesasPartilhadas.Where(p => despesasIds.Contains(p.DespesaPartilhadaId)).ExecuteDeleteAsync(ct);
        await db.DespesasPartilhadas.Where(d => d.GrupoId == grupoId).ExecuteDeleteAsync(ct);
        await db.AcertosPartilhados.Where(a => a.GrupoId == grupoId).ExecuteDeleteAsync(ct);
        await db.MovimentosPoupancasPartilhadas.Where(m => mealheirosIds.Contains(m.PoupancaPartilhadaId)).ExecuteDeleteAsync(ct);
        await db.PoupancasPartilhadasMembros.Where(m => mealheirosIds.Contains(m.PoupancaPartilhadaId)).ExecuteDeleteAsync(ct);
        await db.PoupancasPartilhadas.Where(p => p.GrupoId == grupoId).ExecuteDeleteAsync(ct);
        await db.ParceirosConvites.Where(c => c.GrupoId == grupoId).ExecuteDeleteAsync(ct);
        await db.GruposMembros.Where(m => m.GrupoId == grupoId).ExecuteDeleteAsync(ct);
        await db.Grupos.Where(g => g.Id == grupoId).ExecuteDeleteAsync(ct);
    }

    public async Task AnonimizarNoGrupoAsync(string grupoId, string uid, string pseudonimo, CancellationToken ct = default)
    {
        var despesasIds = await db.DespesasPartilhadas.Where(d => d.GrupoId == grupoId).Select(d => d.Id).ToListAsync(ct);
        var mealheirosIds = await db.PoupancasPartilhadas.Where(p => p.GrupoId == grupoId).Select(p => p.Id).ToListAsync(ct);

        await db.Grupos
            .Where(g => g.Id == grupoId && g.CriadoPorUid == uid)
            .ExecuteUpdateAsync(s => s.SetProperty(g => g.CriadoPorUid, pseudonimo), ct);
        await db.DespesasPartilhadas
            .Where(d => d.GrupoId == grupoId && d.PagadorUid == uid)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.PagadorUid, pseudonimo), ct);
        await db.PartesDespesasPartilhadas
            .Where(p => despesasIds.Contains(p.DespesaPartilhadaId) && p.Uid == uid)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Uid, pseudonimo), ct);
        await db.AcertosPartilhados
            .Where(a => a.GrupoId == grupoId && a.DeUid == uid)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.DeUid, pseudonimo), ct);
        await db.AcertosPartilhados
            .Where(a => a.GrupoId == grupoId && a.ParaUid == uid)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.ParaUid, pseudonimo), ct);
        await db.AcertosPartilhados
            .Where(a => a.GrupoId == grupoId && a.CriadoPorUid == uid)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.CriadoPorUid, pseudonimo), ct);
        await db.MovimentosPoupancasPartilhadas
            .Where(m => mealheirosIds.Contains(m.PoupancaPartilhadaId) && m.Uid == uid)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.Uid, pseudonimo), ct);
    }

    public async Task ApagarConvitesAsync(string uid, IReadOnlyCollection<string> emailsNormalizados, CancellationToken ct = default) =>
        await db.ParceirosConvites
            .Where(c => c.DeUid == uid || emailsNormalizados.Contains(c.Email))
            .ExecuteDeleteAsync(ct);

    public async Task ApagarDadosPessoaisAsync(string uid, CancellationToken ct = default)
    {
        await db.PagamentosFixas.Where(p => p.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.DespesasFixas.Where(d => d.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.DespesasExtras.Where(d => d.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.GastosRecorrentes.Where(g => g.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.ContribuicoesPoupanca.Where(c => c.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.JurosPoupancas.Where(j => j.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.Poupancas.Where(p => p.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.Dividas.Where(d => d.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.Meses.Where(m => m.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.Orcamentos.Where(o => o.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.Objetivos.Where(o => o.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.RegrasCategoria.Where(r => r.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.DispositivosPush.Where(d => d.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.AlertasEnviados.Where(a => a.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.PoupancasPartilhadasMembros.Where(m => m.MembroUid == uid).ExecuteDeleteAsync(ct);
        await db.RegistosAlteracao.Where(r => r.UtilizadorId == uid).ExecuteDeleteAsync(ct);
        await db.Utilizadores.Where(u => u.Id == uid).ExecuteDeleteAsync(ct);
    }
}
