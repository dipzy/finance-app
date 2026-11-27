using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;

namespace Financas.Services.Tests;

// O registo de alterações cobre também os grupos: membros, despesas partilhadas, acertos, mealheiros
// (movimentos, contribuições e o próprio mealheiro)
public class AuditoriaPartilhadaTests : TestesServicos
{
    private const string Ana = "ana";

    private IGruposService Grupos => A.Servico<IGruposService>();
    private IPartilhadoService Partilha => A.Servico<IPartilhadoService>();
    private IPoupancasPartilhadasService Mealheiros => A.Servico<IPoupancasPartilhadasService>();

    private async Task<List<RegistoAlteracaoDto>> Registos(string uid, string entidade) =>
        [.. (await A.Servico<IAlteracoesService>().ListarAsync(uid, entidade, null, 1, 100)).Itens];

    private async Task<string> GrupoComAna()
    {
        var grupo = await Grupos.CriarAsync(Uid, "Casa");
        var convite = await Grupos.ConvidarAsync(Uid, grupo, "ana@exemplo.pt");
        await Grupos.AceitarAsync(Ana, "ana@exemplo.pt", convite);
        return grupo;
    }

    private static DespesaPartilhadaPedido Jantar(string titulo, decimal valor) =>
        new(titulo, valor, [new ParticipantePedido(Uid), new ParticipantePedido(Ana)]);

    [Fact]
    public async Task Criar_o_grupo_e_entrar_ficam_no_registo_de_quem_os_fez()
    {
        await GrupoComAna();

        var grupo = Assert.Single(await Registos(Uid, "Grupo"));
        Assert.Equal(AcaoAlteracao.Criada, grupo.Acao);
        Assert.Equal("Casa", grupo.Descricao);
        Assert.Equal(AcaoAlteracao.Criada, Assert.Single(await Registos(Ana, "GrupoMembro")).Acao); // a Ana entrou
        Assert.Equal(AcaoAlteracao.Criada, Assert.Single(await Registos(Uid, "GrupoMembro")).Acao); // o admin criou-se com o grupo
    }

    [Fact]
    public async Task Mudar_o_papel_e_sair_do_grupo_ficam_registados()
    {
        var grupo = await GrupoComAna();

        await Grupos.AlterarRoleAsync(Uid, grupo, Ana, RoleGrupo.Admin);
        await Grupos.SairAsync(Ana, grupo);

        var registos = await Registos(Ana, "GrupoMembro");
        Assert.Equal(3, registos.Count); // criada, papel mudado, saída
        Assert.Contains(registos, r => r.Acao == AcaoAlteracao.Alterada && r.Alteracoes!.Value.TryGetProperty("Role", out _));
        Assert.Contains(registos, r => r.Acao == AcaoAlteracao.Alterada && r.Alteracoes!.Value.TryGetProperty("SaidaEm", out _));
    }

    [Fact]
    public async Task Despesas_partilhadas_criar_alterar_e_apagar_ficam_registados_em_nome_de_quem_pagou()
    {
        var grupo = await GrupoComAna();
        await Conta.DefinirSaldoAsync(Uid, 500m);
        var id = await Partilha.CriarDespesaAsync(Uid, grupo, Jantar("Jantar", 60m));

        await Partilha.AlterarDespesaAsync(Uid, id, Jantar("Jantar de anos", 80m));
        await Partilha.RemoverDespesaAsync(Uid, id);

        var registos = await Registos(Uid, "DespesaPartilhada");
        Assert.Equal(
            [AcaoAlteracao.Apagada, AcaoAlteracao.Alterada, AcaoAlteracao.Criada],
            registos.Select(r => r.Acao)); // do mais recente para o mais antigo
        var alterada = registos.Single(r => r.Acao == AcaoAlteracao.Alterada);
        Assert.Equal("Jantar de anos", alterada.Descricao);
        Assert.Equal("Jantar", alterada.Alteracoes!.Value.GetProperty("Titulo").GetProperty("de").GetString());
        Assert.Equal(80m, alterada.Alteracoes!.Value.GetProperty("Valor").GetProperty("para").GetDecimal());
        Assert.Empty(await Registos(Ana, "DespesaPartilhada")); // a Ana não pagou
    }

    [Fact]
    public async Task Acertos_ficam_no_registo_de_quem_os_registou()
    {
        var grupo = await GrupoComAna();
        await Conta.DefinirSaldoAsync(Ana, 100m);
        await Partilha.CriarDespesaAsync(Uid, grupo, Jantar("Jantar", 60m));
        var acerto = await Partilha.CriarAcertoAsync(Ana, grupo, new NovoAcertoPedido(Ana, Uid, 30m));
        await Partilha.RemoverAcertoAsync(Ana, acerto);

        var registos = await Registos(Ana, "AcertoPartilhado");

        Assert.Equal([AcaoAlteracao.Apagada, AcaoAlteracao.Criada], registos.Select(r => r.Acao));
        Assert.Empty(await Registos(Uid, "AcertoPartilhado"));
    }

    [Fact]
    public async Task Mealheiros_o_movimento_a_contribuicao_e_o_proprio_mealheiro_ficam_registados()
    {
        var grupo = await GrupoComAna();
        await Conta.DefinirSaldoAsync(Uid, 500m);
        A.Origem.Utilizador = Uid; // como num pedido HTTP: quem faz o pedido
        var mealheiro = await Mealheiros.CriarAsync(Uid, grupo, new NovaPoupancaPartilhadaPedido("Férias", 500m));

        await Mealheiros.ContribuirAsync(Uid, mealheiro, 30m);
        await A.Servico<IPoupancasPartilhadasMembrosService>().GuardarAsync(Uid, mealheiro, new NovaPoupancaPartilhadaMembroPedido(10m));

        var movimento = Assert.Single(await Registos(Uid, "MovimentoPoupancaPartilhada"));
        Assert.Equal(AcaoAlteracao.Criada, movimento.Acao);
        Assert.Equal(30m, movimento.Alteracoes!.Value.GetProperty("Valor").GetProperty("para").GetDecimal());
        var registosMealheiro = await Registos(Uid, "PoupancaPartilhada");
        Assert.Contains(registosMealheiro, r => r.Acao == AcaoAlteracao.Criada && r.Descricao == "Férias");
        Assert.Contains(registosMealheiro, r => r.Acao == AcaoAlteracao.Alterada && r.Alteracoes!.Value.TryGetProperty("Saldo", out _));
        Assert.Equal(AcaoAlteracao.Criada, Assert.Single(await Registos(Uid, "PoupancaPartilhadaMembro")).Acao);
    }

    [Fact]
    public async Task Apagar_a_conta_nao_deixa_registos_de_alteracoes_nem_dos_grupos()
    {
        var grupo = await GrupoComAna();
        await Conta.DefinirSaldoAsync(Uid, 500m);
        await Partilha.CriarDespesaAsync(Uid, grupo, Jantar("Jantar", 60m));

        await A.Servico<IApagarContaService>().ApagarAsync(Uid, null, "APAGAR");

        Assert.Empty((await A.Servico<IAlteracoesService>().ListarAsync(Uid, null, null, 1, 100)).Itens);
        Assert.Equal(0, A.Db().RegistosAlteracao.Count(r => r.UtilizadorId == Uid));
    }
}
