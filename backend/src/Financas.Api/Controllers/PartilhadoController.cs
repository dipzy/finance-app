using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>Despesas partilhadas, acertos de contas e saldos dos grupos.</summary>
[Route("api")]
public sealed class PartilhadoController(IPartilhadoService partilhado) : ControladorBase
{
    /// <summary>A parte partilhada para o Início e o Resumo do mês.</summary>
    [HttpGet("partilhado/resumo")]
    public Task<ResumoPartilhadoDto> Resumo([FromQuery, Mes] string? mes, CancellationToken ct) =>
        partilhado.ResumoAsync(Uid, EmailVerificado, mes, ct);

    /// <summary>Quem deve a quem no grupo (com os pagamentos sugeridos para acertar tudo).</summary>
    [HttpGet("grupos/{grupoId}/saldos")]
    public Task<SaldosGrupoDto> Saldos(string grupoId, CancellationToken ct) => partilhado.SaldosAsync(Uid, grupoId, ct);

    /// <summary>O feed do grupo: despesas, acertos e mealheiros, do mais recente para o mais antigo.</summary>
    [HttpGet("grupos/{grupoId}/atividade")]
    public Task<IReadOnlyList<AtividadeDto>> Atividade(string grupoId, [FromQuery] int limite = 50, CancellationToken ct = default) =>
        partilhado.AtividadeAsync(Uid, grupoId, limite, ct);

    [HttpPost("grupos/{grupoId}/despesas")]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> CriarDespesa(string grupoId, DespesaPartilhadaPedido pedido, CancellationToken ct) =>
        Criado(await partilhado.CriarDespesaAsync(Uid, grupoId, pedido, ct));

    [HttpGet("despesas-partilhadas/{id}")]
    public Task<DespesaPartilhadaDto> ObterDespesa(string id, CancellationToken ct) => partilhado.ObterDespesaAsync(Uid, id, ct);

    [HttpPut("despesas-partilhadas/{id}")]
    public async Task<IActionResult> AlterarDespesa(string id, DespesaPartilhadaPedido pedido, CancellationToken ct)
    {
        await partilhado.AlterarDespesaAsync(Uid, id, pedido, ct);
        return NoContent();
    }

    /// <summary>Aceitar a minha parte de uma despesa partilhada.</summary>
    [HttpPost("despesas-partilhadas/{id}/aceitar")]
    public async Task<IActionResult> AceitarDespesa(string id, CancellationToken ct)
    {
        await partilhado.AceitarDespesaAsync(Uid, id, ct);
        return NoContent();
    }

    /// <summary>Recusar a minha parte: o valor reparte-se pelos outros participantes.</summary>
    [HttpPost("despesas-partilhadas/{id}/recusar")]
    public async Task<IActionResult> RecusarDespesa(string id, CancellationToken ct)
    {
        await partilhado.RecusarDespesaAsync(Uid, id, ct);
        return NoContent();
    }

    [HttpDelete("despesas-partilhadas/{id}")]
    public async Task<IActionResult> RemoverDespesa(string id, CancellationToken ct)
    {
        await partilhado.RemoverDespesaAsync(Uid, id, ct);
        return NoContent();
    }

    [HttpPost("grupos/{grupoId}/acertos")]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> CriarAcerto(string grupoId, NovoAcertoPedido pedido, CancellationToken ct) =>
        Criado(await partilhado.CriarAcertoAsync(Uid, grupoId, pedido, ct));

    /// <summary>Confirmar que recebi um acerto: o dinheiro entra na minha conta.</summary>
    [HttpPost("acertos/{id}/confirmar")]
    public async Task<IActionResult> ConfirmarAcerto(string id, CancellationToken ct)
    {
        await partilhado.ConfirmarAcertoAsync(Uid, id, ct);
        return NoContent();
    }

    [HttpDelete("acertos/{id}")]
    public async Task<IActionResult> RemoverAcerto(string id, CancellationToken ct)
    {
        await partilhado.RemoverAcertoAsync(Uid, id, ct);
        return NoContent();
    }
}
