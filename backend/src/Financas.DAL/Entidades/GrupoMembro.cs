namespace Financas.DAL.Entidades;

/// <summary>
/// Role de um membro no grupo.
/// </summary>
public enum RoleGrupo
{
    /// <summary>Pode convidar, remover, editar grupo, alterar roles de outros membros.</summary>
    Admin = 1,

    /// <summary>Participa nas poupanças e divisões; não gere o grupo.</summary>
    Membro = 2
}

/// <summary>
/// Ligação entre um utilizador e um grupo, com a sua role.
/// </summary>
public sealed class GrupoMembro : IVersionado, IAuditavel
{
    public required string Id { get; init; }

    public required string GrupoId { get; set; }

    public required string Uid { get; set; }

    public RoleGrupo Role { get; set; } = RoleGrupo.Membro;

    public DateTimeOffset EntradaEm { get; set; }

    public DateTimeOffset? SaidaEm { get; set; }

    public int Versao { get; set; }

    public DateTimeOffset CriadoEm { get; set; }
    public DateTimeOffset? AtualizadoEm { get; set; }

    string IAuditavel.UtilizadorId => Uid;
    string IAuditavel.Descricao => $"{Role} {GrupoId}";
}