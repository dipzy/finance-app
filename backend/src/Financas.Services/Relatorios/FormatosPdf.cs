using System.Globalization;
using Financas.Services;
using Financas.Services.Regras;

namespace Financas.Services.Relatorios;

/// <summary>Números, datas e meses escritos à portuguesa (pt-PT), sem depender da cultura do servidor.
/// Os nomes dos meses seguem a linguagem do pedido (ver <see cref="Textos"/>).</summary>
internal static class FormatosPdf
{
    private static readonly string[] NomesMeses =
    [
        "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    ];

    private static readonly string[] NomesMesesEn =
    [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];

    private static string[] NomesDosMeses => Textos.Linguagem == "en" ? NomesMesesEn : NomesMeses;

    // Separador de milhares: espaço que não parte a linha; decimais com vírgula
    private static readonly NumberFormatInfo Numeros = new()
    {
        NumberDecimalSeparator = ",",
        NumberGroupSeparator = " ",
        NegativeSign = "-",
    };

    /// <summary>1234.5 → "1 234,50 €".</summary>
    public static string Euro(decimal valor) => valor.ToString("#,##0.00", Numeros) + " €";

    /// <summary>Para os eixos: 1500 → "1,5 mil €", 300 → "300 €".</summary>
    public static string EuroCompacto(decimal valor) =>
        Math.Abs(valor) >= 1000
            ? (valor / 1000m).ToString("#,##0.##", Numeros) + " mil €"
            : valor.ToString("#,##0", Numeros) + " €";

    /// <summary>12.5 → "12,5%".</summary>
    public static string Percentagem(decimal valor) => valor.ToString("0.#", Numeros) + "%";

    /// <summary>"2026-10" → "Outubro 2026" ("October 2026" em inglês).</summary>
    public static string MesAno(string mes)
    {
        var nome = NomesDosMeses[Meses.NumeroDoMes(mes) - 1];
        return $"{char.ToUpperInvariant(nome[0])}{nome[1..]} {mes[..4]}";
    }

    /// <summary>"2026-10" → "out 26" (os rótulos do gráfico da evolução).</summary>
    public static string MesCurto(string mes) => $"{NomesDosMeses[Meses.NumeroDoMes(mes) - 1][..3]} {mes[2..4]}";

    /// <summary>05/10.</summary>
    public static string DiaMes(DateOnly data) => data.ToString("dd'/'MM", CultureInfo.InvariantCulture);

    /// <summary>05/10/2026.</summary>
    public static string Data(DateOnly data) => data.ToString("dd'/'MM'/'yyyy", CultureInfo.InvariantCulture);
}

/// <summary>As cores do relatório: fundo claro (para imprimir) com os acentos da app.</summary>
internal static class Cores
{
    public const string Ciano = "#00B8D4";
    public const string Violeta = "#7C5CFF";

    public const string Texto = "#14213D";
    public const string TextoSecundario = "#5B6B85";
    public const string Linha = "#E3E8F0";
    public const string Eixo = "#B8C2D3";
    public const string FundoCartao = "#F5F8FC";
    public const string Destaque = "#EAF8FB";
    public const string Positivo = "#00875A";
    public const string Negativo = "#D6336C";
    public const string Aviso = "#B7791F";

    // As séries, com o mesmo significado das cores da app (mais escuras, para papel branco)
    public const string Entrou = "#00A86B";
    public const string DespesasMensais = "#E23D7A";
    public const string DespesasExtras = Violeta;
    public const string Poupado = "#E0A100";
    public const string Livre = Ciano;

    public static string DaFatia(string chave) => chave switch
    {
        "poupancas" => Poupado,
        "despesas" => DespesasMensais,
        "extras" => DespesasExtras,
        _ => Livre,
    };

    // As categorias das despesas extras: os mesmos tons da app (constants/tema.ts), mais escuros
    public static string DaCategoria(string categoria) => categoria switch
    {
        "supermercado" => "#00A86B",
        "restauracao" => "#F07A2A",
        "transportes" => "#3D8BEA",
        "combustivel" => "#D9A400",
        "casa" => Ciano,
        "saude" => "#E23D7A",
        "lazer" => Violeta,
        "compras" => "#C74FD6",
        "educacao" => "#6FA21C",
        "viagens" => "#17A398",
        "presentes" => "#E85D5D",
        _ => "#8B9BB4",
    };
}
