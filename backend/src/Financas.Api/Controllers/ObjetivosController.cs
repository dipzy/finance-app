using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>Objetivos de poupança, com o progresso e o ritmo calculados para o mês atual.</summary>
[Route("api/objetivos")]
public sealed class ObjetivosController(IObjetivosService objetivos) : ControladorBase
{
    [HttpGet]
    public Task<IReadOnlyList<ObjetivoDto>> Listar(CancellationToken ct) => objetivos.ListarAsync(Uid, ct);

    [HttpGet("{id}")]
    public Task<ObjetivoDto> Obter(string id, CancellationToken ct) => objetivos.ObterAsync(Uid, id, ct);

    [HttpPost]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Adicionar(NovoObjetivoPedido pedido, CancellationToken ct) =>
        Criado(await objetivos.AdicionarAsync(Uid, pedido, ct));

    /// <summary>Só os campos enviados mudam; "poupancaId" em "limpar" desliga a poupança.</summary>
    [HttpPatch("{id}")]
    public async Task<IActionResult> Alterar(string id, AlterarObjetivoPedido pedido, CancellationToken ct)
    {
        await objetivos.AlterarAsync(Uid, id, pedido, ct);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Remover(string id, CancellationToken ct)
    {
        await objetivos.RemoverAsync(Uid, id, ct);
        return NoContent();
    }
}
