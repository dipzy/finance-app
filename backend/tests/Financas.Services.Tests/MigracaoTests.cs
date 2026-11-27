using Financas.DAL.Entidades;
using Financas.Services.Dtos;

namespace Financas.Services.Tests;

// A cópia única dos dados do Firestore (POST /api/migracao) e dos dados locais muito antigos
public class MigracaoTests : TestesServicos
{
    private static DespesaFirestoreDto Despesa(
        string id,
        string titulo,
        decimal valor,
        int? diaDebito = null,
        string? data = null,
        string? mes = null,
        bool? descontada = null,
        bool? debitado = null,
        string? mesDebitado = null,
        string? anuladoMes = null,
        string? criadoEm = "2026-09-01T10:00:00.000Z") =>
        new(id, titulo, valor, data, mes, descontada, diaDebito, null, null, null, null, debitado, mesDebitado, anuladoMes, criadoEm);

    // Um utilizador da versão Firestore ainda com dados de versões anteriores por converter
    // (internal: os testes em PostgreSQL, na pasta Postgres/, usam o mesmo)
    internal static DadosFirestoreDto Dump() => new(
        new UtilizadorFirestoreDto(
            "diogo@exemplo.pt",
            "Ana",
            "2026-01-10T09:00:00.000Z",
            null,
            new SalarioFirestoreDto("1500", 25, "2026-09-25T10:00:00.000Z", null, "150"),
            new ContaCorrenteFirestoreDto(700, "2026-10-01T08:00:00.000Z"),
            new ConfigPprPoupancaFirestoreDto("valor", "50", "valor", "600"),
            new MigracoesFirestoreDto(PagamentosPorMes: false, PoupancasLista: false)),
        DespesasFixas:
        [
            Despesa("renda", "Renda", 300, diaDebito: 1, debitado: true, mesDebitado: "2026-10"),
            Despesa("luz", "Luz", 40, diaDebito: 1, anuladoMes: "2026-10", criadoEm: "2026-09-02T10:00:00.000Z"),
        ],
        PagamentosFixas:
        [
            new PagamentoFirestoreDto("2026-09_renda", "renda", "2026-09", "Renda", 300, "2026-09-01", "pago"),
            new PagamentoFirestoreDto("2026-09_luz", "luz", "2026-09", "Luz", 40, "2026-09-01", "anulado"),
        ],
        DespesasExtras: [Despesa("cinema", "Cinema", 10, data: "28/09/2026", criadoEm: "2026-09-28T20:00:00.000Z")],
        Poupancas: [],
        Dividas: [new DividaFirestoreDto("carro", "Carro", 7000, "2026-09", "renda")],
        Meses: [new ResumoMesFirestoreDto("2026-09", 100, 700, "2026-09-01T08:00:00.000Z", null, null)]);

    [Fact]
    public async Task Um_utilizador_novo_nao_tem_dados_nem_foi_importado() =>
        Assert.Equal(new EstadoMigracaoDto(false, false), await Migracao.ObterEstadoAsync(Uid));

    [Fact]
    public async Task Copia_tudo_mantendo_os_ids_e_converte_os_dados_antigos_sem_pagar_nada_outra_vez()
    {
        var resumo = await Migracao.ImportarFirestoreAsync(Uid, Dump());
        Assert.Equal((2, 1, 1, 0, 1, 1), (resumo.DespesasFixas, resumo.PagamentosFixas, resumo.DespesasExtras, resumo.Poupancas, resumo.Dividas, resumo.Meses));
        Assert.Empty(resumo.Ignorados);
        Assert.Equal(new EstadoMigracaoDto(true, true), await Migracao.ObterEstadoAsync(Uid));

        // A renda (já paga, na própria despesa) e a luz (pagamento desfeito) não são debitadas outra vez.
        // Pagamentos anulados não ficam registados
        Assert.Equal(700, await CalcularSaldoDisponivel());
        Assert.Equal(["luz", "renda"], (await ListarFixas()).Select(f => f.Id).Order());
        Assert.Equal(
            [("Renda", EstadoPagamento.Pago)],
            (await PagamentosDoMes("2026-10")).Select(p => (p.Titulo, p.Estado)));
        Assert.Empty((await PagamentosDoMes("2026-09")).Where(p => p.FixaId == "luz"));

        // A data no formato antigo passa a ISO e a despesa fica no mês certo
        var cinema = Assert.Single(await ExtrasDoMes("2026-09"));
        Assert.Equal(("cinema", (DateOnly?)Dia(2026, 9, 28), false), (cinema.Id, cinema.Data, cinema.DescontadaDaConta));

        // A configuração antiga de PPR/Poupança passou a lista de poupanças
        Assert.Equal([("PPR", "50"), ("Poupança", "600")], (await Poupancas.ListarAsync(Uid)).Select(p => (p.Nome, p.Valor)));

        // O histórico e o salário vieram também
        Assert.Equal(700, (await Meses.ObterAsync(Uid, "2026-09"))?.SaldoFinal);
        var salario = await Salario.ObterAsync(Uid);
        Assert.Equal(("1500", 25, "150"), (salario!.Valor, salario.DiaRecebimento, salario.CartaoAlimentacao));
        Assert.Equal(new DateTimeOffset(2026, 9, 25, 10, 0, 0, TimeSpan.Zero), salario.LastReceived);

        // A dívida desconta as prestações desde setembro: 300 (setembro) + 300 (outubro, da versão anterior)
        var carro = Assert.Single(await Dividas.ListarComEstadoAsync(Uid));
        Assert.Equal(6400, carro.EmFalta);
    }

    [Fact]
    public async Task So_e_feita_uma_vez()
    {
        await Migracao.ImportarFirestoreAsync(Uid, Dump());
        await Assert.ThrowsAsync<ConflitoException>(() => Migracao.ImportarFirestoreAsync(Uid, Dump()));
        Assert.Equal(2, (await ListarFixas()).Count);
    }

    [Fact]
    public async Task Nao_copia_por_cima_de_dados_que_ja_estao_no_servidor()
    {
        await AdicionarExtra("Café", 1.2m);
        await Assert.ThrowsAsync<ConflitoException>(() => Migracao.ImportarFirestoreAsync(Uid, Dump()));
    }

    [Fact]
    public async Task Abrir_a_app_antes_da_copia_nao_a_impede_e_o_resumo_do_mes_criado_entretanto_e_substituido()
    {
        await CalcularSaldoDisponivel(); // cria o utilizador e o resumo de outubro (saldo inicial 0)
        Assert.False((await Migracao.ObterEstadoAsync(Uid)).TemDados);

        await Migracao.ImportarFirestoreAsync(Uid, Dump());
        Assert.Null(await Meses.ObterAsync(Uid, "2026-10"));
        await CalcularSaldoDisponivel();
        Assert.Equal(700, (await Meses.ObterAsync(Uid, "2026-10"))?.SaldoInicial);
    }

    [Fact]
    public async Task Documentos_invalidos_ficam_de_fora_com_o_motivo()
    {
        var dump = Dump() with
        {
            PagamentosFixas = [new PagamentoFirestoreDto("x", "renda", "outubro", "Renda", 300, null, "pago")],
            DespesasExtras = [Despesa("", "Sem id", 5)],
        };
        var resumo = await Migracao.ImportarFirestoreAsync(Uid, dump);
        Assert.Equal((0, 0), (resumo.PagamentosFixas, resumo.DespesasExtras));
        Assert.Equal(2, resumo.Ignorados.Count);
    }

    [Fact]
    public async Task Os_dados_locais_da_versao_muito_antiga_juntam_se_sem_mexer_na_conta()
    {
        var resumo = await Migracao.ImportarDadosLocaisAsync(Uid, new DadosLocaisDto(
            new FinanceiroFirestoreDto("1000", "10", "15", null),
            [new DespesaLocalDto("Renda", 300, null, "2026-09-01T10:00:00.000Z")],
            [new DespesaLocalDto("Café", 2, "02/10/2026", null)]));

        Assert.Equal((1, 1), (resumo.DespesasFixas, resumo.DespesasExtras));
        var renda = Assert.Single(await ListarFixas());
        Assert.Null(renda.Inicio); // conta em todos os meses, como na versão antiga
        var cafe = Assert.Single(await ExtrasDoMes("2026-10"));
        Assert.False(cafe.DescontadaDaConta);
        Assert.Equal(0, await GetSaldo());
        Assert.Equal("1000", (await Configuracoes.ObterFinanceiroAsync(Uid))?.Salario);
    }
}
