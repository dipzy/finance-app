namespace Financas.DAL.Entidades;

/// <summary>
/// Uma contribuição manual enviada para uma poupança num mês. Há no máximo uma por (poupança, mês):
/// a chave é essa e é ela que impede enviar duas vezes o mesmo mês (também com a app aberta em dois
/// dispositivos). Serve para saber que meses ficaram por enviar: a poupança só guarda o último.
/// </summary>
public sealed class ContribuicaoPoupanca
{
    public required string UtilizadorId { get; init; }
    public required string PoupancaId { get; init; }
    public required string Mes { get; init; }

    /// <summary>O que foi enviado. 0 nas anteriores à existência deste registo (só se sabe o mês).</summary>
    public decimal Valor { get; set; }

    /// <summary>O dia em que foi enviada (pode ser bem depois do mês a que pertence).</summary>
    public DateOnly Data { get; set; }
}
