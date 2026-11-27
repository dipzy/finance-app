using Financas.DAL.Entidades;
using Financas.Services;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>Despesas mensais e anuais (o "modelo" que se repete).</summary>
[Route("api/despesas-fixas")]
public sealed class DespesasFixasController(IDespesasFixasService despesas) : ControladorBase
{
    [HttpGet]
    public Task<IReadOnlyList<DespesaFixaDto>> Listar(CancellationToken ct) => despesas.ListarAsync(Uid, ct);

    [HttpPost]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Adicionar(NovaDespesaFixaPedido pedido, CancellationToken ct) =>
        Criado(await despesas.AdicionarAsync(Uid, pedido, ct));

    [HttpPatch("{id}")]
    public async Task<IActionResult> Alterar(string id, AlterarDespesaFixaPedido pedido, CancellationToken ct)
    {
        await despesas.AlterarAsync(Uid, id, pedido, ct);
        return NoContent();
    }

    /// <summary>Deixar de repetir (o histórico fica). Sem pagamentos nenhuns, é apagada.</summary>
    [HttpPost("{id}/terminar")]
    public async Task<IActionResult> Terminar(string id, CancellationToken ct)
    {
        await despesas.TerminarAsync(Uid, id, ct);
        return NoContent();
    }

    /// <summary>Pagar no mês (por defeito, o atual): "debitada", "ja-debitada" ou "saldo-insuficiente".</summary>
    [HttpPost("{id}/debitar")]
    public async Task<ResultadoDebitoDto> Debitar(string id, [FromQuery, Mes] string? mes, CancellationToken ct) =>
        new(await despesas.DebitarAsync(Uid, id, mes, ct));

    /// <summary>Paga apenas parte do valor da despesa no mês (por defeito, o atual).</summary>
    [HttpPost("{id}/debitar-parcial")]
    public async Task<ResultadoDebitoDto> DebitarParcial(string id, [FromQuery, Mes] string? mes, DebitarParcialPedido pedido, CancellationToken ct) =>
        new(await despesas.DebitarParcialAsync(Uid, id, pedido.Valor, mes, ct));

    /// <summary>
    /// Paga a despesa do mês com o valor real da fatura (e o consumo, se houver): o que já estava pago em parte conta e
    /// só a diferença sai da conta. Numa despesa variável a estimativa passa a ser a média das últimas 3 faturas.
    /// </summary>
    [HttpPost("{id}/pagar-fatura")]
    public async Task<ResultadoDebitoDto> PagarFatura(string id, [FromQuery, Mes] string? mes, PagarFaturaPedido pedido, CancellationToken ct) =>
        new(await despesas.PagarFaturaAsync(Uid, id, pedido, mes, ct));

    /// <summary>Desfazer o pagamento do mês: o valor volta à conta.</summary>
    [HttpPost("{id}/anular")]
    public async Task<AnulacaoDto> Anular(string id, [FromQuery, Mes] string? mes, CancellationToken ct) =>
        new(await despesas.AnularDebitoAsync(Uid, id, mes, ct));

    /// <summary>Débitos automáticos das despesas cujo dia já chegou (também correm em GET /api/conta/saldo).</summary>
    [HttpPost("debitos-automaticos")]
    public async Task<TotalDto> DebitosAutomaticos(CancellationToken ct) => new(await despesas.ProcessarDebitosAutomaticosAsync(Uid, ct));

    /// <summary>Pagas, por pagar e total das despesas mensais de um mês.</summary>
    [HttpGet("totais")]
    public Task<TotaisFixas> Totais([FromQuery, Mes] string? mes, CancellationToken ct) => despesas.CalcularTotaisAsync(Uid, mes, ct);
}
