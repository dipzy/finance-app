using Financas.DAL.Entidades;

namespace Financas.Services.Regras;

/// <summary>Uma categoria em que o mês já gastou bem mais do que costuma.</summary>
/// <param name="GastoAtual">O gasto da categoria no mês até hoje.</param>
/// <param name="Media">A média mensal dos meses anteriores em que houve gasto (até 3).</param>
/// <param name="Subida">Quanto o gasto atual está acima da média, em %.</param>
public sealed record CategoriaAcimaDaMedia(string Categoria, decimal GastoAtual, decimal Media, decimal Subida);

/// <summary>Uma despesa mensal que este mês custou bem mais do que costuma (ex.: a eletricidade).</summary>
public sealed record DespesaFixaMaisCara(string FixaId, string Titulo, decimal Valor, decimal Media, decimal Subida, DateOnly Data);

/// <summary>Um gasto muito acima do que é normal naquela categoria.</summary>
/// <param name="Mediana">O gasto típico da categoria (a mediana dos gastos dos meses anteriores).</param>
public sealed record GastoIncomum(string Id, string Titulo, string Categoria, decimal Valor, decimal Mediana, DateOnly Data);

/// <summary>
/// Regras puras (sem base de dados) para encontrar gastos fora do normal, sempre em comparação com os últimos
/// <see cref="MesesDeHistorico"/> meses do próprio utilizador. São de propósito conservadoras (limiares e mínimos em
/// euros): é melhor calar-se do que avisar de tudo.
/// <list type="bullet">
///   <item><b>Categorias</b>: o gasto do mês até hoje já passa a média de um mês inteiro em
///   <see cref="LimiarCategoria"/>% ou mais (a comparar só com meses em que houve gasto, e só com 2 ou mais);</item>
///   <item><b>Despesas mensais</b>: o que se pagou este mês passa a média dos pagamentos anteriores em
///   <see cref="LimiarDespesaFixa"/>% ou mais;</item>
///   <item><b>Gastos isolados</b>: um gasto dos últimos dias que é pelo menos <see cref="MultiploIncomum"/> vezes o
///   gasto típico da categoria.</item>
/// </list>
/// </summary>
public static class GastosAnormais
{
    public const int MesesDeHistorico = 3;

    /// <summary>Quanto mais que a média (em %) uma categoria tem de ter gasto no mês.</summary>
    public const decimal LimiarCategoria = 40m;

    /// <summary>Quanto mais que a média (em %) uma despesa mensal tem de ter custado. É menor porque estas despesas costumam ser estáveis.</summary>
    public const decimal LimiarDespesaFixa = 30m;

    /// <summary>Abaixo disto (em €) a diferença não interessa, por maior que seja a percentagem.</summary>
    public const decimal MinimoAumentoCategoria = 15m;

    public const decimal MinimoAumentoDespesaFixa = 5m;

    /// <summary>Uma categoria com média abaixo disto (em €) é pequena demais para avisar.</summary>
    public const decimal MinimoMediaCategoria = 10m;

    /// <summary>Quantas vezes o gasto típico tem de ser um gasto isolado para ser "incomum".</summary>
    public const decimal MultiploIncomum = 3m;

    /// <summary>Um gasto isolado abaixo disto (em €) nunca é incomum.</summary>
    public const decimal MinimoGastoIncomum = 50m;

    /// <summary>Quantos gastos da categoria no histórico são precisos para saber o que é típico.</summary>
    public const int MinimoGastosParaTipico = 5;

    /// <summary>Só se avisa de gastos isolados dos últimos dias.</summary>
    public const int DiasRecentes = 3;

    /// <summary>
    /// As categorias do <paramref name="mes"/> (até hoje) acima da média dos meses anteriores, da maior
    /// subida em euros para a menor.
    /// </summary>
    public static IReadOnlyList<CategoriaAcimaDaMedia> CategoriasAcimaDaMedia(IEnumerable<DespesaExtra> extras, string mes)
    {
        var historico = Meses.Ultimos(Meses.Anterior(mes), MesesDeHistorico);
        var porCategoria = extras
            .Where(e => e.Mes is not null && e.GastoRecorrenteId is null)
            .GroupBy(e => Categorias.DaDespesa(e.Categoria))
            .ToList();

        var resultado = new List<CategoriaAcimaDaMedia>();
        foreach (var grupo in porCategoria)
        {
            var atual = Calculos.Centimos(grupo.Where(e => e.Mes == mes).Sum(e => e.Valor));
            var anteriores = historico
                .Select(m => Calculos.Centimos(grupo.Where(e => e.Mes == m).Sum(e => e.Valor)))
                .Where(total => total > 0)
                .ToList();

            if (atual <= 0 || anteriores.Count < 2)
            {
                continue;
            }

            var media = Calculos.Centimos(anteriores.Average());
            var aumento = atual - media;
            if (media < MinimoMediaCategoria || aumento < MinimoAumentoCategoria)
            {
                continue;
            }

            var subida = Math.Round(aumento / media * 100m, 1, MidpointRounding.AwayFromZero);
            if (subida >= LimiarCategoria)
            {
                resultado.Add(new CategoriaAcimaDaMedia(grupo.Key, atual, media, subida));
            }
        }

        return [.. resultado.OrderByDescending(c => c.GastoAtual - c.Media).ThenBy(c => Categorias.Ordem(c.Categoria))];
    }

    /// <summary>
    /// As despesas mensais pagas no <paramref name="mes"/> por bem mais do que a média dos pagamentos dos meses
    /// anteriores (precisa de 2 ou mais). Pagamentos parciais não contam: o valor deles é só uma parte.
    /// </summary>
    public static IReadOnlyList<DespesaFixaMaisCara> DespesasFixas(IEnumerable<PagamentoFixa> pagamentos, string mes)
    {
        var historico = Meses.Ultimos(Meses.Anterior(mes), MesesDeHistorico).ToHashSet();
        var pagos = pagamentos.Where(p => p.Estado == EstadoPagamento.Pago && !p.Parcial).ToList();

        var resultado = new List<DespesaFixaMaisCara>();
        foreach (var atual in pagos.Where(p => p.Mes == mes && p.Valor > 0))
        {
            var anteriores = pagos
                .Where(p => p.FixaId == atual.FixaId && historico.Contains(p.Mes) && p.Valor > 0)
                .Select(p => p.Valor)
                .ToList();
            if (anteriores.Count < 2)
            {
                continue;
            }

            var media = Calculos.Centimos(anteriores.Average());
            var aumento = atual.Valor - media;
            if (media <= 0 || aumento < MinimoAumentoDespesaFixa)
            {
                continue;
            }

            var subida = Math.Round(aumento / media * 100m, 1, MidpointRounding.AwayFromZero);
            if (subida >= LimiarDespesaFixa)
            {
                resultado.Add(new DespesaFixaMaisCara(atual.FixaId, atual.Titulo, Calculos.Centimos(atual.Valor), media, subida, atual.Data));
            }
        }

        return [.. resultado.OrderByDescending(d => d.Valor - d.Media).ThenBy(d => d.Titulo, StringComparer.Ordinal)];
    }

    /// <summary>
    /// Os gastos dos últimos <see cref="DiasRecentes"/> dias que são muito maiores do que é típico na sua categoria
    /// (a mediana dos gastos dos meses anteriores). Não conta os gerados por gastos recorrentes (esses são esperados).
    /// </summary>
    public static IReadOnlyList<GastoIncomum> Isolados(IEnumerable<DespesaExtra> extras, DateOnly hoje)
    {
        var historico = Meses.Ultimos(Meses.Anterior(Meses.De(hoje)), MesesDeHistorico).ToHashSet();
        var lista = extras.Where(e => e.Data is not null && e.Valor > 0).ToList();

        var tipicoPorCategoria = lista
            .Where(e => e.Mes is not null && historico.Contains(e.Mes) && e.GastoRecorrenteId is null)
            .GroupBy(e => Categorias.DaDespesa(e.Categoria))
            .Where(g => g.Count() >= MinimoGastosParaTipico)
            .ToDictionary(g => g.Key, g => Mediana(g.Select(e => e.Valor)));

        var resultado = new List<GastoIncomum>();
        foreach (var gasto in lista.Where(e => e.GastoRecorrenteId is null && hoje.DayNumber - e.Data!.Value.DayNumber is >= 0 and < DiasRecentes))
        {
            var categoria = Categorias.DaDespesa(gasto.Categoria);
            if (gasto.Valor < MinimoGastoIncomum || !tipicoPorCategoria.TryGetValue(categoria, out var tipico) || tipico <= 0)
            {
                continue;
            }

            if (gasto.Valor >= tipico * MultiploIncomum)
            {
                resultado.Add(new GastoIncomum(gasto.Id, gasto.Titulo, categoria, Calculos.Centimos(gasto.Valor), Calculos.Centimos(tipico), gasto.Data!.Value));
            }
        }

        return [.. resultado.OrderByDescending(g => g.Valor).ThenBy(g => g.Id, StringComparer.Ordinal)];
    }

    private static decimal Mediana(IEnumerable<decimal> valores)
    {
        var ordenados = valores.Order().ToList();
        var meio = ordenados.Count / 2;
        return ordenados.Count % 2 == 1 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2m;
    }
}
