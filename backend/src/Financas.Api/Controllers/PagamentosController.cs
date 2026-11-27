using Financas.DAL.Entidades;
using Financas.Services;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>O que aconteceu a cada despesa mensal em cada mês.</summary>
[Route("api/pagamentos")]
public sealed class PagamentosController(IDespesasFixasService despesas) : ControladorBase
{
    /// <summary>Os pagamentos de um mês (?mes=2026-10) ou de uma despesa (?fixaId=...).</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PagamentoFixaDto>>> Listar(
        [FromQuery, Mes] string? mes,
        [FromQuery] string? fixaId,
        CancellationToken ct)
    {
        if (mes is not null)
        {
            return Ok(await despesas.ListarPagamentosDoMesAsync(Uid, mes, ct));
        }

        if (!string.IsNullOrEmpty(fixaId))
        {
            return Ok(await despesas.ListarPagamentosDaDespesaAsync(Uid, fixaId, ct));
        }

        return Problem(statusCode: StatusCodes.Status400BadRequest, title: Textos.T("Pedido inválido"), detail: Textos.T("Indica o mês (?mes=AAAA-MM) ou a despesa (?fixaId=...)."));
    }

    /// <summary>Registar um pagamento de um mês passado (histórico, não mexe na conta).</summary>
    [HttpPut("{mes}/{fixaId}")]
    public async Task<IActionResult> RegistarHistorico([Mes] string mes, string fixaId, RegistarPagamentoPedido pedido, CancellationToken ct)
    {
        await despesas.RegistarPagamentoHistoricoAsync(Uid, mes, fixaId, pedido, ct);
        return NoContent();
    }
}
