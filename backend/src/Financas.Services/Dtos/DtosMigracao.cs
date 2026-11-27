namespace Financas.Services.Dtos;

// Cópia única dos dados do Firestore para esta API (ver MigracaoService).
// A app lê tudo o que o utilizador tem no Firestore e envia-o tal como está, com os mesmos nomes
// dos documentos. Por isso quase tudo é opcional e as datas vêm como texto: são validadas aqui,
// e o que não se aproveitar fica na lista "ignorados" da resposta.

public sealed record EstadoMigracaoDto(
    // O servidor já tem dados financeiros deste utilizador (despesas, poupanças, saldo...)
    bool TemDados,
    // Os dados do Firestore já foram copiados
    bool Importado);

public sealed record DadosFirestoreDto(
    UtilizadorFirestoreDto? Utilizador,
    IReadOnlyList<DespesaFirestoreDto>? DespesasFixas,
    IReadOnlyList<PagamentoFirestoreDto>? PagamentosFixas,
    IReadOnlyList<DespesaFirestoreDto>? DespesasExtras,
    IReadOnlyList<PoupancaFirestoreDto>? Poupancas,
    IReadOnlyList<DividaFirestoreDto>? Dividas,
    IReadOnlyList<ResumoMesFirestoreDto>? Meses);

/// <summary>Os campos do documento users/{uid}.</summary>
public sealed record UtilizadorFirestoreDto(
    string? Email,
    string? Name,
    string? CreatedAt,
    FinanceiroFirestoreDto? Financeiro,
    SalarioFirestoreDto? Salario,
    ContaCorrenteFirestoreDto? ContaCorrente,
    ConfigPprPoupancaFirestoreDto? ConfigPPRPoupanca,
    MigracoesFirestoreDto? Migracoes);

public sealed record FinanceiroFirestoreDto(string? Salario, string? PprPercentagem, string? PoupancaPercentagem, string? LastUpdated);

public sealed record SalarioFirestoreDto(
    string? Valor,
    int? DiaRecebimento,
    string? LastReceived,
    RecebimentoFirestoreDto? UltimoRecebimento,
    string? CartaoAlimentacao);

public sealed record RecebimentoFirestoreDto(
    decimal? Salario,
    decimal? Ppr,
    decimal? Poupanca,
    decimal? Liquido,
    IReadOnlyList<ContribuicaoFirestoreDto>? Contribuicoes,
    string? Data);

public sealed record ContribuicaoFirestoreDto(string? PoupancaId, string? Nome, decimal? Valor);

public sealed record ContaCorrenteFirestoreDto(decimal? Saldo, string? UltimaAtualizacao);

public sealed record ConfigPprPoupancaFirestoreDto(string? PprTipo, string? PprValor, string? PoupancaTipo, string? PoupancaValor);

public sealed record MigracoesFirestoreDto(bool? PagamentosPorMes, bool? PoupancasLista);

/// <summary>Um documento de despesasFixas ou despesasExtras.</summary>
public sealed record DespesaFirestoreDto(
    string? Id,
    string? Titulo,
    decimal? Valor,
    string? Data,
    string? Mes,
    bool? DescontadaDaConta,
    int? DiaDebito,
    string? Inicio,
    string? Fim,
    string? Periodicidade,
    int? MesAnual,
    bool? Debitado,
    string? MesDebitado,
    string? AnuladoMes,
    string? CriadoEm);

public sealed record PagamentoFirestoreDto(
    string? Id,
    string? FixaId,
    string? Mes,
    string? Titulo,
    decimal? Valor,
    string? Data,
    string? Estado);

public sealed record PoupancaFirestoreDto(string? Id, string? Nome, string? Tipo, string? Valor, decimal? Saldo, long? Ordem);

public sealed record DividaFirestoreDto(string? Id, string? Titulo, decimal? ValorInicial, string? Desde, string? FixaId);

public sealed record ResumoMesFirestoreDto(
    // O id do documento é o mês ("2026-10")
    string? Id,
    decimal? SaldoInicial,
    decimal? SaldoFinal,
    string? AbertoEm,
    RecebimentoFirestoreDto? Recebimento,
    ImportadoFirestoreDto? Importado);

public sealed record ImportadoFirestoreDto(
    IReadOnlyList<LinhaFirestoreDto>? Lucro,
    IReadOnlyList<LinhaFirestoreDto>? Poupanca,
    decimal? SaldoConta,
    IReadOnlyList<LinhaFirestoreDto>? SaldoPoupanca,
    IReadOnlyList<LinhaFirestoreDto>? TotalAPagar);

public sealed record LinhaFirestoreDto(string? Titulo, decimal? Valor, string? Data, bool? Informativo);

/// <summary>Quanto foi copiado de cada coleção, e o que ficou de fora (com o motivo).</summary>
public sealed record ResumoMigracaoDto(
    int DespesasFixas,
    int PagamentosFixas,
    int DespesasExtras,
    int Poupancas,
    int Dividas,
    int Meses,
    IReadOnlyList<string> Ignorados);

// ---- Dados da versão muito antiga da app, que guardava tudo só no dispositivo ----

public sealed record DadosLocaisDto(
    FinanceiroFirestoreDto? Financeiro,
    IReadOnlyList<DespesaLocalDto>? DespesasFixas,
    IReadOnlyList<DespesaLocalDto>? DespesasExtras);

public sealed record DespesaLocalDto(string? Titulo, decimal? Valor, string? Data, string? CriadoEm);
