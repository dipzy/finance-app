using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

internal sealed class DespesasFixasService(
    IUtilizadoresRepository utilizadores,
    IDespesasFixasRepository fixas,
    IPagamentosRepository pagamentos,
    IPartilhadoDeFixas partilhado,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IDespesasFixasService
{
    private static readonly string[] CamposQueSePodemLimpar = ["diaDebito", "mesAnual", "categoria", "divisao", "unidadeConsumo"];

    /// <summary>De quantas faturas é a média que serve de estimativa numa despesa variável.</summary>
    private const int FaturasDaEstimativa = 3;

    public async Task<IReadOnlyList<DespesaFixaDto>> ListarAsync(string uid, CancellationToken ct = default) =>
        [.. (await fixas.ListarAsync(uid, ct)).Select(f => f.ParaDto())];

    // Começa a contar no mês em que é criada (ou no mês indicado, ex.: ao importar meses passados)
    public Task<string> AdicionarAsync(string uid, NovaDespesaFixaPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var despesa = new DespesaFixa
                {
                    UtilizadorId = uid,
                    Id = Ids.Novo(),
                    Titulo = pedido.Titulo.Trim(),
                    Valor = Calculos.Centimos(pedido.Valor),
                    Categoria = pedido.Categoria,
                    DiaDebito = pedido.DiaDebito,
                    Periodicidade = pedido.Periodicidade,
                    MesAnual = pedido.MesAnual,
                    Inicio = pedido.Inicio ?? relogio.MesAtual,
                    Variavel = pedido.Variavel,
                    DebitoAutomatico = pedido.DebitoAutomatico,
                    UnidadeConsumo = LimparUnidade(pedido.UnidadeConsumo),
                    CriadoEm = agora,
                };
                if (pedido.Divisao is { } divisao) await AplicarDivisaoAsync(uid, despesa, divisao, despesa.Valor, c);
                GarantirVariavelSemDivisao(despesa);
                fixas.Adicionar(despesa);
                return despesa.Id;
            },
            ct);

    public Task AlterarAsync(string uid, string id, AlterarDespesaFixaPedido pedido, CancellationToken ct = default)
    {
        var limpar = ValidarLimpar(pedido.Limpar, CamposQueSePodemLimpar);
        return unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var despesa = await fixas.ObterAsync(uid, id, c) ?? throw new NaoEncontradoException("Despesa não encontrada.");
                if (pedido.Titulo is { } titulo) despesa.Titulo = titulo.Trim();
                await AlterarValorEDivisaoAsync(uid, despesa, pedido, limpar, c);
                if (pedido.Categoria is { } categoria) despesa.Categoria = categoria;
                if (pedido.DiaDebito is { } dia) despesa.DiaDebito = dia;
                if (pedido.Periodicidade is { } periodicidade) despesa.Periodicidade = periodicidade;
                if (pedido.MesAnual is { } mesAnual) despesa.MesAnual = mesAnual;
                if (pedido.Inicio is { } inicio) despesa.Inicio = inicio;
                if (limpar.Contains("diaDebito")) despesa.DiaDebito = null;
                if (limpar.Contains("mesAnual")) despesa.MesAnual = null;
                if (limpar.Contains("categoria")) despesa.Categoria = null;
                if (pedido.Variavel is { } variavel) despesa.Variavel = variavel;
                if (pedido.DebitoAutomatico is { } automatico) despesa.DebitoAutomatico = automatico;
                if (pedido.UnidadeConsumo is { } unidade) despesa.UnidadeConsumo = LimparUnidade(unidade);
                if (limpar.Contains("unidadeConsumo")) despesa.UnidadeConsumo = null;
                GarantirVariavelSemDivisao(despesa);
            },
            ct);
    }

    private static string? LimparUnidade(string? unidade) => string.IsNullOrWhiteSpace(unidade) ? null : unidade.Trim();

    // Dividir com um grupo exige o valor todo de cada vez (ver DebitarPartilhadaAsync): não casa com uma fatura que varia
    private static void GarantirVariavelSemDivisao(DespesaFixa despesa)
    {
        if (despesa.Variavel && despesa.EPartilhada)
        {
            throw new PedidoInvalidoException("Uma despesa dividida com um grupo tem sempre o mesmo valor: não pode ser variável.");
        }
    }

    // Numa despesa dividida o valor pedido é o total; o da despesa (Valor) fica só com a parte de quem a paga
    private async Task AplicarDivisaoAsync(string uid, DespesaFixa despesa, DivisaoFixaPedido pedido, decimal total, CancellationToken ct)
    {
        var divisao = new DivisaoDespesaFixa
        {
            GrupoId = pedido.GrupoId,
            Modo = pedido.Modo,
            Participantes = [.. pedido.Participantes.Select(p => new ParticipanteDivisao(p.Uid, pedido.Modo == ModoDivisao.Igual ? null : p.Peso))],
        };
        total = Calculos.Centimos(total);
        despesa.Valor = await partilhado.ParteDoPagadorAsync(uid, divisao, total, ct);
        despesa.ValorTotal = total;
        despesa.Divisao = divisao;
    }

    private async Task AlterarValorEDivisaoAsync(string uid, DespesaFixa despesa, AlterarDespesaFixaPedido pedido, IReadOnlySet<string> limpar, CancellationToken ct)
    {
        // O que se escreve em "valor" é o total quando a despesa está (ou fica) dividida
        var total = pedido.Valor is { } novo ? Calculos.Centimos(novo) : despesa.ValorAPagar;

        if (limpar.Contains("divisao"))
        {
            despesa.Divisao = null;
            despesa.ValorTotal = null;
            despesa.Valor = total;
        }
        else if (pedido.Divisao is { } divisao)
        {
            await AplicarDivisaoAsync(uid, despesa, divisao, total, ct);
        }
        else if (despesa.Divisao is { } atual && pedido.Valor is not null)
        {
            // Só o valor mudou: a parte de quem paga refaz-se com a mesma divisão
            despesa.Valor = await partilhado.ParteDoPagadorAsync(uid, atual, total, ct);
            despesa.ValorTotal = total;
        }
        else if (pedido.Valor is not null)
        {
            despesa.Valor = total;
        }
    }

    public Task TerminarAsync(string uid, string id, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var despesa = await fixas.ObterAsync(uid, id, c);
                if (despesa is null)
                {
                    return;
                }

                var mes = relogio.MesAtual;
                var registo = await pagamentos.ObterAsync(uid, PagamentoFixa.IdDe(mes, id), c);
                var pagaEsteMes = Calculos.PagamentoNoMes(despesa, Lista(registo), mes)?.Estado == EstadoPagamento.Pago;
                var fim = pagaEsteMes ? mes : Meses.Anterior(mes);
                var semHistorico = !await pagamentos.ExisteDaDespesaAsync(uid, id, c) && despesa.MesDebitado is null;

                if (semHistorico || (!string.IsNullOrEmpty(despesa.Inicio) && Meses.Antes(fim, despesa.Inicio)))
                {
                    fixas.Remover(despesa);
                }
                else
                {
                    despesa.Fim = fim;
                }
            },
            ct);

    // O pagamento e o saldo da conta mudam na mesma transação; o id fixo do registo (mês + despesa)
    // e o índice único impedem pagar duas vezes no mesmo mês, mesmo com dois dispositivos ao mesmo tempo
    public Task<ResultadoDebito> DebitarAsync(string uid, string id, string? mes = null, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var doMes = mes ?? relogio.MesAtual;
                var despesa = await fixas.ObterAsync(uid, id, c);
                if (despesa is null)
                {
                    return ResultadoDebito.JaDebitada;
                }

                var registo = await pagamentos.ObterAsync(uid, PagamentoFixa.IdDe(doMes, id), c);
                var pagamento = Calculos.PagamentoNoMes(despesa, Lista(registo), doMes);
                if (pagamento?.Estado == EstadoPagamento.Pago && !pagamento.Parcial)
                {
                    return ResultadoDebito.JaDebitada;
                }

                if (despesa.EPartilhada) return await DebitarPartilhadaAsync(uid, despesa, registo, doMes, c);

                var valor = pagamento?.Parcial == true
                    ? Calculos.Centimos(Math.Max(0m, despesa.Valor - pagamento.Valor))
                    : Calculos.Centimos(despesa.Valor);
                if (valor <= 0m)
                {
                    if (registo is not null) registo.Parcial = false;
                    return ResultadoDebito.JaDebitada;
                }

                var utilizador = await utilizadores.ObterAsync(uid, c);
                if (utilizador is null || Calculos.Centimos(utilizador.Saldo) < valor)
                {
                    return ResultadoDebito.SaldoInsuficiente;
                }

                if (registo is null)
                {
                    registo = new PagamentoFixa
                    {
                        UtilizadorId = uid,
                        Id = PagamentoFixa.IdDe(doMes, id),
                        FixaId = id,
                        Mes = doMes,
                        Titulo = despesa.Titulo,
                    };
                    pagamentos.Adicionar(registo);
                }

                registo.Titulo = despesa.Titulo;
                registo.Valor = Calculos.Centimos(registo.Valor + valor);
                registo.Data = relogio.Hoje;
                registo.Estado = EstadoPagamento.Pago;
                registo.Parcial = false;

                utilizador.MovimentarSaldo(-valor, relogio.Agora);
                // Limpar os campos da versão anterior: a partir de agora vale o registo
                if (despesa.TemCamposAntigos) despesa.LimparCamposAntigos();
                return ResultadoDebito.Debitada;
            },
            ct);

    // Dividida com um grupo: sai o total da conta de quem paga e fica a despesa partilhada no grupo; o pagamento
    // regista só a parte de quem paga (é o que conta nos totais dele). Paga-se sempre o valor todo
    private async Task<ResultadoDebito> DebitarPartilhadaAsync(string uid, DespesaFixa despesa, PagamentoFixa? registo, string doMes, CancellationToken ct)
    {
        var total = Calculos.Centimos(despesa.ValorAPagar);
        var utilizador = await utilizadores.ObterAsync(uid, ct);
        if (utilizador is null || Calculos.Centimos(utilizador.Saldo) < total)
        {
            return ResultadoDebito.SaldoInsuficiente;
        }

        var idPagamento = PagamentoFixa.IdDe(doMes, despesa.Id);
        if (registo is null)
        {
            registo = new PagamentoFixa
            {
                UtilizadorId = uid,
                Id = idPagamento,
                FixaId = despesa.Id,
                Mes = doMes,
                Titulo = despesa.Titulo,
            };
            pagamentos.Adicionar(registo);
        }

        registo.Titulo = despesa.Titulo;
        registo.Valor = Calculos.Centimos(despesa.Valor);
        registo.Data = relogio.Hoje;
        registo.Estado = EstadoPagamento.Pago;
        registo.Parcial = false;

        await partilhado.CriarDespesaDaFixaAsync(uid, despesa, idPagamento, relogio.Hoje, ct);
        if (despesa.TemCamposAntigos) despesa.LimparCamposAntigos();
        return ResultadoDebito.Debitada;
    }

    public Task<ResultadoDebito> DebitarParcialAsync(string uid, string id, decimal valor, string? mes = null, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var doMes = mes ?? relogio.MesAtual;
                var despesa = await fixas.ObterAsync(uid, id, c);
                if (despesa is null)
                {
                    return ResultadoDebito.JaDebitada;
                }

                if (despesa.EPartilhada)
                {
                    throw new PedidoInvalidoException("Numa despesa dividida com um grupo paga-se sempre o valor todo.");
                }

                var valorParcial = Calculos.Centimos(valor);
                if (valorParcial <= 0m)
                {
                    return ResultadoDebito.JaDebitada;
                }

                var registo = await pagamentos.ObterAsync(uid, PagamentoFixa.IdDe(doMes, id), c);
                var pago = Calculos.PagamentoNoMes(despesa, Lista(registo), doMes);
                if (pago is not null && pago.Estado == EstadoPagamento.Pago && !pago.Parcial)
                {
                    return ResultadoDebito.JaDebitada;
                }

                var totalPago = pago?.Estado == EstadoPagamento.Pago ? pago.Valor : 0m;
                var emFalta = Calculos.Centimos(Math.Max(0m, despesa.Valor - totalPago));
                if (emFalta <= 0m)
                {
                    return ResultadoDebito.JaDebitada;
                }

                valorParcial = Math.Min(valorParcial, emFalta);
                var novoTotalPago = Calculos.Centimos(totalPago + valorParcial);
                var ficaParcial = novoTotalPago < Calculos.Centimos(despesa.Valor);

                var utilizador = await utilizadores.ObterAsync(uid, c);
                if (utilizador is null || Calculos.Centimos(utilizador.Saldo) < valorParcial)
                {
                    return ResultadoDebito.SaldoInsuficiente;
                }

                var registoPagamento = registo ?? new PagamentoFixa
                {
                    UtilizadorId = uid,
                    Id = PagamentoFixa.IdDe(doMes, id),
                    FixaId = id,
                    Mes = doMes,
                    Titulo = despesa.Titulo,
                    Data = relogio.Hoje,
                    Estado = EstadoPagamento.Pago,
                };

                registoPagamento.Titulo = despesa.Titulo;
                registoPagamento.Valor = novoTotalPago;
                registoPagamento.Data = relogio.Hoje;
                registoPagamento.Parcial = ficaParcial;
                registoPagamento.Estado = EstadoPagamento.Pago;

                if (registo is null)
                {
                    pagamentos.Adicionar(registoPagamento);
                }

                utilizador.MovimentarSaldo(-valorParcial, relogio.Agora);
                if (despesa.TemCamposAntigos) despesa.LimparCamposAntigos();
                return ResultadoDebito.Debitada;
            },
            ct);

    public Task<ResultadoDebito> PagarFaturaAsync(string uid, string id, PagarFaturaPedido pedido, string? mes = null, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var doMes = mes ?? relogio.MesAtual;
                var despesa = await fixas.ObterAsync(uid, id, c);
                if (despesa is null)
                {
                    return ResultadoDebito.JaDebitada;
                }

                if (despesa.EPartilhada)
                {
                    throw new PedidoInvalidoException("Numa despesa dividida com um grupo paga-se sempre o valor todo.");
                }

                var valor = Calculos.Centimos(pedido.Valor);
                var registo = await pagamentos.ObterAsync(uid, PagamentoFixa.IdDe(doMes, id), c);
                var pago = Calculos.PagamentoNoMes(despesa, Lista(registo), doMes);
                if (pago is { Estado: EstadoPagamento.Pago, Parcial: false })
                {
                    return ResultadoDebito.JaDebitada;
                }

                // O que já se pagou em parte conta: só a diferença sai da conta (se pagou a mais, o resto volta)
                var jaPago = pago?.Estado == EstadoPagamento.Pago ? pago.Valor : 0m;
                var aDebitar = Calculos.Centimos(valor - jaPago);
                var utilizador = await utilizadores.ObterAsync(uid, c);
                if (utilizador is null || Calculos.Centimos(utilizador.Saldo) < aDebitar)
                {
                    return ResultadoDebito.SaldoInsuficiente;
                }

                if (registo is null)
                {
                    registo = new PagamentoFixa
                    {
                        UtilizadorId = uid,
                        Id = PagamentoFixa.IdDe(doMes, id),
                        FixaId = id,
                        Mes = doMes,
                        Titulo = despesa.Titulo,
                    };
                    pagamentos.Adicionar(registo);
                }

                registo.Titulo = despesa.Titulo;
                registo.Valor = valor;
                registo.Consumo = pedido.Consumo is { } consumo ? Math.Round(consumo, 3, MidpointRounding.AwayFromZero) : null;
                registo.Data = relogio.Hoje;
                registo.Estado = EstadoPagamento.Pago;
                registo.Parcial = false;

                utilizador.MovimentarSaldo(-aDebitar, relogio.Agora);
                if (despesa.TemCamposAntigos) despesa.LimparCamposAntigos();
                if (despesa.Variavel) despesa.Valor = await EstimativaAsync(uid, id, doMes, valor, c);
                return ResultadoDebito.Debitada;
            },
            ct);

    // A média das últimas faturas (a deste mês incluída), para a previsão dos meses seguintes
    private async Task<decimal> EstimativaAsync(string uid, string fixaId, string mes, decimal valorDoMes, CancellationToken ct)
    {
        var faturas = (await pagamentos.ListarDaDespesaAsync(uid, fixaId, ct))
            .Where(p => p.Mes != mes && !p.Parcial && p.Valor > 0m)
            .Select(p => (Mes: p.Mes, Valor: p.Valor))
            .Append((Mes: mes, Valor: valorDoMes))
            .OrderByDescending(f => f.Mes, StringComparer.Ordinal)
            .Take(FaturasDaEstimativa);
        return Calculos.Centimos(faturas.Average(f => f.Valor));
    }

    // Devolve o valor e apaga o registo: a despesa volta a ficar "por pagar". Fica marcado na despesa
    // que o débito automático não a volta a pagar nesse mês (só à mão)
    public Task<bool> AnularDebitoAsync(string uid, string id, string? mes = null, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var doMes = mes ?? relogio.MesAtual;
                var despesa = await fixas.ObterAsync(uid, id, c);
                if (despesa is null)
                {
                    return false;
                }

                var registo = await pagamentos.ObterAsync(uid, PagamentoFixa.IdDe(doMes, id), c);
                var pagamento = Calculos.PagamentoNoMes(despesa, Lista(registo), doMes);
                if (pagamento?.Estado != EstadoPagamento.Pago)
                {
                    return false;
                }

                // Sem registo: foi pago na versão anterior (marcado na própria despesa, limpo abaixo)
                if (registo is not null)
                {
                    pagamentos.Remover(registo);
                }

                despesa.NaoDebitarAutomaticamenteEm = doMes;
                // Paga com divisão: o total volta pela despesa do grupo. Sem ela (pago antes de ser dividida), volta o valor pago
                var desfeitaNoGrupo = registo is not null && await partilhado.DesfazerDespesaDaFixaAsync(registo.Id, c);
                if (!desfeitaNoGrupo)
                {
                    var utilizador = await utilizadores.ObterOuCriarAsync(uid, relogio.Agora, c);
                    utilizador.MovimentarSaldo(pagamento.Valor, relogio.Agora);
                }

                if (despesa.TemCamposAntigos) despesa.LimparCamposAntigos();
                return true;
            },
            ct);

    // Uma de cada vez (cada uma na sua transação), para cada débito já contar com o saldo deixado pelo anterior
    public async Task<decimal> ProcessarDebitosAutomaticosAsync(string uid, CancellationToken ct = default)
    {
        var hoje = relogio.Hoje;
        var mes = Meses.De(hoje);
        var lista = await fixas.ListarAsync(uid, ct);
        var pagamentosDoMes = await pagamentos.ListarDoMesAsync(uid, mes, ct);

        var total = 0m;
        foreach (var despesa in lista.Where(f => Calculos.DeveDebitarAutomaticamente(f, pagamentosDoMes, hoje)))
        {
            try
            {
                if (await DebitarAsync(uid, despesa.Id, mes, ct) == ResultadoDebito.Debitada)
                {
                    total += despesa.ValorAPagar;
                }
            }
            catch (PedidoInvalidoException)
            {
                // Uma despesa dividida que já não se consegue dividir (alguém saiu do grupo): fica por pagar
                // e não impede as outras de serem debitadas
            }
        }

        return Calculos.Centimos(total);
    }

    public async Task<TotaisFixas> CalcularTotaisAsync(string uid, string? mes, CancellationToken ct = default)
    {
        var doMes = mes ?? relogio.MesAtual;
        return Calculos.SepararDespesasFixas(
            await fixas.ListarAsync(uid, ct),
            await pagamentos.ListarDoMesAsync(uid, doMes, ct),
            doMes);
    }

    public async Task<IReadOnlyList<PagamentoFixaDto>> ListarPagamentosDoMesAsync(string uid, string mes, CancellationToken ct = default) =>
        [.. (await pagamentos.ListarDoMesAsync(uid, mes, ct)).Select(p => p.ParaDto())];

    public async Task<IReadOnlyList<PagamentoFixaDto>> ListarPagamentosDaDespesaAsync(string uid, string fixaId, CancellationToken ct = default) =>
        [.. (await pagamentos.ListarDaDespesaAsync(uid, fixaId, ct)).Select(p => p.ParaDto())];

    public Task RegistarPagamentoHistoricoAsync(
        string uid,
        string mes,
        string fixaId,
        RegistarPagamentoPedido pedido,
        CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                await utilizadores.ObterOuCriarAsync(uid, relogio.Agora, c);
                var registo = await pagamentos.ObterAsync(uid, PagamentoFixa.IdDe(mes, fixaId), c);
                if (registo is null)
                {
                    registo = new PagamentoFixa
                    {
                        UtilizadorId = uid,
                        Id = PagamentoFixa.IdDe(mes, fixaId),
                        FixaId = fixaId,
                        Mes = mes,
                        Titulo = pedido.Titulo.Trim(),
                    };
                    pagamentos.Adicionar(registo);
                }

                registo.Titulo = pedido.Titulo.Trim();
                registo.Valor = Calculos.Centimos(pedido.Valor);
                registo.Data = pedido.Data ?? Meses.PrimeiroDia(mes);
                registo.Estado = EstadoPagamento.Pago;
            },
            ct);

    private static PagamentoFixa[] Lista(PagamentoFixa? registo) => registo is null ? [] : [registo];

    internal static HashSet<string> ValidarLimpar(IReadOnlyList<string>? limpar, string[] permitidos)
    {
        var campos = new HashSet<string>(limpar ?? [], StringComparer.OrdinalIgnoreCase);
        var invalidos = campos.Where(c => !permitidos.Contains(c, StringComparer.OrdinalIgnoreCase)).ToList();
        if (invalidos.Count > 0)
        {
            throw new PedidoInvalidoException(
                $"Não é possível limpar: {string.Join(", ", invalidos)}. Campos que se podem limpar: {string.Join(", ", permitidos)}.");
        }

        return campos;
    }
}
