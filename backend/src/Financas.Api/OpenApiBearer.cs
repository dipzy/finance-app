using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Financas.Api;

/// <summary>
/// Acrescenta ao documento OpenAPI que a API usa tokens Bearer (o ID token do Firebase),
/// para o Scalar mostrar onde se cola o token ao experimentar os endpoints.
/// </summary>
internal sealed class OpenApiBearer : IOpenApiDocumentTransformer
{
    public Task TransformAsync(OpenApiDocument documento, OpenApiDocumentTransformerContext contexto, CancellationToken ct)
    {
        documento.Info.Title = "Finanças API";
        documento.Info.Description = "API da app Finanças. Autenticação: ID token do Firebase (Authorization: Bearer <token>).";

        documento.Components ??= new OpenApiComponents();
        documento.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
        documento.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Description = "ID token do Firebase (auth.currentUser.getIdToken())",
        };
        documento.Security ??= [];
        documento.Security.Add(new OpenApiSecurityRequirement { [new OpenApiSecuritySchemeReference("Bearer", documento)] = [] });
        return Task.CompletedTask;
    }
}
