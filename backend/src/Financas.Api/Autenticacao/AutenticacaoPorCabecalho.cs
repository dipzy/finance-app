using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Financas.Api.Autenticacao;

/// <summary>
/// Autenticação "de mentira" pelo cabeçalho <c>X-Utilizador: &lt;uid&gt;</c>, sem token.
/// <para>
/// Só existe para os testes de integração e, se pedido, para experimentar a API localmente
/// (Scalar/curl) em Development. Nunca é registada em Production: ver
/// <see cref="ExtensoesAutenticacao.AddAutenticacaoFirebase"/>.
/// </para>
/// </summary>
public sealed class AutenticacaoPorCabecalho(
    IOptionsMonitor<AuthenticationSchemeOptions> opcoes,
    ILoggerFactory logger,
    UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(opcoes, logger, encoder)
{
    public const string Esquema = "Cabecalho";
    public const string Cabecalho = "X-Utilizador";
    public const string CabecalhoEmail = "X-Email";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var uid = Request.Headers[Cabecalho].ToString();
        if (string.IsNullOrWhiteSpace(uid))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        // As mesmas claims que um token do Firebase traz. "X-Email: <email>" faz de email confirmado
        List<Claim> claims = [new Claim(ClaimsDoFirebase.UserId, uid), new Claim(ClaimsDoFirebase.Sub, uid)];
        var email = Request.Headers[CabecalhoEmail].ToString();
        if (!string.IsNullOrWhiteSpace(email))
        {
            claims.Add(new Claim(ClaimsDoFirebase.Email, email));
            claims.Add(new Claim(ClaimsDoFirebase.EmailVerificado, "true"));
        }

        var identidade = new ClaimsIdentity(
            claims,
            Esquema,
            ClaimsDoFirebase.UserId,
            roleType: null);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identidade), Esquema)));
    }
}
