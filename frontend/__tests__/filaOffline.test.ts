// A fila offline dos gastos novos: sem internet ficam guardados e são enviados por ordem, uma só
// vez (Idempotency-Key), quando a ligação voltar. A API, o NetInfo e o AsyncStorage são falsos.

jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  pedir: jest.fn(),
}));
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: null } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { ErroApi, pedir } from '../services/api';
import { DespesasExtrasDB } from '../services/database';
import { ouvir } from '../services/eventos';
import {
  adicionarGasto,
  apagarPendente,
  editarPendente,
  eFalhaDeRede,
  listarPendentes,
  sincronizar,
} from '../services/filaOffline';

const pedirFalso = pedir as jest.Mock;
const netFalso = NetInfo.fetch as jest.Mock;

const semRede = () => netFalso.mockResolvedValue({ isConnected: false, isInternetReachable: false });
const comRede = () => netFalso.mockResolvedValue({ isConnected: true, isInternetReachable: true });

const gasto = (titulo: string, valor = 5) => ({ titulo, valor, data: '2026-10-03', categoria: 'restauracao' as const, meioPagamento: 'conta' as const });

// O que a "API" recebeu: título e Idempotency-Key de cada POST
const enviados = () =>
  pedirFalso.mock.calls.map(([caminho, opcoes]) => ({
    caminho,
    titulo: opcoes.corpo.titulo,
    chave: opcoes.cabecalhos?.['Idempotency-Key'],
  }));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  comRede();
  pedirFalso.mockResolvedValue({ id: 'test-id-123' });
});

describe('adicionarGasto', () => {
  it('com internet envia logo, com uma Idempotency-Key, e não guarda nada na fila', async () => {
    const resultado = await DespesasExtrasDB.add('u1', gasto('Almoço'));
    expect(resultado).toEqual({ pendente: false, id: 'test-id-123' });
    expect(enviados()).toEqual([{ caminho: '/api/despesas-extras', titulo: 'Almoço', chave: expect.stringMatching(/^[0-9a-f-]{36}$/) }]);
    expect(pedirFalso.mock.calls[0][1]).toMatchObject({ metodo: 'POST', corpo: gasto('Almoço') });
    expect(await listarPendentes('u1')).toEqual([]);
  });

  it('sem rede (NetInfo) guarda na fila sem tentar o pedido', async () => {
    semRede();
    const resultado = await adicionarGasto('u1', gasto('Café', 0.8));
    expect(resultado.pendente).toBe(true);
    expect(pedirFalso).not.toHaveBeenCalled();
    const fila = await listarPendentes('u1');
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({ userId: 'u1', gasto: gasto('Café', 0.8) });
  });

  it('se o pedido falha por rede guarda na fila com a MESMA chave (a resposta pode ter-se perdido)', async () => {
    pedirFalso.mockRejectedValueOnce(new ErroApi('Sem ligação ao servidor.', 0));
    const resultado = await adicionarGasto('u1', gasto('Táxi'));
    expect(resultado.pendente).toBe(true);
    const [pendente] = await listarPendentes('u1');
    expect(pendente.id).toBe(enviados()[0].chave);
  });

  it('uma recusa da API (409, 400) é lançada e não entra na fila', async () => {
    pedirFalso.mockRejectedValueOnce(new ErroApi('O cartão de alimentação só tem 2,00 €.', 409));
    await expect(adicionarGasto('u1', gasto('Jantar'))).rejects.toMatchObject({ estado: 409 });
    expect(await listarPendentes('u1')).toEqual([]);
  });

  it('eFalhaDeRede só aceita ErroApi sem resposta', () => {
    expect(eFalhaDeRede(new ErroApi('x', 0))).toBe(true);
    expect(eFalhaDeRede(new ErroApi('x', 500))).toBe(false);
    expect(eFalhaDeRede(new TypeError('Network request failed'))).toBe(false);
  });
});

describe('sincronizar', () => {
  async function encherFila(...titulos: string[]) {
    semRede();
    for (const t of titulos) await adicionarGasto('u1', gasto(t));
    comRede();
    return listarPendentes('u1');
  }

  it('envia pela ordem em que foram registados, com a chave de cada um, e avisa "dadosMudaram" uma vez', async () => {
    const fila = await encherFila('Um', 'Dois', 'Três');
    const aviso = jest.fn();
    const deixar = ouvir('dadosMudaram', aviso);

    expect(await sincronizar('u1')).toBe(3);
    deixar();

    expect(enviados().map((e) => e.titulo)).toEqual(['Um', 'Dois', 'Três']);
    expect(enviados().map((e) => e.chave)).toEqual(fila.map((p) => p.id));
    expect(await listarPendentes('u1')).toEqual([]);
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it('sem rede não tenta nada', async () => {
    await encherFila('Um');
    semRede();
    expect(await sincronizar('u1')).toBe(0);
    expect(pedirFalso).not.toHaveBeenCalled();
  });

  it('pára na primeira falha de rede e mantém a ordem para a próxima vez', async () => {
    await encherFila('Um', 'Dois', 'Três');
    pedirFalso.mockResolvedValueOnce(null).mockRejectedValueOnce(new ErroApi('Sem ligação.', 0));

    expect(await sincronizar('u1')).toBe(1);
    expect((await listarPendentes('u1')).map((p) => p.gasto.titulo)).toEqual(['Dois', 'Três']);

    pedirFalso.mockReset().mockResolvedValue(null);
    expect(await sincronizar('u1')).toBe(2);
    expect(enviados().map((e) => e.titulo)).toEqual(['Dois', 'Três']);
  });

  it('não envia duas vezes o mesmo gasto com envios ao mesmo tempo', async () => {
    await encherFila('Um', 'Dois');
    await Promise.all([sincronizar('u1'), sincronizar('u1'), sincronizar('u1')]);
    expect(enviados().map((e) => e.titulo)).toEqual(['Um', 'Dois']);
  });

  it('um erro do servidor (5xx) ou da sessão (401) deixa tudo para mais tarde, sem marcar erro', async () => {
    await encherFila('Um');
    pedirFalso.mockRejectedValueOnce(new ErroApi('Erro no servidor.', 503));
    expect(await sincronizar('u1')).toBe(0);
    pedirFalso.mockRejectedValueOnce(new ErroApi('A sessão expirou.', 401));
    expect(await sincronizar('u1')).toBe(0);
    expect((await listarPendentes('u1'))[0].erro).toBeUndefined();
  });

  it('uma recusa (4xx) marca o gasto com o erro, passa ao seguinte e não o volta a tentar até ser corrigido', async () => {
    await encherFila('Recusado', 'Bom');
    pedirFalso.mockRejectedValueOnce(new ErroApi('O cartão de alimentação só tem 2,00 €.', 409));

    expect(await sincronizar('u1')).toBe(1);
    let fila = await listarPendentes('u1');
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({ gasto: { titulo: 'Recusado' }, erro: 'O cartão de alimentação só tem 2,00 €.' });

    pedirFalso.mockClear();
    expect(await sincronizar('u1')).toBe(0);
    expect(pedirFalso).not.toHaveBeenCalled();

    // Corrigido: volta a ser tentado (com a mesma chave) e sai da fila
    await editarPendente(fila[0].id, { ...fila[0].gasto, meioPagamento: 'conta', valor: 2 });
    fila = await listarPendentes('u1');
    expect(fila[0].erro).toBeUndefined();
    expect(await sincronizar('u1')).toBe(1);
    expect(enviados()[0]).toMatchObject({ titulo: 'Recusado', chave: fila[0].id });
    expect(await listarPendentes('u1')).toEqual([]);
  });

  it('apagar tira o gasto da fila; cada utilizador só envia os seus', async () => {
    semRede();
    await adicionarGasto('u1', gasto('Meu'));
    await adicionarGasto('u2', gasto('De outro'));
    const apagar = await adicionarGasto('u1', gasto('Engano'));
    if (!apagar.pendente) throw new Error('devia ficar na fila');
    await apagarPendente(apagar.gasto.id);
    comRede();

    expect(await sincronizar('u1')).toBe(1);
    expect(enviados().map((e) => e.titulo)).toEqual(['Meu']);
    expect((await listarPendentes('u2')).map((p) => p.gasto.titulo)).toEqual(['De outro']);
  });
});

describe('mensagens sem internet', () => {
  it('juntam "Sem ligação à internet." só logo a seguir a um pedido falhar por falta de rede', () => {
    const { comMotivoDeRede, registarFalhaRede, falhaRedeRecente } = require('../services/ligacao');
    const agora = Date.now();
    expect(falhaRedeRecente(agora)).toBe(false);
    expect(comMotivoDeRede('Não foi possível apagar a despesa.')).toBe('Não foi possível apagar a despesa.');
    registarFalhaRede();
    expect(comMotivoDeRede('Não foi possível apagar a despesa.')).toBe('Sem ligação à internet. Não foi possível apagar a despesa.');
    expect(comMotivoDeRede('Sem ligação ao servidor.')).toBe('Sem ligação ao servidor.');
    expect(falhaRedeRecente(Date.now() + 10_000)).toBe(false);
  });
});
