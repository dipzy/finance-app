using System.Text.Json;
using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Financas.Services.Tests;

// Pesquisa das despesas extras, Idempotency-Key e registo de alterações (InterceptorAuditoria)
public class PesquisaEAuditoriaTests : TestesServicos
{
    private IAlteracoesService Alteracoes => A.Servico<IAlteracoesService>();

    private Task<PesquisaDespesasDto> Pesquisar(FiltroPesquisaDespesas filtro) => Extras.PesquisarAsync(Uid, filtro);

    private Task<string> Extra(string titulo, decimal valor, DateOnly data, string? categoria = null, MeioPagamento? meio = null) =>
        Extras.AdicionarHistoricaAsync(Uid, new DespesaHistoricaPedido(titulo, valor, data, categoria, meio));

    private async Task<List<RegistoAlteracaoDto>> Registos(string? entidade = null) =>
        [.. (await Alteracoes.ListarAsync(Uid, entidade, null, 1, 100)).Itens];

    // ---- Pesquisa ----

    [Fact]
    public async Task Pesquisa_sem_acentos_nem_maiusculas_com_filtros_paginas_total_e_soma()
    {
        await Extra("Café da manhã", 1.5m, Dia(2026, 8, 1), "restauracao");
        await Extra("CAFE Delta", 2m, Dia(2026, 9, 10), "restauracao", MeioPagamento.CartaoAlimentacao);
        await Extra("Cafetaria", 10m, Dia(2026, 10, 2), "restauracao");
        await Extra("Continente", 50m, Dia(2026, 10, 3), "supermercado");
        var semCategoria = A.Db();
        var antiga = DespesasExtrasService.Nova(Uid, "Coisa antiga", 3, Dia(2025, 1, 1), descontada: false, A.Relogio.GetUtcNow());
        semCategoria.DespesasExtras.Add(antiga);
        await semCategoria.SaveChangesAsync();

        var cafe = await Pesquisar(new FiltroPesquisaDespesas(Texto: "  café "));
        Assert.Equal(3, cafe.Total);
        Assert.Equal(13.5m, cafe.Soma);
        Assert.Equal(["Cafetaria", "CAFE Delta", "Café da manhã"], cafe.Itens.Select(e => e.Titulo)); // mais recente primeiro

        Assert.Equal(1, (await Pesquisar(new FiltroPesquisaDespesas(Texto: "cafe", MeioPagamento: MeioPagamento.CartaoAlimentacao))).Total);
        Assert.Equal(3, (await Pesquisar(new FiltroPesquisaDespesas(ValorMin: 2, ValorMax: 10))).Total);
        Assert.Equal(2, (await Pesquisar(new FiltroPesquisaDespesas(De: Dia(2026, 10, 1), Ate: Dia(2026, 10, 31)))).Total);
        Assert.Equal("Coisa antiga", (await Pesquisar(new FiltroPesquisaDespesas(Categoria: "outros"))).Itens.Single().Titulo);

        var pagina2 = await Pesquisar(new FiltroPesquisaDespesas(Pagina: 2, Tamanho: 2));
        Assert.Equal(5, pagina2.Total);
        Assert.Equal(["CAFE Delta", "Café da manhã"], pagina2.Itens.Select(e => e.Titulo));
        Assert.Equal(66.5m, pagina2.Soma);

        Assert.Equal(0, (await Extras.PesquisarAsync("outro", new FiltroPesquisaDespesas())).Total);
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Pesquisar(new FiltroPesquisaDespesas(ValorMin: 5, ValorMax: 1)));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Pesquisar(new FiltroPesquisaDespesas(De: Dia(2026, 10, 2), Ate: Dia(2026, 10, 1))));
    }

    // ---- Idempotency-Key ----

    [Fact]
    public async Task A_mesma_chave_nao_cria_nem_cobra_outra_vez_e_cada_utilizador_tem_as_suas()
    {
        await Adicionar(100);
        var pedido = new NovaDespesaExtraPedido("Jantar", 20, null);
        var primeira = await Extras.AdicionarAsync(Uid, pedido, "chave-1");
        var repetida = await Extras.AdicionarAsync(Uid, pedido, "chave-1");

        Assert.True(primeira.Criado);
        Assert.False(repetida.Criado);
        Assert.Equal(primeira.Id, repetida.Id);
        Assert.Equal(80, await GetSaldo());
        Assert.Single(await ExtrasDoMes("2026-10"));

        Assert.True((await Extras.AdicionarAsync("outro", pedido, "chave-1")).Criado);
        Assert.True((await Extras.AdicionarAsync(Uid, pedido, null)).Criado);
        Assert.True((await Extras.AdicionarAsync(Uid, pedido, null)).Criado);
        Assert.Equal(40, await GetSaldo());
    }

    [Fact]
    public async Task A_base_de_dados_recusa_a_mesma_chave_duas_vezes_e_isso_conta_como_conflito_a_repetir()
    {
        // Dois pedidos com a mesma chave ao mesmo tempo: o segundo choca no índice único, a UnitOfWork
        // trata-o como conflito e repete a operação, que já encontra a despesa do primeiro
        await Adicionar(100);
        var db = A.Db();
        foreach (var titulo in new[] { "Jantar", "Jantar outra vez" })
        {
            var despesa = DespesasExtrasService.Nova(Uid, titulo, 20, Dia(2026, 10, 5), descontada: true, A.Relogio.GetUtcNow());
            despesa.ChaveIdempotencia = "mesma";
            db.DespesasExtras.Add(despesa);
        }

        var erro = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.True(UnitOfWork.EConflito(erro));
    }

    // ---- Registo de alterações ----

    [Fact]
    public async Task Criar_alterar_e_apagar_ficam_no_registo_com_os_campos_que_mudaram()
    {
        var id = await AdicionarExtra("Jantar", 20);
        await Extras.AlterarAsync(Uid, id, new AlterarDespesaExtraPedido(null, 25, null));
        await Extras.RemoverAsync(Uid, id);

        var registos = await Registos(nameof(DespesaExtra));
        Assert.Equal([AcaoAlteracao.Apagada, AcaoAlteracao.Alterada, AcaoAlteracao.Criada], registos.Select(r => r.Acao));
        Assert.All(registos, r =>
        {
            Assert.Equal(id, r.EntidadeId);
            Assert.Equal("Jantar", r.Descricao);
            Assert.Equal("sistema", r.Origem); // fora de um pedido HTTP
        });

        var alterada = registos[1].Alteracoes!.Value;
        Assert.Equal(20, alterada.GetProperty("Valor").GetProperty("de").GetDecimal());
        Assert.Equal(25, alterada.GetProperty("Valor").GetProperty("para").GetDecimal());
        Assert.False(alterada.TryGetProperty("Titulo", out _)); // só o que mudou
        Assert.Equal("Jantar", registos[2].Alteracoes!.Value.GetProperty("Titulo").GetProperty("para").GetString());
        Assert.Equal(25, registos[0].Alteracoes!.Value.GetProperty("Valor").GetProperty("de").GetDecimal());

        // Outro utilizador não vê nada
        Assert.Equal(0, (await Alteracoes.ListarAsync("outro", null, null, 1, 10)).Total);
    }

    [Fact]
    public async Task Uma_operacao_repetida_por_conflito_fica_registada_uma_vez_so()
    {
        await Adicionar(100);
        var scope = A.NovoScope();
        var unitOfWork = scope.GetRequiredService<IUnitOfWork>();
        var utilizadores = scope.GetRequiredService<IUtilizadoresRepository>();
        var extras = scope.GetRequiredService<IDespesasExtrasRepository>();
        var db = scope.GetRequiredService<FinancasDbContext>();

        var tentativas = 0;
        await unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            tentativas++;
            var utilizador = await utilizadores.ObterOuCriarAsync(Uid, A.Relogio.GetUtcNow(), ct);
            if (tentativas == 1)
            {
                db.Entry(utilizador).Property(u => u.Versao).OriginalValue = utilizador.Versao + 100;
            }

            utilizador.MovimentarSaldo(-10, A.Relogio.GetUtcNow());
            extras.Adicionar(DespesasExtrasService.Nova(Uid, "Jantar", 10, Dia(2026, 10, 5), descontada: true, A.Relogio.GetUtcNow()));
        });

        Assert.Equal(2, tentativas);
        Assert.Single(await Registos());
    }

    [Fact]
    public async Task Gerar_os_gastos_recorrentes_fica_com_a_origem_sistema_e_so_mudancas_tecnicas_nao_contam()
    {
        var recorrentes = A.Servico<IGastosRecorrentesService>();
        var id = await recorrentes.AdicionarAsync(Uid, new NovoGastoRecorrentePedido("Café", 1, Frequencia.Diaria));
        HojeE(2026, 10, 6);
        await CalcularSaldoDisponivel();

        var registos = await Registos();
        Assert.Equal(1, registos.Count(r => r.Entidade == nameof(GastoRecorrente))); // a UltimaGeracao não conta
        Assert.Equal(2, registos.Count(r => r.Entidade == nameof(DespesaExtra)));
        Assert.Equal(nameof(DespesaExtra), registos[0].Entidade);
        Assert.Equal(id, registos.Single(r => r.Entidade == nameof(GastoRecorrente)).EntidadeId);

        // Filtro pelo dia (em Portugal)
        Assert.Single((await Alteracoes.ListarAsync(Uid, null, Dia(2026, 10, 6), 1, 10)).Itens);
    }

    [Fact]
    public async Task Linhas_com_mais_de_um_ano_sao_apagadas_ao_abrir_o_historico()
    {
        await AdicionarExtra("Jantar", 20);
        var db = A.Db();
        db.RegistosAlteracao.Add(new RegistoAlteracao
        {
            Id = "antigo",
            UtilizadorId = Uid,
            Entidade = nameof(DespesaExtra),
            EntidadeId = "x",
            Acao = AcaoAlteracao.Criada,
            Quando = A.Relogio.GetUtcNow().UtcDateTime.AddYears(-1).AddDays(-1),
        });
        await db.SaveChangesAsync();

        var pagina = await Alteracoes.ListarAsync(Uid, null, null, 1, 10);
        Assert.Equal(1, pagina.Total);
        Assert.Equal(0, await A.Db().RegistosAlteracao.CountAsync(r => r.Id == "antigo"));
    }
}
