using Financas.DAL.Entidades;

namespace Financas.Services.Regras;

/// <summary>
/// As contas da parte partilhada (grupos): dividir uma despesa pelos participantes, calcular quanto
/// cada membro deve ou tem a receber e reduzir isso ao mínimo de pagamentos entre pessoas.
/// Tudo ao cêntimo e sem base de dados, para se testar à parte (PartilhadoTests).
/// </summary>
public static class Partilhado
{
    /// <summary>Um participante numa divisão e o que foi escrito para ele (valor, % ou nº de partes).</summary>
    public sealed record Participante(string Uid, decimal? Peso);

    /// <summary>Um pagamento sugerido para acertar contas: <paramref name="DeUid"/> paga a <paramref name="ParaUid"/>.</summary>
    public sealed record Transferencia(string DeUid, string ParaUid, decimal Valor);

    /// <summary>
    /// Divide <paramref name="total"/> pelos participantes. A soma das partes dá sempre o total ao
    /// cêntimo: os cêntimos que sobram dos arredondamentos vão para quem ficou com a maior fração
    /// (e, em empate, para os primeiros da lista).
    /// </summary>
    public static IReadOnlyList<(string Uid, decimal Valor)> Dividir(decimal total, ModoDivisao modo, IReadOnlyList<Participante> participantes)
    {
        total = Calculos.Centimos(total);
        if (total <= 0m) throw new PedidoInvalidoException("O valor tem de ser maior que zero.");
        if (participantes.Count == 0) throw new PedidoInvalidoException("Escolhe pelo menos uma pessoa para dividir a despesa.");
        if (participantes.Select(p => p.Uid).Distinct(StringComparer.Ordinal).Count() != participantes.Count)
        {
            throw new PedidoInvalidoException("A mesma pessoa aparece mais do que uma vez na divisão.");
        }

        switch (modo)
        {
            case ModoDivisao.Igual:
                return Proporcional(total, participantes.Select(p => (p.Uid, 1m)).ToList());

            case ModoDivisao.Valores:
            {
                var valores = participantes.Select(p => (p.Uid, Valor: Calculos.Centimos(PesoPositivo(p)))).ToList();
                var soma = valores.Sum(v => v.Valor);
                if (soma != total)
                {
                    throw new PedidoInvalidoException($"A soma das partes ({Euros(soma)}) tem de dar o total ({Euros(total)}).");
                }

                return valores;
            }

            case ModoDivisao.Percentagem:
            {
                var pesos = participantes.Select(p => (p.Uid, PesoPositivo(p))).ToList();
                var soma = pesos.Sum(p => p.Item2);
                if (soma != 100m)
                {
                    throw new PedidoInvalidoException($"As percentagens têm de somar 100 (somam {soma.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture)}).");
                }

                return Proporcional(total, pesos);
            }

            case ModoDivisao.Partes:
                return Proporcional(total, participantes.Select(p => (p.Uid, PesoPositivo(p))).ToList());

            default:
                throw new PedidoInvalidoException("Modo de divisão desconhecido.");
        }
    }

    /// <summary>
    /// O que cabe realmente a cada participante de uma despesa: a divisão original, mas sem as partes
    /// recusadas (o valor delas reparte-se pelos restantes, na proporção das partes de cada um). Quem
    /// ficou sozinho (todos os outros recusaram) fica com o total. Quem recusou não aparece.
    /// </summary>
    public static Dictionary<string, decimal> Efetivas(decimal total, IReadOnlyCollection<ParteDespesaPartilhada> partes)
    {
        var ficam = partes.Where(p => p.Estado != EstadoParte.Recusada).ToList();
        if (ficam.Count == 0) return new Dictionary<string, decimal>(StringComparer.Ordinal);
        if (ficam.Count == partes.Count) return ficam.ToDictionary(p => p.Uid, p => p.Valor, StringComparer.Ordinal);

        return Proporcional(Calculos.Centimos(total), [.. ficam.Select(p => (p.Uid, p.Valor))])
            .ToDictionary(p => p.Uid, p => p.Valor, StringComparer.Ordinal);
    }

    /// <summary>
    /// O saldo de cada pessoa no grupo: o que pagou menos o que lhe cabe, mais o que já pagou a
    /// outros em acertos, menos o que recebeu. Positivo = tem a receber; negativo = deve.
    /// Só contam as partes aceites (quem pagou aceita à partida): enquanto alguém não aceita, não deve nada.
    /// A soma de todos os saldos é sempre zero.
    /// </summary>
    public static Dictionary<string, decimal> Saldos(
        IEnumerable<DespesaPartilhada> despesas,
        IEnumerable<ParteDespesaPartilhada> partes,
        IEnumerable<AcertoPartilhado> acertos)
    {
        var saldos = new Dictionary<string, decimal>(StringComparer.Ordinal);
        void Somar(string uid, decimal valor) => saldos[uid] = saldos.GetValueOrDefault(uid) + valor;

        var partesPorDespesa = partes.ToLookup(p => p.DespesaPartilhadaId, StringComparer.Ordinal);
        foreach (var d in despesas)
        {
            var daDespesa = partesPorDespesa[d.Id].ToList();
            var efetivas = Efetivas(d.Valor, daDespesa);
            // Quem pagou tem a receber as partes aceites dos outros (a sua própria parte fica com ele)
            foreach (var p in daDespesa.Where(p => p.Estado == EstadoParte.Aceite && p.Uid != d.PagadorUid))
            {
                var valor = efetivas.GetValueOrDefault(p.Uid);
                Somar(d.PagadorUid, valor);
                Somar(p.Uid, -valor);
            }
        }

        foreach (var a in acertos)
        {
            Somar(a.DeUid, a.Valor);
            Somar(a.ParaUid, -a.Valor);
        }

        foreach (var uid in saldos.Keys.ToList()) saldos[uid] = Calculos.Centimos(saldos[uid]);
        return saldos;
    }

    /// <summary>
    /// Reduz os saldos a poucos pagamentos: quem deve mais paga a quem tem mais a receber, até
    /// ficar tudo a zero. Com N pessoas nunca são precisos mais de N-1 pagamentos.
    /// </summary>
    public static IReadOnlyList<Transferencia> Simplificar(IReadOnlyDictionary<string, decimal> saldos)
    {
        var credores = saldos.Where(s => s.Value > 0m).Select(s => (Uid: s.Key, Valor: s.Value)).ToList();
        var devedores = saldos.Where(s => s.Value < 0m).Select(s => (Uid: s.Key, Valor: -s.Value)).ToList();
        var resultado = new List<Transferencia>();

        while (credores.Count > 0 && devedores.Count > 0)
        {
            // Sempre o maior de cada lado (empates pelo uid, para o resultado não depender da ordem)
            var c = credores.OrderByDescending(x => x.Valor).ThenBy(x => x.Uid, StringComparer.Ordinal).First();
            var d = devedores.OrderByDescending(x => x.Valor).ThenBy(x => x.Uid, StringComparer.Ordinal).First();
            var valor = Math.Min(c.Valor, d.Valor);
            resultado.Add(new Transferencia(d.Uid, c.Uid, valor));

            credores.Remove(c);
            devedores.Remove(d);
            if (c.Valor - valor > 0m) credores.Add((c.Uid, c.Valor - valor));
            if (d.Valor - valor > 0m) devedores.Add((d.Uid, d.Valor - valor));
        }

        return resultado;
    }

    // Método do maior resto, em cêntimos: cada um fica com o arredondamento para baixo e os cêntimos
    // que faltam vão, um a um, para as maiores frações
    private static IReadOnlyList<(string Uid, decimal Valor)> Proporcional(decimal total, IReadOnlyList<(string Uid, decimal Peso)> pesos)
    {
        var somaPesos = pesos.Sum(p => p.Peso);
        var totalCentimos = (long)(total * 100m);
        var exatos = pesos.Select(p => totalCentimos * p.Peso / somaPesos).ToList();
        var centimos = exatos.Select(e => (long)Math.Floor(e)).ToList();
        var falta = totalCentimos - centimos.Sum();

        var ordem = Enumerable.Range(0, pesos.Count)
            .OrderByDescending(i => exatos[i] - centimos[i])
            .ThenBy(i => i)
            .ToList();
        for (var k = 0; k < falta; k++) centimos[ordem[k % ordem.Count]]++;

        return [.. pesos.Select((p, i) => (p.Uid, centimos[i] / 100m))];
    }

    private static decimal PesoPositivo(Participante p) =>
        p.Peso is > 0m ? p.Peso.Value : throw new PedidoInvalidoException("Cada pessoa da divisão tem de ter um valor maior que zero.");

    private static string Euros(decimal valor) =>
        $"{Calculos.Centimos(valor).ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)} €";
}
