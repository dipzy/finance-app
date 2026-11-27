using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Financas.Services.Tests.Postgres;

// Uma seleção dos cenários de SQLite (DadosTests, ConcorrenciaTests, MigracaoTests, FolhaMesTests),
// os que mais dependem da base de dados, a correr em PostgreSQL com as migrações verdadeiras.
// Os números são os mesmos dos testes originais: se um passar em SQLite e falhar aqui, a diferença
// está no PostgreSQL (tipos, índices, transações), não nas regras.

[Collection(ColecaoPostgres.Nome)]
[Trait(ColecaoPostgres.Trait, ColecaoPostgres.Nome)]
public class DinheiroPostgresTests(PostgresFixture postgres) : TestesServicosPostgres(postgres)
{
    [FactPostgres]
    public async Task Extra_sai_da_conta_editar_acerta_pela_diferenca_mudar_a_data_muda_o_mes_e_apagar_devolve()
    {
        await Adicionar(1000);
        var id = await AdicionarExtra("Jantar", 50, Dia(2026, 10, 5));
        Assert.Equal(950, await CalcularSaldoDisponivel());

        await Extras.AlterarAsync(Uid, id, new AlterarDespesaExtraPedido("Jantar fora", 42.5m, null));
        Assert.Equal(957.5m, await CalcularSaldoDisponivel());

        // DateOnly -> coluna "date" e de volta
        await Extras.AlterarAsync(Uid, id, new AlterarDespesaExtraPedido(null, null, Dia(2026, 9, 30)));
        Assert.Empty(await ExtrasDoMes("2026-10"));
        var setembro = Assert.Single(await ExtrasDoMes("2026-09"));
        Assert.Equal(("Jantar fora", 42.5m, "2026-09", (DateOnly?)Dia(2026, 9, 30)), (setembro.Titulo, setembro.Valor, setembro.Mes, setembro.Data));

        await Extras.RemoverAsync(Uid, id);
        Assert.Equal(1000, await CalcularSaldoDisponivel());
    }

    [FactPostgres]
    public async Task Os_valores_ficam_ao_centimo_em_numeric_12_2_sem_lixo_nas_somas()
    {
        await Adicionar(0.3m);
        await AdicionarExtra("a", 0.1m);
        await AdicionarExtra("b", 0.2m);
        Assert.Equal(0, await CalcularSaldoDisponivel());

        // Perto do máximo de numeric(12,2): 9 999 999 999,99
        await Adicionar(1_234_567_890.12m);
        Assert.Equal(1_234_567_890.12m, await GetSaldo());
    }

    [FactPostgres]
    public async Task O_salario_entra_uma_vez_por_mes_com_o_PPR_e_a_Poupanca()
    {
        await GuardarSalario("1500", 25);
        await GuardarPprPoupanca(TipoContribuicao.Percentagem, "10", TipoContribuicao.Valor, "200");

        HojeE(2026, 10, 25);
        Assert.Equal(1150, await CalcularSaldoDisponivel()); // 1500 - 150 - 200
        await CalcularSaldoPrevisto();
        Assert.Null(await Salario.ProcessarRecebimentoAsync(Uid));
        Assert.Equal(1150, await CalcularSaldoDisponivel());

        // O recebimento fica guardado (JSON) com a hora em UTC (timestamp with time zone só aceita UTC)
        var ultimo = (await Salario.ObterAsync(Uid))!.UltimoRecebimento!;
        Assert.Equal((1500m, 150m, 200m, 1150m), (ultimo.Salario, ultimo.Ppr, ultimo.Poupanca, ultimo.Liquido));

        HojeE(2026, 11, 25);
        Assert.Equal(2300, await CalcularSaldoDisponivel());
    }

    [FactPostgres]
    public async Task Debitar_e_anular_uma_despesa_mensal_usa_sempre_o_mesmo_pagamento_do_mes()
    {
        await Adicionar(1000);
        var renda = await AdicionarFixa("Renda", 300, diaDebito: 1);

        Assert.Equal(700, await CalcularSaldoDisponivel()); // débito automático
        Assert.Equal(ResultadoDebito.JaDebitada, await Fixas.DebitarAsync(Uid, renda));

        Assert.True(await Fixas.AnularDebitoAsync(Uid, renda));
        Assert.Equal(1000, await CalcularSaldoDisponivel()); // e o débito automático não volta a fazê-lo
        Assert.Empty(await PagamentosDoMes("2026-10")); // desfazer apaga o registo

        // Pagar à mão outra vez cria de novo o registo do mês (o índice único não deixa haver dois)
        Assert.Equal(ResultadoDebito.Debitada, await Fixas.DebitarAsync(Uid, renda));
        Assert.Equal(700, await CalcularSaldoDisponivel());
        var pagamento = Assert.Single(await PagamentosDoMes("2026-10"));
        Assert.Equal((EstadoPagamento.Pago, 300m), (pagamento.Estado, pagamento.Valor));
    }

    [FactPostgres]
    public async Task A_base_de_dados_recusa_dois_pagamentos_da_mesma_despesa_no_mesmo_mes()
    {
        var id = await AdicionarFixa("Renda", 300);
        var db = A.Db();
        PagamentoFixa Pagamento(string idPagamento) => new()
        {
            UtilizadorId = Uid,
            Id = idPagamento,
            FixaId = id,
            Mes = "2026-10",
            Titulo = "Renda",
            Valor = 300,
            Data = Dia(2026, 10, 5),
            Estado = EstadoPagamento.Pago,
        };
        db.PagamentosFixas.Add(Pagamento(PagamentoFixa.IdDe("2026-10", id)));
        await db.SaveChangesAsync();

        // Mesmo com outro id, o índice único (utilizador, mês, despesa) não deixa: 23505 no PostgreSQL
        db.PagamentosFixas.Add(Pagamento("outro-id"));
        var erro = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.True(UnitOfWork.EConflito(erro)); // e a UnitOfWork reconhece-o como conflito (repete a operação)
    }
}

// A concorrência otimista (coluna Versao) com pedidos verdadeiramente ao mesmo tempo: em PostgreSQL
// o segundo UPDATE espera pelo COMMIT do primeiro e depois não encontra a versão que leu.
[Collection(ColecaoPostgres.Nome)]
[Trait(ColecaoPostgres.Trait, ColecaoPostgres.Nome)]
public class ConcorrenciaPostgresTests(PostgresFixture postgres) : TestesServicosPostgres(postgres)
{
    [FactPostgres]
    public async Task Duas_alteracoes_ao_mesmo_saldo_a_segunda_e_recusada_em_vez_de_apagar_a_primeira()
    {
        await Adicionar(100);

        var db1 = A.Db();
        var db2 = A.Db();
        var u1 = await db1.Utilizadores.SingleAsync(u => u.Id == Uid);
        var u2 = await db2.Utilizadores.SingleAsync(u => u.Id == Uid);

        u1.MovimentarSaldo(-30, A.Relogio.GetUtcNow());
        await db1.SaveChangesAsync();

        u2.MovimentarSaldo(-50, A.Relogio.GetUtcNow());
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => db2.SaveChangesAsync());

        Assert.Equal(70, await GetSaldo());
    }

    [FactPostgres]
    public async Task Dois_movimentos_ao_mesmo_tempo_no_mesmo_saldo_contam_os_dois()
    {
        await Adicionar(100);

        for (var i = 0; i < 10; i++)
        {
            await AoMesmoTempo(c => c.MovimentarAsync(Uid, 10), c => c.MovimentarAsync(Uid, -3));
        }

        Assert.Equal(170, await GetSaldo()); // 100 + 10 × (10 − 3): nenhum movimento se perdeu
    }

    [FactPostgres]
    public async Task Um_utilizador_novo_criado_por_dois_pedidos_ao_mesmo_tempo_fica_com_os_dois_movimentos()
    {
        // Os dois tentam o INSERT do utilizador: o segundo falha com chave repetida (23505), a
        // transação (já abortada no PostgreSQL) é desfeita e a operação repete-se com o utilizador já criado
        await AoMesmoTempo(c => c.MovimentarAsync(Uid, 10), c => c.MovimentarAsync(Uid, 20));
        Assert.Equal(30, await GetSaldo());
    }

    [FactPostgres]
    public async Task No_dia_do_salario_com_a_app_aberta_em_dois_dispositivos_o_salario_entra_uma_vez()
    {
        await GuardarSalario("1500", 25);
        await GuardarPprPoupanca(TipoContribuicao.Percentagem, "10", TipoContribuicao.Valor, "200");
        HojeE(2026, 10, 24);
        await CalcularSaldoDisponivel(); // o mês já está aberto: no dia 25 só falta o salário

        HojeE(2026, 10, 25);
        await AoMesmoTempo(c => c.CalcularSaldoDisponivelAsync(Uid), c => c.CalcularSaldoDisponivelAsync(Uid));

        Assert.Equal(1150, await GetSaldo());
        Assert.Null(await Salario.ProcessarRecebimentoAsync(Uid));
    }

    // Dois "pedidos HTTP" (cada um com o seu scope e DbContext) lançados em paralelo. Os serviços
    // são obtidos antes, porque o Ambiente não é thread-safe; o Task.Run garante que correm mesmo
    // em simultâneo e não um depois do outro.
    private async Task AoMesmoTempo(Func<IContaService, Task> primeiro, Func<IContaService, Task> segundo)
    {
        var conta1 = Conta;
        var conta2 = Conta;
        await Task.WhenAll(Task.Run(() => primeiro(conta1)), Task.Run(() => segundo(conta2)));
    }
}

[Collection(ColecaoPostgres.Nome)]
[Trait(ColecaoPostgres.Trait, ColecaoPostgres.Nome)]
public class ImportacoesPostgresTests(PostgresFixture postgres) : TestesServicosPostgres(postgres)
{
    [FactPostgres]
    public async Task A_copia_do_Firestore_grava_tudo_numa_transacao_e_so_e_feita_uma_vez()
    {
        var resumo = await Migracao.ImportarFirestoreAsync(Uid, MigracaoTests.Dump());
        Assert.Equal((2, 1, 1, 0, 1, 1), (resumo.DespesasFixas, resumo.PagamentosFixas, resumo.DespesasExtras, resumo.Poupancas, resumo.Dividas, resumo.Meses));
        Assert.Empty(resumo.Ignorados);
        Assert.Equal(new EstadoMigracaoDto(true, true), await Migracao.ObterEstadoAsync(Uid));

        Assert.Equal(700, await CalcularSaldoDisponivel());
        Assert.Equal(["luz", "renda"], (await ListarFixas()).Select(f => f.Id).Order());
        Assert.Equal(
            [("Renda", EstadoPagamento.Pago)],
            (await PagamentosDoMes("2026-10")).Select(p => (p.Titulo, p.Estado)));

        var cinema = Assert.Single(await ExtrasDoMes("2026-09"));
        Assert.Equal(("cinema", (DateOnly?)Dia(2026, 9, 28), false), (cinema.Id, cinema.Data, cinema.DescontadaDaConta));
        Assert.Equal([("PPR", "50"), ("Poupança", "600")], (await Poupancas.ListarAsync(Uid)).Select(p => (p.Nome, p.Valor)));
        Assert.Equal(700, (await Meses.ObterAsync(Uid, "2026-09"))?.SaldoFinal);

        // As datas do Firestore (texto ISO) ficam em timestamp with time zone e voltam iguais
        var salario = await Salario.ObterAsync(Uid);
        Assert.Equal(new DateTimeOffset(2026, 9, 25, 10, 0, 0, TimeSpan.Zero), salario!.LastReceived);
        Assert.Equal(6400, Assert.Single(await Dividas.ListarComEstadoAsync(Uid)).EmFalta);

        // Segunda vez: 409 e nada muda
        await Assert.ThrowsAsync<ConflitoException>(() => Migracao.ImportarFirestoreAsync(Uid, MigracaoTests.Dump()));
        Assert.Equal(2, (await ListarFixas()).Count);
    }

    [FactPostgres]
    public async Task Importar_a_folha_do_mes_cria_as_despesas_e_o_historico_sem_duplicar_ao_repetir()
    {
        await Adicionar(1000);
        var resumo = await Folha.ImportarAsync(Uid, "2026-04", Folhas.Abril, null);

        Assert.Equal(["Carro", "Dentista", "Ginásio"], resumo.DespesasCriadas);
        Assert.Equal((3, 2), (resumo.PagamentosRegistados, resumo.ExtrasRegistadas));
        Assert.Equal(1000, await CalcularSaldoDisponivel());
        Assert.Equal(
            [("Carro", 162m), ("Dentista", 156.28m), ("Ginásio", 20m)],
            (await PagamentosDoMes("2026-04")).Select(p => (p.Titulo, p.Valor)).Order());
        Assert.Equal(37.19m, await TotalExtras("2026-04"));

        // Outra vez o mesmo mês: nada novo
        var segunda = await Folha.ImportarAsync(Uid, "2026-04", Folhas.Abril, null);
        Assert.Empty(segunda.DespesasCriadas);
        Assert.Equal((0, 0), (segunda.PagamentosRegistados, segunda.ExtrasRegistadas));
        Assert.Equal(3, (await ListarFixas()).Count);
    }

    [FactPostgres]
    public async Task O_mes_seguinte_reutiliza_as_despesas_com_o_mesmo_nome_sem_ligar_a_acentos_nem_maiusculas()
    {
        // O PostgreSQL compara texto com maiúsculas e acentos ("Ginásio" <> "ginasio"): a
        // comparação tem de ser feita pelas regras (Formatos.NormalizarTitulo), não pelo SQL
        await Folha.ImportarAsync(Uid, "2026-04", Folhas.Abril, null);
        var maio = Folhas.Abril with { Mes = "2026-05", Despesas = [Folhas.L("ginasio ", 20), Folhas.L("Telemóvel", 10)], DespesasMes = [] };
        await Folha.ImportarAsync(Uid, "2026-05", maio, null);

        Assert.Equal(["Carro", "Dentista", "Ginásio", "Telemóvel"], (await ListarFixas()).Select(f => f.Titulo));
        Assert.Equal(2, (await PagamentosDoMes("2026-05")).Count);
    }

    [FactPostgres]
    public async Task O_historico_da_folha_guardado_em_JSON_volta_igual()
    {
        await Folha.ImportarAsync(Uid, "2026-04", Folhas.Abril with
        {
            SaldoPoupanca = [Folhas.L("Certificados", 3000)],
            TotalAPagar = [Folhas.L("Carro", 6990)],
        }, null);

        var folha = await Folha.ObterDadosAsync(Uid, "2026-04");
        Assert.Equal([Folhas.L("Certificados", 3000)], folha.SaldoPoupanca);
        Assert.Equal([Folhas.L("Carro", 6990)], folha.TotalAPagar);
    }
}
