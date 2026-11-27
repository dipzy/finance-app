namespace Financas.DAL.Entidades;

/// <summary>
/// Convite para um grupo, enviado por um membro (DeUid) a outra pessoa, identificada pelo email
/// (normalizado). Quando o convite é aceite, o convidado passa a membro do grupo.
/// </summary>
public sealed class ParceiroConvite
{
    public required string Id { get; init; }

    /// <summary>
    /// Quem enviou o convite. Nos convites de grupo anteriores à coluna <see cref="GrupoId"/>
    /// guardava o id do grupo (a migração copia-o para <see cref="GrupoId"/>).
    /// </summary>
    public required string DeUid { get; set; }

    /// <summary>O grupo para onde a pessoa é convidada (null nos convites de parceria antigos).</summary>
    public string? GrupoId { get; set; }

    /// <summary>Email do convidado (normalizado: minúsculas, sem espaços).</summary>
    public required string Email { get; set; }

    public EstadoConvite Estado { get; set; } = EstadoConvite.Pendente;

    public DateTimeOffset CriadoEm { get; set; }
    public DateTimeOffset? AtualizadoEm { get; set; }

    /// <summary>Data em que o convite foi aceite (se aplicável).</summary>
    public DateTimeOffset? AceiteEm { get; set; }

    /// <summary>Data em que o convite foi recusado (se aplicável).</summary>
    public DateTimeOffset? RecusadoEm { get; set; }
}
