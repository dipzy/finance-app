// O ecrã "Regras de categorização" e a sugestão "Regra: <texto>" no formulário de gastos, com a API
// (services/regras) substituída
jest.setTimeout(20_000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('../services/regras', () => ({
  ...jest.requireActual('../services/regras'),
  RegrasDB: { listar: jest.fn(), criar: jest.fn(), alterar: jest.fn(), remover: jest.fn(), padrao: jest.fn(), sugerir: jest.fn() },
}));
jest.mock('../utils/confirmar', () => ({ confirmar: jest.fn(async () => true) }));
jest.mock('../utils/helpers', () => ({ mostrarAlerta: jest.fn() }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'ana@exemplo.pt', name: 'Ana' }, logout: jest.fn() }),
}));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useFocusEffect: (efeito: () => void) => useEffect(efeito, [efeito]),
    usePathname: () => '/regras-categoria',
  };
});
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));

import { act, ReactElement } from 'react';
import { Switch, Text, TextInput } from 'react-native';
import RegrasCategoriaScreen from '../app/(tabs)/regras-categoria';
import { useSugestaoCategoria } from '../components/useSugestaoCategoria';
import { RegrasDB } from '../services/regras';
import { confirmar } from '../utils/confirmar';
import { mostrarAlerta } from '../utils/helpers';

interface No {
  props: Record<string, any>;
  parent: No | null;
}
interface Ecra {
  root: { findAllByType(tipo: unknown): No[]; findAll(f: (n: No) => boolean): No[] };
  unmount(): void;
}
const renderer: { create(elemento: ReactElement): Ecra } = require('react-test-renderer');
const R = RegrasDB as jest.Mocked<typeof RegrasDB>;

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
const porRotulo = (e: Ecra, rotulo: string) => {
  const no = e.root.findAll((n) => n.props.accessibilityLabel === rotulo && !!(n.props.onPress || n.props.onValueChange))[0];
  if (!no) throw new Error(`Sem "${rotulo}"`);
  return no;
};
const escrever = (e: Ecra, rotulo: string, valor: string) =>
  act(async () => {
    e.root.findAllByType(TextInput).find((c) => c.props.accessibilityLabel === rotulo)!.props.onChangeText(valor);
  });

const regra = (extra = {}) => ({ id: 'r1', texto: 'Continente', categoria: 'supermercado', ativa: true, prioridade: 0, ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  R.listar.mockResolvedValue([regra(), regra({ id: 'r2', texto: 'Netflix', categoria: 'lazer', ativa: false, prioridade: 3 })] as any);
  R.padrao.mockResolvedValue([
    { texto: 'Continente', categoria: 'supermercado' },
    { texto: 'Lidl', categoria: 'supermercado' },
  ] as any);
  R.criar.mockResolvedValue({ id: 'nova' });
  R.alterar.mockResolvedValue(undefined);
  R.remover.mockResolvedValue(undefined);
});

describe('Regras de categorização', () => {
  it('lista as regras do utilizador (ativas primeiro) com a categoria e a prioridade', async () => {
    const e = await desenhar(<RegrasCategoriaScreen />);
    const t = textos(e);
    expect(t).toEqual(expect.arrayContaining(['Regras de categorização', 'As minhas regras', 'Continente', 'Netflix', '· prioridade 3']));
    expect(t.indexOf('Continente')).toBeLessThan(t.indexOf('Netflix'));
    expect(e.root.findAllByType(Switch).map((s) => s.props.value)).toEqual([true, false]);
    await fechar(e);
  });

  it('cria uma regra: texto, categoria e prioridade vão para a API', async () => {
    const e = await desenhar(<RegrasCategoriaScreen />);
    await carregar(e, 'Nova regra');
    await escrever(e, 'Se o título contiver', 'Pingo Doce');
    await escrever(e, 'Prioridade (opcional)', '5');
    await act(async () => porRotulo(e, 'Categoria Supermercado').props.onPress());
    await carregar(e, 'Guardar');

    expect(R.criar).toHaveBeenCalledWith({ texto: 'Pingo Doce', categoria: 'supermercado', ativa: true, prioridade: 5 });
    expect(R.listar).toHaveBeenCalledTimes(2); // volta a carregar
    await fechar(e);
  });

  it('valida: texto em falta, categoria em falta, prioridade inválida e texto repetido', async () => {
    const e = await desenhar(<RegrasCategoriaScreen />);
    await carregar(e, 'Nova regra');
    await carregar(e, 'Guardar');
    expect(mostrarAlerta).toHaveBeenLastCalledWith('Erro', 'Escreve o texto a procurar (ex.: Continente).');

    await escrever(e, 'Se o título contiver', 'continente'); // repetido (sem maiúsculas)
    await carregar(e, 'Guardar');
    expect(mostrarAlerta).toHaveBeenLastCalledWith('Erro', 'Escolhe a categoria da regra.');

    await act(async () => porRotulo(e, 'Categoria Lazer').props.onPress());
    await escrever(e, 'Prioridade (opcional)', 'muito');
    await carregar(e, 'Guardar');
    expect(mostrarAlerta).toHaveBeenLastCalledWith('Erro', 'A prioridade é um número inteiro entre -1000 e 1000.');

    await escrever(e, 'Prioridade (opcional)', '');
    await carregar(e, 'Guardar');
    expect(mostrarAlerta).toHaveBeenLastCalledWith('Erro', 'Já tens uma regra com este texto.');
    expect(R.criar).not.toHaveBeenCalled();
    await fechar(e);
  });

  it('edita (PUT) uma regra existente', async () => {
    const e = await desenhar(<RegrasCategoriaScreen />);
    await act(async () => porRotulo(e, 'Editar a regra Continente').props.onPress());
    expect(textos(e)).toContain('Editar regra');
    await escrever(e, 'Se o título contiver', 'Continente Modelo');
    await carregar(e, 'Guardar');
    expect(R.alterar).toHaveBeenCalledWith('r1', { texto: 'Continente Modelo', categoria: 'supermercado', ativa: true, prioridade: 0 });
    await fechar(e);
  });

  it('ativa e desativa com o interruptor', async () => {
    const e = await desenhar(<RegrasCategoriaScreen />);
    await act(async () => {
      await porRotulo(e, 'Regra Netflix ativa').props.onValueChange(true);
    });
    expect(R.alterar).toHaveBeenCalledWith('r2', { texto: 'Netflix', categoria: 'lazer', ativa: true, prioridade: 3 });
    await fechar(e);
  });

  it('apaga depois de confirmar', async () => {
    const e = await desenhar(<RegrasCategoriaScreen />);
    await act(async () => porRotulo(e, 'Apagar a regra Netflix').props.onPress());
    expect(confirmar).toHaveBeenCalledWith('Apagar regra', expect.stringContaining('Netflix'), 'Apagar');
    expect(R.remover).toHaveBeenCalledWith('r2');

    (confirmar as jest.Mock).mockResolvedValueOnce(false);
    await act(async () => porRotulo(e, 'Apagar a regra Continente').props.onPress());
    expect(R.remover).toHaveBeenCalledTimes(1);
    await fechar(e);
  });

  it('mostra as regras padrão só de leitura e copia uma para as minhas; as que já tenho dizem "Já tens"', async () => {
    const e = await desenhar(<RegrasCategoriaScreen />);
    expect(textos(e)).not.toContain('Lidl');
    await carregar(e, 'Regras padrão (2)');
    expect(textos(e)).toContain('Lidl');
    expect(textos(e)).toContain('Já tens'); // Continente

    await act(async () => porRotulo(e, 'Copiar a regra Lidl para as minhas').props.onPress());
    expect(R.criar).toHaveBeenCalledWith({ texto: 'Lidl', categoria: 'supermercado', ativa: true, prioridade: 0 });
    await fechar(e);
  });

  it('experimentar: mostra a categoria e a regra que decidiu', async () => {
    R.sugerir.mockResolvedValue({ categoria: 'supermercado', origem: 'regra', regra: 'Continente' });
    const e = await desenhar(<RegrasCategoriaScreen />);
    await escrever(e, 'Título de um gasto', 'Continente Matosinhos');
    await carregar(e, 'Ver categoria');
    expect(R.sugerir).toHaveBeenCalledWith('Continente Matosinhos');
    expect(textos(e).join(' ')).toContain('Categoria: Supermercado · Regra: Continente');
    await fechar(e);
  });

  it('se as regras não carregarem mostra o erro e deixa tentar outra vez', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    R.listar.mockRejectedValueOnce(new Error('sem rede'));
    const e = await desenhar(<RegrasCategoriaScreen />);
    expect(textos(e)).toContain('Não foi possível carregar as regras.');
    await carregar(e, 'Tentar outra vez');
    expect(textos(e)).toContain('Netflix');
    await fechar(e);
  });
});

describe('useSugestaoCategoria com a origem', () => {
  function Teste({ titulo, sugerir }: { titulo: string; sugerir: any }) {
    const s = useSugestaoCategoria(titulo, sugerir, true, 0);
    return <Text>{s ? `${s.categoria}|${s.origemTexto ?? ''}` : 'nada'}</Text>;
  }

  it('quando vem de uma regra: "Regra: <texto>"; do histórico: sem texto de regra', async () => {
    jest.useFakeTimers();
    const sugerir = jest
      .fn()
      .mockResolvedValueOnce({ categoria: 'supermercado', origem: 'regra', regra: { texto: 'Continente' } })
      .mockResolvedValueOnce({ categoria: 'lazer', origem: 'historico' })
      .mockResolvedValueOnce('transportes');
    let e!: Ecra;
    const mostrar = async (titulo: string) => {
      await act(async () => {
        e?.unmount();
        e = renderer.create(<Teste titulo={titulo} sugerir={sugerir} />);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(5);
      });
    };
    await mostrar('Continente');
    expect(textos(e)).toEqual(['supermercado|Regra: Continente']);
    await mostrar('Netflix');
    expect(textos(e)).toEqual(['lazer|']);
    await mostrar('Uber');
    expect(textos(e)).toEqual(['transportes|']); // continua a aceitar só a categoria
    await fechar(e);
    jest.useRealTimers();
  });
});
