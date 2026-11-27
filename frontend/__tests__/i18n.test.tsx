// O núcleo da tradução: por defeito português (nos testes), troca de idioma, interpolação,
// persistência no dispositivo e hooks que acompanham a mudança.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, ReactElement } from 'react';
import { Text } from 'react-native';
import {
  __reporIdioma,
  aoMudarIdioma,
  definirIdioma,
  idiomaAtual,
  idiomaDoDispositivo,
  obterIdioma,
  useIdioma,
} from '../i18n';
import { t, traduzir, useT, type Parametros } from '../i18n';

interface No {
  props: Record<string, any>;
}
interface ReactTestRenderer {
  root: { findAllByType(tipo: unknown): No[] };
  unmount(): void;
}
const renderer: { create(elemento: ReactElement): ReactTestRenderer } = require('react-test-renderer');

const textoDe = (no: No) => [no.props.children].flat(Infinity).join('');

function MostraTraduzido({ chave, params }: { chave: string; params?: Parametros }) {
  const t = useT();
  return <Text>{t(chave, params)}</Text>;
}

beforeEach(async () => {
  __reporIdioma();
  await AsyncStorage.clear();
});

describe('idiomaDoDispositivo', () => {
  it('nos testes é sempre português (os ecrãs verificam o texto em PT)', () => {
    expect(idiomaDoDispositivo()).toBe('pt');
  });
});

describe('t', () => {
  it('em português devolve o próprio texto (a chave)', () => {
    expect(t('Guardar')).toBe('Guardar');
    expect(t('Faltam {n} prestações', { n: 3 })).toBe('Faltam 3 prestações');
  });

  it('em inglês devolve a tradução do dicionário', async () => {
    await definirIdioma('en');
    expect(t('Guardar')).toBe('Save');
    expect(t('Janeiro')).toBe('January');
  });

  it('uma chave sem tradução fica no texto português', async () => {
    await definirIdioma('en');
    expect(t('Isto não está traduzido')).toBe('Isto não está traduzido');
  });

  it('interpolação em inglês: {param} é substituído pelo valor', async () => {
    await definirIdioma('en');
    expect(t('Erro inesperado ({estado}).', { estado: 500 })).toBe('Unexpected error (500).');
  });

  it('um {param} sem valor fica como está na frase', () => {
    expect(t('Faltam {n} prestações')).toBe('Faltam {n} prestações');
  });

  it('traduzir e t são a mesma função', () => {
    expect(traduzir('Erro')).toBe(t('Erro'));
  });
});

describe('mudar de idioma', () => {
  it('guarda no AsyncStorage e avisa os ouvintes', async () => {
    const ouvido: string[] = [];
    const parar = aoMudarIdioma((i) => ouvido.push(i));
    await definirIdioma('en');
    expect(idiomaAtual()).toBe('en');
    expect(await AsyncStorage.getItem('@financas:idioma')).toBe('en');
    expect(ouvido).toEqual(['en']);
    parar();
  });

  it('obterIdioma carrega o valor guardado no dispositivo', async () => {
    await AsyncStorage.setItem('@financas:idioma', 'en');
    expect(await obterIdioma()).toBe('en');
    expect(idiomaAtual()).toBe('en');
  });

  it('um valor desconhecido guardado fica em português', async () => {
    await AsyncStorage.setItem('@financas:idioma', 'fr');
    expect(await obterIdioma()).toBe('pt');
  });
});

describe('useT', () => {
  it('o componente volta a desenhar quando o idioma muda', async () => {
    let ecra!: ReactTestRenderer;
    await act(async () => {
      ecra = renderer.create(<MostraTraduzido chave="Guardar" />);
    });
    await act(async () => {});
    expect(textoDe(ecra.root.findAllByType(Text)[0])).toBe('Guardar');

    await act(async () => {
      await definirIdioma('en');
    });
    expect(textoDe(ecra.root.findAllByType(Text)[0])).toBe('Save');

    await act(async () => {
      ecra.unmount();
    });
  });

  it('useIdioma acompanha o idioma atual', async () => {
    function MostraIdioma() {
      return <Text>{useIdioma()}</Text>;
    }
    let ecra!: ReactTestRenderer;
    await act(async () => {
      ecra = renderer.create(<MostraIdioma />);
    });
    await act(async () => {});
    expect(textoDe(ecra.root.findAllByType(Text)[0])).toBe('pt');

    await act(async () => {
      await definirIdioma('en');
    });
    expect(textoDe(ecra.root.findAllByType(Text)[0])).toBe('en');

    await act(async () => {
      ecra.unmount();
    });
  });
});