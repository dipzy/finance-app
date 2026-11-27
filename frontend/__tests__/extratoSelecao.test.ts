jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));

import { MAXIMO_POR_PEDIDO, prepararMovimentos } from '../services/extratoApi';
import type { MovimentoPrevisto } from '../services/extratoApi';
import type { MovimentoLido } from '../services/extratoBancario';
import { escolhasIniciais, marcarTodos, movimentosAImportar, resumoSelecao } from '../utils/extrato';

const lido = (data: string, descricao: string, valor: number): MovimentoLido => ({ linha: 1, data, descricao, original: descricao, valor });
const previsto = (campos: Partial<MovimentoPrevisto> = {}): MovimentoPrevisto => ({ categoria: 'outros', origem: 'por-defeito', jaImportado: false, ...campos });

describe('prepararMovimentos', () => {
  it('o valor passa a positivo e cada movimento igual leva o seu número de ocorrência', () => {
    const saidas = [
      lido('2026-10-05', 'Café', -1.2),
      lido('2026-10-05', 'Pingo Doce', -45.67),
      lido('2026-10-05', 'CAFÉ', -1.2), // igual ao primeiro (sem acentos nem maiúsculas)
      lido('2026-10-06', 'Café', -1.2), // outro dia: ocorrência 0 outra vez
      lido('2026-10-05', 'Café', -1.2), // o terceiro café do dia 5
    ];
    expect(prepararMovimentos(saidas).map((m) => [m.descricao, m.valor, m.ocorrencia])).toEqual([
      ['Café', 1.2, 0],
      ['Pingo Doce', 45.67, 0],
      ['CAFÉ', 1.2, 1],
      ['Café', 1.2, 0],
      ['Café', 1.2, 2],
    ]);
  });

  it('valores com erros de vírgula flutuante contam como iguais', () => {
    const preparados = prepararMovimentos([lido('2026-10-05', 'A', -0.1 - 0.2), lido('2026-10-05', 'A', -0.3)]);
    expect(preparados.map((m) => [m.valor, m.ocorrencia])).toEqual([[0.3, 0], [0.3, 1]]);
  });

  it('a API aceita 1000 de cada vez', () => {
    expect(MAXIMO_POR_PEDIDO).toBe(1000);
  });
});

describe('escolhas', () => {
  const previstos = [
    previsto({ categoria: 'supermercado' }),
    previsto({ jaImportado: true }),
    previsto({ possivelDuplicadoDe: 'Almoço' }),
    previsto({ categoria: 'transportes' }),
  ];
  const saidas = [lido('2026-10-05', 'A', -10), lido('2026-10-03', 'B', -20), lido('2026-10-07', 'C', -30.5), lido('2026-10-04', 'D', -5)];

  it('de início vão os novos; ficam de fora os já importados e os possíveis duplicados', () => {
    expect(escolhasIniciais(previstos).map((e) => [e.incluido, e.categoria])).toEqual([
      [true, 'supermercado'],
      [false, 'outros'],
      [false, 'outros'],
      [true, 'transportes'],
    ]);
  });

  it('o resumo conta só os selecionados', () => {
    const escolhas = escolhasIniciais(previstos);
    expect(resumoSelecao(saidas, escolhas, previstos)).toEqual({
      quantos: 2,
      total: 15,
      de: '2026-10-04',
      ate: '2026-10-05',
      jaImportados: 1,
      possiveisDuplicados: 1,
    });
  });

  it('um movimento já importado nunca conta, mesmo marcado', () => {
    const escolhas = escolhasIniciais(previstos).map((e) => ({ ...e, incluido: true }));
    expect(resumoSelecao(saidas, escolhas, previstos).quantos).toBe(3);
  });

  it('marcar todos salta os já importados; desmarcar todos limpa o resto', () => {
    const escolhas = escolhasIniciais(previstos);
    const todos = marcarTodos(previstos, escolhas, true);
    expect(todos.map((e) => e.incluido)).toEqual([true, false, true, true]);
    expect(marcarTodos(previstos, todos, false).map((e) => e.incluido)).toEqual([false, false, false, false]);
  });

  it('só se envia o que está incluído, com a categoria escolhida', () => {
    const preparados = prepararMovimentos(saidas);
    const escolhas = escolhasIniciais(previstos);
    escolhas[0] = { incluido: true, categoria: 'lazer' }; // a pessoa mudou a categoria
    escolhas[2] = { incluido: true, categoria: 'outros' }; // e quis importar o possível duplicado
    const enviados = movimentosAImportar(preparados, escolhas, previstos);
    expect(enviados.map((m) => [m.descricao, m.valor, m.categoria])).toEqual([
      ['A', 10, 'lazer'],
      ['C', 30.5, 'outros'],
      ['D', 5, 'transportes'],
    ]);
  });
});
