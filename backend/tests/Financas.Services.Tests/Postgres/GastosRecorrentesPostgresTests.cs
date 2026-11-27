using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;

namespace Financas.Services.Tests.Postgres;

// Gastos recorrentes e Idempotency-Key com dois pedidos ao mesmo tempo, em PostgreSQL a sério
// (em SQLite em memória as transações não correm mesmo em paralelo)
[Collection(ColecaoPostgres.Nome)]
[Trait(ColecaoPostgres.Trait, ColecaoPostgres.Nome)]
public class GastosRecorrentesPostgresTests(PostgresFixture postgres) : TestesServicosPostgres(postgres)
{
    [FactPostgres]
    public async Task Dois_dispositivos_a_pedir_o_saldo_ao_mesmo_tempo_geram_cada_repeticao_uma_vez()
    {
        await Adicionar(100);
        var id = await A.Servico<IGastosRecorrentesService>().AdicionarAsync(Uid, new NovoGastoRecorrentePedido("Café", 1, Frequencia.Diaria));
        HojeE(2026, 10, 10);

        await Task.WhenAll(A.Servico<IContaService>().CalcularSaldoDisponivelAsync(Uid), A.Servico<IContaService>().CalcularSaldoDisponivelAsync(Uid));

        var gerados = (await Extras.ListarAsync(Uid, null)).Where(e => e.GastoRecorrenteId == id).ToList();
        Assert.Equal(6, gerados.Count); // de 5 a 10 de outubro
        Assert.Equal(94, await GetSaldo());
    }

    [FactPostgres]
    public async Task Dois_pedidos_com_a_mesma_Idempotency_Key_ao_mesmo_tempo_criam_uma_so_despesa()
    {
        await Adicionar(100);
        var pedido = new NovaDespesaExtraPedido("Jantar", 20, null);
        var resultados = await Task.WhenAll(
            A.Servico<IDespesasExtrasService>().AdicionarAsync(Uid, pedido, "mesma-chave"),
            A.Servico<IDespesasExtrasService>().AdicionarAsync(Uid, pedido, "mesma-chave"));

        Assert.Single(resultados.Select(r => r.Id).Distinct());
        Assert.Single(resultados, r => r.Criado);
        Assert.Equal(80, await GetSaldo());
    }
}
