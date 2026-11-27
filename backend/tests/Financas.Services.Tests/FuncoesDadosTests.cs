using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using static Financas.Services.Tests.Folhas;

namespace Financas.Services.Tests;

// Categorias das despesas extras, orçamentos, objetivos de poupança e estatísticas, com a DAL
// verdadeira (SQLite em memória). "Hoje" = 5 de outubro de 2026.

public class CategoriasEOrcamentosTests : TestesServicos
{
    private IOrcamentosService Orcamentos => A.Servico<IOrcamentosService>();
    private IEstatisticasService Estatisticas => A.Servico<IEstatisticasService>();

    private async Task<DespesaExtraDto> Extra(string id) => (await Extras.ListarAsync(Uid, null)).Single(e => e.Id == id);

    // Como as versões anteriores as deixaram: sem categoria
    private async Task AdicionarExtraAntiga(string id, decimal valor, DateOnly data)
    {
        await Adicionar(0); // o utilizador tem de existir
        var db = A.Db();
        db.DespesasExtras.Add(new DespesaExtra
        {
            UtilizadorId = Uid,
            Id = id,
            Titulo = "Coisa antiga",
            Valor = valor,
            Data = data,
            Mes = $"{data.Year:D4}-{data.Month:D2}",
            CriadoEm = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero),
        });
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Sem_categoria_a_extra_fica_com_a_sugerida_e_com_categoria_fica_a_escolhida()
    {
        var sugerida = await AdicionarExtra("Pingo Doce", 30);
        Assert.Equal("supermercado", (await Extra(sugerida)).Categoria);

        var escolhida = await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Pingo Doce", 5, null, "casa"));
        Assert.Equal("casa", (await Extra(escolhida)).Categoria);

        // Da próxima vez sugere a última que o utilizador escolheu para este título
        Assert.Equal(new SugestaoCategoria("casa", OrigemSugestao.Historico), await Extras.SugerirCategoriaAsync(Uid, "pingo doce"));
        Assert.Equal(new SugestaoCategoria("combustivel", OrigemSugestao.PalavraChave), await Extras.SugerirCategoriaAsync(Uid, "Galp"));
        Assert.Equal(new SugestaoCategoria("outros", OrigemSugestao.PorDefeito), await Extras.SugerirCategoriaAsync(Uid, ""));
    }

    [Fact]
    public async Task Editar_pode_mudar_so_a_categoria()
    {
        await Adicionar(100);
        var id = await AdicionarExtra("Jantar", 20);
        await Extras.AlterarAsync(Uid, id, new AlterarDespesaExtraPedido(null, null, null, "lazer"));

        var extra = await Extra(id);
        Assert.Equal("lazer", extra.Categoria);
        Assert.Equal("Jantar", extra.Titulo);
        Assert.Equal(80, await GetSaldo());
    }

    [Fact]
    public async Task As_historicas_e_as_importadas_do_Excel_ficam_com_a_sugestao()
    {
        var historica = await Extras.AdicionarHistoricaAsync(Uid, new DespesaHistoricaPedido("Netflix", 13.99m, Dia(2026, 3, 1)));
        Assert.Equal("lazer", (await Extra(historica)).Categoria);

        await Folha.ImportarAsync(Uid, Abril.Mes, Abril, null);
        var importadas = await ExtrasDoMes("2026-04");
        Assert.Equal("compras", importadas.Single(e => e.Titulo == "Temu").Categoria);
        Assert.Equal("outros", importadas.Single(e => e.Titulo == "Bilhetes UDL").Categoria);
    }

    [Fact]
    public async Task Um_orcamento_por_categoria()
    {
        var restauracao = await Orcamentos.AdicionarAsync(Uid, new NovoOrcamentoPedido("restauracao", 200));
        var conflito = await Assert.ThrowsAsync<ConflitoException>(() => Orcamentos.AdicionarAsync(Uid, new NovoOrcamentoPedido("restauracao", 100)));
        Assert.Equal("Já existe um orçamento para Restauração: altera esse.", conflito.Message);

        var lazer = await Orcamentos.AdicionarAsync(Uid, new NovoOrcamentoPedido("lazer", 50.005m));
        await Assert.ThrowsAsync<ConflitoException>(() => Orcamentos.AlterarAsync(Uid, lazer, new AlterarOrcamentoPedido("restauracao", null)));
        await Assert.ThrowsAsync<NaoEncontradoException>(() => Orcamentos.AlterarAsync(Uid, "nao-existe", new AlterarOrcamentoPedido(null, 10)));

        await Orcamentos.AlterarAsync(Uid, restauracao, new AlterarOrcamentoPedido(null, 250));
        // Pela ordem das categorias na app (restauração antes de lazer), ao cêntimo
        Assert.Equal(
            new[] { new OrcamentoDto(restauracao, "restauracao", 250), new OrcamentoDto(lazer, "lazer", 50.01m) },
            await Orcamentos.ListarAsync(Uid));

        await Orcamentos.RemoverAsync(Uid, lazer);
        await Orcamentos.RemoverAsync(Uid, lazer); // apagar o que já não existe não é erro
        Assert.Single(await Orcamentos.ListarAsync(Uid));
        // Depois de apagado, a categoria fica livre
        await Orcamentos.AdicionarAsync(Uid, new NovoOrcamentoPedido("lazer", 40));
    }

    [Fact]
    public async Task Estado_dos_orcamentos_com_os_gastos_do_mes()
    {
        await Adicionar(2000);
        var restauracao = await Orcamentos.AdicionarAsync(Uid, new NovoOrcamentoPedido("restauracao", 200));
        await Orcamentos.AdicionarAsync(Uid, new NovoOrcamentoPedido("supermercado", 100));
        await Orcamentos.AdicionarAsync(Uid, new NovoOrcamentoPedido("outros", 50));
        await Orcamentos.AdicionarAsync(Uid, new NovoOrcamentoPedido("lazer", 30));

        await AdicionarExtra("Jantar", 120, Dia(2026, 10, 2));
        await AdicionarExtra("Café", 44, Dia(2026, 10, 3));
        await AdicionarExtra("Continente", 120, Dia(2026, 10, 4));
        await AdicionarExtra("Jantar", 300, Dia(2026, 9, 20)); // setembro: não conta em outubro
        await AdicionarExtraAntiga("antiga", 10, Dia(2026, 10, 1)); // sem categoria: conta como "outros"

        var outubro = await Orcamentos.EstadoAsync(Uid, null);
        Assert.Equal(new[] { "supermercado", "restauracao", "lazer", "outros" }, outubro.Select(o => o.Categoria));
        // Previsto: no mês atual (dia 5 de 31) os 164 € gastos esticam para 164 / 5 × 31
        Assert.Equal(new EstadoOrcamentoDto(restauracao, "restauracao", "2026-10", 200, 164, 36, 82, EstadoOrcamento.Perto, 1016.8m), outubro[1]);
        Assert.Equal((120m, 120m, EstadoOrcamento.Ultrapassado), (outubro[0].Gasto, outubro[0].Percentagem, outubro[0].Estado));
        Assert.Equal((0m, 0m, EstadoOrcamento.Ok), (outubro[2].Gasto, outubro[2].Percentagem, outubro[2].Estado));
        Assert.Equal((10m, 20m, EstadoOrcamento.Ok), (outubro[3].Gasto, outubro[3].Percentagem, outubro[3].Estado));

        var setembro = await Orcamentos.EstadoAsync(Uid, "2026-09");
        Assert.Equal((300m, EstadoOrcamento.Ultrapassado), (setembro[1].Gasto, setembro[1].Estado));
        Assert.All(setembro, o => Assert.Equal("2026-09", o.Mes));
    }

    [Fact]
    public async Task Despesa_mensal_paga_so_em_parte_conta_no_orcamento_da_sua_categoria()
    {
        await Adicionar(1000);
        await Orcamentos.AdicionarAsync(Uid, new NovoOrcamentoPedido("combustivel", 100));
        var gasoleo = await Fixas.AdicionarAsync(Uid, new NovaDespesaFixaPedido("Gasóleo", 100, null, null, null, null, "combustivel"));
        await Fixas.AdicionarAsync(Uid, new NovaDespesaFixaPedido("Renda", 500, null, null, null, null)); // sem categoria: não entra em "outros"
        await AdicionarExtra("Galp", 10, Dia(2026, 10, 2)); // a categoria vem sugerida pelo título

        await Fixas.DebitarParcialAsync(Uid, gasoleo, 70);
        var parcial = Assert.Single(await Orcamentos.EstadoAsync(Uid, null));
        Assert.Equal((80m, 80m, EstadoOrcamento.Perto), (parcial.Gasto, parcial.Percentagem, parcial.Estado));

        await Fixas.DebitarAsync(Uid, gasoleo); // paga o resto: 100 € da despesa + 10 € do extra
        var pago = Assert.Single(await Orcamentos.EstadoAsync(Uid, null));
        Assert.Equal((110m, EstadoOrcamento.Ultrapassado), (pago.Gasto, pago.Estado));

        var categorias = await Estatisticas.GastosPorCategoriaAsync(Uid, null);
        Assert.Equal(new[] { new GastoCategoriaDto("combustivel", 110, 2, 100m) }, categorias.Categorias);
        Assert.Equal(0, (await Orcamentos.EstadoAsync(Uid, "2026-09")).Single().Gasto);
    }

    [Fact]
    public async Task Gastos_por_categoria_do_mes_incluem_as_categorias_sem_orcamento()
    {
        await Adicionar(1000);
        await AdicionarExtra("Jantar", 60);
        await AdicionarExtra("Uber", 15);
        await AdicionarExtra("Continente", 25);
        await AdicionarExtraAntiga("antiga", 10, Dia(2026, 10, 1));

        var gastos = await Estatisticas.GastosPorCategoriaAsync(Uid, null);
        Assert.Equal("2026-10", gastos.Mes);
        Assert.Equal(110, gastos.Total);
        Assert.Equal(
            new[]
            {
                new GastoCategoriaDto("restauracao", 60, 1, 54.5m),
                new GastoCategoriaDto("supermercado", 25, 1, 22.7m),
                new GastoCategoriaDto("transportes", 15, 1, 13.6m),
                new GastoCategoriaDto("outros", 10, 1, 9.1m),
            },
            gastos.Categorias);

        var vazio = await Estatisticas.GastosPorCategoriaAsync(Uid, "2026-01");
        Assert.Equal(0, vazio.Total);
        Assert.Empty(vazio.Categorias);
        Assert.Empty(await Orcamentos.EstadoAsync(Uid, null));
    }

    [Fact]
    public async Task Cada_utilizador_so_ve_os_seus_orcamentos()
    {
        var id = await Orcamentos.AdicionarAsync(Uid, new NovoOrcamentoPedido("lazer", 30));
        Assert.Empty(await Orcamentos.ListarAsync("outro"));
        await Assert.ThrowsAsync<NaoEncontradoException>(() => Orcamentos.AlterarAsync("outro", id, new AlterarOrcamentoPedido(null, 1)));
        await Orcamentos.RemoverAsync("outro", id);
        Assert.Single(await Orcamentos.ListarAsync(Uid));
        // O outro utilizador pode ter o seu orçamento para a mesma categoria
        await Orcamentos.AdicionarAsync("outro", new NovoOrcamentoPedido("lazer", 99));
    }
}

public class ObjetivosTests : TestesServicos
{
    private IObjetivosService Objetivos => A.Servico<IObjetivosService>();

    [Fact]
    public async Task Objetivo_com_valor_escrito_a_mao()
    {
        var id = await Objetivos.AdicionarAsync(Uid, new NovoObjetivoPedido(" Férias ", 600, "2027-03", null, 50));

        var objetivo = Assert.Single(await Objetivos.ListarAsync(Uid));
        Assert.Equal(
            new ObjetivoDto(id, "Férias", 600, "2027-03", "2026-10", null, null, 50, 8.3m, 550, 6, 91.67m, EstadoObjetivo.NoBomCaminho),
            objetivo);
        Assert.Equal(objetivo, await Objetivos.ObterAsync(Uid, id));

        await Objetivos.AlterarAsync(Uid, id, new AlterarObjetivoPedido(null, null, null, null, 600, null));
        Assert.Equal(EstadoObjetivo.Atingido, (await Objetivos.ObterAsync(Uid, id)).Estado);
    }

    [Fact]
    public async Task Ligado_a_uma_poupanca_o_progresso_e_o_saldo_dela()
    {
        await Adicionar(1000);
        var revolut = await AdicionarPoupanca("Revolut", TipoContribuicao.Valor, "100", 300);
        // O valor à mão é ignorado quando há poupança ligada
        var id = await Objetivos.AdicionarAsync(Uid, new NovoObjetivoPedido("Carro novo", 1000, "2026-12", revolut, 999));

        var objetivo = await Objetivos.ObterAsync(Uid, id);
        Assert.Equal((300m, "Revolut", revolut), (objetivo.ValorAtual, objetivo.PoupancaNome, objetivo.PoupancaId));
        Assert.Equal((700m, 3, 233.34m), (objetivo.EmFalta, objetivo.MesesRestantes, objetivo.ValorPorMes));
        // O ritmo: a Revolut recebe 100 € por mês e o objetivo pede 233,34 €: faltam 133,34 € por mês e chega-se em abril
        Assert.Equal((100m, -133.34m, "2027-04"), (objetivo.ContribuicaoMensal, objetivo.Diferenca, objetivo.MesPrevisto));

        await Poupancas.TransferirDaContaAsync(Uid, revolut, 200);
        Assert.Equal(500, (await Objetivos.ObterAsync(Uid, id)).ValorAtual);

        // Em dezembro devia ter 2/3 de 1000 (outubro e novembro já passaram): com 500 está atrasado
        HojeE(2026, 12, 5);
        var dezembro = await Objetivos.ObterAsync(Uid, id);
        Assert.Equal((EstadoObjetivo.Atrasado, 1, 500m), (dezembro.Estado, dezembro.MesesRestantes, dezembro.ValorPorMes));
    }

    [Fact]
    public async Task Apagar_a_poupanca_desliga_o_objetivo_sem_perder_o_progresso()
    {
        var poupanca = await AdicionarPoupanca("Certificados", TipoContribuicao.Valor, "0", 420.5m);
        var id = await Objetivos.AdicionarAsync(Uid, new NovoObjetivoPedido("Casa", 5000, "2028-01", poupanca, null));

        await Poupancas.RemoverAsync(Uid, poupanca);
        var objetivo = await Objetivos.ObterAsync(Uid, id);
        Assert.Null(objetivo.PoupancaId);
        Assert.Equal(420.5m, objetivo.ValorAtual);
    }

    [Fact]
    public async Task Desligar_a_poupanca_fica_com_o_saldo_dela_e_depois_o_valor_e_escrito_a_mao()
    {
        var poupanca = await AdicionarPoupanca("Revolut", TipoContribuicao.Valor, "0", 250);
        var id = await Objetivos.AdicionarAsync(Uid, new NovoObjetivoPedido("Férias", 1000, "2027-06", poupanca, null));

        // Com a poupança ligada, o valor não se escreve à mão
        await Assert.ThrowsAsync<PedidoInvalidoException>(() =>
            Objetivos.AlterarAsync(Uid, id, new AlterarObjetivoPedido(null, null, null, null, 10, null)));

        await Objetivos.AlterarAsync(Uid, id, new AlterarObjetivoPedido(null, null, null, null, null, ["poupancaId"]));
        Assert.Equal((null as string, 250m), ((await Objetivos.ObterAsync(Uid, id)).PoupancaId, (await Objetivos.ObterAsync(Uid, id)).ValorAtual));

        await Objetivos.AlterarAsync(Uid, id, new AlterarObjetivoPedido("Férias no Algarve", 1200, "2027-07", null, 300, null));
        var objetivo = await Objetivos.ObterAsync(Uid, id);
        Assert.Equal(("Férias no Algarve", 1200m, "2027-07", 300m), (objetivo.Nome, objetivo.ValorAlvo, objetivo.MesAlvo, objetivo.ValorAtual));

        // Voltar a ligar
        await Objetivos.AlterarAsync(Uid, id, new AlterarObjetivoPedido(null, null, null, poupanca, null, null));
        Assert.Equal(250, (await Objetivos.ObterAsync(Uid, id)).ValorAtual);
    }

    [Fact]
    public async Task Validacoes_e_utilizadores()
    {
        var mesPassado = await Assert.ThrowsAsync<PedidoInvalidoException>(() =>
            Objetivos.AdicionarAsync(Uid, new NovoObjetivoPedido("X", 10, "2026-09", null, null)));
        Assert.Equal("O mês alvo já passou: escolhe este mês ou um dos próximos.", mesPassado.Message);
        await Assert.ThrowsAsync<NaoEncontradoException>(() =>
            Objetivos.AdicionarAsync(Uid, new NovoObjetivoPedido("X", 10, "2026-12", "nao-existe", null)));
        await Assert.ThrowsAsync<NaoEncontradoException>(() => Objetivos.ObterAsync(Uid, "nao-existe"));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() =>
            Objetivos.AlterarAsync(Uid, "x", new AlterarObjetivoPedido(null, null, null, null, null, ["nome"])));

        // A poupança de outro utilizador não serve
        var alheia = await Poupancas.AdicionarAsync("outro", new NovaPoupancaPedido("Dele", TipoContribuicao.Valor, "0", 1000, null));
        await Assert.ThrowsAsync<NaoEncontradoException>(() =>
            Objetivos.AdicionarAsync(Uid, new NovoObjetivoPedido("X", 10, "2026-12", alheia, null)));

        var id = await Objetivos.AdicionarAsync(Uid, new NovoObjetivoPedido("Meu", 10, "2026-10", null, null));
        Assert.Empty(await Objetivos.ListarAsync("outro"));
        await Assert.ThrowsAsync<NaoEncontradoException>(() => Objetivos.ObterAsync("outro", id));
        await Objetivos.RemoverAsync("outro", id);
        Assert.Single(await Objetivos.ListarAsync(Uid));
        await Objetivos.RemoverAsync(Uid, id);
        Assert.Empty(await Objetivos.ListarAsync(Uid));
    }

    [Fact]
    public async Task Os_por_atingir_primeiro_pelo_mes_alvo_mais_proximo()
    {
        await Objetivos.AdicionarAsync(Uid, new NovoObjetivoPedido("Longe", 100, "2028-01", null, null));
        await Objetivos.AdicionarAsync(Uid, new NovoObjetivoPedido("Feito", 100, "2026-11", null, 100));
        await Objetivos.AdicionarAsync(Uid, new NovoObjetivoPedido("Perto", 100, "2026-12", null, null));

        Assert.Equal(new[] { "Perto", "Longe", "Feito" }, (await Objetivos.ListarAsync(Uid)).Select(o => o.Nome));
    }
}

public class EvolucaoTests : TestesServicos
{
    private IEstatisticasService Estatisticas => A.Servico<IEstatisticasService>();

    [Fact]
    public async Task Os_numeros_de_cada_mes_sao_os_da_folha_desse_mes()
    {
        // Abril importado do Excel (lucro, despesas mensais, poupança, extras e saldo no fim do mês)
        await Folha.ImportarAsync(Uid, Abril.Mes, Abril, null);
        // Setembro e outubro com dados da app: salário, uma poupança e extras
        HojeE(2026, 9, 1);
        await Adicionar(1000);
        await GuardarSalario("1500", 1, cartao: "160");
        await AdicionarPoupanca("Revolut", TipoContribuicao.Valor, "200", 0);
        await CalcularSaldoDisponivel(); // dia do salário de setembro
        await AdicionarExtra("Jantar", 45.5m);
        HojeE(2026, 10, 5);
        await CalcularSaldoDisponivel(); // abre outubro: o saldo de agora fica como final de setembro
        await AdicionarExtra("Continente", 80.25m);

        var evolucao = await Estatisticas.EvolucaoAsync(Uid);
        Assert.Equal(12, evolucao.Count);
        Assert.Equal("2025-11", evolucao[0].Mes);
        Assert.Equal("2026-10", evolucao[^1].Mes);

        // Exatamente os totais da folha de cada mês (os do Resumo do mês)
        foreach (var mes in evolucao)
        {
            var t = Calculos.TotaisFolha(await Folha.ObterDadosAsync(Uid, mes.Mes));
            var folha = await Folha.ObterDadosAsync(Uid, mes.Mes);
            // O cartão de alimentação vem da mesma folha (a linha "Alimen." e as despesas pagas com ele), à parte dos totais
            var cartao = Calculos.CartaoDaFolha(folha);
            Assert.Equal(
                new EvolucaoMesDto(
                    mes.Mes, t.Lucro, Calculos.Centimos(t.Despesas + t.DespesasMes), t.Poupanca, folha.SaldoConta,
                    t.Despesas, t.DespesasMes, Math.Max(0, t.Total), cartao.Carregado, cartao.Gasto),
                mes);
            Assert.Equal(mes.Gasto, mes.DespesasMensais + mes.DespesasExtras);
        }

        var abril = evolucao.Single(m => m.Mes == "2026-04");
        Assert.Equal((1276, 375.47m, 650, 745.12m), (abril.Entrou, abril.Gasto, abril.Poupado, abril.SaldoFinal));
        Assert.Equal(250.53m, abril.Livre); // 1276 - 375.47 - 650
        Assert.Equal((218m, 0m), (abril.CartaoCarregado, abril.CartaoGasto)); // o cartão de alimentação do Excel, à parte dos totais

        // Antes de haver dados: tudo a zero e o saldo não se sabe
        Assert.Equal(new EvolucaoMesDto("2025-11", 0, 0, 0, null, 0, 0, 0), evolucao[0]);

        var setembro = evolucao.Single(m => m.Mes == "2026-09");
        Assert.Equal(1500, setembro.Entrou); // sem o cartão de alimentação
        Assert.Equal(200, setembro.Poupado);
        Assert.Equal(2254.5m, setembro.SaldoFinal); // 1000 + 1500 - 200 - 45,50
        Assert.Equal(2174.25m, evolucao[^1].SaldoFinal); // outubro: o saldo de agora
    }

    [Fact]
    public async Task Ate_um_mes_passado_so_ate_ao_mes_atual_e_limites()
    {
        Assert.Equal(new[] { "2026-03", "2026-04", "2026-05" }, (await Estatisticas.EvolucaoAsync(Uid, 3, "2026-05")).Select(m => m.Mes));
        Assert.Equal("2026-10", (await Estatisticas.EvolucaoAsync(Uid, 2, "2027-05"))[^1].Mes);
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Estatisticas.EvolucaoAsync(Uid, 0));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Estatisticas.EvolucaoAsync(Uid, 37));
        Assert.Single(await Estatisticas.EvolucaoAsync(Uid, 1));
    }

    [Fact]
    public async Task Varias_folhas_de_uma_vez_sao_iguais_as_de_cada_mes()
    {
        await Folha.ImportarAsync(Uid, MarcoAna.Mes, MarcoAna, null);
        await Folha.ImportarAsync(Uid, Abril.Mes, Abril, null);
        await Adicionar(500);
        await AdicionarExtra("Cinema", 12);
        string[] meses = ["2026-02", "2026-03", "2026-04", "2026-10"];

        var varias = await Folha.ObterVariosAsync(Uid, meses);
        for (var i = 0; i < meses.Length; i++)
        {
            var uma = await Folha.ObterDadosAsync(Uid, meses[i]);
            Assert.Equivalent(uma, varias[i], strict: true);
        }

        Assert.Empty(await Folha.ObterVariosAsync(Uid, []));
    }
}
