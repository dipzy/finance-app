using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Financas.Services.Tests;

// A proteção do saldo contra alterações ao mesmo tempo (dois dispositivos, dois pedidos):
// concorrência otimista com a coluna Versao + repetição da operação na UnitOfWork.
public class ConcorrenciaTests : TestesServicos
{
    [Fact]
    public async Task Duas_alteracoes_ao_mesmo_saldo_a_segunda_e_recusada_em_vez_de_apagar_a_primeira()
    {
        await Adicionar(100);

        // Dois "pedidos" leem o mesmo utilizador (Versao igual)
        var db1 = A.Db();
        var db2 = A.Db();
        var u1 = await db1.Utilizadores.SingleAsync(u => u.Id == Uid);
        var u2 = await db2.Utilizadores.SingleAsync(u => u.Id == Uid);

        u1.MovimentarSaldo(-30, A.Relogio.GetUtcNow());
        await db1.SaveChangesAsync();

        // O segundo ainda tem a versão antiga: UPDATE ... WHERE Versao = <antiga> não encontra a linha
        u2.MovimentarSaldo(-50, A.Relogio.GetUtcNow());
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => db2.SaveChangesAsync());

        Assert.Equal(70, await GetSaldo());
    }

    [Fact]
    public async Task A_unidade_de_trabalho_repete_a_operacao_com_os_dados_novos_quando_ha_conflito()
    {
        await Adicionar(100);
        var scope = A.NovoScope();
        var unitOfWork = scope.GetRequiredService<IUnitOfWork>();
        var utilizadores = scope.GetRequiredService<IUtilizadoresRepository>();
        var db = scope.GetRequiredService<FinancasDbContext>();

        var tentativas = 0;
        await unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            tentativas++;
            var utilizador = await utilizadores.ObterOuCriarAsync(Uid, A.Relogio.GetUtcNow(), ct);
            if (tentativas == 1)
            {
                // Simular outro pedido que mudou o utilizador depois de esta operação o ter lido
                db.Entry(utilizador).Property(u => u.Versao).OriginalValue = utilizador.Versao + 100;
            }

            utilizador.MovimentarSaldo(-10, A.Relogio.GetUtcNow());
        });

        Assert.Equal(2, tentativas);
        Assert.Equal(90, await GetSaldo()); // o movimento conta uma vez só
    }

    [Fact]
    public async Task Se_o_conflito_se_mantem_desiste_ao_fim_de_tres_tentativas_sem_gravar_nada()
    {
        await Adicionar(100);
        var scope = A.NovoScope();
        var unitOfWork = scope.GetRequiredService<IUnitOfWork>();
        var utilizadores = scope.GetRequiredService<IUtilizadoresRepository>();
        var db = scope.GetRequiredService<FinancasDbContext>();

        var tentativas = 0;
        await Assert.ThrowsAsync<ConflitoDeConcorrenciaException>(() => unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            tentativas++;
            var utilizador = await utilizadores.ObterOuCriarAsync(Uid, A.Relogio.GetUtcNow(), ct);
            db.Entry(utilizador).Property(u => u.Versao).OriginalValue = utilizador.Versao + 100;
            utilizador.MovimentarSaldo(-10, A.Relogio.GetUtcNow());
        }));

        Assert.Equal(3, tentativas);
        Assert.Equal(100, await GetSaldo());
    }

    [Fact]
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

        // Mesmo com outro id, o índice único (utilizador, mês, despesa) não deixa
        db.PagamentosFixas.Add(Pagamento("outro-id"));
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Os_dados_de_um_utilizador_nao_se_veem_nem_se_mexem_a_partir_de_outro()
    {
        await Adicionar(1000);
        var extra = await AdicionarExtra("Jantar", 50);

        await Extras.RemoverAsync("outro-utilizador", extra); // não existe para ele: não faz nada
        Assert.Empty(await Extras.ListarAsync("outro-utilizador", null));
        Assert.Single(await Extras.ListarAsync(Uid, null));
        Assert.Equal(950, await GetSaldo());
    }
}
