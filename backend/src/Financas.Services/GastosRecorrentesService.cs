using Financas.DAL;
using Financas.DAL.Auditoria;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Microsoft.Extensions.Logging;

namespace Financas.Services;

// Gastos recorrentes: a regra (GastoRecorrente) gera despesas extras normais nos dias certos.
// A geração é "preguiçosa", como o salário e os débitos automáticos: corre quando a app pede o saldo
// (GET /api/conta/saldo), numa transação, e não faz nada se não houver nada em falta.
//
// Nunca gera a mesma repetição duas vezes:
//  - cada despesa gerada guarda (GastoRecorrenteId, DataOcorrencia), com um índice único;
//  - a geração mexe no saldo do utilizador (Versao): dois dispositivos ao mesmo tempo dão conflito,
//    a UnitOfWork repete a operação do princípio e a segunda vez já vê as despesas da primeira.
//
// Cartão de alimentação sem saldo: a repetição é paga com a conta (fica com meioPagamento "conta",
// visível na lista) e fica um aviso no log. Assim o gasto não se perde e o cartão nunca fica negativo.
internal sealed class GastosRecorrentesService(
    IUtilizadoresRepository utilizadores,
    IGastosRecorrentesRepository recorrentes,
    IDespesasExtrasRepository extras,
    Categorizador categorizador,
    IUnitOfWork unitOfWork,
    ContextoAuditoria auditoria,
    Relogio relogio,
    ILogger<GastosRecorrentesService> logger) : IGastosRecorrentesService
{
    public async Task<IReadOnlyList<GastoRecorrenteDto>> ListarAsync(string uid, CancellationToken ct = default) =>
        [.. (await recorrentes.ListarAsync(uid, ct)).Select(g => g.ParaDto())];

    public async Task<GastoRecorrenteDto> ObterAsync(string uid, string id, CancellationToken ct = default) =>
        (await recorrentes.ObterAsync(uid, id, ct) ?? throw NaoEncontrado()).ParaDto();

    public Task<string> AdicionarAsync(string uid, NovoGastoRecorrentePedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                var hoje = relogio.Hoje;
                var inicio = pedido.Inicio ?? hoje;
                if (pedido.Fim is { } fim && fim < inicio)
                {
                    throw new PedidoInvalidoException("O fim não pode ser antes do início.");
                }

                var frequencia = pedido.Frequencia!.Value;
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var gasto = new GastoRecorrente
                {
                    UtilizadorId = uid,
                    Id = Ids.Novo(),
                    Titulo = pedido.Titulo.Trim(),
                    Valor = Calculos.Centimos(pedido.Valor),
                    Categoria = pedido.Categoria ?? (await categorizador.SugerirAsync(uid, pedido.Titulo, null, c)).Categoria,
                    MeioPagamento = pedido.MeioPagamento ?? MeioPagamento.Conta,
                    Frequencia = frequencia,
                    DiaSemana = frequencia == Frequencia.Semanal ? pedido.DiaSemana ?? Recorrencia.DiaSemanaIso(inicio) : null,
                    DiaMes = frequencia == Frequencia.Mensal ? pedido.DiaMes ?? inicio.Day : null,
                    Inicio = inicio,
                    Fim = pedido.Fim,
                    Ativo = true,
                    CriadoEm = agora,
                };
                recorrentes.Adicionar(gasto);

                // A primeira repetição (ex.: hoje) é gerada já, como se o gasto fosse registado à mão
                Gerar(utilizador, gasto, hoje, agora, []);
                return gasto.Id;
            },
            ct);

    public Task AlterarAsync(string uid, string id, AlterarGastoRecorrentePedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var gasto = await recorrentes.ObterAsync(uid, id, c) ?? throw NaoEncontrado();
                if (pedido.Titulo is { } titulo && !string.IsNullOrWhiteSpace(titulo)) gasto.Titulo = titulo.Trim();
                if (pedido.Valor is { } valor) gasto.Valor = Calculos.Centimos(valor);
                if (pedido.Categoria is { } categoria) gasto.Categoria = categoria;
                if (pedido.MeioPagamento is { } meio) gasto.MeioPagamento = meio;
                if (pedido.Fim is { } fim)
                {
                    if (fim < gasto.Inicio) throw new PedidoInvalidoException("O fim não pode ser antes do início.");
                    gasto.Fim = fim;
                }

                if (pedido.Ativo is { } ativo && ativo != gasto.Ativo)
                {
                    gasto.Ativo = ativo;
                    if (ativo)
                    {
                        // Retomar: os dias da pausa não são gerados; o de hoje sim (se ainda não foi)
                        var ontem = relogio.Hoje.AddDays(-1);
                        if (gasto.UltimaGeracao is null || gasto.UltimaGeracao < ontem)
                        {
                            gasto.UltimaGeracao = ontem;
                        }
                    }
                }
            },
            ct);

    public Task RemoverAsync(string uid, string id, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                if (await recorrentes.ObterAsync(uid, id, c) is { } gasto)
                {
                    recorrentes.Remover(gasto);
                }
            },
            ct);

    public async Task<int> GerarEmFaltaAsync(string uid, CancellationToken ct = default)
    {
        // Verificação barata, sem transação: na maior parte dos pedidos não há nada a gerar
        var hoje = relogio.Hoje;
        if (!(await recorrentes.ListarAsync(uid, ct)).Any(g => Recorrencia.DiasEmFalta(g, hoje).Count > 0))
        {
            return 0;
        }

        // Feito pela app sozinha: no registo de alterações fica com a origem "sistema"
        using var _ = auditoria.ComoSistema();
        return await unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var total = 0;
                foreach (var gasto in await recorrentes.ListarAsync(uid, c))
                {
                    var dias = Recorrencia.DiasEmFalta(gasto, hoje);
                    if (dias.Count == 0)
                    {
                        continue;
                    }

                    // Defesa extra (além do índice único): os dias que já tenham despesa não se geram
                    var jaGerados = await extras.DiasGeradosAsync(uid, gasto.Id, dias[0], c);
                    total += Gerar(utilizador, gasto, hoje, agora, jaGerados);
                }

                return total;
            },
            ct);
    }

    // Gera as repetições em falta de um gasto: cada uma é uma despesa extra que sai da conta ou do cartão
    private int Gerar(Utilizador utilizador, GastoRecorrente gasto, DateOnly hoje, DateTimeOffset agora, HashSet<DateOnly> jaGerados)
    {
        var dias = Recorrencia.DiasEmFalta(gasto, hoje);
        var gerados = 0;
        foreach (var dia in dias.Where(d => !jaGerados.Contains(d)))
        {
            var meio = gasto.MeioPagamento;
            if (meio == MeioPagamento.CartaoAlimentacao && utilizador.SaldoCartaoAlimentacao < gasto.Valor)
            {
                logger.LogWarning(
                    "Gasto recorrente {GastoId} de {Dia}: o cartão de alimentação não chega, pago com a conta",
                    gasto.Id,
                    dia);
                meio = MeioPagamento.Conta;
            }

            if (meio == MeioPagamento.CartaoAlimentacao)
            {
                utilizador.MovimentarCartaoAlimentacao(-gasto.Valor, agora);
            }
            else
            {
                utilizador.MovimentarSaldo(-gasto.Valor, agora);
            }

            var despesa = DespesasExtrasService.Nova(gasto.UtilizadorId, gasto.Titulo, gasto.Valor, dia, descontada: true, agora, gasto.Categoria);
            despesa.MeioPagamento = meio;
            despesa.GastoRecorrenteId = gasto.Id;
            despesa.DataOcorrencia = dia;
            extras.Adicionar(despesa);
            gerados++;
        }

        if (dias.Count > 0)
        {
            // Até ao último dia visto (hoje, ou o fim): os dias para trás deixam de contar, mesmo os
            // que ficaram de fora pelo limite de Recorrencia.MaximoDeUmaVez
            gasto.UltimaGeracao = Recorrencia.Ate(gasto, hoje);
        }

        return gerados;
    }

    private static NaoEncontradoException NaoEncontrado() => new("Gasto recorrente não encontrado.");
}
