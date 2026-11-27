using System.Text;
using System.Text.RegularExpressions;
using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Financas.Services.Relatorios;

namespace Financas.Services.Tests;

/// <summary>Contas simples a um PDF (sem bibliotecas): o cabeçalho e o número de páginas.</summary>
public static partial class Pdf
{
    public static bool EValido(byte[] bytes) =>
        bytes.Length > 1000
        && Encoding.ASCII.GetString(bytes, 0, 5) == "%PDF-"
        && Encoding.ASCII.GetString(bytes, Math.Max(0, bytes.Length - 1024), Math.Min(1024, bytes.Length)).Contains("%%EOF");

    /// <summary>Os objetos "/Type /Page" (não "/Pages").</summary>
    public static int ContarPaginas(byte[] bytes) => ObjetoPagina().Matches(Encoding.Latin1.GetString(bytes)).Count;

    [GeneratedRegex(@"/Type\s*/Page(?![a-zA-Z])")]
    private static partial Regex ObjetoPagina();
}

// O relatório mensal em PDF: os dados vêm dos outros serviços e o PDF é válido
public class RelatorioPdfTests : TestesServicos
{
    private IRelatorioPdfService Relatorio => A.Servico<IRelatorioPdfService>();

    // Hoje é 5 de outubro de 2026 (Ambiente)
    private async Task SemearAsync()
    {
        await A.Servico<IPerfilService>().GuardarAsync(Uid, new GuardarPerfilPedido("ana@exemplo.pt", "Ana Silva"));
        await Adicionar(2000);
        await AdicionarFixa("Renda", 650, diaDebito: 1, inicio: "2026-01");
        await AdicionarFixa("Ginásio", 35, diaDebito: 28, inicio: "2026-01");
        await CalcularSaldoDisponivel(); // débito automático da renda
        await Conta.DefinirCartaoAlimentacaoAsync(Uid, 150);
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Continente", 82.4m, Dia(2026, 10, 2), "supermercado"));
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Almoço", 9.5m, Dia(2026, 10, 3), "restauracao", MeioPagamento.CartaoAlimentacao));
        var ferias = await AdicionarPoupanca("Férias", TipoContribuicao.Valor, "100", 600);
        await A.Servico<IOrcamentosService>().AdicionarAsync(Uid, new NovoOrcamentoPedido("supermercado", 300));
        await A.Servico<IObjetivosService>().AdicionarAsync(Uid, new NovoObjetivoPedido("Viagem", 1500, "2027-06", ferias, null));
        await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Carro", 3000, "2026-01", null));
    }

    [Fact]
    public async Task Os_dados_sao_os_dos_outros_servicos()
    {
        await SemearAsync();

        var dados = await Relatorio.ObterDadosAsync(Uid, "2026-10");

        Assert.True(dados.EMesAtual);
        Assert.Equal("Ana Silva", dados.NomeUtilizador);
        var evolucao = await A.Servico<IEstatisticasService>().EvolucaoAsync(Uid, 12, "2026-10");
        Assert.Equal(evolucao[^1], dados.Numeros);
        Assert.Equal(12, dados.Evolucao.Count);
        Assert.Equal(Calculos.TotaisFolha(await Folha.ObterDadosAsync(Uid, "2026-10")).Previsao, dados.Previsao);
        Assert.Equal(150 - 9.5m, dados.CartaoAlimentacao);

        var renda = dados.DespesasMensais.Single(d => d.Titulo == "Renda");
        Assert.Equal((1, EstadoLinha.Pago, Dia(2026, 10, 5)), (renda.Dia!.Value, renda.Estado!.Value, renda.PagaEm!.Value));
        Assert.Equal(EstadoLinha.PorPagar, dados.DespesasMensais.Single(d => d.Titulo == "Ginásio").Estado);

        Assert.Equal(["Continente", "Almoço"], dados.DespesasExtras.Select(e => e.Titulo));
        Assert.Equal(("Supermercado", false), (dados.DespesasExtras[0].Categoria, dados.DespesasExtras[0].PagaComCartao));
        Assert.True(dados.DespesasExtras[1].PagaComCartao);
        Assert.Equal(82.4m, dados.Orcamentos.Single().Gasto);
        Assert.Equal("Viagem", dados.Objetivos.Single().Nome);
        Assert.Equal(600, dados.Poupancas.Single().Saldo);
        Assert.Equal(3000, dados.Dividas.Single().EmFalta);
    }

    [Fact]
    public async Task Gera_um_PDF_valido()
    {
        await SemearAsync();

        var pdf = await Relatorio.GerarMesAsync(Uid, "2026-10");

        Assert.Equal("financas-2026-10.pdf", pdf.NomeFicheiro);
        Assert.True(Pdf.EValido(pdf.Conteudo));
        Assert.True(pdf.Conteudo.Length > 10_000, $"PDF com só {pdf.Conteudo.Length} bytes");
        Assert.True(Pdf.ContarPaginas(pdf.Conteudo) >= 1);
    }

    [Fact]
    public async Task Um_utilizador_sem_dados_e_um_mes_passado_tambem_dao_PDF()
    {
        var pdf = await Relatorio.GerarMesAsync("sem-dados", "2026-03");

        Assert.True(Pdf.EValido(pdf.Conteudo));
        Assert.Equal(1, Pdf.ContarPaginas(pdf.Conteudo));
        Assert.False((await Relatorio.ObterDadosAsync("sem-dados", "2026-03")).EMesAtual);
    }

    [Fact]
    public async Task Um_mes_futuro_ou_invalido_e_recusado()
    {
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Relatorio.GerarMesAsync(Uid, "2026-11"));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Relatorio.GerarMesAsync(Uid, "2026-13"));
    }

    /// <summary>
    /// O documento com dados inventados (muitas linhas, para passar de página). Com a variável
    /// FINANCAS_RELATORIO_EXEMPLO=caminho.pdf, grava-o para se ver o aspeto.
    /// </summary>
    [Fact]
    public void Documento_com_dados_inventados()
    {
        var bytes = DocumentoRelatorioMes.Gerar(DadosInventados());

        Assert.True(Pdf.EValido(bytes));
        Assert.True(Pdf.ContarPaginas(bytes) >= 2);
        if (Environment.GetEnvironmentVariable("FINANCAS_RELATORIO_EXEMPLO") is { Length: > 0 } caminho)
        {
            File.WriteAllBytes(caminho, bytes);
        }
    }

    private static DadosRelatorioMes DadosInventados()
    {
        var evolucao = Enumerable.Range(0, 12).Select(i =>
        {
            var mes = Regras.Meses.Somar("2026-10", i - 11);
            var entrou = 1850m + (i % 3) * 120m;
            var mensais = 980m + (i % 4) * 25m;
            var extras = 260m + (i * 37 % 200);
            var poupado = 300m;
            return new EvolucaoMesDto(mes, entrou, mensais + extras, poupado, 1200m + i * 40, mensais, extras, Math.Max(0, entrou - mensais - extras - poupado));
        }).ToList();
        var numeros = evolucao[^1];
        string[] categorias = ["supermercado", "restauracao", "transportes", "combustivel", "casa", "lazer", "saude", "compras"];
        var extras = Enumerable.Range(1, 34).Select(i => new LinhaExtraRelatorio(
            new DateOnly(2026, 10, 1 + i % 28),
            i % 5 == 0 ? "Jantar de aniversário com os amigos da faculdade" : $"Despesa {i}",
            Categorias.Nome(categorias[i % categorias.Length]),
            i % 4 == 0,
            Math.Round(5m + i * 3.17m, 2))).OrderBy(e => e.Data).ToList();
        var gastos = extras.GroupBy(e => e.Categoria).Select(g => (Chave: categorias.First(c => Categorias.Nome(c) == g.Key), Total: g.Sum(e => e.Valor), Qtd: g.Count())).OrderByDescending(g => g.Total).ToList();
        var totalGastos = gastos.Sum(g => g.Total);

        return new DadosRelatorioMes(
            "2026-10",
            true,
            "Ana Silva",
            new DateTime(2026, 10, 5, 14, 32, 0),
            numeros,
            1234.56m,
            845.10m,
            127.30m,
            [
                new("poupancas", "Poupanças", numeros.Poupado),
                new("despesas", "Despesas mensais", numeros.DespesasMensais),
                new("extras", "Despesas extras", numeros.DespesasExtras),
                new("livre", "Livre", Math.Max(1, numeros.Livre)),
            ],
            evolucao,
            new GastosPorCategoriaDto("2026-10", totalGastos, [.. gastos.Select(g => new GastoCategoriaDto(g.Chave, g.Total, g.Qtd, Math.Round(g.Total / totalGastos * 100, 1)))]),
            [
                new("Renda", 1, 650, EstadoLinha.Pago, new DateOnly(2026, 10, 1)),
                new("Eletricidade e gás", 12, 74.35m, EstadoLinha.Pago, new DateOnly(2026, 10, 3)),
                new("Internet e telemóvel", 15, 39.99m, EstadoLinha.PorPagar, null),
                new("Ginásio", 28, 35, EstadoLinha.PorPagar, null),
                new("Seguro do carro", null, 42.10m, EstadoLinha.PorPagar, null),
            ],
            extras,
            [
                new("o1", "supermercado", "2026-10", 300, 254.2m, 45.8m, 84.7m, EstadoOrcamento.Perto),
                new("o2", "restauracao", "2026-10", 120, 140, -20, 116.7m, EstadoOrcamento.Ultrapassado),
                new("o3", "lazer", "2026-10", 80, 22.5m, 57.5m, 28.1m, EstadoOrcamento.Ok),
            ],
            [
                new("b1", "Viagem ao Japão", 3500, "2027-06", "2026-01", null, null, 1450, 41.4m, 2050, 9, 227.78m, EstadoObjetivo.NoBomCaminho),
                new("b2", "Fundo de emergência", 6000, "2026-12", "2025-06", null, null, 6000, 100, 0, 3, 0, EstadoObjetivo.Atingido),
            ],
            [
                new("p1", "Férias", TipoContribuicao.Valor, "100", 1450, 0),
                new("p2", "PPR", TipoContribuicao.Percentagem, "5", 3820.75m, 1),
            ],
            [new("d1", "Crédito do carro", 9000, "2025-01", "f9", 4320, 4680, 24, 180)]);
    }
}
