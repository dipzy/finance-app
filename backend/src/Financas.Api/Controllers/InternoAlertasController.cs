using System.Security.Cryptography;
using System.Text;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Push;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Financas.Api.Controllers;

/// <summary>
/// Endpoints internos, chamados por um cron (GitHub Actions) e não pela app: sem token de utilizador,
/// protegidos pelo segredo no cabeçalho <c>X-Cron-Secret</c>.
/// </summary>
[ApiController]
[AllowAnonymous]
[Produces("application/json")]
[Route("api/interno/alertas")]
public sealed class InternoAlertasController(IAlertasEnvioService envio, IOptions<OpcoesAlertas> opcoes) : ControllerBase
{
    public const string CabecalhoSegredo = "X-Cron-Secret";

    /// <summary>
    /// Envia por push (Expo) os alertas que ainda não foram enviados, a todos os utilizadores com dispositivos
    /// registados. Sem <c>Alertas__SegredoCron</c> configurado o endpoint está desativado (404); com o segredo,
    /// um cabeçalho em falta ou errado dá 401.
    /// </summary>
    [HttpPost("enviar")]
    public async Task<ActionResult<ResultadoEnvioAlertasDto>> Enviar(CancellationToken ct)
    {
        var segredo = opcoes.Value.SegredoCron;
        if (string.IsNullOrWhiteSpace(segredo))
        {
            return NotFound(); // desativado
        }

        if (!IguaisSemPistas(segredo, Request.Headers[CabecalhoSegredo].ToString()))
        {
            return Unauthorized();
        }

        return await envio.EnviarAsync(ct);
    }

    // Comparação em tempo constante: o tempo da resposta não diz quantos carateres estão certos
    private static bool IguaisSemPistas(string esperado, string recebido) =>
        CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(esperado)),
            SHA256.HashData(Encoding.UTF8.GetBytes(recebido)));
}
