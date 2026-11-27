using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Financas.Services.Tests.Postgres;

// Apagar a conta (ExecuteDelete/ExecuteUpdate, só comprovados de verdade em PostgreSQL), os dispositivos
// push (índice único do token) e as regras de categorização, contra um PostgreSQL a sério
[Collection(ColecaoPostgres.Nome)]
[Trait(ColecaoPostgres.Trait, ColecaoPostgres.Nome)]
public class ApagarContaEAlertasPostgresTests(PostgresFixture postgres) : TestesServicosPostgres(postgres)
{
    private const string Ana = "ana";

    [FactPostgres]
    public async Task Apagar_a_conta_apaga_tudo_do_utilizador_e_deixa_o_grupo_e_os_dados_da_Ana()
    {
        await Conta.DefinirSaldoAsync(Uid, 500m);
        await Conta.DefinirSaldoAsync(Ana, 500m);
        await AdicionarExtra("Café", 2);
        await A.Servico<IRegrasCategoriaService>().AdicionarAsync(Uid, new NovaRegraCategoriaPedido("padaria", "restauracao"));
        await A.Servico<IDispositivosService>().RegistarAsync(Uid, new RegistarDispositivoPedido("ExponentPushToken[pg-uid]", "android"));
        var grupos = A.Servico<IGruposService>();
        var grupo = await grupos.CriarAsync(Uid, "Casa");
        var convite = await grupos.ConvidarAsync(Uid, grupo, "ana@exemplo.pt");
        await grupos.AceitarAsync(Ana, "ana@exemplo.pt", convite);
        var partilha = A.Servico<IPartilhadoService>();
        await partilha.CriarDespesaAsync(Uid, grupo, new DespesaPartilhadaPedido("Jantar", 60m, [new ParticipantePedido(Uid), new ParticipantePedido(Ana)]));
        var sozinho = await grupos.CriarAsync(Uid, "Só eu");

        await A.Servico<IApagarContaService>().ApagarAsync(Uid, null, "APAGAR");

        var db = A.Db();
        Assert.False(await db.Utilizadores.AnyAsync(u => u.Id == Uid));
        Assert.False(await db.DespesasExtras.AnyAsync(d => d.UtilizadorId == Uid));
        Assert.False(await db.RegrasCategoria.AnyAsync(r => r.UtilizadorId == Uid));
        Assert.False(await db.DispositivosPush.AnyAsync(d => d.UtilizadorId == Uid));
        Assert.False(await db.RegistosAlteracao.AnyAsync(r => r.UtilizadorId == Uid));
        Assert.False(await db.Grupos.AnyAsync(g => g.Id == sozinho));
        Assert.False(await db.GruposMembros.AnyAsync(m => m.Uid == Uid));
        Assert.False(await db.DespesasPartilhadas.AnyAsync(d => d.PagadorUid == Uid));
        Assert.False(await db.PartesDespesasPartilhadas.AnyAsync(p => p.Uid == Uid));
        Assert.False(await db.Grupos.AnyAsync(g => g.CriadoPorUid == Uid));

        // A Ana continua com o grupo (agora admin), com a despesa e com a parte dela
        Assert.True(await db.Grupos.AnyAsync(g => g.Id == grupo));
        Assert.Equal(1, await db.DespesasPartilhadas.CountAsync(d => d.GrupoId == grupo));
        Assert.Equal(RoleGrupo.Admin, (await grupos.ListarAsync(Ana)).Single().MinhaRole);
        Assert.Equal(500m, (await Conta.ObterAsync(Ana)).Saldo);
    }

    [FactPostgres]
    public async Task O_mesmo_token_passa_de_uma_conta_para_outra_sem_violar_o_indice_unico()
    {
        var dispositivos = A.Servico<IDispositivosService>();
        await dispositivos.RegistarAsync(Uid, new RegistarDispositivoPedido("ExponentPushToken[pg-token]", "android"));

        await A.Servico<IDispositivosService>().RegistarAsync(Ana, new RegistarDispositivoPedido("ExponentPushToken[pg-token]", "ios"));

        Assert.Empty(await A.Servico<IDispositivosService>().ListarAsync(Uid));
        Assert.Single(await A.Servico<IDispositivosService>().ListarAsync(Ana));
    }

    [FactPostgres]
    public async Task Dois_registos_do_mesmo_token_ao_mesmo_tempo_ficam_com_um_so_dispositivo()
    {
        var pedido = new RegistarDispositivoPedido("ExponentPushToken[pg-concorrente]", "android");

        await Task.WhenAll(
            A.Servico<IDispositivosService>().RegistarAsync(Uid, pedido),
            A.Servico<IDispositivosService>().RegistarAsync(Uid, pedido));

        Assert.Single(await A.Servico<IDispositivosService>().ListarAsync(Uid));
    }

    [FactPostgres]
    public async Task Alertas_o_envio_nao_repete_e_as_regras_de_categoria_funcionam()
    {
        await A.Servico<IOrcamentosService>().AdicionarAsync(Uid, new NovoOrcamentoPedido("lazer", 100));
        await A.Servico<IRegrasCategoriaService>().AdicionarAsync(Uid, new NovaRegraCategoriaPedido("cinema nos", "lazer"));
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Cinema NOS Colombo", 100, null));
        await A.Servico<IDispositivosService>().RegistarAsync(Uid, new RegistarDispositivoPedido("ExponentPushToken[pg-alertas]", "android"));

        var primeira = await A.Servico<IAlertasEnvioService>().EnviarAsync();
        var segunda = await A.Servico<IAlertasEnvioService>().EnviarAsync();

        Assert.Equal("lazer", (await ExtrasDoMes("2026-10")).Single().Categoria);
        Assert.Equal(1, primeira.AlertasEnviados);
        Assert.Equal(0, segunda.AlertasEnviados);
        Assert.Equal(1, segunda.AlertasJaEnviados);
        Assert.Single(A.Expo.Enviadas);
    }
}
