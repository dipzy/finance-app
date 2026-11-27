using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

// A contribuição de cada membro para um mealheiro: um valor por mês, automático (no dia do salário
// ou num dia fixo) ou manual (só um lembrete: a pessoa contribui quando quer). Todos os membros veem
// as contribuições de todos. O valor é guardado em cêntimos (long) e mostrado em euros.
internal sealed class PoupancasPartilhadasMembrosService(
    IGrupoMembrosRepository grupoMembros,
    IPoupancasPartilhadasRepository poupancasPartilhadas,
    IPoupancasPartilhadasMembrosRepository contribuicoes,
    IUtilizadoresRepository utilizadores,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IPoupancasPartilhadasMembrosService
{
    public async Task<IReadOnlyList<PoupancaPartilhadaMembroDto>> ListarDaPoupancaAsync(string uid, string poupancaPartilhadaId, CancellationToken ct = default)
    {
        await ExigirPoupancaAsync(uid, poupancaPartilhadaId, ct);
        return await ParaDtosAsync(await contribuicoes.ListarDaPoupancaAsync(poupancaPartilhadaId, ct), ct);
    }

    public async Task<IReadOnlyList<PoupancaPartilhadaMembroDto>> ListarDoMembroAsync(string uid, CancellationToken ct = default) =>
        await ParaDtosAsync(await contribuicoes.ListarDoMembroAsync(uid, ct), ct);

    public Task<string> GuardarAsync(string uid, string poupancaPartilhadaId, NovaPoupancaPartilhadaMembroPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            await ExigirPoupancaAsync(uid, poupancaPartilhadaId, c);
            if (!Enum.IsDefined(pedido.Tipo)) throw new PedidoInvalidoException("Tipo de contribuição desconhecido.");
            var centimos = (long)(Calculos.Centimos(pedido.Valor) * 100m);
            if (centimos <= 0) throw new PedidoInvalidoException("O valor da contribuição tem de ser maior que zero.");

            var automatica = pedido.Tipo == TipoContribuicaoPartilhada.Automatica;
            int? diaFixo = automatica && !pedido.DiaDoSalario ? pedido.DiaFixo : null;
            if (automatica && !pedido.DiaDoSalario && diaFixo is null)
            {
                throw new PedidoInvalidoException("Tens de indicar o dia fixo para contribuição automática em dia fixo.");
            }

            var agora = relogio.Agora;
            var existente = await contribuicoes.ObterDoMembroAsync(poupancaPartilhadaId, uid, c);
            var contribuicao = existente ?? new PoupancaPartilhadaMembro
            {
                Id = Ids.Novo(),
                PoupancaPartilhadaId = poupancaPartilhadaId,
                MembroUid = uid,
                CriadoEm = agora,
            };
            contribuicao.Valor = centimos;
            contribuicao.Tipo = pedido.Tipo;
            contribuicao.DiaDoSalario = pedido.DiaDoSalario;
            contribuicao.DiaFixo = diaFixo;
            contribuicao.AtualizadoEm = existente is null ? null : agora;

            // Nova automática cujo dia deste mês já passou: começa no próximo mês (e não já hoje,
            // de surpresa). Quem quiser pôr dinheiro agora contribui à mão
            if (existente is null && automatica)
            {
                var utilizador = await utilizadores.ObterAsync(uid, c);
                if (DiaDoMes(contribuicao, utilizador) is { } dia && Calculos.DiaEfetivo(dia, relogio.Hoje) < relogio.Hoje.Day)
                {
                    contribuicao.UltimaContribuicaoMes = relogio.MesAtual;
                }
            }

            if (existente is null) contribuicoes.Adicionar(contribuicao);
            return contribuicao.Id;
        }, ct);

    public Task RemoverAsync(string uid, string poupancaPartilhadaId, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            await ExigirPoupancaAsync(uid, poupancaPartilhadaId, c);
            if (await contribuicoes.ObterDoMembroAsync(poupancaPartilhadaId, uid, c) is { } contribuicao)
            {
                contribuicoes.Remover(contribuicao);
            }
        }, ct);

    public async Task<decimal> ProcessarContribuicoesAutomaticasAsync(string uid, CancellationToken ct = default)
    {
        var hoje = relogio.Hoje;
        var mes = Meses.De(hoje);
        var utilizador = await utilizadores.ObterAsync(uid, ct);
        var total = 0m;

        foreach (var candidata in (await contribuicoes.ListarDoMembroAsync(uid, ct)).Where(c => Devida(c, utilizador, hoje, mes)))
        {
            total += await unitOfWork.ExecuteInTransactionAsync(
                async c =>
                {
                    // Outra vez dentro da transação: dois pedidos ao mesmo tempo não contribuem duas vezes
                    // (o segundo vê o mês já marcado, ou choca na Versao e repete)
                    var atual = await contribuicoes.ObterAsync(candidata.Id, c);
                    var eu = await utilizadores.ObterAsync(uid, c);
                    if (atual is null || eu is null || !Devida(atual, eu, hoje, mes)) return 0m;

                    var p = await poupancasPartilhadas.ObterAsync(atual.PoupancaPartilhadaId, c);
                    if (p is null || await grupoMembros.ObterAtivoAsync(p.GrupoId, uid, c) is null) return 0m;

                    var valor = atual.Valor / 100m;
                    // Sem dinheiro na conta não contribui (tenta outra vez nos dias seguintes)
                    if (Calculos.Centimos(eu.Saldo) < valor) return 0m;

                    PoupancasPartilhadasService.Movimentar(poupancasPartilhadas, relogio, p, eu, valor, automatico: true);
                    atual.UltimaContribuicaoMes = mes;
                    atual.AtualizadoEm = relogio.Agora;
                    return valor;
                },
                ct);
        }

        return Calculos.Centimos(total);
    }

    public Task MarcarFeitaAsync(string uid, string poupancaPartilhadaId, bool feita, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            await ExigirPoupancaAsync(uid, poupancaPartilhadaId, c);
            var contribuicao = await contribuicoes.ObterDoMembroAsync(poupancaPartilhadaId, uid, c)
                ?? throw new NaoEncontradoException("Ainda não tens uma contribuição mensal neste mealheiro.");
            // As automáticas usam este campo para não contribuírem duas vezes: não se mexe
            if (contribuicao.Tipo == TipoContribuicaoPartilhada.Automatica)
            {
                throw new PedidoInvalidoException("As contribuições automáticas fazem-se sozinhas no dia certo.");
            }

            var mes = relogio.MesAtual;
            if (feita) contribuicao.UltimaContribuicaoMes = mes;
            else if (contribuicao.UltimaContribuicaoMes == mes) contribuicao.UltimaContribuicaoMes = null;
            contribuicao.AtualizadoEm = relogio.Agora;
        }, ct);

    // O que falta pôr este mês: as contribuições que ainda não foram feitas, dos mealheiros dos grupos onde ainda está
    public async Task<decimal> ValorPorEnviarNoMesAsync(string uid, CancellationToken ct = default)
    {
        var minhas = await contribuicoes.ListarDoMembroAsync(uid, ct);
        if (minhas.Count == 0)
        {
            return 0m;
        }

        var movimentos = await MovimentosDoMesAsync(minhas.Select(c => c.PoupancaPartilhadaId), ct);
        var total = 0m;
        foreach (var c in minhas.Where(c => FaltaNoMes(c, movimentos) > 0m))
        {
            var p = await poupancasPartilhadas.ObterAsync(c.PoupancaPartilhadaId, ct);
            if (p is not null && await grupoMembros.ObterAtivoAsync(p.GrupoId, uid, ct) is not null)
            {
                total += FaltaNoMes(c, movimentos);
            }
        }

        return Calculos.Centimos(total);
    }

    // Os movimentos (entradas) deste mês destes mealheiros
    private async Task<List<MovimentoPoupancaPartilhada>> MovimentosDoMesAsync(IEnumerable<string> poupancasIds, CancellationToken ct)
    {
        var mes = relogio.MesAtual;
        return [.. (await poupancasPartilhadas.ListarMovimentosDasPoupancasAsync([.. poupancasIds.Distinct(StringComparer.Ordinal)], ct)).Where(m => m.Mes == mes && m.Valor > 0m)];
    }

    // Quanto falta pôr este mês: nada se já foi processada ou marcada; senão o valor mensal menos o que o membro já pôs
    // este mês nesse mealheiro (entradas à mão)
    private decimal FaltaNoMes(PoupancaPartilhadaMembro c, IReadOnlyCollection<MovimentoPoupancaPartilhada> movimentosDoMes)
    {
        if (c.UltimaContribuicaoMes == relogio.MesAtual) return 0m;
        var posto = movimentosDoMes.Where(m => m.PoupancaPartilhadaId == c.PoupancaPartilhadaId && m.Uid == c.MembroUid).Sum(m => m.Valor);
        return Math.Max(0m, Calculos.Centimos(c.Valor / 100m - posto));
    }

    private bool FeitaEsteMes(PoupancaPartilhadaMembro c, IReadOnlyCollection<MovimentoPoupancaPartilhada> movimentosDoMes) =>
        FaltaNoMes(c, movimentosDoMes) == 0m;

    // Automática, ainda não feita este mês e o dia (do salário ou fixo) já chegou
    private static bool Devida(PoupancaPartilhadaMembro c, Utilizador? utilizador, DateOnly hoje, string mes) =>
        c.Tipo == TipoContribuicaoPartilhada.Automatica
        && c.UltimaContribuicaoMes != mes
        && DiaDoMes(c, utilizador) is { } dia
        && Calculos.DiaEfetivo(dia, hoje) <= hoje.Day;

    private static int? DiaDoMes(PoupancaPartilhadaMembro c, Utilizador? utilizador) =>
        c.DiaDoSalario ? utilizador?.Salario?.DiaRecebimento : c.DiaFixo;

    private async Task ExigirPoupancaAsync(string uid, string poupancaPartilhadaId, CancellationToken ct)
    {
        var p = await poupancasPartilhadas.ObterAsync(poupancaPartilhadaId, ct) ?? throw new NaoEncontradoException("Mealheiro não encontrado.");
        if (await grupoMembros.ObterAtivoAsync(p.GrupoId, uid, ct) is null) throw new NaoEncontradoException("Mealheiro não encontrado.");
    }

    private async Task<IReadOnlyList<PoupancaPartilhadaMembroDto>> ParaDtosAsync(IEnumerable<PoupancaPartilhadaMembro> lista, CancellationToken ct)
    {
        var todas = lista.ToList();
        var nomes = await utilizadores.NomesAsync(todas.Select(m => m.MembroUid), ct);
        var movimentos = await MovimentosDoMesAsync(todas.Select(m => m.PoupancaPartilhadaId), ct);
        return
        [
            .. todas.Select(m => new PoupancaPartilhadaMembroDto(
                m.Id, m.PoupancaPartilhadaId, m.MembroUid, nomes[m.MembroUid], m.Valor / 100m, m.Tipo,
                m.DiaDoSalario, m.DiaFixo, m.UltimaContribuicaoMes, m.Versao, m.CriadoEm, FeitaEsteMes(m, movimentos))),
        ];
    }
}
