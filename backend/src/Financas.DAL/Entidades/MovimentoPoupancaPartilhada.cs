namespace Financas.DAL.Entidades;

/// <summary>
/// Entrada (valor positivo) ou levantamento (negativo) de um membro numa poupança partilhada (mealheiro).
/// É o histórico que mostra quanto cada membro já pôs no mealheiro.
/// </summary>
public sealed class MovimentoPoupancaPartilhada : IAuditavel
{
    public required string Id { get; init; }

    public required string PoupancaPartilhadaId { get; set; }

    public required string Uid { get; set; }

    public decimal Valor { get; set; }

    /// <summary>Feito pela contribuição automática (e não à mão).</summary>
    public bool Automatico { get; set; }

    public DateOnly Data { get; set; }

    /// <summary>Mês da data ("AAAA-MM").</summary>
    public required string Mes { get; set; }

    public DateTimeOffset CriadoEm { get; set; }

    string IAuditavel.UtilizadorId => Uid;
    string IAuditavel.Descricao => Valor.ToString(System.Globalization.CultureInfo.InvariantCulture);
}
