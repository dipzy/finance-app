using Financas.Services;
using Financas.Services.Dtos;
using Financas.Services.Regras;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Financas.Services.Relatorios;

/// <summary>
/// O relatório de um mês em A4, com fundo branco (para imprimir) e os acentos da app (ciano e violeta):
/// cabeçalho, números do mês, gráficos (distribuição, gastos por categoria, evolução) e as tabelas.
/// Só desenha: todos os números vêm em <see cref="DadosRelatorioMes"/>.
/// </summary>
public sealed class DocumentoRelatorioMes(DadosRelatorioMes dados) : IDocument
{
    /// <summary>Gera o PDF (bytes).</summary>
    public static byte[] Gerar(DadosRelatorioMes dados)
    {
        ConfiguracaoPdf.Configurar();
        return new DocumentoRelatorioMes(dados).GeneratePdf();
    }

    private string Titulo => $"Finanças — {FormatosPdf.MesAno(dados.Mes)}";

    public DocumentMetadata GetMetadata() => new()
    {
        Title = Titulo,
        Author = string.IsNullOrEmpty(dados.NomeUtilizador) ? "Finanças" : dados.NomeUtilizador,
        Subject = Textos.T("Relatório mensal"),
        Creator = "Finanças",
        Language = Textos.Linguagem == "en" ? "en" : "pt-PT",
    };

    public void Compose(IDocumentContainer documento)
    {
        documento.Page(pagina =>
        {
            pagina.Size(PageSizes.A4);
            pagina.MarginHorizontal(36);
            pagina.MarginVertical(30);
            pagina.PageColor(Colors.White);
            pagina.DefaultTextStyle(t => t.FontFamily(ConfiguracaoPdf.Letra).FontSize(8.5f).FontColor(Cores.Texto));

            pagina.Header().Element(Cabecalho);
            pagina.Content().PaddingTop(12).Element(Conteudo);
            pagina.Footer().Element(Rodape);
        });
    }

    // ---- Cabeçalho e rodapé ----

    private void Cabecalho(IContainer container)
    {
        container.Column(col =>
        {
            // A faixa com as duas cores da app
            col.Item().Height(4).Row(faixa =>
            {
                faixa.RelativeItem().Background(Cores.Ciano);
                faixa.RelativeItem().Background(Cores.Violeta);
            });

            // Na primeira página o título grande; nas seguintes só uma linha
            col.Item().ShowOnce().PaddingTop(10).Row(linha =>
            {
                linha.RelativeItem().Column(titulo =>
                {
                    titulo.Item().Text(Titulo).FontSize(18).Bold();
                    if (!string.IsNullOrEmpty(dados.NomeUtilizador))
                    {
                        titulo.Item().PaddingTop(2).Text(dados.NomeUtilizador).FontSize(9.5f).FontColor(Cores.TextoSecundario);
                    }
                });
                linha.AutoItem().AlignBottom().AlignRight().Column(gerado =>
                {
                    gerado.Item().AlignRight().Text(Textos.T("Relatório mensal")).FontSize(8).SemiBold().FontColor(Cores.Violeta);
                    gerado.Item().AlignRight().Text(Textos.T($"Gerado em {dados.GeradoEm:dd'/'MM'/'yyyy}, {dados.GeradoEm:HH':'mm}"))
                        .FontSize(7.5f).FontColor(Cores.TextoSecundario);
                });
            });

            col.Item().SkipOnce().PaddingTop(6).Row(linha =>
            {
                linha.RelativeItem().Text(Titulo).FontSize(9).SemiBold();
                linha.AutoItem().Text(dados.NomeUtilizador).FontSize(8).FontColor(Cores.TextoSecundario);
            });

            col.Item().PaddingTop(8).LineHorizontal(0.6f).LineColor(Cores.Linha);
        });
    }

    private void Rodape(IContainer container)
    {
        container.PaddingTop(6).BorderTop(0.6f).BorderColor(Cores.Linha).PaddingTop(5).Row(linha =>
        {
            linha.RelativeItem().Text($"Finanças · {FormatosPdf.MesAno(dados.Mes)}").FontSize(7).FontColor(Cores.TextoSecundario);
            linha.RelativeItem().AlignRight().Text(t =>
            {
                t.DefaultTextStyle(s => s.FontSize(7).FontColor(Cores.TextoSecundario));
                t.Span(Textos.T("Página "));
                t.CurrentPageNumber();
                t.Span(Textos.T(" de "));
                t.TotalPages();
            });
        });
    }

    // ---- Conteúdo ----

    private void Conteudo(IContainer container)
    {
        container.Column(col =>
        {
            col.Spacing(14);
            col.Item().Element(NumerosDoMes);
            col.Item().Element(Graficos);
            col.Item().Element(GraficoEvolucao);
            col.Item().Element(TabelaDespesasMensais);
            col.Item().Element(TabelaDespesasExtras);
            col.Item().Element(TabelaOrcamentos);
            col.Item().Element(TabelaObjetivos);
            col.Item().Row(linha =>
            {
                linha.Spacing(14);
                linha.RelativeItem().Element(TabelaPoupancas);
                linha.RelativeItem().Element(TabelaDividas);
            });
        });
    }

    private void NumerosDoMes(IContainer container)
    {
        var n = dados.Numeros;
        container.Column(col =>
        {
            col.Spacing(8);
            col.Item().Row(linha =>
            {
                linha.Spacing(8);
                Cartao(linha.RelativeItem(), "Entrou", n.Entrou, Cores.Entrou);
                Cartao(linha.RelativeItem(), "Despesas fixas", n.DespesasMensais, Cores.DespesasMensais);
                Cartao(linha.RelativeItem(), "Gastos do dia a dia", n.DespesasExtras, Cores.DespesasExtras);
                Cartao(linha.RelativeItem(), "Poupado", n.Poupado, Cores.Poupado);
                Cartao(linha.RelativeItem(), "Livre", n.Livre, Cores.Livre);
            });
            col.Item().Row(linha =>
            {
                linha.Spacing(8);
                Cartao(linha.RelativeItem(), dados.EMesAtual ? "Saldo da conta" : "Saldo final da conta", dados.SaldoConta, Cores.Ciano);
                if (dados.EMesAtual)
                {
                    Cartao(linha.RelativeItem(), "Previsão no fim do mês", dados.Previsao, Cores.Violeta);
                }

                Cartao(linha.RelativeItem(), dados.EMesAtual ? "Cartão de alimentação" : "Cartão de alimentação (hoje)", dados.CartaoAlimentacao, Cores.Entrou);
            });
        });
    }

    private static void Cartao(IContainer container, string rotulo, decimal? valor, string cor)
    {
        container
            .Background(Cores.FundoCartao)
            .CornerRadius(5)
            .Row(linha =>
            {
                linha.ConstantItem(3).Background(cor);
                linha.RelativeItem().PaddingVertical(7).PaddingHorizontal(8).Column(col =>
                {
                    col.Item().Text(Textos.T(rotulo)).FontSize(7.5f).FontColor(Cores.TextoSecundario);
                    col.Item().PaddingTop(2).Text(valor is { } v ? FormatosPdf.Euro(v) : "—")
                        .FontSize(11.5f).Bold().FontColor(valor < 0 ? Cores.Negativo : Cores.Texto);
                });
            });
    }

    // ---- Gráficos ----

    private void Graficos(IContainer container)
    {
        container.Row(linha =>
        {
            linha.Spacing(16);
            linha.RelativeItem(5).Column(col =>
            {
                col.Item().Element(c => TituloSecao(c, "Distribuição do mês"));
                col.Item().PaddingTop(6).Row(r =>
                {
                    r.ConstantItem(112).Height(112).Svg(tamanho => GraficosSvg.Anel(
                        tamanho.Width, tamanho.Height, dados.Distribuicao, Textos.T("Entrou"), FormatosPdf.Euro(dados.Numeros.Entrou)));
                    r.RelativeItem().PaddingLeft(10).AlignMiddle().Column(legenda =>
                    {
                        legenda.Spacing(5);
                        var total = dados.Distribuicao.Where(f => f.Valor > 0).Sum(f => f.Valor);
                        foreach (var fatia in dados.Distribuicao)
                        {
                            legenda.Item().Row(l =>
                            {
                                l.ConstantItem(8).AlignMiddle().Height(8).Background(Cores.DaFatia(fatia.Chave)).CornerRadius(2);
                                l.RelativeItem().PaddingLeft(5).Text(fatia.Nome).FontSize(7.5f);
                                l.AutoItem().Text(t =>
                                {
                                    t.Span(FormatosPdf.Euro(fatia.Valor)).FontSize(7.5f).SemiBold();
                                    if (total > 0 && fatia.Valor > 0)
                                    {
                                        t.Span($"  {FormatosPdf.Percentagem(Math.Round(fatia.Valor / total * 100m, 1))}").FontSize(7).FontColor(Cores.TextoSecundario);
                                    }
                                });
                            });
                        }
                    });
                });
            });

            linha.RelativeItem(4).Column(col =>
            {
                col.Item().Element(c => TituloSecao(c, "Gastos por categoria"));
                var categorias = dados.Categorias.Categorias.Where(c => c.Total > 0).ToList();
                if (categorias.Count == 0)
                {
                    col.Item().PaddingTop(6).Element(c => Vazio(c, "Sem gastos neste mês."));
                    return;
                }

                var maximo = categorias.Max(c => c.Total);
                col.Item().PaddingTop(6).Column(barras =>
                {
                    barras.Spacing(4);
                    foreach (var c in categorias.Take(8))
                    {
                        barras.Item().Row(l =>
                        {
                            l.ConstantItem(70).Text(Categorias.Nome(c.Categoria)).FontSize(7.5f);
                            l.RelativeItem().AlignMiddle().Height(7).Row(barra =>
                            {
                                var parte = (float)(c.Total / maximo);
                                barra.RelativeItem(Math.Max(parte, 0.001f)).Background(Cores.DaCategoria(c.Categoria)).CornerRadius(2);
                                if (parte < 1)
                                {
                                    barra.RelativeItem(1 - parte);
                                }
                            });
                            l.ConstantItem(58).AlignRight().Text(FormatosPdf.Euro(c.Total)).FontSize(7.5f).SemiBold();
                        });
                    }

                    if (categorias.Count > 8)
                    {
                        barras.Item().Text(Textos.T($"+ {categorias.Count - 8} categorias")).FontSize(7).FontColor(Cores.TextoSecundario);
                    }
                });
            });
        });
    }

    private void GraficoEvolucao(IContainer container)
    {
        container.Column(col =>
        {
            col.Item().Row(linha =>
            {
                linha.RelativeItem().Element(c => TituloSecao(c, $"Evolução dos últimos {dados.Evolucao.Count} meses"));
            });
            col.Item().PaddingTop(4).Row(legenda =>
            {
                legenda.Spacing(10);
                foreach (var (nome, cor) in new[]
                         {
                             ("Entrou", Cores.Entrou),
                             ("Despesas fixas", Cores.DespesasMensais),
                             ("Gastos do dia a dia", Cores.DespesasExtras),
                             ("Poupado", Cores.Poupado),
                             ("Livre", Cores.Livre),
                         })
                {
                    legenda.AutoItem().Row(l =>
                    {
                        l.ConstantItem(7).AlignMiddle().Height(7).Background(cor).CornerRadius(2);
                        l.AutoItem().PaddingLeft(4).Text(Textos.T(nome)).FontSize(7).FontColor(Cores.TextoSecundario);
                    });
                }
            });
            col.Item().PaddingTop(6).Height(150).Svg(tamanho => GraficosSvg.Evolucao(tamanho.Width, tamanho.Height, dados.Evolucao));
        });
    }

    // ---- Tabelas ----

    private void TabelaDespesasMensais(IContainer container)
    {
        Secao(container, "Despesas fixas", dados.DespesasMensais.Count == 0 ? "Sem despesas fixas." : null, tabela =>
        {
            tabela.ColumnsDefinition(c =>
            {
                c.RelativeColumn(4);
                c.ConstantColumn(40);
                c.ConstantColumn(80);
                c.ConstantColumn(80);
            });
            tabela.Header(h =>
            {
                Cabeca(h.Cell(), "Despesa");
                Cabeca(h.Cell(), "Dia", direita: true);
                Cabeca(h.Cell(), "Valor", direita: true);
                Cabeca(h.Cell(), "Estado", direita: true);
            });
            foreach (var d in dados.DespesasMensais)
            {
                Celula(tabela.Cell()).Text(d.Titulo);
                Celula(tabela.Cell()).AlignRight().Text(d.Dia?.ToString() ?? "—");
                Celula(tabela.Cell()).AlignRight().Text(FormatosPdf.Euro(d.Valor));
                var (estado, cor) = d.Estado switch
                {
                    EstadoLinha.Pago => (d.PagaEm is { } em ? $"Pago {FormatosPdf.DiaMes(em)}" : "Pago", Cores.Positivo),
                    EstadoLinha.Parcial => ("Parcial", Cores.Aviso),
                    EstadoLinha.PorPagar => ("Por pagar", Cores.Aviso),
                    _ => ("—", Cores.TextoSecundario),
                };
                Celula(tabela.Cell()).AlignRight().Text(Textos.T(estado)).FontColor(cor).SemiBold();
            }

            Total(tabela, 4, dados.DespesasMensais.Sum(d => d.Valor), colunaValor: 3);
        });
    }

    private void TabelaDespesasExtras(IContainer container)
    {
        Secao(container, "Gastos do dia a dia", dados.DespesasExtras.Count == 0 ? "Sem gastos neste mês." : null, tabela =>
        {
            tabela.ColumnsDefinition(c =>
            {
                c.ConstantColumn(58);
                c.RelativeColumn(4);
                c.RelativeColumn(2);
                c.ConstantColumn(56);
                c.ConstantColumn(72);
            });
            tabela.Header(h =>
            {
                Cabeca(h.Cell(), "Data");
                Cabeca(h.Cell(), "Despesa");
                Cabeca(h.Cell(), "Categoria");
                Cabeca(h.Cell(), "Pago com");
                Cabeca(h.Cell(), "Valor", direita: true);
            });
            foreach (var e in dados.DespesasExtras)
            {
                Celula(tabela.Cell()).Text(e.Data is { } d ? FormatosPdf.Data(d) : "—");
                Celula(tabela.Cell()).Text(e.Titulo);
                Celula(tabela.Cell()).Text(e.Categoria).FontColor(Cores.TextoSecundario);
                Celula(tabela.Cell()).Text(Textos.T(e.PagaComCartao ? "Cartão" : "Conta"));
                Celula(tabela.Cell()).AlignRight().Text(FormatosPdf.Euro(e.Valor));
            }

            Total(tabela, 5, dados.DespesasExtras.Sum(e => e.Valor), colunaValor: 5);
        });
    }

    private void TabelaOrcamentos(IContainer container)
    {
        Secao(container, "Orçamentos", dados.Orcamentos.Count == 0 ? "Sem orçamentos." : null, tabela =>
        {
            tabela.ColumnsDefinition(c =>
            {
                c.RelativeColumn(2);
                c.ConstantColumn(70);
                c.ConstantColumn(70);
                c.RelativeColumn(2);
                c.ConstantColumn(44);
            });
            tabela.Header(h =>
            {
                Cabeca(h.Cell(), "Categoria");
                Cabeca(h.Cell(), "Limite", direita: true);
                Cabeca(h.Cell(), "Gasto", direita: true);
                Cabeca(h.Cell(), "");
                Cabeca(h.Cell(), "%", direita: true);
            });
            foreach (var o in dados.Orcamentos)
            {
                var cor = o.Estado switch
                {
                    EstadoOrcamento.Ultrapassado => Cores.Negativo,
                    EstadoOrcamento.Perto => Cores.Aviso,
                    _ => Cores.Positivo,
                };
                Celula(tabela.Cell()).Text(Categorias.Nome(o.Categoria));
                Celula(tabela.Cell()).AlignRight().Text(FormatosPdf.Euro(o.Limite));
                Celula(tabela.Cell()).AlignRight().Text(FormatosPdf.Euro(o.Gasto));
                Celula(tabela.Cell()).PaddingLeft(10).AlignMiddle().Element(c => Progresso(c, o.Percentagem, cor));
                Celula(tabela.Cell()).AlignRight().Text(FormatosPdf.Percentagem(o.Percentagem)).FontColor(cor).SemiBold();
            }
        });
    }

    private void TabelaObjetivos(IContainer container)
    {
        Secao(container, "Objetivos de poupança", dados.Objetivos.Count == 0 ? "Sem objetivos." : null, tabela =>
        {
            tabela.ColumnsDefinition(c =>
            {
                c.RelativeColumn(3);
                c.ConstantColumn(48);
                c.ConstantColumn(118);
                c.RelativeColumn(2);
                c.ConstantColumn(40);
                c.ConstantColumn(78);
            });
            tabela.Header(h =>
            {
                Cabeca(h.Cell(), "Objetivo");
                Cabeca(h.Cell(), "Até");
                Cabeca(h.Cell(), "Atual / alvo", direita: true);
                Cabeca(h.Cell(), "");
                Cabeca(h.Cell(), "%", direita: true);
                Cabeca(h.Cell(), "Estado", direita: true);
            });
            foreach (var o in dados.Objetivos)
            {
                var (estado, cor) = o.Estado switch
                {
                    EstadoObjetivo.Atingido => ("Atingido", Cores.Positivo),
                    EstadoObjetivo.Atrasado => ("Atrasado", Cores.Negativo),
                    _ => ("No bom caminho", Cores.Ciano),
                };
                Celula(tabela.Cell()).Text(o.Nome);
                Celula(tabela.Cell()).Text(FormatosPdf.MesCurto(o.MesAlvo));
                Celula(tabela.Cell()).AlignRight().Text($"{FormatosPdf.Euro(o.ValorAtual)} / {FormatosPdf.Euro(o.ValorAlvo)}");
                Celula(tabela.Cell()).PaddingLeft(10).AlignMiddle().Element(c => Progresso(c, o.Percentagem, Cores.Violeta));
                Celula(tabela.Cell()).AlignRight().Text(FormatosPdf.Percentagem(o.Percentagem)).SemiBold();
                Celula(tabela.Cell()).AlignRight().Text(Textos.T(estado)).FontColor(cor).SemiBold();
            }
        });
    }

    private void TabelaPoupancas(IContainer container)
    {
        Secao(container, "Poupanças", dados.Poupancas.Count == 0 ? "Sem poupanças." : null, tabela =>
        {
            tabela.ColumnsDefinition(c =>
            {
                c.RelativeColumn();
                c.ConstantColumn(76);
            });
            tabela.Header(h =>
            {
                Cabeca(h.Cell(), "Poupança");
                Cabeca(h.Cell(), "Saldo", direita: true);
            });
            foreach (var p in dados.Poupancas)
            {
                Celula(tabela.Cell()).Text(p.Nome);
                Celula(tabela.Cell()).AlignRight().Text(FormatosPdf.Euro(p.Saldo));
            }

            Total(tabela, 2, dados.Poupancas.Sum(p => p.Saldo), colunaValor: 2);
        });
    }

    private void TabelaDividas(IContainer container)
    {
        Secao(container, "Dívidas", dados.Dividas.Count == 0 ? "Sem dívidas por pagar." : null, tabela =>
        {
            tabela.ColumnsDefinition(c =>
            {
                c.RelativeColumn();
                c.ConstantColumn(76);
            });
            tabela.Header(h =>
            {
                Cabeca(h.Cell(), "Dívida");
                Cabeca(h.Cell(), "Em falta", direita: true);
            });
            foreach (var d in dados.Dividas)
            {
                Celula(tabela.Cell()).Text(Textos.T(d.MesesEmFalta is { } meses ? $"{d.Titulo} ({meses} {(meses == 1 ? "mês" : "meses")})" : d.Titulo));
                Celula(tabela.Cell()).AlignRight().Text(FormatosPdf.Euro(d.TotalAPagar()));
            }

            Total(tabela, 2, dados.Dividas.Sum(d => d.TotalAPagar()), colunaValor: 2);
        });
    }

    // ---- Peças ----

    private static void TituloSecao(IContainer container, string titulo)
    {
        container.Row(linha =>
        {
            linha.ConstantItem(3).Height(11).Background(Cores.Violeta);
            linha.RelativeItem().PaddingLeft(6).Text(Textos.T(titulo)).FontSize(10.5f).Bold();
        });
    }

    private static void Vazio(IContainer container, string texto) =>
        container.Text(Textos.T(texto)).FontSize(8).FontColor(Cores.TextoSecundario);

    // Uma secção com título e tabela; o título nunca fica sozinho no fim de uma página
    private static void Secao(IContainer container, string titulo, string? vazio, Action<TableDescriptor> tabela)
    {
        container.EnsureSpace(70).Column(col =>
        {
            col.Item().Element(c => TituloSecao(c, titulo));
            if (vazio is not null)
            {
                col.Item().PaddingTop(5).Element(c => Vazio(c, vazio));
                return;
            }

            col.Item().PaddingTop(5).Table(tabela);
        });
    }

    private static void Cabeca(IContainer celula, string texto, bool direita = false)
    {
        var c = celula.BorderBottom(0.8f).BorderColor(Cores.Eixo).PaddingVertical(4).PaddingHorizontal(3);
        (direita ? c.AlignRight() : c).Text(Textos.T(texto)).FontSize(7.5f).SemiBold().FontColor(Cores.TextoSecundario);
    }

    private static IContainer Celula(IContainer celula) =>
        celula.BorderBottom(0.5f).BorderColor(Cores.Linha).PaddingVertical(3.5f).PaddingHorizontal(3);

    private static void Total(TableDescriptor tabela, int colunas, decimal total, int colunaValor)
    {
        tabela.Cell().ColumnSpan((uint)(colunaValor - 1)).PaddingVertical(4).PaddingHorizontal(3).Text(Textos.T("Total")).SemiBold();
        tabela.Cell().PaddingVertical(4).PaddingHorizontal(3).AlignRight().Text(FormatosPdf.Euro(total)).Bold();
        if (colunas > colunaValor)
        {
            tabela.Cell().ColumnSpan((uint)(colunas - colunaValor));
        }
    }

    private static void Progresso(IContainer container, decimal percentagem, string cor)
    {
        var parte = (float)Math.Clamp(percentagem / 100m, 0m, 1m);
        container.Height(5).Background(Cores.Linha).CornerRadius(2.5f).Row(barra =>
        {
            if (parte > 0)
            {
                barra.RelativeItem(parte).Background(cor).CornerRadius(2.5f);
            }

            if (parte < 1)
            {
                barra.RelativeItem(1 - parte);
            }
        });
    }
}
