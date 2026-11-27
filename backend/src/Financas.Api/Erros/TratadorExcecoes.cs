using Financas.DAL;
using Financas.Services;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;

namespace Financas.Api.Erros;

/// <summary>
/// Converte as exceções em respostas HTTP com ProblemDetails (RFC 9457), por exemplo:
/// <code>
/// HTTP/1.1 404 Not Found
/// Content-Type: application/problem+json
/// { "status": 404, "title": "Não encontrado", "detail": "Despesa não encontrada.", "traceId": "..." }
/// </code>
/// A app mostra o "detail" (ou o "title") ao utilizador.
/// </summary>
internal sealed class TratadorExcecoes(IProblemDetailsService problemDetails, ILogger<TratadorExcecoes> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext contexto, Exception erro, CancellationToken ct)
    {
        // O cliente desistiu do pedido (ex.: fechou a app): não há a quem responder
        if (erro is OperationCanceledException && contexto.RequestAborted.IsCancellationRequested)
        {
            contexto.Response.StatusCode = 499;
            return true;
        }

        var (estado, detalhe) = erro switch
        {
            NaoEncontradoException => (StatusCodes.Status404NotFound, erro.Message),
            PedidoInvalidoException => (StatusCodes.Status400BadRequest, erro.Message),
            ConflitoException => (StatusCodes.Status409Conflict, erro.Message),
            ConflitoDeConcorrenciaException => (StatusCodes.Status409Conflict, erro.Message),
            BadHttpRequestException pedido => (pedido.StatusCode, "O pedido não é válido (formato ou tamanho)."),
            _ => (StatusCodes.Status500InternalServerError, "Ocorreu um erro inesperado no servidor. Tenta novamente."),
        };

        if (estado >= 500)
        {
            logger.LogError(erro, "Erro inesperado em {Metodo} {Caminho}", contexto.Request.Method, contexto.Request.Path);
        }

        contexto.Response.StatusCode = estado;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = contexto,
            Exception = erro,
            ProblemDetails = new ProblemDetails { Status = estado, Title = Textos.T(TitulosProblemas.Para(estado)), Detail = Textos.T(detalhe) },
        });
    }
}

/// <summary>Títulos em português para os erros HTTP (incluindo os que o ASP.NET Core gera sozinho, como o 401).
/// <see cref="Para"/> devolve-os traduzidos para a linguagem do pedido (por omissão português).</summary>
internal static class TitulosProblemas
{
    private static readonly Dictionary<int, string> Titulos = new()
    {
        [400] = "Pedido inválido",
        [401] = "Sessão inválida ou expirada",
        [403] = "Sem permissão",
        [404] = "Não encontrado",
        [405] = "Operação não permitida",
        [409] = "Conflito",
        [415] = "Formato não suportado",
        [429] = "Demasiados pedidos",
        [500] = "Erro no servidor",
    };

    public static string Para(int estado) =>
        Textos.T(Titulos.GetValueOrDefault(estado) ?? ReasonPhrases.GetReasonPhrase(estado));

    /// <summary>Troca os títulos em inglês que o ASP.NET Core põe por omissão.</summary>
    public static void Traduzir(ProblemDetailsContext contexto)
    {
        var problema = contexto.ProblemDetails;
        if (problema.Status is not { } estado)
        {
            return;
        }

        var porOmissao = problema.Title is null
            || problema.Title == ReasonPhrases.GetReasonPhrase(estado)
            || problema.Title == "An error occurred while processing your request."
            || problema.Title == "One or more validation errors occurred.";
        if (porOmissao)
        {
            problema.Title = estado == 400 && problema is ValidationProblemDetails ? Textos.T("Dados inválidos") : Para(estado);
        }
    }
}
