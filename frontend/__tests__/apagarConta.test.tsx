// Apagar todos os dados e a conta: o pedido à API (DELETE /api/conta com {confirmacao:"APAGAR"}), a
// limpeza deste telemóvel e o passo do Firebase (AuthContext.apagarConta), incluindo as falhas a meio.
jest.setTimeout(20_000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 6 },
  AndroidNotificationVisibility: { PRIVATE: 2 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => [
    { identifier: 'financas-lembrete-vespera-2026-10-10' },
    { identifier: 'outra-coisa' },
  ]),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(),
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));
jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  deleteUser: jest.fn(),
  onAuthStateChanged: jest.fn(() => () => undefined),
  reload: jest.fn(),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  updateProfile: jest.fn(),
}));
jest.mock('../services/firebase', () => {
  const auth: any = { currentUser: null };
  return { db: {}, auth };
});
jest.mock('../services/migracaoFirestore', () => ({ migrarDoFirestoreSeNecessario: jest.fn(async () => undefined) }));
jest.mock('../services/migracaoLocal', () => ({ encontrarUtilizadorLocal: jest.fn(), importarDadosLocais: jest.fn() }));
jest.mock('../utils/helpers', () => ({ mostrarAlerta: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteUser, signOut } from 'firebase/auth';
import * as Notifications from 'expo-notifications';
import { act, ReactElement } from 'react';
import { AuthProvider, ResultadoApagarConta, useAuth } from '../contexts/AuthContext';
import { __reporDefinicoes, DEFINICOES_PADRAO, guardarDefinicoes, obterDefinicoes } from '../services/definicoes';
import { ContaDB, limparDadosLocais } from '../services/conta';
import { adicionarGasto, listarPendentes } from '../services/filaOffline';
import { auth } from '../services/firebase';
import { ApiFalsa, instalarApiFalsa } from '../test-utils/apiFalsa';
import { eConfirmacaoValida, PALAVRA_APAGAR } from '../utils/apagarConta';

const renderer: { create(elemento: ReactElement): { unmount(): void } } = require('react-test-renderer');

let api: ApiFalsa;
let contexto: ReturnType<typeof useAuth>;

function Captar() {
  contexto = useAuth();
  return null;
}

async function desenhar() {
  let ecra!: { unmount(): void };
  await act(async () => {
    ecra = renderer.create(
      <AuthProvider>
        <Captar />
      </AuthProvider>
    );
  });
  return ecra;
}

const agoraISO = () => new Date().toISOString();
const utilizadorFirebase = (authTime: string = agoraISO()) => ({
  uid: 'u1',
  getIdToken: async () => 'token-de-teste',
  getIdTokenResult: async () => ({ authTime }),
});

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await AsyncStorage.clear();
  __reporDefinicoes();
  api = instalarApiFalsa();
  (auth as any).currentUser = utilizadorFirebase();
  (deleteUser as jest.Mock).mockImplementation(async () => {
    (auth as any).currentUser = null;
  });
  (signOut as jest.Mock).mockImplementation(async () => {
    (auth as any).currentUser = null;
  });
  api.responder('DELETE', '/api/conta');
});

describe('a palavra de confirmação', () => {
  it('só vale exatamente APAGAR (os espaços à volta não contam)', () => {
    expect(PALAVRA_APAGAR).toBe('APAGAR');
    expect(eConfirmacaoValida('APAGAR')).toBe(true);
    expect(eConfirmacaoValida('  APAGAR ')).toBe(true);
    expect(eConfirmacaoValida('apagar')).toBe(false);
    expect(eConfirmacaoValida('APAGA')).toBe(false);
    expect(eConfirmacaoValida('')).toBe(false);
  });
});

describe('DELETE /api/conta', () => {
  it('envia {confirmacao:"APAGAR"} no corpo', async () => {
    await ContaDB.apagar();
    const [pedido] = api.feitos('DELETE', '/api/conta');
    expect(pedido.corpo).toEqual({ confirmacao: 'APAGAR' });
  });

  it('404 (já não havia nada) conta como apagado; outros erros são lançados', async () => {
    api.responder('DELETE', '/api/conta', { status: 404, title: 'x' }, 404);
    await expect(ContaDB.apagar()).resolves.toBeUndefined();
    api.responder('DELETE', '/api/conta', { status: 400, title: 'Pedido inválido', detail: 'Confirmação errada.' }, 400);
    await expect(ContaDB.apagar()).rejects.toThrow('Confirmação errada.');
  });
});

describe('limpar este telemóvel', () => {
  it('apaga a fila offline, as chaves da app, os lembretes e o bloqueio; mantém o idioma e o tema', async () => {
    await AsyncStorage.setMany({
      '@financas:idioma': 'en',
      '@financas:tema': 'claro',
      '@financas:lembrar': '1',
      '@financas:push-token': 'ExponentPushToken[x]',
      'resumo.vistaGrafico': 'barras',
      'outra-app': 'fica',
    });
    await guardarDefinicoes({ bloqueio: true, notificacoes: true, alertasServidor: true, tema: 'escuro' });
    // Um gasto por enviar (sem rede) fica na fila
    api.fetch.mockRejectedValueOnce(new Error('sem rede'));
    await adicionarGasto('u1', { titulo: 'Café', valor: 1.2 });
    expect(await listarPendentes('u1')).toHaveLength(1);

    await limparDadosLocais();

    expect(await listarPendentes('u1')).toHaveLength(0);
    expect(await AsyncStorage.getItem('financas.filaGastos.v1')).toBeNull();
    expect(await AsyncStorage.getItem('@financas:lembrar')).toBeNull();
    expect(await AsyncStorage.getItem('@financas:push-token')).toBeNull();
    expect(await AsyncStorage.getItem('resumo.vistaGrafico')).toBeNull();
    expect(await AsyncStorage.getItem('@financas:idioma')).toBe('en');
    expect(await AsyncStorage.getItem('@financas:tema')).toBe('claro');
    expect(await AsyncStorage.getItem('outra-app')).toBe('fica');
    // O bloqueio e os lembretes desligam-se; o tema escolhido mantém-se
    expect(await obterDefinicoes()).toEqual({ ...DEFINICOES_PADRAO, tema: 'escuro' });
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('financas-lembrete-vespera-2026-10-10');
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('outra-coisa');
  });
});

describe('AuthContext.apagarConta', () => {
  let resultado: ResultadoApagarConta;
  const apagar = async () => {
    await act(async () => {
      resultado = await contexto.apagarConta();
    });
  };

  it('API apaga, o telemóvel é limpo e o utilizador do Firebase é apagado', async () => {
    const ecra = await desenhar();
    await AsyncStorage.setItem('@financas:lembrar', '1');
    await apagar();

    expect(resultado).toEqual({ estado: 'apagada' });
    expect(api.feitos('DELETE', '/api/conta')[0].corpo).toEqual({ confirmacao: 'APAGAR' });
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem('@financas:lembrar')).toBeNull();
    expect(contexto.user).toBeNull();
    await act(async () => ecra.unmount());
  });

  it('a API é chamada ANTES de apagar o utilizador no Firebase', async () => {
    const ordem: string[] = [];
    api.responder('DELETE', '/api/conta', () => {
      ordem.push('api');
      return undefined;
    });
    (deleteUser as jest.Mock).mockImplementation(async () => {
      ordem.push('firebase');
      (auth as any).currentUser = null;
    });
    const ecra = await desenhar();
    await apagar();
    expect(ordem).toEqual(['api', 'firebase']);
    await act(async () => ecra.unmount());
  });

  it('se a API recusar não se apaga nada (nem no Firebase, nem no telemóvel)', async () => {
    api.responder('DELETE', '/api/conta', { status: 500, title: 'Erro' }, 500);
    const ecra = await desenhar();
    await AsyncStorage.setItem('@financas:lembrar', '1');
    await apagar();

    expect(resultado.estado).toBe('erro-servidor');
    expect(deleteUser).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('@financas:lembrar')).toBe('1');
    await act(async () => ecra.unmount());
  });

  it('com a sessão antiga (entrou há mais de 5 minutos) não apaga nada e pede para entrar outra vez', async () => {
    (auth as any).currentUser = utilizadorFirebase(new Date(Date.now() - 10 * 60_000).toISOString());
    const ecra = await desenhar();
    await apagar();

    expect(resultado).toEqual({ estado: 'sessao-antiga' });
    expect(api.feitos('DELETE', '/api/conta')).toHaveLength(0);
    expect(deleteUser).not.toHaveBeenCalled();
    await act(async () => ecra.unmount());
  });

  it('a API apagou mas o Firebase pediu novo login: dados apagados, sessão terminada e aviso certo', async () => {
    (deleteUser as jest.Mock).mockRejectedValue({ code: 'auth/requires-recent-login' });
    const ecra = await desenhar();
    await AsyncStorage.setItem('@financas:lembrar', '1');
    await apagar();

    expect(resultado).toEqual({ estado: 'acesso-por-apagar', motivo: 'novo-login' });
    expect(api.feitos('DELETE', '/api/conta')).toHaveLength(1);
    expect(await AsyncStorage.getItem('@financas:lembrar')).toBeNull(); // o telemóvel ficou limpo
    expect(signOut).toHaveBeenCalled(); // volta ao login
    expect(contexto.user).toBeNull();
    await act(async () => ecra.unmount());
  });

  it('outra falha do Firebase (ex.: sem rede) também deixa o acesso por apagar', async () => {
    (deleteUser as jest.Mock).mockRejectedValue({ code: 'auth/network-request-failed' });
    const ecra = await desenhar();
    await apagar();
    expect(resultado).toEqual({ estado: 'acesso-por-apagar', motivo: 'falha' });
    expect(signOut).toHaveBeenCalled();
    await act(async () => ecra.unmount());
  });
});
