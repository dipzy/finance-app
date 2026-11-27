using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// Importar o extrato da conta bancária: categorias sugeridas, movimentos já importados, possíveis duplicados
// (despesas feitas à mão) e a importação sem mexer nos saldos. "Hoje" nos testes é 25 de outubro de 2026.
public class ExtratoBancarioTests : TestesServicos
{
    private IExtratoBancarioService Extrato => A.Servico<IExtratoBancarioService>();

    protected override Task PrepararAsync()
    {
        HojeE(2026, 10, 25);
        return Task.CompletedTask;
    }

    private static MovimentoExtratoPedido Mov(string descricao, decimal valor, int dia = 5, int ocorrencia = 0, string? categoria = null, int mes = 10) =>
        new(new DateOnly(2026, mes, dia), descricao, valor, ocorrencia, categoria);

    private static ExtratoBancarioPedido Pedido(params MovimentoExtratoPedido[] movimentos) => new(movimentos);

    // ---- Previsão ----

    [Fact]
    public async Task A_previsao_sugere_a_categoria_pelas_palavras_chave_e_nao_grava_nada()
    {
        var previsao = await Extrato.PrevisualizarAsync(Uid, Pedido(Mov("Pingo Doce Lisboa", 45.67m), Mov("Uber Trip", 12.3m), Mov("Coisa estranha", 9m)));

        Assert.Equal(["supermercado", "transportes", "outros"], previsao.Movimentos.Select(m => m.Categoria));
        Assert.All(previsao.Movimentos, m => Assert.False(m.JaImportado));
        Assert.Empty(await ExtrasDoMes("2026-10"));
    }

    [Fact]
    public async Task As_regras_do_utilizador_e_o_historico_ganham_as_palavras_chave()
    {
        await A.Servico<IRegrasCategoriaService>().AdicionarAsync(Uid, new NovaRegraCategoriaPedido("padaria do bairro", "lazer", true, 0));
        await Extras.AdicionarHistoricaAsync(Uid, new DespesaHistoricaPedido("Cafe Central", 1.5m, Dia(2026, 9, 1), "restauracao"));

        var previsao = await Extrato.PrevisualizarAsync(Uid, Pedido(Mov("PADARIA DO BAIRRO", 3m), Mov("Cafe Central", 1.2m)));

        Assert.Equal(("lazer", OrigemSugestao.Regra), (previsao.Movimentos[0].Categoria, previsao.Movimentos[0].Origem));
        Assert.Equal(("restauracao", OrigemSugestao.Historico), (previsao.Movimentos[1].Categoria, previsao.Movimentos[1].Origem));
    }

    [Fact]
    public async Task Uma_categoria_escolhida_na_app_vale_mais_que_a_sugerida()
    {
        var previsao = await Extrato.PrevisualizarAsync(Uid, Pedido(Mov("Pingo Doce", 10m, categoria: "casa")));
        Assert.Equal("casa", previsao.Movimentos[0].Categoria);
    }

    [Fact]
    public async Task Uma_despesa_feita_a_mao_com_a_mesma_data_e_valor_aparece_como_possivel_duplicado_uma_so_vez()
    {
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Almoço", 8.5m, Dia(2026, 10, 5)));

        var previsao = await Extrato.PrevisualizarAsync(Uid, Pedido(
            Mov("Restaurante A", 8.5m),
            Mov("Restaurante B", 8.5m), // a despesa à mão só pode ser o mesmo movimento de um
            Mov("Restaurante C", 8.5m, dia: 6))); // outra data: não é a mesma

        Assert.Equal(["Almoço", null, null], previsao.Movimentos.Select(m => m.PossivelDuplicadoDe));
    }

    // ---- Importar ----

    [Fact]
    public async Task Importar_cria_as_despesas_no_historico_sem_mexer_nos_saldos()
    {
        await Adicionar(1000);

        var resultado = await Extrato.ImportarAsync(Uid, Pedido(Mov("Pingo Doce Lisboa", 45.67m), Mov("Uber Trip", 12.3m, dia: 6), Mov("Netflix", 11.99m, dia: 7, mes: 9)));

        Assert.Equal((3, 0, 69.96m), (resultado.Importados, resultado.JaImportados, resultado.Total));
        Assert.Equal(["2026-09", "2026-10"], resultado.Meses);

        var outubro = await ExtrasDoMes("2026-10");
        Assert.Equal(2, outubro.Count);
        var pingo = outubro.Single(e => e.Titulo == "Pingo Doce Lisboa");
        Assert.Equal(("supermercado", 45.67m, Dia(2026, 10, 5), false, MeioPagamento.Conta), (pingo.Categoria, pingo.Valor, pingo.Data, pingo.DescontadaDaConta, pingo.MeioPagamento));
        Assert.Single(await ExtrasDoMes("2026-09"));
        Assert.Equal(1000, await GetSaldo()); // o banco já descontou: a app não mexe no saldo
    }

    [Fact]
    public async Task Importar_o_mesmo_extrato_duas_vezes_nao_duplica_nada()
    {
        var pedido = Pedido(Mov("Pingo Doce", 45.67m), Mov("Uber", 12.3m, dia: 6));

        var primeira = await Extrato.ImportarAsync(Uid, pedido);
        var segunda = await Extrato.ImportarAsync(Uid, pedido);

        Assert.Equal((2, 0), (primeira.Importados, primeira.JaImportados));
        Assert.Equal((0, 2, 0m, 0), (segunda.Importados, segunda.JaImportados, segunda.Total, segunda.Meses.Count));
        Assert.Equal(2, (await ExtrasDoMes("2026-10")).Count);

        var previsao = await Extrato.PrevisualizarAsync(Uid, pedido);
        Assert.All(previsao.Movimentos, m => Assert.True(m.JaImportado));
    }

    [Fact]
    public async Task Extratos_que_se_sobrepoem_so_trazem_o_que_e_novo()
    {
        await Extrato.ImportarAsync(Uid, Pedido(Mov("Compra A", 10m, dia: 1), Mov("Compra B", 20m, dia: 2)));

        var resultado = await Extrato.ImportarAsync(Uid, Pedido(Mov("Compra B", 20m, dia: 2), Mov("Compra C", 30m, dia: 3)));

        Assert.Equal((1, 1), (resultado.Importados, resultado.JaImportados));
        Assert.Equal(["Compra C", "Compra B", "Compra A"], (await ExtrasDoMes("2026-10")).Select(e => e.Titulo));
    }

    [Fact]
    public async Task Movimentos_iguais_no_mesmo_dia_contam_como_dois_e_cada_um_so_entra_uma_vez()
    {
        // Dois cafés iguais no mesmo dia: a app numera-os (ocorrência 0 e 1) no extrato inteiro
        var cafe0 = Mov("Cafe", 1.2m, ocorrencia: 0);
        var cafe1 = Mov("Cafe", 1.2m, ocorrencia: 1);

        // Primeiro só se importa o segundo (a pessoa desmarcou o primeiro)...
        Assert.Equal(1, (await Extrato.ImportarAsync(Uid, Pedido(cafe1))).Importados);
        // ...depois o extrato inteiro: só o primeiro café é novo
        var resultado = await Extrato.ImportarAsync(Uid, Pedido(cafe0, cafe1));

        Assert.Equal((1, 1), (resultado.Importados, resultado.JaImportados));
        Assert.Equal(2, (await ExtrasDoMes("2026-10")).Count);
    }

    [Fact]
    public async Task A_descricao_compara_se_sem_acentos_nem_maiusculas()
    {
        await Extrato.ImportarAsync(Uid, Pedido(Mov("Pingo Doce Açores", 10m)));
        var resultado = await Extrato.ImportarAsync(Uid, Pedido(Mov("PINGO DOCE ACORES", 10m)));
        Assert.Equal(1, resultado.JaImportados);
    }

    [Fact]
    public async Task Despesas_feitas_a_mao_nao_impedem_a_importacao()
    {
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Almoço", 8.5m, Dia(2026, 10, 5)));

        var resultado = await Extrato.ImportarAsync(Uid, Pedido(Mov("Restaurante", 8.5m)));

        Assert.Equal(1, resultado.Importados); // quem decide se é duplicado é a pessoa, na previsão
        Assert.Equal(2, (await ExtrasDoMes("2026-10")).Count);
    }

    [Fact]
    public async Task Os_gastos_importados_contam_nos_orcamentos_e_no_historico_do_mes()
    {
        await A.Servico<IOrcamentosService>().AdicionarAsync(Uid, new NovoOrcamentoPedido("supermercado", 100));
        await Extrato.ImportarAsync(Uid, Pedido(Mov("Pingo Doce", 85m)));

        var estado = Assert.Single(await A.Servico<IOrcamentosService>().EstadoAsync(Uid, "2026-10"));
        Assert.Equal(85m, estado.Gasto);
    }

    // ---- Validação ----

    [Fact]
    public async Task Sem_movimentos_ou_com_demasiados_da_erro()
    {
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Extrato.ImportarAsync(Uid, Pedido()));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Extrato.PrevisualizarAsync(Uid, Pedido()));

        var demasiados = Pedido([.. Enumerable.Range(0, ExtratoBancarioService.MaximoMovimentos + 1).Select(i => Mov($"Compra {i}", 1m, ocorrencia: 0))]);
        var erro = await Assert.ThrowsAsync<PedidoInvalidoException>(() => Extrato.ImportarAsync(Uid, demasiados));
        Assert.Contains("1000", erro.Message);
    }

    [Fact]
    public async Task Mil_movimentos_cabem_num_pedido()
    {
        var mil = Pedido([.. Enumerable.Range(0, 1000).Select(i => Mov($"Compra {i % 50}", 1m + (i % 7), dia: 1 + (i % 28), ocorrencia: i / 350))]);
        var resultado = await Extrato.ImportarAsync(Uid, mil);
        Assert.Equal(1000, resultado.Importados + resultado.JaImportados);
    }

    [Fact]
    public void A_chave_so_depende_da_data_do_valor_da_descricao_e_da_ocorrencia()
    {
        var chave = ExtratoBancarioService.ChaveDo(Dia(2026, 10, 5), 10m, "Pingo Doce", 0);
        Assert.StartsWith("ext:", chave);
        Assert.True(chave.Length <= 64);
        Assert.Equal(chave, ExtratoBancarioService.ChaveDo(Dia(2026, 10, 5), 10.00m, "PINGO  doce".Replace("  ", " "), 0));
        Assert.NotEqual(chave, ExtratoBancarioService.ChaveDo(Dia(2026, 10, 5), 10m, "Pingo Doce", 1));
        Assert.NotEqual(chave, ExtratoBancarioService.ChaveDo(Dia(2026, 10, 6), 10m, "Pingo Doce", 0));
        Assert.NotEqual(chave, ExtratoBancarioService.ChaveDo(Dia(2026, 10, 5), 10.01m, "Pingo Doce", 0));
    }
}
