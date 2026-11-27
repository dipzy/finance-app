// O agendamento dos lembretes (services/notificacoes.ts) com o expo-notifications e a API substituídos

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
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
}));
jest.mock('../services/database', () => ({
  DespesasFixasDB: { getAll: jest.fn() },
  PagamentosDB: { getDoMes: jest.fn() },
  SalarioDB: { getConfig: jest.fn() },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { DespesasFixasDB, PagamentosDB, SalarioDB } from '../services/database';
import { __reporDefinicoes, guardarDefinicoes } from '../services/definicoes';
import {
  CANAL_PAGAMENTOS,
  definirUtilizadorDosLembretes,
  pedirPermissao,
  reagendarNotificacoes,
  testarNotificacao,
} from '../services/notificacoes';

const N = Notifications as jest.Mocked<typeof Notifications>;
const permissao = (granted: boolean, canAskAgain = true) => ({ granted, canAskAgain, status: granted ? 'granted' : 'undetermined', expires: 'never' }) as any;
const agendada = (identifier: string) => ({ identifier, content: {}, trigger: null }) as any;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.useFakeTimers({ now: new Date(2026, 9, 5, 12, 0), doNotFake: ['nextTick', 'setImmediate'] });
  __reporDefinicoes();
  definirUtilizadorDosLembretes('u1');
  N.getPermissionsAsync.mockResolvedValue(permissao(true));
  N.getAllScheduledNotificationsAsync.mockResolvedValue([
    agendada('financas-lembrete-vespera-2026-10-01'),
    agendada('outra-coisa'),
  ]);
  (DespesasFixasDB.getAll as jest.Mock).mockResolvedValue([
    { id: 'r', titulo: 'Renda', valor: 550, diaDebito: 10 },
    { id: 'l', titulo: 'Luz', valor: 40, diaDebito: 20 },
  ]);
  (PagamentosDB.getDoMes as jest.Mock).mockImplementation(async (_u: string, mes: string) =>
    mes === '2026-10' ? [{ id: '2026-10_l', fixaId: 'l', mes, titulo: 'Luz', valor: 40, data: '2026-10-02', estado: 'pago' }] : []
  );
  (SalarioDB.getConfig as jest.Mock).mockResolvedValue({ valor: '1500', diaRecebimento: 25 });
});

afterEach(() => {
  jest.useRealTimers();
});

it('com as notificações ligadas: cancela só os lembretes da app e agenda os próximos', async () => {
  await guardarDefinicoes({ notificacoes: true });
  const lembretes = await reagendarNotificacoes();

  expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('financas-lembrete-vespera-2026-10-01');

  const ids = N.scheduleNotificationAsync.mock.calls.map(([pedido]) => pedido.identifier);
  expect(ids).toEqual([
    'financas-lembrete-vespera-2026-10-10', // Renda (a Luz de outubro já está paga)
    'financas-lembrete-salario-2026-10',
    'financas-lembrete-vespera-2026-11-10',
    'financas-lembrete-vespera-2026-11-20',
    'financas-lembrete-salario-2026-11',
  ]);
  expect(lembretes).toHaveLength(5);

  const [primeiro] = N.scheduleNotificationAsync.mock.calls[0];
  expect(primeiro.content).toMatchObject({ title: 'Renda sai amanhã — 550,00 €', data: { url: '/(tabs)/despesas-fixas' } });
  expect(primeiro.trigger).toEqual({ type: 'date', date: new Date(2026, 9, 9, 9, 0), channelId: CANAL_PAGAMENTOS });
  expect(PagamentosDB.getDoMes).toHaveBeenCalledWith('u1', '2026-10');
  expect(PagamentosDB.getDoMes).toHaveBeenCalledWith('u1', '2026-11');
});

it('o salário pode ser desligado e o "próprio dia" ligado', async () => {
  await guardarDefinicoes({ notificacoes: true, lembrarSalario: false, lembrarNoDia: true });
  await reagendarNotificacoes();
  const ids = N.scheduleNotificationAsync.mock.calls.map(([pedido]) => pedido.identifier);
  expect(ids.some((id) => id!.includes('salario'))).toBe(false);
  expect(ids).toContain('financas-lembrete-dia-2026-10-10');
});

it('desligadas: cancela os lembretes e não pede nada à API', async () => {
  const lembretes = await reagendarNotificacoes();
  expect(lembretes).toEqual([]);
  expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('financas-lembrete-vespera-2026-10-01');
  expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(DespesasFixasDB.getAll).not.toHaveBeenCalled();
});

it('sem sessão ou sem permissão: cancela', async () => {
  await guardarDefinicoes({ notificacoes: true });
  definirUtilizadorDosLembretes(null);
  expect(await reagendarNotificacoes()).toEqual([]);

  definirUtilizadorDosLembretes('u1');
  N.getPermissionsAsync.mockResolvedValue(permissao(false));
  expect(await reagendarNotificacoes()).toEqual([]);
  expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
});

it('sem ligação à API: ficam os lembretes que já estavam', async () => {
  await guardarDefinicoes({ notificacoes: true });
  (DespesasFixasDB.getAll as jest.Mock).mockRejectedValue(new Error('sem rede'));
  const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await reagendarNotificacoes()).toBeNull();
  expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  aviso.mockRestore();
});

it('pedidos seguidos não se misturam: corre outra vez no fim, com os dados novos', async () => {
  await guardarDefinicoes({ notificacoes: true });
  const a = reagendarNotificacoes();
  const b = reagendarNotificacoes();
  const c = reagendarNotificacoes();
  await Promise.all([a, b, c]);
  // Duas passagens (a primeira e uma repetição), não três
  expect(DespesasFixasDB.getAll).toHaveBeenCalledTimes(2);
});

it('pedirPermissao: pede uma vez e não volta a pedir se o utilizador recusou de vez', async () => {
  N.getPermissionsAsync.mockResolvedValue(permissao(false, true));
  N.requestPermissionsAsync.mockResolvedValue(permissao(true));
  expect(await pedirPermissao()).toBe(true);
  expect(N.requestPermissionsAsync).toHaveBeenCalledTimes(1);

  N.getPermissionsAsync.mockResolvedValue(permissao(false, false));
  expect(await pedirPermissao()).toBe(false);
  expect(N.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

it('testarNotificacao: um exemplo daqui a 5 segundos, no canal Pagamentos', async () => {
  expect(await testarNotificacao()).toBe(true);
  const [pedido] = N.scheduleNotificationAsync.mock.calls[0];
  expect(pedido.trigger).toEqual({ type: 'timeInterval', seconds: 5, channelId: CANAL_PAGAMENTOS });
  // Fora do prefixo dos lembretes: reagendar não o cancela
  expect(pedido.identifier!.startsWith('financas-lembrete')).toBe(false);
});
