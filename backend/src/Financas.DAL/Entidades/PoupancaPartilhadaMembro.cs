namespace Financas.DAL.Entidades;

/// <summary>
/// Contribuição de um membro para uma poupança partilhada do grupo.
/// Cada membro pode configurar a sua contribuição (valor fixo, automática no dia do salário ou dia fixo, ou manual).
/// </summary>
public sealed class PoupancaPartilhadaMembro : IVersionado, IAuditavel
{
    public required string Id { get; init; }

    public required string PoupancaPartilhadaId { get; set; }

    public required string MembroUid { get; set; }

    /// <summary>
    /// Valor fixo da contribuição mensal (em cêntimos).
    /// </summary>
    public long Valor { get; set; }

    /// <summary>
    /// Tipo de contribuição: Automática (no dia do salário ou dia fixo) ou Manual.
    /// </summary>
    public TipoContribuicaoPartilhada Tipo { get; set; } = TipoContribuicaoPartilhada.Manual;

    /// <summary>
    /// Se automática no dia do salário: true = dia do salário, false = dia fixo do mês.
    /// </summary>
    public bool DiaDoSalario { get; set; } = true;

    /// <summary>
    /// Dia do mês (1-28) para contribuição automática em dia fixo.
    /// </summary>
    public int? DiaFixo { get; set; }

    /// <summary>
    /// Último mês em que a contribuição foi processada (formato "AAAA-MM").
    /// </summary>
    public string? UltimaContribuicaoMes { get; set; }

    public int Versao { get; set; }

    public DateTimeOffset CriadoEm { get; set; }
    public DateTimeOffset? AtualizadoEm { get; set; }

    string IAuditavel.UtilizadorId => MembroUid;
    string IAuditavel.Descricao => PoupancaPartilhadaId;
}

/// <summary>
/// Tipo de contribuição para poupança partilhada.
/// </summary>
public enum TipoContribuicaoPartilhada
{
    /// <summary>Contribuição manual (o membro faz quando quer).</summary>
    Manual = 0,

    /// <summary>Contribuição automática (no dia do salário ou dia fixo).</summary>
    Automatica = 1,
}