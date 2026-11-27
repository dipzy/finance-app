using Financas.DAL;
using Financas.DAL.Repositorios;
using Microsoft.Extensions.Logging;

namespace Financas.Services.Push;

/// <summary>
/// Avisa por push os outros membros de um grupo quando algo muda numa despesa partilhada ou num acerto.
/// Corre sempre depois de a operação estar gravada e nunca a faz falhar: se o Expo estiver em baixo,
/// só fica um aviso nos registos.
/// </summary>
internal sealed class NotificadorPartilhado(
    IDispositivosPushRepository dispositivos,
    IExpoPushClient expo,
    IUnitOfWork unitOfWork,
    ILogger<NotificadorPartilhado> logger)
{
    private const string Canal = "pagamentos"; // o canal do Android da app (services/notificacoes.ts)

    /// <param name="texto">Titulo e corpo na língua pedida ("pt" ou "en"); corre com <see cref="Textos.Linguagem"/> já mudada.</param>
    public async Task AvisarAsync(
        IEnumerable<string> uids,
        Func<(string Titulo, string Corpo)> texto,
        string ecra,
        CancellationToken ct = default)
    {
        var idiomaOriginal = Textos.Linguagem;
        try
        {
            var mensagens = new List<(MensagemPush Mensagem, string UtilizadorId, string DispositivoId)>();
            foreach (var uid in uids.Distinct(StringComparer.Ordinal))
            {
                foreach (var dispositivo in await dispositivos.ListarAsync(uid, ct))
                {
                    Textos.Linguagem = dispositivo.Idioma;
                    var (titulo, corpo) = texto();
                    mensagens.Add((
                        new MensagemPush(dispositivo.Token, titulo, corpo, Canal, new Dictionary<string, string>
                        {
                            ["tipo"] = "partilhado",
                            ["url"] = ecra,
                        }),
                        uid,
                        dispositivo.Id));
                }
            }

            if (mensagens.Count == 0) return;

            var resultados = await expo.EnviarAsync([.. mensagens.Select(m => m.Mensagem)], ct);
            var invalidos = mensagens
                .Where((_, i) => i < resultados.Count && resultados[i].DispositivoInvalido)
                .Select(m => m.DispositivoId)
                .ToHashSet(StringComparer.Ordinal);
            if (invalidos.Count == 0) return;

            await unitOfWork.ExecuteInTransactionAsync(
                async c =>
                {
                    foreach (var uid in mensagens.Select(m => m.UtilizadorId).Distinct(StringComparer.Ordinal))
                    {
                        foreach (var d in (await dispositivos.ListarAsync(uid, c)).Where(d => invalidos.Contains(d.Id)))
                        {
                            dispositivos.Remover(d);
                        }
                    }
                },
                ct);
        }
        catch (Exception erro) when (erro is not OperationCanceledException)
        {
            logger.LogWarning(erro, "Não foi possível enviar a notificação da parte partilhada");
        }
        finally
        {
            Textos.Linguagem = idiomaOriginal;
        }
    }
}
