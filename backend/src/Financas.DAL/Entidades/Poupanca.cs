namespace Financas.DAL.Entidades;

/// <summary>
/// Uma conta poupança (Revolut, PPR, Certificados de Aforro...): no dia do salário recebe a
/// contribuição mensal, que sai da conta corrente e se soma ao <see cref="Saldo"/>.
/// </summary>
public sealed class Poupanca : IVersionado, IAuditavel
{
    public required string UtilizadorId { get; init; }
    public required string Id { get; init; }

    public required string Nome { get; set; }
    public TipoContribuicao Tipo { get; set; }

    /// <summary>Contribuição mensal, como foi escrita ("10" = 10% ou 10 €, conforme o tipo).</summary>
    public string Valor { get; set; } = "0";

    public bool ContribuicaoAutomatica { get; set; } = true;

    /// <summary>Dia de débito automático. Sem dia, acompanha o dia de recebimento do salário.</summary>
    public int? DiaContribuicao { get; set; }

    /// <summary>Mês em que a contribuição foi feita pela última vez, para evitar duplicados.</summary>
    public string? UltimaContribuicaoMes { get; set; }

    /// <summary>
    /// O primeiro mês em que a contribuição manual conta (a criação da poupança, ou quando passou a manual).
    /// Antes disso não há meses "por enviar". Sem valor (não devia acontecer), nunca há meses em atraso.
    /// </summary>
    public string? Inicio { get; set; }

    /// <summary>O dia em que a última contribuição foi feita (para mostrar "Enviada dd/mm").</summary>
    public DateOnly? UltimaContribuicaoEm { get; set; }

    /// <summary>
    /// Contribuição manual: enquanto a deste mês não for enviada, conta no Saldo Previsto (e na previsão
    /// do fim do mês) como dinheiro que vai sair. Sem efeito nas automáticas.
    /// </summary>
    public bool ContarNoPrevisto { get; set; } = true;

    /// <summary>Quanto já lá está.</summary>
    public decimal Saldo { get; set; }

    /// <summary>
    /// Taxa de juro anual bruta, em % (ex.: 2.5). Com ela a app estima o que a poupança rende e faz projeções;
    /// sem taxa não há estimativa. Num PPR é a rentabilidade que o utilizador espera (varia: é só uma simulação).
    /// </summary>
    public decimal? TaxaAnual { get; set; }

    /// <summary>Imposto retido sobre os juros, em % (28 por omissão; 0 se não houver).</summary>
    public decimal Retencao { get; set; } = 28m;

    /// <summary>
    /// A app soma os juros ao saldo sozinha, todos os meses (conta poupança, certificados de aforro). Falso: a taxa
    /// só serve para a estimativa e a projeção (o saldo continua a ser o que o utilizador escreve).
    /// </summary>
    public bool JurosAutomaticos { get; set; }

    /// <summary>O dia em que os juros automáticos passaram a contar (o primeiro mês conta só os dias que restavam).</summary>
    public DateOnly? JurosDesde { get; set; }

    /// <summary>O último mês cujos juros já foram somados ao saldo.</summary>
    public string? JurosCreditadosAte { get; set; }

    public long? Ordem { get; set; }

    public int Versao { get; set; }

    string IAuditavel.Descricao => Nome;
}
