using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

// Mealheiros do grupo. O saldo só muda com dinheiro de verdade: contribuir tira da conta de quem
// contribui, levantar põe na conta de quem levanta, e cada um fica no histórico (movimentos), que é
// de onde vem o "quanto pôs cada um".
internal sealed class PoupancasPartilhadasService(
    IUtilizadoresRepository utilizadores,
    IGruposRepository grupos,
    IGrupoMembrosRepository grupoMembros,
    IPoupancasPartilhadasRepository poupancasPartilhadas,
    IPoupancasPartilhadasMembrosRepository contribuicoes,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IPoupancasPartilhadasService
{
    public async Task<IReadOnlyList<PoupancaPartilhadaDto>> ListarDoGrupoAsync(string uid, string grupoId, CancellationToken ct = default)
    {
        await grupoMembros.ExigirMembroAsync(grupoId, uid, ct);
        var resultado = new List<PoupancaPartilhadaDto>();
        foreach (var p in await poupancasPartilhadas.ListarDoGrupoAsync(grupoId, ct))
        {
            resultado.Add(await ParaDtoAsync(p, ct));
        }

        return resultado;
    }

    public async Task<PoupancaPartilhadaDto> ObterAsync(string uid, string id, CancellationToken ct = default) =>
        await ParaDtoAsync(await ExigirAsync(uid, id, ct), ct);

    public Task<string> CriarAsync(string uid, string grupoId, NovaPoupancaPartilhadaPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            _ = await grupos.ObterAsync(grupoId, c) ?? throw new NaoEncontradoException("Grupo não encontrado.");
            await grupoMembros.ExigirMembroAsync(grupoId, uid, c);
            if (string.IsNullOrWhiteSpace(pedido.Nome)) throw new PedidoInvalidoException("Escreve o nome do mealheiro.");
            var p = new PoupancaPartilhada
            {
                Id = Ids.Novo(),
                GrupoId = grupoId,
                Nome = pedido.Nome.Trim(),
                Objetivo = pedido.Objetivo is { } objetivo ? Calculos.Centimos(objetivo) : null,
                DataObjetivo = pedido.DataObjetivo,
                CriadoEm = relogio.Agora,
            };
            poupancasPartilhadas.Adicionar(p);
            return p.Id;
        }, ct);

    public Task AlterarAsync(string uid, string id, AlterarPoupancaPartilhadaPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            var p = await ExigirAsync(uid, id, c);
            await grupoMembros.ExigirAdminAsync(p.GrupoId, uid, "Só um admin do grupo pode mudar o nome ou o objetivo do mealheiro.", c);
            if (pedido.Nome is { } nome)
            {
                if (string.IsNullOrWhiteSpace(nome)) throw new PedidoInvalidoException("Escreve o nome do mealheiro.");
                p.Nome = nome.Trim();
            }

            if (pedido.Objetivo is { } objetivo) p.Objetivo = Calculos.Centimos(objetivo);
            if (pedido.DataObjetivo is { } data) p.DataObjetivo = data;
            if (pedido.Limpar?.Contains("objetivo") == true) p.Objetivo = null;
            if (pedido.Limpar?.Contains("dataObjetivo") == true) p.DataObjetivo = null;
            p.AtualizadoEm = relogio.Agora;
        }, ct);

    public Task RemoverAsync(string uid, string id, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            var p = await ExigirAsync(uid, id, c);
            if (p.Saldo != 0m) throw new PedidoInvalidoException("O mealheiro ainda tem dinheiro: levanta-o antes de o apagar.");
            foreach (var m in await poupancasPartilhadas.ListarMovimentosAsync(id, c)) poupancasPartilhadas.RemoverMovimento(m);
            foreach (var contribuicao in await contribuicoes.ListarDaPoupancaAsync(id, c)) contribuicoes.Remover(contribuicao);
            poupancasPartilhadas.Remover(p);
        }, ct);

    public Task ContribuirAsync(string uid, string id, decimal valor, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            var p = await ExigirAsync(uid, id, c);
            var agora = relogio.Agora;
            var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
            Movimentar(p, utilizador, Calculos.Centimos(valor), automatico: false);
        }, ct);

    public Task LevantarAsync(string uid, string id, decimal valor, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            var p = await ExigirAsync(uid, id, c);
            // O dinheiro é de todos: só um admin o tira (para a sua conta), os membros só põem
            await grupoMembros.ExigirAdminAsync(p.GrupoId, uid, "Só um admin do grupo pode levantar dinheiro do mealheiro.", c);
            var quanto = Calculos.Centimos(valor);
            if (quanto > p.Saldo) throw new PedidoInvalidoException("O mealheiro não tem tanto dinheiro.");
            var agora = relogio.Agora;
            var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
            Movimentar(p, utilizador, -quanto, automatico: false);
        }, ct);

    public async Task<IReadOnlyList<MovimentoPoupancaPartilhadaDto>> ListarMovimentosAsync(string uid, string id, CancellationToken ct = default)
    {
        await ExigirAsync(uid, id, ct);
        var lista = await poupancasPartilhadas.ListarMovimentosAsync(id, ct);
        var nomes = await utilizadores.NomesAsync(lista.Select(m => m.Uid), ct);
        return [.. lista.Select(m => new MovimentoPoupancaPartilhadaDto(m.Id, m.Uid, nomes[m.Uid], m.Valor, m.Automatico, m.Data))];
    }

    /// <summary>
    /// Mexe no mealheiro e na conta ao mesmo tempo (valor positivo = da conta para o mealheiro) e
    /// guarda o movimento. Também usado pelas contribuições automáticas.
    /// </summary>
    private void Movimentar(PoupancaPartilhada p, Utilizador utilizador, decimal valor, bool automatico) =>
        Movimentar(poupancasPartilhadas, relogio, p, utilizador, valor, automatico);

    internal static void Movimentar(
        IPoupancasPartilhadasRepository repositorio,
        Relogio relogio,
        PoupancaPartilhada p,
        Utilizador utilizador,
        decimal valor,
        bool automatico)
    {
        var agora = relogio.Agora;
        utilizador.MovimentarSaldo(-valor, agora);
        p.Saldo = Calculos.Centimos(p.Saldo + valor);
        p.AtualizadoEm = agora;
        repositorio.AdicionarMovimento(new MovimentoPoupancaPartilhada
        {
            Id = Ids.Novo(),
            PoupancaPartilhadaId = p.Id,
            Uid = utilizador.Id,
            Valor = valor,
            Automatico = automatico,
            Data = relogio.Hoje,
            Mes = relogio.MesAtual,
            CriadoEm = agora,
        });
    }

    private async Task<PoupancaPartilhada> ExigirAsync(string uid, string id, CancellationToken ct)
    {
        var p = await poupancasPartilhadas.ObterAsync(id, ct) ?? throw new NaoEncontradoException("Mealheiro não encontrado.");
        if (await grupoMembros.ObterAtivoAsync(p.GrupoId, uid, ct) is null) throw new NaoEncontradoException("Mealheiro não encontrado.");
        return p;
    }

    private async Task<PoupancaPartilhadaDto> ParaDtoAsync(PoupancaPartilhada p, CancellationToken ct)
    {
        var movimentos = await poupancasPartilhadas.ListarMovimentosAsync(p.Id, ct);
        var nomes = await utilizadores.NomesAsync(movimentos.Select(m => m.Uid), ct);
        var contribuidores = movimentos
            .GroupBy(m => m.Uid, StringComparer.Ordinal)
            .Select(g => new ContribuidorDto(g.Key, nomes[g.Key], Calculos.Centimos(g.Sum(m => m.Valor))))
            .OrderByDescending(c => c.Total)
            .ToList();
        return new PoupancaPartilhadaDto(p.Id, p.GrupoId, p.Nome, p.Saldo, p.Objetivo, p.DataObjetivo, p.Versao, p.CriadoEm, contribuidores);
    }
}
