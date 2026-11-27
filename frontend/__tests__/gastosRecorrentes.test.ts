// Gastos que se repetem, pesquisa e histórico de alterações: os pedidos à API e as funções de apoio
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));

import { AlteracoesDB, fraseAlteracao, linhasDetalhe, quandoCurto } from '../services/alteracoes';
import {
  descreverFrequencia,
  diaSemanaIso,
  diaSeguinte,
  GastosRecorrentesDB,
  regraDaRepeticao,
} from '../services/gastosRecorrentes';
import { datasDoIntervalo, PesquisaDB, queryPesquisa } from '../services/pesquisa';
import { ApiFalsa, instalarApiFalsa } from '../test-utils/apiFalsa';

let api: ApiFalsa;

beforeEach(() => {
  api = instalarApiFalsa();
});

describe('gastos que se repetem', () => {
  it('dias da semana e dia seguinte sem fusos horários', () => {
    expect(diaSemanaIso('2026-10-05')).toBe(1); // segunda
    expect(diaSemanaIso('2026-10-11')).toBe(7); // domingo
    expect(diaSeguinte('2026-10-31')).toBe('2026-11-01');
    expect(diaSeguinte('2026-12-31')).toBe('2027-01-01');
  });

  it('a regra começa no dia seguinte ao gasto registado, no mesmo dia da semana ou do mês', () => {
    const gasto = { titulo: 'Combustível', valor: 50, data: '2026-10-09', categoria: 'combustivel' as const, meioPagamento: 'conta' as const };
    expect(regraDaRepeticao(gasto, 'semanal')).toEqual({
      titulo: 'Combustível',
      valor: 50,
      frequencia: 'semanal',
      diaSemana: 5,
      diaMes: undefined,
      inicio: '2026-10-10',
      categoria: 'combustivel',
      meioPagamento: 'conta',
    });
    expect(regraDaRepeticao({ ...gasto, data: '2026-01-31' }, 'mensal')).toMatchObject({ diaMes: 31, inicio: '2026-02-01' });
    expect(regraDaRepeticao(gasto, 'diaria')).toMatchObject({ diaSemana: undefined, diaMes: undefined });
  });

  it('descrição da frequência', () => {
    expect(descreverFrequencia({ frequencia: 'diaria' })).toBe('Todos os dias');
    expect(descreverFrequencia({ frequencia: 'semanal', diaSemana: 5 })).toBe('Todas as semanas (sexta)');
    expect(descreverFrequencia({ frequencia: 'mensal', diaMes: 31 })).toBe('Todos os meses (dia 31)');
  });

  it('criar, listar, pausar, mudar o valor e apagar', async () => {
    api.responder('POST', '/api/gastos-recorrentes', { id: 'g1' }, 201);
    api.responder('GET', '/api/gastos-recorrentes', [{ id: 'g1', titulo: 'Café', valor: 1.2, frequencia: 'diaria', ativo: true }]);
    api.responder('PATCH', '/api/gastos-recorrentes/g1');
    api.responder('DELETE', '/api/gastos-recorrentes/g1');

    expect(await GastosRecorrentesDB.add({ titulo: 'Café', valor: 1.2, frequencia: 'diaria' })).toBe('g1');
    expect((await GastosRecorrentesDB.getAll())[0].titulo).toBe('Café');
    await GastosRecorrentesDB.definirAtivo('g1', false);
    await GastosRecorrentesDB.update('g1', { valor: 1.5 });
    await GastosRecorrentesDB.remove('g1');

    expect(api.feitos('POST', '/api/gastos-recorrentes')[0].corpo).toEqual({ titulo: 'Café', valor: 1.2, frequencia: 'diaria' });
    expect(api.feitos('PATCH', '/api/gastos-recorrentes/g1').map((p) => p.corpo)).toEqual([{ ativo: false }, { valor: 1.5 }]);
    expect(api.feitos('DELETE', '/api/gastos-recorrentes/g1')).toHaveLength(1);
  });
});

describe('pesquisa', () => {
  it('intervalos rápidos a contar de hoje', () => {
    const hoje = new Date(2026, 9, 3); // 3/10/2026
    expect(datasDoIntervalo('mes', hoje)).toEqual({ de: '2026-10-01', ate: '2026-10-03' });
    expect(datasDoIntervalo('3meses', hoje)).toEqual({ de: '2026-08-01', ate: '2026-10-03' });
    expect(datasDoIntervalo('3meses', new Date(2026, 0, 15))).toEqual({ de: '2025-11-01', ate: '2026-01-15' });
    expect(datasDoIntervalo('ano', hoje)).toEqual({ de: '2026-01-01', ate: '2026-10-03' });
    expect(datasDoIntervalo('tudo', hoje)).toEqual({});
  });

  it('a query só leva os filtros preenchidos', () => {
    expect(queryPesquisa({})).toBe('');
    expect(queryPesquisa({ texto: '  café ', categoria: 'restauracao', valorMin: 2, valorMax: NaN, de: '2026-10-01', pagina: 2 })).toBe(
      '?texto=caf%C3%A9&categoria=restauracao&valorMin=2&de=2026-10-01&pagina=2'
    );
  });

  it('pede a página à API', async () => {
    api.responder('GET', '/api/despesas-extras/pesquisa?texto=cafe&meioPagamento=cartaoAlimentacao', {
      total: 1,
      soma: 2,
      pagina: 1,
      tamanho: 50,
      itens: [{ id: 'e1', titulo: 'Café', valor: 2 }],
    });
    const resultado = await PesquisaDB.pesquisar({ texto: 'cafe', meioPagamento: 'cartaoAlimentacao' });
    expect(resultado.total).toBe(1);
    expect(resultado.itens[0].titulo).toBe('Café');
  });
});

describe('histórico de alterações', () => {
  it('frases em português, com o artigo certo e as automáticas à parte', () => {
    expect(fraseAlteracao({ entidade: 'DespesaFixa', descricao: 'Combustível Carro', acao: 'apagada', origem: 'DELETE /api/x' })).toBe(
      'Apagaste a despesa fixa Combustível Carro'
    );
    expect(fraseAlteracao({ entidade: 'Orcamento', descricao: 'lazer', acao: 'criada', origem: 'POST /api/orcamentos' })).toBe(
      'Criaste o orçamento lazer'
    );
    expect(fraseAlteracao({ entidade: 'DespesaExtra', descricao: 'Café', acao: 'criada', origem: 'sistema' })).toBe(
      'Criado automaticamente: gasto Café'
    );
  });

  it('detalhes por campo, sem os técnicos', () => {
    expect(
      linhasDetalhe({
        acao: 'alterada',
        alteracoes: { Valor: { de: 20, para: 25 }, MeioPagamento: { de: 'Conta', para: 'CartaoAlimentacao' }, Mes: { de: '2026-10', para: '2026-11' } },
      })
    ).toEqual(['Valor: 20,00 → 25,00', 'Pago com: conta → cartão de alimentação']);
    expect(linhasDetalhe({ acao: 'criada', alteracoes: { Data: { para: '2026-10-03' } } })).toEqual(['Data: 03/10/2026']);
    expect(linhasDetalhe({ acao: 'apagada' })).toEqual([]);
  });

  it('data curta e pedido à API', async () => {
    const quando = new Date(2026, 9, 3, 11, 20).toISOString();
    expect(quandoCurto(quando)).toBe('03/10 11:20');
    api.responder('GET', '/api/alteracoes?pagina=2&tamanho=30', { total: 31, pagina: 2, tamanho: 30, itens: [] });
    expect((await AlteracoesDB.listar(2)).total).toBe(31);
  });
});
