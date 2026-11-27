namespace Financas.DAL.Entidades;

/// <summary>
/// Um objetivo de poupança (ex.: 1500 € para férias até junho de 2027). O progresso é o saldo da
/// poupança ligada (<see cref="PoupancaId"/>) ou, sem poupança, o valor escrito à mão
/// (<see cref="ValorAtual"/>).
/// </summary>
public sealed class ObjetivoPoupanca : IAuditavel
{
    public required string UtilizadorId { get; init; }
    public required string Id { get; init; }

    public required string Nome { get; set; }
    public decimal ValorAlvo { get; set; }

    /// <summary>Mês até ao qual se quer juntar o valor ("AAAA-MM"), inclusive.</summary>
    public required string MesAlvo { get; set; }

    /// <summary>Mês em que o objetivo foi criado ("AAAA-MM"): o ponto de partida do ritmo esperado.</summary>
    public required string MesInicio { get; set; }

    /// <summary>Poupança cujo saldo é o progresso do objetivo (sem chave estrangeira: ver ObjetivosService).</summary>
    public string? PoupancaId { get; set; }

    /// <summary>Quanto já está juntado, quando não há poupança ligada.</summary>
    public decimal? ValorAtual { get; set; }

    public DateTimeOffset CriadoEm { get; set; }

    string IAuditavel.Descricao => Nome;
}
