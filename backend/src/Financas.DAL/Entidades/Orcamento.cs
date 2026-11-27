namespace Financas.DAL.Entidades;

/// <summary>
/// Limite mensal de gastos numa categoria de despesas extras (ex.: 200 € por mês em restauração).
/// Há no máximo um por (utilizador, categoria): índice único.
/// </summary>
public sealed class Orcamento : IAuditavel
{
    public required string UtilizadorId { get; init; }
    public required string Id { get; init; }

    /// <summary>Chave da categoria (ex.: "restauracao").</summary>
    public required string Categoria { get; set; }

    /// <summary>Quanto se pode gastar por mês nesta categoria.</summary>
    public decimal Limite { get; set; }

    public DateTimeOffset CriadoEm { get; set; }

    string IAuditavel.Descricao => Categoria;
}
