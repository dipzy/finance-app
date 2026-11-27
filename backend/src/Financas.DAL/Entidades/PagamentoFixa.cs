namespace Financas.DAL.Entidades;

/// <summary>
/// O que aconteceu a uma despesa mensal num mês. Há no máximo um por (utilizador, mês, despesa):
/// o id é <c>"{mes}_{fixaId}"</c> e há um índice único, por isso a mesma despesa nunca é paga
/// duas vezes no mesmo mês, nem com a app aberta em dois dispositivos.
/// </summary>
public sealed class PagamentoFixa : IAuditavel
{
    public required string UtilizadorId { get; init; }
    public required string Id { get; init; }

    public required string FixaId { get; init; }
    public required string Mes { get; init; }

    public required string Titulo { get; set; }

    /// <summary>Valor pago (pode ser diferente do valor atual da despesa).</summary>
    public decimal Valor { get; set; }

    public bool Parcial { get; set; }

    /// <summary>O consumo da fatura, na unidade da despesa (ex.: 120 kWh). Sem registo: <c>null</c>.</summary>
    public decimal? Consumo { get; set; }

    public DateOnly Data { get; set; }
    public EstadoPagamento Estado { get; set; }

    /// <summary>O id de um pagamento: um por mês e por despesa.</summary>
    public static string IdDe(string mes, string fixaId) => $"{mes}_{fixaId}";

    string IAuditavel.Descricao => Titulo;
}
