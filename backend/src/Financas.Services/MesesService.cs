using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

internal sealed class MesesService(
    IUtilizadoresRepository utilizadores,
    IMesesRepository meses,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IMesesService
{
    public async Task<ResumoMesDto?> ObterAsync(string uid, string mes, CancellationToken ct = default) =>
        (await meses.ObterAsync(uid, mes, ct))?.ParaDto();

    // Importar o mesmo mês outra vez junta os blocos: os novos substituem os que já lá estavam
    public Task GuardarImportadoAsync(string uid, string mes, BlocosImportadosDto importado, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                await utilizadores.ObterOuCriarAsync(uid, relogio.Agora, c);
                var resumo = await meses.ObterOuCriarAsync(uid, mes, c);
                resumo.Importado = (resumo.Importado ?? new BlocosImportados()).Juntar(importado.ParaEntidade());
            },
            ct);

    public async Task RegistarAberturaAsync(string uid, CancellationToken ct = default)
    {
        var mes = relogio.MesAtual;
        if ((await meses.ObterAsync(uid, mes, ct))?.SaldoInicial is not null)
        {
            return;
        }

        await unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var resumo = await meses.ObterOuCriarAsync(uid, mes, c);
                if (resumo.SaldoInicial is not null)
                {
                    return;
                }

                var agora = relogio.Agora;
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var saldo = Calculos.Centimos(utilizador.Saldo);
                resumo.SaldoInicial = saldo;
                resumo.AbertoEm = agora;
                var anterior = await meses.ObterOuCriarAsync(uid, Meses.Anterior(mes), c);
                anterior.SaldoFinal = saldo;
            },
            ct);
    }
}
