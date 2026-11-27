namespace Financas.DAL.Entidades;

/// <summary>Como o valor de uma despesa partilhada se divide pelos participantes.</summary>
public enum ModoDivisao
{
    /// <summary>Partes iguais (os cêntimos que sobram vão para os primeiros).</summary>
    Igual = 1,

    /// <summary>Cada participante tem um valor exato; a soma tem de dar o total.</summary>
    Valores = 2,

    /// <summary>Cada participante tem uma percentagem; a soma tem de dar 100.</summary>
    Percentagem = 3,

    /// <summary>Cada participante tem um número de partes (ex.: 2 partes para quem comeu o dobro).</summary>
    Partes = 4,
}

/// <summary>
/// Despesa feita por um membro do grupo (o pagador) e dividida por alguns ou todos os membros.
/// <para>
/// O valor total sai da conta do pagador (ou do cartão de alimentação) quando é registada. Cada
/// participante fica com uma <see cref="ParteDespesaPartilhada"/> e com uma <see cref="DespesaExtra"/>
/// pessoal só com a sua parte: assim os gastos do mês, as categorias e os orçamentos de cada um
/// contam apenas o que lhe cabe. A diferença entre o que cada um pagou e a sua parte dá os saldos
/// do grupo (quem deve a quem), que se acertam com <see cref="AcertoPartilhado"/>.
/// </para>
/// </summary>
public sealed class DespesaPartilhada : IVersionado, IAuditavel
{
    public required string Id { get; init; }

    public required string GrupoId { get; set; }

    public required string Titulo { get; set; }

    public decimal Valor { get; set; }

    public DateOnly Data { get; set; }

    /// <summary>Mês da data ("AAAA-MM").</summary>
    public required string Mes { get; set; }

    public string? Categoria { get; set; }

    /// <summary>Quem pagou (e registou) a despesa.</summary>
    public required string PagadorUid { get; set; }

    /// <summary>Com que dinheiro o pagador pagou.</summary>
    public MeioPagamento MeioPagamento { get; set; }

    /// <summary>
    /// O valor saiu da conta (ou do cartão) do pagador ao registar. Falso nas que vieram de uma
    /// despesa antiga que nunca saiu da conta e nas convertidas das divisões da versão anterior.
    /// </summary>
    public bool DescontadaDaConta { get; set; }

    /// <summary>O saldo do meio de pagamento do pagador logo antes de esta despesa o debitar (nulo nas anteriores a este campo).</summary>
    public decimal? SaldoAntes { get; set; }

    public ModoDivisao Modo { get; set; } = ModoDivisao.Igual;

    /// <summary>
    /// Se veio do pagamento de uma despesa fixa dividida: o id desse <see cref="PagamentoFixa"/>.
    /// Estas despesas só se desfazem anulando o pagamento (e não pelo grupo).
    /// </summary>
    public string? PagamentoFixaId { get; set; }

    public int Versao { get; set; }

    public DateTimeOffset CriadoEm { get; set; }
    public DateTimeOffset? AtualizadoEm { get; set; }

    string IAuditavel.UtilizadorId => PagadorUid;
    string IAuditavel.Descricao => Titulo;
}

/// <summary>Se o participante já aceitou a sua parte de uma despesa partilhada.</summary>
public enum EstadoParte
{
    /// <summary>Aceite (quem pagou aceita à partida): conta nos gastos e no saldo do grupo.</summary>
    Aceite = 1,

    /// <summary>Ainda por aceitar: não conta nos gastos nem no saldo do grupo.</summary>
    Pendente = 2,

    /// <summary>Recusada: a parte dele é redistribuída pelos outros participantes.</summary>
    Recusada = 3,
}

/// <summary>A parte de um participante numa <see cref="DespesaPartilhada"/>.</summary>
public sealed class ParteDespesaPartilhada
{
    public required string Id { get; init; }

    public required string DespesaPartilhadaId { get; set; }

    public required string Uid { get; set; }

    /// <summary>O valor que cabe a este participante (ao cêntimo).</summary>
    public decimal Valor { get; set; }

    /// <summary>
    /// Aceite, por aceitar ou recusada. Só as aceites contam; <see cref="Valor"/> é o valor da divisão original
    /// (quando alguém recusa, o valor que conta de cada um passa a ser calculado sem as partes recusadas).
    /// </summary>
    public EstadoParte Estado { get; set; } = EstadoParte.Aceite;

    /// <summary>O que foi escrito para este participante: valor, percentagem ou nº de partes (null em partes iguais).</summary>
    public decimal? Peso { get; set; }

    /// <summary>A <see cref="DespesaExtra"/> pessoal criada para este participante (null nas convertidas da versão anterior).</summary>
    public string? DespesaExtraId { get; set; }
}

/// <summary>
/// Pagamento de um membro a outro para acertar contas no grupo (ex.: "a Ana pagou-me 20 €").
/// Sai da conta de quem paga logo ao registar; só entra na conta de quem recebe quando este confirma
/// que recebeu (<see cref="ConfirmadoEm"/>).
/// </summary>
public sealed class AcertoPartilhado : IAuditavel
{
    public required string Id { get; init; }

    public required string GrupoId { get; set; }

    /// <summary>Quem pagou.</summary>
    public required string DeUid { get; set; }

    /// <summary>Quem recebeu.</summary>
    public required string ParaUid { get; set; }

    public decimal Valor { get; set; }

    public DateOnly Data { get; set; }

    /// <summary>Quem registou o acerto (um dos dois).</summary>
    public required string CriadoPorUid { get; set; }

    public DateTimeOffset CriadoEm { get; set; }

    /// <summary>
    /// Quando quem recebeu confirmou que o dinheiro chegou (e entrou na conta dele). Nulo = por confirmar.
    /// Os acertos anteriores a esta confirmação ficaram confirmados no dia em que foram registados.
    /// </summary>
    public DateTimeOffset? ConfirmadoEm { get; set; }

    string IAuditavel.UtilizadorId => CriadoPorUid;
    string IAuditavel.Descricao => $"{DeUid} -> {ParaUid}";
}
