using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Push;
using Microsoft.EntityFrameworkCore;

namespace Financas.Services.Tests;

// Dispositivos push e o envio dos alertas (AlertasEnvioService), com o Expo falso
public class AlertasPushTests : TestesServicos
{
    private const string Token = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
    private const string OutroToken = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";

    private IDispositivosService Dispositivos => A.Servico<IDispositivosService>();
    private IAlertasEnvioService Envio => A.Servico<IAlertasEnvioService>();

    private Task<DispositivoDto> Registar(string uid, string token = Token, string plataforma = "android", string? idioma = null) =>
        Dispositivos.RegistarAsync(uid, new RegistarDispositivoPedido(token, plataforma, idioma));

    // Um utilizador com um orçamento excedido e uma despesa por pagar a vencer amanhã
    private async Task ComAlertasAsync(string uid = Uid)
    {
        await A.Servico<IOrcamentosService>().AdicionarAsync(uid, new NovoOrcamentoPedido("lazer", 100));
        await Extras.AdicionarAsync(uid, new NovaDespesaExtraPedido("Cinema", 100, null, "lazer"));
        await Fixas.AdicionarAsync(uid, new NovaDespesaFixaPedido("Renda", 550, 6, null, null, null));
    }

    // ---- Registar dispositivos ----

    [Fact]
    public async Task Registar_o_mesmo_token_duas_vezes_renova_o_dispositivo()
    {
        var primeiro = await Registar(Uid);
        var segundo = await Registar(Uid, plataforma: "ios", idioma: "EN-gb");

        Assert.Equal(primeiro.Id, segundo.Id);
        var lista = Assert.Single(await Dispositivos.ListarAsync(Uid));
        Assert.Equal(new DispositivoDto(primeiro.Id, "ios", "en"), lista);
    }

    [Fact]
    public async Task O_token_so_pertence_a_uma_conta_e_passa_para_quem_o_registar()
    {
        await Registar("ana");

        await Registar("rui"); // outra conta no mesmo telemóvel

        Assert.Empty(await Dispositivos.ListarAsync("ana"));
        Assert.Single(await Dispositivos.ListarAsync("rui"));
        Assert.Equal(1, await A.Db().DispositivosPush.CountAsync());
    }

    [Theory]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("ExponentPushToken[]")]
    [InlineData("ExponentPushToken[a b]")]
    [InlineData("FcmToken[xxxx]")]
    public async Task Token_invalido_da_400(string token)
    {
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Registar(Uid, token));
        Assert.Empty(await Dispositivos.ListarAsync(Uid));
    }

    [Fact]
    public async Task Plataforma_desconhecida_da_400_e_o_idioma_desconhecido_fica_pt()
    {
        await Assert.ThrowsAsync<PedidoInvalidoException>(() => Registar(Uid, plataforma: "windows"));

        var dispositivo = await Registar(Uid, plataforma: "WEB", idioma: "fr");

        Assert.Equal(new DispositivoDto(dispositivo.Id, "web", "pt"), dispositivo);
    }

    [Fact]
    public async Task No_maximo_10_dispositivos_por_utilizador_saem_os_mais_antigos()
    {
        for (var i = 0; i < 12; i++)
        {
            await Registar(Uid, $"ExponentPushToken[token{i:00}]");
        }

        var lista = await Dispositivos.ListarAsync(Uid);
        Assert.Equal(10, lista.Count);
        var tokens = (await A.Db().DispositivosPush.Select(d => d.Token).ToListAsync()).Order().ToList();
        Assert.DoesNotContain("ExponentPushToken[token00]", tokens);
        Assert.DoesNotContain("ExponentPushToken[token01]", tokens);
        Assert.Contains("ExponentPushToken[token11]", tokens);
    }

    [Fact]
    public async Task Remover_so_apaga_dispositivos_do_proprio_utilizador()
    {
        await Registar("ana");

        await Dispositivos.RemoverAsync("rui", Token); // não é dele
        Assert.Single(await Dispositivos.ListarAsync("ana"));

        await Dispositivos.RemoverAsync("ana", Token);
        Assert.Empty(await Dispositivos.ListarAsync("ana"));
        await Dispositivos.RemoverAsync("ana", Token); // já não existe: não dá erro
    }

    // ---- Envio ----

    [Fact]
    public async Task Envia_cada_alerta_ao_dispositivo_com_o_titulo_o_corpo_e_os_dados_para_abrir_o_ecra()
    {
        await ComAlertasAsync();
        await Registar(Uid);

        var resultado = await Envio.EnviarAsync();

        Assert.Equal(new ResultadoEnvioAlertasDto(1, 1, 2, 0, 0, 0), resultado);
        Assert.Equal(2, A.Expo.Enviadas.Count);
        var orcamento = A.Expo.Enviadas.Single(m => m.Dados!["tipo"] == "orcamento-excedido");
        Assert.Equal(Token, orcamento.Token);
        Assert.Equal("Orçamento de Lazer ultrapassado", orcamento.Titulo);
        Assert.Equal("Gastaste 100,00 € de 100,00 € em Lazer: limite ultrapassado.", orcamento.Corpo);
        Assert.Equal("pagamentos", orcamento.Canal);
        Assert.Equal("/(tabs)/orcamentos", orcamento.Dados!["url"]);
        var renda = A.Expo.Enviadas.Single(m => m.Dados!["tipo"] == "despesa-a-vencer");
        Assert.Equal("Renda sai amanhã — 550,00 €", renda.Titulo);
        Assert.Equal("/(tabs)/despesas-fixas", renda.Dados!["url"]);
    }

    [Fact]
    public async Task Nunca_repete_o_mesmo_alerta_no_mesmo_dia()
    {
        await ComAlertasAsync();
        await Registar(Uid);
        await Envio.EnviarAsync();
        A.Expo.Enviadas.Clear();

        var segunda = await Envio.EnviarAsync();

        Assert.Equal(new ResultadoEnvioAlertasDto(1, 0, 0, 2, 0, 0), segunda);
        Assert.Empty(A.Expo.Enviadas);
        Assert.Equal(2, await A.Db().AlertasEnviados.CountAsync(a => a.UtilizadorId == Uid));
    }

    [Fact]
    public async Task No_dia_seguinte_so_se_envia_o_que_e_novo()
    {
        await ComAlertasAsync();
        await Registar(Uid);
        await Envio.EnviarAsync(); // 5 de outubro: orçamento excedido + renda a vencer
        A.Expo.Enviadas.Clear();

        HojeE(2026, 10, 6); // o orçamento e a renda "a vencer" são do mês: não se repetem
        var dia6 = await Envio.EnviarAsync();
        Assert.Equal(0, dia6.AlertasEnviados);

        HojeE(2026, 10, 7); // a renda (dia 6) passou: agora está vencida, um alerta novo
        var dia7 = await Envio.EnviarAsync();
        Assert.Equal(1, dia7.AlertasEnviados);
        Assert.Equal("despesa-vencida", Assert.Single(A.Expo.Enviadas).Dados!["tipo"]);
        A.Expo.Enviadas.Clear();

        var repetido = await Envio.EnviarAsync(); // no mesmo dia, não repete
        Assert.Equal(0, repetido.AlertasEnviados);

        HojeE(2026, 10, 8); // as vencidas repetem-se uma vez por dia enquanto não forem pagas
        Assert.Equal(1, (await Envio.EnviarAsync()).AlertasEnviados);
    }

    [Fact]
    public async Task O_aviso_de_ritmo_de_um_orcamento_vai_uma_vez_por_mes_e_abre_os_orcamentos()
    {
        HojeE(2026, 10, 15);
        await Registar(Uid);
        await A.Servico<IOrcamentosService>().AdicionarAsync(Uid, new NovoOrcamentoPedido("compras", 200));
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Casaco", 140, null, "compras")); // 70% a meio do mês

        Assert.Equal(1, (await Envio.EnviarAsync()).AlertasEnviados);

        var mensagem = Assert.Single(A.Expo.Enviadas);
        Assert.Equal("orcamento-ritmo", mensagem.Dados!["tipo"]);
        Assert.Equal("/(tabs)/orcamentos", mensagem.Dados["url"]);
        Assert.Equal(0, (await Envio.EnviarAsync()).AlertasEnviados); // no mesmo mês, não repete
    }

    [Fact]
    public async Task Um_alerta_novo_no_mesmo_dia_e_enviado_so_esse()
    {
        await ComAlertasAsync();
        await Registar(Uid);
        await Envio.EnviarAsync();
        A.Expo.Enviadas.Clear();

        await A.Servico<IOrcamentosService>().AdicionarAsync(Uid, new NovoOrcamentoPedido("compras", 50));
        await Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido("Camisola", 45, null, "compras")); // 90%

        var resultado = await Envio.EnviarAsync();

        Assert.Equal(1, resultado.AlertasEnviados);
        Assert.Equal(2, resultado.AlertasJaEnviados);
        Assert.Equal("orcamento-aviso", Assert.Single(A.Expo.Enviadas).Dados!["tipo"]);
    }

    [Fact]
    public async Task Cada_utilizador_recebe_so_os_seus_alertas_nos_seus_dispositivos()
    {
        await ComAlertasAsync("ana");
        await Registar("ana", Token);
        await Registar("rui", OutroToken); // o Rui não tem alertas

        var resultado = await Envio.EnviarAsync();

        Assert.Equal(2, resultado.Utilizadores);
        Assert.Equal(2, resultado.AlertasEnviados);
        Assert.All(A.Expo.Enviadas, m => Assert.Equal(Token, m.Token));
    }

    [Fact]
    public async Task Varios_dispositivos_recebem_todos_e_o_alerta_conta_como_enviado_uma_vez()
    {
        await ComAlertasAsync();
        await Registar(Uid, Token);
        await Registar(Uid, OutroToken, "ios");

        var resultado = await Envio.EnviarAsync();

        Assert.Equal(new ResultadoEnvioAlertasDto(1, 2, 2, 0, 0, 0), resultado);
        Assert.Equal(4, A.Expo.Enviadas.Count);
        Assert.Equal(2, await A.Db().AlertasEnviados.CountAsync());
    }

    [Fact]
    public async Task Cada_dispositivo_recebe_na_sua_lingua()
    {
        await ComAlertasAsync();
        await Registar(Uid, Token, idioma: "pt");
        await Registar(Uid, OutroToken, "ios", "en");

        await Envio.EnviarAsync();

        var pt = A.Expo.Enviadas.Single(m => m.Token == Token && m.Dados!["tipo"] == "orcamento-excedido");
        var en = A.Expo.Enviadas.Single(m => m.Token == OutroToken && m.Dados!["tipo"] == "orcamento-excedido");
        Assert.Equal("Orçamento de Lazer ultrapassado", pt.Titulo);
        Assert.Equal("Leisure budget exceeded", en.Titulo);
        Assert.Equal("Renda due tomorrow — 550.00 €", A.Expo.Enviadas.Single(m => m.Token == OutroToken && m.Dados!["tipo"] == "despesa-a-vencer").Titulo);
        // E a língua do pedido não ficou trocada
        Assert.Equal("pt", Textos.Linguagem);
    }

    [Fact]
    public async Task Se_o_Expo_falhar_o_alerta_nao_fica_registado_e_vai_na_vez_seguinte()
    {
        await ComAlertasAsync();
        await Registar(Uid);
        A.Expo.Resposta = _ => new ResultadoPush(false, false, "MessageRateExceeded");

        var falhou = await Envio.EnviarAsync();

        Assert.Equal(new ResultadoEnvioAlertasDto(1, 0, 0, 0, 2, 0), falhou);
        Assert.Empty(await A.Db().AlertasEnviados.ToListAsync());
        Assert.Single(await Dispositivos.ListarAsync(Uid)); // o dispositivo fica

        A.Expo.Resposta = null;
        A.Expo.Enviadas.Clear();
        var segunda = await Envio.EnviarAsync();
        Assert.Equal(2, segunda.AlertasEnviados);
        Assert.Equal(2, A.Expo.Enviadas.Count);
    }

    [Fact]
    public async Task Dispositivo_que_o_Expo_diz_que_ja_nao_existe_e_apagado()
    {
        await ComAlertasAsync();
        await Registar(Uid, Token);
        await Registar(Uid, OutroToken, "ios");
        A.Expo.Resposta = m => m.Token == OutroToken ? new ResultadoPush(false, true, "DeviceNotRegistered") : new ResultadoPush(true, false, null);

        var resultado = await Envio.EnviarAsync();

        Assert.Equal(1, resultado.DispositivosRemovidos);
        Assert.Equal(2, resultado.AlertasEnviados); // o outro dispositivo recebeu
        var restantes = await Dispositivos.ListarAsync(Uid);
        Assert.Equal(Token, (await A.Db().DispositivosPush.SingleAsync()).Token);
        Assert.Single(restantes);
    }

    [Fact]
    public async Task Sem_dispositivos_ou_sem_alertas_nao_se_envia_nada()
    {
        await ComAlertasAsync(); // alertas, mas sem dispositivos
        Assert.Equal(new ResultadoEnvioAlertasDto(0, 0, 0, 0, 0, 0), await Envio.EnviarAsync());

        await Registar("rui"); // dispositivo, mas sem alertas
        Assert.Equal(new ResultadoEnvioAlertasDto(1, 0, 0, 0, 0, 0), await Envio.EnviarAsync());
        Assert.Empty(A.Expo.Enviadas);
        Assert.Equal(0, A.Expo.Chamadas);
    }

    [Fact]
    public async Task Os_registos_de_envio_com_mais_de_90_dias_sao_apagados()
    {
        await Registar(Uid);
        var db = A.Db();
        db.AlertasEnviados.Add(new AlertaEnviado { UtilizadorId = Uid, Chave = "antigo", Dia = new DateOnly(2026, 6, 1), EnviadoEm = A.Relogio.GetUtcNow() });
        db.AlertasEnviados.Add(new AlertaEnviado { UtilizadorId = Uid, Chave = "recente", Dia = new DateOnly(2026, 9, 20), EnviadoEm = A.Relogio.GetUtcNow() });
        await db.SaveChangesAsync();

        await Envio.EnviarAsync();

        var chaves = await A.Db().AlertasEnviados.Select(a => a.Chave).ToListAsync();
        Assert.Equal(["recente"], chaves);
    }

    [Fact]
    public async Task Um_erro_com_um_utilizador_nao_impede_os_outros()
    {
        await ComAlertasAsync("ana");
        await ComAlertasAsync("rui");
        await Registar("ana", Token);
        await Registar("rui", OutroToken);
        A.Expo.Falhar = m => m.Token == Token ? new InvalidOperationException("falhou") : null;

        var resultado = await Envio.EnviarAsync();

        Assert.Equal(1, resultado.Falhas);
        Assert.Equal(2, resultado.AlertasEnviados); // os do Rui
        Assert.All(A.Expo.Enviadas.Where(m => m.Token == OutroToken), m => Assert.Equal(OutroToken, m.Token));
    }
}
