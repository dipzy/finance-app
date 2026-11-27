using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Financas.Api.Autenticacao;

/// <summary>Opções do Firebase (secção "Firebase" do appsettings.json).</summary>
public sealed class OpcoesFirebase
{
    public const string Seccao = "Firebase";

    /// <summary>Id do projeto Firebase (ex.: financas-app-2ffc6).</summary>
    public string ProjectId { get; set; } = "";
}

/// <summary>Nomes das claims nos ID tokens do Firebase.</summary>
public static class ClaimsDoFirebase
{
    public const string UserId = "user_id";
    public const string Sub = "sub";
    public const string Email = "email";
    public const string EmailVerificado = "email_verified";
}

public static class ExtensoesAutenticacao
{
    private const string EsquemaDesenvolvimento = "FirebaseOuCabecalho";

    /// <summary>
    /// A app faz login no Firebase Auth e envia o ID token em cada pedido
    /// (<c>Authorization: Bearer &lt;token&gt;</c>). Aqui o token é validado como qualquer JWT:
    /// assinatura com as chaves públicas da Google (descobertas a partir da Authority), emissor
    /// <c>https://securetoken.google.com/{ProjectId}</c>, audiência <c>{ProjectId}</c> e validade.
    /// Não é preciso nenhum segredo nem o SDK Admin do Firebase.
    /// </summary>
    public static IServiceCollection AddAutenticacaoFirebase(
        this IServiceCollection services,
        IConfiguration configuracao,
        IHostEnvironment ambiente)
    {
        var firebase = configuracao.GetSection(OpcoesFirebase.Seccao).Get<OpcoesFirebase>() ?? new OpcoesFirebase();
        if (string.IsNullOrWhiteSpace(firebase.ProjectId))
        {
            throw new InvalidOperationException("Falta Firebase:ProjectId na configuração.");
        }

        var emissor = $"https://securetoken.google.com/{firebase.ProjectId}";
        var autenticacao = services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(opcoes =>
            {
                opcoes.Authority = emissor;
                // Manter os nomes das claims do token ("user_id", "sub") em vez de os traduzir para os da Microsoft
                opcoes.MapInboundClaims = false;
                opcoes.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = emissor,
                    ValidateAudience = true,
                    ValidAudience = firebase.ProjectId,
                    ValidateLifetime = true,
                    NameClaimType = ClaimsDoFirebase.UserId,
                };
            });

        // Só em Development e só se pedido (Autenticacao:CabecalhoDesenvolvimento=true): aceitar também
        // "X-Utilizador: <uid>" sem token, para experimentar a API com o Scalar ou com curl.
        // Em Production este código nem corre, por isso não há maneira de o ligar lá.
        if (ambiente.IsDevelopment() && configuracao.GetValue<bool>("Autenticacao:CabecalhoDesenvolvimento"))
        {
            autenticacao
                .AddScheme<AuthenticationSchemeOptions, AutenticacaoPorCabecalho>(AutenticacaoPorCabecalho.Esquema, null)
                .AddPolicyScheme(EsquemaDesenvolvimento, "Firebase ou cabeçalho X-Utilizador", opcoes =>
                    opcoes.ForwardDefaultSelector = contexto =>
                        contexto.Request.Headers.ContainsKey(AutenticacaoPorCabecalho.Cabecalho)
                            ? AutenticacaoPorCabecalho.Esquema
                            : JwtBearerDefaults.AuthenticationScheme);
            services.Configure<AuthenticationOptions>(opcoes => opcoes.DefaultScheme = EsquemaDesenvolvimento);
        }

        services.AddAuthorization();
        return services;
    }

    /// <summary>O uid do Firebase do utilizador autenticado.</summary>
    public static string IdUtilizador(this ClaimsPrincipal utilizador) =>
        utilizador.FindFirstValue(ClaimsDoFirebase.UserId)
        ?? utilizador.FindFirstValue(ClaimsDoFirebase.Sub)
        ?? throw new InvalidOperationException("O token não tem o id do utilizador (user_id/sub).");

    /// <summary>
    /// O email da sessão, só se o Firebase o confirmou (<c>email_verified</c> = true); senão null.
    /// É o que prova que a pessoa é dona do email (o email do perfil na app pode ser mudado à vontade).
    /// </summary>
    public static string? EmailVerificado(this ClaimsPrincipal utilizador) =>
        string.Equals(utilizador.FindFirstValue(ClaimsDoFirebase.EmailVerificado), "true", StringComparison.OrdinalIgnoreCase)
            ? utilizador.FindFirstValue(ClaimsDoFirebase.Email)
            : null;
}
