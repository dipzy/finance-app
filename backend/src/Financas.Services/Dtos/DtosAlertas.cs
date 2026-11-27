using System.Text.Json.Serialization;

namespace Financas.Services.Dtos;

// ---- Alertas proativos e notificações push ----

/// <summary>O que o alerta diz (as chaves são as que a app recebe em <c>tipo</c>).</summary>
public enum TipoAlerta
{
    /// <summary>Orçamento do mês a 80% ou mais do limite.</summary>
    [JsonStringEnumMemberName("orcamento-aviso")]
    OrcamentoAviso,

    /// <summary>Orçamento do mês a 100% ou mais do limite.</summary>
    [JsonStringEnumMemberName("orcamento-excedido")]
    OrcamentoExcedido,

    /// <summary>Despesa mensal por pagar cujo dia de débito é daqui a 3 dias ou menos.</summary>
    [JsonStringEnumMemberName("despesa-a-vencer")]
    DespesaAVencer,

    /// <summary>Despesa mensal por pagar cujo dia de débito já passou.</summary>
    [JsonStringEnumMemberName("despesa-vencida")]
    DespesaVencida,

    /// <summary>Prestação de uma dívida por pagar cujo dia de débito é daqui a 3 dias ou menos.</summary>
    [JsonStringEnumMemberName("divida-a-vencer")]
    DividaAVencer,

    /// <summary>Prestação de uma dívida por pagar cujo dia de débito já passou.</summary>
    [JsonStringEnumMemberName("divida-vencida")]
    DividaVencida,

    /// <summary>Objetivo de poupança com menos do que o ritmo certo pedia.</summary>
    [JsonStringEnumMemberName("objetivo-atrasado")]
    ObjetivoAtrasado,

    /// <summary>Uma categoria de gastos do mês já bem acima da média dos meses anteriores.</summary>
    [JsonStringEnumMemberName("categoria-acima-da-media")]
    CategoriaAcimaDaMedia,

    /// <summary>Uma despesa mensal que este mês custou bem mais do que costuma (ex.: a eletricidade).</summary>
    [JsonStringEnumMemberName("despesa-fixa-subiu")]
    DespesaFixaSubiu,

    /// <summary>Um gasto recente muito acima do que é normal naquela categoria.</summary>
    [JsonStringEnumMemberName("gasto-incomum")]
    GastoIncomum,

    /// <summary>Alguém do grupo diz que me pagou e eu ainda não confirmei que recebi (o dinheiro só entra na conta ao confirmar).</summary>
    [JsonStringEnumMemberName("acerto-por-confirmar")]
    AcertoPorConfirmar,

    /// <summary>Alguém do grupo adicionou uma despesa em que tenho uma parte por aceitar (diz quanto me cabe pagar).</summary>
    [JsonStringEnumMemberName("despesa-partilhada-por-aceitar")]
    DespesaPartilhadaPorAceitar,

    /// <summary>Orçamento do mês ainda abaixo dos 80%, mas a gastar-se depressa: ao ritmo atual passa o limite antes do fim do mês.</summary>
    [JsonStringEnumMemberName("orcamento-ritmo")]
    OrcamentoRitmo,
}

public enum SeveridadeAlerta
{
    [JsonStringEnumMemberName("info")]
    Info,

    [JsonStringEnumMemberName("aviso")]
    Aviso,

    [JsonStringEnumMemberName("critico")]
    Critico,
}

/// <summary>
/// Um alerta calculado no servidor. <see cref="Referencia"/> é o id do que o alerta diz (orçamento, despesa,
/// dívida ou objetivo); <see cref="Data"/> é a data a que se refere (o dia de débito nas despesas e dívidas, hoje nos outros).
/// O texto vem na língua do pedido (<c>Accept-Language</c>).
/// </summary>
public sealed record AlertaDto(
    TipoAlerta Tipo,
    SeveridadeAlerta Severidade,
    string Titulo,
    string Mensagem,
    string? Referencia,
    DateOnly Data);

/// <summary>Registar (ou renovar) o dispositivo para receber notificações push.</summary>
/// <param name="Token">O token do Expo, ex.: <c>ExponentPushToken[xxxxxxxx]</c>.</param>
/// <param name="Plataforma">"android", "ios" ou "web".</param>
/// <param name="Idioma">A língua das notificações deste dispositivo: "pt" (por omissão) ou "en".</param>
public sealed record RegistarDispositivoPedido(
    [Obrigatorio, Maximo(200)] string Token,
    [Obrigatorio, Maximo(20)] string Plataforma,
    [Maximo(5)] string? Idioma = null);

public sealed record DispositivoDto(string Id, string Plataforma, string Idioma);

/// <summary>O que o envio de alertas fez (resposta do <c>POST /api/interno/alertas/enviar</c>).</summary>
/// <param name="Utilizadores">Utilizadores com dispositivos que foram vistos.</param>
/// <param name="Dispositivos">Dispositivos a que se enviou pelo menos uma notificação.</param>
/// <param name="AlertasEnviados">Alertas enviados e registados como enviados (um por utilizador e alerta).</param>
/// <param name="AlertasJaEnviados">Alertas que já tinham sido enviados e por isso ficaram de fora.</param>
/// <param name="Falhas">Utilizadores ou notificações com erro (ficam para a próxima vez).</param>
/// <param name="DispositivosRemovidos">Dispositivos que o Expo disse já não existirem (token apagado).</param>
public sealed record ResultadoEnvioAlertasDto(
    int Utilizadores,
    int Dispositivos,
    int AlertasEnviados,
    int AlertasJaEnviados,
    int Falhas,
    int DispositivosRemovidos);
