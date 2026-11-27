using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Microsoft.Extensions.Logging;

namespace Financas.Services;

/// <summary>
/// Conversão dos dados de versões anteriores (corre uma vez por utilizador, marcada no Utilizador):
/// <list type="bullet">
///   <item>despesas mensais com debitado/mesDebitado/anuladoMes → registos em PagamentosFixas;</item>
///   <item>despesas extras sem mês → mês da data (ou de quando foram criadas);</item>
///   <item>configuração antiga de PPR/Poupança (% ou €) → lista de poupanças "PPR" e "Poupança".</item>
/// </list>
/// Mesmo antes de correr, as regras de <see cref="Calculos"/> já reconhecem os campos antigos
/// (<see cref="Calculos.PagamentoNoMes"/>), por isso nada é pago duas vezes.
/// </summary>
internal sealed class PreparacaoDadosService(
    IUtilizadoresRepository utilizadores,
    IDespesasFixasRepository fixas,
    IDespesasExtrasRepository extras,
    IPagamentosRepository pagamentos,
    IPoupancasRepository poupancas,
    IUnitOfWork unitOfWork,
    Relogio relogio,
    ILogger<PreparacaoDadosService> logger) : IPreparacaoDadosService
{
    public async Task PrepararAsync(string uid, CancellationToken ct = default)
    {
        var utilizador = await utilizadores.ObterAsync(uid, ct);
        if (utilizador is { PagamentosPorMesConvertidos: true, PoupancasListaConvertidas: true })
        {
            return;
        }

        try
        {
            await unitOfWork.ExecuteInTransactionAsync(
                async c =>
                {
                    // Um utilizador novo também fica marcado (não há nada para converter), como na versão Firestore
                    var atual = await utilizadores.ObterOuCriarAsync(uid, relogio.Agora, c);

                    if (!atual.PagamentosPorMesConvertidos)
                    {
                        await ConverterPagamentosEExtrasAsync(uid, c);
                        atual.PagamentosPorMesConvertidos = true;
                    }

                    if (!atual.PoupancasListaConvertidas)
                    {
                        await ConverterPoupancasAsync(atual, c);
                        atual.PoupancasListaConvertidas = true;
                    }
                },
                ct);
        }
        catch (Exception erro) when (erro is not OperationCanceledException)
        {
            // Fica para a próxima vez: as regras continuam a funcionar com os dados antigos
            logger.LogError(erro, "Erro ao converter os dados antigos do utilizador {Uid}", uid);
        }
    }

    private async Task ConverterPagamentosEExtrasAsync(string uid, CancellationToken ct)
    {
        var existentes = (await pagamentos.ListarAsync(uid, ct)).Select(p => PagamentoFixa.IdDe(p.Mes, p.FixaId)).ToHashSet();

        foreach (var fixa in await fixas.ListarAsync(uid, ct))
        {
            void Registar(string mes, EstadoPagamento estado)
            {
                if (!existentes.Add(PagamentoFixa.IdDe(mes, fixa.Id)))
                {
                    return;
                }

                pagamentos.Adicionar(new PagamentoFixa
                {
                    UtilizadorId = uid,
                    Id = PagamentoFixa.IdDe(mes, fixa.Id),
                    FixaId = fixa.Id,
                    Mes = mes,
                    Titulo = fixa.Titulo,
                    Valor = fixa.Valor,
                    Data = Meses.PrimeiroDia(mes),
                    Estado = estado,
                });
            }

            if (fixa.Debitado == true && Meses.EValido(fixa.MesDebitado)) Registar(fixa.MesDebitado, EstadoPagamento.Pago);
            if (Meses.EValido(fixa.AnuladoMes)) fixa.NaoDebitarAutomaticamenteEm = fixa.AnuladoMes;
            if (fixa.TemCamposAntigos) fixa.LimparCamposAntigos();
        }

        foreach (var extra in (await extras.ListarAsync(uid, ct)).Where(e => string.IsNullOrEmpty(e.Mes)))
        {
            extra.Mes = Meses.DaData(extra.Data) ?? Meses.De(DateOnly.FromDateTime(extra.CriadoEm.UtcDateTime));
        }
    }

    // Sem configuração nenhuma não cria nada: nenhuma contribuição sai da conta sem ser pedida
    private async Task ConverterPoupancasAsync(Utilizador utilizador, CancellationToken ct)
    {
        if (await poupancas.ExistemAsync(utilizador.Id, ct))
        {
            return;
        }

        foreach (var nova in Calculos.PoupancasDaConfigAntiga(utilizador.ConfigPprPoupanca, utilizador.Financeiro))
        {
            poupancas.Adicionar(new Poupanca
            {
                UtilizadorId = utilizador.Id,
                Id = Ids.Novo(),
                Nome = nova.Nome,
                Tipo = nova.Tipo,
                Valor = nova.Valor,
                Saldo = nova.Saldo,
                Ordem = nova.Ordem,
            });
        }

        logger.LogInformation("Configuração antiga de PPR/Poupança convertida em lista de poupanças ({Uid})", utilizador.Id);
    }
}
