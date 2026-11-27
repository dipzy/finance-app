using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Financas.Services.Tests;

// Apagar a conta e os dados (RGPD): nada do utilizador fica e os dados dos outros ficam
public class ApagarContaTests : TestesServicos
{
    private const string Ana = "ana";
    private const string Rui = "rui";
    private const string EmailUid = "diogo@exemplo.pt";
    private const string EmailAna = "ana@exemplo.pt";
    private const string EmailRui = "rui@exemplo.pt";

    private IApagarContaService Apagar => A.Servico<IApagarContaService>();
    private IGruposService Grupos => A.Servico<IGruposService>();
    private IPartilhadoService Partilha => A.Servico<IPartilhadoService>();
    private IPoupancasPartilhadasService Mealheiros => A.Servico<IPoupancasPartilhadasService>();
    private IPoupancasPartilhadasMembrosService Contribuicoes => A.Servico<IPoupancasPartilhadasMembrosService>();

    private async Task Entrar(string grupo, string dono, string uid, string email)
    {
        var convite = await Grupos.ConvidarAsync(dono, grupo, email);
        await Grupos.AceitarAsync(uid, email, convite);
    }

    private static DespesaPartilhadaPedido Jantar(string titulo, decimal valor, params string[] uids) =>
        new(titulo, valor, [.. uids.Select(u => new ParticipantePedido(u))]);

    /// <summary>Ids dos grupos que o cenário cria.</summary>
    private sealed record Cenario(string Casa, string Sozinho, string Antigo, string DoRui);

    // Dados pessoais de todos os tipos para o Uid e dados partilhados em quatro grupos
    private async Task<Cenario> PrepararAsync()
    {
        foreach (var uid in new[] { Uid, Ana, Rui })
        {
            await Conta.DefinirSaldoAsync(uid, 1000m);
        }

        // ---- Pessoal ----
        await A.Servico<IPerfilService>().GuardarAsync(Uid, new GuardarPerfilPedido(EmailUid, "Ana"));
        await GuardarSalario("1500", 1);
        var renda = await AdicionarFixa("Renda", 300, diaDebito: 3);
        await Fixas.DebitarAsync(Uid, renda, null);
        await AdicionarFixa("Seguro", 100, periodicidade: Periodicidade.Anual, mesAnual: 3);
        await AdicionarExtra("Café", 2);
        await AdicionarPoupanca("Férias", TipoContribuicao.Valor, "50", 100);
        await Dividas.AdicionarAsync(Uid, new NovaDividaPedido("Carro", 5000, "2026-01", renda));
        await A.Servico<IOrcamentosService>().AdicionarAsync(Uid, new NovoOrcamentoPedido("lazer", 50));
        await A.Servico<IObjetivosService>().AdicionarAsync(Uid, new NovoObjetivoPedido("Viagem", 1000, "2027-06", null, 100));
        await A.Servico<IGastosRecorrentesService>().AdicionarAsync(Uid, new NovoGastoRecorrentePedido("Ginásio", 20, Frequencia.Mensal));
        await A.Servico<IRegrasCategoriaService>().AdicionarAsync(Uid, new NovaRegraCategoriaPedido("padaria", "restauracao"));
        await Conta.CalcularSaldoDisponivelAsync(Uid); // regista o início do mês

        // Dados dos outros, para ver que não mudam
        await AdicionarExtraDe(Ana, "Almoço da Ana", 8);
        await AdicionarExtraDe(Rui, "Almoço do Rui", 9);

        // ---- Grupo "Casa": o Uid (admin), a Ana e o Rui ----
        var casa = await Grupos.CriarAsync(Uid, "Casa");
        await Entrar(casa, Uid, Ana, EmailAna);
        await Entrar(casa, Uid, Rui, EmailRui);
        await Partilha.CriarAceiteAsync(Uid, casa, Jantar("Jantar do Uid", 90m, Uid, Ana, Rui));
        await Partilha.CriarAceiteAsync(Ana, casa, Jantar("Cinema da Ana", 60m, Uid, Ana));
        await Partilha.CriarAcertoAsync(Ana, casa, new NovoAcertoPedido(Ana, Uid, 10m));
        var ferias = await Mealheiros.CriarAsync(Uid, casa, new NovaPoupancaPartilhadaPedido("Férias do grupo", 500m));
        await Mealheiros.ContribuirAsync(Uid, ferias, 30m);
        await Mealheiros.ContribuirAsync(Ana, ferias, 20m);
        await Contribuicoes.GuardarAsync(Uid, ferias, new NovaPoupancaPartilhadaMembroPedido(10m, TipoContribuicaoPartilhada.Automatica, DiaDoSalario: false, DiaFixo: 10));
        await Contribuicoes.GuardarAsync(Ana, ferias, new NovaPoupancaPartilhadaMembroPedido(15m));
        await Grupos.ConvidarAsync(Uid, casa, "pendente@exemplo.pt");

        // ---- Grupo só dele (com um mealheiro e uma despesa) ----
        var sozinho = await Grupos.CriarAsync(Uid, "Só eu");
        await Partilha.CriarAceiteAsync(Uid, sozinho, Jantar("Sozinho", 10m, Uid));
        var cofre = await Mealheiros.CriarAsync(Uid, sozinho, new NovaPoupancaPartilhadaPedido("Cofre"));
        await Mealheiros.ContribuirAsync(Uid, cofre, 5m);

        // ---- Grupo onde o Rui já saiu: o Uid fica sozinho ----
        var antigo = await Grupos.CriarAsync(Uid, "Antigo");
        await Entrar(antigo, Uid, Rui, EmailRui);
        await Partilha.CriarAceiteAsync(Uid, antigo, Jantar("Churrasco", 40m, Uid, Rui));
        await Partilha.CriarAcertoAsync(Rui, antigo, new NovoAcertoPedido(Rui, Uid, 20m));
        await Grupos.SairAsync(Rui, antigo);

        // ---- Grupo do Rui, que convidou o email do Uid (convite por aceitar) e outra pessoa ----
        var doRui = await Grupos.CriarAsync(Rui, "Do Rui");
        await Grupos.ConvidarAsync(Rui, doRui, EmailUid);
        await Grupos.ConvidarAsync(Rui, doRui, "x@exemplo.pt");

        // Dispositivos push e alertas já enviados
        await A.Servico<IDispositivosService>().RegistarAsync(Uid, new RegistarDispositivoPedido("ExponentPushToken[uid-um]", "android"));
        await A.Servico<IDispositivosService>().RegistarAsync(Ana, new RegistarDispositivoPedido("ExponentPushToken[ana-um]", "ios"));

        var db = A.Db();
        db.AlertasEnviados.Add(new AlertaEnviado { UtilizadorId = Uid, Chave = "orcamento-excedido:x:2026-10", Dia = new DateOnly(2026, 10, 5), EnviadoEm = A.Relogio.GetUtcNow() });
        await db.SaveChangesAsync();

        return new Cenario(casa, sozinho, antigo, doRui);
    }

    private Task<string> AdicionarExtraDe(string uid, string titulo, decimal valor) =>
        Extras.AdicionarAsync(uid, new NovaDespesaExtraPedido(titulo, valor, null));

    // Quantas linhas, em toda a base de dados, ainda dizem respeito a este uid
    private async Task<Dictionary<string, int>> ReferenciasAsync(string uid)
    {
        var db = A.Db();
        var r = new Dictionary<string, int>
        {
            ["Utilizadores"] = await db.Utilizadores.CountAsync(x => x.Id == uid),
            ["DespesasFixas"] = await db.DespesasFixas.CountAsync(x => x.UtilizadorId == uid),
            ["PagamentosFixas"] = await db.PagamentosFixas.CountAsync(x => x.UtilizadorId == uid),
            ["DespesasExtras"] = await db.DespesasExtras.CountAsync(x => x.UtilizadorId == uid),
            ["GastosRecorrentes"] = await db.GastosRecorrentes.CountAsync(x => x.UtilizadorId == uid),
            ["Poupancas"] = await db.Poupancas.CountAsync(x => x.UtilizadorId == uid),
            ["Dividas"] = await db.Dividas.CountAsync(x => x.UtilizadorId == uid),
            ["Meses"] = await db.Meses.CountAsync(x => x.UtilizadorId == uid),
            ["Orcamentos"] = await db.Orcamentos.CountAsync(x => x.UtilizadorId == uid),
            ["Objetivos"] = await db.Objetivos.CountAsync(x => x.UtilizadorId == uid),
            ["RegrasCategoria"] = await db.RegrasCategoria.CountAsync(x => x.UtilizadorId == uid),
            ["DispositivosPush"] = await db.DispositivosPush.CountAsync(x => x.UtilizadorId == uid),
            ["AlertasEnviados"] = await db.AlertasEnviados.CountAsync(x => x.UtilizadorId == uid),
            ["RegistosAlteracao"] = await db.RegistosAlteracao.CountAsync(x => x.UtilizadorId == uid),
            ["Convites"] = await db.ParceirosConvites.CountAsync(x => x.DeUid == uid),
            ["Grupos"] = await db.Grupos.CountAsync(x => x.CriadoPorUid == uid),
            ["GruposMembros"] = await db.GruposMembros.CountAsync(x => x.Uid == uid),
            ["ContribuicoesMealheiros"] = await db.PoupancasPartilhadasMembros.CountAsync(x => x.MembroUid == uid),
            ["MovimentosMealheiros"] = await db.MovimentosPoupancasPartilhadas.CountAsync(x => x.Uid == uid),
            ["DespesasPartilhadas"] = await db.DespesasPartilhadas.CountAsync(x => x.PagadorUid == uid),
            ["PartesDespesas"] = await db.PartesDespesasPartilhadas.CountAsync(x => x.Uid == uid),
            ["Acertos"] = await db.AcertosPartilhados.CountAsync(x => x.DeUid == uid || x.ParaUid == uid || x.CriadoPorUid == uid),
        };
        return r;
    }

    private async Task<int> LinhasDoMeuEmailAsync(string email) =>
        await A.Db().ParceirosConvites.CountAsync(c => c.Email == email);

    [Fact]
    public async Task Sem_a_confirmacao_nada_e_apagado()
    {
        await PrepararAsync();
        var antes = await ReferenciasAsync(Uid);

        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Apagar.ApagarAsync(Uid, null, null));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Apagar.ApagarAsync(Uid, null, ""));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Apagar.ApagarAsync(Uid, null, "apagar"));
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Apagar.ApagarAsync(Uid, null, "SIM"));

        Assert.Equal(antes, await ReferenciasAsync(Uid));
        Assert.True(antes["Utilizadores"] == 1 && antes["DespesasExtras"] > 0);
    }

    [Fact]
    public async Task Nada_do_utilizador_fica_em_lado_nenhum()
    {
        await PrepararAsync();
        var antes = await ReferenciasAsync(Uid);
        // O cenário tem mesmo dados de todos os tipos (senão o teste não provava nada)
        Assert.All(
            antes.Where(p => p.Key is not "Convites"),
            p => Assert.True(p.Value > 0, $"o cenário não tem {p.Key}"));

        await Apagar.ApagarAsync(Uid, null, "APAGAR");

        Assert.All(await ReferenciasAsync(Uid), p => Assert.True(p.Value == 0, $"ficaram {p.Value} linhas em {p.Key}"));
        // Os emails do utilizador também desaparecem dos convites dos outros
        Assert.Equal(0, await LinhasDoMeuEmailAsync(EmailUid));
    }

    [Fact]
    public async Task Os_dados_dos_outros_ficam_iguais()
    {
        await PrepararAsync();
        var anaAntes = await ReferenciasAsync(Ana);
        var ruiAntes = await ReferenciasAsync(Rui);
        var saldoAna = (await Conta.ObterAsync(Ana)).Saldo;
        var saldoRui = (await Conta.ObterAsync(Rui)).Saldo;
        var extrasAna = await Extras.ListarAsync(Ana, null);

        await Apagar.ApagarAsync(Uid, null, "APAGAR");

        // A Ana e o Rui continuam com tudo: o que mudou foi só o que era do grupo "Antigo" (desapareceu)
        // e as despesas partilhadas que o Uid pagou (as partes pessoais ficam)
        Assert.Equal(1, (await ReferenciasAsync(Ana))["Utilizadores"]);
        Assert.Equal(1, (await ReferenciasAsync(Rui))["Utilizadores"]);
        Assert.Equal(saldoAna, (await Conta.ObterAsync(Ana)).Saldo);
        Assert.Equal(saldoRui, (await Conta.ObterAsync(Rui)).Saldo);
        Assert.Equal(extrasAna.Select(e => e.Id).Order(), (await Extras.ListarAsync(Ana, null)).Select(e => e.Id).Order());
        var anaDepois = await ReferenciasAsync(Ana);
        Assert.Equal(anaAntes["DespesasExtras"], anaDepois["DespesasExtras"]);
        Assert.Equal(anaAntes["PartesDespesas"], anaDepois["PartesDespesas"]);
        Assert.Equal(anaAntes["Acertos"], anaDepois["Acertos"]); // o acerto Ana -> Uid continua
        Assert.Equal(anaAntes["ContribuicoesMealheiros"], anaDepois["ContribuicoesMealheiros"]);
        Assert.Equal(ruiAntes["DespesasExtras"], (await ReferenciasAsync(Rui))["DespesasExtras"]);
        Assert.Equal(1, anaDepois["DispositivosPush"]); // o dispositivo da Ana não se apaga
    }

    [Fact]
    public async Task O_grupo_com_mais_gente_fica_com_as_contas_certas_e_um_novo_admin()
    {
        var c = await PrepararAsync();
        var saldosAntes = await Partilha.SaldosAsync(Ana, c.Casa);

        await Apagar.ApagarAsync(Uid, null, "APAGAR");

        var casa = await Grupos.ObterAsync(Ana, c.Casa);
        Assert.NotNull(casa);
        Assert.Equal(RoleGrupo.Admin, casa!.MinhaRole); // a Ana entrou primeiro: herda o admin
        Assert.Equal(2, casa.TotalMembros);
        var membros = await Grupos.ListarMembrosAsync(Rui, c.Casa);
        Assert.Equal([Ana, Rui], membros.Select(m => m.Uid).Order());
        Assert.Equal(RoleGrupo.Membro, membros.Single(m => m.Uid == Rui).Role);

        // As contas dos outros não mudam: o que era devido ao Uid passa a ser devido a "Membro"
        var saldosDepois = await Partilha.SaldosAsync(Ana, c.Casa);
        Assert.Equal(saldosAntes.MeuSaldo, saldosDepois.MeuSaldo);
        Assert.Equal(0m, saldosDepois.Membros.Sum(m => m.Saldo));
        var fantasma = saldosDepois.Membros.Single(m => !m.Ativo);
        Assert.StartsWith("removido-", fantasma.Uid);
        Assert.Equal("Membro", fantasma.Nome);
        Assert.Equal(saldosAntes.Membros.Single(m => m.Uid == Uid).Saldo, fantasma.Saldo);

        // As despesas continuam, com quem pagou anónimo
        var despesas = await Partilha.AtividadeAsync(Ana, c.Casa, 50);
        Assert.Equal(2, despesas.Count(a => a.Tipo == TipoAtividade.Despesa));
        Assert.Contains(despesas, a => a.Uid.StartsWith("removido-", StringComparison.Ordinal) && a.Titulo == "Jantar do Uid");

        // O mealheiro mantém o dinheiro, e a contribuição da Ana continua
        var mealheiro = Assert.Single(await Mealheiros.ListarDoGrupoAsync(Ana, c.Casa));
        Assert.Equal(50m, mealheiro.Saldo);
        Assert.Single(await Contribuicoes.ListarDoMembroAsync(Ana));
        Assert.Empty(await Contribuicoes.ListarDoMembroAsync(Uid));
    }

    [Fact]
    public async Task Os_grupos_onde_so_ele_estava_ativo_desaparecem_e_as_partes_dos_outros_ficam_sem_ligacao()
    {
        var c = await PrepararAsync();
        var parteDoRui = Assert.Single(await Extras.ListarAsync(Rui, "2026-10"), e => e.Titulo == "Churrasco");
        Assert.NotNull(parteDoRui.DespesaPartilhadaId);

        await Apagar.ApagarAsync(Uid, null, "APAGAR");

        var db = A.Db();
        Assert.False(await db.Grupos.AnyAsync(g => g.Id == c.Sozinho));
        Assert.False(await db.Grupos.AnyAsync(g => g.Id == c.Antigo));
        Assert.False(await db.GruposMembros.AnyAsync(m => m.GrupoId == c.Sozinho || m.GrupoId == c.Antigo));
        Assert.False(await db.PoupancasPartilhadas.AnyAsync(p => p.GrupoId == c.Sozinho));
        Assert.False(await db.DespesasPartilhadas.AnyAsync(d => d.GrupoId == c.Sozinho || d.GrupoId == c.Antigo));
        Assert.False(await db.AcertosPartilhados.AnyAsync(a => a.GrupoId == c.Antigo));
        // A despesa pessoal do Rui (a parte do churrasco) continua, só que sem ligação ao grupo que desapareceu
        var depois = Assert.Single(await Extras.ListarAsync(Rui, "2026-10"), e => e.Titulo == "Churrasco");
        Assert.Null(depois.DespesaPartilhadaId);
    }

    [Fact]
    public async Task Os_convites_do_utilizador_e_para_o_email_dele_desaparecem_os_outros_ficam()
    {
        var c = await PrepararAsync();

        await Apagar.ApagarAsync(Uid, null, "APAGAR");

        var db = A.Db();
        Assert.False(await db.ParceirosConvites.AnyAsync(x => x.GrupoId == c.Casa && x.Email == "pendente@exemplo.pt"));
        Assert.False(await db.ParceirosConvites.AnyAsync(x => x.Email == EmailUid));
        Assert.True(await db.ParceirosConvites.AnyAsync(x => x.GrupoId == c.DoRui && x.Email == "x@exemplo.pt"));
        // Os convites aceites pela Ana e pelo Rui (do Uid) também foram embora: eram dele
        Assert.Equal(0, await db.ParceirosConvites.CountAsync(x => x.GrupoId == c.Casa));
    }

    [Fact]
    public async Task O_email_confirmado_do_token_tambem_limpa_convites()
    {
        var c = await PrepararAsync();
        await Grupos.ConvidarAsync(Rui, c.DoRui, "outro-email@exemplo.pt");

        await Apagar.ApagarAsync(Uid, "Outro-Email@exemplo.pt", "APAGAR");

        Assert.False(await A.Db().ParceirosConvites.AnyAsync(x => x.Email == "outro-email@exemplo.pt"));
    }

    [Fact]
    public async Task Um_utilizador_sem_dados_ou_apagado_duas_vezes_nao_da_erro()
    {
        await Apagar.ApagarAsync("ninguem", null, "APAGAR");

        await AdicionarExtra("Café", 2);
        await Apagar.ApagarAsync(Uid, null, "APAGAR");
        await Apagar.ApagarAsync(Uid, null, "APAGAR");

        Assert.All(await ReferenciasAsync(Uid), p => Assert.Equal(0, p.Value));
    }

    [Fact]
    public async Task Depois_de_apagar_o_utilizador_pode_voltar_a_comecar_do_zero()
    {
        await PrepararAsync();
        await Apagar.ApagarAsync(Uid, null, "APAGAR");

        Assert.Equal(0m, (await Conta.ObterAsync(Uid)).Saldo);
        Assert.Empty(await Extras.ListarAsync(Uid, null));
        Assert.Empty(await Grupos.ListarAsync(Uid));
        await AdicionarExtra("Café", 2);
        Assert.Equal(-2m, await GetSaldo());
    }

    [Fact]
    public async Task Se_ja_ha_outro_admin_ninguem_e_promovido()
    {
        var grupo = await Grupos.CriarAsync(Uid, "Casa");
        await Entrar(grupo, Uid, Rui, EmailRui);
        await Entrar(grupo, Uid, Ana, EmailAna);
        await Grupos.AlterarRoleAsync(Uid, grupo, Ana, RoleGrupo.Admin); // dois admins: o Uid pode sair sem passar nada

        await Apagar.ApagarAsync(Uid, null, "APAGAR");

        var membros = await Grupos.ListarMembrosAsync(Ana, grupo);
        Assert.Equal(RoleGrupo.Admin, membros.Single(m => m.Uid == Ana).Role);
        Assert.Equal(RoleGrupo.Membro, membros.Single(m => m.Uid == Rui).Role);
    }
}
