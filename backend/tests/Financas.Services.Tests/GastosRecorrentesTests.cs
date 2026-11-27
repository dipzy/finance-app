using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Microsoft.EntityFrameworkCore;

namespace Financas.Services.Tests;

// Gastos recorrentes: as regras dos dias e a geração preguiçosa (em GET /api/conta/saldo)
public class GastosRecorrentesTests : TestesServicos
{
    private IGastosRecorrentesService Recorrentes => A.Servico<IGastosRecorrentesService>();

    private Task<string> NovoRecorrente(
        string titulo,
        decimal valor,
        Frequencia frequencia,
        DateOnly? inicio = null,
        int? diaSemana = null,
        int? diaMes = null,
        MeioPagamento? meio = null,
        DateOnly? fim = null) =>
        Recorrentes.AdicionarAsync(Uid, new NovoGastoRecorrentePedido(titulo, valor, frequencia, diaSemana, diaMes, inicio, fim, null, meio));

    private async Task<List<DespesaExtraDto>> Gerados(string gastoId) =>
        [.. (await Extras.ListarAsync(Uid, null)).Where(e => e.GastoRecorrenteId == gastoId).OrderBy(e => e.Data)];

    // ---- Regras puras ----

    [Fact]
    public void Semanal_mensal_e_diaria_nos_dias_certos()
    {
        // 5/10/2026 é segunda-feira
        Assert.Equal(1, Recorrencia.DiaSemanaIso(Dia(2026, 10, 5)));
        Assert.Equal(7, Recorrencia.DiaSemanaIso(Dia(2026, 10, 11)));

        Assert.Equal(
            [Dia(2026, 10, 9), Dia(2026, 10, 16), Dia(2026, 10, 23)],
            Recorrencia.Dias(Frequencia.Semanal, 5, null, Dia(2026, 10, 5), Dia(2026, 10, 25)));
        Assert.Equal(3, Recorrencia.Dias(Frequencia.Diaria, null, null, Dia(2026, 10, 30), Dia(2026, 11, 1)).Count);

        // Dia 31: nos meses mais curtos conta o último dia
        Assert.Equal(
            [Dia(2027, 1, 31), Dia(2027, 2, 28), Dia(2027, 3, 31), Dia(2027, 4, 30)],
            Recorrencia.Dias(Frequencia.Mensal, null, 31, Dia(2027, 1, 1), Dia(2027, 4, 30)));
        Assert.Empty(Recorrencia.Dias(Frequencia.Diaria, null, null, Dia(2026, 10, 5), Dia(2026, 10, 4)));
    }

    [Fact]
    public void Dias_em_falta_respeitam_a_ultima_geracao_o_fim_a_pausa_e_o_limite()
    {
        var gasto = new GastoRecorrente
        {
            UtilizadorId = Uid,
            Id = "g",
            Titulo = "Café",
            Frequencia = Frequencia.Diaria,
            Inicio = Dia(2026, 1, 1),
            UltimaGeracao = Dia(2026, 10, 2),
        };
        Assert.Equal([Dia(2026, 10, 3), Dia(2026, 10, 4), Dia(2026, 10, 5)], Recorrencia.DiasEmFalta(gasto, Dia(2026, 10, 5)));

        gasto.Fim = Dia(2026, 10, 3);
        Assert.Equal([Dia(2026, 10, 3)], Recorrencia.DiasEmFalta(gasto, Dia(2026, 10, 5)));

        gasto.Ativo = false;
        Assert.Empty(Recorrencia.DiasEmFalta(gasto, Dia(2026, 10, 5)));

        // Sem gerar desde janeiro: só os 62 mais recentes
        gasto.Ativo = true;
        gasto.Fim = null;
        gasto.UltimaGeracao = null;
        var dias = Recorrencia.DiasEmFalta(gasto, Dia(2026, 10, 5));
        Assert.Equal(Recorrencia.MaximoDeUmaVez, dias.Count);
        Assert.Equal(Dia(2026, 10, 5), dias[^1]);
    }

    // ---- Geração ----

    [Fact]
    public async Task Criar_gera_logo_ate_hoje_e_pedir_o_saldo_outra_vez_nao_gera_de_novo()
    {
        await Adicionar(100);
        var id = await NovoRecorrente("Café", 1.2m, Frequencia.Diaria, inicio: Dia(2026, 10, 3));

        Assert.Equal(3, (await Gerados(id)).Count); // 3, 4 e 5 de outubro
        Assert.Equal(96.4m, await CalcularSaldoDisponivel());
        Assert.Equal(96.4m, await CalcularSaldoDisponivel()); // idempotente
        Assert.Equal(3, (await Gerados(id)).Count);

        // Dois dias depois: só os dois dias novos
        HojeE(2026, 10, 7);
        Assert.Equal(94m, await CalcularSaldoDisponivel());
        var gerados = await Gerados(id);
        Assert.Equal(5, gerados.Count);
        Assert.Equal(Dia(2026, 10, 7), gerados[^1].Data);
        Assert.All(gerados, e => Assert.True(e.DescontadaDaConta));
        Assert.Equal(Dia(2026, 10, 7), (await Recorrentes.ObterAsync(Uid, id)).UltimaGeracao);
    }

    [Fact]
    public async Task Semanal_comeca_no_dia_da_semana_do_inicio_e_espera_pela_semana_seguinte()
    {
        var id = await NovoRecorrente("Combustível", 50, Frequencia.Semanal);
        Assert.Equal(1, (await Recorrentes.ObterAsync(Uid, id)).DiaSemana); // segunda, como hoje
        Assert.Single(await Gerados(id));

        HojeE(2026, 10, 11);
        await CalcularSaldoDisponivel();
        Assert.Single(await Gerados(id));

        HojeE(2026, 10, 12);
        await CalcularSaldoDisponivel();
        Assert.Equal(2, (await Gerados(id)).Count);
        Assert.Equal(-100, await GetSaldo());
    }

    [Fact]
    public async Task Com_a_app_fechada_muito_tempo_so_gera_as_ultimas_62()
    {
        var id = await NovoRecorrente("Café", 1, Frequencia.Diaria, inicio: Dia(2026, 1, 1));
        Assert.Equal(Recorrencia.MaximoDeUmaVez, (await Gerados(id)).Count);
        Assert.Equal(-62, await GetSaldo());
    }

    [Fact]
    public async Task Pago_com_o_cartao_quando_chega_e_com_a_conta_quando_o_cartao_nao_chega()
    {
        await Conta.DefinirCartaoAlimentacaoAsync(Uid, 10);
        await Adicionar(100);
        var id = await NovoRecorrente("Almoço", 6, Frequencia.Diaria, meio: MeioPagamento.CartaoAlimentacao);
        HojeE(2026, 10, 6);
        await CalcularSaldoDisponivel();

        var gerados = await Gerados(id);
        Assert.Equal(MeioPagamento.CartaoAlimentacao, gerados[0].MeioPagamento);
        Assert.Equal(MeioPagamento.Conta, gerados[1].MeioPagamento);
        Assert.Equal(4, (await Conta.ObterCartaoAlimentacaoAsync(Uid)).Saldo);
        Assert.Equal(94, await GetSaldo());
    }

    [Fact]
    public async Task Em_pausa_nao_gera_e_ao_retomar_nao_recupera_os_dias_da_pausa()
    {
        var id = await NovoRecorrente("Café", 1, Frequencia.Diaria);
        await Recorrentes.AlterarAsync(Uid, id, new AlterarGastoRecorrentePedido(Ativo: false));
        HojeE(2026, 10, 9);
        await CalcularSaldoDisponivel();
        Assert.Single(await Gerados(id));

        await Recorrentes.AlterarAsync(Uid, id, new AlterarGastoRecorrentePedido(Ativo: true, Valor: 2));
        await CalcularSaldoDisponivel();
        var gerados = await Gerados(id);
        Assert.Equal([Dia(2026, 10, 5), Dia(2026, 10, 9)], gerados.Select(e => e.Data!.Value));
        Assert.Equal(2, gerados[1].Valor);
        Assert.Equal(-3, await GetSaldo());
    }

    [Fact]
    public async Task Apagar_a_regra_deixa_as_despesas_ja_geradas()
    {
        var id = await NovoRecorrente("Café", 1, Frequencia.Diaria);
        await Recorrentes.RemoverAsync(Uid, id);
        HojeE(2026, 10, 8);
        await CalcularSaldoDisponivel();

        Assert.Empty(await Recorrentes.ListarAsync(Uid));
        Assert.Single(await Gerados(id));
        await Assert.ThrowsAsync<NaoEncontradoException>(() => Recorrentes.ObterAsync(Uid, id));
    }

    [Fact]
    public async Task A_base_de_dados_recusa_a_mesma_repeticao_duas_vezes()
    {
        var id = await NovoRecorrente("Café", 1, Frequencia.Diaria);
        var db = A.Db();
        var copia = DespesasExtrasService.Nova(Uid, "Café", 1, Dia(2026, 10, 5), descontada: true, A.Relogio.GetUtcNow());
        copia.GastoRecorrenteId = id;
        copia.DataOcorrencia = Dia(2026, 10, 5);
        db.DespesasExtras.Add(copia);
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Fim_antes_do_inicio_e_recusado_e_outro_utilizador_nao_ve_nem_mexe()
    {
        await Assert.ThrowsAsync<PedidoInvalidoException>(() =>
            NovoRecorrente("Café", 1, Frequencia.Diaria, inicio: Dia(2026, 10, 5), fim: Dia(2026, 10, 1)));

        var id = await NovoRecorrente("Café", 1, Frequencia.Diaria);
        Assert.Empty(await Recorrentes.ListarAsync("outro"));
        await Assert.ThrowsAsync<NaoEncontradoException>(() => Recorrentes.ObterAsync("outro", id));
        await Assert.ThrowsAsync<NaoEncontradoException>(() =>
            Recorrentes.AlterarAsync("outro", id, new AlterarGastoRecorrentePedido(Ativo: false)));
        await Recorrentes.RemoverAsync("outro", id);
        Assert.True((await Recorrentes.ObterAsync(Uid, id)).Ativo);
    }
}
