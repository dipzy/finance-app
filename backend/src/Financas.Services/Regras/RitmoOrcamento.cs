using Financas.DAL.Entidades;

namespace Financas.Services.Regras;

/// <summary>
/// O ritmo a que um orçamento se gasta ao longo do mês, para avisar antes de ele estourar (sem base de
/// dados; o "hoje" é parâmetro).
/// <code>
///   Previsto = fixas já pagas na categoria + gastos do dia a dia ÷ dia de hoje × dias do mês
///   % do mês = dia de hoje ÷ dias do mês
/// </code>
/// As despesas mensais pagas (renda, seguro...) são pontuais: não se repetem todos os dias, por isso
/// ficam fora do ritmo e só se somam ao fim. Só o gasto do dia a dia é projetado.
/// <para>
/// Há aviso de ritmo quando o orçamento ainda está "ok" (abaixo dos 80%: aí já há o aviso normal) e, ao mesmo tempo:
/// passaram pelo menos <see cref="DiaMinimo"/> dias (antes disso um só gasto distorce tudo), já se gastou pelo
/// menos <see cref="GastoMinimo"/>% do limite, o gasto vai pelo menos <see cref="Folga"/> pontos percentuais
/// à frente do mês, e o previsto passa mesmo o limite.
/// </para>
/// </summary>
public static class RitmoOrcamento
{
    /// <summary>Só a partir deste dia do mês se avisa (um jantar no dia 2 não diz nada sobre o mês).</summary>
    public const int DiaMinimo = 5;

    /// <summary>Percentagem mínima do limite já gasta para avisar.</summary>
    public const decimal GastoMinimo = 50m;

    /// <summary>Pontos percentuais a mais do que a parte do mês já decorrida (70% gasto a 50% do mês = 20 pontos).</summary>
    public const decimal Folga = 15m;

    /// <summary>Quanto se terá gasto no fim do mês a este ritmo (o gasto do dia a dia estica; o fixo fica como está).</summary>
    public static decimal Prever(decimal gastoDiaADia, decimal gastoFixo, DateOnly hoje) =>
        Calculos.Centimos(gastoFixo + gastoDiaADia / hoje.Day * DateTime.DaysInMonth(hoje.Year, hoje.Month));

    /// <summary>A parte do mês que já passou (hoje conta), em %, com uma casa decimal. Dia 15 de 30 = 50.</summary>
    public static decimal PercentagemDoMes(DateOnly hoje) =>
        Math.Round(hoje.Day * 100m / DateTime.DaysInMonth(hoje.Year, hoje.Month), 1, MidpointRounding.AwayFromZero);

    /// <summary>Este orçamento merece um aviso de ritmo (ver as condições acima)?</summary>
    public static bool Aviso(decimal gasto, decimal limite, decimal previsto, EstadoOrcamento estado, DateOnly hoje)
    {
        if (estado != EstadoOrcamento.Ok || limite <= 0 || hoje.Day < DiaMinimo)
        {
            return false;
        }

        var percentagem = gasto * 100m / limite;
        return percentagem >= GastoMinimo
            && percentagem - PercentagemDoMes(hoje) >= Folga
            && previsto > limite;
    }
}

/// <summary>Como está um objetivo de poupança face ao ritmo a que se está mesmo a poupar.</summary>
/// <param name="ContribuicaoMensal">O que a poupança ligada recebe por mês.</param>
/// <param name="Diferenca">Contribuição − o necessário por mês (positivo: vai à frente; negativo: falta por mês).</param>
/// <param name="MesPrevisto">O mês em que o objetivo é atingido a este ritmo; <c>null</c> se não chega (contribuição 0) ou se demora mais de 50 anos.</param>
public sealed record RitmoObjetivo(decimal ContribuicaoMensal, decimal Diferenca, string? MesPrevisto);

public static class RitmoObjetivos
{
    /// <summary>Máximo de meses que se projeta (50 anos): mais do que isto não é um objetivo, é um desejo.</summary>
    public const int MaximoMeses = 600;

    /// <summary>
    /// Compara o necessário por mês (<see cref="SituacaoObjetivo.ValorPorMes"/>) com o que se poupa de facto.
    /// <code>
    ///   Meses necessários = em falta ÷ contribuição, arredondado para cima
    ///   Mês previsto      = o mês atual + meses necessários - 1  (a contribuição deste mês ainda conta, como no valor por mês)
    /// </code>
    /// Os juros não entram: a projeção é só do que se põe de lado (um objetivo já atingido não tem projeção).
    /// </summary>
    public static RitmoObjetivo Comparar(decimal emFalta, decimal valorPorMes, decimal contribuicaoMensal, string mesAtual)
    {
        var contribuicao = Calculos.Centimos(Math.Max(0m, contribuicaoMensal));
        var diferenca = Calculos.Centimos(contribuicao - valorPorMes);
        if (emFalta <= 0 || contribuicao <= 0)
        {
            return new RitmoObjetivo(contribuicao, diferenca, null);
        }

        var meses = Math.Ceiling(emFalta / contribuicao);
        return new RitmoObjetivo(
            contribuicao,
            diferenca,
            meses > MaximoMeses ? null : Meses.Somar(mesAtual, (int)meses - 1));
    }
}
