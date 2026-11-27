using Financas.DAL.Entidades;
using Microsoft.EntityFrameworkCore;

namespace Financas.DAL.Repositorios;

// Implementações com EF Core.
//   - ObterAsync usa FindAsync, que procura primeiro nas entidades já em memória (incluindo as
//     acabadas de adicionar e ainda não gravadas) e só depois vai à base de dados.
//   - As ordenações por data/hora são feitas em memória (depois do ToListAsync): o SQLite usado
//     nos testes não as sabe fazer em SQL e cada utilizador tem poucos dados.

internal sealed class UtilizadoresRepository(FinancasDbContext db) : IUtilizadoresRepository
{
    public Task<Utilizador?> ObterAsync(string utilizadorId, CancellationToken ct = default) =>
        db.Utilizadores.FindAsync([utilizadorId], ct).AsTask();

    public async Task<Utilizador> ObterOuCriarAsync(string utilizadorId, DateTimeOffset agora, CancellationToken ct = default)
    {
        var utilizador = await ObterAsync(utilizadorId, ct);
        if (utilizador is not null)
        {
            return utilizador;
        }

        // Se dois pedidos o criarem ao mesmo tempo, o segundo falha com chave repetida e a
        // UnitOfWork repete a operação (que da segunda vez já o encontra)
        utilizador = new Utilizador { Id = utilizadorId, CriadoEm = agora };
        db.Utilizadores.Add(utilizador);
        return utilizador;
    }

    public void ReservarParaAlteracao(Utilizador utilizador)
    {
        var entrada = db.Entry(utilizador);
        if (entrada.State == EntityState.Unchanged)
        {
            // Só a Versao fica marcada: UPDATE "Utilizadores" SET "Versao" = v+1 WHERE "Id" = .. AND "Versao" = v
            entrada.Property(u => u.Versao).IsModified = true;
        }
    }
}

internal sealed class DespesasFixasRepository(FinancasDbContext db) : IDespesasFixasRepository
{
    public async Task<List<DespesaFixa>> ListarAsync(string utilizadorId, CancellationToken ct = default)
    {
        var despesas = await db.DespesasFixas.Where(d => d.UtilizadorId == utilizadorId).ToListAsync(ct);
        return [.. despesas.OrderBy(d => d.CriadoEm).ThenBy(d => d.Id, StringComparer.Ordinal)];
    }

    public Task<DespesaFixa?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default) =>
        db.DespesasFixas.FindAsync([utilizadorId, id], ct).AsTask();

    public Task<bool> ExistemAsync(string utilizadorId, CancellationToken ct = default) =>
        db.DespesasFixas.AnyAsync(d => d.UtilizadorId == utilizadorId, ct);

    public void Adicionar(DespesaFixa despesa) => db.DespesasFixas.Add(despesa);

    public void Remover(DespesaFixa despesa) => db.DespesasFixas.Remove(despesa);
}

internal sealed class PagamentosRepository(FinancasDbContext db) : IPagamentosRepository
{
    public Task<List<PagamentoFixa>> ListarDoMesAsync(string utilizadorId, string mes, CancellationToken ct = default) =>
        db.PagamentosFixas.Where(p => p.UtilizadorId == utilizadorId && p.Mes == mes).OrderBy(p => p.Id).ToListAsync(ct);

    public Task<List<PagamentoFixa>> ListarDaDespesaAsync(string utilizadorId, string fixaId, CancellationToken ct = default) =>
        db.PagamentosFixas.Where(p => p.UtilizadorId == utilizadorId && p.FixaId == fixaId).OrderBy(p => p.Mes).ToListAsync(ct);

    public Task<List<PagamentoFixa>> ListarAsync(string utilizadorId, CancellationToken ct = default) =>
        db.PagamentosFixas.Where(p => p.UtilizadorId == utilizadorId).OrderBy(p => p.Id).ToListAsync(ct);

    public Task<PagamentoFixa?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default) =>
        db.PagamentosFixas.FindAsync([utilizadorId, id], ct).AsTask();

    public Task<bool> ExisteDaDespesaAsync(string utilizadorId, string fixaId, CancellationToken ct = default) =>
        db.PagamentosFixas.AnyAsync(p => p.UtilizadorId == utilizadorId && p.FixaId == fixaId, ct);

    public Task<bool> ExistemAsync(string utilizadorId, CancellationToken ct = default) =>
        db.PagamentosFixas.AnyAsync(p => p.UtilizadorId == utilizadorId, ct);

    public void Adicionar(PagamentoFixa pagamento) => db.PagamentosFixas.Add(pagamento);
    public void Remover(PagamentoFixa pagamento) => db.PagamentosFixas.Remove(pagamento);
}

internal sealed class DespesasExtrasRepository(FinancasDbContext db) : IDespesasExtrasRepository
{
    public async Task<List<DespesaExtra>> ListarAsync(string utilizadorId, CancellationToken ct = default)
    {
        var despesas = await db.DespesasExtras.Where(d => d.UtilizadorId == utilizadorId).ToListAsync(ct);
        return [.. despesas.OrderBy(d => d.CriadoEm).ThenBy(d => d.Id, StringComparer.Ordinal)];
    }

    public async Task<List<DespesaExtra>> ListarDoMesAsync(string utilizadorId, string mes, CancellationToken ct = default)
    {
        var despesas = await db.DespesasExtras.Where(d => d.UtilizadorId == utilizadorId && d.Mes == mes).ToListAsync(ct);
        return
        [
            .. despesas
                .OrderByDescending(d => d.Data ?? DateOnly.MinValue)
                .ThenByDescending(d => d.CriadoEm)
                .ThenBy(d => d.Id, StringComparer.Ordinal),
        ];
    }

    public Task<DespesaExtra?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default) =>
        db.DespesasExtras.FindAsync([utilizadorId, id], ct).AsTask();

    public Task<bool> ExistemAsync(string utilizadorId, CancellationToken ct = default) =>
        db.DespesasExtras.AnyAsync(d => d.UtilizadorId == utilizadorId, ct);

    public Task<DespesaExtra?> ObterPorChaveIdempotenciaAsync(string utilizadorId, string chave, CancellationToken ct = default) =>
        db.DespesasExtras.FirstOrDefaultAsync(d => d.UtilizadorId == utilizadorId && d.ChaveIdempotencia == chave, ct);

    public Task<List<DespesaExtra>> ListarEntreAsync(string utilizadorId, DateOnly? de, DateOnly? ate, CancellationToken ct = default)
    {
        var consulta = db.DespesasExtras.Where(d => d.UtilizadorId == utilizadorId);
        if (de is { } inicio) consulta = consulta.Where(d => d.Data >= inicio);
        if (ate is { } fim) consulta = consulta.Where(d => d.Data <= fim);
        return consulta.ToListAsync(ct);
    }

    public async Task<HashSet<DateOnly>> DiasGeradosAsync(string utilizadorId, string gastoRecorrenteId, DateOnly desde, CancellationToken ct = default)
    {
        var dias = await db.DespesasExtras
            .Where(d => d.UtilizadorId == utilizadorId && d.GastoRecorrenteId == gastoRecorrenteId && d.DataOcorrencia >= desde)
            .Select(d => d.DataOcorrencia!.Value)
            .ToListAsync(ct);
        return [.. dias];
    }

    public void Adicionar(DespesaExtra despesa) => db.DespesasExtras.Add(despesa);

    public void Remover(DespesaExtra despesa) => db.DespesasExtras.Remove(despesa);
}

internal sealed class PoupancasRepository(FinancasDbContext db) : IPoupancasRepository
{
    public Task<List<Poupanca>> ListarAsync(string utilizadorId, CancellationToken ct = default) =>
        db.Poupancas.Where(p => p.UtilizadorId == utilizadorId).ToListAsync(ct);

    public Task<Poupanca?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default) =>
        db.Poupancas.FindAsync([utilizadorId, id], ct).AsTask();

    public Task<bool> ExistemAsync(string utilizadorId, CancellationToken ct = default) =>
        db.Poupancas.AnyAsync(p => p.UtilizadorId == utilizadorId, ct);

    public void Adicionar(Poupanca poupanca) => db.Poupancas.Add(poupanca);

    public void Remover(Poupanca poupanca) => db.Poupancas.Remove(poupanca);
}

internal sealed class ContribuicoesPoupancaRepository(FinancasDbContext db) : IContribuicoesPoupancaRepository
{
    // Os meses são texto "AAAA-MM": comparar como texto dá a ordem cronológica (na base de dados também)
    public Task<List<ContribuicaoPoupanca>> ListarDesdeAsync(string utilizadorId, string mesInicial, CancellationToken ct = default) =>
        db.ContribuicoesPoupanca
            .Where(c => c.UtilizadorId == utilizadorId && string.Compare(c.Mes, mesInicial) >= 0)
            .ToListAsync(ct);

    public Task<bool> ExisteAsync(string utilizadorId, string poupancaId, string mes, CancellationToken ct = default) =>
        db.ContribuicoesPoupanca.AnyAsync(c => c.UtilizadorId == utilizadorId && c.PoupancaId == poupancaId && c.Mes == mes, ct);

    public void Adicionar(ContribuicaoPoupanca contribuicao) => db.ContribuicoesPoupanca.Add(contribuicao);
}

internal sealed class JurosPoupancaRepository(FinancasDbContext db) : IJurosPoupancaRepository
{
    public async Task<Dictionary<string, decimal>> TotaisPorPoupancaAsync(string utilizadorId, CancellationToken ct = default)
    {
        // A soma é feita cá (e não na base de dados): o SQLite não soma decimais
        var lista = await db.JurosPoupancas.Where(j => j.UtilizadorId == utilizadorId).ToListAsync(ct);
        return lista.GroupBy(j => j.PoupancaId).ToDictionary(g => g.Key, g => g.Sum(j => j.Liquido), StringComparer.Ordinal);
    }

    public void Adicionar(JurosPoupanca juros) => db.JurosPoupancas.Add(juros);
}

internal sealed class DividasRepository(FinancasDbContext db) : IDividasRepository
{
    public Task<List<Divida>> ListarAsync(string utilizadorId, CancellationToken ct = default) =>
        db.Dividas.Where(d => d.UtilizadorId == utilizadorId).ToListAsync(ct);

    public Task<Divida?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default) =>
        db.Dividas.FindAsync([utilizadorId, id], ct).AsTask();

    public Task<bool> ExistemAsync(string utilizadorId, CancellationToken ct = default) =>
        db.Dividas.AnyAsync(d => d.UtilizadorId == utilizadorId, ct);

    public void Adicionar(Divida divida) => db.Dividas.Add(divida);

    public void Remover(Divida divida) => db.Dividas.Remove(divida);
}

internal sealed class MesesRepository(FinancasDbContext db) : IMesesRepository
{
    public Task<ResumoMes?> ObterAsync(string utilizadorId, string mes, CancellationToken ct = default) =>
        db.Meses.FindAsync([utilizadorId, mes], ct).AsTask();

    public Task<List<ResumoMes>> ListarAsync(string utilizadorId, CancellationToken ct = default) =>
        db.Meses.Where(m => m.UtilizadorId == utilizadorId).OrderBy(m => m.Mes).ToListAsync(ct);

    public async Task<ResumoMes> ObterOuCriarAsync(string utilizadorId, string mes, CancellationToken ct = default)
    {
        var resumo = await ObterAsync(utilizadorId, mes, ct);
        if (resumo is null)
        {
            resumo = new ResumoMes { UtilizadorId = utilizadorId, Mes = mes };
            db.Meses.Add(resumo);
        }

        return resumo;
    }

    public void Remover(ResumoMes resumo) => db.Meses.Remove(resumo);
}

internal sealed class OrcamentosRepository(FinancasDbContext db) : IOrcamentosRepository
{
    public Task<List<Orcamento>> ListarAsync(string utilizadorId, CancellationToken ct = default) =>
        db.Orcamentos.Where(o => o.UtilizadorId == utilizadorId).OrderBy(o => o.Categoria).ToListAsync(ct);

    public Task<Orcamento?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default) =>
        db.Orcamentos.FindAsync([utilizadorId, id], ct).AsTask();

    // Primeiro os que já estão em memória (ex.: acabado de adicionar na mesma transação)
    public async Task<Orcamento?> ObterDaCategoriaAsync(string utilizadorId, string categoria, CancellationToken ct = default) =>
        db.Orcamentos.Local.FirstOrDefault(o => o.UtilizadorId == utilizadorId && o.Categoria == categoria)
        ?? await db.Orcamentos.FirstOrDefaultAsync(o => o.UtilizadorId == utilizadorId && o.Categoria == categoria, ct);

    public void Adicionar(Orcamento orcamento) => db.Orcamentos.Add(orcamento);

    public void Remover(Orcamento orcamento) => db.Orcamentos.Remove(orcamento);
}

internal sealed class ObjetivosRepository(FinancasDbContext db) : IObjetivosRepository
{
    public async Task<List<ObjetivoPoupanca>> ListarAsync(string utilizadorId, CancellationToken ct = default)
    {
        var objetivos = await db.Objetivos.Where(o => o.UtilizadorId == utilizadorId).ToListAsync(ct);
        return [.. objetivos.OrderBy(o => o.CriadoEm).ThenBy(o => o.Id, StringComparer.Ordinal)];
    }

    public Task<ObjetivoPoupanca?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default) =>
        db.Objetivos.FindAsync([utilizadorId, id], ct).AsTask();

    public Task<List<ObjetivoPoupanca>> ListarDaPoupancaAsync(string utilizadorId, string poupancaId, CancellationToken ct = default) =>
        db.Objetivos.Where(o => o.UtilizadorId == utilizadorId && o.PoupancaId == poupancaId).ToListAsync(ct);

    public void Adicionar(ObjetivoPoupanca objetivo) => db.Objetivos.Add(objetivo);

    public void Remover(ObjetivoPoupanca objetivo) => db.Objetivos.Remove(objetivo);
}

internal sealed class GastosRecorrentesRepository(FinancasDbContext db) : IGastosRecorrentesRepository
{
    public async Task<List<GastoRecorrente>> ListarAsync(string utilizadorId, CancellationToken ct = default)
    {
        var gastos = await db.GastosRecorrentes.Where(g => g.UtilizadorId == utilizadorId).ToListAsync(ct);
        return [.. gastos.OrderBy(g => g.CriadoEm).ThenBy(g => g.Id, StringComparer.Ordinal)];
    }

    public Task<GastoRecorrente?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default) =>
        db.GastosRecorrentes.FindAsync([utilizadorId, id], ct).AsTask();

    public void Adicionar(GastoRecorrente gasto) => db.GastosRecorrentes.Add(gasto);

    public void Remover(GastoRecorrente gasto) => db.GastosRecorrentes.Remove(gasto);
}

internal sealed class RegistosAlteracaoRepository(FinancasDbContext db) : IRegistosAlteracaoRepository
{
    public async Task<(List<RegistoAlteracao> Itens, int Total)> ListarAsync(
        string utilizadorId,
        string? entidade,
        DateTime? desdeUtc,
        int pagina,
        int tamanho,
        CancellationToken ct = default)
    {
        var consulta = db.RegistosAlteracao.AsNoTracking().Where(r => r.UtilizadorId == utilizadorId);
        if (!string.IsNullOrEmpty(entidade)) consulta = consulta.Where(r => r.Entidade == entidade);
        if (desdeUtc is { } desde) consulta = consulta.Where(r => r.Quando >= desde);

        var total = await consulta.CountAsync(ct);
        var itens = await consulta
            .OrderByDescending(r => r.Quando)
            .ThenBy(r => r.Id)
            .Skip((pagina - 1) * tamanho)
            .Take(tamanho)
            .ToListAsync(ct);
        return (itens, total);
    }

    public Task<int> ApagarAnterioresAsync(string utilizadorId, DateTime limiteUtc, CancellationToken ct = default) =>
        db.RegistosAlteracao.Where(r => r.UtilizadorId == utilizadorId && r.Quando < limiteUtc).ExecuteDeleteAsync(ct);
}

internal sealed class ParceirosConvitesRepository(FinancasDbContext db) : IParceirosConvitesRepository
{
    public Task<ParceiroConvite?> ObterAsync(string id, CancellationToken ct = default) =>
        db.ParceirosConvites.FindAsync([id], ct).AsTask();

    public async Task<List<ParceiroConvite>> ListarPendentesDoEmailAsync(string emailNormalizado, CancellationToken ct = default)
    {
        var convites = await db.ParceirosConvites
            .Where(c => c.Email == emailNormalizado && c.Estado == EstadoConvite.Pendente)
            .ToListAsync(ct);
        return [.. convites.OrderByDescending(c => c.CriadoEm)];
    }

    public async Task<List<ParceiroConvite>> ListarRecebidosPendentesAsync(string emailNormalizado, CancellationToken ct = default)
    {
        var convites = await db.ParceirosConvites
            .Where(c => c.Email == emailNormalizado && c.Estado == EstadoConvite.Pendente)
            .ToListAsync(ct);
        return [.. convites.OrderByDescending(c => c.CriadoEm)];
    }

    public Task<List<ParceiroConvite>> ListarDoGrupoAsync(string grupoId, CancellationToken ct = default) =>
        db.ParceirosConvites.Where(c => c.GrupoId == grupoId).ToListAsync(ct);

    public void Adicionar(ParceiroConvite convite) => db.ParceirosConvites.Add(convite);
    public void Remover(ParceiroConvite convite) => db.ParceirosConvites.Remove(convite);
}

internal sealed class GruposRepository(FinancasDbContext db) : IGruposRepository
{
    public Task<Grupo?> ObterAsync(string id, CancellationToken ct = default) =>
        db.Grupos.FindAsync([id], ct).AsTask();

    public async Task<List<Grupo>> ListarDoUtilizadorAsync(string uid, CancellationToken ct = default)
    {
        var ids = await db.GruposMembros
            .Where(m => m.Uid == uid && m.SaidaEm == null)
            .Select(m => m.GrupoId)
            .ToListAsync(ct);
        var grupos = await db.Grupos.Where(g => ids.Contains(g.Id)).ToListAsync(ct);
        return [.. grupos.OrderBy(g => g.CriadoEm).ThenBy(g => g.Id, StringComparer.Ordinal)];
    }

    public void Adicionar(Grupo grupo) => db.Grupos.Add(grupo);
    public void Remover(Grupo grupo) => db.Grupos.Remove(grupo);
}

internal sealed class GrupoMembrosRepository(FinancasDbContext db) : IGrupoMembrosRepository
{
    public Task<GrupoMembro?> ObterAtivoAsync(string grupoId, string uid, CancellationToken ct = default) =>
        db.GruposMembros.FirstOrDefaultAsync(m => m.GrupoId == grupoId && m.Uid == uid && m.SaidaEm == null, ct);

    public Task<GrupoMembro?> ObterInclusiveSaidosAsync(string grupoId, string uid, CancellationToken ct = default) =>
        db.GruposMembros.FirstOrDefaultAsync(m => m.GrupoId == grupoId && m.Uid == uid, ct);

    public async Task<List<GrupoMembro>> ListarDoGrupoAsync(string grupoId, CancellationToken ct = default)
    {
        var membros = await db.GruposMembros.Where(m => m.GrupoId == grupoId).ToListAsync(ct);
        return [.. membros.OrderBy(m => m.EntradaEm).ThenBy(m => m.Uid, StringComparer.Ordinal)];
    }

    public void Adicionar(GrupoMembro membro) => db.GruposMembros.Add(membro);
    public void Remover(GrupoMembro membro) => db.GruposMembros.Remove(membro);
}

internal sealed class PoupancasPartilhadasRepository(FinancasDbContext db) : IPoupancasPartilhadasRepository
{
    public Task<PoupancaPartilhada?> ObterAsync(string id, CancellationToken ct = default) =>
        db.PoupancasPartilhadas.FindAsync([id], ct).AsTask();

    public Task<List<PoupancaPartilhada>> ListarDoGrupoAsync(string grupoId, CancellationToken ct = default) =>
        ListarDosGruposAsync([grupoId], ct);

    public async Task<List<PoupancaPartilhada>> ListarDosGruposAsync(IReadOnlyCollection<string> gruposIds, CancellationToken ct = default)
    {
        var lista = await db.PoupancasPartilhadas.Where(p => gruposIds.Contains(p.GrupoId)).ToListAsync(ct);
        return [.. lista.OrderBy(p => p.CriadoEm).ThenBy(p => p.Id, StringComparer.Ordinal)];
    }

    public void Adicionar(PoupancaPartilhada poupanca) => db.PoupancasPartilhadas.Add(poupanca);
    public void Remover(PoupancaPartilhada poupanca) => db.PoupancasPartilhadas.Remove(poupanca);

    public Task<List<MovimentoPoupancaPartilhada>> ListarMovimentosAsync(string poupancaPartilhadaId, CancellationToken ct = default) =>
        ListarMovimentosDasPoupancasAsync([poupancaPartilhadaId], ct);

    public async Task<List<MovimentoPoupancaPartilhada>> ListarMovimentosDasPoupancasAsync(
        IReadOnlyCollection<string> poupancasIds,
        CancellationToken ct = default)
    {
        var lista = await db.MovimentosPoupancasPartilhadas.Where(m => poupancasIds.Contains(m.PoupancaPartilhadaId)).ToListAsync(ct);
        return [.. lista.OrderByDescending(m => m.Data).ThenByDescending(m => m.CriadoEm)];
    }

    public void AdicionarMovimento(MovimentoPoupancaPartilhada movimento) => db.MovimentosPoupancasPartilhadas.Add(movimento);
    public void RemoverMovimento(MovimentoPoupancaPartilhada movimento) => db.MovimentosPoupancasPartilhadas.Remove(movimento);
}

internal sealed class PoupancasPartilhadasMembrosRepository(FinancasDbContext db) : IPoupancasPartilhadasMembrosRepository
{
    public Task<PoupancaPartilhadaMembro?> ObterAsync(string id, CancellationToken ct = default) =>
        db.PoupancasPartilhadasMembros.FindAsync([id], ct).AsTask();

    public Task<PoupancaPartilhadaMembro?> ObterDoMembroAsync(string poupancaPartilhadaId, string membroUid, CancellationToken ct = default) =>
        db.PoupancasPartilhadasMembros.FirstOrDefaultAsync(m => m.PoupancaPartilhadaId == poupancaPartilhadaId && m.MembroUid == membroUid, ct);

    public async Task<List<PoupancaPartilhadaMembro>> ListarDaPoupancaAsync(string poupancaPartilhadaId, CancellationToken ct = default)
    {
        var membros = await db.PoupancasPartilhadasMembros.Where(m => m.PoupancaPartilhadaId == poupancaPartilhadaId).ToListAsync(ct);
        return [.. membros.OrderBy(m => m.CriadoEm)];
    }

    public async Task<List<PoupancaPartilhadaMembro>> ListarDoMembroAsync(string membroUid, CancellationToken ct = default)
    {
        var membros = await db.PoupancasPartilhadasMembros.Where(m => m.MembroUid == membroUid).ToListAsync(ct);
        return [.. membros.OrderBy(m => m.CriadoEm)];
    }

    public void Adicionar(PoupancaPartilhadaMembro contribuicao) => db.PoupancasPartilhadasMembros.Add(contribuicao);
    public void Remover(PoupancaPartilhadaMembro contribuicao) => db.PoupancasPartilhadasMembros.Remove(contribuicao);
}

internal sealed class DespesasPartilhadasRepository(FinancasDbContext db) : IDespesasPartilhadasRepository
{
    public Task<DespesaPartilhada?> ObterAsync(string id, CancellationToken ct = default) =>
        db.DespesasPartilhadas.FindAsync([id], ct).AsTask();

    public Task<DespesaPartilhada?> ObterDoPagamentoFixaAsync(string pagamentoFixaId, CancellationToken ct = default) =>
        db.DespesasPartilhadas.FirstOrDefaultAsync(d => d.PagamentoFixaId == pagamentoFixaId, ct);

    public Task<List<DespesaPartilhada>> ListarDoGrupoAsync(string grupoId, CancellationToken ct = default) =>
        ListarDosGruposAsync([grupoId], ct);

    public async Task<List<DespesaPartilhada>> ListarDosGruposAsync(IReadOnlyCollection<string> gruposIds, CancellationToken ct = default)
    {
        var lista = await db.DespesasPartilhadas.Where(d => gruposIds.Contains(d.GrupoId)).ToListAsync(ct);
        return [.. lista.OrderByDescending(d => d.Data).ThenByDescending(d => d.CriadoEm)];
    }

    public Task<List<ParteDespesaPartilhada>> ListarPartesAsync(string despesaPartilhadaId, CancellationToken ct = default) =>
        db.PartesDespesasPartilhadas.Where(p => p.DespesaPartilhadaId == despesaPartilhadaId).ToListAsync(ct);

    public Task<List<ParteDespesaPartilhada>> ListarPartesDasDespesasAsync(IReadOnlyCollection<string> despesasIds, CancellationToken ct = default) =>
        db.PartesDespesasPartilhadas.Where(p => despesasIds.Contains(p.DespesaPartilhadaId)).ToListAsync(ct);

    public async Task<List<(DespesaPartilhada Despesa, ParteDespesaPartilhada Parte)>> ListarPartesPorAceitarAsync(string uid, CancellationToken ct = default)
    {
        var lista = await (
            from p in db.PartesDespesasPartilhadas
            join d in db.DespesasPartilhadas on p.DespesaPartilhadaId equals d.Id
            where p.Uid == uid && p.Estado == EstadoParte.Pendente && d.PagadorUid != uid
            select new { Despesa = d, Parte = p }).ToListAsync(ct);
        return [.. lista.OrderByDescending(x => x.Despesa.Data).ThenByDescending(x => x.Despesa.CriadoEm).Select(x => (x.Despesa, x.Parte))];
    }

    public void Adicionar(DespesaPartilhada despesa) => db.DespesasPartilhadas.Add(despesa);
    public void Remover(DespesaPartilhada despesa) => db.DespesasPartilhadas.Remove(despesa);
    public void AdicionarParte(ParteDespesaPartilhada parte) => db.PartesDespesasPartilhadas.Add(parte);
    public void RemoverParte(ParteDespesaPartilhada parte) => db.PartesDespesasPartilhadas.Remove(parte);

    public Task<AcertoPartilhado?> ObterAcertoAsync(string id, CancellationToken ct = default) =>
        db.AcertosPartilhados.FindAsync([id], ct).AsTask();

    public async Task<List<AcertoPartilhado>> ListarAcertosDosGruposAsync(IReadOnlyCollection<string> gruposIds, CancellationToken ct = default)
    {
        var lista = await db.AcertosPartilhados.Where(a => gruposIds.Contains(a.GrupoId)).ToListAsync(ct);
        return [.. lista.OrderByDescending(a => a.Data).ThenByDescending(a => a.CriadoEm)];
    }

    public async Task<List<AcertoPartilhado>> ListarAcertosPorConfirmarAsync(string paraUid, CancellationToken ct = default)
    {
        var lista = await db.AcertosPartilhados.Where(a => a.ParaUid == paraUid && a.ConfirmadoEm == null).ToListAsync(ct);
        return [.. lista.OrderByDescending(a => a.Data).ThenByDescending(a => a.CriadoEm)];
    }

    public void AdicionarAcerto(AcertoPartilhado acerto) => db.AcertosPartilhados.Add(acerto);
    public void RemoverAcerto(AcertoPartilhado acerto) => db.AcertosPartilhados.Remove(acerto);
}

internal sealed class RegrasCategoriaRepository(FinancasDbContext db) : IRegrasCategoriaRepository
{
    public async Task<List<RegraCategoria>> ListarAsync(string utilizadorId, CancellationToken ct = default)
    {
        var regras = await db.RegrasCategoria.Where(r => r.UtilizadorId == utilizadorId).ToListAsync(ct);
        return [.. regras.OrderBy(r => r.CriadoEm).ThenBy(r => r.Id, StringComparer.Ordinal)];
    }

    public Task<RegraCategoria?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default) =>
        db.RegrasCategoria.FindAsync([utilizadorId, id], ct).AsTask();

    public void Adicionar(RegraCategoria regra) => db.RegrasCategoria.Add(regra);

    public void Remover(RegraCategoria regra) => db.RegrasCategoria.Remove(regra);
}

internal sealed class DispositivosPushRepository(FinancasDbContext db) : IDispositivosPushRepository
{
    public async Task<List<DispositivoPush>> ListarAsync(string utilizadorId, CancellationToken ct = default)
    {
        var lista = await db.DispositivosPush.Where(d => d.UtilizadorId == utilizadorId).ToListAsync(ct);
        return [.. lista.OrderBy(d => d.CriadoEm).ThenBy(d => d.Id, StringComparer.Ordinal)];
    }

    public Task<DispositivoPush?> ObterPorTokenAsync(string token, CancellationToken ct = default) =>
        db.DispositivosPush.FirstOrDefaultAsync(d => d.Token == token, ct);

    public Task<List<string>> ListarUtilizadoresComDispositivosAsync(CancellationToken ct = default) =>
        db.DispositivosPush.Select(d => d.UtilizadorId).Distinct().OrderBy(u => u).ToListAsync(ct);

    public void Adicionar(DispositivoPush dispositivo) => db.DispositivosPush.Add(dispositivo);
    public void Remover(DispositivoPush dispositivo) => db.DispositivosPush.Remove(dispositivo);
}

internal sealed class AlertasEnviadosRepository(FinancasDbContext db) : IAlertasEnviadosRepository
{
    public async Task<HashSet<string>> ListarEnviadosAsync(string utilizadorId, IReadOnlyCollection<string> chaves, CancellationToken ct = default)
    {
        var enviados = await db.AlertasEnviados
            .Where(a => a.UtilizadorId == utilizadorId && chaves.Contains(a.Chave))
            .Select(a => a.Chave)
            .ToListAsync(ct);
        return [.. enviados];
    }

    public void Adicionar(AlertaEnviado enviado) => db.AlertasEnviados.Add(enviado);

    // Compara-se em memória: o SQLite não compara DateOnly em SQL de forma fiável (como o resto da DAL)
    public async Task<int> ApagarAnterioresAsync(DateOnly antesDe, CancellationToken ct = default)
    {
        var antigos = (await db.AlertasEnviados.ToListAsync(ct)).Where(a => a.Dia < antesDe).ToList();
        db.AlertasEnviados.RemoveRange(antigos);
        return antigos.Count;
    }
}
