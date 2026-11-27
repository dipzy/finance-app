namespace Financas.Services.Dtos;

// ---- Regras de categorização automática ----

/// <summary>Uma regra do utilizador: se a descrição contiver o texto (sem maiúsculas nem acentos), a categoria é esta.</summary>
public sealed record RegraCategoriaDto(string Id, string Texto, string Categoria, bool Ativa, int Prioridade);

/// <summary>Uma das regras que vêm com a aplicação (só leitura).</summary>
public sealed record RegraPadraoDto(string Texto, string Categoria);

/// <summary>Nova regra. Sem <c>ativa</c> fica ativa; sem <c>prioridade</c> fica 0 (maior ganha).</summary>
public sealed record NovaRegraCategoriaPedido(
    [Obrigatorio, Maximo(100)] string Texto,
    [Obrigatorio, Categoria] string Categoria,
    bool? Ativa = null,
    [Entre(-1000, 1000)] int? Prioridade = null);

// ---- Apagar a conta ----

/// <summary>Pedido para apagar a conta e todos os dados: <c>confirmacao</c> tem de ser exatamente "APAGAR".</summary>
public sealed record ApagarContaPedido([Obrigatorio] string? Confirmacao);
