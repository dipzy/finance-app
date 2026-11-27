using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Financas.Services.Push;

/// <summary>Opções dos alertas e do push (secção "Alertas", variáveis <c>Alertas__...</c>).</summary>
public sealed class OpcoesAlertas
{
    public const string Seccao = "Alertas";

    /// <summary>
    /// O segredo que o cron (GitHub Actions) envia no cabeçalho <c>X-Cron-Secret</c> para chamar
    /// <c>POST /api/interno/alertas/enviar</c>. <b>Vazio = o endpoint está desativado</b> (responde 404).
    /// </summary>
    public string? SegredoCron { get; set; }

    /// <summary>A API de envio do Expo Push.</summary>
    public string ExpoUrl { get; set; } = "https://exp.host/--/api/v2/push/send";

    /// <summary>Opcional: o <i>access token</i> do Expo, se a conta tiver a segurança reforçada ligada.</summary>
    public string? ExpoAccessToken { get; set; }
}

/// <summary>Uma notificação para um dispositivo.</summary>
/// <param name="Canal">O canal do Android (a app cria "pagamentos").</param>
/// <param name="Dados">Vai em <c>data</c> da notificação (a app usa-o para abrir o ecrã certo).</param>
public sealed record MensagemPush(string Token, string Titulo, string Corpo, string? Canal, IReadOnlyDictionary<string, string>? Dados);

/// <summary>O que o Expo respondeu a uma notificação.</summary>
/// <param name="Aceite">O Expo aceitou a notificação (vai ser entregue).</param>
/// <param name="DispositivoInvalido">O token já não existe (app desinstalada): deve ser apagado.</param>
public sealed record ResultadoPush(bool Aceite, bool DispositivoInvalido, string? Erro);

/// <summary>
/// Envia notificações pela API do Expo. Está atrás de uma interface para os testes usarem uma falsa
/// (nunca se chama o Expo a sério nos testes).
/// </summary>
public interface IExpoPushClient
{
    /// <summary>Um resultado por mensagem, pela mesma ordem. Não lança exceções por falhas de rede: devolve resultados com erro.</summary>
    Task<IReadOnlyList<ResultadoPush>> EnviarAsync(IReadOnlyList<MensagemPush> mensagens, CancellationToken ct = default);
}

internal sealed class ExpoPushClient(HttpClient http, IOptions<OpcoesAlertas> opcoes, ILogger<ExpoPushClient> logger) : IExpoPushClient
{
    // A API do Expo aceita no máximo 100 notificações por pedido
    private const int MaximoPorPedido = 100;

    // Sem os campos null (o Expo não gosta de um canal null)
    private static readonly JsonSerializerOptions JsonSemNulos = new() { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    public async Task<IReadOnlyList<ResultadoPush>> EnviarAsync(IReadOnlyList<MensagemPush> mensagens, CancellationToken ct = default)
    {
        var resultados = new List<ResultadoPush>(mensagens.Count);
        foreach (var lote in mensagens.Chunk(MaximoPorPedido))
        {
            resultados.AddRange(await EnviarLoteAsync(lote, ct));
        }

        return resultados;
    }

    private async Task<IReadOnlyList<ResultadoPush>> EnviarLoteAsync(MensagemPush[] lote, CancellationToken ct)
    {
        try
        {
            using var pedido = new HttpRequestMessage(HttpMethod.Post, opcoes.Value.ExpoUrl)
            {
                Content = JsonContent.Create(lote.Select(m => new
                {
                    to = m.Token,
                    title = m.Titulo,
                    body = m.Corpo,
                    sound = "default",
                    channelId = m.Canal,
                    data = m.Dados,
                }), options: JsonSemNulos),
            };
            pedido.Headers.Accept.ParseAdd("application/json");
            if (!string.IsNullOrWhiteSpace(opcoes.Value.ExpoAccessToken))
            {
                pedido.Headers.Authorization = new("Bearer", opcoes.Value.ExpoAccessToken);
            }

            using var resposta = await http.SendAsync(pedido, ct);
            if (!resposta.IsSuccessStatusCode)
            {
                logger.LogWarning("O Expo respondeu {Estado} ao envio de {Total} notificações", (int)resposta.StatusCode, lote.Length);
                return Falhas(lote.Length, $"HTTP {(int)resposta.StatusCode}");
            }

            var corpo = await resposta.Content.ReadFromJsonAsync<RespostaExpo>(ct);
            if (corpo?.Data is null || corpo.Data.Count != lote.Length)
            {
                logger.LogWarning("Resposta do Expo inesperada ({Recebidas} resultados para {Total} notificações)", corpo?.Data?.Count, lote.Length);
                return Falhas(lote.Length, "resposta inesperada");
            }

            return
            [
                .. corpo.Data.Select(r => r.Status == "ok"
                    ? new ResultadoPush(true, false, null)
                    : new ResultadoPush(false, r.Details?.Error == "DeviceNotRegistered", r.Details?.Error ?? r.Message ?? "erro")),
            ];
        }
        catch (Exception erro) when (erro is HttpRequestException or TaskCanceledException or JsonException)
        {
            // Sem ligação (ou o Expo em baixo): fica para a próxima vez
            logger.LogWarning(erro, "Falhou o envio de {Total} notificações ao Expo", lote.Length);
            return Falhas(lote.Length, erro.GetType().Name);
        }
    }

    private static List<ResultadoPush> Falhas(int total, string erro) =>
        [.. Enumerable.Repeat(new ResultadoPush(false, false, erro), total)];

    private sealed class RespostaExpo
    {
        [JsonPropertyName("data")]
        public List<ResultadoExpo>? Data { get; set; }
    }

    private sealed class ResultadoExpo
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }

        [JsonPropertyName("details")]
        public DetalhesExpo? Details { get; set; }
    }

    private sealed class DetalhesExpo
    {
        [JsonPropertyName("error")]
        public string? Error { get; set; }
    }
}
