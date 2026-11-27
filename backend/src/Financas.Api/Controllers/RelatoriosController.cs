using Financas.Api.Limites;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Financas.Api.Controllers;

/// <summary>Relatórios para descarregar (PDF).</summary>
[Route("api/relatorios")]
public sealed class RelatoriosController(IRelatorioPdfService relatorios) : ControladorBase
{
    /// <summary>
    /// O relatório do mês em PDF (A4): números do mês, gráficos (distribuição, categorias, evolução de
    /// 12 meses) e tabelas (despesas, orçamentos, objetivos, poupanças, dívidas). Até ao mês atual.
    /// </summary>
    [HttpGet("mes/{mes}.pdf")]
    [EnableRateLimiting(LimitesPedidos.Pesados)]
    [Produces("application/pdf")]
    [ProducesResponseType<FileContentResult>(StatusCodes.Status200OK, "application/pdf")]
    public async Task<IActionResult> Mes([Mes] string mes, CancellationToken ct)
    {
        var pdf = await relatorios.GerarMesAsync(Uid, mes, ct);
        return File(pdf.Conteudo, "application/pdf", pdf.NomeFicheiro);
    }
}
