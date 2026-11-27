using System.Text.Json;
using System.Text.Json.Serialization;
using Financas.Api;
using Financas.Api.Autenticacao;
using Financas.Api.Erros;
using Financas.Api.Limites;
using Financas.Api.Middleware;
using Financas.Api.Registos;
using Financas.DAL;
using Financas.Services;
using Financas.Services.Dtos;
using Microsoft.AspNetCore.Mvc;
using Scalar.AspNetCore;

// Composition root: aqui juntam-se as três camadas (Api -> Services -> DAL) e configura-se o HTTP.
var builder = WebApplication.CreateBuilder(args);

// O Render (e outros alojamentos) dizem em que porta escutar através da variável PORT
if (int.TryParse(builder.Configuration["PORT"], out var porta))
{
    builder.WebHost.ConfigureKestrel(kestrel => kestrel.ListenAnyIP(porta));
}

// ---- Sentry (erros): só com Sentry__Dsn; sem DSN fica desligado. Sem dados pessoais: sem PII, sem corpos dos pedidos ----
if (RegistosPedidos.SentryAtivo(builder.Configuration))
{
    IntegracaoSentry.LigarAoHost(builder);
}

// ---- Logs (Serilog, secção "Serilog" do appsettings) ----
builder.Services.AddRegistos(builder.Configuration);

// ---- Camadas ----
builder.Services.AddDal(builder.Configuration); // EF Core, repositórios, unidade de trabalho
builder.Services.AddServices(builder.Configuration); // regras de negócio

// Relatório PDF (QuestPDF): licença Community e a letra Inter, uma vez no arranque
Financas.Services.Relatorios.ConfiguracaoPdf.Configurar();

// ---- HTTP: JSON, erros, autenticação, CORS, OpenAPI ----

// JSON como a app espera: camelCase (por defeito), enums como texto ("pago", "anual"),
// sem os campos null (ficam "undefined" no TypeScript). DateOnly sai como "2026-10-05".
void ConfigurarJson(JsonSerializerOptions json)
{
    json.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    json.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
}

builder.Services
    .AddControllers()
    .AddJsonOptions(opcoes => ConfigurarJson(opcoes.JsonSerializerOptions))
    .ConfigureApiBehaviorOptions(opcoes =>
    {
        // DTO inválido -> 400 com ValidationProblemDetails e título traduzido (pt por omissão).
        // Os campos vêm com os nomes do JSON ("titulo", não "Titulo"), como a app os envia
        opcoes.InvalidModelStateResponseFactory = contexto =>
            new BadRequestObjectResult(new ValidationProblemDetails(
                contexto.ModelState
                    .Where(campo => campo.Value?.Errors.Count > 0)
                    .ToDictionary(
                        campo => NomeCampo.Json(campo.Key),
                        campo => campo.Value!.Errors.Select(e => Textos.T(e.ErrorMessage)).ToArray()))
            {
                Status = StatusCodes.Status400BadRequest,
                Title = Textos.T("Dados inválidos"),
                Instance = contexto.HttpContext.Request.Path,
            })
            {
                ContentTypes = { "application/problem+json" },
            };
    });
builder.Services.ConfigureHttpJsonOptions(opcoes => ConfigurarJson(opcoes.SerializerOptions));

builder.Services.AddProblemDetails(opcoes => opcoes.CustomizeProblemDetails = TitulosProblemas.Traduzir);
builder.Services.AddExceptionHandler<TratadorExcecoes>();

builder.Services.AddAutenticacaoFirebase(builder.Configuration, builder.Environment);

// Só a app (web e Expo em desenvolvimento) pode chamar a API a partir de um browser
var origens = builder.Configuration.GetSection("Cors:Origens").Get<string[]>() ?? [];
builder.Services.AddCors(cors => cors.AddDefaultPolicy(politica => politica
    .WithOrigins(origens)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .SetPreflightMaxAge(TimeSpan.FromHours(1))));

// Limites de pedidos por utilizador (429 a mais), secção "LimitesPedidos"
builder.Services.AddLimitesPedidos();

builder.Services.AddOpenApi(opcoes => opcoes.AddDocumentTransformer<OpenApiBearer>());

var app = builder.Build();

// Aplicar as migrações (PostgreSQL) ou criar as tabelas (SQLite) antes de aceitar pedidos
await app.Services.InicializarBaseDeDadosAsync();

if (!app.Environment.IsDevelopment() && app.Configuration.GetValue<bool>("Autenticacao:CabecalhoDesenvolvimento"))
{
    app.Logger.LogWarning("Autenticacao:CabecalhoDesenvolvimento só funciona em Development: ignorado.");
}

app.UseRegistoPedidos(); // uma linha de log por pedido (fora, para medir tudo)
app.UseIdioma(); // linguagem (pt/en) a partir do Accept-Language, para os erros e o PDF
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors();
app.UseAuthentication();
app.UseContextoRegistos(); // id do pedido e hash do utilizador em todos os logs
app.UseRateLimiter(); // depois da autenticação: o limite é por utilizador
app.UseAuthorization();

// Documento OpenAPI em /openapi/v1.json; em Development também a interface do Scalar em /scalar
app.MapOpenApi();
if (app.Environment.IsDevelopment())
{
    app.MapScalarApiReference();
}

// Para o Render saber que a API está viva e para o "keep-alive" (cron-job.org): não toca na base de dados
app.MapGet("/saude", () => TypedResults.Ok(new { estado = "ok" }))
    .AllowAnonymous()
    .WithName("Saude")
    .WithSummary("Estado da API (sem autenticação e sem base de dados)");

// Readiness: a API está pronta a servir pedidos? Testa a base de dados (SELECT 1, até 5 s): 200 se responde,
// 503 se não. Para o Render/monitorização quando se quer saber mais do que "o processo está vivo"
// (o /saude não toca na base de dados, para o keep-alive não a acordar nem a gastar horas na Neon)
app.MapGet("/saude/pronta", async (IVerificadorBaseDeDados baseDeDados, CancellationToken ct) =>
    await baseDeDados.EstaDisponivelAsync(TimeSpan.FromSeconds(5), ct)
        ? Results.Ok(new { estado = "pronta", baseDeDados = "ok" })
        : Results.Json(new { estado = "indisponivel", baseDeDados = "falha" }, statusCode: StatusCodes.Status503ServiceUnavailable))
    .AllowAnonymous()
    .WithName("SaudePronta")
    .WithSummary("Pronta para pedidos: testa a base de dados (200 ok / 503 sem base de dados)");

app.MapControllers();

await app.RunAsync();

/// <summary>Visível para os testes de integração (WebApplicationFactory&lt;Program&gt;).</summary>
public partial class Program;
