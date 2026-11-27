using System.ComponentModel.DataAnnotations;
using Financas.Services.Regras;

namespace Financas.Services.Dtos;

// Atributos de validação dos DTOs, com mensagens em português (as dos atributos do .NET são em inglês).
// O [ApiController] valida-os sozinho e responde 400 com a lista de erros por campo.

/// <summary>O nome de um campo como aparece no JSON: "Titulo" -> "titulo", "Linhas[0].Valor" -> "linhas[0].valor".</summary>
public static class NomeCampo
{
    public static string Json(string nome) =>
        string.Join('.', nome.Split('.').Select(parte => System.Text.Json.JsonNamingPolicy.CamelCase.ConvertName(parte)));
}

/// <summary>Campo obrigatório (o [Required] do .NET, com a mensagem em português).</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter | AttributeTargets.Field)]
public sealed class ObrigatorioAttribute : RequiredAttribute
{
    public override string FormatErrorMessage(string name) => $"{NomeCampo.Json(name)}: obrigatório.";
}

/// <summary>Texto com um tamanho máximo (o [StringLength] do .NET, com a mensagem em português).</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter | AttributeTargets.Field)]
public sealed class MaximoAttribute(int maximo) : StringLengthAttribute(maximo)
{
    public override string FormatErrorMessage(string name) => $"{NomeCampo.Json(name)}: no máximo {MaximumLength} caracteres.";
}

/// <summary>Número inteiro entre dois valores (o [Range] do .NET, com a mensagem em português).</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter | AttributeTargets.Field)]
public sealed class EntreAttribute(int minimo, int maximo) : RangeAttribute(minimo, maximo)
{
    public override string FormatErrorMessage(string name) => $"{NomeCampo.Json(name)}: tem de ser entre {Minimum} e {Maximum}.";
}

/// <summary>Um mês no formato "AAAA-MM" (ex.: "2026-10"). Vazio/null é aceite (use [Obrigatorio] para obrigar).</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter | AttributeTargets.Field)]
public sealed class MesAttribute() : RegularExpressionAttribute(Meses.Padrao)
{
    public override string FormatErrorMessage(string name) => $"{NomeCampo.Json(name)}: o mês tem de estar no formato AAAA-MM (ex.: 2026-10).";
}

/// <summary>Um valor em euros válido (até 9 999 999 999,99 €, positivo ou negativo).</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter | AttributeTargets.Field)]
public sealed class DinheiroAttribute : RangeAttribute
{
    public DinheiroAttribute()
        : base(typeof(decimal), "-9999999999.99", "9999999999.99")
    {
        // Os limites estão escritos com ponto: sem isto, num servidor em português (vírgula decimal)
        // o "9999999999.99" não se conseguia ler
        ParseLimitsInInvariantCulture = true;
        ConvertValueInInvariantCulture = true;
    }

    public override string FormatErrorMessage(string name) => $"{NomeCampo.Json(name)}: valor fora dos limites.";
}

/// <summary>Um valor em euros que não pode ser negativo.</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter | AttributeTargets.Field)]
public sealed class DinheiroPositivoAttribute : RangeAttribute
{
    public DinheiroPositivoAttribute()
        : base(typeof(decimal), "0", "9999999999.99")
    {
        ParseLimitsInInvariantCulture = true;
        ConvertValueInInvariantCulture = true;
    }

    public override string FormatErrorMessage(string name) => $"{NomeCampo.Json(name)}: o valor não pode ser negativo (máximo 9 999 999 999,99).";
}

/// <summary>Um valor em euros maior que zero (ex.: o limite de um orçamento ou o valor de um objetivo).</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter | AttributeTargets.Field)]
public sealed class DinheiroMaiorQueZeroAttribute : RangeAttribute
{
    public DinheiroMaiorQueZeroAttribute()
        : base(typeof(decimal), "0.01", "9999999999.99")
    {
        ParseLimitsInInvariantCulture = true;
        ConvertValueInInvariantCulture = true;
    }

    public override string FormatErrorMessage(string name) => $"{NomeCampo.Json(name)}: tem de ser maior que zero (máximo 9 999 999 999,99).";
}

/// <summary>Uma das categorias das despesas extras (ver <see cref="Categorias"/>). Vazio/null é aceite (use [Obrigatorio] para obrigar).</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter | AttributeTargets.Field)]
public sealed class CategoriaAttribute : ValidationAttribute
{
    public override bool IsValid(object? value) => value is null || (value is string categoria && Categorias.EValida(categoria));

    public override string FormatErrorMessage(string name) =>
        $"{NomeCampo.Json(name)}: categoria desconhecida (usa uma destas: {string.Join(", ", Categorias.Todas)}).";
}

/// <summary>Uma percentagem entre 0 e 100 (ex.: a taxa anual de um crédito, 3,3).</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter | AttributeTargets.Field)]
public sealed class PercentagemAttribute : RangeAttribute
{
    public PercentagemAttribute()
        : base(typeof(decimal), "0", "100")
    {
        ParseLimitsInInvariantCulture = true;
        ConvertValueInInvariantCulture = true;
    }

    public override string FormatErrorMessage(string name) => $"{NomeCampo.Json(name)}: a percentagem tem de ser entre 0 e 100.";
}
