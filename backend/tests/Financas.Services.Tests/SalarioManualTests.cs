using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// Recebimento manual do salário: não entra sozinho no dia; é a pessoa que marca "Já recebi", com o valor que entrou
// de facto. Uma vez por mês, e entra como o automático (poupanças automáticas e cartão de alimentação incluídos).
public class SalarioManualTests : TestesServicos
{
    private Task GuardarManual(string valor = "1500", int dia = 25, string? cartao = null, bool manual = true) =>
        Salario.GuardarAsync(Uid, new GuardarSalarioPedido(valor, dia, cartao, null, manual));

    [Fact]
    public async Task Com_o_recebimento_manual_o_salario_nao_entra_sozinho_no_dia()
    {
        HojeE(2026, 10, 25);
        await GuardarManual();

        Assert.Null(await Salario.ProcessarRecebimentoAsync(Uid));
        Assert.Equal(0m, await GetSaldo());
        Assert.True((await Salario.ObterAsync(Uid))!.RecebimentoManual);
    }

    [Fact]
    public async Task Sem_o_recebimento_manual_continua_a_entrar_sozinho_no_dia()
    {
        HojeE(2026, 10, 25);
        await GuardarManual(manual: false);

        Assert.NotNull(await Salario.ProcessarRecebimentoAsync(Uid));
        Assert.Equal(1500m, await GetSaldo());
        Assert.False((await Salario.ObterAsync(Uid))!.RecebimentoManual);
    }

    [Fact]
    public async Task Guardar_a_configuracao_sem_o_campo_mantem_o_modo()
    {
        await GuardarManual();

        await Salario.GuardarAsync(Uid, new GuardarSalarioPedido("1600", 26, null));

        var config = (await Salario.ObterAsync(Uid))!;
        Assert.True(config.RecebimentoManual);
        Assert.Equal("1600", config.Valor);
    }

    [Fact]
    public async Task Ja_recebi_entra_com_o_valor_configurado_por_defeito()
    {
        HojeE(2026, 10, 28); // depois do dia 25: o salário não entrou sozinho
        await GuardarManual();

        var r = await Salario.ReceberManualAsync(Uid, null);

        Assert.Equal(1500m, r.Salario);
        Assert.Equal(1500m, await GetSaldo());
        var config = (await Salario.ObterAsync(Uid))!;
        Assert.NotNull(config.LastReceived);
        Assert.Equal(1500m, config.UltimoRecebimento!.Liquido);
    }

    [Fact]
    public async Task Ja_recebi_aceita_o_valor_que_entrou_de_facto()
    {
        HojeE(2026, 10, 28);
        await GuardarManual();

        var r = await Salario.ReceberManualAsync(Uid, 1623.45m);

        Assert.Equal(1623.45m, r.Salario);
        Assert.Equal(1623.45m, await GetSaldo());
    }

    [Fact]
    public async Task So_se_pode_marcar_uma_vez_por_mes()
    {
        HojeE(2026, 10, 28);
        await GuardarManual();
        await Salario.ReceberManualAsync(Uid, null);

        await Assert.ThrowsAsync<ConflitoException>(() => Salario.ReceberManualAsync(Uid, null));

        Assert.Equal(1500m, await GetSaldo());
        // No mês seguinte já se pode marcar outra vez
        HojeE(2026, 11, 27);
        await Salario.ReceberManualAsync(Uid, 1400m);
        Assert.Equal(2900m, await GetSaldo());
    }

    [Fact]
    public async Task Sem_o_recebimento_manual_ligado_nao_se_pode_marcar()
    {
        HojeE(2026, 10, 28);
        await GuardarManual(manual: false);

        await Assert.ThrowsAsync<ConflitoException>(() => Salario.ReceberManualAsync(Uid, null));
    }

    [Fact]
    public async Task Sem_salario_configurado_ou_com_valor_invalido_nao_entra_nada()
    {
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Salario.ReceberManualAsync(Uid, null));

        await GuardarManual();
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Salario.ReceberManualAsync(Uid, 0m));
        Assert.Equal(0m, await GetSaldo());
    }

    [Fact]
    public async Task O_recebimento_manual_tambem_faz_as_poupancas_automaticas_e_carrega_o_cartao()
    {
        HojeE(2026, 10, 28);
        var poupanca = await AdicionarPoupanca("Fundo", TipoContribuicao.Valor, "100", 50);
        await GuardarManual(cartao: "150");

        var r = await Salario.ReceberManualAsync(Uid, 1600m);

        Assert.Equal(1500m, r.Liquido); // 1600 - 100 para a poupança
        Assert.Equal(1500m, await GetSaldo());
        Assert.Equal(150m, r.CartaoAlimentacao);
        Assert.Equal(150m, (await Conta.ObterCartaoAlimentacaoAsync(Uid)).Saldo);
        Assert.Equal(150m, (await Poupancas.ListarAsync(Uid)).Single(p => p.Id == poupanca).Saldo);
    }

    [Fact]
    public void Calculos_o_modo_manual_nunca_deixa_o_salario_entrar_sozinho()
    {
        var hoje = new DateOnly(2026, 10, 25);
        var automatico = new ConfiguracaoSalario { Valor = "1500", DiaRecebimento = 25 };

        Assert.True(Calculos.DeveReceberSalario(automatico, hoje, TimeZoneInfo.Utc));
        Assert.False(Calculos.DeveReceberSalario(automatico with { RecebimentoManual = true }, hoje, TimeZoneInfo.Utc));
        Assert.False(Calculos.SalarioRecebidoNoMes(automatico, hoje, TimeZoneInfo.Utc));
        Assert.True(Calculos.SalarioRecebidoNoMes(
            automatico with { RecebidoEm = new DateTimeOffset(2026, 10, 3, 9, 0, 0, TimeSpan.Zero) }, hoje, TimeZoneInfo.Utc));
    }
}
