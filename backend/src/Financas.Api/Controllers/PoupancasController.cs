using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

[Route("api/poupancas")]
public sealed class PoupancasController(IPoupancasService poupancas) : ControladorBase
{
    [HttpGet]
    public Task<IReadOnlyList<PoupancaDto>> Listar(CancellationToken ct) => poupancas.ListarAsync(Uid, ct);

    [HttpPost]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Adicionar(NovaPoupancaPedido pedido, CancellationToken ct) =>
        Criado(await poupancas.AdicionarAsync(Uid, pedido, ct));

    [HttpPatch("{id}")]
    public async Task<IActionResult> Alterar(string id, AlterarPoupancaPedido pedido, CancellationToken ct)
    {
        await poupancas.AlterarAsync(Uid, id, pedido, ct);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Remover(string id, CancellationToken ct)
    {
        await poupancas.RemoverAsync(Uid, id, ct);
        return NoContent();
    }

    /// <summary>Movimento no saldo da poupança (ex.: levantamento, valor negativo). Não mexe na conta corrente.</summary>
    [HttpPost("{id}/ajustar")]
    public async Task<IActionResult> Ajustar(string id, ValorPedido pedido, CancellationToken ct)
    {
        await poupancas.AjustarSaldoAsync(Uid, id, pedido.Valor, ct);
        return NoContent();
    }

    [HttpPut("{id}/saldo")]
    public async Task<IActionResult> DefinirSaldo(string id, DefinirSaldoPedido pedido, CancellationToken ct)
    {
        await poupancas.DefinirSaldoAsync(Uid, id, pedido.Saldo, ct);
        return NoContent();
    }

    /// <summary>Da conta corrente para a poupança (valor negativo: da poupança para a conta).</summary>
    [HttpPost("{id}/transferir")]
    public async Task<IActionResult> Transferir(string id, ValorPedido pedido, CancellationToken ct)
    {
        await poupancas.TransferirDaContaAsync(Uid, id, pedido.Valor, ct);
        return NoContent();
    }

    /// <summary>
    /// Regista a contribuição manual configurada, uma vez por mês. Sem <c>mes</c> é a do mês atual; com <c>mes</c>
    /// ("AAAA-MM") regulariza um dos últimos 3 meses que ficou por enviar (sai da conta agora).
    /// </summary>
    [HttpPost("{id}/contribuir")]
    public async Task<ResultadoContribuicaoPoupancaDto> Contribuir(string id, [FromQuery, Mes] string? mes, CancellationToken ct) =>
        new(await poupancas.ContribuirManualmenteAsync(Uid, id, mes, ct));

    /// <summary>
    /// Quanto vale a poupança daqui a <c>meses</c> meses (1 a 600). Usa a taxa da poupança, ou a <c>taxa</c> (% anual)
    /// para simular outra; <c>contribuicoes=false</c> ignora as contribuições mensais. Só uma estimativa.
    /// </summary>
    [HttpGet("{id}/projecao")]
    public Task<ProjecaoPoupancaDto> Projecao(string id, [FromQuery] int meses = 12, [FromQuery] decimal? taxa = null, [FromQuery] bool contribuicoes = true, CancellationToken ct = default) =>
        poupancas.ProjetarAsync(Uid, id, meses, taxa, contribuicoes, ct);

    /// <summary>As contribuições manuais dos últimos 3 meses (sem contar o atual) que ficaram por enviar.</summary>
    [HttpGet("em-atraso")]
    public Task<IReadOnlyList<ContribuicaoEmAtrasoDto>> EmAtraso(CancellationToken ct) => poupancas.ContribuicoesEmAtrasoAsync(Uid, ct);
}
