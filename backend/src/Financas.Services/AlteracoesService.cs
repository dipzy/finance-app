using System.Text.Json;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;

namespace Financas.Services;

// O histórico de alterações (as linhas são escritas pelo InterceptorAuditoria, na DAL).
// Retenção: guarda-se um ano. Em vez de uma tarefa agendada (o plano grátis do Render adormece),
// as linhas mais antigas são apagadas "preguiçosamente" quando o utilizador abre o histórico.
internal sealed class AlteracoesService(IRegistosAlteracaoRepository registos, Relogio relogio) : IAlteracoesService
{
    public async Task<PaginaAlteracoesDto> ListarAsync(
        string uid,
        string? entidade,
        DateOnly? de,
        int pagina,
        int tamanho,
        CancellationToken ct = default)
    {
        await registos.ApagarAnterioresAsync(uid, relogio.Agora.UtcDateTime.AddYears(-1), ct);

        // "de" é um dia em Portugal: a meia-noite de Lisboa, em UTC
        DateTime? desde = de is { } dia ? TimeZoneInfo.ConvertTimeToUtc(dia.ToDateTime(TimeOnly.MinValue), relogio.Fuso) : null;
        var (itens, total) = await registos.ListarAsync(uid, entidade, desde, pagina, tamanho, ct);
        return new PaginaAlteracoesDto(total, pagina, tamanho, [.. itens.Select(ParaDto)]);
    }

    private static RegistoAlteracaoDto ParaDto(RegistoAlteracao r) => new(
        r.Id,
        r.Entidade,
        r.EntidadeId,
        r.Descricao,
        r.Acao,
        // O SQLite devolve as datas sem "Kind": são sempre UTC
        new DateTimeOffset(DateTime.SpecifyKind(r.Quando, DateTimeKind.Utc)),
        r.Alteracoes is null ? null : JsonDocument.Parse(r.Alteracoes).RootElement.Clone(),
        r.Origem);
}
