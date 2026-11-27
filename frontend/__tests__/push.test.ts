// Notificações push do servidor: registar o token do Expo (POST /api/dispositivos), retirá-lo (DELETE),
// não registar na web nem sem permissão, e não duplicar os avisos dos lembretes locais.
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
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'projeto-eas-1' } } } },
}));
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));
jest.mock('../services/database', () => ({
  DespesasFixasDB: { getAll: jest.fn() },
  PagamentosDB: { getDoMes: jest.fn() },
  SalarioDB: { getConfig: jest.fn() },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { __reporDefinicoes, guardarDefinicoes } from '../services/definicoes';
import { definirUtilizadorDosLembretes, reagendarNotificacoes } from '../services/notificacoes';
import { carregarEstadoPush, esquecerPush, projectIdExpo, registarPush, removerPush } from '../services/push';
import { DespesasFixasDB, PagamentosDB, SalarioDB } from '../services/database';
import { ApiFalsa, instalarApiFalsa } from '../test-utils/apiFalsa';
import { __reporIdioma, definirIdioma } from '../i18n';

const N = Notifications as jest.Mocked<typeof Notifications>;
const permissao = (granted: boolean, canAskAgain = true) =>
  ({ granted, canAskAgain, status: granted ? 'granted' : 'undetermined', expires: 'never' }) as any;
const TOKEN = 'ExponentPushToken[abc123]';

let api: ApiFalsa;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  __reporDefinicoes();
  __reporIdioma?.();
  api = instalarApiFalsa();
  N.getPermissionsAsync.mockResolvedValue(permissao(true));
  N.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: TOKEN } as any);
  await esquecerPush();
});

describe('registar', () => {
  it('com permissão: token do Expo (com o projectId do app.json) → POST /api/dispositivos com plataforma e idioma', async () => {
    api.responder('POST', '/api/dispositivos', { id: 'd1', plataforma: 'ios', idioma: 'pt' });
    expect(await registarPush()).toBe('registado');

    expect(N.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'projeto-eas-1' });
    const pedido = api.feitos('POST', '/api/dispositivos')[0];
    expect(pedido.corpo).toEqual({ token: TOKEN, plataforma: expect.stringMatching(/^(android|ios)$/), idioma: 'pt' });
    expect(await AsyncStorage.getItem('@financas:push-token')).toBe(TOKEN);
    expect(projectIdExpo()).toBe('projeto-eas-1');
  });

  it('manda o idioma da app (en)', async () => {
    await definirIdioma('en');
    api.responder('POST', '/api/dispositivos', { id: 'd1' });
    await registarPush();
    expect(api.feitos('POST', '/api/dispositivos')[0].corpo.idioma).toBe('en');
    await definirIdioma('pt');
  });

  it('sem permissão não pede nada nem fala com a API (a permissão pede-se nas Definições, com explicação)', async () => {
    N.getPermissionsAsync.mockResolvedValue(permissao(false, true));
    expect(await registarPush()).toBe('sem-permissao');
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(N.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(api.pedidos).toHaveLength(0);
  });

  it('se a API não responder devolve "erro" sem lançar e sem guardar o token', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    api.responder('POST', '/api/dispositivos', { status: 500, title: 'x' }, 500);
    expect(await registarPush()).toBe('erro');
    expect(await AsyncStorage.getItem('@financas:push-token')).toBeNull();
  });
});

describe('retirar', () => {
  it('DELETE /api/dispositivos?token=... com o token guardado, que depois é esquecido', async () => {
    api.responder('POST', '/api/dispositivos', { id: 'd1' });
    await registarPush();
    api.responder('DELETE', `/api/dispositivos?token=${encodeURIComponent(TOKEN)}`);

    await removerPush();
    expect(api.feitos('DELETE', `/api/dispositivos?token=${encodeURIComponent(TOKEN)}`)).toHaveLength(1);
    expect(await AsyncStorage.getItem('@financas:push-token')).toBeNull();
  });

  it('sem token guardado não faz pedidos; se a API falhar o token é esquecido na mesma', async () => {
    await removerPush();
    expect(api.pedidos).toHaveLength(0);

    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await AsyncStorage.setItem('@financas:push-token', TOKEN);
    await removerPush(); // sem rota: 404 da API falsa
    expect(await AsyncStorage.getItem('@financas:push-token')).toBeNull();
  });
});

describe('web', () => {
  it('não regista nem retira nada (sem push na web)', async () => {
    jest.resetModules();
    jest.doMock('react-native', () => {
      const real = jest.requireActual('react-native');
      return Object.setPrototypeOf({ Platform: { ...real.Platform, OS: 'web' } }, real);
    });
    await jest.isolateModulesAsync(async () => {
      const push = require('../services/push');
      expect(push.pushDisponivel).toBe(false);
      expect(await push.registarPush()).toBe('indisponivel');
      await push.removerPush();
      expect(await push.carregarEstadoPush()).toBe(false);
    });
    jest.dontMock('react-native');
    expect(api.pedidos).toHaveLength(0);
    expect(N.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });
});

describe('sem avisos duplicados', () => {
  const fixa = { id: 'f1', titulo: 'Renda', valor: 550, diaDebito: 15, ativo: true } as any;
  const idsAgendados = () => N.scheduleNotificationAsync.mock.calls.map(([c]) => (c as any).identifier as string);

  async function preparar() {
    jest.useFakeTimers({ now: new Date(2026, 9, 5, 12, 0), doNotFake: ['nextTick', 'setImmediate'] });
    await guardarDefinicoes({ notificacoes: true, lembrarNoDia: true, lembrarSalario: true });
    definirUtilizadorDosLembretes('u1');
    (DespesasFixasDB.getAll as jest.Mock).mockResolvedValue([fixa]);
    (PagamentosDB.getDoMes as jest.Mock).mockResolvedValue([]);
    (SalarioDB.getConfig as jest.Mock).mockResolvedValue({ salario: 1500, diaRecebimento: 25, ultimoRecebimento: null });
  }

  afterEach(async () => {
    await esquecerPush();
    jest.useRealTimers();
  });

  it('sem push do servidor os lembretes das despesas e do salário ficam todos locais (plano B)', async () => {
    await preparar();
    await reagendarNotificacoes();
    expect(idsAgendados().some((id) => id.includes('vespera'))).toBe(true);
    expect(idsAgendados().some((id) => id.includes('salario'))).toBe(true);
  });

  it('com este telemóvel registado nas push do servidor só o salário continua local', async () => {
    await preparar();
    await AsyncStorage.setItem('@financas:push-token', TOKEN);
    await carregarEstadoPush();
    await reagendarNotificacoes();
    await jest.advanceTimersByTimeAsync(0);
    N.scheduleNotificationAsync.mockClear();

    await reagendarNotificacoes();
    const ids = idsAgendados();
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.includes('salario'))).toBe(true);
  });

  it('ao retirar o registo os lembretes das despesas voltam', async () => {
    await preparar();
    await AsyncStorage.setItem('@financas:push-token', TOKEN);
    await carregarEstadoPush();
    await reagendarNotificacoes();
    api.responder('DELETE', `/api/dispositivos?token=${encodeURIComponent(TOKEN)}`);
    N.scheduleNotificationAsync.mockClear();

    await removerPush();
    await jest.advanceTimersByTimeAsync(0);
    await reagendarNotificacoes();
    expect(idsAgendados().some((id) => id.includes('vespera'))).toBe(true);
  });
});
