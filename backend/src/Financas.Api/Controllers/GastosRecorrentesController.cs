using Financas.DAL.Entidades;
using Financas.Services;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>Gastos do dia a dia que se repetem: geram despesas extras sozinhos nos dias certos.</summary>
[Route("api/gastos-recorrentes")]
public sealed class GastosRecorrentesController(IGastosRecorrentesService gastos) : ControladorBase
{
    [HttpGet]
    public Task<IReadOnlyList<GastoRecorrenteDto>> Listar(CancellationToken ct) => gastos.ListarAsync(Uid, ct);

    [HttpGet("{id}")]
    public Task<GastoRecorrenteDto> Obter(string id, CancellationToken ct) => gastos.ObterAsync(Uid, id, ct);

    /// <summary>Cria o gasto e gera logo as repetições até hoje (incluindo a de hoje).</summary>
    [HttpPost]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Adicionar(NovoGastoRecorrentePedido pedido, CancellationToken ct) =>
        Criado(await gastos.AdicionarAsync(Uid, pedido, ct));

    /// <summary>Alterar (título, valor, categoria, meio, fim) ou pôr em pausa/retomar (<c>ativo</c>).</summary>
    [HttpPatch("{id}")]
    public async Task<IActionResult> Alterar(string id, AlterarGastoRecorrentePedido pedido, CancellationToken ct)
    {
        await gastos.AlterarAsync(Uid, id, pedido, ct);
        return NoContent();
    }

    /// <summary>Apaga a regra; as despesas já geradas ficam.</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Remover(string id, CancellationToken ct)
    {
        await gastos.RemoverAsync(Uid, id, ct);
        return NoContent();
    }
}
