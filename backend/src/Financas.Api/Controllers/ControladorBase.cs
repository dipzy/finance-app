using Financas.Api.Autenticacao;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>
/// Base dos controllers da API. Os controllers são "finos": recebem o pedido (o [ApiController]
/// já valida os DTOs e responde 400 se algo estiver mal), chamam o serviço e convertem o
/// resultado em HTTP. As regras de negócio estão todas em Financas.Services.
/// <para>
/// [Authorize]: todos os endpoints exigem um ID token válido do Firebase. O uid vem do token,
/// nunca do pedido, por isso cada utilizador só chega aos seus dados.
/// </para>
/// </summary>
[ApiController]
[Authorize]
[Produces("application/json")]
public abstract class ControladorBase : ControllerBase
{
    /// <summary>O uid do Firebase do utilizador autenticado.</summary>
    protected string Uid => User.IdUtilizador();

    /// <summary>O email da sessão confirmado pelo Firebase (null se não estiver confirmado).</summary>
    protected string? EmailVerificado => User.EmailVerificado();

    /// <summary>201 Created com o id do que foi criado.</summary>
    protected ObjectResult Criado(string id) => StatusCode(StatusCodes.Status201Created, new Financas.Services.Dtos.CriadoDto(id));

    /// <summary>200 com o objeto, ou 204 No Content quando ainda não existe (ex.: salário por configurar).</summary>
    protected ActionResult<T> OkOuVazio<T>(T? valor)
        where T : class =>
        valor is null ? NoContent() : Ok(valor);
}
