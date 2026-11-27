using Financas.DAL;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

internal sealed class ContaService(
    IUtilizadoresRepository utilizadores,
    IDespesasFixasRepository fixas,
    IPagamentosRepository pagamentos,
    IPoupancasRepository repositorioPoupancas,
    IUnitOfWork unitOfWork,
    Relogio relogio,
    IPreparacaoDadosService preparacao,
    IMesesService meses,
    ISalarioService salario,
    IDespesasFixasService despesasFixas,
    IPoupancasService poupancas,
    IPoupancasPartilhadasMembrosService contribuicoesPartilhadas,
    IGastosRecorrentesService gastosRecorrentes) : IContaService
{
    public async Task<ContaCorrenteDto> ObterAsync(string uid, CancellationToken ct = default)
    {
        var utilizador = await utilizadores.ObterAsync(uid, ct);
        return new ContaCorrenteDto(Calculos.Centimos(utilizador?.Saldo ?? 0m), utilizador?.SaldoAtualizadoEm);
    }

    public async Task<decimal> CalcularSaldoDisponivelAsync(string uid, CancellationToken ct = default)
    {
        // Por esta ordem: o saldo inicial do mês é o de antes do salário, e o salário pode pagar os débitos.
        // Cada passo é uma transação própria (como na versão Firestore) e não faz nada se não houver nada a fazer.
        await preparacao.PrepararAsync(uid, ct);
        await meses.RegistarAberturaAsync(uid, ct);
        await salario.ProcessarRecebimentoAsync(uid, ct);
        await despesasFixas.ProcessarDebitosAutomaticosAsync(uid, ct);
        await poupancas.ProcessarJurosAsync(uid, ct); // antes das contribuições do mês: os juros são do mês que acabou
        await poupancas.ProcessarContribuicoesAutomaticasAsync(uid, ct);
        await contribuicoesPartilhadas.ProcessarContribuicoesAutomaticasAsync(uid, ct);
        await gastosRecorrentes.GerarEmFaltaAsync(uid, ct);
        return (await ObterAsync(uid, ct)).Saldo;
    }

    public async Task<Saldos> CalcularSaldosAsync(string uid, string? mes, CancellationToken ct = default)
    {
        var disponivel = await CalcularSaldoDisponivelAsync(uid, ct);
        var doMes = mes ?? relogio.MesAtual;
        var listaFixas = await fixas.ListarAsync(uid, ct);
        var pagamentosDoMes = await pagamentos.ListarDoMesAsync(uid, doMes, ct);
        // As poupanças manuais por enviar só contam no mês atual (é só deste mês que se sabe se já foram)
        var porEnviar = 0m;
        if (doMes == relogio.MesAtual)
        {
            var utilizador = await utilizadores.ObterAsync(uid, ct);
            porEnviar = Calculos.PoupancasPorEnviar(
                await repositorioPoupancas.ListarAsync(uid, ct),
                doMes,
                Calculos.ValorSalarioBase(utilizador?.Salario, utilizador?.Financeiro));
            // Também o que ainda falta pôr nos mealheiros dos grupos (automáticas por chegar ao dia e manuais por pôr)
            porEnviar += await contribuicoesPartilhadas.ValorPorEnviarNoMesAsync(uid, ct);
        }

        return Calculos.CalcularSaldos(disponivel, listaFixas, pagamentosDoMes, doMes, porEnviar);
    }

    public Task DefinirSaldoAsync(string uid, decimal saldo, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                utilizador.DefinirSaldo(saldo, agora);
            },
            ct);

    public Task MovimentarAsync(string uid, decimal valor, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                utilizador.MovimentarSaldo(valor, agora);
            },
            ct);

    public async Task<CartaoAlimentacaoDto> ObterCartaoAlimentacaoAsync(string uid, CancellationToken ct = default)
    {
        var utilizador = await utilizadores.ObterAsync(uid, ct);
        return new CartaoAlimentacaoDto(
            Calculos.Centimos(utilizador?.SaldoCartaoAlimentacao ?? 0m),
            utilizador?.CartaoAtualizadoEm,
            Calculos.CartaoDoMes(utilizador?.Salario, relogio.Hoje));
    }

    public Task DefinirCartaoAlimentacaoAsync(string uid, decimal saldo, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                utilizador.DefinirCartaoAlimentacao(saldo, agora);
            },
            ct);
}
