using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;

namespace Financas.Services;

internal sealed class PerfilService(IUtilizadoresRepository utilizadores, IUnitOfWork unitOfWork, Relogio relogio) : IPerfilService
{
    public async Task<PerfilDto?> ObterAsync(string uid, CancellationToken ct = default)
    {
        var utilizador = await utilizadores.ObterAsync(uid, ct);
        return utilizador is null ? null : new PerfilDto(utilizador.Email, utilizador.Nome);
    }

    public Task GuardarAsync(string uid, GuardarPerfilPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, relogio.Agora, c);
                utilizador.Email = pedido.Email?.Trim() ?? utilizador.Email;
                utilizador.Nome = pedido.Name?.Trim() ?? utilizador.Nome;
            },
            ct);
}

internal sealed class ConfiguracoesService(IUtilizadoresRepository utilizadores, IUnitOfWork unitOfWork, Relogio relogio)
    : IConfiguracoesService
{
    public async Task<FinancialDataDto?> ObterFinanceiroAsync(string uid, CancellationToken ct = default) =>
        (await utilizadores.ObterAsync(uid, ct))?.Financeiro?.ParaDto();

    public Task GuardarFinanceiroAsync(string uid, GuardarFinanceiroPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                utilizador.Financeiro = new DadosFinanceirosAntigos
                {
                    Salario = pedido.Salario ?? "",
                    PprPercentagem = pedido.PprPercentagem ?? "",
                    PoupancaPercentagem = pedido.PoupancaPercentagem ?? "",
                    AtualizadoEm = agora.ToString("O"),
                };
            },
            ct);

    public async Task<ConfigPprPoupancaDto?> ObterPprPoupancaAsync(string uid, CancellationToken ct = default) =>
        (await utilizadores.ObterAsync(uid, ct))?.ConfigPprPoupanca?.ParaDto();

    public Task GuardarPprPoupancaAsync(string uid, ConfigPprPoupancaDto pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, relogio.Agora, c);
                utilizador.ConfigPprPoupanca = new ConfiguracaoPprPoupanca
                {
                    PprTipo = pedido.PprTipo,
                    PprValor = pedido.PprValor ?? "",
                    PoupancaTipo = pedido.PoupancaTipo,
                    PoupancaValor = pedido.PoupancaValor ?? "",
                };
            },
            ct);
}
