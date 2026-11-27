jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));

import { ExtratoApi, type MovimentoParaImportar } from '../services/extratoApi';
import { instalarApiFalsa, type PedidoFalso } from '../test-utils/apiFalsa';

const movimentos = (n: number): MovimentoParaImportar[] =>
  Array.from({ length: n }, (_, i) => ({ data: '2026-10-05', descricao: `Compra ${i}`, valor: 1, ocorrencia: 0 }));

describe('ExtratoApi', () => {
  it('um extrato grande vai em vários pedidos de 1000 e a previsão volta pela mesma ordem', async () => {
    const api = instalarApiFalsa();
    api.responder('POST', '/api/despesas-extras/extrato/previsao', (p: PedidoFalso) => ({
      movimentos: p.corpo.movimentos.map((m: { descricao: string }) => ({ categoria: 'outros', origem: 'por-defeito', jaImportado: false, regra: m.descricao })),
    }));

    const previstos = await ExtratoApi.previsao(movimentos(2300));

    expect(api.feitos('POST', '/api/despesas-extras/extrato/previsao').map((p) => p.corpo.movimentos.length)).toEqual([1000, 1000, 300]);
    expect(previstos).toHaveLength(2300);
    expect([previstos[0].regra, previstos[1000].regra, previstos[2299].regra]).toEqual(['Compra 0', 'Compra 1000', 'Compra 2299']); // a ordem mantém-se
  });

  it('a importação soma os resultados dos pedidos e junta os meses sem repetir', async () => {
    const api = instalarApiFalsa();
    let chamada = 0;
    api.responder('POST', '/api/despesas-extras/extrato', () =>
      [
        { importados: 1000, jaImportados: 0, total: 1000.1, meses: ['2026-09', '2026-10'] },
        { importados: 900, jaImportados: 100, total: 900.2, meses: ['2026-10', '2026-11'] },
      ][chamada++]
    );

    const r = await ExtratoApi.importar(movimentos(2000));

    expect(r).toEqual({ importados: 1900, jaImportados: 100, total: 1900.3, meses: ['2026-09', '2026-10', '2026-11'] });
  });

  it('um erro num dos pedidos para tudo e passa o erro', async () => {
    const api = instalarApiFalsa();
    api.responder('POST', '/api/despesas-extras/extrato', { status: 400, title: 'Pedido inválido', detail: 'x' }, 400);
    await expect(ExtratoApi.importar(movimentos(5))).rejects.toBeTruthy();
  });
});
