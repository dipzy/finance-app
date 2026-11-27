import { lerRef } from '../utils/lerXlsx';
import { Celula, Folha, gerarXlsx } from '../utils/xlsx';

// Livros Excel de teste com dados inventados, no formato do livro do utilizador
// (usados em __tests__/importarExcel.test.ts e __tests__/importarEcra.test.tsx)

// { E5: 'Lucro', F10: 1500 } -> linhas para o gerador de .xlsx
export function folha(nome: string, celulas: Record<string, Celula>): Folha {
  const linhas: Celula[][] = [];
  for (const [ref, celula] of Object.entries(celulas)) {
    const pos = lerRef(ref)!;
    const linha = (linhas[pos.linha - 1] ??= []);
    linha[pos.coluna - 1] = celula;
  }
  // O gerador não aceita buracos nos arrays
  for (let i = 0; i < linhas.length; i++) {
    linhas[i] = Array.from({ length: linhas[i]?.length ?? 0 }, (_, j) => linhas[i]?.[j] ?? null);
  }
  return { nome, linhas };
}

// Uma folha do mês. `desvio` empurra as linhas de baixo (como acontece de folha para folha)
export function celulasMes(desvio = 0, rotulos: Partial<Record<string, string>> = {}): Record<string, Celula> {
  const r = (n: number) => n + desvio;
  const base = 24 + 2 * desvio;
  return {
    B3: 'Março ',
    E5: rotulos.lucro ?? 'Lucro',
    H5: rotulos.despesas ?? 'Despesas',
    K5: rotulos.poupanca ?? 'Poupança',
    N5: rotulos.despesasMes ?? 'Despesas do Mês',
    Q5: rotulos.anual ?? 'Anual',
    // Totais por baixo dos títulos (na coluna dos nomes, como nas células unidas do Excel)
    E6: { valor: 1650, formula: 'SUM(F10,F11)' },
    H6: { valor: 677.3, formula: 'SUM(I10:I14)' },
    K6: { valor: 250, formula: 'SUM(L10:L14)' },
    N6: { valor: 162.95, formula: 'SUM(O10:O15)' },
    Q6: { valor: 420, formula: 'SUM(R10:R14)' },
    E9: 'Categoria', F9: 'Valor', H9: 'Categoria', I9: 'Valor', K9: 'Categoria', L9: 'Valor',
    N9: 'Categoria', O9: 'Valor', Q9: 'Categoria', R9: 'Valor',

    E10: 'Salário', F10: 1500,
    E11: 'Alimentação', F11: 150,

    H10: 'Renda', I10: 600,
    H11: 'Internet', I11: { valor: 35, formula: '20+15' },
    H12: 'Luz', I12: '  42,30 ', // número escrito como texto, com espaços
    H13: 'Água', // sem valor
    H14: 'Seguro casa', I14: 0,
    [`H${r(16)}`]: 'Sobra', [`I${r(16)}`]: { valor: 822.7, formula: 'F10-H6' },

    K10: 'Conta poupança', L10: 200,
    K11: ' PPR ', L11: 50,
    [`K${r(16)}`]: 'Total para extras', [`L${r(16)}`]: { valor: 572.7, formula: `I${r(16)}-K6` },

    N10: 'Supermercado', O10: 85.5,
    N11: 'Cinema', O11: 12,
    N12: 'Jantar fora', O12: { valor: 40.950000000000003, formula: '30+10.95' },
    // N13 vazia: uma linha em branco no meio não acaba o bloco
    N14: 'Prenda', O14: 25,
    O15: 7, // valor sem nome
    [`N${r(18)}`]: 'Total', [`O${r(18)}`]: { valor: 409.75, formula: `L${r(16)}-N6` },

    Q10: 'Seguro carro', R10: 300,
    Q11: 'IUC', R11: 120,

    [`E${base}`]: rotulos.saldoConta ?? 'Salto Conta', [`F${base}`]: { valor: 950.4, formula: '950.4' },
    [`H${base}`]: 'Saldo Poupança',

    [`D${base + 2}`]: 'Falta', [`E${base + 2}`]: 'Telemóvel',
    [`E${base + 3}`]: 'Ginásio', [`F${base + 3}`]: 25,
    // linhas vazias pelo meio da lista
    [`E${base + 7}`]: 'Combustível', [`F${base + 7}`]: { valor: 30, formula: '100-70' },
    [`E${base + 8}`]: 'Total', [`F${base + 8}`]: { valor: 55, formula: `SUM(F${base + 2}:F${base + 7})` },
    [`E${base + 9}`]: 'Previsão', [`F${base + 9}`]: { valor: 895.4, formula: `F${base}-F${base + 8}` },

    [`H${base + 2}`]: 'Conta poupança total ', [`I${base + 2}`]: 3000,
    [`H${base + 3}`]: 'Certificados', [`I${base + 3}`]: 1000,
    [`H${base + 4}`]: 'Total', [`I${base + 4}`]: { valor: 4000, formula: `SUM(I${base + 2}:I${base + 3})` },
    [`H${base + 7}`]: ' ',

    [`K${base + 2}`]: 'Total a pagar', [`L${base + 2}`]: { valor: 5000, formula: `L${base + 3}+L${base + 4}` },
    [`K${base + 3}`]: 'Carro', [`L${base + 3}`]: 4000,
    [`K${base + 4}`]: 'Dentista', [`L${base + 4}`]: 1000,
    [`K${base + 7}`]: { valor: 3000, formula: `L${base + 2}-I${base + 2}` }, // conta solta, sem nome
  };
}

export const ESPERADO = {
  lucro: [{ titulo: 'Salário', valor: 1500 }, { titulo: 'Alimentação', valor: 150, informativo: true }],
  despesas: [{ titulo: 'Renda', valor: 600 }, { titulo: 'Internet', valor: 35 }, { titulo: 'Luz', valor: 42.3 }],
  poupanca: [{ titulo: 'Conta poupança', valor: 200 }, { titulo: 'PPR', valor: 50 }],
  despesasMes: [
    { titulo: 'Supermercado', valor: 85.5 },
    { titulo: 'Cinema', valor: 12 },
    { titulo: 'Jantar fora', valor: 40.95 },
    { titulo: 'Prenda', valor: 25 },
  ],
  anual: [{ titulo: 'Seguro carro', valor: 300 }, { titulo: 'IUC', valor: 120 }],
  saldoConta: 950.4,
  falta: [{ titulo: 'Ginásio', valor: 25 }, { titulo: 'Combustível', valor: 30 }],
  saldoPoupanca: [{ titulo: 'Conta poupança total', valor: 3000 }, { titulo: 'Certificados', valor: 1000 }],
  totalAPagar: [{ titulo: 'Carro', valor: 4000 }, { titulo: 'Dentista', valor: 1000 }],
};

// Duas folhas do mês (a segunda com as linhas mais abaixo) e uma folha sem blocos
export function livroDeTeste(): Uint8Array {
  return gerarXlsx([
    folha('Março Ana', celulasMes(0)),
    folha('Abril Ana', celulasMes(2)), // tudo duas linhas mais abaixo
    folha('Notas', { A1: 'Nada a ver' }),
  ]);
}
