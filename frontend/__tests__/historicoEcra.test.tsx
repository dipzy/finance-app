// O ecrã Histórico de alterações com os registos dos grupos: filtros por tipo e quem fez cada coisa
jest.setTimeout(20_000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('../services/alteracoes', () => ({
  ...jest.requireActual('../services/alteracoes'),
  AlteracoesDB: { listar: jest.fn(), listarFiltrado: jest.fn() },
  carregarContextoNomes: jest.fn(),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'eu', email: 'eu@exemplo.pt', name: 'Eu' }, logout: jest.fn() }),
}));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useFocusEffect: (efeito: () => void) => useEffect(efeito, [efeito]),
    usePathname: () => '/historico',
  };
});
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));

import { act, ReactElement } from 'react';
import { Text } from 'react-native';
import HistoricoScreen from '../app/(tabs)/historico';
import { AlteracoesDB, carregarContextoNomes, FILTROS_ALTERACOES, RegistoAlteracao } from '../services/alteracoes';

interface No {
  props: Record<string, any>;
  parent: No | null;
}
interface Ecra {
  root: { findAllByType(tipo: unknown): No[]; findAll(f: (n: No) => boolean): No[] };
  unmount(): void;
}
const renderer: { create(elemento: ReactElement): Ecra } = require('react-test-renderer');
const A = AlteracoesDB as jest.Mocked<typeof AlteracoesDB>;

const textoDe = (no: No) => [no.props.children].flat(Infinity).join('');
const textos = (e: Ecra) => e.root.findAllByType(Text).map(textoDe);
async function desenhar(el: ReactElement) {
  let e!: Ecra;
  await act(async () => {
    e = renderer.create(el);
  });
  return e;
}
async function carregar(e: Ecra, texto: string) {
  const alvo = e.root.findAllByType(Text).filter((t) => textoDe(t).startsWith(texto)).pop();
  if (!alvo) throw new Error(`Sem o texto "${texto}"`);
  let no: No | null = alvo;
  while (no && !no.props.onPress) no = no.parent;
  await act(async () => {
    await no!.props.onPress();
  });
}

const registo = (extra: Partial<RegistoAlteracao>): RegistoAlteracao => ({
  id: 'a',
  entidade: 'DespesaExtra',
  entidadeId: 'x',
  acao: 'criada',
  quando: '2026-10-05T10:00:00Z',
  origem: 'POST /api/x',
  ...extra,
});
const pagina = (itens: RegistoAlteracao[], total = itens.length) => ({ total, pagina: 1, tamanho: 30, itens });

beforeEach(() => {
  jest.clearAllMocks();
  (carregarContextoNomes as jest.Mock).mockResolvedValue({
    meuId: 'eu',
    utilizadores: new Map([['ana', { nome: 'Ana Silva', email: 'ana@exemplo.pt' }]]),
    grupos: new Map([['g1', 'Casa']]),
  });
});

describe('Histórico de alterações', () => {
  it('tem um filtro por tipo, incluindo os dos grupos, e pede a lista do filtro escolhido', async () => {
    A.listarFiltrado.mockResolvedValue(pagina([registo({ descricao: 'Café' })]));
    const e = await desenhar(<HistoricoScreen />);
    expect(textos(e)).toEqual(
      expect.arrayContaining(['Tudo', 'Gastos', 'Compromissos', 'Planeamento', 'Grupos', 'Despesas partilhadas', 'Poupança partilhada'])
    );
    expect(textos(e).join('|')).toContain('Criaste o gasto Café');
    expect(A.listarFiltrado).toHaveBeenLastCalledWith(FILTROS_ALTERACOES[0], 1);

    A.listarFiltrado.mockResolvedValue(pagina([registo({ id: 'g', entidade: 'Grupo', descricao: 'Casa' })]));
    await carregar(e, 'Grupos');
    expect(A.listarFiltrado).toHaveBeenLastCalledWith(expect.objectContaining({ chave: 'grupos' }), 1);
    expect(textos(e).join('|')).toContain('Criaste o grupo Casa');
    expect(textos(e).join('|')).not.toContain('Criaste o gasto Café');
    await act(async () => e.unmount());
  });

  it('nos registos dos grupos mostra o nome e o email de quem é (e "Utilizador removido" para ids anónimos)', async () => {
    A.listarFiltrado.mockResolvedValue(
      pagina([
        registo({ id: 'd', entidade: 'DespesaPartilhada', descricao: 'Jantar', alteracoes: { PagadorUid: { para: 'ana' }, Valor: { para: 60 } } }),
        registo({ id: 'c', entidade: 'AcertoPartilhado', descricao: 'ana -> removido-77', alteracoes: { ParaUid: { para: 'removido-77' } } }),
      ])
    );
    const e = await desenhar(<HistoricoScreen />);
    expect(carregarContextoNomes).toHaveBeenCalledWith('eu');
    expect(textos(e).join('|')).toContain('Criaste o acerto Ana Silva (ana@exemplo.pt) → Utilizador removido');

    await carregar(e, 'Criaste a despesa partilhada Jantar');
    expect(textos(e)).toEqual(expect.arrayContaining(['Pago por: Ana Silva (ana@exemplo.pt)', 'Valor: 60,00']));
    await carregar(e, 'Criaste o acerto');
    expect(textos(e)).toContain('Para: Utilizador removido');
    await act(async () => e.unmount());
  });

  it('só vai buscar os nomes dos membros quando há registos de grupos', async () => {
    A.listarFiltrado.mockResolvedValue(pagina([registo({ descricao: 'Café', alteracoes: { Valor: { para: 2 } } })]));
    const e = await desenhar(<HistoricoScreen />);
    expect(carregarContextoNomes).not.toHaveBeenCalled();
    await act(async () => e.unmount());
  });

  it('sem registos do tipo escolhido diz-se', async () => {
    A.listarFiltrado.mockResolvedValue(pagina([]));
    const e = await desenhar(<HistoricoScreen />);
    expect(textos(e)).toContain('Ainda não há alterações.');
    await carregar(e, 'Grupos');
    expect(textos(e)).toContain('Ainda não há alterações deste tipo.');
    await act(async () => e.unmount());
  });
});
