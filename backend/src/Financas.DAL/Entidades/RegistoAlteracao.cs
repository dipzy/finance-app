namespace Financas.DAL.Entidades;

/// <summary>
/// Uma linha do registo de alterações ("auditoria"): quem mudou o quê, quando e de onde.
/// Escrita sozinha pelo <see cref="Auditoria.InterceptorAuditoria"/> no mesmo SaveChanges que grava a
/// alteração, por isso fica na mesma transação: se a operação for desfeita (ou repetida), o registo também.
/// </summary>
public sealed class RegistoAlteracao
{
    public required string Id { get; init; }
    public required string UtilizadorId { get; init; }

    /// <summary>O tipo de dados (nome da classe, ex.: "DespesaExtra").</summary>
    public required string Entidade { get; init; }

    public required string EntidadeId { get; init; }

    /// <summary>O título/nome do registo no momento da alteração (ex.: "Combustível Carro").</summary>
    public string? Descricao { get; init; }

    public AcaoAlteracao Acao { get; init; }

    /// <summary>
    /// Quando, em UTC. É um <see cref="DateTime"/> (e não <see cref="DateTimeOffset"/>) para se poder
    /// ordenar e filtrar na base de dados também em SQLite.
    /// </summary>
    public DateTime Quando { get; init; }

    /// <summary>
    /// JSON com os campos que mudaram: <c>{"Valor":{"de":20,"para":25}}</c>. Ao criar só há "para";
    /// ao apagar só há "de".
    /// </summary>
    public string? Alteracoes { get; init; }

    /// <summary>De onde veio: o pedido (ex.: "DELETE /api/despesas-fixas/abc") ou "sistema" (gerado sozinho).</summary>
    public string? Origem { get; init; }
}
