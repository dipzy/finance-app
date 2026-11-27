using Financas.Services.Regras;

namespace Financas.Services.Dtos;

// ---- Relatório mensal (PDF) ----

/// <summary>O ficheiro PDF gerado.</summary>
public sealed record RelatorioPdf(string NomeFicheiro, byte[] Conteudo);

/// <summary>Uma despesa mensal na tabela do relatório.</summary>
/// <param name="Dia">O dia do débito configurado na despesa (se tiver).</param>
/// <param name="Estado">Pago / por pagar (só no mês atual); null nos meses passados sem registo.</param>
/// <param name="PagaEm">A data do pagamento, quando está paga.</param>
public sealed record LinhaDespesaMensalRelatorio(string Titulo, int? Dia, decimal Valor, EstadoLinha? Estado, DateOnly? PagaEm);

/// <summary>Uma despesa extra na tabela do relatório.</summary>
/// <param name="Categoria">O nome a mostrar (ex.: "Supermercado").</param>
public sealed record LinhaExtraRelatorio(DateOnly? Data, string Titulo, string Categoria, bool PagaComCartao, decimal Valor);

/// <summary>
/// Tudo o que o relatório de um mês mostra, já calculado pelos outros serviços. O documento
/// (<c>Relatorios.DocumentoRelatorioMes</c>) só desenha estes números.
/// </summary>
/// <param name="Numeros">Entrou, despesas mensais, extras, poupado e livre do mês (os do Resumo do mês).</param>
/// <param name="SaldoConta">No mês atual, o saldo de agora; nos passados, o saldo final (null se não se souber).</param>
/// <param name="Previsao">Previsão no fim do mês: só no mês atual.</param>
/// <param name="CartaoAlimentacao">O saldo atual do cartão de alimentação.</param>
/// <param name="Evolucao">Os últimos 12 meses até ao mês do relatório (do mais antigo para o mais recente).</param>
/// <param name="Distribuicao">As fatias do salário (Poupanças, Despesas mensais, Extras, Livre), como no gráfico da app.</param>
public sealed record DadosRelatorioMes(
    string Mes,
    bool EMesAtual,
    string NomeUtilizador,
    DateTime GeradoEm,
    EvolucaoMesDto Numeros,
    decimal? SaldoConta,
    decimal? Previsao,
    decimal CartaoAlimentacao,
    IReadOnlyList<FatiaRelatorio> Distribuicao,
    IReadOnlyList<EvolucaoMesDto> Evolucao,
    GastosPorCategoriaDto Categorias,
    IReadOnlyList<LinhaDespesaMensalRelatorio> DespesasMensais,
    IReadOnlyList<LinhaExtraRelatorio> DespesasExtras,
    IReadOnlyList<EstadoOrcamentoDto> Orcamentos,
    IReadOnlyList<ObjetivoDto> Objetivos,
    IReadOnlyList<PoupancaDto> Poupancas,
    IReadOnlyList<DividaComEstadoDto> Dividas);

/// <summary>Uma fatia da distribuição do salário.</summary>
/// <param name="Chave">poupancas, despesas, extras ou livre.</param>
public sealed record FatiaRelatorio(string Chave, string Nome, decimal Valor);
