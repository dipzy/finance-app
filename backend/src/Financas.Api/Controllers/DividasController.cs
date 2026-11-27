using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

[Route("api/dividas")]
public sealed class DividasController(IDividasService dividas) : ControladorBase
{
    [HttpGet]
    public Task<IReadOnlyList<DividaDto>> Listar(CancellationToken ct) => dividas.ListarAsync(Uid, ct);

    /// <summary>Com o valor em falta calculado a partir das prestações pagas e, nos créditos com taxa, as contas do contrato.</summary>
    [HttpGet("estado")]
    public Task<IReadOnlyList<DividaComEstadoDto>> ListarComEstado(CancellationToken ct) => dividas.ListarComEstadoAsync(Uid, ct);

    [HttpPost]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Adicionar(NovaDividaPedido pedido, CancellationToken ct) =>
        Criado(await dividas.AdicionarAsync(Uid, pedido, ct));

    [HttpPatch("{id}")]
    public async Task<IActionResult> Alterar(string id, AlterarDividaPedido pedido, CancellationToken ct)
    {
        await dividas.AlterarAsync(Uid, id, pedido, ct);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Remover(string id, CancellationToken ct)
    {
        await dividas.RemoverAsync(Uid, id, ct);
        return NoContent();
    }

    /// <summary>
    /// Simula amortizar a dívida: de uma vez (manter ou reduzir a prestação), tudo de uma vez, ou pagando mais
    /// por mês. Não grava nada.
    /// </summary>
    [HttpPost("{id}/simulacao")]
    public Task<SimulacaoDividaDto> Simular(string id, SimularDividaPedido pedido, CancellationToken ct) =>
        dividas.SimularAsync(Uid, id, pedido, ct);

    /// <summary>Compara pagar só as prestações com a bola de neve e a avalanche, para todas as dívidas com prestação. Não grava nada.</summary>
    [HttpPost("estrategias")]
    public Task<ComparacaoEstrategiasDto> CompararEstrategias(CompararEstrategiasPedido pedido, CancellationToken ct) =>
        dividas.CompararEstrategiasAsync(Uid, pedido, ct);

    /// <summary>
    /// Lê o PDF do extrato de um crédito (em base64) e devolve o que diz: contrato, capital e próxima prestação.
    /// O PDF não fica guardado nem se grava nada: a dívida só muda em <c>extrato/aplicar</c>.
    /// </summary>
    [HttpPost("extrato/ler")]
    public Task<ExtratoLidoDto> LerExtrato(LerExtratoPedido pedido, CancellationToken ct) =>
        dividas.LerExtratoAsync(Uid, pedido.PdfBase64, ct);

    /// <summary>Atualiza (ou cria) a dívida com o extrato lido.</summary>
    [HttpPost("extrato/aplicar")]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status200OK)]
    public async Task<CriadoDto> AplicarExtrato(AplicarExtratoPedido pedido, CancellationToken ct) =>
        new(await dividas.AplicarExtratoAsync(Uid, pedido, ct));
}
