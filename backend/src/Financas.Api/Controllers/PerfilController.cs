using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

[Route("api/perfil")]
public sealed class PerfilController(IPerfilService perfil) : ControladorBase
{
    [HttpGet]
    public async Task<ActionResult<PerfilDto>> Obter(CancellationToken ct) => OkOuVazio(await perfil.ObterAsync(Uid, ct));

    /// <summary>Guardar o email e o nome (no registo de uma conta nova).</summary>
    [HttpPut]
    public async Task<IActionResult> Guardar(GuardarPerfilPedido pedido, CancellationToken ct)
    {
        await perfil.GuardarAsync(Uid, pedido, ct);
        return NoContent();
    }
}
