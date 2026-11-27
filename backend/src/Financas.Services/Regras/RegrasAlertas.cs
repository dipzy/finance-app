using System.Globalization;
using Financas.DAL.Entidades;

namespace Financas.Services.Regras;

/// <summary>Quando vence uma despesa ou prestação por pagar: o dia e quantos dias faltam (negativo = em atraso).</summary>
public sealed record Vencimento(DateOnly Dia, int Dias)
{
    public bool EmAtraso => Dias < 0;
}

/// <summary>
/// Regras puras dos alertas (sem base de dados; o "hoje" é parâmetro). O que dá um alerta:
/// <list type="bullet">
///   <item>orçamento do mês a 80% ou mais (aviso) ou a 100% ou mais (excedido): já calculado por <see cref="Calculos.CalcularOrcamento"/>;</item>
///   <item>despesa mensal (ou prestação de dívida) por pagar neste mês cujo dia de débito é daqui a
///   <see cref="DiasDeAviso"/> dias ou menos, ou que já passou;</item>
///   <item>objetivo de poupança "atrasado" (<see cref="Calculos.CalcularObjetivo"/>).</item>
/// </list>
/// </summary>
public static class RegrasAlertas
{
    /// <summary>Quantos dias antes do dia de débito se avisa (hoje conta: 0, 1, 2 e 3 dias).</summary>
    public const int DiasDeAviso = 3;

    /// <summary>
    /// O vencimento deste mês de uma despesa mensal, se merecer um alerta: está ativa neste mês, tem dia de
    /// débito, ainda não foi paga (um pagamento parcial conta como por pagar) e o dia é daqui a
    /// <see cref="DiasDeAviso"/> dias ou menos (incluindo os que já passaram). Senão, null.
    /// </summary>
    public static Vencimento? VencimentoPorPagar(DespesaFixa fixa, IEnumerable<PagamentoFixa> pagamentosDoMes, DateOnly hoje)
    {
        var mes = Meses.De(hoje);
        if (fixa.DiaDebito is not > 0 || !Calculos.AtivaNoMes(fixa, mes))
        {
            return null;
        }

        if (Calculos.EstadoNoMes(fixa, pagamentosDoMes, mes) == EstadoFixa.Pago)
        {
            return null;
        }

        var dia = new DateOnly(hoje.Year, hoje.Month, Calculos.DiaEfetivo(fixa.DiaDebito.Value, hoje));
        var dias = dia.DayNumber - hoje.DayNumber;
        return dias <= DiasDeAviso ? new Vencimento(dia, dias) : null;
    }

    /// <summary>"550,00 €" em português; "550.00 €" em inglês.</summary>
    public static string Euros(decimal valor)
    {
        var texto = Calculos.Centimos(valor).ToString("0.00", CultureInfo.InvariantCulture);
        return (Textos.Linguagem == "en" ? texto : texto.Replace('.', ',')) + " €";
    }

    /// <summary>"85" ou "87,5" (em inglês "87.5"): uma percentagem sem zeros a mais.</summary>
    public static string Percentagem(decimal valor)
    {
        var texto = Math.Round(valor, 1, MidpointRounding.AwayFromZero).ToString("0.#", CultureInfo.InvariantCulture);
        return Textos.Linguagem == "en" ? texto : texto.Replace('.', ',');
    }

    /// <summary>"hoje", "amanhã" ou "dia 12" (traduzido).</summary>
    public static string QuandoVence(Vencimento vencimento) => vencimento.Dias switch
    {
        0 => Textos.T("hoje"),
        1 => Textos.T("amanhã"),
        _ => Textos.T($"dia {vencimento.Dia.Day}"),
    };
}
