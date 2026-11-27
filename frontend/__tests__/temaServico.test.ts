// A aparência (services/tema.ts): guarda a escolha, aplica-a no sistema e reinicia a app só quando as
// cores mudam. Os testes arrancam sempre em escuro (jest.setup.js), por isso "claro" é a mudança.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { __reporDefinicoes, obterDefinicoes } from '../services/definicoes';
import { acoesTema, mudarTema, sincronizarTemaNoArranque } from '../services/tema';

let reiniciar: jest.SpyInstance;
let aplicar: jest.Mock;

beforeEach(async () => {
  __reporDefinicoes();
  await AsyncStorage.clear();
  reiniciar = jest.spyOn(acoesTema, 'reiniciarApp').mockResolvedValue(undefined);
  aplicar = jest.fn();
  (Appearance as unknown as { setColorScheme: jest.Mock }).setColorScheme = aplicar;
});

afterEach(() => jest.restoreAllMocks());

describe('mudarTema', () => {
  it('claro: guarda, diz ao sistema e reinicia (as cores do arranque eram escuras)', async () => {
    expect(await mudarTema('claro')).toBe(true);
    expect((await obterDefinicoes()).tema).toBe('claro');
    expect(aplicar).toHaveBeenCalledWith('light');
    expect(reiniciar).toHaveBeenCalledTimes(1);
  });

  it('escuro e sistema (o sistema é escuro) não reiniciam: as cores já são essas', async () => {
    expect(await mudarTema('escuro')).toBe(false);
    expect(aplicar).toHaveBeenLastCalledWith('dark');
    expect(await mudarTema('sistema')).toBe(false);
    expect(aplicar).toHaveBeenLastCalledWith('unspecified');
    expect((await obterDefinicoes()).tema).toBe('sistema');
    expect(reiniciar).not.toHaveBeenCalled();
  });
});

describe('sincronizarTemaNoArranque', () => {
  it('sem escolha guardada não faz nada', async () => {
    expect(await sincronizarTemaNoArranque()).toBe(false);
    expect(reiniciar).not.toHaveBeenCalled();
  });

  it('com "claro" guardado reinicia uma vez e não entra em ciclo', async () => {
    await AsyncStorage.setItem('@financas:definicoes', JSON.stringify({ tema: 'claro' }));
    expect(await sincronizarTemaNoArranque(1_000_000)).toBe(true);
    expect(aplicar).toHaveBeenCalledWith('light');
    expect(reiniciar).toHaveBeenCalledTimes(1);

    // Outro arranque logo a seguir (o override não pegou): desiste em vez de reiniciar sempre
    expect(await sincronizarTemaNoArranque(1_005_000)).toBe(false);
    expect(reiniciar).toHaveBeenCalledTimes(1);
  });

  it('com "escuro" guardado (as cores já são escuras) só aplica no sistema', async () => {
    await AsyncStorage.setItem('@financas:definicoes', JSON.stringify({ tema: 'escuro' }));
    expect(await sincronizarTemaNoArranque()).toBe(false);
    expect(aplicar).toHaveBeenCalledWith('dark');
    expect(reiniciar).not.toHaveBeenCalled();
  });
});
