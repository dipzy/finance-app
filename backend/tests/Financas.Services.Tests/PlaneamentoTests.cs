using Financas.DAL.Entidades;
using Financas.Services.Regras;
using static Financas.Services.Tests.Folhas;

namespace Financas.Services.Tests;

// Regras puras dos orçamentos, dos objetivos de poupança, dos gastos por categoria e dos totais da folha.
public class PlaneamentoTests
{
    // ---- Orçamentos ----

    [Theory]
    [InlineData(0, 200, EstadoOrcamento.Ok, 0)]
    [InlineData(159.99, 200, EstadoOrcamento.Ok, 80)] // 79,995% arredonda para 80 na percentagem, mas ainda está ok
    [InlineData(160, 200, EstadoOrcamento.Perto, 80)]
    [InlineData(164, 200, EstadoOrcamento.Perto, 82)]
    [InlineData(199.99, 200, EstadoOrcamento.Perto, 100)]
    [InlineData(200, 200, EstadoOrcamento.Ultrapassado, 100)]
    [InlineData(250, 200, EstadoOrcamento.Ultrapassado, 125)]
    public void Estado_do_orcamento_pelos_valores_exatos(decimal gasto, decimal limite, EstadoOrcamento estado, decimal percentagem)
    {
        var s = Calculos.CalcularOrcamento(gasto, limite);
        Assert.Equal(estado, s.Estado);
        Assert.Equal(percentagem, s.Percentagem);
        Assert.Equal(gasto, s.Gasto);
        Assert.Equal(limite, s.Limite);
    }

    [Fact]
    public void O_que_resta_do_orcamento_nunca_e_negativo()
    {
        Assert.Equal(36, Calculos.CalcularOrcamento(164, 200).Restante);
        Assert.Equal(0, Calculos.CalcularOrcamento(250, 200).Restante);
        Assert.Equal(33.3m, Calculos.CalcularOrcamento(10, 30).Percentagem);
    }

    [Fact]
    public void Gastos_por_categoria_agrupam_e_as_sem_categoria_contam_como_outros()
    {
        DespesaExtra E(decimal valor, string? categoria) => new()
        {
            UtilizadorId = "u",
            Id = Guid.NewGuid().ToString("N"),
            Titulo = "x",
            Valor = valor,
            Categoria = categoria,
        };

        var gastos = Calculos.GastosPorCategoria(
        [
            E(10.1m, "restauracao"),
            E(20.2m, "restauracao"),
            E(5, null),
            E(7, "outros"),
            E(40, "supermercado"),
            E(0, "lazer"),
        ]);

        Assert.Equal(
            new[]
            {
                new GastoCategoria("supermercado", 40, 1),
                new GastoCategoria("restauracao", 30.3m, 2),
                new GastoCategoria("outros", 12, 2),
            },
            gastos);
    }

    // ---- Objetivos de poupança ----

    [Fact]
    public void Objetivo_no_mes_em_que_e_criado_esta_no_bom_caminho()
    {
        // 600 € de outubro a março: 6 meses, 100 € por mês
        var s = Calculos.CalcularObjetivo(600, 0, "2026-10", "2027-03", "2026-10");
        Assert.Equal(EstadoObjetivo.NoBomCaminho, s.Estado);
        Assert.Equal(6, s.MesesRestantes);
        Assert.Equal(100, s.ValorPorMes);
        Assert.Equal(600, s.EmFalta);
        Assert.Equal(0, s.Percentagem);
        Assert.Equal(0, s.Esperado);
    }

    [Fact]
    public void Objetivo_atrasado_quando_tem_menos_do_que_o_ritmo_pedia()
    {
        // Em dezembro já passaram outubro e novembro: devia ter 2/6 de 600 = 200
        var atrasado = Calculos.CalcularObjetivo(600, 150, "2026-10", "2027-03", "2026-12");
        Assert.Equal(EstadoObjetivo.Atrasado, atrasado.Estado);
        Assert.Equal(200, atrasado.Esperado);
        Assert.Equal(4, atrasado.MesesRestantes); // dezembro, janeiro, fevereiro e março
        Assert.Equal(112.5m, atrasado.ValorPorMes); // 450 / 4
        Assert.Equal(25, atrasado.Percentagem);

        var emDia = Calculos.CalcularObjetivo(600, 200, "2026-10", "2027-03", "2026-12");
        Assert.Equal(EstadoObjetivo.NoBomCaminho, emDia.Estado);
        Assert.Equal(100, emDia.ValorPorMes);
    }

    [Fact]
    public void Objetivo_atingido_e_prazo_passado()
    {
        var atingido = Calculos.CalcularObjetivo(1000, 1200, "2026-01", "2026-12", "2026-10");
        Assert.Equal(EstadoObjetivo.Atingido, atingido.Estado);
        Assert.Equal(100, atingido.Percentagem);
        Assert.Equal(0, atingido.EmFalta);
        Assert.Equal(0, atingido.ValorPorMes);

        // O mês alvo já passou e ainda falta: atrasado, e o que falta é para já
        var passou = Calculos.CalcularObjetivo(1000, 900, "2026-01", "2026-09", "2026-10");
        Assert.Equal(EstadoObjetivo.Atrasado, passou.Estado);
        Assert.Equal(0, passou.MesesRestantes);
        Assert.Equal(100, passou.ValorPorMes);
    }

    [Fact]
    public void Valor_por_mes_arredonda_ao_centimo_para_cima_e_o_mes_alvo_conta()
    {
        // 100 € em 3 meses (outubro, novembro e dezembro): 33,34 € (33,33 não chegava)
        var s = Calculos.CalcularObjetivo(100, 0, "2026-10", "2026-12", "2026-10");
        Assert.Equal(3, s.MesesRestantes);
        Assert.Equal(33.34m, s.ValorPorMes);

        // Mês alvo = mês atual: tudo este mês
        var esteMes = Calculos.CalcularObjetivo(100, 40, "2026-10", "2026-10", "2026-10");
        Assert.Equal(1, esteMes.MesesRestantes);
        Assert.Equal(60, esteMes.ValorPorMes);
        Assert.Equal(EstadoObjetivo.NoBomCaminho, esteMes.Estado);
    }

    [Fact]
    public void Diferenca_e_ultimos_meses()
    {
        Assert.Equal(3, Meses.Diferenca("2026-10", "2027-01"));
        Assert.Equal(-2, Meses.Diferenca("2026-10", "2026-08"));
        Assert.Equal(0, Meses.Diferenca("2026-10", "2026-10"));
        Assert.Equal(new[] { "2026-11", "2026-12", "2027-01" }, Meses.Ultimos("2027-01", 3));
        Assert.Equal(12, Meses.Ultimos("2026-10", 12).Count);
        Assert.Equal("2025-11", Meses.Ultimos("2026-10", 12)[0]);
    }

    // ---- Totais da folha (os mesmos de totaisFolha na app) ----

    [Fact]
    public void Totais_da_folha_como_no_livro_Excel()
    {
        var t = Calculos.TotaisFolha(Abril);
        Assert.Equal(1276, t.Lucro); // sem o cartão de alimentação (informativo)
        Assert.Equal(338.28m, t.Despesas);
        Assert.Equal(650, t.Poupanca);
        Assert.Equal(37.19m, t.DespesasMes);
        Assert.Equal(937.72m, t.Sobra);
        Assert.Equal(287.72m, t.TotalParaExtras);
        Assert.Equal(250.53m, t.Total);
        Assert.Equal(745.12m, t.Previsao);

        var semSaldo = Calculos.TotaisFolha(Folha("2026-05"));
        Assert.Null(semSaldo.Previsao);
        Assert.Equal(0, semSaldo.Total);
    }
}
