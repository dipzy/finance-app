namespace Financas.DAL.Entidades;

/// <summary>
/// Os juros que a app somou ao saldo de uma poupança num mês (ver <see cref="Poupanca.JurosAutomaticos"/>).
/// Há no máximo um por (poupança, mês): a chave é essa e impede somar o mesmo mês duas vezes.
/// </summary>
public sealed class JurosPoupanca
{
    public required string UtilizadorId { get; init; }
    public required string PoupancaId { get; init; }
    public required string Mes { get; init; }

    /// <summary>Os juros antes do imposto.</summary>
    public decimal Bruto { get; set; }

    /// <summary>O que foi somado ao saldo (já sem o imposto retido).</summary>
    public decimal Liquido { get; set; }

    /// <summary>O dia em que foram somados.</summary>
    public DateOnly Data { get; set; }
}
