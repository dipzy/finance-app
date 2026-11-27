using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>Os mealheiros dos grupos (poupanças partilhadas) e as contribuições de cada membro.</summary>
[Route("api")]
public sealed class PoupancasPartilhadasController(
    IPoupancasPartilhadasService mealheiros,
    IPoupancasPartilhadasMembrosService contribuicoes) : ControladorBase
{
    [HttpGet("grupos/{grupoId}/poupancas-partilhadas")]
    public Task<IReadOnlyList<PoupancaPartilhadaDto>> Listar(string grupoId, CancellationToken ct) =>
        mealheiros.ListarDoGrupoAsync(Uid, grupoId, ct);

    [HttpPost("grupos/{grupoId}/poupancas-partilhadas")]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Criar(string grupoId, NovaPoupancaPartilhadaPedido pedido, CancellationToken ct) =>
        Criado(await mealheiros.CriarAsync(Uid, grupoId, pedido, ct));

    /// <summary>As contribuições configuradas pelo utilizador em todos os mealheiros.</summary>
    [HttpGet("poupancas-partilhadas/contribuicoes/minhas")]
    public Task<IReadOnlyList<PoupancaPartilhadaMembroDto>> MinhasContribuicoes(CancellationToken ct) =>
        contribuicoes.ListarDoMembroAsync(Uid, ct);

    [HttpGet("poupancas-partilhadas/{id}")]
    public Task<PoupancaPartilhadaDto> Obter(string id, CancellationToken ct) => mealheiros.ObterAsync(Uid, id, ct);

    [HttpPatch("poupancas-partilhadas/{id}")]
    public async Task<IActionResult> Alterar(string id, AlterarPoupancaPartilhadaPedido pedido, CancellationToken ct)
    {
        await mealheiros.AlterarAsync(Uid, id, pedido, ct);
        return NoContent();
    }

    [HttpDelete("poupancas-partilhadas/{id}")]
    public async Task<IActionResult> Remover(string id, CancellationToken ct)
    {
        await mealheiros.RemoverAsync(Uid, id, ct);
        return NoContent();
    }

    /// <summary>Pôr dinheiro no mealheiro (sai da conta).</summary>
    [HttpPost("poupancas-partilhadas/{id}/contribuir")]
    public async Task<IActionResult> Contribuir(string id, MovimentarPoupancaPartilhadaPedido pedido, CancellationToken ct)
    {
        await mealheiros.ContribuirAsync(Uid, id, pedido.Valor, ct);
        return NoContent();
    }

    /// <summary>Tirar dinheiro do mealheiro (entra na conta).</summary>
    [HttpPost("poupancas-partilhadas/{id}/levantar")]
    public async Task<IActionResult> Levantar(string id, MovimentarPoupancaPartilhadaPedido pedido, CancellationToken ct)
    {
        await mealheiros.LevantarAsync(Uid, id, pedido.Valor, ct);
        return NoContent();
    }

    [HttpGet("poupancas-partilhadas/{id}/movimentos")]
    public Task<IReadOnlyList<MovimentoPoupancaPartilhadaDto>> Movimentos(string id, CancellationToken ct) =>
        mealheiros.ListarMovimentosAsync(Uid, id, ct);

    [HttpGet("poupancas-partilhadas/{id}/contribuicoes")]
    public Task<IReadOnlyList<PoupancaPartilhadaMembroDto>> Contribuicoes(string id, CancellationToken ct) =>
        contribuicoes.ListarDaPoupancaAsync(Uid, id, ct);

    /// <summary>Cria ou substitui a contribuição do utilizador para este mealheiro.</summary>
    [HttpPut("poupancas-partilhadas/{id}/contribuicoes/minha")]
    public async Task<IActionResult> GuardarMinha(string id, NovaPoupancaPartilhadaMembroPedido pedido, CancellationToken ct) =>
        Ok(new CriadoDto(await contribuicoes.GuardarAsync(Uid, id, pedido, ct)));

    /// <summary>Marca (ou desmarca) que a minha contribuição manual deste mês já foi feita (não mexe no dinheiro).</summary>
    [HttpPost("poupancas-partilhadas/{id}/contribuicoes/minha/feita")]
    public async Task<IActionResult> MarcarFeita(string id, MarcarContribuicaoFeitaPedido pedido, CancellationToken ct)
    {
        await contribuicoes.MarcarFeitaAsync(Uid, id, pedido.Feita, ct);
        return NoContent();
    }

    [HttpDelete("poupancas-partilhadas/{id}/contribuicoes/minha")]
    public async Task<IActionResult> RemoverMinha(string id, CancellationToken ct)
    {
        await contribuicoes.RemoverAsync(Uid, id, ct);
        return NoContent();
    }
}
