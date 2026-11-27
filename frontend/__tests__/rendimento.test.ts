import { projetarPoupanca, projetarTotal } from '../utils/rendimento';
import type { Poupanca } from '../services/tipos';

describe('previsão das poupanças', () => {
  it('sem taxa só soma as contribuições', () => {
    expect(projetarPoupanca({ saldo: 1000, contribuicaoMensal: 100 }, 12)).toEqual({ saldoFinal: 2200, juros: 0, contribuicoes: 1200 });
  });

  it('com taxa rende juros sobre juros, sem o imposto retido', () => {
    // 1000 € a 3% (28% de imposto): 1,80 € no primeiro mês (2,50 bruto)
    const um = projetarPoupanca({ saldo: 1000, taxaAnual: 3, contribuicaoMensal: 0 }, 1);
    expect(um).toEqual({ saldoFinal: 1001.8, juros: 1.8, contribuicoes: 0 });
    const ano = projetarPoupanca({ saldo: 1000, taxaAnual: 3, contribuicaoMensal: 0 }, 12);
    expect(ano.juros).toBeGreaterThan(21);
    expect(ano.juros).toBeLessThan(22);
    expect(ano.saldoFinal).toBe(1000 + ano.juros);
    // Sem imposto rende mais
    expect(projetarPoupanca({ saldo: 1000, taxaAnual: 3, retencao: 0, contribuicaoMensal: 0 }, 1).juros).toBe(2.5);
  });

  it('o total soma todas as poupanças', () => {
    const lista = [
      { id: 'a', saldo: 1000, taxaAnual: 3 },
      { id: 'b', saldo: 500 },
    ] as Poupanca[];
    const total = projetarTotal(lista, () => 0, 1);
    expect(total.saldoFinal).toBe(1501.8);
    expect(total.juros).toBe(1.8);
  });
});
