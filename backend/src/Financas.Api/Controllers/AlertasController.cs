using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>Alertas proativos calculados no servidor.</summary>
[Route("api/alertas")]
public sealed class AlertasController(IAlertasService alertas) : ControladorBase
{
    /// <summary>
    /// Os alertas de agora, os mais graves primeiro: orçamentos a 80% ou 100%, despesas mensais e prestações de
    /// dívidas a vencer (3 dias ou menos) ou vencidas, objetivos de poupança atrasados. Só lê: não recebe o
    /// salário nem faz débitos. Os textos vêm na língua do <c>Accept-Language</c>.
    /// </summary>
    [HttpGet]
    public Task<IReadOnlyList<AlertaDto>> Listar(CancellationToken ct) => alertas.ListarAsync(Uid, ct);
}
