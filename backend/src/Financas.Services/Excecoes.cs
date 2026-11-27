namespace Financas.Services;

// Erros de negócio. A API converte-os em respostas HTTP com ProblemDetails
// (ver Financas.Api/Erros/TratadorExcecoes.cs); as mensagens são mostradas ao utilizador.

/// <summary>O recurso pedido não existe (HTTP 404).</summary>
public sealed class NaoEncontradoException(string mensagem) : Exception(mensagem);

/// <summary>O pedido não é válido para o estado atual dos dados (HTTP 400).</summary>
public sealed class PedidoInvalidoException(string mensagem) : Exception(mensagem);

/// <summary>O pedido entra em conflito com os dados que já existem (HTTP 409).</summary>
public sealed class ConflitoException(string mensagem) : Exception(mensagem);
