// A cópia única dos dados do Firestore para a API (services/migracaoFirestore.ts): lê o Firestore
// (aqui o Firestore falso em memória), normaliza os tipos e envia para POST /api/migracao.
jest.mock('firebase/firestore', () => require('../test-utils/firestoreFalso'));
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));

import { calcularSaldoDisponivel } from '../services/database';
import { migrarDoFirestoreSeNecessario, normalizarDadosFirestore, reiniciarMigracaoFirestore } from '../services/migracaoFirestore';
import { ApiFalsa, instalarApiFalsa } from '../test-utils/apiFalsa';
import { escreverDocumento, limparFirestore } from '../test-utils/firestoreFalso';

const UID = 'utilizador-firestore';
const resumo = { despesasFixas: 1, pagamentosFixas: 1, despesasExtras: 1, poupancas: 1, dividas: 0, meses: 1, ignorados: [] };
let api: ApiFalsa;

beforeEach(() => {
  limparFirestore();
  reiniciarMigracaoFirestore();
  api = instalarApiFalsa();
  api.responder('GET', '/api/migracao/estado', { temDados: false, importado: false });
  api.responder('POST', '/api/migracao', resumo);
  api.responder('GET', '/api/conta/saldo', { saldo: 700 });

  // Como as versões anteriores da app deixaram os dados (alguns campos com outros tipos)
  escreverDocumento(`users/${UID}`, {
    email: 'diogo@exemplo.pt',
    name: 'Ana',
    createdAt: '2026-01-10T09:00:00.000Z',
    salario: { valor: 1500, diaRecebimento: '25', lastReceived: '2026-09-25T10:00:00.000Z' },
    contaCorrente: { saldo: '700', ultimaAtualizacao: '2026-10-01T08:00:00.000Z' },
    migracoes: { pagamentosPorMes: true },
  });
  escreverDocumento(`users/${UID}/despesasFixas/renda`, { titulo: 'Renda', valor: 300, diaDebito: 1, criadoEm: '2026-09-01' });
  escreverDocumento(`users/${UID}/pagamentosFixas/2026-10_renda`, { fixaId: 'renda', mes: '2026-10', titulo: 'Renda', valor: 300, data: '2026-10-01', estado: 'pago' });
  escreverDocumento(`users/${UID}/despesasExtras/cinema`, { titulo: 'Cinema', valor: 10, data: '28/09/2026', criadoEm: '2026-09-28' });
  escreverDocumento(`users/${UID}/poupancas/p1`, { nome: 'PPR', tipo: 'valor', valor: 50, saldo: 300, ordem: 0 });
  escreverDocumento(`users/${UID}/meses/2026-09`, { mes: '2026-09', saldoFinal: 700 });
  // Dados de outro utilizador não vão
  escreverDocumento('users/outro/despesasFixas/x', { titulo: 'Não é meu', valor: 1 });
});

it('copia tudo o que o utilizador tem no Firestore, com os ids e os tipos que a API espera', async () => {
  expect(await migrarDoFirestoreSeNecessario(UID)).toEqual({ copiado: true, resumo });

  const [pedido] = api.feitos('POST', '/api/migracao');
  expect(pedido.corpo).toEqual({
    utilizador: {
      email: 'diogo@exemplo.pt',
      name: 'Ana',
      createdAt: '2026-01-10T09:00:00.000Z',
      salario: { valor: '1500', diaRecebimento: 25, lastReceived: '2026-09-25T10:00:00.000Z' },
      contaCorrente: { saldo: 700, ultimaAtualizacao: '2026-10-01T08:00:00.000Z' },
      migracoes: { pagamentosPorMes: true },
    },
    despesasFixas: [{ id: 'renda', titulo: 'Renda', valor: 300, diaDebito: 1, criadoEm: '2026-09-01' }],
    pagamentosFixas: [{ id: '2026-10_renda', fixaId: 'renda', mes: '2026-10', titulo: 'Renda', valor: 300, data: '2026-10-01', estado: 'pago' }],
    // A data no formato antigo vai tal como está: a API converte-a
    despesasExtras: [{ id: 'cinema', titulo: 'Cinema', valor: 10, data: '28/09/2026', criadoEm: '2026-09-28' }],
    poupancas: [{ id: 'p1', nome: 'PPR', tipo: 'valor', valor: '50', saldo: 300, ordem: 0 }],
    dividas: [],
    meses: [{ id: '2026-09', saldoFinal: 700 }],
  });
});

it('não copia nada se o servidor já tiver dados (ou a cópia já tiver sido feita)', async () => {
  api.responder('GET', '/api/migracao/estado', { temDados: true, importado: false });
  expect(await migrarDoFirestoreSeNecessario(UID)).toEqual({ copiado: false });
  expect(api.feitos('POST', '/api/migracao')).toHaveLength(0);
});

it('corre uma vez de cada vez e não volta a perguntar depois de correr bem', async () => {
  await Promise.all([migrarDoFirestoreSeNecessario(UID), migrarDoFirestoreSeNecessario(UID)]);
  await migrarDoFirestoreSeNecessario(UID);
  expect(api.feitos('GET', '/api/migracao/estado')).toHaveLength(1);
  expect(api.feitos('POST', '/api/migracao')).toHaveLength(1);
});

it('os pedidos dos ecrãs esperam pela cópia (para não criarem dados no servidor antes dela)', async () => {
  const migracao = migrarDoFirestoreSeNecessario(UID);
  const saldo = calcularSaldoDisponivel(UID);
  await Promise.all([migracao, saldo]);
  expect(api.pedidos.map((p) => `${p.metodo} ${p.caminho}`)).toEqual([
    'GET /api/migracao/estado',
    'POST /api/migracao',
    'GET /api/conta/saldo',
  ]);
});

it('se outro dispositivo copiou entretanto (409), não é erro', async () => {
  api.responder('POST', '/api/migracao', { status: 409, detail: 'Este utilizador já tem dados no servidor' }, 409);
  expect(await migrarDoFirestoreSeNecessario(UID)).toEqual({ copiado: false });
});

it('se falhar, o erro chega a quem chamou e volta a tentar da próxima vez', async () => {
  api.responder('POST', '/api/migracao', { status: 500 }, 500);
  await expect(migrarDoFirestoreSeNecessario(UID)).rejects.toMatchObject({ estado: 500 });

  api.responder('POST', '/api/migracao', resumo);
  expect(await migrarDoFirestoreSeNecessario(UID)).toEqual({ copiado: true, resumo });
});

it('Timestamps do Firestore passam a texto ISO e valores inválidos ficam de fora', () => {
  const dados = normalizarDadosFirestore(
    { createdAt: { toDate: () => new Date('2026-01-10T09:00:00.000Z') }, contaCorrente: { saldo: 'abc' } },
    { despesasExtras: [{ id: 'e1', titulo: 'Café', valor: '1.2', criadoEm: { seconds: 1790000000 } }] }
  );
  expect(dados.utilizador).toEqual({ createdAt: '2026-01-10T09:00:00.000Z', contaCorrente: {} });
  expect(dados.despesasExtras).toEqual([{ id: 'e1', titulo: 'Café', valor: 1.2, criadoEm: new Date(1790000000 * 1000).toISOString() }]);
  expect(dados.meses).toEqual([]);
});
