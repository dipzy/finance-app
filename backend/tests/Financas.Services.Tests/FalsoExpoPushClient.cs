using Financas.Services.Push;

namespace Financas.Services.Tests;

/// <summary>
/// O Expo falso dos testes: guarda o que lhe pedem para enviar e responde "ok" (ou o que <see cref="Resposta"/> disser).
/// Nunca há chamadas de rede a sério.
/// </summary>
public sealed class FalsoExpoPushClient : IExpoPushClient
{
    public List<MensagemPush> Enviadas { get; } = [];

    /// <summary>Quantas vezes o envio foi chamado (um por utilizador com alertas por enviar).</summary>
    public int Chamadas { get; private set; }

    /// <summary>A resposta a cada mensagem; por omissão, aceite.</summary>
    public Func<MensagemPush, ResultadoPush>? Resposta { get; set; }

    /// <summary>Se devolver uma exceção para alguma mensagem, o envio falha com ela (nada fica em <see cref="Enviadas"/>).</summary>
    public Func<MensagemPush, Exception?>? Falhar { get; set; }

    public Task<IReadOnlyList<ResultadoPush>> EnviarAsync(IReadOnlyList<MensagemPush> mensagens, CancellationToken ct = default)
    {
        Chamadas++;
        foreach (var mensagem in mensagens)
        {
            if (Falhar?.Invoke(mensagem) is { } erro)
            {
                throw erro;
            }
        }

        Enviadas.AddRange(mensagens);
        return Task.FromResult<IReadOnlyList<ResultadoPush>>([.. mensagens.Select(m => Resposta?.Invoke(m) ?? new ResultadoPush(true, false, null))]);
    }
}
