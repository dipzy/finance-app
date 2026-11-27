namespace Financas.DAL.Entidades;

/// <summary>
/// Grupo de utilizadores que partilham poupanças e dividem despesas.
/// Substitui a antiga Parceria (que era só para 2 pessoas).
/// </summary>
public sealed class Grupo : IAuditavel
{
    public required string Id { get; init; }

    public required string Nome { get; set; }

    /// <summary>Utilizador que criou o grupo (admin inicial).</summary>
    public required string CriadoPorUid { get; set; }

    public DateTimeOffset CriadoEm { get; set; }
    public DateTimeOffset? AtualizadoEm { get; set; }

    string IAuditavel.UtilizadorId => CriadoPorUid;
    string IAuditavel.Descricao => Nome;
}