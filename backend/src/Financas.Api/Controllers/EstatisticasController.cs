using Financas.Services.Regras;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>Números agregados para os gráficos: gastos por categoria e evolução dos últimos meses.</summary>
[Route("api/estatisticas")]
public sealed class EstatisticasController(IEstatisticasService estatisticas) : ControladorBase
{
    /// <summary>As despesas extras do mês (por defeito, o atual) somadas por categoria, mesmo as sem orçamento.</summary>
    [HttpGet("categorias")]
    public Task<GastosPorCategoriaDto> GastosPorCategoria([FromQuery, Mes] string? mes, CancellationToken ct) =>
        estatisticas.GastosPorCategoriaAsync(Uid, mes, ct);

    /// <summary>
    /// Entrou, gasto, poupado e saldo final de cada um dos últimos meses (?meses=12, até 36), do mais
    /// antigo até ao mês atual (ou até ?ate=AAAA-MM). Os números são os da folha de cada mês.
    /// </summary>
    [HttpGet("evolucao")]
    public Task<IReadOnlyList<EvolucaoMesDto>> Evolucao(
        [FromQuery, Entre(1, 36)] int meses = 12,
        [FromQuery, Mes] string? ate = null,
        CancellationToken ct = default) =>
        estatisticas.EvolucaoAsync(Uid, meses, ate, ct);

    /// <summary>
    /// O mês (por defeito, o atual) comparado com o anterior: gastos do dia a dia, despesas fixas,
    /// poupado, entrou e os gastos por categoria. No mês atual, os gastos do dia a dia do mês anterior
    /// contam só até ao mesmo dia (ateDia). Um mês futuro dá 400.
    /// </summary>
    [HttpGet("comparacao")]
    public Task<ComparacaoMesDto> Comparacao([FromQuery, Mes] string? mes, CancellationToken ct) =>
        estatisticas.ComparacaoAsync(Uid, mes, ct);

    /// <summary>
    /// A previsão do saldo no fim do mês atual: saldo - despesas fixas por pagar - gastos do dia a dia
    /// estimados (média diária dos últimos 3 meses × dias restantes + gastos recorrentes que faltam).
    /// </summary>
    [HttpGet("previsao")]
    public Task<PrevisaoFimMesDto> Previsao(CancellationToken ct) => estatisticas.PrevisaoAsync(Uid, ct);

    /// <summary>
    /// O que já se gastou no dia a dia por categoria, separado entre a conta e o cartão de alimentação: o mês atual até hoje
    /// e a média por mês dos últimos ?meses=6 meses completos (até 36; sem o mês atual). Só valores reais, sem previsões.
    /// </summary>
    [HttpGet("gastos-categorias")]
    public Task<GastosCategoriasDto> GastosCategorias([FromQuery, Entre(1, 36)] int meses = Calculos.MesesMediaGastos, CancellationToken ct = default) =>
        estatisticas.GastosCategoriasAsync(Uid, meses, ct);
}
