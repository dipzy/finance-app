using Financas.DAL.Entidades;
using Financas.Services.Dtos;

namespace Financas.Services.Regras;

/// <summary>Regras puras das contribuições manuais das poupanças (sem base de dados; o mês de hoje é parâmetro).</summary>
public static class RegrasPoupancas
{
    /// <summary>Quantos meses para trás se avisa de uma contribuição que ficou por enviar.</summary>
    public const int MesesEmAtraso = 3;

    /// <summary>Os meses a verificar: os <paramref name="quantos"/> anteriores ao atual, do mais antigo para o mais recente.</summary>
    public static IReadOnlyList<string> MesesAVerificar(string mesAtual, int quantos = MesesEmAtraso) =>
        [.. Enumerable.Range(0, Math.Max(0, quantos)).Select(i => Meses.Somar(mesAtual, i - quantos))];

    /// <summary>
    /// Os meses (já fechados, dos últimos <paramref name="quantos"/>) em que uma poupança de contribuição manual
    /// não recebeu a sua contribuição. Só contam os meses a partir de <see cref="Poupanca.Inicio"/>; sem início
    /// (não devia acontecer) não se sabe desde quando conta, por isso não há nenhum. As automáticas saem sozinhas.
    /// </summary>
    public static IReadOnlyList<string> MesesPorEnviar(Poupanca poupanca, IReadOnlySet<string> mesesEnviados, string mesAtual, int quantos = MesesEmAtraso)
    {
        if (poupanca.ContribuicaoAutomatica || poupanca.Inicio is not { } inicio)
        {
            return [];
        }

        return [.. MesesAVerificar(mesAtual, quantos).Where(mes =>
            Meses.AntesOuIgual(inicio, mes)
            && !mesesEnviados.Contains(mes)
            && poupanca.UltimaContribuicaoMes != mes)];
    }

    // ---- Juros ----

    /// <summary>O mais longe que uma projeção vai (50 anos).</summary>
    public const int MaximoMesesProjecao = 600;

    /// <summary>
    /// Os juros de um mês sobre o saldo: a taxa anual dividida por 12 (capitalização mensal), menos o imposto retido.
    /// <paramref name="fracao"/> é a parte do mês que conta (1 = o mês todo; menos no primeiro mês, que já ia a meio).
    /// </summary>
    public static (decimal Bruto, decimal Liquido) JurosDoMes(decimal saldo, decimal taxaAnual, decimal retencao, decimal fracao = 1m)
    {
        if (saldo <= 0m || taxaAnual <= 0m || fracao <= 0m)
        {
            return (0m, 0m);
        }

        var bruto = Calculos.Centimos(saldo * taxaAnual / 100m / 12m * fracao);
        return (bruto, Calculos.Centimos(bruto * (1m - Math.Clamp(retencao, 0m, 100m) / 100m)));
    }

    /// <summary>A parte do mês de <paramref name="desde"/> que conta para os juros (o dia de hoje incluído).</summary>
    public static decimal FracaoDoPrimeiroMes(DateOnly desde) =>
        (decimal)(DateTime.DaysInMonth(desde.Year, desde.Month) - desde.Day + 1) / DateTime.DaysInMonth(desde.Year, desde.Month);

    /// <summary>
    /// Os meses (já fechados) cujos juros ainda não foram somados ao saldo, do mais antigo para o mais recente.
    /// Só as poupanças com juros automáticos e taxa; começa no mês em que passaram a contar.
    /// </summary>
    public static IReadOnlyList<string> MesesDeJurosPorCreditar(Poupanca poupanca, string mesAtual)
    {
        if (!poupanca.JurosAutomaticos || poupanca.TaxaAnual is not > 0m || poupanca.JurosDesde is not { } desde)
        {
            return [];
        }

        var mes = poupanca.JurosCreditadosAte is { } ultimo ? Meses.Seguinte(ultimo) : Meses.De(desde);
        var lista = new List<string>();
        while (Meses.Antes(mes, mesAtual) && lista.Count < MaximoMesesProjecao)
        {
            lista.Add(mes);
            mes = Meses.Seguinte(mes);
        }

        return lista;
    }

    /// <summary>
    /// Quanto vale uma poupança daqui a <paramref name="meses"/> meses: em cada mês rende juros sobre o saldo
    /// e no fim dele entra a contribuição mensal. O ponto 0 é o saldo de hoje.
    /// </summary>
    public static ResultadoProjecao Projetar(decimal saldoInicial, decimal contribuicaoMensal, decimal taxaAnual, decimal retencao, int meses)
    {
        var saldo = Calculos.Centimos(saldoInicial);
        var contribuicao = Math.Max(0m, Calculos.Centimos(contribuicaoMensal));
        var pontos = new List<PontoProjecao>(meses + 1) { new(0, saldo) };
        decimal brutos = 0m, liquidos = 0m;
        for (var i = 1; i <= meses; i++)
        {
            var (bruto, liquido) = JurosDoMes(saldo, taxaAnual, retencao);
            brutos += bruto;
            liquidos += liquido;
            saldo = Calculos.Centimos(saldo + liquido + contribuicao);
            pontos.Add(new PontoProjecao(i, saldo));
        }

        return new ResultadoProjecao(saldo, Calculos.Centimos(contribuicao * meses), Calculos.Centimos(brutos), Calculos.Centimos(liquidos), pontos);
    }

    /// <summary>Um mês que se pode regularizar agora: um dos últimos meses fechados, a partir do início da poupança.</summary>
    public static bool PodeRegularizar(Poupanca poupanca, string mes, string mesAtual, int quantos = MesesEmAtraso) =>
        poupanca.Inicio is { } inicio
        && Meses.AntesOuIgual(inicio, mes)
        && MesesAVerificar(mesAtual, quantos).Contains(mes);
}
