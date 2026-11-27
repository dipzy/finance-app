using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>
/// Regras de categorização automática: "se a descrição contém X, a categoria é Y". Usadas ao registar
/// despesas extras, gastos recorrentes, despesas partilhadas e ao importar a folha, quando não se escolhe categoria.
/// </summary>
[Route("api/regras-categoria")]
public sealed class RegrasCategoriaController(IRegrasCategoriaService regras) : ControladorBase
{
    /// <summary>As regras do utilizador (ativas ou não), pela ordem em que foram criadas.</summary>
    [HttpGet]
    public Task<IReadOnlyList<RegraCategoriaDto>> Listar(CancellationToken ct) => regras.ListarAsync(Uid, ct);

    /// <summary>As regras que vêm com a aplicação (só leitura; as do utilizador ganham-lhes).</summary>
    [HttpGet("padrao")]
    public IReadOnlyList<RegraPadraoDto> Padrao() => regras.ListarPadrao();

    /// <summary>
    /// A categoria para uma descrição, pela ordem: regras do utilizador ("regra"), histórico, palavras-chave,
    /// regras padrão ("regra-padrao"), "outros". Devolve também o texto da regra que serviu.
    /// </summary>
    [HttpGet("sugerir")]
    public Task<SugestaoCategoria> Sugerir([FromQuery, Maximo(200)] string? descricao, CancellationToken ct) =>
        regras.SugerirAsync(Uid, descricao, ct);

    /// <summary>Nova regra. Repetir o texto (sem maiúsculas nem acentos) dá 409.</summary>
    [HttpPost]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Adicionar(NovaRegraCategoriaPedido pedido, CancellationToken ct) =>
        Criado(await regras.AdicionarAsync(Uid, pedido, ct));

    /// <summary>Substitui a regra toda (sem "ativa" fica ativa; sem "prioridade" fica 0).</summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> Substituir(string id, NovaRegraCategoriaPedido pedido, CancellationToken ct)
    {
        await regras.SubstituirAsync(Uid, id, pedido, ct);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Remover(string id, CancellationToken ct)
    {
        await regras.RemoverAsync(Uid, id, ct);
        return NoContent();
    }
}
