namespace Financas.DAL.Entidades;

/// <summary>
/// Um gasto do dia a dia que se repete (ex.: o café todos os dias, o combustível todas as semanas).
/// Não é uma despesa: é a regra que gera as despesas extras (<see cref="DespesaExtra"/> com
/// <see cref="DespesaExtra.GastoRecorrenteId"/>) nos dias certos, quando a app pede o saldo.
/// </summary>
public sealed class GastoRecorrente : IAuditavel
{
    public required string UtilizadorId { get; init; }
    public required string Id { get; init; }

    public required string Titulo { get; set; }
    public decimal Valor { get; set; }
    public string? Categoria { get; set; }
    public MeioPagamento MeioPagamento { get; set; }

    public Frequencia Frequencia { get; set; }

    /// <summary>Semanal: o dia da semana, de 1 (segunda) a 7 (domingo), como na ISO 8601.</summary>
    public int? DiaSemana { get; set; }

    /// <summary>Mensal: o dia do mês (1 a 31; nos meses mais curtos conta o último dia).</summary>
    public int? DiaMes { get; set; }

    /// <summary>O primeiro dia em que pode haver repetição.</summary>
    public DateOnly Inicio { get; set; }

    /// <summary>O último dia (inclusive); null = sem fim.</summary>
    public DateOnly? Fim { get; set; }

    /// <summary>Em pausa (false) não gera nada; ao retomar, os dias da pausa não são gerados.</summary>
    public bool Ativo { get; set; } = true;

    /// <summary>Até que dia (inclusive) as repetições já foram geradas. null = ainda nenhuma.</summary>
    public DateOnly? UltimaGeracao { get; set; }

    public DateTimeOffset CriadoEm { get; set; }

    string IAuditavel.Descricao => Titulo;
}
