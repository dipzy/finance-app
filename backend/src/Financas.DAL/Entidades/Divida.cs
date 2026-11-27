namespace Financas.DAL.Entidades;

/// <summary>
/// Uma dívida (ex.: crédito do carro): quanto faltava pagar no mês <see cref="Desde"/>. Cada
/// pagamento da despesa mensal ligada (a prestação, <see cref="FixaId"/>) a partir desse mês
/// desconta ao valor em falta.
/// <para>
/// Sem <see cref="TaxaAnual"/> é só isso: <see cref="ValorInicial"/> é o que falta pagar (como o utilizador
/// o contou) e cada prestação desconta-se inteira. Com taxa, <see cref="ValorInicial"/> é o <b>capital</b> em
/// dívida e cada prestação amortiza só o que sobra depois dos juros, do imposto do selo e dos seguros.
/// </para>
/// </summary>
public sealed class Divida : IAuditavel
{
    public required string UtilizadorId { get; init; }
    public required string Id { get; init; }

    public required string Titulo { get; set; }
    public decimal ValorInicial { get; set; }
    public required string Desde { get; set; }
    public string? FixaId { get; set; }

    // ---- Contrato (tudo opcional) ----

    /// <summary>Taxa anual nominal (TAN, em %, ex.: 3,3 ou 6,5).</summary>
    public decimal? TaxaAnual { get; set; }

    /// <summary>O capital emprestado no início (o que o banco pagou), sem a entrada.</summary>
    public decimal? ValorFinanciado { get; set; }

    /// <summary>O que foi pago de entrada (não faz parte do empréstimo; serve para o preço total e o custo do contrato).</summary>
    public decimal? Entrada { get; set; }

    /// <summary>Duração do contrato, em meses.</summary>
    public int? PrazoMeses { get; set; }

    /// <summary>Mês da primeira prestação do contrato ("AAAA-MM").</summary>
    public string? InicioContrato { get; set; }

    /// <summary>Comissão de reembolso antecipado, em % do capital amortizado (sem valor: 0).</summary>
    public decimal? ComissaoReembolso { get; set; }

    /// <summary>Seguros (vida, proteção...) e outros encargos fixos que vêm dentro da prestação mensal e não amortizam capital.</summary>
    public decimal? EncargosMensais { get; set; }

    // ---- Do último extrato importado (PDF do credor) ----

    /// <summary>O número do contrato no credor (ex.: "CVCR 482459"): serve para reconhecer a dívida num extrato novo.</summary>
    public string? NumeroContrato { get; set; }

    public string? Credor { get; set; }

    /// <summary>Data de emissão do último extrato importado.</summary>
    public DateOnly? ExtratoEm { get; set; }

    /// <summary>A próxima prestação segundo o extrato (ex.: a 6 de 60).</summary>
    public int? ProximaPrestacaoNumero { get; set; }

    public DateOnly? ProximaPrestacaoVencimento { get; set; }

    /// <summary>O total que o credor vai debitar na próxima prestação.</summary>
    public decimal? ProximaPrestacaoValor { get; set; }

    public decimal? ProximaPrestacaoCapital { get; set; }
    public decimal? ProximaPrestacaoJuros { get; set; }
    public decimal? ProximaPrestacaoSelo { get; set; }
    public decimal? ProximaPrestacaoSeguros { get; set; }

    /// <summary>Capital em atraso (prestações vencidas e não pagas) segundo o extrato; 0 = em dia.</summary>
    public decimal? CapitalVencido { get; set; }

    string IAuditavel.Descricao => Titulo;
}
