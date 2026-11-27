using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>Os dispositivos registados para receber notificações push (token do Expo).</summary>
[Route("api/dispositivos")]
public sealed class DispositivosController(IDispositivosService dispositivos) : ControladorBase
{
    [HttpGet]
    public Task<IReadOnlyList<DispositivoDto>> Listar(CancellationToken ct) => dispositivos.ListarAsync(Uid, ct);

    /// <summary>
    /// Regista (ou renova) o dispositivo: pode ser chamado sempre que a app abre. O mesmo token só existe
    /// uma vez: se era de outra conta, passa para esta. Token inválido ou plataforma desconhecida: 400.
    /// </summary>
    [HttpPost]
    public Task<DispositivoDto> Registar(RegistarDispositivoPedido pedido, CancellationToken ct) =>
        dispositivos.RegistarAsync(Uid, pedido, ct);

    /// <summary>Deixa de receber push neste dispositivo (<c>?token=...</c>). Apagar um token que não existe não dá erro.</summary>
    [HttpDelete]
    public async Task<IActionResult> Remover([FromQuery, Obrigatorio, Maximo(200)] string token, CancellationToken ct)
    {
        await dispositivos.RemoverAsync(Uid, token, ct);
        return NoContent();
    }
}
