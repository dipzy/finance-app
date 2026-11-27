using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Push;
using Microsoft.Extensions.Logging;

namespace Financas.Services;

// Envio dos alertas por push (chamado por um cron do GitHub Actions: o plano grátis do Render adormece, não
// há tarefas em segundo plano). Para cada utilizador com dispositivos:
//   1. calcula os alertas (AlertasService), uma vez por língua dos seus dispositivos;
//   2. tira os que já foram enviados (AlertaEnviado: um por utilizador e chave do alerta);
//   3. envia o resto pelo Expo (IExpoPushClient) a todos os dispositivos dele, cada um na sua língua;
//   4. regista como enviados os que o Expo aceitou em pelo menos um dispositivo (os recusados por erro
//      passageiro ficam para a próxima vez) e apaga os dispositivos que o Expo diz já não existirem.
// Um erro com um utilizador não impede os outros.
internal sealed class AlertasEnvioService(
    IDispositivosPushRepository dispositivos,
    IAlertasEnviadosRepository enviados,
    AlertasService alertas,
    IExpoPushClient expo,
    IUnitOfWork unitOfWork,
    Relogio relogio,
    ILogger<AlertasEnvioService> logger) : IAlertasEnvioService
{
    // Quanto tempo se guarda o registo de um alerta enviado (chega para os alertas mensais)
    private const int DiasDeRegisto = 90;
    private const string Canal = "pagamentos"; // o canal do Android da app (services/notificacoes.ts)

    public async Task<ResultadoEnvioAlertasDto> EnviarAsync(CancellationToken ct = default)
    {
        var totais = new Totais();
        var utilizadores = await dispositivos.ListarUtilizadoresComDispositivosAsync(ct);
        totais.Utilizadores = utilizadores.Count;

        foreach (var uid in utilizadores)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                await EnviarAoUtilizadorAsync(uid, totais, ct);
            }
            catch (Exception erro) when (erro is not OperationCanceledException)
            {
                totais.Falhas++;
                logger.LogError(erro, "Falhou o envio de alertas a um utilizador");
            }
        }

        // Limpeza: os registos de envio com mais de DiasDeRegisto dias não servem para nada
        await unitOfWork.ExecuteInTransactionAsync(
            async c => await enviados.ApagarAnterioresAsync(relogio.Hoje.AddDays(-DiasDeRegisto), c),
            ct);

        return new ResultadoEnvioAlertasDto(
            totais.Utilizadores,
            totais.Dispositivos,
            totais.AlertasEnviados,
            totais.AlertasJaEnviados,
            totais.Falhas,
            totais.DispositivosRemovidos);
    }

    private async Task EnviarAoUtilizadorAsync(string uid, Totais totais, CancellationToken ct)
    {
        var meus = await dispositivos.ListarAsync(uid, ct);
        if (meus.Count == 0)
        {
            return;
        }

        var idiomaOriginal = Textos.Linguagem;
        try
        {
            // 1-2. Os alertas ainda por enviar (a chave não depende da língua)
            var porIdioma = meus.GroupBy(d => d.Idioma).ToList();
            Textos.Linguagem = porIdioma[0].Key;
            var todos = await alertas.CalcularAsync(uid, ct);
            if (todos.Count == 0)
            {
                return;
            }

            var jaEnviados = await enviados.ListarEnviadosAsync(uid, [.. todos.Select(a => a.Chave)], ct);
            var pendentes = todos.Where(a => !jaEnviados.Contains(a.Chave)).ToList();
            totais.AlertasJaEnviados += todos.Count - pendentes.Count;
            if (pendentes.Count == 0)
            {
                return;
            }

            // 3. Uma mensagem por alerta e dispositivo, no idioma do dispositivo
            var mensagens = new List<(MensagemPush Mensagem, DispositivoPush Dispositivo, string Chave)>();
            foreach (var grupo in porIdioma)
            {
                Textos.Linguagem = grupo.Key;
                var textos = grupo.Key == porIdioma[0].Key ? pendentes : [.. (await alertas.CalcularAsync(uid, ct)).Where(a => pendentes.Any(p => p.Chave == a.Chave))];
                foreach (var alerta in textos)
                {
                    foreach (var dispositivo in grupo)
                    {
                        mensagens.Add((Mensagem(dispositivo.Token, alerta), dispositivo, alerta.Chave));
                    }
                }
            }

            var resultados = await expo.EnviarAsync([.. mensagens.Select(m => m.Mensagem)], ct);

            // 4. O que foi aceite fica registado; os dispositivos que já não existem apagam-se
            var aceites = new HashSet<string>(StringComparer.Ordinal);
            var dispositivosComEnvio = new HashSet<string>(StringComparer.Ordinal);
            var invalidos = new HashSet<string>(StringComparer.Ordinal);
            for (var i = 0; i < mensagens.Count; i++)
            {
                var (_, dispositivo, chave) = mensagens[i];
                var resultado = i < resultados.Count ? resultados[i] : new ResultadoPush(false, false, "sem resposta");
                if (resultado.Aceite)
                {
                    aceites.Add(chave);
                    dispositivosComEnvio.Add(dispositivo.Id);
                }
                else if (resultado.DispositivoInvalido)
                {
                    invalidos.Add(dispositivo.Id);
                }
                else
                {
                    totais.Falhas++;
                    logger.LogWarning("Notificação não enviada ({Alerta}): {Erro}", chave.Split(':')[0], resultado.Erro);
                }
            }

            totais.Dispositivos += dispositivosComEnvio.Count;
            totais.AlertasEnviados += aceites.Count;
            totais.DispositivosRemovidos += invalidos.Count;

            if (aceites.Count > 0 || invalidos.Count > 0)
            {
                await unitOfWork.ExecuteInTransactionAsync(
                    async c =>
                    {
                        var agora = relogio.Agora;
                        var hoje = relogio.Hoje;
                        var jaGravados = await enviados.ListarEnviadosAsync(uid, [.. aceites], c);
                        foreach (var chave in aceites.Where(k => !jaGravados.Contains(k)))
                        {
                            enviados.Adicionar(new AlertaEnviado { UtilizadorId = uid, Chave = chave, Dia = hoje, EnviadoEm = agora });
                        }

                        foreach (var dispositivo in (await dispositivos.ListarAsync(uid, c)).Where(d => invalidos.Contains(d.Id)))
                        {
                            dispositivos.Remover(dispositivo);
                        }
                    },
                    ct);
            }
        }
        finally
        {
            Textos.Linguagem = idiomaOriginal;
        }
    }

    private static MensagemPush Mensagem(string token, AlertaCalculado alerta) => new(
        token,
        alerta.Alerta.Titulo,
        alerta.Alerta.Mensagem,
        Canal,
        new Dictionary<string, string>
        {
            ["tipo"] = JsonNome(alerta.Alerta.Tipo),
            ["referencia"] = alerta.Alerta.Referencia ?? "",
            ["url"] = Ecra(alerta.Alerta),
        });

    // O nome do tipo como a app o recebe em GET /api/alertas ("orcamento-excedido")
    private static string JsonNome(TipoAlerta tipo) => tipo switch
    {
        TipoAlerta.OrcamentoAviso => "orcamento-aviso",
        TipoAlerta.OrcamentoExcedido => "orcamento-excedido",
        TipoAlerta.DespesaAVencer => "despesa-a-vencer",
        TipoAlerta.DespesaVencida => "despesa-vencida",
        TipoAlerta.DividaAVencer => "divida-a-vencer",
        TipoAlerta.DividaVencida => "divida-vencida",
        TipoAlerta.ObjetivoAtrasado => "objetivo-atrasado",
        TipoAlerta.CategoriaAcimaDaMedia => "categoria-acima-da-media",
        TipoAlerta.DespesaFixaSubiu => "despesa-fixa-subiu",
        TipoAlerta.GastoIncomum => "gasto-incomum",
        TipoAlerta.AcertoPorConfirmar => "acerto-por-confirmar",
        TipoAlerta.DespesaPartilhadaPorAceitar => "despesa-partilhada-por-aceitar",
        TipoAlerta.OrcamentoRitmo => "orcamento-ritmo",
        _ => tipo.ToString(),
    };

    // O ecrã da app que a notificação abre (as rotas de app/(tabs))
    private static string Ecra(AlertaDto alerta) => alerta.Tipo switch
    {
        TipoAlerta.OrcamentoAviso or TipoAlerta.OrcamentoExcedido or TipoAlerta.OrcamentoRitmo => "/(tabs)/orcamentos",
        TipoAlerta.DespesaAVencer or TipoAlerta.DespesaVencida => "/(tabs)/despesas-fixas",
        TipoAlerta.DividaAVencer or TipoAlerta.DividaVencida => "/(tabs)/dividas",
        TipoAlerta.ObjetivoAtrasado => "/(tabs)/objetivos",
        TipoAlerta.DespesaFixaSubiu => "/(tabs)/despesas-fixas",
        TipoAlerta.CategoriaAcimaDaMedia or TipoAlerta.GastoIncomum => "/(tabs)/despesas-extras",
        TipoAlerta.AcertoPorConfirmar or TipoAlerta.DespesaPartilhadaPorAceitar when alerta.Referencia is not null => $"/(tabs)/grupo/{alerta.Referencia}",
        _ => "/(tabs)",
    };

    private sealed class Totais
    {
        public int Utilizadores;
        public int Dispositivos;
        public int AlertasEnviados;
        public int AlertasJaEnviados;
        public int Falhas;
        public int DispositivosRemovidos;
    }
}
