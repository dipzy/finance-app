using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>Configurações das versões anteriores da app (ainda usadas nos cálculos como recurso).</summary>
[Route("api/configuracoes")]
public sealed class ConfiguracoesController(IConfiguracoesService configuracoes) : ControladorBase
{
    [HttpGet("financeiro")]
    public async Task<ActionResult<FinancialDataDto>> ObterFinanceiro(CancellationToken ct) =>
        OkOuVazio(await configuracoes.ObterFinanceiroAsync(Uid, ct));

    [HttpPut("financeiro")]
    public async Task<IActionResult> GuardarFinanceiro(GuardarFinanceiroPedido pedido, CancellationToken ct)
    {
        await configuracoes.GuardarFinanceiroAsync(Uid, pedido, ct);
        return NoContent();
    }

    [HttpGet("ppr-poupanca")]
    public async Task<ActionResult<ConfigPprPoupancaDto>> ObterPprPoupanca(CancellationToken ct) =>
        OkOuVazio(await configuracoes.ObterPprPoupancaAsync(Uid, ct));

    [HttpPut("ppr-poupanca")]
    public async Task<IActionResult> GuardarPprPoupanca(ConfigPprPoupancaDto pedido, CancellationToken ct)
    {
        await configuracoes.GuardarPprPoupancaAsync(Uid, pedido, ct);
        return NoContent();
    }
}
