using Financas.DAL;
using Financas.DAL.Auditoria;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Interfaces;

namespace Financas.Services;

// Apagar a conta e os dados (RGPD). Tudo numa transação: ou desaparece tudo o que é do utilizador ou nada.
//
// O que é só do utilizador (despesas, poupanças, dívidas, ...) apaga-se em bloco (IContaDadosRepository).
// O que é partilhado com outras pessoas trata-se grupo a grupo:
//   - sozinho no grupo (os outros já saíram): o grupo desaparece todo;
//   - com mais gente: o grupo e os dados dos outros ficam. O utilizador sai (se era o único admin, o
//     membro ativo mais antigo passa a admin) e o que as contas do grupo guardam em nome dele passa a um
//     identificador anónimo (as despesas que pagou, as partes, os acertos, os movimentos dos mealheiros).
//     Assim os saldos dos outros continuam certos e nada fica ligado a ele. A linha dele no grupo fica
//     como "saiu" com esse identificador (o grupo mostra-o como "Membro" enquanto houver contas por acertar).
//   - o dinheiro que ele pôs nos mealheiros fica nos mealheiros (é do grupo).
internal sealed class ApagarContaService(
    IUtilizadoresRepository utilizadores,
    IGrupoMembrosRepository grupoMembros,
    IContaDadosRepository dados,
    IUnitOfWork unitOfWork,
    ContextoAuditoria auditoria,
    Relogio relogio) : IApagarContaService
{
    public const string Confirmacao = "APAGAR";

    public Task ApagarAsync(string uid, string? emailVerificado, string? confirmacao, CancellationToken ct = default)
    {
        if (confirmacao?.Trim() != Confirmacao)
        {
            throw new PedidoInvalidoException($"Para apagar a conta e os dados escreve {Confirmacao}.");
        }

        return unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                // Apagar a conta apaga também o registo de alterações: não se escreve mais registo
                using var _ = auditoria.SemRegisto();
                var agora = relogio.Agora;
                var utilizador = await utilizadores.ObterAsync(uid, c);

                // Os emails com que lhe podem ter enviado convites (o do perfil e o confirmado no token)
                var emails = new[] { utilizador?.Email, emailVerificado }
                    .Where(e => !string.IsNullOrWhiteSpace(e))
                    .Select(e => AcessoGrupos.NormalizarEmail(e!))
                    .Distinct()
                    .ToList();

                foreach (var minha in await dados.ListarMembrosDoUtilizadorAsync(uid, c))
                {
                    var todos = await grupoMembros.ListarDoGrupoAsync(minha.GrupoId, c);
                    var outrosAtivos = todos.Where(m => m.Uid != uid && m.SaidaEm is null).ToList();
                    if (outrosAtivos.Count == 0)
                    {
                        // Ninguém mais no grupo: desaparece (as linhas já lidas ficam sem alterações e não se gravam)
                        await dados.ApagarGrupoAsync(minha.GrupoId, c);
                        continue;
                    }

                    var sou = todos.First(m => m.Uid == uid);
                    if (sou.SaidaEm is null && sou.Role == RoleGrupo.Admin && !outrosAtivos.Any(m => m.Role == RoleGrupo.Admin))
                    {
                        var herdeiro = outrosAtivos.OrderBy(m => m.EntradaEm).ThenBy(m => m.Uid, StringComparer.Ordinal).First();
                        herdeiro.Role = RoleGrupo.Admin;
                        herdeiro.AtualizadoEm = agora;
                    }

                    var pseudonimo = $"removido-{Guid.NewGuid():N}";
                    await dados.AnonimizarNoGrupoAsync(minha.GrupoId, uid, pseudonimo, c);
                    sou.Uid = pseudonimo;
                    sou.SaidaEm ??= agora;
                    sou.Role = RoleGrupo.Membro;
                    sou.AtualizadoEm = agora;
                }

                // Grava as mudanças nos grupos que ficam antes das operações em bloco
                await unitOfWork.SaveChangesAsync(c);

                await dados.ApagarConvitesAsync(uid, emails, c);
                await dados.ApagarDadosPessoaisAsync(uid, c);
            },
            ct);
    }
}
