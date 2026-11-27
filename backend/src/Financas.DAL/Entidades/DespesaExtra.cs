namespace Financas.DAL.Entidades;

/// <summary>Despesa variável (supermercado, jantar...): sai da conta no momento em que é registada.</summary>
public sealed class DespesaExtra : IAuditavel
{
    public required string UtilizadorId { get; init; }
    public required string Id { get; init; }

    public required string Titulo { get; set; }
    public decimal Valor { get; set; }

    /// <summary>Dia em que a despesa foi feita (pode ser ontem); define o mês em que aparece.</summary>
    public DateOnly? Data { get; set; }

    /// <summary>Mês da data ("AAAA-MM"), para listar por mês.</summary>
    public string? Mes { get; set; }

    /// <summary>O valor saiu da conta ao registar (as de versões anteriores e as importadas não saíram).</summary>
    public bool DescontadaDaConta { get; set; }

    /// <summary>
    /// Categoria (chave estável, ex.: "restauracao"; a lista está em Financas.Services.Regras.Categorias).
    /// <c>null</c> nas despesas registadas antes de haver categorias: contam como "outros".
    /// </summary>
    public string? Categoria { get; set; }

    /// <summary>Com que dinheiro foi paga (as que já existiam são da conta).</summary>
    public MeioPagamento MeioPagamento { get; set; }

    /// <summary>
    /// O saldo do meio de pagamento (conta ou cartão) logo antes de esta despesa o debitar: serve para
    /// conferir os movimentos. Nulo nas que não saíram da conta e nas registadas antes de existir este campo.
    /// </summary>
    public decimal? SaldoAntes { get; set; }

    /// <summary>Os litros abastecidos, nas despesas de combustível (para saber o preço por litro). Sem registo: <c>null</c>.</summary>
    public decimal? Litros { get; set; }

    public bool PagaComCartao => MeioPagamento == MeioPagamento.CartaoAlimentacao;

    public DateTimeOffset CriadoEm { get; set; }

    // ---- Gerada por um gasto recorrente (null nas registadas à mão) ----

    /// <summary>O <see cref="GastoRecorrente"/> que gerou esta despesa (null nas registadas à mão).</summary>
    public string? GastoRecorrenteId { get; set; }

    /// <summary>
    /// O dia da repetição que esta despesa representa. Com <see cref="GastoRecorrenteId"/> forma uma
    /// chave única: a mesma repetição nunca é gerada duas vezes (nem por dois dispositivos ao mesmo tempo).
    /// </summary>
    public DateOnly? DataOcorrencia { get; set; }

    /// <summary>
    /// A chave enviada pela app no cabeçalho <c>Idempotency-Key</c> (um UUID). Única por utilizador:
    /// se a app repetir o mesmo pedido (ex.: fila offline), a despesa não é criada nem cobrada outra vez.
    /// </summary>
    public string? ChaveIdempotencia { get; set; }

    /// <summary>
    /// A <see cref="DespesaPartilhada"/> de que esta é a parte do utilizador (null nas despesas só dele).
    /// Estas despesas não se alteram nem se apagam aqui: muda-se a despesa partilhada, no grupo.
    /// </summary>
    public string? DespesaPartilhadaId { get; set; }

    string IAuditavel.Descricao => Titulo;
}
