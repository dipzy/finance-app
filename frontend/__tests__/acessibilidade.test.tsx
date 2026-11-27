// Tamanho de letra dinâmico com teto, e ícones decorativos para o leitor de ecrã.
import { forwardRef, ReactElement } from 'react';
import { act } from 'react';
import { Text } from 'react-native';
import { Icone } from '../components/ui/Icone';
import { ESCALA_MAXIMA_TEXTO, limitarEscala, limitarEscalaDeLetra } from '../utils/acessibilidade';

jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text: T } = require('react-native');
  return { __esModule: true, default: (p: Record<string, unknown>) => <T {...p}>icone</T> };
});

interface No {
  props: Record<string, any>;
}
const renderer: { create(elemento: ReactElement): { toJSON(): No } } = require('react-test-renderer');

async function desenhar(elemento: ReactElement): Promise<No> {
  let r!: { toJSON(): No };
  await act(async () => {
    r = renderer.create(elemento);
  });
  return r.toJSON();
}

describe('tamanho de letra', () => {
  it('um componente "forwardRef" (como o Text do React Native) ganha o teto, que cada ecrã pode substituir', async () => {
    // O mesmo formato do Text/TextInput reais: forwardRef com .render
    const Falso = forwardRef<unknown, Record<string, unknown>>((props, _ref) => <Text {...props}>x</Text>);
    expect(limitarEscala(Falso, ESCALA_MAXIMA_TEXTO)).toBe(true);
    expect(limitarEscala(Falso, 2)).toBe(false); // só embrulha uma vez

    expect((await desenhar(<Falso />)).props.maxFontSizeMultiplier).toBe(ESCALA_MAXIMA_TEXTO);
    expect((await desenhar(<Falso maxFontSizeMultiplier={1} />)).props.maxFontSizeMultiplier).toBe(1);
  });

  it('nos testes o Text do React Native é falso: nada acontece e nada parte', () => {
    expect(() => limitarEscalaDeLetra()).not.toThrow();
  });
});

describe('leitor de ecrã', () => {
  it('os ícones são decorativos (escondidos)', async () => {
    const icone = await desenhar(<Icone nome="flash-outline" />);
    expect(icone.props.accessibilityElementsHidden).toBe(true);
    expect(icone.props.importantForAccessibility).toBe('no');
  });
});
