using Financas.Api.Limites;
using Financas.Services;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Financas.Api.Controllers;

/// <summary>Histórico de cada mês (saldo inicial/final, salário recebido, blocos importados).</summary>
[Route("api/meses")]
public sealed class MesesController(IMesesService meses) : ControladorBase
{
    [HttpGet("{mes}")]
    public async Task<ActionResult<ResumoMesDto>> Obter([Mes] string mes, CancellationToken ct) =>
        await meses.ObterAsync(Uid, mes, ct) is { } resumo
            ? resumo
            : Problem(statusCode: StatusCodes.Status404NotFound, title: Textos.T("Não encontrado"), detail: Textos.T($"Sem histórico de {mes}."));

    /// <summary>Guardar blocos importados do Excel (junta-os aos que já existiam nesse mês).</summary>
    [HttpPut("{mes}/importado")]
    public async Task<IActionResult> GuardarImportado([Mes] string mes, BlocosImportadosDto importado, CancellationToken ct)
    {
        await meses.GuardarImportadoAsync(Uid, mes, importado, ct);
        return NoContent();
    }

    /// <summary>Registar o saldo inicial do mês atual (também acontece em GET /api/conta/saldo).</summary>
    [HttpPost("abertura")]
    public async Task<IActionResult> RegistarAbertura(CancellationToken ct)
    {
        await meses.RegistarAberturaAsync(Uid, ct);
        return NoContent();
    }
}
