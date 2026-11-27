using Financas.DAL.Entidades;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// As regras puras das contribuições manuais por enviar (sem base de dados)
public class RegrasPoupancasTests
{
    private static Poupanca Manual(string? inicio, string? ultima = null, bool automatica = false) => new()
    {
        UtilizadorId = "u",
        Id = "p",
        Nome = "PPR",
        ContribuicaoAutomatica = automatica,
        Inicio = inicio,
        UltimaContribuicaoMes = ultima,
    };

    private static IReadOnlySet<string> Enviados(params string[] meses) => meses.ToHashSet();

    [Fact]
    public void Verifica_os_3_meses_anteriores_ao_atual_do_mais_antigo_para_o_mais_recente()
    {
        Assert.Equal(["2026-07", "2026-08", "2026-09"], RegrasPoupancas.MesesAVerificar("2026-10"));
        Assert.Equal(["2026-10", "2026-11", "2026-12"], RegrasPoupancas.MesesAVerificar("2027-01"));
    }

    [Fact]
    public void So_contam_os_meses_sem_contribuicao_a_partir_do_inicio_da_poupanca()
    {
        Assert.Equal(["2026-07", "2026-08", "2026-09"], RegrasPoupancas.MesesPorEnviar(Manual("2026-01"), Enviados(), "2026-10"));
        Assert.Equal(["2026-08", "2026-09"], RegrasPoupancas.MesesPorEnviar(Manual("2026-08"), Enviados(), "2026-10"));
        Assert.Equal(["2026-07", "2026-09"], RegrasPoupancas.MesesPorEnviar(Manual("2026-01"), Enviados("2026-08"), "2026-10"));
        Assert.Empty(RegrasPoupancas.MesesPorEnviar(Manual("2026-10"), Enviados(), "2026-10")); // criada este mês
    }

    [Fact]
    public void A_ultima_contribuicao_conta_como_enviada_mesmo_sem_registo()
    {
        Assert.Equal(["2026-07", "2026-08"], RegrasPoupancas.MesesPorEnviar(Manual("2026-01", ultima: "2026-09"), Enviados(), "2026-10"));
    }

    [Fact]
    public void As_automaticas_e_as_sem_inicio_nunca_ficam_em_atraso()
    {
        Assert.Empty(RegrasPoupancas.MesesPorEnviar(Manual("2026-01", automatica: true), Enviados(), "2026-10"));
        Assert.Empty(RegrasPoupancas.MesesPorEnviar(Manual(null), Enviados(), "2026-10"));
    }

    [Fact]
    public void So_se_regulariza_um_dos_meses_a_verificar_e_depois_do_inicio()
    {
        var p = Manual("2026-08");
        Assert.True(RegrasPoupancas.PodeRegularizar(p, "2026-09", "2026-10"));
        Assert.True(RegrasPoupancas.PodeRegularizar(p, "2026-08", "2026-10"));
        Assert.False(RegrasPoupancas.PodeRegularizar(p, "2026-07", "2026-10")); // antes do início
        Assert.False(RegrasPoupancas.PodeRegularizar(Manual("2026-01"), "2026-06", "2026-10")); // há mais de 3 meses
        Assert.False(RegrasPoupancas.PodeRegularizar(p, "2026-10", "2026-10")); // o atual não é "em atraso"
        Assert.False(RegrasPoupancas.PodeRegularizar(p, "2026-11", "2026-10")); // futuro
        Assert.False(RegrasPoupancas.PodeRegularizar(Manual(null), "2026-09", "2026-10"));
    }
}
