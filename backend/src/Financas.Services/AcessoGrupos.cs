using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;

namespace Financas.Services;

// O que os serviços dos grupos repetem: confirmar que quem pede é membro (ativo) e mostrar nomes.
internal static class AcessoGrupos
{
    /// <summary>
    /// O membro ativo do grupo. Quem não é membro (ou já saiu, ou foi removido) recebe "não
    /// encontrado", como se o grupo não existisse: não fica a saber que existe.
    /// </summary>
    public static async Task<GrupoMembro> ExigirMembroAsync(
        this IGrupoMembrosRepository membros,
        string grupoId,
        string uid,
        CancellationToken ct) =>
        await membros.ObterAtivoAsync(grupoId, uid, ct) ?? throw new NaoEncontradoException("Grupo não encontrado.");

    public static async Task<GrupoMembro> ExigirAdminAsync(
        this IGrupoMembrosRepository membros,
        string grupoId,
        string uid,
        string mensagem,
        CancellationToken ct)
    {
        var membro = await membros.ExigirMembroAsync(grupoId, uid, ct);
        return membro.Role == RoleGrupo.Admin ? membro : throw new PedidoInvalidoException(mensagem);
    }

    /// <summary>O nome a mostrar de cada utilizador (o nome do perfil, senão o email, senão "Membro").</summary>
    public static async Task<Dictionary<string, string>> NomesAsync(
        this IUtilizadoresRepository utilizadores,
        IEnumerable<string> uids,
        CancellationToken ct)
    {
        var nomes = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var uid in uids.Distinct(StringComparer.Ordinal))
        {
            var utilizador = await utilizadores.ObterAsync(uid, ct);
            nomes[uid] = NomeDe(utilizador);
        }

        return nomes;
    }

    public static string NomeDe(Utilizador? utilizador) =>
        !string.IsNullOrWhiteSpace(utilizador?.Nome) ? utilizador.Nome.Trim()
        : !string.IsNullOrWhiteSpace(utilizador?.Email) ? utilizador.Email.Trim()
        : Textos.T("Membro");

    public static string NormalizarEmail(string email) => email.Trim().ToLowerInvariant();
}
