// Definições deste telemóvel (services/definicoes.ts) e a regra de quando voltar a bloquear (services/bloqueio.ts)

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);
jest.mock('expo-local-authentication', () => ({}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { deveBloquearAoVoltar, permitirSaidaTemporaria, saidaPermitida, terminarSaidaTemporaria } from '../services/bloqueio';
import {
  __reporDefinicoes,
  aoMudarDefinicoes,
  DEFINICOES_PADRAO,
  guardarDefinicoes,
  lerDefinicoes,
  obterDefinicoes,
} from '../services/definicoes';

const CHAVE = '@financas:definicoes';

beforeEach(async () => {
  __reporDefinicoes();
  await AsyncStorage.clear();
});

describe('lerDefinicoes', () => {
  it('sem nada guardado: tudo desligado, salário ligado, 1 minuto', () => {
    expect(lerDefinicoes(null)).toEqual({
      notificacoes: false,
      lembrarNoDia: false,
      lembrarSalario: true,
      alertasServidor: false,
      bloqueio: false,
      bloqueioMinutos: 1,
      ocultos: [],
      tema: 'sistema',
    });
    expect(lerDefinicoes(null)).toEqual(DEFINICOES_PADRAO);
  });

  it('aproveita o que está bem e ignora o resto', () => {
    expect(lerDefinicoes(JSON.stringify({ notificacoes: true, bloqueio: 'sim', bloqueioMinutos: 0 }))).toEqual({
      ...DEFINICOES_PADRAO,
      notificacoes: true,
      bloqueioMinutos: 0,
    });
    expect(lerDefinicoes(JSON.stringify({ bloqueioMinutos: 3 })).bloqueioMinutos).toBe(1);
  });

  it('páginas escondidas: só aproveita texto', () => {
    expect(lerDefinicoes(JSON.stringify({ ocultos: ['anuais', 3, 'dividas'] })).ocultos).toEqual(['anuais', 'dividas']);
    expect(lerDefinicoes(JSON.stringify({ ocultos: 'anuais' })).ocultos).toEqual([]);
  });

  it('texto estragado ou de outro tipo: valores por defeito', () => {
    expect(lerDefinicoes('{nada')).toEqual(DEFINICOES_PADRAO);
    expect(lerDefinicoes('[1,2]')).toEqual(DEFINICOES_PADRAO);
    expect(lerDefinicoes('"texto"')).toEqual(DEFINICOES_PADRAO);
  });
});

describe('obterDefinicoes / guardarDefinicoes', () => {
  it('guarda no dispositivo só o que muda e avisa quem está a ouvir', async () => {
    const ouvinte = jest.fn();
    aoMudarDefinicoes(ouvinte);
    const novas = await guardarDefinicoes({ bloqueio: true, bloqueioMinutos: 5 });
    expect(novas).toEqual({ ...DEFINICOES_PADRAO, bloqueio: true, bloqueioMinutos: 5 });
    expect(ouvinte).toHaveBeenCalledWith(novas);
    expect(JSON.parse((await AsyncStorage.getItem(CHAVE))!)).toEqual(novas);

    // Numa nova abertura da app lê o que ficou guardado
    __reporDefinicoes();
    expect(await obterDefinicoes()).toEqual(novas);
  });

  it('se o AsyncStorage falhar a ler, a app abre com os valores por defeito', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('sem acesso'));
    const silencio = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await obterDefinicoes()).toEqual(DEFINICOES_PADRAO);
    silencio.mockRestore();
  });

  it('se o AsyncStorage falhar a gravar, a mudança fica a valer até fechar a app', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('cheio'));
    const silencio = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(guardarDefinicoes({ notificacoes: true })).resolves.toMatchObject({ notificacoes: true });
    expect((await obterDefinicoes()).notificacoes).toBe(true);
    silencio.mockRestore();
  });
});

describe('deveBloquearAoVoltar', () => {
  const agora = 1_000_000_000;

  it('"Imediatamente": bloqueia sempre que sai', () => {
    expect(deveBloquearAoVoltar(agora - 500, agora, 0)).toBe(true);
  });

  it('1 ou 5 minutos: só se esteve fora pelo menos esse tempo', () => {
    expect(deveBloquearAoVoltar(agora - 59_000, agora, 1)).toBe(false);
    expect(deveBloquearAoVoltar(agora - 60_000, agora, 1)).toBe(true);
    expect(deveBloquearAoVoltar(agora - 4 * 60_000, agora, 5)).toBe(false);
    expect(deveBloquearAoVoltar(agora - 6 * 60_000, agora, 5)).toBe(true);
  });

  it('não chegou a sair: não bloqueia', () => {
    expect(deveBloquearAoVoltar(null, agora, 0)).toBe(false);
  });
});

describe('saídas temporárias (janelas do sistema)', () => {
  it('contam só enquanto a janela está aberta', () => {
    expect(saidaPermitida()).toBe(false);
    permitirSaidaTemporaria();
    expect(saidaPermitida()).toBe(true);
    terminarSaidaTemporaria();
    expect(saidaPermitida()).toBe(false);
  });

  it('acabam sozinhas ao fim do tempo', () => {
    permitirSaidaTemporaria(1000);
    expect(saidaPermitida(Date.now() + 2000)).toBe(false);
    terminarSaidaTemporaria();
  });
});
