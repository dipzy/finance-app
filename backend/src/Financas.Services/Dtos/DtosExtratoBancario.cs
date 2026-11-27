using Financas.Services.Regras;

namespace Financas.Services.Dtos;

// Importar o extrato da conta bancária (CSV ou OFX lido na app): cada saída vira uma despesa extra.
// A app lê o ficheiro (services/extratoBancario.ts); a API categoriza, vê o que já foi importado e grava.

/// <summary>Uma saída da conta no extrato (o valor é sempre positivo: o que foi gasto).</summary>
/// <param name="Ocorrencia">
/// Se o extrato tem vários movimentos iguais (mesma data, valor e descrição, ex.: dois cafés), qual deles é este
/// (0, 1, 2...), contado no extrato inteiro. Com a data, o valor e a descrição identifica o movimento: importar o
/// mesmo extrato duas vezes (ou dois extratos que se sobrepõem) não duplica nada.
/// </param>
/// <param name="Categoria">A categoria escolhida; sem ela usa-se a sugerida (regras, histórico e palavras-chave).</param>
public sealed record MovimentoExtratoPedido(
    [Obrigatorio] DateOnly? Data,
    [Obrigatorio, Maximo(200)] string Descricao,
    [DinheiroMaiorQueZero] decimal Valor,
    [Entre(0, 1000)] int Ocorrencia,
    [Categoria] string? Categoria = null);

public sealed record ExtratoBancarioPedido([Obrigatorio] IReadOnlyList<MovimentoExtratoPedido> Movimentos);

/// <summary>O que a API diz de um movimento (na mesma ordem do pedido).</summary>
/// <param name="JaImportado">Este movimento já foi importado antes: a importação salta-o.</param>
/// <param name="PossivelDuplicadoDe">
/// Já existe uma despesa com a mesma data e valor que não veio de um extrato (ex.: registada à mão): o título dela.
/// </param>
public sealed record MovimentoPrevistoDto(
    string Categoria,
    OrigemSugestao Origem,
    string? Regra,
    bool JaImportado,
    string? PossivelDuplicadoDe);

public sealed record PrevisaoExtratoDto(IReadOnlyList<MovimentoPrevistoDto> Movimentos);

/// <param name="Importados">Quantas despesas foram criadas.</param>
/// <param name="JaImportados">Quantos movimentos já tinham sido importados e ficaram de fora.</param>
/// <param name="Total">A soma das despesas criadas.</param>
/// <param name="Meses">Os meses ("AAAA-MM") em que ficaram as despesas criadas.</param>
public sealed record ResultadoExtratoDto(int Importados, int JaImportados, decimal Total, IReadOnlyList<string> Meses);
