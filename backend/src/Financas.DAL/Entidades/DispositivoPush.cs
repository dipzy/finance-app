namespace Financas.DAL.Entidades;

/// <summary>
/// Um telemóvel (ou browser) que o utilizador registou para receber notificações push (token do Expo).
/// O token é único: se alguém inicia sessão noutra conta no mesmo telemóvel, o dispositivo passa para
/// essa conta (ver <c>DispositivosService</c>).
/// </summary>
public sealed class DispositivoPush
{
    public required string UtilizadorId { get; init; }
    public required string Id { get; init; }

    /// <summary>O token do Expo (ex.: <c>ExponentPushToken[xxxx]</c>).</summary>
    public required string Token { get; set; }

    /// <summary>"android", "ios" ou "web".</summary>
    public required string Plataforma { get; set; }

    /// <summary>A língua das notificações deste dispositivo: "pt" ou "en".</summary>
    public string Idioma { get; set; } = "pt";

    public DateTimeOffset CriadoEm { get; set; }

    /// <summary>Da última vez que a app o registou (renova-se sempre que a app abre).</summary>
    public DateTimeOffset AtualizadoEm { get; set; }
}

/// <summary>
/// Um alerta já enviado por push: serve para não repetir o mesmo alerta. A <see cref="Chave"/> diz qual é o
/// alerta e o período a que pertence (ex.: <c>orcamento-excedido:{id}:2026-10</c>); um por utilizador e chave.
/// </summary>
public sealed class AlertaEnviado
{
    public required string UtilizadorId { get; init; }
    public required string Chave { get; init; }

    /// <summary>O dia (em Portugal) em que foi enviado.</summary>
    public DateOnly Dia { get; set; }

    public DateTimeOffset EnviadoEm { get; set; }
}
