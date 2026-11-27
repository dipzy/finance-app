using System.Text.Json.Serialization;
using Financas.DAL.Entidades;
using Financas.Services.Dtos;

namespace Financas.Services.Regras;

/// <summary>Estado de uma despesa mensal num mês.</summary>
public enum EstadoFixa
{
    Pago,
    Parcial,
    PorPagar,
}

/// <summary>O que aconteceu a uma despesa num mês (do registo ou dos campos da versão anterior).</summary>
public sealed record RegistoNoMes(EstadoPagamento Estado, decimal Valor, bool Parcial = false);

/// <summary>Despesas mensais de um mês: o que já foi pago e o que falta pagar.</summary>
public sealed record TotaisFixas(decimal Debitadas, decimal PorDebitar, decimal Total);

/// <summary>Os dois saldos da app.</summary>
/// <param name="Disponivel">A conta corrente.</param>
/// <param name="Previsto">Disponível - despesas mensais ainda por pagar este mês - poupanças manuais por enviar (as que contam no previsto).</param>
/// <param name="PorPagar">As despesas mensais ainda por pagar este mês.</param>
/// <param name="PoupancasPorEnviar">As contribuições manuais deste mês ainda por enviar, das poupanças com "Contar no previsto".</param>
public sealed record Saldos(decimal Disponivel, decimal Previsto, decimal PorPagar, decimal PoupancasPorEnviar = 0m);

/// <summary>Quanto falta pagar de uma dívida.</summary>
/// <param name="MesesEmFalta"><c>null</c> quando não há prestação ligada.</param>
public sealed record EstadoDivida(decimal EmFalta, decimal Pago, int? MesesEmFalta);

/// <summary>Uma poupança a criar a partir da configuração antiga.</summary>
public sealed record PoupancaNova(string Nome, TipoContribuicao Tipo, string Valor, decimal Saldo, long Ordem);

/// <summary>Os totais de uma folha do mês (os mesmos do livro Excel e do Resumo do mês na app).</summary>
/// <param name="Lucro">Sem as linhas informativas (o cartão de alimentação).</param>
/// <param name="Sobra">Lucro - Despesas.</param>
/// <param name="TotalParaExtras">Sobra - Poupança.</param>
/// <param name="Total">Total para extras - Despesas do Mês.</param>
/// <param name="Previsao">Saldo Conta - Falta; sem Saldo Conta não há previsão.</param>
public sealed record TotaisDaFolha(
    decimal Lucro,
    decimal Despesas,
    decimal Poupanca,
    decimal DespesasMes,
    decimal Anual,
    decimal Sobra,
    decimal TotalParaExtras,
    decimal Total,
    decimal Falta,
    decimal? Previsao,
    decimal SaldoPoupanca,
    decimal TotalAPagar);

/// <summary>Quanto se gastou numa categoria (despesas extras).</summary>
public sealed record GastoCategoria(string Categoria, decimal Total, int Quantidade);

/// <summary>Um número de um mês comparado com o do mês anterior.</summary>
/// <param name="Diferenca">Atual - anterior, em euros (positivo = mais do que no mês anterior).</param>
/// <param name="Variacao">A diferença em % do anterior, com uma casa decimal; <c>null</c> quando o anterior é 0 ("novo").</param>
public sealed record Comparacao(decimal Atual, decimal Anterior, decimal Diferenca, decimal? Variacao);

/// <summary>Os gastos do dia a dia de uma categoria num mês comparados com os do mês anterior.</summary>
public sealed record ComparacaoCategoria(string Categoria, decimal Atual, decimal Anterior, decimal Diferenca, decimal? Variacao);

/// <summary>A estimativa dos gastos do dia a dia (pagos com a conta) daqui até ao fim do mês.</summary>
/// <param name="MediaDiaria">Média por dia dos gastos do dia a dia (sem os recorrentes ativos nem os pagos com o cartão).</param>
/// <param name="DiasRestantes">Os dias depois de hoje até ao fim do mês (no último dia, 0).</param>
/// <param name="Recorrentes">As próximas repetições dos gastos recorrentes ativos pagos com a conta, até ao fim do mês.</param>
/// <param name="Estimativa">Média diária × dias restantes + recorrentes.</param>
/// <param name="MesesBase">Quantos meses completos deram a média (0 = o ritmo deste mês, por não haver histórico).</param>
/// <param name="PorCategoria">A estimativa repartida por categoria (a maior primeiro): média da categoria × dias restantes + os recorrentes dela.</param>
/// <param name="PorCategoriaDoMes">O mesmo para o mês inteiro (média × dias do mês + os recorrentes do mês todo): quanto se gasta num mês normal em cada categoria.</param>
public sealed record EstimativaGastos(
    decimal MediaDiaria,
    int DiasRestantes,
    decimal Recorrentes,
    decimal Estimativa,
    int MesesBase,
    IReadOnlyList<EstimativaCategoria>? PorCategoria = null,
    IReadOnlyList<EstimativaCategoria>? PorCategoriaDoMes = null);

/// <summary>O que ainda se prevê gastar numa categoria até ao fim do mês.</summary>
public sealed record EstimativaCategoria(string Categoria, decimal Estimativa);

/// <summary>A estimativa dos gastos pagos com o cartão de alimentação daqui até ao fim do mês.</summary>
/// <param name="MediaDiaria">Média por dia dos gastos com o cartão (sem os recorrentes ativos).</param>
/// <param name="Recorrentes">As próximas repetições dos gastos recorrentes ativos pagos com o cartão, até ao fim do mês.</param>
/// <param name="Estimativa">Média diária × dias restantes + recorrentes.</param>
public sealed record EstimativaCartao(decimal MediaDiaria, decimal Recorrentes, decimal Estimativa);

/// <summary>Um valor em euros numa categoria (o que foi gasto, sem previsões). <c>Fixas</c> é a parte que é de despesas mensais.</summary>
public sealed record ValorCategoria(string Categoria, decimal Valor, decimal Fixas = 0m);

/// <summary>Como está um orçamento: ok, perto do limite (80% ou mais) ou ultrapassado (100% ou mais).</summary>
public enum EstadoOrcamento
{
    Ok,
    Perto,
    Ultrapassado,
}

/// <summary>Um orçamento num mês.</summary>
/// <param name="Restante">Quanto ainda se pode gastar (nunca negativo).</param>
/// <param name="Percentagem">Gasto / limite, em %, com uma casa decimal (pode passar de 100).</param>
public sealed record SituacaoOrcamento(decimal Gasto, decimal Limite, decimal Restante, decimal Percentagem, EstadoOrcamento Estado);

/// <summary>Como vai um objetivo de poupança.</summary>
public enum EstadoObjetivo
{
    /// <summary>Já tem pelo menos o que devia ter a esta altura (ou ainda agora começou).</summary>
    [JsonStringEnumMemberName("no-bom-caminho")]
    NoBomCaminho,

    /// <summary>Tem menos do que o ritmo certo até ao mês alvo pedia, ou o mês alvo já passou.</summary>
    [JsonStringEnumMemberName("atrasado")]
    Atrasado,

    [JsonStringEnumMemberName("atingido")]
    Atingido,
}

/// <summary>Os números de um objetivo de poupança.</summary>
/// <param name="Percentagem">Valor atual / alvo, em % (0-100), com uma casa decimal.</param>
/// <param name="MesesRestantes">Do mês atual até ao mês alvo, os dois incluídos (0 se o mês alvo já passou).</param>
/// <param name="ValorPorMes">Quanto pôr de lado por mês para lá chegar (arredondado ao cêntimo para cima).</param>
/// <param name="Esperado">Quanto devia ter a esta altura, a um ritmo constante desde o mês de início.</param>
public sealed record SituacaoObjetivo(
    decimal ValorAtual,
    decimal Percentagem,
    decimal EmFalta,
    int MesesRestantes,
    decimal ValorPorMes,
    decimal Esperado,
    EstadoObjetivo Estado);

/// <summary>
/// Regras de cálculo da app, sem base de dados: porte de <c>services/calculos.ts</c> (os mesmos
/// testes, em Financas.Services.Tests/CalculosTests.cs). O "hoje" é sempre parâmetro, para as
/// regras poderem ser testadas com qualquer data.
/// <code>
///   Saldo Disponível = conta corrente. Tudo o que sai ou entra mexe na conta:
///     - dia do salário: entra o salário e saem logo as contribuições das poupanças
///     - despesas mensais: saem quando são debitadas (fica um PagamentoFixa por mês)
///     - despesas extras: saem quando são registadas (e voltam se forem apagadas)
///   Saldo Previsto = Saldo Disponível - despesas mensais ainda por pagar este mês
///   Cartão de alimentação: só informativo, fora dos saldos
/// </code>
/// </summary>
public static class Calculos
{
    /// <summary>
    /// Arredonda ao cêntimo (meio cêntimo arredonda para longe do zero) e nunca devolve "-0".
    /// Com <c>decimal</c> não há os erros de vírgula flutuante do JavaScript (0.1 + 0.2 = 0.3
    /// exatamente), mas valores com mais casas (ex.: 10% de 12,35) têm de ser arredondados.
    /// </summary>
    public static decimal Centimos(decimal valor)
    {
        var arredondado = Math.Round(valor, 2, MidpointRounding.AwayFromZero);
        return arredondado == 0 ? 0m : arredondado;
    }

    // ---- Dias e meses ----

    /// <summary>Dia 29-31 em meses mais curtos passa para o último dia do mês (senão nunca chegava).</summary>
    public static int DiaEfetivo(int dia, DateOnly hoje) => Math.Min(dia, DateTime.DaysInMonth(hoje.Year, hoje.Month));

    // ---- Despesas mensais ----

    /// <summary>
    /// Uma despesa mensal conta nos meses entre o início e o fim (as antigas, sem início, contam
    /// sempre). As anuais só contam no seu mês de cada ano; sem mês escolhido não contam em nenhum.
    /// </summary>
    public static bool AtivaNoMes(DespesaFixa fixa, string mes)
    {
        if (fixa.EAnual && Meses.NumeroDoMes(mes) != fixa.MesAnual)
        {
            return false;
        }

        return (string.IsNullOrEmpty(fixa.Inicio) || Meses.AntesOuIgual(fixa.Inicio, mes))
            && (string.IsNullOrEmpty(fixa.Fim) || Meses.AntesOuIgual(mes, fixa.Fim));
    }

    /// <summary>
    /// O registo da despesa nesse mês. Inclui o que a versão anterior guardava na própria despesa
    /// (debitado/mesDebitado), para nunca pagar duas vezes antes de esses dados serem convertidos.
    /// </summary>
    public static RegistoNoMes? PagamentoNoMes(DespesaFixa fixa, IEnumerable<PagamentoFixa> pagamentosDoMes, string mes)
    {
        var registo = pagamentosDoMes.FirstOrDefault(p => p.FixaId == fixa.Id && p.Mes == mes);
        if (registo is not null)
        {
            return new RegistoNoMes(registo.Estado, registo.Valor, registo.Parcial);
        }

        if (fixa.Debitado == true && fixa.MesDebitado == mes)
        {
            return new RegistoNoMes(EstadoPagamento.Pago, fixa.Valor);
        }

        return null;
    }

    public static EstadoFixa EstadoNoMes(DespesaFixa fixa, IEnumerable<PagamentoFixa> pagamentosDoMes, string mes)
    {
        var pagamento = PagamentoNoMes(fixa, pagamentosDoMes, mes);
        return pagamento?.Estado switch
        {
            EstadoPagamento.Pago when pagamento.Parcial => EstadoFixa.Parcial,
            EstadoPagamento.Pago => EstadoFixa.Pago,
            _ => EstadoFixa.PorPagar,
        };
    }

    /// <summary>Débito à mão: a partir do dia de débito. Sem dia definido (despesas antigas), a qualquer altura.</summary>
    public static bool PodeDebitar(int? diaDebito, DateOnly hoje) =>
        diaDebito is not > 0 || hoje.Day >= DiaEfetivo(diaDebito.Value, hoje);

    /// <summary>
    /// Débito automático: só despesas com dia definido e o débito automático ligado, a contar este mês, já no dia, por pagar este mês
    /// e cujo pagamento não foi desfeito à mão este mês.
    /// </summary>
    public static bool DeveDebitarAutomaticamente(DespesaFixa fixa, IEnumerable<PagamentoFixa> pagamentosDoMes, DateOnly hoje)
    {
        var mes = Meses.De(hoje);
        // Uma despesa de valor variável só se paga com a fatura na mão (o valor real só se sabe nessa altura)
        return !fixa.Variavel
            && fixa.DebitoAutomatico
            && fixa.DiaDebito is > 0
            && AtivaNoMes(fixa, mes)
            && PagamentoNoMes(fixa, pagamentosDoMes, mes) is null
            && fixa.NaoDebitarAutomaticamenteEm != mes
            && fixa.AnuladoMes != mes
            && PodeDebitar(fixa.DiaDebito, hoje);
    }

    /// <summary>
    /// Despesas mensais de um mês: o que já foi pago (valor pago) e o que falta pagar (valor atual
    /// da despesa). Os pagamentos de despesas entretanto terminadas também contam: são histórico desse mês.
    /// </summary>
    public static TotaisFixas SepararDespesasFixas(
        IReadOnlyCollection<DespesaFixa> fixas,
        IReadOnlyCollection<PagamentoFixa> pagamentosDoMes,
        string mes)
    {
        var pagosRegistados = pagamentosDoMes.Where(p => p.Mes == mes && p.Estado == EstadoPagamento.Pago).Sum(p => p.Valor);
        // Pagos na versão anterior (marcados na própria despesa, ainda sem registo)
        var pagosAntigos = fixas
            .Where(f => !pagamentosDoMes.Any(p => p.FixaId == f.Id && p.Mes == mes) && f.Debitado == true && f.MesDebitado == mes)
            .Sum(f => f.Valor);
        var debitadas = pagosRegistados + pagosAntigos;
        var porDebitar = fixas
            .Where(f => AtivaNoMes(f, mes))
            .Sum(f =>
            {
                var pagamento = PagamentoNoMes(f, pagamentosDoMes, mes);
                if (pagamento?.Estado != EstadoPagamento.Pago) return f.Valor;
                return pagamento.Parcial ? Math.Max(0m, f.Valor - pagamento.Valor) : 0m;
            });
        return new TotaisFixas(Centimos(debitadas), Centimos(porDebitar), Centimos(debitadas + porDebitar));
    }

    /// <summary>
    /// Os dois saldos da app a partir da conta corrente, das despesas mensais do mês e (no mês atual)
    /// das contribuições manuais das poupanças ainda por enviar que contam no previsto.
    /// </summary>
    public static Saldos CalcularSaldos(
        decimal saldoConta,
        IReadOnlyCollection<DespesaFixa> fixas,
        IReadOnlyCollection<PagamentoFixa> pagamentosDoMes,
        string mes,
        decimal poupancasPorEnviar = 0m)
    {
        var disponivel = Centimos(saldoConta);
        var porDebitar = SepararDespesasFixas(fixas, pagamentosDoMes, mes).PorDebitar;
        poupancasPorEnviar = Centimos(poupancasPorEnviar);
        return new Saldos(disponivel, Centimos(disponivel - porDebitar - poupancasPorEnviar), porDebitar, poupancasPorEnviar);
    }

    /// <summary>Uma poupança de contribuição manual cuja contribuição do mês <paramref name="mes"/> ainda não foi enviada.</summary>
    public static bool PorEnviarNoMes(Poupanca poupanca, string mes) =>
        !poupanca.ContribuicaoAutomatica && poupanca.UltimaContribuicaoMes != mes;

    /// <summary>
    /// Quanto falta enviar este mês para as poupanças manuais com "Contar no previsto" (as automáticas
    /// saem sozinhas e as que não contam no previsto ficam de fora). As percentagens são do <paramref name="salario"/>.
    /// </summary>
    public static decimal PoupancasPorEnviar(IEnumerable<Poupanca> poupancas, string mes, decimal salario) =>
        Centimos(poupancas
            .Where(p => p.ContarNoPrevisto && PorEnviarNoMes(p, mes))
            .Sum(p => Math.Max(0m, ContribuicaoDe(p.Tipo, p.Valor, salario))));

    // ---- Salário e poupanças ----

    /// <summary>
    /// Valor do PPR ou da Poupança (configuração antiga): percentagem do salário ou valor fixo.
    /// Sem configuração usa as percentagens da 1.ª versão e por fim os valores por defeito.
    /// Campo vazio (ex.: a meio de escrever) usa o valor por defeito, mas "0" é mesmo 0%.
    /// </summary>
    private static decimal ValorConfigurado(
        TipoContribuicao? tipo,
        string? valor,
        string? percentagemAntiga,
        decimal percentagemDefeito,
        decimal salario)
    {
        if (tipo == TipoContribuicao.Valor)
        {
            return Formatos.ParseValor(valor);
        }

        var texto = tipo is not null ? valor : percentagemAntiga;
        var percentagem = string.IsNullOrWhiteSpace(texto) ? percentagemDefeito : Formatos.ParseValor(texto);
        return salario * (percentagem / 100m);
    }

    public static decimal CalcularPprComConfig(ConfiguracaoPprPoupanca? config, DadosFinanceirosAntigos? financeiro, decimal salario) =>
        ValorConfigurado(config?.PprTipo, config?.PprValor, financeiro?.PprPercentagem, 10m, salario);

    public static decimal CalcularPoupancaComConfig(ConfiguracaoPprPoupanca? config, DadosFinanceirosAntigos? financeiro, decimal salario) =>
        ValorConfigurado(config?.PoupancaTipo, config?.PoupancaValor, financeiro?.PoupancaPercentagem, 15m, salario);

    /// <summary>Salário configurado na tab Salário ou, se ainda não houver, o da versão anterior.</summary>
    public static decimal ValorSalarioBase(ConfiguracaoSalario? salario, DadosFinanceirosAntigos? financeiro) =>
        Formatos.ParseValor(string.IsNullOrEmpty(salario?.Valor) ? financeiro?.Salario : salario.Valor);

    /// <summary>
    /// O salário entra sozinho uma vez por mês, no dia de recebimento (29-31 passa para o último dia do mês). Com o
    /// recebimento manual ligado nunca entra sozinho: é a pessoa que o marca.
    /// "Este mês" é contado no fuso horário da app (Europe/Lisbon), tal como o "hoje".
    /// </summary>
    public static bool DeveReceberSalario(ConfiguracaoSalario? config, DateOnly hoje, TimeZoneInfo fuso)
    {
        if (config is null || config.RecebimentoManual || SalarioRecebidoNoMes(config, hoje, fuso))
        {
            return false;
        }

        return hoje.Day == DiaEfetivo(config.DiaRecebimento, hoje);
    }

    /// <summary>O salário já entrou no mês de <paramref name="hoje"/> (no fuso da app)?</summary>
    public static bool SalarioRecebidoNoMes(ConfiguracaoSalario? config, DateOnly hoje, TimeZoneInfo fuso)
    {
        if (config?.RecebidoEm is not { } ultimo)
        {
            return false;
        }

        var dataUltimo = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(ultimo, fuso).DateTime);
        return dataUltimo.Year == hoje.Year && dataUltimo.Month == hoje.Month;
    }

    /// <summary>Dias de segunda a sexta de um mês (feriados não contam como exceção).</summary>
    public static int DiasUteis(int ano, int mes)
    {
        var total = 0;
        for (var dia = 1; dia <= DateTime.DaysInMonth(ano, mes); dia++)
        {
            if (new DateOnly(ano, mes, dia).DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday))
            {
                total++;
            }
        }

        return total;
    }

    /// <summary>
    /// O que o cartão de alimentação carrega num mês: valor por dia útil vezes os dias úteis desse mês
    /// (se configurado), senão o valor fixo mensal.
    /// </summary>
    public static decimal CartaoDoMes(ConfiguracaoSalario? salario, DateOnly mes)
    {
        var porDia = Formatos.ParseValor(salario?.CartaoPorDiaUtil);
        return porDia > 0
            ? Centimos(porDia * DiasUteis(mes.Year, mes.Month))
            : Centimos(Formatos.ParseValor(salario?.CartaoAlimentacao));
    }

    /// <summary>Contribuição mensal de uma poupança: percentagem do salário ou valor fixo.</summary>
    public static decimal ContribuicaoDe(TipoContribuicao tipo, string? valor, decimal salario)
    {
        var numero = Formatos.ParseValor(valor);
        return Centimos(tipo == TipoContribuicao.Valor ? numero : salario * (numero / 100m));
    }

    private static bool EPpr(string nome) => Formatos.NormalizarTitulo(nome) == "ppr";

    /// <summary>
    /// No dia do salário entra o salário e saem logo as contribuições das poupanças, como
    /// transferências. Com a lista de poupanças (mesmo vazia = nenhuma contribuição) usa a lista;
    /// sem lista (dados ainda não convertidos), a configuração antiga (PPR + Poupança).
    /// </summary>
    public static Recebimento CalcularRecebimento(
        decimal salario,
        ConfiguracaoPprPoupanca? configPpr,
        DadosFinanceirosAntigos? financeiro,
        IReadOnlyList<Poupanca>? poupancas)
    {
        IReadOnlyList<Contribuicao> contribuicoes = poupancas is not null
            ? [.. poupancas
                .Where(p => p.ContribuicaoAutomatica && p.DiaContribuicao is null)
                .Select(p => new Contribuicao(p.Id, p.Nome, ContribuicaoDe(p.Tipo, p.Valor, salario)))]
            :
            [
                new Contribuicao(null, "PPR", Centimos(CalcularPprComConfig(configPpr, financeiro, salario))),
                new Contribuicao(null, "Poupança", Centimos(CalcularPoupancaComConfig(configPpr, financeiro, salario))),
            ];

        var ppr = Centimos(contribuicoes.Where(c => EPpr(c.Nome)).Sum(c => c.Valor));
        var total = Centimos(contribuicoes.Sum(c => c.Valor));
        return new Recebimento(salario, ppr, Centimos(total - ppr), Centimos(salario - total), contribuicoes);
    }

    /// <summary>
    /// A configuração antiga (PPR + Poupança, em % ou €) como lista de poupanças, para a conversão.
    /// Sem configuração nenhuma não cria nada: nenhuma contribuição sai da conta sem ser pedida.
    /// </summary>
    public static IReadOnlyList<PoupancaNova> PoupancasDaConfigAntiga(ConfiguracaoPprPoupanca? config, DadosFinanceirosAntigos? financeiro)
    {
        if (config is not null)
        {
            return
            [
                new PoupancaNova("PPR", config.PprTipo, config.PprValor, 0m, 0),
                new PoupancaNova("Poupança", config.PoupancaTipo, config.PoupancaValor, 0m, 1),
            ];
        }

        if (financeiro is not null)
        {
            return
            [
                new PoupancaNova("PPR", TipoContribuicao.Percentagem, string.IsNullOrEmpty(financeiro.PprPercentagem) ? "10" : financeiro.PprPercentagem, 0m, 0),
                new PoupancaNova("Poupança", TipoContribuicao.Percentagem, string.IsNullOrEmpty(financeiro.PoupancaPercentagem) ? "15" : financeiro.PoupancaPercentagem, 0m, 1),
            ];
        }

        return [];
    }

    // ---- Dívidas ----

    /// <summary>Quanto falta pagar: o valor em falta no mês "desde" menos as prestações pagas desde então.</summary>
    public static EstadoDivida CalcularDivida(Divida divida, IEnumerable<PagamentoFixa> pagamentosDaPrestacao, decimal? prestacao)
    {
        var pago = Centimos(pagamentosDaPrestacao
            .Where(p => p.FixaId == divida.FixaId && p.Estado == EstadoPagamento.Pago && Meses.AntesOuIgual(divida.Desde, p.Mes))
            .Sum(p => p.Valor));
        var emFalta = Math.Max(0m, Centimos(divida.ValorInicial - pago));
        int? mesesEmFalta = prestacao is > 0 ? (int)Math.Ceiling(Centimos(emFalta / prestacao.Value)) : null;
        return new EstadoDivida(emFalta, pago, mesesEmFalta);
    }

    // ---- Totais da folha do mês (porte de totaisFolha em services/calculos.ts) ----
    //   Sobra             = Lucro (sem as linhas informativas, como o cartão de alimentação) - Despesas
    //   Total para extras = Sobra - Poupança
    //   Total             = Total para extras - Despesas do Mês
    //   Previsão          = Saldo Conta - Falta (o que ainda falta pagar)
    // O bloco Anual é informativo

    private static decimal SomaLinhas(IEnumerable<LinhaFolhaDto> linhas) =>
        Centimos(linhas.Where(l => l.Informativo != true).Sum(l => l.Valor));

    /// <summary>
    /// O cartão de alimentação de um mês da folha: o que carrega por mês (a linha informativa "Alimen." do Lucro, que fica
    /// fora do salário) e o que se gastou com ele (as despesas do mês pagas com o cartão, que ficam fora dos totais da conta).
    /// </summary>
    public static (decimal Carregado, decimal Gasto) CartaoDaFolha(DadosFolhaMesDto folha) =>
    (
        Centimos(folha.Lucro.Where(l => l.Informativo == true).Sum(l => l.Valor)),
        Centimos(folha.DespesasMes.Where(l => l.CartaoAlimentacao == true).Sum(l => l.Valor))
    );

    public static TotaisDaFolha TotaisFolha(DadosFolhaMesDto folha)
    {
        var lucro = SomaLinhas(folha.Lucro);
        var despesas = SomaLinhas(folha.Despesas);
        var poupanca = SomaLinhas(folha.Poupanca);
        // Os gastos pagos com o cartão de alimentação não contam: o dinheiro do cartão é à parte do salário e da conta
        var despesasMes = SomaLinhas(folha.DespesasMes.Where(l => l.CartaoAlimentacao != true));
        var sobra = Centimos(lucro - despesas);
        var totalParaExtras = Centimos(sobra - poupanca);
        var falta = SomaLinhas(folha.Falta);
        return new TotaisDaFolha(
            lucro,
            despesas,
            poupanca,
            despesasMes,
            SomaLinhas(folha.Anual),
            sobra,
            totalParaExtras,
            Centimos(totalParaExtras - despesasMes),
            falta,
            folha.SaldoConta is { } saldo ? Centimos(saldo - falta) : null,
            SomaLinhas(folha.SaldoPoupanca),
            SomaLinhas(folha.TotalAPagar));
    }

    // ---- Categorias e orçamentos ----

    /// <summary>A partir desta percentagem do limite, o orçamento está "perto".</summary>
    public const decimal LimiarPerto = 80m;

    /// <summary>
    /// Quanto se gastou em cada categoria (as despesas sem categoria contam como "outros"), da que
    /// tem mais gastos para a que tem menos; as categorias sem gastos não aparecem.
    /// </summary>
    public static IReadOnlyList<GastoCategoria> GastosPorCategoria(IEnumerable<DespesaExtra> extras) =>
        GastosPorCategoria(extras, [], []);

    /// <summary>
    /// Como <see cref="GastosPorCategoria(IEnumerable{DespesaExtra})"/>, mas também com o que foi pago
    /// nas despesas mensais que têm categoria (o valor já pago, mesmo que só em parte). As despesas
    /// mensais sem categoria ficam de fora (renda, ginásio...: não é "outros"), para não encherem essa categoria.
    /// </summary>
    public static IReadOnlyList<GastoCategoria> GastosPorCategoria(
        IEnumerable<DespesaExtra> extras,
        IEnumerable<PagamentoFixa> pagamentosFixas,
        IEnumerable<DespesaFixa> fixas)
    {
        var categoriaDaFixa = fixas
            .Where(f => Categorias.EValida(f.Categoria))
            .ToDictionary(f => f.Id, f => f.Categoria!, StringComparer.Ordinal);
        var pagos = pagamentosFixas
            .Where(p => categoriaDaFixa.ContainsKey(p.FixaId))
            .Select(p => (Categoria: categoriaDaFixa[p.FixaId], p.Valor));

        return
        [
            .. extras
                .Select(e => (Categoria: Categorias.DaDespesa(e.Categoria), e.Valor))
                .Concat(pagos)
                .GroupBy(g => g.Categoria)
                .Select(g => new GastoCategoria(g.Key, Centimos(g.Sum(e => e.Valor)), g.Count()))
                .Where(g => g.Total != 0)
                .OrderByDescending(g => g.Total)
                .ThenBy(g => Categorias.Ordem(g.Categoria)),
        ];
    }

    /// <summary>
    /// Um orçamento num mês: ultrapassado quando o gasto chega ao limite (100%), perto a partir de
    /// <see cref="LimiarPerto"/>% do limite, senão ok. As comparações são feitas com os valores
    /// exatos (não com a percentagem arredondada).
    /// </summary>
    public static SituacaoOrcamento CalcularOrcamento(decimal gasto, decimal limite)
    {
        gasto = Centimos(gasto);
        limite = Centimos(limite);
        if (limite <= 0)
        {
            return new SituacaoOrcamento(gasto, limite, 0m, gasto > 0 ? 100m : 0m, gasto > 0 ? EstadoOrcamento.Ultrapassado : EstadoOrcamento.Ok);
        }

        var estado = gasto >= limite
            ? EstadoOrcamento.Ultrapassado
            : gasto * 100m >= limite * LimiarPerto
                ? EstadoOrcamento.Perto
                : EstadoOrcamento.Ok;
        var percentagem = Math.Round(gasto / limite * 100m, 1, MidpointRounding.AwayFromZero);
        return new SituacaoOrcamento(gasto, limite, Math.Max(0m, Centimos(limite - gasto)), percentagem, estado);
    }

    // ---- Comparação com o mês anterior ----

    /// <summary>A variação em % de <paramref name="anterior"/> para <paramref name="atual"/> (uma casa decimal); <c>null</c> se o anterior for 0.</summary>
    public static decimal? Variacao(decimal atual, decimal anterior) =>
        anterior == 0 ? null : Math.Round((atual - anterior) / Math.Abs(anterior) * 100m, 1, MidpointRounding.AwayFromZero);

    public static Comparacao Comparar(decimal atual, decimal anterior)
    {
        atual = Centimos(atual);
        anterior = Centimos(anterior);
        return new Comparacao(atual, anterior, Centimos(atual - anterior), Variacao(atual, anterior));
    }

    /// <summary>
    /// As despesas extras até ao dia <paramref name="dia"/> do mês, inclusive (para comparar o mês atual
    /// com os mesmos dias do mês anterior). As antigas sem data não entram.
    /// </summary>
    public static IEnumerable<DespesaExtra> AteAoDia(IEnumerable<DespesaExtra> extras, int dia) =>
        extras.Where(e => e.Data is { } d && d.Day <= dia);

    /// <summary>
    /// Cada categoria com gastos num dos dois meses: atual, anterior, diferença e variação (null = "novo").
    /// Da maior diferença (em valor absoluto, a subir ou a descer) para a menor; empates pela ordem das categorias.
    /// </summary>
    public static IReadOnlyList<ComparacaoCategoria> CompararCategorias(IEnumerable<GastoCategoria> atual, IEnumerable<GastoCategoria> anterior)
    {
        var deAgora = atual.ToDictionary(g => g.Categoria, g => g.Total);
        var deAntes = anterior.ToDictionary(g => g.Categoria, g => g.Total);
        return
        [
            .. deAgora.Keys.Union(deAntes.Keys)
                .Select(c =>
                {
                    var v = Comparar(deAgora.GetValueOrDefault(c), deAntes.GetValueOrDefault(c));
                    return new ComparacaoCategoria(c, v.Atual, v.Anterior, v.Diferenca, v.Variacao);
                })
                .Where(c => c.Atual != 0 || c.Anterior != 0)
                .OrderByDescending(c => Math.Abs(c.Diferenca))
                .ThenBy(c => Categorias.Ordem(c.Categoria)),
        ];
    }

    // ---- Previsão do fim do mês ----

    /// <summary>Quantos meses completos (no máximo) dão a média diária da previsão.</summary>
    public const int MesesMediaPrevisao = 3;

    /// <summary>
    /// Os gastos do dia a dia que ainda devem sair da conta até ao fim do mês de <paramref name="hoje"/>:
    /// <code>
    ///   Recorrentes  = as repetições dos gastos recorrentes ativos pagos com a conta, de amanhã ao fim do mês
    ///   Média diária = gastos do dia a dia dos últimos 3 meses completos / dias desses meses
    ///                  (menos meses se os dados começarem depois; sem nenhum, os deste mês até hoje / dia de hoje)
    ///   Estimativa   = média diária × dias restantes (de amanhã ao fim do mês) + recorrentes
    /// </code>
    /// Os gastos pagos com o cartão de alimentação não saem da conta e ficam de fora. Os gerados pelos
    /// recorrentes ativos também, para não contarem duas vezes (entram pelas repetições que faltam);
    /// os de recorrentes em pausa ou apagados contam na média como os outros. O histórico conta a partir
    /// do mês do gasto mais antigo (se esse mês estiver incompleto, a média fica um pouco mais baixa).
    /// </summary>
    public static EstimativaGastos EstimarGastosAteFimDoMes(
        IEnumerable<DespesaExtra> extras,
        IEnumerable<GastoRecorrente> recorrentes,
        DateOnly hoje,
        int meses = MesesMediaPrevisao)
    {
        var fimDoMes = new DateOnly(hoje.Year, hoje.Month, DateTime.DaysInMonth(hoje.Year, hoje.Month));
        var diasRestantes = fimDoMes.DayNumber - hoje.DayNumber;
        var amanha = hoje.AddDays(1);

        var ativos = recorrentes.Where(r => r.Ativo).ToList();
        // Cada recorrente pago com a conta e o que ainda vai gastar até ao fim do mês (para o total e para a categoria)
        var recorrentesPorGastar = ativos
            .Where(r => r.MeioPagamento == MeioPagamento.Conta)
            .Select(r =>
            {
                var de = r.Inicio > amanha ? r.Inicio : amanha;
                var ate = r.Fim is { } fim && fim < fimDoMes ? fim : fimDoMes;
                var dias = Recorrencia.Dias(r.Frequencia, r.DiaSemana ?? Recorrencia.DiaSemanaIso(r.Inicio), r.DiaMes ?? r.Inicio.Day, de, ate);
                return (Categoria: Categorias.DaDespesa(r.Categoria), Valor: dias.Count * r.Valor);
            })
            .ToList();
        var recorrentesAteAoFim = Centimos(recorrentesPorGastar.Sum(r => r.Valor));

        var idsAtivos = ativos.Select(r => r.Id).ToHashSet(StringComparer.Ordinal);
        var comData = extras.Where(e => e.Data is not null).ToList();
        var contam = comData
            .Where(e => !e.PagaComCartao && (e.GastoRecorrenteId is null || !idsAtivos.Contains(e.GastoRecorrenteId)))
            .ToList();

        var mesAtual = Meses.De(hoje);
        var primeiroMes = comData.Count > 0 ? Meses.De(comData.Min(e => e.Data!.Value)) : mesAtual;
        var mesesBase = Meses.Ultimos(Meses.Anterior(mesAtual), meses).Where(m => Meses.AntesOuIgual(primeiroMes, m)).ToList();

        // Os gastos que dão a média e por quantos dias se divide
        List<DespesaExtra> naBase;
        decimal dias;
        if (mesesBase.Count > 0)
        {
            var inicio = Meses.PrimeiroDia(mesesBase[0]);
            var fim = Meses.PrimeiroDia(mesAtual).AddDays(-1);
            naBase = [.. contam.Where(e => e.Data >= inicio && e.Data <= fim)];
            dias = fim.DayNumber - inicio.DayNumber + 1;
        }
        else
        {
            var inicio = Meses.PrimeiroDia(mesAtual);
            naBase = [.. contam.Where(e => e.Data >= inicio && e.Data <= hoje)];
            dias = hoje.Day;
        }

        var media = Math.Max(0m, naBase.Sum(e => e.Valor) / dias);

        // O mesmo, categoria a categoria: a média de cada uma × dias que faltam + os recorrentes dela
        var deMedia = naBase
            .GroupBy(e => Categorias.DaDespesa(e.Categoria))
            .ToDictionary(g => g.Key, g => Centimos(Math.Max(0m, g.Sum(e => e.Valor) / dias * diasRestantes)));
        var deRecorrentes = recorrentesPorGastar
            .GroupBy(r => r.Categoria)
            .ToDictionary(g => g.Key, g => Centimos(g.Sum(r => r.Valor)));
        var porCategoria = deMedia.Keys.Union(deRecorrentes.Keys)
            .Select(c => new EstimativaCategoria(c, Centimos(deMedia.GetValueOrDefault(c) + deRecorrentes.GetValueOrDefault(c))))
            .Where(c => c.Estimativa > 0)
            .OrderByDescending(c => c.Estimativa)
            .ThenBy(c => Categorias.Ordem(c.Categoria))
            .ToList();

        // E a de um mês inteiro (o simulador mensal): a média de cada categoria × os dias do mês + os recorrentes do mês todo
        var diasDoMes = DateTime.DaysInMonth(hoje.Year, hoje.Month);
        var primeiroDia = new DateOnly(hoje.Year, hoje.Month, 1);
        var deRecorrentesDoMes = ativos
            .Where(r => r.MeioPagamento == MeioPagamento.Conta)
            .Select(r =>
            {
                var de = r.Inicio > primeiroDia ? r.Inicio : primeiroDia;
                var ate = r.Fim is { } fim && fim < fimDoMes ? fim : fimDoMes;
                var diasDoRecorrente = Recorrencia.Dias(r.Frequencia, r.DiaSemana ?? Recorrencia.DiaSemanaIso(r.Inicio), r.DiaMes ?? r.Inicio.Day, de, ate);
                return (Categoria: Categorias.DaDespesa(r.Categoria), Valor: diasDoRecorrente.Count * r.Valor);
            })
            .GroupBy(r => r.Categoria)
            .ToDictionary(g => g.Key, g => Centimos(g.Sum(r => r.Valor)));
        var deMediaDoMes = naBase
            .GroupBy(e => Categorias.DaDespesa(e.Categoria))
            .ToDictionary(g => g.Key, g => Centimos(Math.Max(0m, g.Sum(e => e.Valor) / dias * diasDoMes)));
        var porCategoriaDoMes = deMediaDoMes.Keys.Union(deRecorrentesDoMes.Keys)
            .Select(c => new EstimativaCategoria(c, Centimos(deMediaDoMes.GetValueOrDefault(c) + deRecorrentesDoMes.GetValueOrDefault(c))))
            .Where(c => c.Estimativa > 0)
            .OrderByDescending(c => c.Estimativa)
            .ThenBy(c => Categorias.Ordem(c.Categoria))
            .ToList();

        return new EstimativaGastos(
            Centimos(media),
            diasRestantes,
            recorrentesAteAoFim,
            Centimos(Centimos(media * diasRestantes) + recorrentesAteAoFim),
            mesesBase.Count,
            porCategoria,
            porCategoriaDoMes);
    }

    /// <summary>
    /// O que ainda se prevê gastar com o <b>cartão de alimentação</b> até ao fim do mês, com as mesmas regras que
    /// <see cref="EstimarGastosAteFimDoMes"/> (média diária dos últimos meses completos × dias que faltam + as repetições
    /// que faltam dos gastos recorrentes ativos pagos com o cartão), mas só com os gastos pagos com ele. É à parte da
    /// previsão da conta: o cartão tem saldo próprio.
    /// </summary>
    public static EstimativaCartao EstimarGastosCartaoAteFimDoMes(
        IEnumerable<DespesaExtra> extras,
        IEnumerable<GastoRecorrente> recorrentes,
        DateOnly hoje,
        int meses = MesesMediaPrevisao)
    {
        var fimDoMes = new DateOnly(hoje.Year, hoje.Month, DateTime.DaysInMonth(hoje.Year, hoje.Month));
        var diasRestantes = fimDoMes.DayNumber - hoje.DayNumber;
        var amanha = hoje.AddDays(1);

        var ativos = recorrentes.Where(r => r.Ativo).ToList();
        var recorrentesAteAoFim = Centimos(ativos
            .Where(r => r.MeioPagamento == MeioPagamento.CartaoAlimentacao)
            .Sum(r =>
            {
                var de = r.Inicio > amanha ? r.Inicio : amanha;
                var ate = r.Fim is { } fim && fim < fimDoMes ? fim : fimDoMes;
                return Recorrencia.Dias(r.Frequencia, r.DiaSemana ?? Recorrencia.DiaSemanaIso(r.Inicio), r.DiaMes ?? r.Inicio.Day, de, ate).Count * r.Valor;
            }));

        // A mesma janela de meses da média da conta (o histórico começa no gasto mais antigo, seja de que meio for)
        var idsAtivos = ativos.Select(r => r.Id).ToHashSet(StringComparer.Ordinal);
        var comData = extras.Where(e => e.Data is not null).ToList();
        var mesAtual = Meses.De(hoje);
        var primeiroMes = comData.Count > 0 ? Meses.De(comData.Min(e => e.Data!.Value)) : mesAtual;
        var mesesBase = Meses.Ultimos(Meses.Anterior(mesAtual), meses).Where(m => Meses.AntesOuIgual(primeiroMes, m)).ToList();

        DateOnly inicio, fimJanela;
        if (mesesBase.Count > 0)
        {
            inicio = Meses.PrimeiroDia(mesesBase[0]);
            fimJanela = Meses.PrimeiroDia(mesAtual).AddDays(-1);
        }
        else
        {
            inicio = Meses.PrimeiroDia(mesAtual);
            fimJanela = hoje;
        }

        var total = comData
            .Where(e => e.PagaComCartao && (e.GastoRecorrenteId is null || !idsAtivos.Contains(e.GastoRecorrenteId)))
            .Where(e => e.Data >= inicio && e.Data <= fimJanela)
            .Sum(e => e.Valor);
        var media = Math.Max(0m, total / (fimJanela.DayNumber - inicio.DayNumber + 1));
        return new EstimativaCartao(Centimos(media), recorrentesAteAoFim, Centimos(Centimos(media * diasRestantes) + recorrentesAteAoFim));
    }

    /// <summary>Quantos meses completos (no máximo) dão a média dos gastos por categoria do simulador.</summary>
    public const int MesesMediaGastos = 6;

    /// <summary>
    /// Tudo o que se gastou, somado por categoria: as despesas extras (as sem categoria contam como "outros") e, se
    /// vierem, os pagamentos das despesas mensais (<paramref name="fixas"/>, já com a categoria de cada uma). Cada total
    /// divide por <paramref name="divisor"/> (1 = o total; N = a média por mês de N meses). A maior primeiro; as que
    /// ficam a zero saem. <c>Fixas</c> diz quanto de cada categoria é de despesas mensais. Só o que foi mesmo gasto:
    /// nenhuma previsão.
    /// </summary>
    public static IReadOnlyList<ValorCategoria> TotaisPorCategoria(
        IEnumerable<DespesaExtra> extras,
        int divisor = 1,
        IEnumerable<(string Categoria, decimal Valor)>? fixas = null)
    {
        var porMeses = Math.Max(1, divisor);
        return
        [
            .. extras
                .Select(e => (Categoria: Categorias.DaDespesa(e.Categoria), e.Valor, Fixa: false))
                .Concat((fixas ?? []).Select(f => (f.Categoria, f.Valor, Fixa: true)))
                .GroupBy(g => g.Categoria)
                .Select(g => new ValorCategoria(
                    g.Key,
                    Centimos(g.Sum(e => e.Valor) / porMeses),
                    Centimos(g.Where(e => e.Fixa).Sum(e => e.Valor) / porMeses)))
                .Where(c => c.Valor > 0)
                .OrderByDescending(c => c.Valor)
                .ThenBy(c => Categorias.Ordem(c.Categoria)),
        ];
    }

    /// <summary>
    /// Os meses completos que dão a média: os até <paramref name="quantos"/> anteriores ao mês de <paramref name="hoje"/>,
    /// a contar do mês da despesa mais antiga (<paramref name="primeiroMes"/>; sem histórico, nenhum).
    /// </summary>
    public static IReadOnlyList<string> MesesDaMedia(DateOnly hoje, string primeiroMes, int quantos = MesesMediaGastos) =>
        [.. Meses.Ultimos(Meses.Anterior(Meses.De(hoje)), quantos).Where(m => Meses.AntesOuIgual(primeiroMes, m))];

    /// <summary>
    /// Quanto o cartão ainda vai carregar este mês: o valor do cartão configurado no Salário se o dia do salário ainda
    /// não chegou e o salário deste mês ainda não entrou; senão 0 (já carregou, ou o carregamento é hoje e é processado à parte).
    /// </summary>
    public static decimal CartaoPorReceber(ConfiguracaoSalario? salario, DateOnly hoje, TimeZoneInfo fuso)
    {
        if (salario is null || hoje.Day >= DiaEfetivo(salario.DiaRecebimento, hoje))
        {
            return 0m;
        }

        if (salario.RecebidoEm is { } ultimo)
        {
            var dataUltimo = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(ultimo, fuso).DateTime);
            if (dataUltimo.Year == hoje.Year && dataUltimo.Month == hoje.Month)
            {
                return 0m;
            }
        }

        return CartaoDoMes(salario, hoje);
    }

    // ---- Objetivos de poupança ----

    /// <summary>
    /// Os números de um objetivo de poupança no mês <paramref name="mesAtual"/>:
    /// <code>
    ///   Em falta          = alvo - atual (nunca negativo)
    ///   Meses restantes   = do mês atual ao mês alvo, os dois incluídos (out → dez = 3; já passou = 0)
    ///   Valor por mês     = em falta / meses restantes, ao cêntimo para cima (já passou: tudo o que falta)
    ///   Esperado          = alvo × meses já decorridos desde o início / meses do início ao alvo
    ///   Estado            = atingido (atual ≥ alvo) · atrasado (o mês alvo já passou, ou atual &lt; esperado)
    ///                       · no bom caminho (atual ≥ esperado)
    /// </code>
    /// O mês atual ainda não conta como decorrido: no mês em que é criado, um objetivo está sempre no
    /// bom caminho; no mês seguinte já devia ter 1/N do alvo, e assim por diante.
    /// </summary>
    public static SituacaoObjetivo CalcularObjetivo(decimal valorAlvo, decimal valorAtual, string mesInicio, string mesAlvo, string mesAtual)
    {
        var alvo = Centimos(valorAlvo);
        var atual = Math.Max(0m, Centimos(valorAtual));
        var emFalta = Math.Max(0m, Centimos(alvo - atual));
        var mesesRestantes = Math.Max(0, Meses.Diferenca(mesAtual, mesAlvo) + 1);
        var valorPorMes = emFalta == 0
            ? 0m
            : mesesRestantes > 0
                ? Math.Ceiling(emFalta * 100m / mesesRestantes) / 100m
                : emFalta;
        var percentagem = alvo > 0 ? Math.Min(100m, Math.Round(atual / alvo * 100m, 1, MidpointRounding.AwayFromZero)) : 100m;

        var mesesTotais = Math.Max(1, Meses.Diferenca(mesInicio, mesAlvo) + 1);
        var decorridos = Math.Clamp(Meses.Diferenca(mesInicio, mesAtual), 0, mesesTotais);
        var esperado = Centimos(alvo * decorridos / mesesTotais);

        var estado = atual >= alvo
            ? EstadoObjetivo.Atingido
            : Meses.Antes(mesAlvo, mesAtual) || atual < esperado
                ? EstadoObjetivo.Atrasado
                : EstadoObjetivo.NoBomCaminho;
        return new SituacaoObjetivo(atual, percentagem, emFalta, mesesRestantes, Centimos(valorPorMes), esperado, estado);
    }
}
