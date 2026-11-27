using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>Limites mensais de gastos por categoria de despesas extras.</summary>
[Route("api/orcamentos")]
public sealed class OrcamentosController(IOrcamentosService orcamentos) : ControladorBase
{
    [HttpGet]
    public Task<IReadOnlyList<OrcamentoDto>> Listar(CancellationToken ct) => orcamentos.ListarAsync(Uid, ct);

    /// <summary>Gasto, percentagem e estado (ok / perto a partir de 80% / ultrapassado a partir de 100%) de cada orçamento no mês.</summary>
    [HttpGet("estado")]
    public Task<IReadOnlyList<EstadoOrcamentoDto>> Estado([FromQuery, Mes] string? mes, CancellationToken ct) =>
        orcamentos.EstadoAsync(Uid, mes, ct);

    /// <summary>Um orçamento por categoria (se a categoria já tiver um: 409).</summary>
    [HttpPost]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Adicionar(NovoOrcamentoPedido pedido, CancellationToken ct) =>
        Criado(await orcamentos.AdicionarAsync(Uid, pedido, ct));

    [HttpPatch("{id}")]
    public async Task<IActionResult> Alterar(string id, AlterarOrcamentoPedido pedido, CancellationToken ct)
    {
        await orcamentos.AlterarAsync(Uid, id, pedido, ct);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Remover(string id, CancellationToken ct)
    {
        await orcamentos.RemoverAsync(Uid, id, ct);
        return NoContent();
    }
}
