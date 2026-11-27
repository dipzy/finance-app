namespace Financas.DAL.Entidades;

/// <summary>
/// Mealheiro do grupo: um saldo único para onde os membros põem dinheiro (à mão ou com uma
/// contribuição automática todos os meses), com um objetivo opcional. O histórico de entradas e
/// levantamentos está em <see cref="MovimentoPoupancaPartilhada"/>.
/// </summary>
public sealed class PoupancaPartilhada : IVersionado, IAuditavel
{
    public required string Id { get; init; }

    public required string GrupoId { get; set; }

    public required string Nome { get; set; }

    public decimal Saldo { get; set; }

    /// <summary>Quanto se quer juntar (null = sem objetivo).</summary>
    public decimal? Objetivo { get; set; }

    /// <summary>Até quando se quer juntar o objetivo (opcional).</summary>
    public DateOnly? DataObjetivo { get; set; }

    public int Versao { get; set; }

    public DateTimeOffset CriadoEm { get; set; }
    public DateTimeOffset? AtualizadoEm { get; set; }

    // Sem dono: o registo fica em nome de quem fez o pedido (ver InterceptorAuditoria)
    string IAuditavel.UtilizadorId => "";
    string IAuditavel.Descricao => Nome;
}
