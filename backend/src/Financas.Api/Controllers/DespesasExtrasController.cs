using Financas.DAL.Entidades;
using Financas.Services;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>Despesas variáveis: saem da conta quando são registadas.</summary>
[Route("api/despesas-extras")]
public sealed class DespesasExtrasController(IDespesasExtrasService despesas) : ControladorBase
{
    /// <summary>Todas, ou só as de um mês (?mes=2026-10), da mais recente para a mais antiga.</summary>
    [HttpGet]
    public Task<IReadOnlyList<DespesaExtraDto>> Listar([FromQuery, Mes] string? mes, CancellationToken ct) =>
        despesas.ListarAsync(Uid, mes, ct);

    /// <summary>
    /// A categoria sugerida para um título (?titulo=Pingo Doce): a última usada nesse título, senão
    /// pelas palavras-chave, senão "outros". A app pré-escolhe-a no formulário.
    /// </summary>
    [HttpGet("sugerir-categoria")]
    public Task<SugestaoCategoria> SugerirCategoria([FromQuery, Maximo(200)] string? titulo, CancellationToken ct) =>
        despesas.SugerirCategoriaAsync(Uid, titulo, ct);

    /// <summary>
    /// Pesquisa em todos os meses (todos os filtros opcionais): texto no título (sem acentos nem
    /// maiúsculas), categoria, meio de pagamento, valores e datas (inclusive). Da mais recente para a
    /// mais antiga, por páginas, com o total e a soma de todos os resultados.
    /// </summary>
    [HttpGet("pesquisa")]
    public Task<PesquisaDespesasDto> Pesquisar(
        [FromQuery, Maximo(200)] string? texto,
        [FromQuery, Categoria] string? categoria,
        [FromQuery] MeioPagamento? meioPagamento,
        [FromQuery, DinheiroPositivo] decimal? valorMin,
        [FromQuery, DinheiroPositivo] decimal? valorMax,
        [FromQuery] DateOnly? de,
        [FromQuery] DateOnly? ate,
        CancellationToken ct,
        [FromQuery, Entre(1, 100000)] int pagina = 1,
        [FromQuery, Entre(1, 200)] int tamanho = 50) =>
        despesas.PesquisarAsync(Uid, new FiltroPesquisaDespesas(texto, categoria, meioPagamento, valorMin, valorMax, de, ate, pagina, tamanho), ct);

    /// <summary>
    /// Nova despesa (sai logo da conta ou do cartão). Com o cabeçalho <c>Idempotency-Key</c> (um UUID da
    /// app, até 64 caracteres), repetir o pedido não cria nem cobra outra vez: a primeira vez responde
    /// 201, as seguintes 200 com o mesmo id.
    /// </summary>
    [HttpPost]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Adicionar(
        NovaDespesaExtraPedido pedido,
        [FromHeader(Name = "Idempotency-Key"), Maximo(64)] string? chaveIdempotencia,
        CancellationToken ct)
    {
        var resultado = await despesas.AdicionarAsync(Uid, pedido, chaveIdempotencia, ct);
        return resultado.Criado ? Criado(resultado.Id) : Ok(new CriadoDto(resultado.Id));
    }

    /// <summary>Despesa de um mês passado: fica no histórico sem mexer na conta.</summary>
    [HttpPost("historicas")]
    [ProducesResponseType<CriadoDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> AdicionarHistorica(DespesaHistoricaPedido pedido, CancellationToken ct) =>
        Criado(await despesas.AdicionarHistoricaAsync(Uid, pedido, ct));

    [HttpPatch("{id}")]
    public async Task<IActionResult> Alterar(string id, AlterarDespesaExtraPedido pedido, CancellationToken ct)
    {
        await despesas.AlterarAsync(Uid, id, pedido, ct);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Remover(string id, CancellationToken ct)
    {
        await despesas.RemoverAsync(Uid, id, ct);
        return NoContent();
    }
}
