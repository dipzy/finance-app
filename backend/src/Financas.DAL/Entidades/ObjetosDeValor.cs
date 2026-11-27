namespace Financas.DAL.Entidades;

// Objetos de valor guardados como JSON numa coluna (ver Configuracoes/Json.cs).
// São imutáveis (records com init): para mudar, cria-se uma cópia com "with", por exemplo
//   utilizador.Salario = utilizador.Salario with { Valor = "1500" };

/// <summary>Configuração do salário (tab Salário).</summary>
public sealed record ConfiguracaoSalario
{
    /// <summary>Valor mensal, como foi escrito ("1500", "1.276,50").</summary>
    public required string Valor { get; init; }

    /// <summary>Dia do mês em que o salário entra (1-31; 29-31 passa para o último dia nos meses curtos).</summary>
    public int DiaRecebimento { get; init; }

    /// <summary>Cartão de alimentação: só informativo, fica fora dos saldos.</summary>
    public string? CartaoAlimentacao { get; init; }

    /// <summary>
    /// Alternativa ao valor fixo: valor por dia útil (segunda a sexta). Se estiver preenchido, o cartão
    /// carrega esse valor vezes os dias úteis do mês, em vez de <see cref="CartaoAlimentacao"/>.
    /// </summary>
    public string? CartaoPorDiaUtil { get; init; }

    /// <summary>
    /// Recebimento manual: o salário não entra sozinho no dia de recebimento. É a pessoa que marca "Já recebi" (com o valor
    /// que entrou de facto, que pode ser diferente do configurado). Por defeito, desligado (entra sozinho).
    /// </summary>
    public bool RecebimentoManual { get; init; }

    /// <summary>Quando o salário entrou pela última vez ("lastReceived" na app).</summary>
    public DateTimeOffset? RecebidoEm { get; init; }

    /// <summary>O que aconteceu no último dia de salário.</summary>
    public Recebimento? UltimoRecebimento { get; init; }
}

/// <summary>Dados financeiros da primeira versão da app.</summary>
public sealed record DadosFinanceirosAntigos
{
    public string? Salario { get; init; }
    public string? PprPercentagem { get; init; }
    public string? PoupancaPercentagem { get; init; }
    public string? AtualizadoEm { get; init; }
}

/// <summary>Configuração antiga de PPR e Poupança (percentagem do salário ou valor fixo).</summary>
public sealed record ConfiguracaoPprPoupanca
{
    public TipoContribuicao PprTipo { get; init; }
    public string PprValor { get; init; } = "";
    public TipoContribuicao PoupancaTipo { get; init; }
    public string PoupancaValor { get; init; } = "";
}

/// <summary>A parte de uma poupança no dia do salário.</summary>
/// <param name="PoupancaId">Sem id: configuração antiga (PPR/Poupança) ainda sem lista de poupanças.</param>
public sealed record Contribuicao(string? PoupancaId, string Nome, decimal Valor);

/// <summary>O que aconteceu no dia do salário (para mostrar e para o histórico).</summary>
/// <param name="Salario">Salário configurado.</param>
/// <param name="Ppr">Contribuições das poupanças chamadas "PPR".</param>
/// <param name="Poupanca">Contribuições de todas as outras poupanças.</param>
/// <param name="Liquido">O que entrou de facto na conta: salário - todas as contribuições.</param>
/// <param name="Data">Quando aconteceu (só nos recebimentos registados).</param>
/// <param name="CartaoAlimentacao">O que entrou no saldo do cartão de alimentação nesse dia (só nos recebimentos registados).</param>
public sealed record Recebimento(
    decimal Salario,
    decimal Ppr,
    decimal Poupanca,
    decimal Liquido,
    IReadOnlyList<Contribuicao> Contribuicoes,
    DateTimeOffset? Data = null,
    decimal? CartaoAlimentacao = null);

/// <summary>Uma linha de um bloco da folha do mês (o livro Excel do utilizador).</summary>
/// <param name="Data">Só em algumas linhas (ex.: despesas do mês).</param>
/// <param name="Informativo">Aparece mas não entra nas contas (ex.: o cartão de alimentação no Lucro).</param>
public sealed record LinhaFolha(string Titulo, decimal Valor, DateOnly? Data = null, bool? Informativo = null);

/// <summary>Blocos importados do Excel que não têm outro sítio na app (só histórico do mês).</summary>
public sealed record BlocosImportados
{
    public IReadOnlyList<LinhaFolha>? Lucro { get; init; }
    public IReadOnlyList<LinhaFolha>? Poupanca { get; init; }
    public decimal? SaldoConta { get; init; }
    public IReadOnlyList<LinhaFolha>? SaldoPoupanca { get; init; }
    public IReadOnlyList<LinhaFolha>? TotalAPagar { get; init; }

    /// <summary>
    /// Junta outros blocos a estes: os que vêm preenchidos substituem os atuais, os outros ficam
    /// (como o "merge" do Firestore ao importar o mesmo mês outra vez).
    /// </summary>
    public BlocosImportados Juntar(BlocosImportados novos) => new()
    {
        Lucro = novos.Lucro ?? Lucro,
        Poupanca = novos.Poupanca ?? Poupanca,
        SaldoConta = novos.SaldoConta ?? SaldoConta,
        SaldoPoupanca = novos.SaldoPoupanca ?? SaldoPoupanca,
        TotalAPagar = novos.TotalAPagar ?? TotalAPagar,
    };
}
