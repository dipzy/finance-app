using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

// As contas puras da parte partilhada (Regras/Partilhado.cs): dividir e simplificar
public class PartilhadoRegrasTests
{
    private static Partilhado.Participante P(string uid, decimal? peso = null) => new(uid, peso);

    [Fact]
    public void Igual_os_centimos_que_sobram_vao_para_os_primeiros()
    {
        var partes = Partilhado.Dividir(10m, ModoDivisao.Igual, [P("a"), P("b"), P("c")]);

        Assert.Equal([3.34m, 3.33m, 3.33m], partes.Select(p => p.Valor));
        Assert.Equal(10m, partes.Sum(p => p.Valor));
    }

    [Fact]
    public void Percentagem_tem_de_somar_100()
    {
        var partes = Partilhado.Dividir(80m, ModoDivisao.Percentagem, [P("a", 75m), P("b", 25m)]);
        Assert.Equal([60m, 20m], partes.Select(p => p.Valor));

        Assert.Throws<PedidoInvalidoException>(() => Partilhado.Dividir(80m, ModoDivisao.Percentagem, [P("a", 70m), P("b", 20m)]));
    }

    [Fact]
    public void Valores_tem_de_dar_o_total()
    {
        var partes = Partilhado.Dividir(50m, ModoDivisao.Valores, [P("a", 30.5m), P("b", 19.5m)]);
        Assert.Equal([30.5m, 19.5m], partes.Select(p => p.Valor));

        var erro = Assert.Throws<PedidoInvalidoException>(() => Partilhado.Dividir(50m, ModoDivisao.Valores, [P("a", 30m), P("b", 10m)]));
        Assert.Contains("40.00", erro.Message);
    }

    [Fact]
    public void Partes_divide_pelo_peso_e_fecha_ao_centimo()
    {
        var partes = Partilhado.Dividir(100m, ModoDivisao.Partes, [P("a", 2m), P("b", 1m)]);

        Assert.Equal([66.67m, 33.33m], partes.Select(p => p.Valor));
    }

    [Fact]
    public void Nao_aceita_a_mesma_pessoa_duas_vezes_nem_divisao_vazia()
    {
        Assert.Throws<PedidoInvalidoException>(() => Partilhado.Dividir(10m, ModoDivisao.Igual, [P("a"), P("a")]));
        Assert.Throws<PedidoInvalidoException>(() => Partilhado.Dividir(10m, ModoDivisao.Igual, []));
        Assert.Throws<PedidoInvalidoException>(() => Partilhado.Dividir(10m, ModoDivisao.Partes, [P("a", 0m)]));
    }

    [Fact]
    public void Simplificar_usa_no_maximo_n_menos_1_pagamentos_e_zera_tudo()
    {
        var saldos = new Dictionary<string, decimal> { ["a"] = 60m, ["b"] = -10m, ["c"] = -20m, ["d"] = -30m };

        var t = Partilhado.Simplificar(saldos);

        Assert.True(t.Count <= 3);
        Assert.All(t, x => Assert.Equal("a", x.ParaUid));
        Assert.Equal(60m, t.Sum(x => x.Valor));
        Assert.Equal(new[] { "d", "c", "b" }, t.Select(x => x.DeUid));
    }

    [Fact]
    public void Saldos_somam_zero_e_contam_acertos()
    {
        var d = new DespesaPartilhada { Id = "d1", GrupoId = "g", Titulo = "Jantar", Mes = "2026-10", PagadorUid = "a", Valor = 90m };
        var partes = new[]
        {
            new ParteDespesaPartilhada { Id = "1", DespesaPartilhadaId = "d1", Uid = "a", Valor = 30m },
            new ParteDespesaPartilhada { Id = "2", DespesaPartilhadaId = "d1", Uid = "b", Valor = 30m },
            new ParteDespesaPartilhada { Id = "3", DespesaPartilhadaId = "d1", Uid = "c", Valor = 30m },
        };
        var acerto = new AcertoPartilhado { Id = "x", GrupoId = "g", DeUid = "b", ParaUid = "a", Valor = 30m, CriadoPorUid = "b" };

        var saldos = Partilhado.Saldos([d], partes, [acerto]);

        Assert.Equal(30m, saldos["a"]);
        Assert.Equal(0m, saldos["b"]);
        Assert.Equal(-30m, saldos["c"]);
        Assert.Equal(0m, saldos.Values.Sum());
    }
}

// Os cenários com base de dados: grupos, despesas partilhadas, acertos, mealheiros e o dinheiro nas contas
public class PartilhadoTests : TestesServicos
{
    private const string Ana = "ana";
    private const string Rui = "rui";
    private const string EmailAna = "ana@exemplo.pt";
    private const string EmailRui = "rui@exemplo.pt";

    private IGruposService Grupos => A.Servico<IGruposService>();
    private IPartilhadoService Partilha => A.Servico<IPartilhadoService>();
    private IPoupancasPartilhadasService Mealheiros => A.Servico<IPoupancasPartilhadasService>();
    private IPoupancasPartilhadasMembrosService Contribuicoes => A.Servico<IPoupancasPartilhadasMembrosService>();

    // Um grupo do Uid com a Ana e o Rui (convidados por email e aceites com o email confirmado)
    private async Task<string> GrupoDeTres()
    {
        var grupo = await Grupos.CriarAsync(Uid, "Casa");
        foreach (var (uid, email) in new[] { (Ana, EmailAna), (Rui, EmailRui) })
        {
            var convite = await Grupos.ConvidarAsync(Uid, grupo, email);
            await Grupos.AceitarAsync(uid, email, convite);
        }

        return grupo;
    }

    private Task<decimal> SaldoConta(string uid) => Conta.ObterAsync(uid).ContinueWith(t => t.Result.Saldo);

    private static DespesaPartilhadaPedido Jantar(decimal valor, params string[] uids) =>
        new("Jantar", valor, [.. uids.Select(u => new ParticipantePedido(u))]);

    [Fact]
    public async Task Despesa_partilhada_cobra_o_total_a_quem_pagou_e_cada_um_fica_com_a_sua_parte()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 500m);

        await Partilha.CriarAceiteAsync(Uid, grupo, Jantar(90m, Uid, Ana, Rui));

        // O dinheiro sai todo da conta de quem pagou; a Ana e o Rui ainda não pagaram nada
        Assert.Equal(410m, await SaldoConta(Uid));
        Assert.Equal(0m, await SaldoConta(Ana));

        // Nos gastos do mês cada um vê só a sua parte
        Assert.Equal(30m, await TotalExtras("2026-10"));
        var daAna = Assert.Single(await Extras.ListarAsync(Ana, "2026-10"));
        Assert.Equal(30m, daAna.Valor);
        Assert.NotNull(daAna.DespesaPartilhadaId);

        var saldos = await Partilha.SaldosAsync(Uid, grupo);
        Assert.Equal(60m, saldos.MeuSaldo);
        Assert.Equal(2, saldos.Transferencias.Count);
        Assert.All(saldos.Transferencias, t => Assert.Equal(Uid, t.ParaUid));
        Assert.Equal(90m, saldos.TotalGastoMes);
        Assert.Equal(30m, saldos.MinhaParteMes);
    }

    private Task<string> RendaDividida(string grupo, params string[] uids) =>
        Fixas.AdicionarAsync(
            Uid,
            new NovaDespesaFixaPedido("Renda", 800m, 1, null, null, null, null, new DivisaoFixaPedido(grupo, [.. uids.Select(u => new ParticipantePedido(u))])));

    [Fact]
    public async Task Fixa_dividida_cobra_o_total_mas_so_a_minha_parte_conta_e_o_grupo_fica_com_a_despesa()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 1000m);
        var id = await RendaDividida(grupo, Uid, Ana);

        // O valor da despesa é só a parte de quem a paga; o total fica guardado à parte
        var fixa = Assert.Single(await ListarFixas());
        Assert.Equal(400m, fixa.Valor);
        Assert.Equal(800m, fixa.ValorTotal);

        Assert.Equal(ResultadoDebito.Debitada, await Fixas.DebitarAsync(Uid, id));

        // Sai tudo da conta de quem pagou, mas no pagamento (e nos totais) só contam os 400
        Assert.Equal(200m, await SaldoConta(Uid));
        Assert.Equal(400m, Assert.Single(await PagamentosDoMes("2026-10")).Valor);

        // A Ana fica com a parte dela nos gastos e a dever 400 no grupo; quem paga não leva despesa pessoal (contava a dobrar)
        Assert.Equal(400m, Assert.Single(await Extras.ListarAsync(Ana, "2026-10")).Valor);
        Assert.Empty(await Extras.ListarAsync(Uid, "2026-10"));
        Assert.Equal(400m, (await Partilha.SaldosAsync(Uid, grupo)).MeuSaldo);
    }

    [Fact]
    public async Task Anular_o_pagamento_de_uma_fixa_dividida_devolve_o_total_e_tira_a_despesa_do_grupo()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 1000m);
        var id = await RendaDividida(grupo, Uid, Ana);
        await Fixas.DebitarAsync(Uid, id);

        Assert.True(await Fixas.AnularDebitoAsync(Uid, id));

        Assert.Equal(1000m, await SaldoConta(Uid));
        Assert.Empty(await PagamentosDoMes("2026-10"));
        Assert.Empty(await Extras.ListarAsync(Ana, "2026-10"));
        Assert.Equal(0m, (await Partilha.SaldosAsync(Uid, grupo)).MeuSaldo);
    }

    [Fact]
    public async Task Fixa_dividida_paga_sempre_o_valor_todo_e_a_despesa_so_se_mexe_nas_fixas()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 1000m);
        var id = await RendaDividida(grupo, Uid, Ana);

        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Fixas.DebitarParcialAsync(Uid, id, 100m));

        await Fixas.DebitarAsync(Uid, id);
        var atividade = await Partilha.AtividadeAsync(Uid, grupo, 10);
        var despesaId = Assert.Single(atividade, a => a.Tipo == TipoAtividade.Despesa).Id;
        Assert.True((await Partilha.ObterDespesaAsync(Uid, despesaId)).DaDespesaFixa);
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Partilha.RemoverDespesaAsync(Uid, despesaId));
    }

    [Fact]
    public async Task Fixa_dividida_exige_que_quem_paga_esteja_na_divisao_e_que_todos_sejam_do_grupo()
    {
        var grupo = await GrupoDeTres();

        await Assert.ThrowsAsync<PedidoInvalidoException>(() => RendaDividida(grupo, Ana, Rui));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => RendaDividida(grupo, Uid, "estranho"));
    }

    [Fact]
    public async Task Acertar_contas_tira_a_quem_paga_e_so_entra_em_quem_recebe_ao_confirmar()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);
        await Conta.DefinirSaldoAsync(Ana, 100m);
        await Partilha.CriarAceiteAsync(Uid, grupo, Jantar(60m, Uid, Ana));

        var acerto = await Partilha.CriarAcertoAsync(Ana, grupo, new NovoAcertoPedido(Ana, Uid, 30m));

        // Sai logo da Ana; o Uid ainda não confirmou, por isso nada entra na conta dele
        Assert.Equal(40m, await SaldoConta(Uid)); // 100 - 60
        Assert.Equal(70m, await SaldoConta(Ana));
        Assert.Equal(0m, (await Partilha.SaldosAsync(Ana, grupo)).MeuSaldo);
        var pendente = (await Partilha.AtividadeAsync(Uid, grupo, 50)).Single(a => a.Tipo == TipoAtividade.Acerto);
        Assert.False(pendente.Confirmado);
        Assert.True(pendente.PodeConfirmar);

        // Quem recebe vê um alerta (que abre o grupo) até confirmar; quem pagou não vê nada
        var alertas = A.Servico<IAlertasService>();
        var alerta = Assert.Single(await alertas.ListarAsync(Uid), a => a.Tipo == TipoAlerta.AcertoPorConfirmar);
        Assert.Equal(grupo, alerta.Referencia);
        Assert.DoesNotContain(await alertas.ListarAsync(Ana), a => a.Tipo == TipoAlerta.AcertoPorConfirmar);

        // Só quem recebe confirma (e confirmar duas vezes não conta duas)
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Partilha.ConfirmarAcertoAsync(Ana, acerto));
        await Partilha.ConfirmarAcertoAsync(Uid, acerto);
        await Partilha.ConfirmarAcertoAsync(Uid, acerto);
        Assert.Equal(70m, await SaldoConta(Uid));
        var confirmado = (await Partilha.AtividadeAsync(Uid, grupo, 50)).Single(a => a.Tipo == TipoAtividade.Acerto);
        Assert.True(confirmado.Confirmado);
        Assert.False(confirmado.PodeConfirmar);
        Assert.DoesNotContain(await alertas.ListarAsync(Uid), a => a.Tipo == TipoAlerta.AcertoPorConfirmar);

        // Apagar o acerto desfaz tudo
        await Partilha.RemoverAcertoAsync(Ana, acerto);
        Assert.Equal(40m, await SaldoConta(Uid));
        Assert.Equal(100m, await SaldoConta(Ana));
        Assert.Equal(-30m, (await Partilha.SaldosAsync(Ana, grupo)).MeuSaldo);
    }

    [Fact]
    public async Task Quem_tem_a_parte_por_aceitar_ve_no_sino_quanto_deve_ate_responder()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);
        var alertas = A.Servico<IAlertasService>();

        var id = await Partilha.CriarDespesaAsync(Uid, grupo, Jantar(60m, Uid, Ana));

        // A Ana vê quanto deve (e o alerta abre o grupo); quem pagou e quem não participa não veem nada
        var alerta = Assert.Single(await alertas.ListarAsync(Ana), a => a.Tipo == TipoAlerta.DespesaPartilhadaPorAceitar);
        Assert.Equal(grupo, alerta.Referencia);
        Assert.Contains("30", alerta.Titulo);
        Assert.Contains("Jantar", alerta.Mensagem);
        Assert.DoesNotContain(await alertas.ListarAsync(Uid), a => a.Tipo == TipoAlerta.DespesaPartilhadaPorAceitar);
        Assert.DoesNotContain(await alertas.ListarAsync(Rui), a => a.Tipo == TipoAlerta.DespesaPartilhadaPorAceitar);

        // Ao aceitar (ou recusar) o alerta desaparece
        await Partilha.AceitarDespesaAsync(Ana, id);
        Assert.DoesNotContain(await alertas.ListarAsync(Ana), a => a.Tipo == TipoAlerta.DespesaPartilhadaPorAceitar);
    }

    [Fact]
    public async Task A_despesa_guarda_o_saldo_do_meio_de_pagamento_antes_de_o_debitar()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);

        var id = await Partilha.CriarAceiteAsync(Uid, grupo, Jantar(60m, Uid, Ana));

        Assert.Equal(100m, (await Partilha.ObterDespesaAsync(Uid, id)).SaldoAntes);
        Assert.Equal(40m, await SaldoConta(Uid));
        // A parte do pagador nos gastos do mês também mostra o saldo de antes
        Assert.Equal(100m, Assert.Single(await ExtrasDoMes("2026-10")).SaldoAntes);
    }

    [Fact]
    public async Task Os_outros_membros_recebem_uma_notificacao_ao_criar_alterar_e_apagar_a_despesa_e_nos_acertos()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);
        var dispositivos = A.Servico<IDispositivosService>();
        await dispositivos.RegistarAsync(Ana, new RegistarDispositivoPedido("ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]", "android", "pt"));
        await dispositivos.RegistarAsync(Uid, new RegistarDispositivoPedido("ExponentPushToken[uuuuuuuuuuuuuuuuuuuuuu]", "android", "pt"));

        var id = await Partilha.CriarDespesaAsync(Uid, grupo, Jantar(60m, Uid, Ana));
        var criada = Assert.Single(A.Expo.Enviadas);
        Assert.Equal("ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]", criada.Token); // quem pagou não é avisado
        Assert.Equal("Nova despesa partilhada", criada.Titulo);

        await Partilha.AlterarDespesaAsync(Uid, id, Jantar(50m, Uid, Ana));
        Assert.Equal("Despesa partilhada alterada", A.Expo.Enviadas[^1].Titulo);

        await Partilha.RemoverDespesaAsync(Uid, id);
        Assert.Equal("Despesa partilhada apagada", A.Expo.Enviadas[^1].Titulo);

        // O acerto avisa quem recebe; a confirmação avisa quem pagou
        var acerto = await Partilha.CriarAcertoAsync(Ana, grupo, new NovoAcertoPedido(Ana, Uid, 10m));
        Assert.Equal("ExponentPushToken[uuuuuuuuuuuuuuuuuuuuuu]", A.Expo.Enviadas[^1].Token);
        Assert.Equal("Confirma que recebeste", A.Expo.Enviadas[^1].Titulo);
        await Partilha.ConfirmarAcertoAsync(Uid, acerto);
        Assert.Equal("ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]", A.Expo.Enviadas[^1].Token);
        Assert.Equal("Pagamento confirmado", A.Expo.Enviadas[^1].Titulo);
    }

    [Fact]
    public async Task Alterar_a_despesa_depois_de_o_acerto_confirmado_so_mexe_na_diferenca()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);
        await Conta.DefinirSaldoAsync(Ana, 100m);
        var id = await Partilha.CriarAceiteAsync(Uid, grupo, Jantar(60m, Uid, Ana)); // Uid: 40
        var acerto = await Partilha.CriarAcertoAsync(Ana, grupo, new NovoAcertoPedido(Ana, Uid, 30m));
        await Partilha.ConfirmarAcertoAsync(Uid, acerto); // Uid: 70, Ana: 70

        await Partilha.AlterarDespesaAsync(Uid, id, Jantar(50m, Uid, Ana)); // a parte de cada um passa a 25
        await Partilha.AceitarDespesaAsync(Ana, id); // a parte dela mudou: aceita outra vez

        // O Uid só ganha os 10 € de diferença (não paga os 50 € de novo) e o dinheiro já recebido não mexe
        Assert.Equal(80m, await SaldoConta(Uid));
        Assert.Equal(70m, await SaldoConta(Ana));
        // A Ana pagou 30 mas só devia 25: o grupo passa a dever-lhe 5
        Assert.Equal(5m, (await Partilha.SaldosAsync(Ana, grupo)).MeuSaldo);
    }

    [Fact]
    public async Task Uma_parte_por_aceitar_nao_conta_nos_gastos_nem_no_saldo_do_grupo()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);

        var id = await Partilha.CriarDespesaAsync(Uid, grupo, Jantar(60m, Uid, Ana));

        // O dinheiro saiu logo da conta de quem pagou, mas a Ana ainda não aceitou: nada conta para ela
        Assert.Equal(40m, await SaldoConta(Uid));
        Assert.Equal(0m, (await Partilha.SaldosAsync(Uid, grupo)).MeuSaldo);
        Assert.Empty(await Extras.ListarAsync(Ana, "2026-10"));
        var daAna = (await Partilha.AtividadeAsync(Ana, grupo, 50)).Single();
        Assert.Equal(EstadoParte.Pendente, daAna.MeuEstado);
        Assert.Equal(0m, daAna.Efeito);

        await Partilha.AceitarDespesaAsync(Ana, id);

        Assert.Equal(30m, (await Partilha.SaldosAsync(Uid, grupo)).MeuSaldo);
        Assert.Equal(-30m, (await Partilha.SaldosAsync(Ana, grupo)).MeuSaldo);
        Assert.Equal(30m, Assert.Single(await Extras.ListarAsync(Ana, "2026-10")).Valor);
        Assert.Equal(40m, await SaldoConta(Uid)); // aceitar não mexe no dinheiro

        // Só quem participa responde, e uma resposta dada não se muda
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Partilha.AceitarDespesaAsync(Rui, id));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Partilha.RecusarDespesaAsync(Ana, id));
    }

    [Fact]
    public async Task Quando_alguem_recusa_a_parte_dele_reparte_se_e_o_que_ja_foi_acertado_conta()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);
        await Conta.DefinirSaldoAsync(Ana, 100m);
        var id = await Partilha.CriarDespesaAsync(Uid, grupo, Jantar(30m, Uid, Ana, Rui)); // 10 a cada um
        await Partilha.AceitarDespesaAsync(Ana, id);
        await Partilha.CriarAcertoAsync(Ana, grupo, new NovoAcertoPedido(Ana, Uid, 10m)); // a Ana já pagou os 10

        await Partilha.RecusarDespesaAsync(Rui, id); // passam a ser 15 cada um

        // A Ana já pagou 10 dos 15: faltam 5. O Uid tem a receber esses 5
        Assert.Equal(-5m, (await Partilha.SaldosAsync(Ana, grupo)).MeuSaldo);
        Assert.Equal(5m, (await Partilha.SaldosAsync(Uid, grupo)).MeuSaldo);
        Assert.Equal(15m, Assert.Single(await Extras.ListarAsync(Ana, "2026-10")).Valor);
        Assert.Equal(15m, Assert.Single(await ExtrasDoMes("2026-10")).Valor);
        Assert.Empty(await Extras.ListarAsync(Rui, "2026-10"));

        var despesa = await Partilha.ObterDespesaAsync(Uid, id);
        Assert.Equal(15m, despesa.Partes.Single(p => p.Uid == Ana).ValorEfetivo);
        var rui = despesa.Partes.Single(p => p.Uid == Rui);
        Assert.Equal(EstadoParte.Recusada, rui.Estado);
        Assert.Null(rui.ValorEfetivo);
    }

    [Fact]
    public async Task Se_todos_recusarem_a_despesa_fica_so_para_quem_pagou()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);
        var id = await Partilha.CriarDespesaAsync(Uid, grupo, Jantar(60m, Uid, Ana));

        await Partilha.RecusarDespesaAsync(Ana, id);

        Assert.Equal(60m, Assert.Single(await ExtrasDoMes("2026-10")).Valor);
        Assert.Equal(0m, (await Partilha.SaldosAsync(Uid, grupo)).MeuSaldo);
        Assert.Equal(40m, await SaldoConta(Uid));
    }

    [Fact]
    public async Task Apagar_um_acerto_por_confirmar_so_devolve_o_dinheiro_a_quem_pagou()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);
        await Conta.DefinirSaldoAsync(Ana, 100m);
        var acerto = await Partilha.CriarAcertoAsync(Ana, grupo, new NovoAcertoPedido(Ana, Uid, 30m));

        await Partilha.RemoverAcertoAsync(Ana, acerto);

        Assert.Equal(100m, await SaldoConta(Uid));
        Assert.Equal(100m, await SaldoConta(Ana));
    }

    [Fact]
    public async Task So_quem_paga_regista_o_acerto()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Ana, 100m);

        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Partilha.CriarAcertoAsync(Uid, grupo, new NovoAcertoPedido(Ana, Rui, 10m)));
        // Quem recebe não pode dizer que o outro lhe pagou: isso tirava dinheiro da conta do outro
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Partilha.CriarAcertoAsync(Uid, grupo, new NovoAcertoPedido(Ana, Uid, 10m)));
        Assert.Equal(100m, await SaldoConta(Ana));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Partilha.CriarAcertoAsync(Uid, grupo, new NovoAcertoPedido(Uid, Uid, 10m)));
    }

    [Fact]
    public async Task Apagar_a_despesa_devolve_o_dinheiro_e_apaga_as_partes_pessoais()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);
        var id = await Partilha.CriarAceiteAsync(Uid, grupo, Jantar(60m, Uid, Ana, Rui));

        await Partilha.RemoverDespesaAsync(Uid, id);

        Assert.Equal(100m, await SaldoConta(Uid));
        Assert.Empty(await Extras.ListarAsync(Uid, "2026-10"));
        Assert.Empty(await Extras.ListarAsync(Ana, "2026-10"));
        Assert.Equal(0m, (await Partilha.SaldosAsync(Uid, grupo)).MeuSaldo);
    }

    [Fact]
    public async Task Alterar_a_despesa_refaz_a_divisao_e_o_dinheiro()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);
        var id = await Partilha.CriarAceiteAsync(Uid, grupo, Jantar(60m, Uid, Ana, Rui));

        await Partilha.AlterarDespesaAsync(Uid, id, new DespesaPartilhadaPedido(
            "Jantar de anos", 80m, [new ParticipantePedido(Uid, 25m), new ParticipantePedido(Ana, 75m)], ModoDivisao.Percentagem));
        // A parte da Ana mudou: tem de a aceitar outra vez
        await Partilha.AceitarDespesaAsync(Ana, id);

        Assert.Equal(20m, await SaldoConta(Uid));
        var despesa = await Partilha.ObterDespesaAsync(Ana, id);
        Assert.Equal(2, despesa.Partes.Count);
        Assert.Equal(60m, despesa.Partes.Single(p => p.Uid == Ana).Valor);
        Assert.Empty(await Extras.ListarAsync(Rui, "2026-10"));
        Assert.Equal("Jantar de anos", Assert.Single(await Extras.ListarAsync(Ana, "2026-10")).Titulo);
        Assert.Equal(60m, (await Partilha.SaldosAsync(Uid, grupo)).MeuSaldo);

        // Só quem pagou altera
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Partilha.AlterarDespesaAsync(Ana, id, Jantar(10m, Ana)));
    }

    [Fact]
    public async Task A_parte_pessoal_nao_se_apaga_nem_muda_de_valor_nos_gastos()
    {
        var grupo = await GrupoDeTres();
        await Partilha.CriarAceiteAsync(Uid, grupo, Jantar(60m, Uid, Ana));
        var minha = Assert.Single(await ExtrasDoMes("2026-10"));

        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Extras.RemoverAsync(Uid, minha.Id));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() =>
            Extras.AlterarAsync(Uid, minha.Id, new AlterarDespesaExtraPedido(null, 1m, null)));

        // O título e a categoria são pessoais: podem mudar
        await Extras.AlterarAsync(Uid, minha.Id, new AlterarDespesaExtraPedido("Jantar com a Ana", minha.Valor, minha.Data, "restauracao"));
        Assert.Equal("Jantar com a Ana", Assert.Single(await ExtrasDoMes("2026-10")).Titulo);
    }

    [Fact]
    public async Task Uma_despesa_pessoal_passa_a_partilhada_sem_cobrar_duas_vezes()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);
        var pessoal = await AdicionarExtra("Supermercado", 40m);
        Assert.Equal(60m, await SaldoConta(Uid));

        await Partilha.CriarAceiteAsync(Uid, grupo, new DespesaPartilhadaPedido(
            "Supermercado", 40m, [new ParticipantePedido(Uid), new ParticipantePedido(Ana)], DespesaExtraId: pessoal));

        Assert.Equal(60m, await SaldoConta(Uid));
        var minha = Assert.Single(await ExtrasDoMes("2026-10"));
        Assert.Equal(20m, minha.Valor);
        Assert.NotEqual(pessoal, minha.Id);
    }

    [Fact]
    public async Task So_se_divide_com_membros_do_grupo()
    {
        var grupo = await GrupoDeTres();

        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Partilha.CriarAceiteAsync(Uid, grupo, Jantar(10m, Uid, "estranho")));
        await Assert.ThrowsAsync<NaoEncontradoException>(() => Partilha.CriarAceiteAsync("estranho", grupo, Jantar(10m, "estranho")));
    }

    [Fact]
    public async Task Quem_e_removido_perde_o_acesso_ao_grupo()
    {
        var grupo = await GrupoDeTres();
        await Grupos.RemoverMembroAsync(Uid, grupo, Rui);

        Assert.Null(await Grupos.ObterAsync(Rui, grupo));
        Assert.Empty(await Grupos.ListarAsync(Rui));
        await Assert.ThrowsAsync<NaoEncontradoException>(() => Partilha.SaldosAsync(Rui, grupo));
        await Assert.ThrowsAsync<NaoEncontradoException>(() => Grupos.ConvidarAsync(Rui, grupo, "outro@exemplo.pt"));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Partilha.CriarAceiteAsync(Uid, grupo, Jantar(10m, Uid, Rui)));
        Assert.Equal(2, (await Grupos.ListarMembrosAsync(Uid, grupo)).Count);
    }

    [Fact]
    public async Task Os_convites_so_valem_com_o_email_confirmado_do_token()
    {
        var grupo = await Grupos.CriarAsync(Uid, "Casa");
        var convite = await Grupos.ConvidarAsync(Uid, grupo, "Ana@Exemplo.pt ");

        // Sem email confirmado não se vê nem se aceita nada
        Assert.False((await Grupos.ListarConvitesRecebidosAsync(Ana, null)).EmailConfirmado);
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Grupos.AceitarAsync(Ana, null, convite));

        // Outro email (mesmo que o perfil diga o da Ana) não chega ao convite
        Assert.Empty((await Grupos.ListarConvitesRecebidosAsync(Rui, EmailRui)).Convites);
        await Assert.ThrowsAsync<NaoEncontradoException>(() => Grupos.AceitarAsync(Rui, EmailRui, convite));

        var recebido = Assert.Single((await Grupos.ListarConvitesRecebidosAsync(Ana, EmailAna)).Convites);
        Assert.Equal("Casa", recebido.GrupoNome);
        await Grupos.AceitarAsync(Ana, EmailAna, convite);
        Assert.Single(await Grupos.ListarAsync(Ana));
    }

    [Fact]
    public async Task Nao_se_apaga_o_grupo_com_contas_por_acertar_nem_dinheiro_nos_mealheiros()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);
        await Partilha.CriarAceiteAsync(Uid, grupo, Jantar(20m, Uid, Ana));

        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Grupos.RemoverAsync(Uid, grupo));

        await Partilha.CriarAcertoAsync(Ana, grupo, new NovoAcertoPedido(Ana, Uid, 10m));
        var mealheiro = await Mealheiros.CriarAsync(Uid, grupo, new NovaPoupancaPartilhadaPedido("Férias"));
        await Mealheiros.ContribuirAsync(Uid, mealheiro, 5m);
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Grupos.RemoverAsync(Uid, grupo));

        await Mealheiros.LevantarAsync(Uid, mealheiro, 5m);
        await Grupos.RemoverAsync(Uid, grupo);

        Assert.Empty(await Grupos.ListarAsync(Uid));
        // As partes pessoais ficam no histórico, já sem ligação (e podem ser apagadas)
        var minha = Assert.Single(await ExtrasDoMes("2026-10"));
        Assert.Null(minha.DespesaPartilhadaId);
    }

    [Fact]
    public async Task A_contribuicao_mensal_do_mealheiro_que_falta_por_entra_na_previsao_do_mes()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 1000m);
        var mealheiro = await Mealheiros.CriarAsync(Uid, grupo, new NovaPoupancaPartilhadaPedido("Presentes"));
        // Manual: 30 € por mês, à mão
        await Contribuicoes.GuardarAsync(Uid, mealheiro, new NovaPoupancaPartilhadaMembroPedido(30m));

        var antes = await Conta.CalcularSaldosAsync(Uid, null);
        Assert.Equal((1000m, 30m, 970m), (antes.Disponivel, antes.PoupancasPorEnviar, antes.Previsto));
        Assert.False(Assert.Single(await Contribuicoes.ListarDaPoupancaAsync(Uid, mealheiro)).FeitaEsteMes);

        // Pôr parte do valor: só o que falta continua no previsto
        await Mealheiros.ContribuirAsync(Uid, mealheiro, 10m);
        var parcial = await Conta.CalcularSaldosAsync(Uid, null);
        Assert.Equal((990m, 20m, 970m), (parcial.Disponivel, parcial.PoupancasPorEnviar, parcial.Previsto));

        // Pôr o resto: feita, já não conta (o dinheiro já saiu da conta)
        await Mealheiros.ContribuirAsync(Uid, mealheiro, 20m);
        var feita = await Conta.CalcularSaldosAsync(Uid, null);
        Assert.Equal((970m, 0m, 970m), (feita.Disponivel, feita.PoupancasPorEnviar, feita.Previsto));
        Assert.True(Assert.Single(await Contribuicoes.ListarDaPoupancaAsync(Uid, mealheiro)).FeitaEsteMes);
    }

    [Fact]
    public async Task Marcar_a_contribuicao_manual_como_feita_tira_a_do_previsto_sem_mexer_no_dinheiro()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 1000m);
        var mealheiro = await Mealheiros.CriarAsync(Uid, grupo, new NovaPoupancaPartilhadaPedido("Presentes"));
        await Contribuicoes.GuardarAsync(Uid, mealheiro, new NovaPoupancaPartilhadaMembroPedido(30m));

        await Contribuicoes.MarcarFeitaAsync(Uid, mealheiro, true);
        var marcada = await Conta.CalcularSaldosAsync(Uid, null);
        Assert.Equal((1000m, 0m, 1000m), (marcada.Disponivel, marcada.PoupancasPorEnviar, marcada.Previsto));
        Assert.True(Assert.Single(await Contribuicoes.ListarDaPoupancaAsync(Uid, mealheiro)).FeitaEsteMes);

        await Contribuicoes.MarcarFeitaAsync(Uid, mealheiro, false);
        Assert.Equal(30m, (await Conta.CalcularSaldosAsync(Uid, null)).PoupancasPorEnviar);

        // Sem contribuição não há o que marcar; nas automáticas também não (fazem-se sozinhas)
        await Assert.ThrowsAsync<NaoEncontradoException>(() => Contribuicoes.MarcarFeitaAsync(Ana, mealheiro, true));
        await Contribuicoes.GuardarAsync(Uid, mealheiro, new NovaPoupancaPartilhadaMembroPedido(30m, TipoContribuicaoPartilhada.Automatica, DiaDoSalario: false, DiaFixo: 28));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Contribuicoes.MarcarFeitaAsync(Uid, mealheiro, true));
        // Automática que ainda não chegou ao dia: também falta pôr este mês
        Assert.Equal(30m, (await Conta.CalcularSaldosAsync(Uid, null)).PoupancasPorEnviar);
    }

    [Fact]
    public async Task O_ultimo_admin_nao_sai_sem_passar_o_admin()
    {
        var grupo = await GrupoDeTres();

        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Grupos.SairAsync(Uid, grupo));

        await Grupos.AlterarRoleAsync(Uid, grupo, Ana, RoleGrupo.Admin);
        await Grupos.SairAsync(Uid, grupo);
        Assert.Empty(await Grupos.ListarAsync(Uid));
    }

    [Fact]
    public async Task Mealheiro_contribuir_e_levantar_mexem_na_conta_e_contam_por_pessoa()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);
        await Conta.DefinirSaldoAsync(Ana, 100m);
        var id = await Mealheiros.CriarAsync(Uid, grupo, new NovaPoupancaPartilhadaPedido("Férias", 1000m));

        await Mealheiros.ContribuirAsync(Uid, id, 50m);
        await Mealheiros.ContribuirAsync(Ana, id, 20m);
        await Mealheiros.LevantarAsync(Uid, id, 5m);
        // Só o admin levanta: a Ana é membro e o dinheiro não lhe sai da conta nem do mealheiro
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Mealheiros.LevantarAsync(Ana, id, 5m));

        var m = await Mealheiros.ObterAsync(Rui, id);
        Assert.Equal(65m, m.Saldo);
        Assert.Equal(1000m, m.Objetivo);
        Assert.Equal(45m, m.Contribuidores.Single(c => c.Uid == Uid).Total);
        Assert.Equal(20m, m.Contribuidores.Single(c => c.Uid == Ana).Total);
        Assert.Equal(55m, await SaldoConta(Uid));
        Assert.Equal(80m, await SaldoConta(Ana));

        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Mealheiros.LevantarAsync(Uid, id, 100m));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Mealheiros.RemoverAsync(Uid, id));
    }

    [Fact]
    public async Task Contribuicao_automatica_no_dia_fixo_so_uma_vez_por_mes_e_com_dinheiro()
    {
        var grupo = await GrupoDeTres();
        var id = await Mealheiros.CriarAsync(Uid, grupo, new NovaPoupancaPartilhadaPedido("Férias"));
        await Contribuicoes.GuardarAsync(Uid, id, new NovaPoupancaPartilhadaMembroPedido(30m, TipoContribuicaoPartilhada.Automatica, DiaDoSalario: false, DiaFixo: 10));

        // Antes do dia: nada
        Assert.Equal(0m, await Contribuicoes.ProcessarContribuicoesAutomaticasAsync(Uid));

        // No dia, sem dinheiro na conta: nada (tenta nos dias seguintes)
        HojeE(2026, 10, 10);
        Assert.Equal(0m, await Contribuicoes.ProcessarContribuicoesAutomaticasAsync(Uid));

        // Depois do dia, já com dinheiro: contribui uma vez
        await Conta.DefinirSaldoAsync(Uid, 100m);
        HojeE(2026, 10, 12);
        Assert.Equal(30m, await Contribuicoes.ProcessarContribuicoesAutomaticasAsync(Uid));
        Assert.Equal(0m, await Contribuicoes.ProcessarContribuicoesAutomaticasAsync(Uid));
        Assert.Equal(70m, await SaldoConta(Uid));
        Assert.Equal(30m, (await Mealheiros.ObterAsync(Uid, id)).Saldo);

        // E também com o cálculo do saldo disponível, no mês seguinte
        HojeE(2026, 11, 10);
        await CalcularSaldoDisponivel();
        Assert.Equal(60m, (await Mealheiros.ObterAsync(Uid, id)).Saldo);
    }

    [Fact]
    public async Task Contribuicao_automatica_nova_com_o_dia_ja_passado_comeca_no_mes_seguinte()
    {
        var grupo = await GrupoDeTres();
        await Conta.DefinirSaldoAsync(Uid, 100m);
        var id = await Mealheiros.CriarAsync(Uid, grupo, new NovaPoupancaPartilhadaPedido("Férias"));

        await Contribuicoes.GuardarAsync(Uid, id, new NovaPoupancaPartilhadaMembroPedido(30m, TipoContribuicaoPartilhada.Automatica, DiaDoSalario: false, DiaFixo: 1));

        Assert.Equal(0m, await Contribuicoes.ProcessarContribuicoesAutomaticasAsync(Uid));
        Assert.Single(await Contribuicoes.ListarDaPoupancaAsync(Ana, id)); // todos veem as contribuições
    }

    [Fact]
    public async Task Resumo_junta_os_grupos_a_minha_parte_do_mes_e_os_mealheiros()
    {
        var grupo = await GrupoDeTres();
        var outro = await Grupos.CriarAsync(Ana, "Férias");
        var convite = await Grupos.ConvidarAsync(Ana, outro, "eu@exemplo.pt");
        await Grupos.AceitarAsync(Uid, "eu@exemplo.pt", convite);
        await Conta.DefinirSaldoAsync(Uid, 500m);
        await Conta.DefinirSaldoAsync(Ana, 500m);

        await Partilha.CriarAceiteAsync(Uid, grupo, Jantar(90m, Uid, Ana, Rui)); // recebo 60
        await Partilha.CriarAceiteAsync(Ana, outro, Jantar(40m, Uid, Ana));       // devo 20
        var mealheiro = await Mealheiros.CriarAsync(Uid, grupo, new NovaPoupancaPartilhadaPedido("Casa nova"));
        await Mealheiros.ContribuirAsync(Uid, mealheiro, 25m);

        var resumo = await Partilha.ResumoAsync(Uid, null, null);

        Assert.Equal("2026-10", resumo.Mes);
        Assert.Equal(60m, resumo.AReceber);
        Assert.Equal(20m, resumo.APagar);
        Assert.Equal(50m, resumo.MinhaParteMes);
        Assert.Equal(90m, resumo.PagoPorMimMes);
        Assert.Equal(2, resumo.Grupos.Count);
        var m = Assert.Single(resumo.Mealheiros);
        Assert.Equal(25m, m.MeuMes);
        Assert.Equal("Casa", m.GrupoNome);
    }

    [Fact]
    public async Task Atividade_mostra_o_efeito_no_meu_saldo()
    {
        var grupo = await GrupoDeTres();
        await Partilha.CriarAceiteAsync(Uid, grupo, Jantar(90m, Uid, Ana, Rui));
        await Partilha.CriarAcertoAsync(Ana, grupo, new NovoAcertoPedido(Ana, Uid, 30m));

        var daAna = await Partilha.AtividadeAsync(Ana, grupo, 50);

        Assert.Equal(2, daAna.Count);
        var despesa = daAna.Single(a => a.Tipo == TipoAtividade.Despesa);
        Assert.Equal(-30m, despesa.Efeito);
        Assert.False(despesa.PodeApagar);
        var acerto = daAna.Single(a => a.Tipo == TipoAtividade.Acerto);
        Assert.Equal(30m, acerto.Efeito);
        Assert.True(acerto.PodeApagar);
    }
}
