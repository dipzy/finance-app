using Financas.DAL.Entidades;
using Financas.Services;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>O histórico de alterações aos dados (registo de alterações / auditoria).</summary>
[Route("api/alteracoes")]
public sealed class AlteracoesController(IAlteracoesService alteracoes) : ControladorBase
{
    /// <summary>
    /// Da mais recente para a mais antiga. <c>entidade</c>: só de um tipo (ex.: DespesaFixa);
    /// <c>de</c>: só a partir desse dia. Guarda-se um ano.
    /// </summary>
    [HttpGet]
    public Task<PaginaAlteracoesDto> Listar(
        [FromQuery, Maximo(50)] string? entidade,
        [FromQuery] DateOnly? de,
        CancellationToken ct,
        [FromQuery, Entre(1, 100000)] int pagina = 1,
        [FromQuery, Entre(1, 100)] int tamanho = 30) =>
        alteracoes.ListarAsync(Uid, entidade, de, pagina, tamanho, ct);
}
