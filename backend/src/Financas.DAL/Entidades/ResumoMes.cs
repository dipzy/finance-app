namespace Financas.DAL.Entidades;

/// <summary>Histórico de um mês (no Firestore: <c>users/{uid}/meses/{mes}</c>).</summary>
public sealed class ResumoMes
{
    public required string UtilizadorId { get; init; }

    /// <summary>"AAAA-MM".</summary>
    public required string Mes { get; init; }

    /// <summary>Saldo da conta quando o mês começou (na primeira abertura da app nesse mês).</summary>
    public decimal? SaldoInicial { get; set; }

    /// <summary>Saldo da conta quando o mês acabou (ao começar o mês seguinte).</summary>
    public decimal? SaldoFinal { get; set; }

    public DateTimeOffset? AbertoEm { get; set; }

    /// <summary>O que aconteceu no dia do salário desse mês.</summary>
    public Recebimento? Recebimento { get; set; }

    /// <summary>Blocos importados do Excel que não têm outro sítio na app.</summary>
    public BlocosImportados? Importado { get; set; }
}
