using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

[Route("api/salario")]
public sealed class SalarioController(ISalarioService salario) : ControladorBase
{
    /// <summary>A configuração do salário, ou 204 se ainda não foi configurado.</summary>
    [HttpGet]
    public async Task<ActionResult<SalarioConfigDto>> Obter(CancellationToken ct) => OkOuVazio(await salario.ObterAsync(Uid, ct));

    [HttpPut]
    public async Task<IActionResult> Guardar(GuardarSalarioPedido pedido, CancellationToken ct)
    {
        await salario.GuardarAsync(Uid, pedido, ct);
        return NoContent();
    }

    /// <summary>Receber o salário se hoje for o dia (e ainda não tiver entrado este mês). 204 se não havia nada a receber.</summary>
    [HttpPost("receber")]
    public async Task<ActionResult<RecebimentoDto>> Receber(CancellationToken ct) =>
        OkOuVazio(await salario.ProcessarRecebimentoAsync(Uid, ct));

    /// <summary>
    /// Recebimento manual (só com o recebimento manual ligado): marca o salário deste mês como recebido, com o valor que
    /// entrou de facto (sem valor, o configurado). Uma vez por mês; depois responde 409.
    /// </summary>
    [HttpPost("receber-manual")]
    public async Task<RecebimentoDto> ReceberManual(ReceberSalarioPedido pedido, CancellationToken ct) =>
        await salario.ReceberManualAsync(Uid, pedido.Valor, ct);
}
