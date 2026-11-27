using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Extratos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

// Dívidas (ex.: crédito do carro): o valor em falta desce com os pagamentos da prestação ligada.
// Sem taxa é só "quanto falta pagar". Com taxa (TAN) é um crédito a sério: o que se paga a cada mês divide-se
// em juros, selo, seguros e capital, e dá para simular amortizações e comparar estratégias (ver Amortizacao).
internal sealed class DividasService(
    IUtilizadoresRepository utilizadores,
    IDividasRepository dividas,
    IDespesasFixasRepository fixas,
    IPagamentosRepository pagamentos,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IDividasService
{
    private static readonly string[] CamposQueSePodemLimpar =
        ["fixaId", "taxaAnual", "valorFinanciado", "entrada", "prazoMeses", "inicioContrato", "comissaoReembolso", "encargosMensais"];

    private const int MaximoBytesDoExtrato = 10 * 1024 * 1024;

    /// <summary>Uma dívida com tudo o que se calcula a partir dos pagamentos da prestação.</summary>
    private sealed record Calculada(
        Divida Divida,
        decimal? PrestacaoDaFixa,
        decimal Pago,
        decimal EmFalta,
        int? MesesEmFalta,
        string PrimeiroMes,
        decimal? PrestacaoSemEncargos,
        ResumoContratoDto? Resumo);

    public async Task<IReadOnlyList<DividaDto>> ListarAsync(string uid, CancellationToken ct = default) =>
        [.. Ordenacao.Dividas(await dividas.ListarAsync(uid, ct)).Select(d => d.ParaDto())];

    public async Task<IReadOnlyList<DividaComEstadoDto>> ListarComEstadoAsync(string uid, CancellationToken ct = default) =>
        [.. (await CalcularAsync(uid, ct)).Select(c => new DividaComEstadoDto(
            c.Divida.Id,
            c.Divida.Titulo,
            c.Divida.ValorInicial,
            c.Divida.Desde,
            c.Divida.FixaId,
            c.EmFalta,
            c.Pago,
            c.MesesEmFalta,
            c.PrestacaoDaFixa,
            c.Divida.TaxaAnual,
            c.Divida.ValorFinanciado,
            c.Divida.Entrada,
            c.Divida.PrazoMeses,
            c.Divida.InicioContrato,
            c.Divida.ComissaoReembolso,
            c.Divida.EncargosMensais,
            c.Divida.NumeroContrato,
            c.Divida.Credor,
            c.Resumo,
            ExtratoDe(c.Divida)))];

    private async Task<List<Calculada>> CalcularAsync(string uid, CancellationToken ct)
    {
        var lista = Ordenacao.Dividas(await dividas.ListarAsync(uid, ct));
        var listaFixas = await fixas.ListarAsync(uid, ct);
        var mesAtual = relogio.MesAtual;
        var resultado = new List<Calculada>(lista.Count);
        foreach (var divida in lista)
        {
            decimal? prestacao = null;
            IReadOnlyList<PagamentoFixa> pagamentosDaPrestacao = [];
            if (!string.IsNullOrEmpty(divida.FixaId))
            {
                prestacao = listaFixas.FirstOrDefault(f => f.Id == divida.FixaId)?.Valor;
                pagamentosDaPrestacao = await pagamentos.ListarDaDespesaAsync(uid, divida.FixaId, ct);
            }

            resultado.Add(Calcular(divida, pagamentosDaPrestacao, prestacao, mesAtual));
        }

        return resultado;
    }

    private static Calculada Calcular(Divida divida, IReadOnlyList<PagamentoFixa> pagamentosDaPrestacao, decimal? prestacao, string mesAtual)
    {
        var estado = Calculos.CalcularDivida(divida, pagamentosDaPrestacao, prestacao);
        if (divida.TaxaAnual is not { } taxa)
        {
            return new Calculada(divida, prestacao, estado.Pago, estado.EmFalta, estado.MesesEmFalta, PrimeiroMesDe(divida, new Dictionary<string, decimal>(), mesAtual),
                prestacao, null);
        }

        // Com taxa: o valor guardado é o capital; cada prestação amortiza só o que sobra depois dos juros, do selo e dos seguros
        var encargos = divida.EncargosMensais ?? 0m;
        var pagoPorMes = pagamentosDaPrestacao
            .Where(p => p.FixaId == divida.FixaId && p.Estado == EstadoPagamento.Pago && Meses.AntesOuIgual(divida.Desde, p.Mes))
            .GroupBy(p => p.Mes)
            .ToDictionary(g => g.Key, g => g.Sum(p => p.Valor));
        var emFalta = string.IsNullOrEmpty(divida.FixaId)
            ? divida.ValorInicial
            : Amortizacao.CapitalEmFalta(divida.ValorInicial, divida.Desde, taxa, encargos, pagoPorMes, mesAtual);

        var primeiroMes = PrimeiroMesDe(divida, pagoPorMes, mesAtual);
        var prestacaoTotal = prestacao ?? divida.ProximaPrestacaoValor;
        decimal? semEncargos = null;
        if (divida.ProximaPrestacaoCapital is { } capitalDoExtrato
            && divida.ProximaPrestacaoJuros is { } jurosDoExtrato
            && divida.ProximaPrestacaoValor is { } valorDoExtrato
            && (prestacao is null || Math.Abs(prestacao.Value - valorDoExtrato) <= 0.01m))
        {
            // O extrato já diz quanto é de capital + juros: é a prestação do contrato (constante), sem arredondamentos nossos
            semEncargos = Calculos.Centimos(capitalDoExtrato + jurosDoExtrato);
        }
        else if (prestacaoTotal is > 0)
        {
            semEncargos = Amortizacao.PrestacaoSemEncargos(prestacaoTotal.Value, encargos, emFalta, taxa);
        }

        var resumo = Resumo(divida, taxa, encargos, emFalta, estado.Pago, semEncargos, primeiroMes);
        return new Calculada(divida, prestacao, estado.Pago, emFalta, resumo.MesesRestantes, primeiroMes, semEncargos, resumo);
    }

    // A próxima prestação a pagar: este mês se ainda não foi paga; senão o seguinte. Nunca antes de "desde"
    private static string PrimeiroMesDe(Divida divida, IReadOnlyDictionary<string, decimal> pagoPorMes, string mesAtual)
    {
        var proximo = pagoPorMes.ContainsKey(mesAtual) ? Meses.Seguinte(mesAtual) : mesAtual;
        return Meses.Antes(proximo, divida.Desde) ? divida.Desde : proximo;
    }

    private static ResumoContratoDto Resumo(
        Divida divida,
        decimal taxa,
        decimal encargos,
        decimal emFalta,
        decimal pago,
        decimal? prestacaoSemEncargos,
        string primeiroMes)
    {
        var base_ = prestacaoSemEncargos ?? 0m;
        var projecao = Amortizacao.Projetar(emFalta, taxa, base_);
        var financiado = divida.ValorFinanciado;

        // Os juros do contrato inteiro: a prestação que se está a pagar (ou, sem ela, a do contrato) desde o capital inicial
        decimal? jurosContrato = null;
        decimal? custoTotal = null;
        if (financiado is > 0)
        {
            var prestacaoDoContrato = base_ > 0
                ? base_
                : divida.PrazoMeses is > 0 ? Amortizacao.Prestacao(financiado.Value, taxa, divida.PrazoMeses.Value) : 0m;
            if (prestacaoDoContrato > 0)
            {
                var doContrato = Amortizacao.Projetar(financiado.Value, taxa, prestacaoDoContrato);
                if (doContrato.Viavel)
                {
                    jurosContrato = doContrato.Juros;
                    custoTotal = Calculos.Centimos(
                        (divida.Entrada ?? 0m) + financiado.Value + doContrato.Juros + doContrato.Selo
                        + (encargos * (divida.PrazoMeses ?? doContrato.Meses)));
                }
            }
        }

        return new ResumoContratoDto(
            base_,
            Amortizacao.Juros(emFalta, taxa),
            primeiroMes,
            projecao.Viavel && base_ > 0 ? projecao.Meses : null,
            projecao.Viavel && projecao.Meses > 0 ? Meses.Somar(primeiroMes, projecao.Meses - 1) : null,
            projecao.Juros,
            Calculos.Centimos(projecao.Total + projecao.Selo + (encargos * projecao.Meses)),
            projecao.Viavel,
            financiado is null ? null : Calculos.Centimos(financiado.Value + (divida.Entrada ?? 0m)),
            financiado is null ? null : Math.Max(0m, Calculos.Centimos(financiado.Value - emFalta)),
            jurosContrato,
            custoTotal,
            Math.Max(0m, Calculos.Centimos(pago - (divida.ValorInicial - emFalta))));
    }

    private static ExtratoDividaDto? ExtratoDe(Divida d) =>
        d.ExtratoEm is { } emitido
            ? new ExtratoDividaDto(
                emitido,
                d.ProximaPrestacaoNumero,
                d.PrazoMeses,
                d.ProximaPrestacaoVencimento,
                d.ProximaPrestacaoValor,
                d.ProximaPrestacaoCapital,
                d.ProximaPrestacaoJuros,
                d.ProximaPrestacaoSelo,
                d.ProximaPrestacaoSeguros,
                d.CapitalVencido,
                d.CapitalVencido is > 0)
            : null;

    public Task<string> AdicionarAsync(string uid, NovaDividaPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                await utilizadores.ObterOuCriarAsync(uid, relogio.Agora, c);
                var divida = new Divida
                {
                    UtilizadorId = uid,
                    Id = Ids.Novo(),
                    Titulo = pedido.Titulo.Trim(),
                    ValorInicial = Calculos.Centimos(pedido.ValorInicial),
                    Desde = pedido.Desde,
                    FixaId = string.IsNullOrWhiteSpace(pedido.FixaId) ? null : pedido.FixaId,
                    TaxaAnual = pedido.TaxaAnual,
                    ValorFinanciado = Dinheiro(pedido.ValorFinanciado),
                    Entrada = Dinheiro(pedido.Entrada),
                    PrazoMeses = pedido.PrazoMeses,
                    InicioContrato = Vazio(pedido.InicioContrato),
                    ComissaoReembolso = pedido.ComissaoReembolso,
                    EncargosMensais = Dinheiro(pedido.EncargosMensais),
                    NumeroContrato = Vazio(pedido.NumeroContrato),
                    Credor = Vazio(pedido.Credor),
                };
                dividas.Adicionar(divida);
                return divida.Id;
            },
            ct);

    public Task AlterarAsync(string uid, string id, AlterarDividaPedido pedido, CancellationToken ct = default)
    {
        var limpar = DespesasFixasService.ValidarLimpar(pedido.Limpar, CamposQueSePodemLimpar);
        return unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var divida = await dividas.ObterAsync(uid, id, c) ?? throw new NaoEncontradoException("Dívida não encontrada.");
                if (pedido.Titulo is { } titulo) divida.Titulo = titulo.Trim();
                if (pedido.ValorInicial is { } valor) divida.ValorInicial = Calculos.Centimos(valor);
                if (pedido.Desde is { } desde) divida.Desde = desde;
                if (!string.IsNullOrWhiteSpace(pedido.FixaId)) divida.FixaId = pedido.FixaId;
                if (pedido.TaxaAnual is { } taxa) divida.TaxaAnual = taxa;
                if (pedido.ValorFinanciado is { } financiado) divida.ValorFinanciado = Calculos.Centimos(financiado);
                if (pedido.Entrada is { } entrada) divida.Entrada = Calculos.Centimos(entrada);
                if (pedido.PrazoMeses is { } prazo) divida.PrazoMeses = prazo;
                if (Vazio(pedido.InicioContrato) is { } inicio) divida.InicioContrato = inicio;
                if (pedido.ComissaoReembolso is { } comissao) divida.ComissaoReembolso = comissao;
                if (pedido.EncargosMensais is { } encargos) divida.EncargosMensais = Calculos.Centimos(encargos);
                if (Vazio(pedido.NumeroContrato) is { } numero) divida.NumeroContrato = numero;
                if (Vazio(pedido.Credor) is { } credor) divida.Credor = credor;

                if (limpar.Contains("fixaId")) divida.FixaId = null;
                if (limpar.Contains("taxaAnual")) divida.TaxaAnual = null;
                if (limpar.Contains("valorFinanciado")) divida.ValorFinanciado = null;
                if (limpar.Contains("entrada")) divida.Entrada = null;
                if (limpar.Contains("prazoMeses")) divida.PrazoMeses = null;
                if (limpar.Contains("inicioContrato")) divida.InicioContrato = null;
                if (limpar.Contains("comissaoReembolso")) divida.ComissaoReembolso = null;
                if (limpar.Contains("encargosMensais")) divida.EncargosMensais = null;
            },
            ct);
    }

    public Task RemoverAsync(string uid, string id, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                if (await dividas.ObterAsync(uid, id, c) is { } divida)
                {
                    dividas.Remover(divida);
                }
            },
            ct);

    // ---- Simulador ----

    public async Task<SimulacaoDividaDto> SimularAsync(string uid, string id, SimularDividaPedido pedido, CancellationToken ct = default)
    {
        var calculada = (await CalcularAsync(uid, ct)).FirstOrDefault(c => c.Divida.Id == id)
            ?? throw new NaoEncontradoException("Dívida não encontrada.");
        var taxa = calculada.Divida.TaxaAnual
            ?? throw new PedidoInvalidoException("Esta dívida não tem taxa (TAN): preenche-a para poder simular amortizações.");
        if (calculada.EmFalta <= 0)
        {
            throw new PedidoInvalidoException("Esta dívida já está paga.");
        }

        var prestacao = calculada.PrestacaoSemEncargos is > 0
            ? calculada.PrestacaoSemEncargos.Value
            : throw new PedidoInvalidoException("Liga a prestação (despesa fixa) à dívida ou importa o extrato do credor para saber quanto pagas por mês.");

        var encargos = calculada.Divida.EncargosMensais ?? 0m;
        var comissao = calculada.Divida.ComissaoReembolso ?? 0m;
        var capital = calculada.EmFalta;
        var primeiroMes = calculada.PrimeiroMes;

        CenarioDivida? manter = null;
        CenarioDivida? reduzir = null;
        if (pedido.Amortizacao is > 0)
        {
            (manter, reduzir) = Amortizacao.SimularAmortizacao(capital, taxa, prestacao, encargos, pedido.Amortizacao.Value, comissao, primeiroMes);
        }

        return new SimulacaoDividaDto(
            capital,
            taxa,
            comissao,
            encargos,
            primeiroMes,
            Amortizacao.SimularAtual(capital, taxa, prestacao, encargos, primeiroMes),
            manter,
            reduzir,
            Amortizacao.SimularAmortizacaoTotal(capital, taxa, prestacao, encargos, comissao, primeiroMes),
            pedido.ExtraMensal is > 0
                ? Amortizacao.SimularExtraMensal(capital, taxa, prestacao, encargos, pedido.ExtraMensal.Value, primeiroMes)
                : null);
    }

    public async Task<ComparacaoEstrategiasDto> CompararEstrategiasAsync(string uid, CompararEstrategiasPedido pedido, CancellationToken ct = default)
    {
        var todas = await CalcularAsync(uid, ct);
        var incluidas = new List<Amortizacao.DividaEstrategia>();
        var ignoradas = new List<string>();
        foreach (var c in todas)
        {
            if (c.EmFalta <= 0 || c.PrestacaoSemEncargos is not > 0)
            {
                ignoradas.Add(c.Divida.Titulo);
                continue;
            }

            // Sem taxa o valor já inclui os juros: conta como 0 %
            incluidas.Add(new Amortizacao.DividaEstrategia(c.Divida.Id, c.Divida.Titulo, c.EmFalta, c.Divida.TaxaAnual ?? 0m, c.PrestacaoSemEncargos.Value));
        }

        var extra = Calculos.Centimos(pedido.ExtraMensal);
        return new ComparacaoEstrategiasDto(
            extra,
            incluidas,
            Amortizacao.SimularEstrategia(incluidas, extra, Amortizacao.Estrategia.SoPrestacoes),
            Amortizacao.SimularEstrategia(incluidas, extra, Amortizacao.Estrategia.BolaDeNeve),
            Amortizacao.SimularEstrategia(incluidas, extra, Amortizacao.Estrategia.Avalanche),
            ignoradas);
    }

    // ---- Extrato do credor (PDF) ----

    public async Task<ExtratoLidoDto> LerExtratoAsync(string uid, string pdfBase64, CancellationToken ct = default)
    {
        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(pdfBase64);
        }
        catch (FormatException)
        {
            throw new PedidoInvalidoException("O ficheiro não chegou bem. Tenta escolher o PDF outra vez.");
        }

        if (bytes.Length > MaximoBytesDoExtrato)
        {
            throw new PedidoInvalidoException("O PDF é demasiado grande (máximo 10 MB).");
        }

        if (bytes.Length < 5 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F')
        {
            throw new PedidoInvalidoException("Isto não é um PDF.");
        }

        var extrato = InterpretadorExtratoCredito.Interpretar(LeitorPdf.Linhas(bytes));
        var existente = (await dividas.ListarAsync(uid, ct)).FirstOrDefault(d => MesmoContrato(d.NumeroContrato, extrato.NumeroContrato));
        return new ExtratoLidoDto(extrato, existente?.Id, existente?.Titulo);
    }

    public Task<string> AplicarExtratoAsync(string uid, AplicarExtratoPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var extrato = pedido.Extrato;
                var fixaId = Vazio(pedido.FixaId);
                if (fixaId is not null && await fixas.ObterAsync(uid, fixaId, c) is null)
                {
                    throw new PedidoInvalidoException("A prestação escolhida já não existe.");
                }

                Divida divida;
                if (!string.IsNullOrWhiteSpace(pedido.DividaId))
                {
                    divida = await dividas.ObterAsync(uid, pedido.DividaId, c) ?? throw new NaoEncontradoException("Dívida não encontrada.");
                    if (divida.ExtratoEm is { } anterior && extrato.EmitidoEm < anterior)
                    {
                        throw new ConflitoException(
                            $"Este extrato ({extrato.EmitidoEm:dd-MM-yyyy}) é mais antigo que o último que importaste ({anterior:dd-MM-yyyy}).");
                    }
                }
                else
                {
                    await utilizadores.ObterOuCriarAsync(uid, relogio.Agora, c);
                    divida = new Divida
                    {
                        UtilizadorId = uid,
                        Id = Ids.Novo(),
                        Titulo = Vazio(pedido.Titulo) ?? $"Crédito {extrato.NumeroContrato}",
                        ValorInicial = 0m,
                        Desde = Meses.De(extrato.Vencimento),
                    };
                    dividas.Adicionar(divida);
                }

                // O capital que o extrato diz que falta é o de antes de pagar a próxima prestação: conta a partir do mês dela
                divida.ValorInicial = Calculos.Centimos(extrato.CapitalVencido + extrato.CapitalVincendo);
                divida.Desde = Meses.De(extrato.Vencimento);
                if (fixaId is not null) divida.FixaId = fixaId;

                divida.TaxaAnual = extrato.TaxaAnual;
                divida.ValorFinanciado = Calculos.Centimos(extrato.CapitalInicial);
                divida.PrazoMeses = extrato.PrestacaoTotal;
                divida.InicioContrato = Meses.Somar(divida.Desde, -(extrato.PrestacaoNumero - 1));
                divida.EncargosMensais = Calculos.Centimos(extrato.PrestacaoSeguros);
                divida.NumeroContrato = extrato.NumeroContrato.Trim();
                divida.Credor = extrato.Credor.Trim();
                divida.ExtratoEm = extrato.EmitidoEm;
                divida.ProximaPrestacaoNumero = extrato.PrestacaoNumero;
                divida.ProximaPrestacaoVencimento = extrato.Vencimento;
                divida.ProximaPrestacaoValor = Calculos.Centimos(extrato.PrestacaoValor);
                divida.ProximaPrestacaoCapital = Calculos.Centimos(extrato.PrestacaoCapital);
                divida.ProximaPrestacaoJuros = Calculos.Centimos(extrato.PrestacaoJuros);
                divida.ProximaPrestacaoSelo = Calculos.Centimos(extrato.PrestacaoSelo);
                divida.ProximaPrestacaoSeguros = Calculos.Centimos(extrato.PrestacaoSeguros);
                divida.CapitalVencido = Calculos.Centimos(extrato.CapitalVencido);
                return divida.Id;
            },
            ct);

    // "CVCR 482459" e "cvcr482459" são o mesmo contrato
    private static bool MesmoContrato(string? a, string? b) =>
        !string.IsNullOrWhiteSpace(a) && !string.IsNullOrWhiteSpace(b)
        && string.Equals(Compactar(a), Compactar(b), StringComparison.OrdinalIgnoreCase);

    private static string Compactar(string texto) => string.Concat(texto.Where(char.IsLetterOrDigit));

    private static decimal? Dinheiro(decimal? valor) => valor is { } v ? Calculos.Centimos(v) : null;

    private static string? Vazio(string? texto) => string.IsNullOrWhiteSpace(texto) ? null : texto.Trim();
}
