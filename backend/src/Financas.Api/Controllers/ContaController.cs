using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Financas.Api.Controllers;

/// <summary>Conta corrente e saldos.</summary>
[Route("api/conta")]
public sealed class ContaController(IContaService conta, IApagarContaService apagarConta) : ControladorBase
{
    /// <summary>O saldo guardado, sem processar nada (ContaCorrenteDB.getSaldo).</summary>
    [HttpGet]
    public Task<ContaCorrenteDto> Obter(CancellationToken ct) => conta.ObterAsync(Uid, ct);

    /// <summary>
    /// Saldo Disponível (calcularSaldoDisponivel): antes de responder converte dados antigos,
    /// regista o início do mês, recebe o salário se for o dia e faz os débitos automáticos.
    /// </summary>
    [HttpGet("saldo")]
    public async Task<SaldoDto> SaldoDisponivel(CancellationToken ct) => new(await conta.CalcularSaldoDisponivelAsync(Uid, ct));

    /// <summary>Disponível, Previsto e Por pagar do mês (por defeito, o atual). Faz o mesmo processamento que /saldo.</summary>
    [HttpGet("saldos")]
    public Task<Saldos> Saldos([FromQuery, Mes] string? mes, CancellationToken ct) => conta.CalcularSaldosAsync(Uid, mes, ct);

    /// <summary>Acertar o saldo da conta para um valor.</summary>
    [HttpPut("saldo")]
    public async Task<IActionResult> DefinirSaldo(DefinirSaldoPedido pedido, CancellationToken ct)
    {
        await conta.DefinirSaldoAsync(Uid, pedido.Saldo, ct);
        return NoContent();
    }

    /// <summary>O cartão de alimentação: saldo (fora do Saldo Disponível) e o valor que carrega no dia do salário.</summary>
    [HttpGet("cartao-alimentacao")]
    public Task<CartaoAlimentacaoDto> CartaoAlimentacao(CancellationToken ct) => conta.ObterCartaoAlimentacaoAsync(Uid, ct);

    /// <summary>Acertar o saldo do cartão de alimentação para o valor real.</summary>
    [HttpPut("cartao-alimentacao")]
    public async Task<IActionResult> DefinirCartaoAlimentacao(DefinirSaldoPedido pedido, CancellationToken ct)
    {
        await conta.DefinirCartaoAlimentacaoAsync(Uid, pedido.Saldo, ct);
        return NoContent();
    }

    /// <summary>
    /// Apagar a conta e TODOS os dados do utilizador (RGPD): corpo <c>{ "confirmacao": "APAGAR" }</c>, senão 400.
    /// Nos grupos com mais gente os dados dos outros ficam (ver <see cref="IApagarContaService"/>). Não apaga o
    /// utilizador no Firebase: é a app que o faz depois. Também em <c>POST /api/conta/apagar</c> (para quem
    /// não consegue enviar corpo num DELETE).
    /// </summary>
    [HttpDelete]
    [HttpPost("apagar")]
    [EnableRateLimiting("pesados")]
    public async Task<IActionResult> Apagar(ApagarContaPedido? pedido, CancellationToken ct)
    {
        // Sem corpo, pedido é null e o serviço responde 400 (em vez de 415)
        await apagarConta.ApagarAsync(Uid, EmailVerificado, pedido?.Confirmacao, ct);
        return NoContent();
    }

    /// <summary>Adicionar (valor positivo) ou tirar (negativo) dinheiro da conta.</summary>
    [HttpPost("movimentos")]
    public async Task<IActionResult> Movimentar(ValorPedido pedido, CancellationToken ct)
    {
        await conta.MovimentarAsync(Uid, pedido.Valor, ct);
        return NoContent();
    }
}
