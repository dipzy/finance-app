using Financas.DAL.Entidades;

namespace Financas.Services.Regras;

/// <summary>
/// Regras puras dos gastos recorrentes: em que dias há repetição e quais ainda faltam gerar.
/// Sem base de dados nem relógio (o "hoje" vem por parâmetro), por isso testam-se diretamente.
/// </summary>
public static class Recorrencia
{
    /// <summary>
    /// Máximo de repetições geradas de uma vez por gasto (ex.: um café diário com a app fechada três
    /// meses): ficam só as mais recentes, as mais antigas não são geradas.
    /// </summary>
    public const int MaximoDeUmaVez = 62;

    /// <summary>O dia da semana como na ISO 8601: 1 = segunda ... 7 = domingo.</summary>
    public static int DiaSemanaIso(DateOnly dia) => ((int)dia.DayOfWeek + 6) % 7 + 1;

    /// <summary>O dia do mês a usar num mês: o pedido, ou o último dia nos meses mais curtos (31 → 30 de abril).</summary>
    public static int DiaNoMes(int diaMes, int ano, int mes) => Math.Min(Math.Max(diaMes, 1), DateTime.DaysInMonth(ano, mes));

    /// <summary>Os dias de repetição entre <paramref name="de"/> e <paramref name="ate"/>, inclusive, por ordem.</summary>
    public static List<DateOnly> Dias(Frequencia frequencia, int? diaSemana, int? diaMes, DateOnly de, DateOnly ate)
    {
        var dias = new List<DateOnly>();
        if (ate < de)
        {
            return dias;
        }

        switch (frequencia)
        {
            case Frequencia.Diaria:
                for (var d = de; d <= ate; d = d.AddDays(1)) dias.Add(d);
                break;

            case Frequencia.Semanal:
                var alvo = diaSemana ?? DiaSemanaIso(de);
                var primeiro = de.AddDays((alvo - DiaSemanaIso(de) + 7) % 7);
                for (var d = primeiro; d <= ate; d = d.AddDays(7)) dias.Add(d);
                break;

            case Frequencia.Mensal:
                var diaPedido = diaMes ?? de.Day;
                for (var mes = new DateOnly(de.Year, de.Month, 1); mes <= ate; mes = mes.AddMonths(1))
                {
                    var d = new DateOnly(mes.Year, mes.Month, DiaNoMes(diaPedido, mes.Year, mes.Month));
                    if (d >= de && d <= ate) dias.Add(d);
                }

                break;
        }

        return dias;
    }

    /// <summary>
    /// Os dias que ainda faltam gerar até <paramref name="hoje"/>: desde o dia a seguir à última geração
    /// (ou desde o início) até hoje ou ao fim, no máximo <see cref="MaximoDeUmaVez"/> (os mais recentes).
    /// Em pausa, nenhum.
    /// </summary>
    public static List<DateOnly> DiasEmFalta(GastoRecorrente gasto, DateOnly hoje)
    {
        if (!gasto.Ativo)
        {
            return [];
        }

        var de = gasto.UltimaGeracao is { } ultima && ultima >= gasto.Inicio ? ultima.AddDays(1) : gasto.Inicio;
        var dias = Dias(gasto.Frequencia, gasto.DiaSemana, gasto.DiaMes, de, Ate(gasto, hoje));
        return dias.Count <= MaximoDeUmaVez ? dias : dias[^MaximoDeUmaVez..];
    }

    /// <summary>O último dia que conta hoje: hoje, ou o fim do gasto se já passou.</summary>
    public static DateOnly Ate(GastoRecorrente gasto, DateOnly hoje) => gasto.Fim is { } fim && fim < hoje ? fim : hoje;
}
