using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

[Route("api/grupos")]
public sealed class GruposController(IGruposService grupos) : ControladorBase
{
    [HttpGet]
    public Task<IReadOnlyList<GrupoDto>> Listar(CancellationToken ct) => grupos.ListarAsync(Uid, ct);

    [HttpGet("{id}")]
    public async Task<IActionResult> Obter(string id, CancellationToken ct)
    {
        var grupo = await grupos.ObterAsync(Uid, id, ct);
        return grupo is null ? NotFound() : Ok(grupo);
    }

    [HttpPost]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Criar(NovoGrupoPedido pedido, CancellationToken ct) =>
        Criado(await grupos.CriarAsync(Uid, pedido.Nome, ct));

    [HttpPut("{id}")]
    public async Task<IActionResult> Alterar(string id, AlterarGrupoPedido pedido, CancellationToken ct)
    {
        await grupos.AlterarAsync(Uid, id, pedido, ct);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Remover(string id, CancellationToken ct)
    {
        await grupos.RemoverAsync(Uid, id, ct);
        return NoContent();
    }

    [HttpGet("{id}/membros")]
    public Task<IReadOnlyList<GrupoMembroDto>> ListarMembros(string id, CancellationToken ct) =>
        grupos.ListarMembrosAsync(Uid, id, ct);

    [HttpDelete("{id}/membros/{membroUid}")]
    public async Task<IActionResult> RemoverMembro(string id, string membroUid, CancellationToken ct)
    {
        await grupos.RemoverMembroAsync(Uid, id, membroUid, ct);
        return NoContent();
    }

    [HttpPut("{id}/membros/{membroUid}/role")]
    public async Task<IActionResult> AlterarRole(string id, string membroUid, AlterarRoleMembroPedido pedido, CancellationToken ct)
    {
        await grupos.AlterarRoleAsync(Uid, id, membroUid, pedido.Role, ct);
        return NoContent();
    }

    [HttpPost("{id}/sair")]
    public async Task<IActionResult> Sair(string id, CancellationToken ct)
    {
        await grupos.SairAsync(Uid, id, ct);
        return NoContent();
    }

    // ---- Convites ----

    [HttpPost("{id}/convites")]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Convidar(string id, ConvidarMembroPedido pedido, CancellationToken ct) =>
        Criado(await grupos.ConvidarAsync(Uid, id, pedido.Email, ct));

    /// <summary>Os convites pendentes deste grupo.</summary>
    [HttpGet("{id}/convites")]
    public Task<IReadOnlyList<ConviteGrupoDto>> ListarConvitesEnviados(string id, CancellationToken ct) =>
        grupos.ListarConvitesEnviadosAsync(Uid, id, ct);

    /// <summary>Os convites para o email (confirmado) da sessão.</summary>
    [HttpGet("convites/recebidos")]
    public Task<ConvitesRecebidosDto> ListarConvitesRecebidos(CancellationToken ct) =>
        grupos.ListarConvitesRecebidosAsync(Uid, EmailVerificado, ct);

    [HttpPost("convites/{id}/aceitar")]
    public async Task<IActionResult> AceitarConvite(string id, CancellationToken ct)
    {
        await grupos.AceitarAsync(Uid, EmailVerificado, id, ct);
        return NoContent();
    }

    [HttpPost("convites/{id}/recusar")]
    public async Task<IActionResult> RecusarConvite(string id, CancellationToken ct)
    {
        await grupos.RecusarAsync(Uid, EmailVerificado, id, ct);
        return NoContent();
    }

    [HttpDelete("convites/{id}")]
    public async Task<IActionResult> CancelarConvite(string id, CancellationToken ct)
    {
        await grupos.CancelarConviteAsync(Uid, id, ct);
        return NoContent();
    }
}
