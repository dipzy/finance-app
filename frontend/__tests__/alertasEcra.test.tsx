// O ecrã Alertas, o cartão do Início e o emblema do menu, com a API dos alertas substituída
jest.setTimeout(20_000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);
jest.mock('../services/alertas', () => ({
  useAlertas: jest.fn(),
  atualizarAlertas: jest.fn(async () => undefined),
  atualizarAlertasSeNecessario: jest.fn(async () => undefined),
  limparAlertas: jest.fn(),
  marcarAlertasVistos: jest.fn(),
}));
jest.mock('../services/tema', () => ({ mudarTema: jest.fn() }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'ana@exemplo.pt', name: 'Ana Silva' }, logout: jest.fn() }),
}));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useFocusEffect: (efeito: () => void) => useEffect(efeito, [efeito]),
    usePathname: () => '/alertas',
  };
});
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));

import { router } from 'expo-router';
import { act, ReactElement } from 'react';
import { Text } from 'react-native';
import AlertasScreen from '../app/(tabs)/alertas';
import { CartaoAlertas } from '../components/CartaoAlertas';
import { Header } from '../components/Header';
import { SideMenu } from '../components/SideMenu';
import { atualizarAlertas, atualizarAlertasSeNecessario, marcarAlertasVistos, useAlertas } from '../services/alertas';
import { type Alerta, chaveAlerta } from '../utils/alertas';

interface No {
  props: Record<string, any>;
  parent: No | null;
}
interface Ecra {
  root: { findAllByType(tipo: unknown): No[]; findAll(f: (n: No) => boolean): No[] };
  unmount(): void;
}
const renderer: { create(elemento: ReactElement): Ecra } = require('react-test-renderer');
const mockAlertas = useAlertas as jest.Mock;

const textoDe = (no: No) => [no.props.children].flat(Infinity).join('');
const textos = (e: Ecra) => e.root.findAllByType(Text).map(textoDe);
async function desenhar(el: ReactElement) {
  let e!: Ecra;
  await act(async () => {
    e = renderer.create(el);
  });
  return e;
}
const fechar = (e: Ecra) => act(async () => e.unmount());
async function carregar(e: Ecra, texto: string) {
  const alvo = e.root.findAllByType(Text).filter((t) => textoDe(t) === texto).pop();
  if (!alvo) throw new Error(`Sem o texto "${texto}"`);
  let no: No | null = alvo;
  while (no && !no.props.onPress) no = no.parent;
  await act(async () => {
    await no!.props.onPress();
  });
}

const alerta = (extra: Partial<Alerta> = {}): Alerta => ({
  tipo: 'despesa-vencida',
  severidade: 'critico',
  titulo: 'Renda em atraso',
  mensagem: 'Devia ter saído a 5/10 (550,00 €)',
  referencia: 'd1',
  data: '2026-10-05',
  ...extra,
});
const estado = (alertas: Alerta[] | null, extra = {}) => ({ alertas, erro: false, aCarregar: alertas === null, recarregar: jest.fn(), ...extra });

beforeEach(() => jest.clearAllMocks());

describe('Ecrã Alertas', () => {
  it('lista os alertas pela ordem recebida (já por gravidade) e tocar abre o ecrã certo', async () => {
    mockAlertas.mockReturnValue(
      estado([
        alerta(),
        alerta({ tipo: 'orcamento-aviso', severidade: 'aviso', titulo: 'Lazer a 85%', mensagem: '85,00 € de 100,00 €', referencia: 'o1' }),
        alerta({ tipo: 'objetivo-atrasado', severidade: 'info', titulo: 'Férias atrasadas', mensagem: 'Faltam 200 €', referencia: 'g1' }),
      ])
    );
    const e = await desenhar(<AlertasScreen />);
    const t = textos(e);
    expect(t.indexOf('Renda em atraso')).toBeLessThan(t.indexOf('Lazer a 85%'));
    expect(t.indexOf('Lazer a 85%')).toBeLessThan(t.indexOf('Férias atrasadas'));
    expect(atualizarAlertasSeNecessario).toHaveBeenCalled();

    await carregar(e, 'Renda em atraso');
    expect(router.push).toHaveBeenLastCalledWith('/(tabs)/despesas-fixas');
    await carregar(e, 'Lazer a 85%');
    expect(router.push).toHaveBeenLastCalledWith('/(tabs)/orcamentos');
    await carregar(e, 'Férias atrasadas');
    expect(router.push).toHaveBeenLastCalledWith('/(tabs)/objetivos');
    await fechar(e);
  });

  it('cada alerta é um botão com a gravidade no nome (não só a cor)', async () => {
    mockAlertas.mockReturnValue(estado([alerta()]));
    const e = await desenhar(<AlertasScreen />);
    const botao = e.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Crítico:'))[0];
    expect(botao.props.accessibilityLabel).toBe('Crítico: Renda em atraso. Devia ter saído a 5/10 (550,00 €)');
    expect(botao.props.accessibilityRole).toBe('button');
    await fechar(e);
  });

  it('sem alertas diz que está tudo em ordem; com erro deixa tentar outra vez', async () => {
    mockAlertas.mockReturnValue(estado([]));
    let e = await desenhar(<AlertasScreen />);
    expect(textos(e)).toContain('Sem alertas por agora. Está tudo em ordem.');
    await fechar(e);

    const recarregar = jest.fn();
    mockAlertas.mockReturnValue(estado(null, { erro: true, aCarregar: false, recarregar }));
    e = await desenhar(<AlertasScreen />);
    expect(textos(e)).toContain('Não foi possível atualizar os alertas.');
    await carregar(e, 'Tentar outra vez');
    expect(recarregar).toHaveBeenCalled();
    await fechar(e);
  });
});

describe('Cartão de alertas no Início', () => {
  it('sem alertas não aparece nada', async () => {
    mockAlertas.mockReturnValue(estado([]));
    const e = await desenhar(<CartaoAlertas />);
    expect(textos(e)).toEqual([]);
    await fechar(e);
  });

  it('mostra os 3 mais graves e "Ver todos" leva ao ecrã Alertas', async () => {
    mockAlertas.mockReturnValue(
      estado([1, 2, 3, 4].map((n) => alerta({ titulo: `Alerta ${n}`, referencia: `r${n}` })))
    );
    const e = await desenhar(<CartaoAlertas />);
    const t = textos(e);
    expect(t).toEqual(expect.arrayContaining(['Alertas', 'Alerta 1', 'Alerta 2', 'Alerta 3']));
    expect(t).not.toContain('Alerta 4');
    await carregar(e, 'Ver todos (4)');
    expect(router.push).toHaveBeenCalledWith('/(tabs)/alertas');
    await fechar(e);
  });

  it('com o painel a mostrar já os orçamentos, não os repete', async () => {
    mockAlertas.mockReturnValue(
      estado([alerta({ tipo: 'orcamento-excedido', titulo: 'Lazer ultrapassado' }), alerta({ titulo: 'Renda em atraso' })])
    );
    const e = await desenhar(<CartaoAlertas semOrcamentos />);
    expect(textos(e)).toContain('Renda em atraso');
    expect(textos(e)).not.toContain('Lazer ultrapassado');
    await fechar(e);
  });
});

describe('Menu lateral e cabeçalho', () => {
  it('abrir o ecrã Alertas marca-os como vistos; o sino não conta os já vistos', async () => {
    const lista = [alerta(), alerta({ severidade: 'aviso', referencia: 'x' })];
    mockAlertas.mockReturnValue(estado(lista));
    const e = await desenhar(<AlertasScreen />);
    expect(marcarAlertasVistos).toHaveBeenCalledWith(lista);
    await fechar(e);

    mockAlertas.mockReturnValue(estado(lista, { vistos: new Set(lista.map(chaveAlerta)) }));
    const h = await desenhar(<Header title="Início" />);
    expect(h.root.findAll((n) => /alertas por ver/.test(n.props.accessibilityLabel ?? ''))).toHaveLength(0);
    await fechar(h);
  });

  it('o menu já não tem a entrada Alertas', async () => {
    mockAlertas.mockReturnValue(estado([alerta()]));
    const e = await desenhar(<SideMenu visible onClose={() => undefined} />);
    expect(textos(e)).not.toContain('Alertas');
    await fechar(e);
  });

  it('o sino do cabeçalho mostra o número dos que pedem atenção (os de informação não contam)', async () => {
    mockAlertas.mockReturnValue(estado([alerta(), alerta({ severidade: 'aviso' }), alerta({ severidade: 'info' })]));
    const e = await desenhar(<Header title="Início" />);
    const emblema = e.root.findAll((n) => n.props.accessibilityLabel === '2 alertas por ver')[0];
    expect(emblema).toBeDefined();
    expect(useAlertas).toHaveBeenCalledWith(false); // só ouve: não pede à API

    const sino = e.root.findAll((n) => n.props.accessibilityLabel === 'Alertas' && !!n.props.onPress)[0];
    await act(async () => sino.props.onPress());
    expect(router.push).toHaveBeenCalledWith('/(tabs)/alertas');
    await fechar(e);
    expect(atualizarAlertas).not.toHaveBeenCalled();
  });
});
