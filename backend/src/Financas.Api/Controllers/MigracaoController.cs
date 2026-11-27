using Financas.Api.Limites;
using Financas.Services;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Financas.Api.Controllers;

/// <summary>Cópia única dos dados do Firestore (e dos dados locais muito antigos) para esta API.</summary>
[Route("api/migracao")]
public sealed class MigracaoController(IMigracaoService migracao, IPreparacaoDadosService preparacao) : ControladorBase
{
    /// <summary>Se o servidor já tem dados deste utilizador e se a cópia do Firestore já foi feita.</summary>
    [HttpGet("estado")]
    public Task<EstadoMigracaoDto> Estado(CancellationToken ct) => migracao.ObterEstadoAsync(Uid, ct);

    /// <summary>Copiar os dados do Firestore (só se o servidor ainda não tiver dados: senão 409).</summary>
    [HttpPost]
    [EnableRateLimiting(LimitesPedidos.Pesados)]
    public Task<ResumoMigracaoDto> Importar(DadosFirestoreDto dados, CancellationToken ct) =>
        migracao.ImportarFirestoreAsync(Uid, dados, ct);

    /// <summary>Juntar os dados que a versão muito antiga da app guardava só no dispositivo.</summary>
    [HttpPost("local")]
    [EnableRateLimiting(LimitesPedidos.Pesados)]
    public Task<ResumoMigracaoDto> ImportarLocal(DadosLocaisDto dados, CancellationToken ct) =>
        migracao.ImportarDadosLocaisAsync(Uid, dados, ct);

    /// <summary>Converter os dados de versões anteriores (corre uma vez; também acontece em GET /api/conta/saldo).</summary>
    [HttpPost("preparar")]
    public async Task<IActionResult> Preparar(CancellationToken ct)
    {
        await preparacao.PrepararAsync(Uid, ct);
        return NoContent();
    }
}
