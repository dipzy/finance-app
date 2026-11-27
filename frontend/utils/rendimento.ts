import type { Poupanca } from '../services/tipos';

// O que valem as poupanças daqui a N meses. Mesma regra do servidor (RegrasPoupancas.Projetar): em cada mês
// rende juros sobre o saldo (taxa anual ÷ 12, menos o imposto retido) e no fim dele entra a contribuição mensal.
// Sem React Native, para os testes (__tests__/rendimento.test.ts)

const centimos = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PoupancaParaProjetar {
  saldo: number;
  taxaAnual?: number;
  retencao?: number; // % (28 por defeito)
  contribuicaoMensal: number;
}

export interface Projecao {
  saldoFinal: number;
  juros: number; // já sem imposto
  contribuicoes: number;
}

export function projetarPoupanca(p: PoupancaParaProjetar, meses: number): Projecao {
  let saldo = centimos(p.saldo);
  const contribuicao = Math.max(0, centimos(p.contribuicaoMensal));
  const taxa = p.taxaAnual ?? 0;
  const retencao = Math.min(100, Math.max(0, p.retencao ?? 28));
  let juros = 0;
  for (let i = 0; i < meses; i++) {
    const bruto = saldo > 0 && taxa > 0 ? centimos((saldo * taxa) / 100 / 12) : 0;
    const liquido = centimos(bruto * (1 - retencao / 100));
    juros += liquido;
    saldo = centimos(saldo + liquido + contribuicao);
  }
  return { saldoFinal: saldo, juros: centimos(juros), contribuicoes: centimos(contribuicao * meses) };
}

// A soma de todas as poupanças. `contribuicaoDe` dá a contribuição mensal em euros de cada uma
export function projetarTotal(poupancas: Poupanca[], contribuicaoDe: (p: Poupanca) => number, meses: number): Projecao {
  return poupancas.reduce<Projecao>(
    (total, p) => {
      const r = projetarPoupanca(
        { saldo: p.saldo, taxaAnual: p.taxaAnual, retencao: p.retencao, contribuicaoMensal: contribuicaoDe(p) },
        meses
      );
      return {
        saldoFinal: centimos(total.saldoFinal + r.saldoFinal),
        juros: centimos(total.juros + r.juros),
        contribuicoes: centimos(total.contribuicoes + r.contribuicoes),
      };
    },
    { saldoFinal: 0, juros: 0, contribuicoes: 0 }
  );
}
