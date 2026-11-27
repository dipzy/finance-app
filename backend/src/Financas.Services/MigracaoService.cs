using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Microsoft.Extensions.Logging;

namespace Financas.Services;

/// <summary>
/// Cópia única dos dados do Firestore para esta API.
/// <para>
/// A app (services/migracaoFirestore.ts) pergunta primeiro o <see cref="ObterEstadoAsync">estado</see>;
/// se o servidor ainda não tiver dados deste utilizador, lê tudo do Firestore (só leitura) e envia.
/// Aqui os dados são validados e gravados numa só transação, mantendo os ids originais; depois
/// correm as conversões dos dados antigos (<see cref="IPreparacaoDadosService"/>).
/// </para>
/// </summary>
internal sealed class MigracaoService(
    IUtilizadoresRepository utilizadores,
    IDespesasFixasRepository fixas,
    IPagamentosRepository pagamentos,
    IDespesasExtrasRepository extras,
    IPoupancasRepository poupancas,
    IDividasRepository dividas,
    IMesesRepository meses,
    IPreparacaoDadosService preparacao,
    IUnitOfWork unitOfWork,
    Relogio relogio,
    ILogger<MigracaoService> logger) : IMigracaoService
{
    public async Task<EstadoMigracaoDto> ObterEstadoAsync(string uid, CancellationToken ct = default)
    {
        var utilizador = await utilizadores.ObterAsync(uid, ct);
        // Os resumos dos meses não contam: são criados sozinhos ao abrir a app
        var temDados = (utilizador is not null
                && (utilizador.Saldo != 0 || utilizador.Salario is not null || utilizador.Financeiro is not null || utilizador.ConfigPprPoupanca is not null))
            || await fixas.ExistemAsync(uid, ct)
            || await extras.ExistemAsync(uid, ct)
            || await pagamentos.ExistemAsync(uid, ct)
            || await poupancas.ExistemAsync(uid, ct)
            || await dividas.ExistemAsync(uid, ct);
        return new EstadoMigracaoDto(temDados, utilizador?.ImportadoDoFirestoreEm is not null);
    }

    public async Task<ResumoMigracaoDto> ImportarFirestoreAsync(string uid, DadosFirestoreDto dados, CancellationToken ct = default)
    {
        var resumo = await unitOfWork.ExecuteInTransactionAsync(c => CopiarAsync(uid, dados, c), ct);
        logger.LogInformation(
            "Dados do Firestore copiados para {Uid}: {Fixas} despesas fixas, {Pagamentos} pagamentos, {Extras} extras, {Ignorados} ignorados",
            uid,
            resumo.DespesasFixas,
            resumo.PagamentosFixas,
            resumo.DespesasExtras,
            resumo.Ignorados.Count);

        // As conversões dos dados antigos (como na primeira utilização da versão Firestore)
        await preparacao.PrepararAsync(uid, ct);
        return resumo;
    }

    private async Task<ResumoMigracaoDto> CopiarAsync(string uid, DadosFirestoreDto dados, CancellationToken ct)
    {
        var estado = await ObterEstadoAsync(uid, ct);
        if (estado.TemDados || estado.Importado)
        {
            throw new ConflitoException("Este utilizador já tem dados no servidor: a cópia do Firestore só é feita uma vez.");
        }

        var agora = relogio.Agora;
        var ignorados = new List<string>();
        var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, ct);
        utilizadores.ReservarParaAlteracao(utilizador);
        CopiarUtilizador(utilizador, dados.Utilizador, agora);
        utilizador.ImportadoDoFirestoreEm = agora;

        var nFixas = 0;
        var idsFixas = new HashSet<string>();
        var novasFixas = new Dictionary<string, DespesaFixa>();
        foreach (var d in dados.DespesasFixas ?? [])
        {
            if (!IdValido(d.Id, "despesasFixas", ignorados) || !idsFixas.Add(d.Id))
            {
                continue;
            }

            var nova = new DespesaFixa
            {
                UtilizadorId = uid,
                Id = d.Id,
                Titulo = d.Titulo ?? "",
                Valor = Calculos.Centimos(d.Valor ?? 0),
                DiaDebito = d.DiaDebito is >= 1 and <= 31 ? d.DiaDebito : null,
                Inicio = MesOuNull(d.Inicio, $"despesasFixas/{d.Id}: início", ignorados),
                Fim = MesOuNull(d.Fim, $"despesasFixas/{d.Id}: fim", ignorados),
                Periodicidade = d.Periodicidade?.ToLowerInvariant() switch
                {
                    "anual" => Periodicidade.Anual,
                    "mensal" => Periodicidade.Mensal,
                    _ => null,
                },
                MesAnual = d.MesAnual is >= 1 and <= 12 ? d.MesAnual : null,
                CriadoEm = Instantes.Ler(d.CriadoEm) ?? agora,
                Debitado = d.Debitado,
                MesDebitado = MesOuNull(d.MesDebitado, $"despesasFixas/{d.Id}: mesDebitado", ignorados),
                AnuladoMes = MesOuNull(d.AnuladoMes, $"despesasFixas/{d.Id}: anuladoMes", ignorados),
            };
            fixas.Adicionar(nova);
            novasFixas[d.Id] = nova;
            nFixas++;
        }

        var nPagamentos = 0;
        var chavesPagamentos = new HashSet<string>();
        foreach (var p in dados.PagamentosFixas ?? [])
        {
            if (!IdValido(p.Id, "pagamentosFixas", ignorados))
            {
                continue;
            }

            var estadoPagamento = p.Estado?.ToLowerInvariant() switch
            {
                "pago" => EstadoPagamento.Pago,
                _ => (EstadoPagamento?)null,
            };
            // Pagamento desfeito na versão anterior: não há registo, só não se volta a debitar nesse mês
            if (p.Estado?.ToLowerInvariant() == "anulado")
            {
                var fixa = novasFixas.GetValueOrDefault(p.FixaId ?? "");
                if (fixa is not null && Meses.EValido(p.Mes) && string.CompareOrdinal(p.Mes, fixa.NaoDebitarAutomaticamenteEm) > 0)
                {
                    fixa.NaoDebitarAutomaticamenteEm = p.Mes;
                }

                continue;
            }

            if (string.IsNullOrEmpty(p.FixaId) || !Meses.EValido(p.Mes) || estadoPagamento is null)
            {
                ignorados.Add($"pagamentosFixas/{p.Id}: sem despesa, mês ou estado válidos");
                continue;
            }

            if (!chavesPagamentos.Add(PagamentoFixa.IdDe(p.Mes, p.FixaId)))
            {
                ignorados.Add($"pagamentosFixas/{p.Id}: repetido (a mesma despesa no mesmo mês)");
                continue;
            }

            pagamentos.Adicionar(new PagamentoFixa
            {
                UtilizadorId = uid,
                Id = p.Id,
                FixaId = p.FixaId,
                Mes = p.Mes,
                Titulo = p.Titulo ?? "",
                Valor = Calculos.Centimos(p.Valor ?? 0),
                Data = Formatos.LerData(p.Data) ?? Meses.PrimeiroDia(p.Mes),
                Estado = estadoPagamento.Value,
            });
            nPagamentos++;
        }

        var nExtras = 0;
        var idsExtras = new HashSet<string>();
        foreach (var e in dados.DespesasExtras ?? [])
        {
            if (!IdValido(e.Id, "despesasExtras", ignorados) || !idsExtras.Add(e.Id))
            {
                continue;
            }

            // As versões antigas guardavam a data como "28/09/2026"
            var data = Formatos.LerData(e.Data);
            if (data is null && !string.IsNullOrEmpty(e.Data))
            {
                ignorados.Add($"despesasExtras/{e.Id}: data '{e.Data}' não reconhecida (fica sem data)");
            }

            extras.Adicionar(new DespesaExtra
            {
                UtilizadorId = uid,
                Id = e.Id,
                Titulo = e.Titulo ?? "",
                Valor = Calculos.Centimos(e.Valor ?? 0),
                Data = data,
                Mes = Meses.EValido(e.Mes) ? e.Mes : Meses.DaData(data),
                DescontadaDaConta = e.DescontadaDaConta == true,
                CriadoEm = Instantes.Ler(e.CriadoEm) ?? agora,
            });
            nExtras++;
        }

        var nPoupancas = 0;
        var idsPoupancas = new HashSet<string>();
        foreach (var p in dados.Poupancas ?? [])
        {
            if (!IdValido(p.Id, "poupancas", ignorados) || !idsPoupancas.Add(p.Id))
            {
                continue;
            }

            poupancas.Adicionar(new Poupanca
            {
                UtilizadorId = uid,
                Id = p.Id,
                Nome = p.Nome ?? "",
                // Sem tipo, a versão anterior tratava a contribuição como percentagem
                Tipo = string.Equals(p.Tipo, "valor", StringComparison.OrdinalIgnoreCase) ? TipoContribuicao.Valor : TipoContribuicao.Percentagem,
                Valor = p.Valor ?? "0",
                Saldo = Calculos.Centimos(p.Saldo ?? 0),
                Ordem = p.Ordem,
            });
            nPoupancas++;
        }

        var nDividas = 0;
        var idsDividas = new HashSet<string>();
        foreach (var d in dados.Dividas ?? [])
        {
            if (!IdValido(d.Id, "dividas", ignorados) || !idsDividas.Add(d.Id))
            {
                continue;
            }

            if (!Meses.EValido(d.Desde))
            {
                ignorados.Add($"dividas/{d.Id}: mês 'desde' inválido (fica o mês atual)");
            }

            dividas.Adicionar(new Divida
            {
                UtilizadorId = uid,
                Id = d.Id,
                Titulo = d.Titulo ?? "",
                ValorInicial = Calculos.Centimos(d.ValorInicial ?? 0),
                Desde = Meses.EValido(d.Desde) ? d.Desde : relogio.MesAtual,
                FixaId = string.IsNullOrEmpty(d.FixaId) ? null : d.FixaId,
            });
            nDividas++;
        }

        // Resumos criados automaticamente antes da cópia (ao abrir a app) dão lugar aos do Firestore
        var mesesDoFirestore = (dados.Meses ?? []).Where(m => Meses.EValido(m.Id)).Select(m => m.Id!).ToHashSet();
        foreach (var existente in await meses.ListarAsync(uid, ct))
        {
            if (!mesesDoFirestore.Contains(existente.Mes))
            {
                meses.Remover(existente);
            }
        }

        var nMeses = 0;
        var idsMeses = new HashSet<string>();
        foreach (var m in dados.Meses ?? [])
        {
            if (!Meses.EValido(m.Id))
            {
                ignorados.Add($"meses/{m.Id}: o id não é um mês (AAAA-MM)");
                continue;
            }

            if (!idsMeses.Add(m.Id))
            {
                continue;
            }

            var resumo = await meses.ObterOuCriarAsync(uid, m.Id, ct);
            resumo.SaldoInicial = m.SaldoInicial is { } inicial ? Calculos.Centimos(inicial) : null;
            resumo.SaldoFinal = m.SaldoFinal is { } final ? Calculos.Centimos(final) : null;
            resumo.AbertoEm = Instantes.Ler(m.AbertoEm);
            resumo.Recebimento = ParaRecebimento(m.Recebimento);
            resumo.Importado = m.Importado is { } importado
                ? new BlocosImportados
                {
                    Lucro = ParaLinhas(importado.Lucro),
                    Poupanca = ParaLinhas(importado.Poupanca),
                    SaldoConta = importado.SaldoConta is { } saldo ? Calculos.Centimos(saldo) : null,
                    SaldoPoupanca = ParaLinhas(importado.SaldoPoupanca),
                    TotalAPagar = ParaLinhas(importado.TotalAPagar),
                }
                : null;
            nMeses++;
        }

        return new ResumoMigracaoDto(nFixas, nPagamentos, nExtras, nPoupancas, nDividas, nMeses, ignorados);
    }

    private static void CopiarUtilizador(Utilizador utilizador, UtilizadorFirestoreDto? dados, DateTimeOffset agora)
    {
        if (dados is null)
        {
            return;
        }

        utilizador.Email ??= dados.Email;
        utilizador.Nome ??= dados.Name;
        if (Instantes.Ler(dados.CreatedAt) is { } criadoEm)
        {
            utilizador.CriadoEm = criadoEm;
        }

        if (dados.Financeiro is { } f)
        {
            utilizador.Financeiro = new DadosFinanceirosAntigos
            {
                Salario = f.Salario,
                PprPercentagem = f.PprPercentagem,
                PoupancaPercentagem = f.PoupancaPercentagem,
                AtualizadoEm = f.LastUpdated,
            };
        }

        if (dados.Salario is { } s)
        {
            utilizador.Salario = new ConfiguracaoSalario
            {
                Valor = s.Valor ?? "",
                DiaRecebimento = s.DiaRecebimento is >= 1 and <= 31 ? s.DiaRecebimento.Value : 1,
                CartaoAlimentacao = s.CartaoAlimentacao,
                RecebidoEm = Instantes.Ler(s.LastReceived),
                UltimoRecebimento = ParaRecebimento(s.UltimoRecebimento),
            };
        }

        if (dados.ContaCorrente is { } conta)
        {
            utilizador.DefinirSaldo(conta.Saldo ?? 0, Instantes.Ler(conta.UltimaAtualizacao) ?? agora);
        }

        if (dados.ConfigPPRPoupanca is { } config)
        {
            utilizador.ConfigPprPoupanca = new ConfiguracaoPprPoupanca
            {
                PprTipo = ParaTipo(config.PprTipo),
                PprValor = config.PprValor ?? "",
                PoupancaTipo = ParaTipo(config.PoupancaTipo),
                PoupancaValor = config.PoupancaValor ?? "",
            };
        }

        utilizador.PagamentosPorMesConvertidos = dados.Migracoes?.PagamentosPorMes == true;
        utilizador.PoupancasListaConvertidas = dados.Migracoes?.PoupancasLista == true;
    }

    public Task<ResumoMigracaoDto> ImportarDadosLocaisAsync(string uid, DadosLocaisDto dados, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                utilizadores.ReservarParaAlteracao(utilizador);
                var ignorados = new List<string>();
                var sequencia = 0;

                if (dados.Financeiro is { } f)
                {
                    utilizador.Financeiro = new DadosFinanceirosAntigos
                    {
                        Salario = f.Salario,
                        PprPercentagem = f.PprPercentagem,
                        PoupancaPercentagem = f.PoupancaPercentagem,
                        AtualizadoEm = f.LastUpdated ?? agora.ToString("O"),
                    };
                }

                var nFixas = 0;
                foreach (var d in dados.DespesasFixas ?? [])
                {
                    if (string.IsNullOrWhiteSpace(d.Titulo))
                    {
                        ignorados.Add("despesa fixa sem título");
                        continue;
                    }

                    // Sem início: as despesas da versão antiga contam em todos os meses
                    fixas.Adicionar(new DespesaFixa
                    {
                        UtilizadorId = uid,
                        Id = Ids.Novo(),
                        Titulo = d.Titulo.Trim(),
                        Valor = Calculos.Centimos(d.Valor ?? 0),
                        CriadoEm = Instantes.Ler(d.CriadoEm) ?? agora.AddMicroseconds(sequencia++),
                    });
                    nFixas++;
                }

                var nExtras = 0;
                foreach (var e in dados.DespesasExtras ?? [])
                {
                    if (string.IsNullOrWhiteSpace(e.Titulo))
                    {
                        ignorados.Add("despesa extra sem título");
                        continue;
                    }

                    var data = Formatos.LerData(e.Data);
                    var criadoEm = Instantes.Ler(e.CriadoEm) ?? agora.AddMicroseconds(sequencia++);
                    // Não saíram da conta quando foram registadas (a conta ainda não existia)
                    extras.Adicionar(new DespesaExtra
                    {
                        UtilizadorId = uid,
                        Id = Ids.Novo(),
                        Titulo = e.Titulo.Trim(),
                        Valor = Calculos.Centimos(e.Valor ?? 0),
                        Data = data,
                        Mes = Meses.DaData(data) ?? Meses.De(DateOnly.FromDateTime(criadoEm.UtcDateTime)),
                        DescontadaDaConta = false,
                        CriadoEm = criadoEm,
                    });
                    nExtras++;
                }

                return new ResumoMigracaoDto(nFixas, 0, nExtras, 0, 0, 0, ignorados);
            },
            ct);

    private static bool IdValido([System.Diagnostics.CodeAnalysis.NotNullWhen(true)] string? id, string colecao, List<string> ignorados)
    {
        if (!string.IsNullOrWhiteSpace(id) && id.Length <= 128)
        {
            return true;
        }

        ignorados.Add($"{colecao}: documento sem id válido");
        return false;
    }

    private static string? MesOuNull(string? mes, string campo, List<string> ignorados)
    {
        if (string.IsNullOrEmpty(mes))
        {
            return null;
        }

        if (Meses.EValido(mes))
        {
            return mes;
        }

        ignorados.Add($"{campo} '{mes}' não é um mês (AAAA-MM): ignorado");
        return null;
    }

    private static TipoContribuicao ParaTipo(string? tipo) =>
        string.Equals(tipo, "valor", StringComparison.OrdinalIgnoreCase) ? TipoContribuicao.Valor : TipoContribuicao.Percentagem;

    private static Recebimento? ParaRecebimento(RecebimentoFirestoreDto? r) =>
        r is null
            ? null
            : new Recebimento(
                r.Salario ?? 0,
                r.Ppr ?? 0,
                r.Poupanca ?? 0,
                r.Liquido ?? 0,
                [.. (r.Contribuicoes ?? []).Select(c => new Contribuicao(c.PoupancaId, c.Nome ?? "", c.Valor ?? 0))],
                Instantes.Ler(r.Data));

    private static List<LinhaFolha>? ParaLinhas(IReadOnlyList<LinhaFirestoreDto>? linhas) =>
        linhas is null ? null : [.. linhas.Select(l => new LinhaFolha(l.Titulo ?? "", l.Valor ?? 0, Formatos.LerData(l.Data), l.Informativo))];
}
