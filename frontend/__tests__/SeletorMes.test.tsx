import type { ReactElement } from 'react';
import { SeletorMes } from '../components/SeletorMes';

// Os ícones (setas) carregam a fonte depois de aparecerem (avisos de act fora do teste); aqui não interessam
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));

// O react-test-renderer não traz tipos (e não há @types instalado): só o pouco que se usa aqui
interface No {
  props: Record<string, any>;
}
interface ReactTestRenderer {
  root: { find(teste: (n: No) => boolean): No; findAll(teste: (n: No) => boolean): No[] };
}
const { act, create } = require('react-test-renderer') as {
  act: (acao: () => void) => void;
  create: (elemento: ReactElement) => ReactTestRenderer;
};

// Encontra um botão pelo texto que o leitor de ecrã anuncia
function botao(arvore: ReactTestRenderer, inicioDoNome: string) {
  return arvore.root.find(
    (n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(inicioDoNome) && !!n.props.onPress
  );
}

function desenhar(props: Parameters<typeof SeletorMes>[0]) {
  let arvore!: ReactTestRenderer;
  act(() => {
    arvore = create(<SeletorMes {...props} />);
  });
  return arvore;
}

const textos = (arvore: ReactTestRenderer) =>
  arvore.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children as string);

describe('SeletorMes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 5, 12));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('no mês atual não deixa ir para o futuro', () => {
    const onChange = jest.fn();
    const arvore = desenhar({ mes: '2026-10', onChange });

    expect(textos(arvore)).toContain('Outubro 2026');
    expect(botao(arvore, 'Mês seguinte').props.disabled).toBe(true);
    expect(arvore.root.findAll((n) => n.props.accessibilityLabel === 'Ir para Outubro 2026')).toHaveLength(0);

    act(() => botao(arvore, 'Mês anterior').props.onPress());
    expect(onChange).toHaveBeenCalledWith('2026-09');
  });

  it('num mês passado avança um mês ou volta logo ao mês atual', () => {
    const onChange = jest.fn();
    const arvore = desenhar({ mes: '2025-12', onChange });

    expect(botao(arvore, 'Mês seguinte').props.disabled).toBe(false);
    act(() => botao(arvore, 'Mês seguinte').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith('2026-01');

    act(() => botao(arvore, 'Ir para Outubro 2026').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith('2026-10');
  });

  it('respeita um máximo diferente do mês atual', () => {
    const arvore = desenhar({ mes: '2026-08', maximo: '2026-08', onChange: jest.fn() });
    expect(botao(arvore, 'Mês seguinte').props.disabled).toBe(true);
  });
});
