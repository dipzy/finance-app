using System.Globalization;
using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

/// <summary>
/// Ponte entre os dados da app e a "folha do mês" com os blocos do livro Excel do utilizador
/// (Lucro, Despesas, Poupança, Despesas do Mês, Anual, Saldo Conta, Falta, Saldo Poupança, Total a pagar).
/// Porte de <c>services/folhaMes.ts</c>; a leitura e a escrita do ficheiro Excel continuam na app.
/// </summary>
internal sealed class FolhaMesService(
    IUtilizadoresRepository utilizadores,
    IDespesasFixasRepository fixas,
    IPagamentosRepository pagamentos,
    IDespesasExtrasRepository extras,
    Categorizador categorizador,
    IPoupancasRepository poupancas,
    IDividasRepository dividas,
    IMesesRepository meses,
    IDividasService dividasService,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IFolhaMesService
{
    public async Task<IReadOnlyList<string>> MesesComDadosAsync(string uid, CancellationToken ct = default)
    {
        var inicios = (await fixas.ListarAsync(uid, ct)).Select(f => f.Inicio)
            .Concat((await extras.ListarAsync(uid, ct)).Select(e => e.Mes))
            .Where(m => Meses.EValido(m))
            .Cast<string>()
            .ToList();

        var atual = relogio.MesAtual;
        var primeiro = inicios.Count > 0 ? inicios.Min(StringComparer.Ordinal)! : atual;
        var lista = new List<string>();
        for (var mes = primeiro; Meses.AntesOuIgual(mes, atual); mes = Meses.Seguinte(mes))
        {
            lista.Add(mes);
        }

        return lista;
    }

    public async Task<DadosFolhaMesDto> ObterDadosAsync(string uid, string mes, CancellationToken ct = default)
    {
        var eAtual = mes == relogio.MesAtual;
        var fonte = new FonteFolha(
            await utilizadores.ObterAsync(uid, ct),
            await fixas.ListarAsync(uid, ct),
            Ordenacao.Poupancas(await poupancas.ListarAsync(uid, ct)),
            eAtual ? await dividasService.ListarComEstadoAsync(uid, ct) : []);
        return Montar(
            fonte,
            mes,
            await pagamentos.ListarDoMesAsync(uid, mes, ct),
            await extras.ListarDoMesAsync(uid, mes, ct),
            await meses.ObterAsync(uid, mes, ct));
    }

    // Os mesmos dados de ObterDadosAsync, mas lidos uma só vez para todos os meses (ex.: a evolução
    // dos últimos 12 meses): cada folha é montada exatamente da mesma maneira
    public async Task<IReadOnlyList<DadosFolhaMesDto>> ObterVariosAsync(string uid, IReadOnlyList<string> listaMeses, CancellationToken ct = default)
    {
        if (listaMeses.Count == 0)
        {
            return [];
        }

        var fonte = new FonteFolha(
            await utilizadores.ObterAsync(uid, ct),
            await fixas.ListarAsync(uid, ct),
            Ordenacao.Poupancas(await poupancas.ListarAsync(uid, ct)),
            listaMeses.Contains(relogio.MesAtual) ? await dividasService.ListarComEstadoAsync(uid, ct) : []);
        var pagamentosPorMes = (await pagamentos.ListarAsync(uid, ct)).ToLookup(p => p.Mes);
        var extrasPorMes = (await extras.ListarAsync(uid, ct)).Where(e => e.Mes is not null).ToLookup(e => e.Mes!);
        var resumos = (await meses.ListarAsync(uid, ct)).ToDictionary(m => m.Mes);

        return
        [
            .. listaMeses.Select(mes => Montar(
                fonte,
                mes,
                [.. pagamentosPorMes[mes]],
                // A mesma ordem de IDespesasExtrasRepository.ListarDoMesAsync
                [
                    .. extrasPorMes[mes]
                        .OrderByDescending(e => e.Data ?? DateOnly.MinValue)
                        .ThenByDescending(e => e.CriadoEm)
                        .ThenBy(e => e.Id, StringComparer.Ordinal),
                ],
                resumos.GetValueOrDefault(mes))),
        ];
    }

    // O que não depende do mês (no mês atual também as dívidas)
    private sealed record FonteFolha(
        Utilizador? Utilizador,
        IReadOnlyList<DespesaFixa> Fixas,
        IReadOnlyList<Poupanca> Poupancas,
        IReadOnlyList<DividaComEstadoDto> Dividas);

    private DadosFolhaMesDto Montar(
        FonteFolha fonte,
        string mes,
        IReadOnlyList<PagamentoFixa> pagamentosDoMes,
        IReadOnlyList<DespesaExtra> extrasDoMes,
        ResumoMes? resumo)
    {
        var eAtual = mes == relogio.MesAtual;
        var utilizador = fonte.Utilizador;
        var listaFixas = fonte.Fixas;
        var listaPoupancas = fonte.Poupancas;
        var dividasComEstado = eAtual ? fonte.Dividas : [];
        var importado = resumo?.Importado;

        // Lucro e Poupança: o que foi importado, senão o que aconteceu no dia do salário desse mês,
        // senão (só no mês atual) o que vai acontecer com a configuração de hoje
        var cartao = Calculos.CartaoDoMes(utilizador?.Salario, Meses.PrimeiroDia(mes));
        var recebimento = resumo?.Recebimento
            ?? (eAtual
                ? Calculos.CalcularRecebimento(
                    Calculos.ValorSalarioBase(utilizador?.Salario, utilizador?.Financeiro),
                    utilizador?.ConfigPprPoupanca,
                    utilizador?.Financeiro,
                    listaPoupancas)
                : null);

        var lucro = importado?.Lucro?.Select(l => l.ParaDto()).ToList() ?? [];
        if (importado?.Lucro is null && recebimento is not null)
        {
            lucro.Add(new LinhaFolhaDto("Ordenado", recebimento.Salario));
            if (cartao != 0)
            {
                lucro.Add(new LinhaFolhaDto("Alimen.", cartao, Informativo: true));
            }
        }

        var poupanca = importado?.Poupanca?.Select(l => l.ParaDto()).ToList()
            ?? [.. (recebimento?.Contribuicoes ?? []).Where(c => c.Valor != 0).Select(c => new LinhaFolhaDto(c.Nome, c.Valor))];

        // Despesas do mês: o valor pago (se já foi pago) ou o valor atual da despesa. As anuais têm o seu bloco
        var fixasDoMes = listaFixas.Where(f => Calculos.AtivaNoMes(f, mes)).ToList();
        var mensaisDoMes = fixasDoMes.Where(f => !f.EAnual).ToList();
        var despesas = mensaisDoMes
            .Select(f =>
            {
                var pago = pagamentosDoMes.FirstOrDefault(p => p.FixaId == f.Id && p.Estado == EstadoPagamento.Pago);
                // Pago em qualquer mês; "por pagar" só no mês atual (nos passados, sem registo = sem estado)
                EstadoLinha? estado = Calculos.EstadoNoMes(f, pagamentosDoMes, mes) switch
                {
                    EstadoFixa.Pago => EstadoLinha.Pago,
                    EstadoFixa.Parcial => EstadoLinha.Parcial,
                    _ => eAtual ? EstadoLinha.PorPagar : null,
                };
                var emFalta = estado == EstadoLinha.Parcial && pago is not null
                    ? Calculos.Centimos(Math.Max(0m, f.Valor - pago.Valor))
                    : (decimal?)null;
                return new LinhaFolhaDto(f.Titulo, pago?.Valor ?? f.Valor, pago?.Data, Estado: estado, ValorEmFalta: emFalta);
            })
            .ToList();

        // Pagamentos de despesas mensais que entretanto deixaram de existir também são deste mês
        foreach (var p in pagamentosDoMes)
        {
            var fixa = listaFixas.FirstOrDefault(f => f.Id == p.FixaId);
            if (p.Estado == EstadoPagamento.Pago && !mensaisDoMes.Any(f => f.Id == p.FixaId) && fixa?.EAnual != true)
            {
                despesas.Add(new LinhaFolhaDto(p.Titulo, p.Valor, p.Data, Estado: EstadoLinha.Pago));
            }
        }

        var falta = fixasDoMes
            .Select(f =>
            {
                var pagamento = Calculos.PagamentoNoMes(f, pagamentosDoMes, mes);
                if (pagamento?.Estado == EstadoPagamento.Pago && !pagamento.Parcial) return null;
                var valorEmFalta = pagamento?.Parcial == true
                    ? Math.Max(0m, f.Valor - pagamento.Valor)
                    : f.Valor;
                return new LinhaFolhaDto(f.Titulo, valorEmFalta);
            })
            .Where(l => l is not null)
            .Select(l => l!)
            .ToList();

        return new DadosFolhaMesDto(
            mes,
            lucro,
            despesas,
            poupanca,
            DespesasMes: [.. extrasDoMes.Select(e => new LinhaFolhaDto(e.Titulo, e.Valor, e.Data, CartaoAlimentacao: e.PagaComCartao ? true : null))],
            Anual: [.. listaFixas.Where(f => f.EAnual && string.IsNullOrEmpty(f.Fim)).Select(f => new LinhaFolhaDto(f.Titulo, f.Valor))],
            SaldoConta: eAtual ? Calculos.Centimos(utilizador?.Saldo ?? 0m) : resumo?.SaldoFinal ?? importado?.SaldoConta,
            Falta: eAtual ? falta : [],
            SaldoPoupanca: eAtual
                ? [.. listaPoupancas.Select(p => new LinhaFolhaDto(p.Nome, Calculos.Centimos(p.Saldo)))]
                : importado?.SaldoPoupanca?.Select(l => l.ParaDto()).ToList() ?? [],
            TotalAPagar: eAtual
                ? [.. dividasComEstado.Where(d => d.EmFalta > 0).Select(d => new LinhaFolhaDto(d.Titulo, d.TotalAPagar()))]
                : importado?.TotalAPagar?.Select(l => l.ParaDto()).ToList() ?? []);
    }

    // Grava uma folha lida do Excel nos dados da app, como histórico desse mês:
    //   - "Despesas": despesa mensal com o mesmo nome (ou nova, a começar nesse mês) + pagamento desse mês
    //   - "Despesas do Mês": despesas extras desse mês
    //   - "Anual": despesas anuais com o mesmo nome (ou novas, com o mês de pagamento por escolher)
    //   - "Lucro", "Poupança", "Saldo Conta", "Saldo Poupança", "Total a pagar": histórico do mês
    //     (e, se pedido, saldos das poupanças e dívidas atuais)
    // Nada disto mexe na conta de hoje (o dinheiro desses meses já saiu da conta na altura).
    // Importar o mesmo mês outra vez não duplica: o que já existe é ignorado.
    // Tudo numa só transação: se alguma coisa falhar, não fica nada a meio.
    public Task<ResumoImportacaoDto> ImportarAsync(
        string uid,
        string mes,
        DadosFolhaMesDto dados,
        OpcoesImportacaoDto? opcoes,
        CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(c => ImportarNaTransacaoAsync(uid, mes, dados, opcoes ?? new OpcoesImportacaoDto(), c), ct);

    private async Task<ResumoImportacaoDto> ImportarNaTransacaoAsync(
        string uid,
        string mes,
        DadosFolhaMesDto dados,
        OpcoesImportacaoDto opcoes,
        CancellationToken ct)
    {
        var agora = relogio.Agora;
        var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, ct);
        // Duas importações ao mesmo tempo (ex.: dois toques no botão) ficam uma depois da outra
        utilizadores.ReservarParaAlteracao(utilizador);

        var despesasCriadas = new List<string>();
        var anuaisCriadas = new List<string>();
        var historico = new List<string>();
        var poupancasAtualizadas = new List<string>();
        var dividasAtualizadas = new List<string>();
        var porPagar = new List<string>();
        var ignoradas = new List<string>();
        var pagamentosRegistados = 0;
        var extrasRegistadas = 0;

        // As linhas criadas ficam pela ordem da folha (a hora de criação é a ordem das listas)
        var sequencia = 0;
        DateTimeOffset ProximaHora() => agora.AddMicroseconds(sequencia++);

        var listaFixas = await fixas.ListarAsync(uid, ct);
        var pagamentosDoMes = await pagamentos.ListarDoMesAsync(uid, mes, ct);
        var extrasDoMes = await extras.ListarDoMesAsync(uid, mes, ct);
        var mensaisPorNome = new Dictionary<string, DespesaFixa>();
        var anuaisPorNome = new Dictionary<string, DespesaFixa>();
        foreach (var fixa in listaFixas)
        {
            (fixa.EAnual ? anuaisPorNome : mensaisPorNome)[Formatos.NormalizarTitulo(fixa.Titulo)] = fixa;
        }

        // Uma despesa que já existia a partir de um mês mais tarde passa a contar desde este,
        // senão o pagamento importado ficava fora do período em que a despesa conta
        void RecuarInicio(DespesaFixa fixa)
        {
            if (!string.IsNullOrEmpty(fixa.Inicio) && Meses.Antes(mes, fixa.Inicio))
            {
                fixa.Inicio = mes;
            }
        }

        DespesaFixa NovaFixa(LinhaFolhaDto linha, Periodicidade? periodicidade)
        {
            var fixa = new DespesaFixa
            {
                UtilizadorId = uid,
                Id = Ids.Novo(),
                Titulo = linha.Titulo.Trim(),
                Valor = Calculos.Centimos(linha.Valor),
                Periodicidade = periodicidade,
                Inicio = mes,
                CriadoEm = ProximaHora(),
            };
            fixas.Adicionar(fixa);
            return fixa;
        }

        // ---- Despesas (mensais) ----

        // No mês atual, o que a folha ainda tem na "Falta" não está pago: fica por pagar na app
        // (o débito automático ou o botão de pagar tratam dele). Nos meses passados está tudo pago
        var emFalta = mes == relogio.MesAtual
            ? dados.Falta.Where(Valida).Select(l => Formatos.NormalizarTitulo(l.Titulo)).ToHashSet()
            : [];
        var comRegisto = pagamentosDoMes.Select(p => p.FixaId).ToHashSet();

        foreach (var linha in dados.Despesas.Where(Valida))
        {
            var chave = Formatos.NormalizarTitulo(linha.Titulo);
            if (mensaisPorNome.TryGetValue(chave, out var fixa))
            {
                RecuarInicio(fixa);
            }
            else
            {
                fixa = NovaFixa(linha, periodicidade: null);
                mensaisPorNome[chave] = fixa;
                despesasCriadas.Add(fixa.Titulo);
            }

            if (comRegisto.Contains(fixa.Id))
            {
                ignoradas.Add($"{linha.Titulo} (já tinha registo em {mes})");
                continue;
            }

            if (emFalta.Contains(chave))
            {
                porPagar.Add(linha.Titulo.Trim());
                continue;
            }

            pagamentos.Adicionar(new PagamentoFixa
            {
                UtilizadorId = uid,
                Id = PagamentoFixa.IdDe(mes, fixa.Id),
                FixaId = fixa.Id,
                Mes = mes,
                Titulo = fixa.Titulo,
                Valor = Calculos.Centimos(linha.Valor),
                Data = linha.Data ?? Meses.PrimeiroDia(mes),
                Estado = EstadoPagamento.Pago,
            });
            comRegisto.Add(fixa.Id);
            pagamentosRegistados++;
        }

        // ---- Despesas do Mês (extras) ----

        // Conta as repetições: duas linhas iguais na folha são duas despesas, e importar outra vez
        // só salta as que já lá estão
        var jaExistem = new Dictionary<string, int>();
        foreach (var extra in extrasDoMes)
        {
            var chave = ChaveExtra(extra.Titulo, extra.Valor);
            jaExistem[chave] = jaExistem.GetValueOrDefault(chave) + 1;
        }

        // A categoria de cada uma é a sugerida pelo título (como ao registar sem escolher categoria)
        List<DespesaExtra>? historicoExtras = null;
        IReadOnlyList<RegraCategoria>? regrasCategoria = null;
        foreach (var linha in dados.DespesasMes.Where(Valida))
        {
            var chave = ChaveExtra(linha.Titulo, linha.Valor);
            var existentes = jaExistem.GetValueOrDefault(chave);
            if (existentes > 0)
            {
                jaExistem[chave] = existentes - 1;
                ignoradas.Add($"{linha.Titulo} (já existia em {mes})");
                continue;
            }

            historicoExtras ??= await extras.ListarAsync(uid, ct);
            regrasCategoria ??= await categorizador.RegrasAsync(uid, ct);
            extras.Adicionar(DespesasExtrasService.Nova(
                uid,
                linha.Titulo,
                linha.Valor,
                linha.Data ?? Meses.PrimeiroDia(mes),
                descontada: false,
                ProximaHora(),
                Categorias.Sugerir(linha.Titulo, historicoExtras, regrasCategoria).Categoria));
            extrasRegistadas++;
        }

        // ---- Anual ----

        foreach (var linha in dados.Anual.Where(Valida))
        {
            var chave = Formatos.NormalizarTitulo(linha.Titulo);
            if (anuaisPorNome.TryGetValue(chave, out var existente))
            {
                RecuarInicio(existente);
                continue;
            }

            anuaisPorNome[chave] = NovaFixa(linha, Periodicidade.Anual);
            anuaisCriadas.Add(linha.Titulo.Trim());
        }

        // ---- Blocos sem outro sítio na app: histórico do mês ----

        var lucro = Validas(dados.Lucro);
        var poupanca = Validas(dados.Poupanca);
        var saldoPoupanca = Validas(dados.SaldoPoupanca);
        var totalAPagar = Validas(dados.TotalAPagar);
        if (lucro is not null) historico.Add("Lucro");
        if (poupanca is not null) historico.Add("Poupança");
        if (saldoPoupanca is not null) historico.Add("Saldo Poupança");
        if (totalAPagar is not null) historico.Add("Total a pagar");
        if (dados.SaldoConta is not null) historico.Add("Saldo Conta");

        if (historico.Count > 0)
        {
            var novos = new BlocosImportados
            {
                Lucro = lucro,
                Poupanca = poupanca,
                SaldoConta = dados.SaldoConta is { } saldo ? Calculos.Centimos(saldo) : null,
                SaldoPoupanca = saldoPoupanca,
                TotalAPagar = totalAPagar,
            };
            var resumo = await meses.ObterOuCriarAsync(uid, mes, ct);
            resumo.Importado = (resumo.Importado ?? new BlocosImportados()).Juntar(novos);
        }

        // ---- Se pedido: saldos das poupanças e dívidas atuais ----

        if (opcoes.AtualizarSaldosPoupancas && saldoPoupanca is not null)
        {
            var lista = await poupancas.ListarAsync(uid, ct);
            foreach (var linha in saldoPoupanca)
            {
                var existente = lista.FirstOrDefault(p => Formatos.NormalizarTitulo(p.Nome) == Formatos.NormalizarTitulo(linha.Titulo));
                if (existente is not null)
                {
                    existente.Saldo = linha.Valor;
                }
                else
                {
                    // Cria as que faltam, sem contribuição mensal
                    var nova = new Poupanca
                    {
                        UtilizadorId = uid,
                        Id = Ids.Novo(),
                        Nome = linha.Titulo,
                        Tipo = TipoContribuicao.Valor,
                        Valor = "0",
                        Saldo = linha.Valor,
                        Ordem = agora.ToUnixTimeMilliseconds(),
                    };
                    poupancas.Adicionar(nova);
                    lista.Add(nova);
                }

                poupancasAtualizadas.Add(linha.Titulo);
            }
        }

        if (opcoes.AtualizarDividas && totalAPagar is not null)
        {
            var lista = await dividas.ListarAsync(uid, ct);
            foreach (var linha in totalAPagar)
            {
                var chave = Formatos.NormalizarTitulo(linha.Titulo);
                // A descontar as prestações a partir do mês seguinte ao da folha
                var desde = Meses.Seguinte(mes);
                var existente = lista.FirstOrDefault(d => Formatos.NormalizarTitulo(d.Titulo) == chave);
                // Um crédito com taxa guarda o capital (não o total a pagar da folha): o valor dele vem do extrato do credor
                if (existente is { TaxaAnual: not null })
                {
                    dividasAtualizadas.Add(linha.Titulo);
                    continue;
                }

                if (existente is not null)
                {
                    existente.ValorInicial = linha.Valor;
                    existente.Desde = desde;
                }
                else
                {
                    // Ligada à despesa mensal com o mesmo nome (a prestação), se existir
                    var nova = new Divida
                    {
                        UtilizadorId = uid,
                        Id = Ids.Novo(),
                        Titulo = linha.Titulo,
                        ValorInicial = linha.Valor,
                        Desde = desde,
                        FixaId = mensaisPorNome.GetValueOrDefault(chave)?.Id,
                    };
                    dividas.Adicionar(nova);
                    lista.Add(nova);
                }

                dividasAtualizadas.Add(linha.Titulo);
            }
        }

        return new ResumoImportacaoDto(
            mes,
            despesasCriadas,
            pagamentosRegistados,
            extrasRegistadas,
            anuaisCriadas,
            historico,
            poupancasAtualizadas,
            dividasAtualizadas,
            porPagar,
            ignoradas);
    }

    private static bool Valida(LinhaFolhaDto linha) => !string.IsNullOrWhiteSpace(linha.Titulo) && linha.Valor > 0;

    // As linhas válidas de um bloco (títulos sem espaços a mais, valores ao cêntimo), ou null se não houver
    private static List<LinhaFolha>? Validas(IReadOnlyList<LinhaFolhaDto>? linhas)
    {
        var validas = (linhas ?? []).Where(Valida).Select(l => l.ParaEntidade()).ToList();
        return validas.Count > 0 ? validas : null;
    }

    private static string ChaveExtra(string titulo, decimal valor) =>
        $"{Formatos.NormalizarTitulo(titulo)}|{Calculos.Centimos(valor).ToString("0.00", CultureInfo.InvariantCulture)}";
}
