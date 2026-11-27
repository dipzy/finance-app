using Financas.Api.Limites;
using Financas.Services;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Financas.Api.Controllers;

/// <summary>A folha do mês, com os blocos do livro Excel (a app gera e lê os ficheiros .xlsx).</summary>
[Route("api/folha")]
public sealed class FolhaController(IFolhaMesService folha) : ControladorBase
{
    /// <summary>Meses com dados, do primeiro até ao atual (para exportar).</summary>
    [HttpGet("meses")]
    public Task<IReadOnlyList<string>> MesesComDados(CancellationToken ct) => folha.MesesComDadosAsync(Uid, ct);

    [HttpGet("{mes}")]
    public Task<DadosFolhaMesDto> Obter([Mes] string mes, CancellationToken ct) => folha.ObterDadosAsync(Uid, mes, ct);

    /// <summary>Gravar uma folha lida do Excel como histórico desse mês (não duplica se repetida).</summary>
    [HttpPost("{mes}/importar")]
    [EnableRateLimiting(LimitesPedidos.Pesados)]
    public Task<ResumoImportacaoDto> Importar([Mes] string mes, ImportarFolhaPedido pedido, CancellationToken ct) =>
        folha.ImportarAsync(Uid, mes, pedido.Dados, pedido.Opcoes, ct);
}
