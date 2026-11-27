// O primeiro render carrega o React Native todo: com a cache do jest vazia (ex.: no CI) passa dos 5 s
jest.setTimeout(20_000);

// A folha "Novo gasto" (botão rápido "+" e atalho do ícone): valor, categoria, Guardar.
// A API (database) e o Firebase são falsos.

jest.mock('../services/database', () => ({
  ...jest.requireActual('../services/calculos'),
  mesAtual: () => '2026-10',
  mesDaData: (data: string) => data.slice(0, 7),
  calcularSaldoDisponivel: jest.fn(async () => 300),
  ContaCorrenteDB: { getCartaoAlimentacao: jest.fn(async () => ({ saldo: 40 })) },
  DespesasExtrasDB: {
    add: jest.fn(async () => ({ pendente: false })),
    getDoMes: jest.fn(async () => []),
    sugerirCategoria: jest.fn(async () => ({ categoria: 'restauracao' })),
  },
  OrcamentosDB: { getEstado: jest.fn(async () => []) },
}));
jest.mock('../services/filaOffline', () => ({
  apagarPendente: jest.fn(async () => undefined),
  editarPendente: jest.fn(async () => undefined),
  sincronizar: jest.fn(async () => 0),
}));
jest.mock('../utils/helpers', () => ({ ...jest.requireActual('../utils/formatos'), mostrarAlerta: jest.fn() }));
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('../services/grupos', () => ({ GruposDB: { listar: jest.fn(async () => []) } }));
// A despesa partilhada tem o seu próprio ecrã e testes: aqui só interessa com que dados abre
jest.mock('../components/partilhado/DespesaPartilhadaModal', () => ({ DespesaPartilhadaModal: jest.fn(() => null) }));
jest.mock('../utils/confirmar', () => ({ confirmar: jest.fn(async () => true) }));
jest.mock('../contexts/AuthContext', () => {
  const sessao = { user: { id: 'u1' }, isAuthenticated: true, isLoading: false };
  return { useAuth: () => sessao };
});
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));

import { act, ReactElement } from 'react';
import { Text, TextInput } from 'react-native';
import { NovoGastoRapido } from '../components/NovoGastoRapido';
import { DespesaPartilhadaModal } from '../components/partilhado/DespesaPartilhadaModal';
import { DespesasExtrasDB, OrcamentosDB } from '../services/database';
import { GruposDB } from '../services/grupos';
import { ouvir } from '../services/eventos';
import { apagarPendente, editarPendente, sincronizar, type GastoPendente } from '../services/filaOffline';
import { hojeISO } from '../utils/formatos';
import { mostrarAlerta } from '../utils/helpers';

interface No {
  props: Record<string, any>;
  parent: No | null;
}
interface ReactTestRenderer {
  root: { findAllByType(tipo: unknown): No[] };
  unmount(): void;
}
const renderer: { create(elemento: ReactElement): ReactTestRenderer } = require('react-test-renderer');

const textoDe = (no: No) => [no.props.children].flat(Infinity).join('');

async function desenhar(elemento: ReactElement) {
  let ecra!: ReactTestRenderer;
  await act(async () => {
    ecra = renderer.create(elemento);
  });
  return ecra;
}

async function escrever(ecra: ReactTestRenderer, rotulo: string, texto: string) {
  const campo = ecra.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === rotulo);
  if (!campo) throw new Error(`Sem o campo "${rotulo}"`);
  await act(async () => {
    campo.props.onChangeText(texto);
  });
}

async function carregar(ecra: ReactTestRenderer, texto: string) {
  const alvo = ecra.root.findAllByType(Text).find((t) => textoDe(t) === texto);
  if (!alvo) throw new Error(`Sem o texto "${texto}"`);
  let no: No | null = alvo;
  while (no && !no.props.onPress) no = no.parent;
  await act(async () => {
    await no!.props.onPress();
  });
}

const add = DespesasExtrasDB.add as jest.Mock;
const getDoMes = DespesasExtrasDB.getDoMes as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NovoGastoRapido', () => {
  it('abre com o título focado (o valor vem a seguir) e as categorias, a conta e a data de hoje', async () => {
    const ecra = await desenhar(<NovoGastoRapido visivel onFechar={jest.fn()} />);
    const campos = ecra.root.findAllByType(TextInput);
    expect(campos.map((n) => n.props.accessibilityLabel).slice(0, 2)).toEqual(['Título', 'Valor em euros']);
    expect(campos[0].props.autoFocus).toBe(true);
    expect(campos[1].props.autoFocus).toBeFalsy();
    const textos = ecra.root.findAllByType(Text).map(textoDe);
    expect(textos).toEqual(expect.arrayContaining(['Novo gasto', 'Restauração', 'Hoje', 'Ontem', 'Guardar']));
    await act(async () => ecra.unmount());
  });

  it('"Dividir num grupo" abre logo a despesa partilhada preenchida, sem guardar o gasto aqui', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    (GruposDB.listar as jest.Mock).mockResolvedValueOnce([{ id: 'g1', nome: 'Casa' }]);
    const onFechar = jest.fn();
    const ecra = await desenhar(<NovoGastoRapido visivel onFechar={onFechar} />);

    await escrever(ecra, 'Valor em euros', '30');
    await escrever(ecra, 'Título', 'Jantar');
    await carregar(ecra, 'Dividir num grupo');
    // A folha fecha e a despesa partilhada abre logo a seguir (dois modais não se trocam no mesmo instante)
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    jest.useRealTimers();

    expect(add).not.toHaveBeenCalled();
    expect(onFechar).toHaveBeenCalled();
    const ultima = (DespesaPartilhadaModal as jest.Mock).mock.calls.at(-1)![0];
    expect(ultima.visivel).toBe(true);
    expect(ultima.inicial).toMatchObject({ titulo: 'Jantar', valor: 30, meioPagamento: 'conta' });
    await act(async () => ecra.unmount());
  });

  it('sem grupos, não oferece "Dividir num grupo"', async () => {
    const ecra = await desenhar(<NovoGastoRapido visivel onFechar={jest.fn()} />);
    expect(ecra.root.findAllByType(Text).map(textoDe)).not.toContain('Dividir num grupo');
    await act(async () => ecra.unmount());
  });

  it('valor + categoria + Guardar: grava com o nome da categoria como título e avisa os ecrãs', async () => {
    const onFechar = jest.fn();
    const onGuardado = jest.fn();
    const mudou = jest.fn();
    const deixar = ouvir('dadosMudaram', mudou);
    const ecra = await desenhar(<NovoGastoRapido visivel onFechar={onFechar} onGuardado={onGuardado} />);

    await escrever(ecra, 'Valor em euros', '12,5');
    await carregar(ecra, 'Restauração');
    await carregar(ecra, 'Guardar');
    deixar();

    expect(add).toHaveBeenCalledWith('u1', {
      titulo: 'Restauração',
      valor: 12.5,
      data: hojeISO(),
      categoria: 'restauracao',
      meioPagamento: 'conta',
    });
    expect(onFechar).toHaveBeenCalled();
    expect(onGuardado).toHaveBeenCalledWith({ titulo: 'Restauração', valor: 12.5, pendente: false });
    expect(mudou).toHaveBeenCalledTimes(1);
    await act(async () => ecra.unmount());
  });

  it('mostra o aviso do orçamento da categoria depois de gravar', async () => {
    (OrcamentosDB.getEstado as jest.Mock).mockResolvedValueOnce([
      { categoria: 'restauracao', estado: 'ultrapassado', percentagem: 110, gasto: 110, limite: 100, restante: -10 },
    ]);
    const ecra = await desenhar(<NovoGastoRapido visivel onFechar={jest.fn()} />);
    await escrever(ecra, 'Valor em euros', '10');
    await carregar(ecra, 'Restauração');
    await carregar(ecra, 'Guardar');
    expect(mostrarAlerta).toHaveBeenCalledWith('Orçamento ultrapassado', expect.stringContaining('Restauração'));
    await act(async () => ecra.unmount());
  });

  it('sem internet: fica na fila, sem aviso de orçamento nem recarregar', async () => {
    add.mockResolvedValueOnce({ pendente: true, gasto: {} });
    const onGuardado = jest.fn();
    const ecra = await desenhar(<NovoGastoRapido visivel onFechar={jest.fn()} onGuardado={onGuardado} />);
    await escrever(ecra, 'Valor em euros', '3');
    await escrever(ecra, 'Título', 'Café');
    await carregar(ecra, 'Guardar');
    expect(onGuardado).toHaveBeenCalledWith({ titulo: 'Café', valor: 3, pendente: true });
    expect(OrcamentosDB.getEstado).not.toHaveBeenCalled();
    await act(async () => ecra.unmount());
  });

  it('sem valor não grava', async () => {
    const ecra = await desenhar(<NovoGastoRapido visivel onFechar={jest.fn()} />);
    await carregar(ecra, 'Guardar');
    expect(add).not.toHaveBeenCalled();
    expect(mostrarAlerta).toHaveBeenCalledWith('Erro', 'Escreve o valor do gasto');
    await act(async () => ecra.unmount());
  });

  it('um gasto por enviar recusado: mostra o erro, corrige-se (e volta a ser enviado) ou apaga-se', async () => {
    const pendente: GastoPendente = {
      id: 'p1',
      userId: 'u1',
      criadoEm: '2026-10-03T10:00:00.000Z',
      gasto: { titulo: 'Jantar', valor: 30, data: '2026-10-02', categoria: 'restauracao', meioPagamento: 'cartaoAlimentacao' },
      erro: 'O cartão de alimentação só tem 2,00 €.',
    };
    const ecra = await desenhar(<NovoGastoRapido visivel pendente={pendente} onFechar={jest.fn()} />);
    expect(ecra.root.findAllByType(Text).map(textoDe)).toEqual(
      expect.arrayContaining(['Gasto por enviar', 'A API recusou este gasto: O cartão de alimentação só tem 2,00 €.'])
    );

    await carregar(ecra, 'Conta · 300.00 €');
    await carregar(ecra, 'Guardar');
    expect(editarPendente).toHaveBeenCalledWith('p1', {
      titulo: 'Jantar',
      valor: 30,
      data: '2026-10-02',
      categoria: 'restauracao',
      meioPagamento: 'conta',
    });
    expect(sincronizar).toHaveBeenCalledWith('u1');
    expect(add).not.toHaveBeenCalled();

    await carregar(ecra, 'Apagar');
    expect(apagarPendente).toHaveBeenCalledWith('p1');
    await act(async () => ecra.unmount());
  });

  it('os gastos do mês aparecem como chips e repetem-se com dois toques (chip + Guardar)', async () => {
    getDoMes.mockResolvedValueOnce([
      { id: 'd1', titulo: 'Café', valor: 1.5, categoria: 'restauracao', meioPagamento: 'cartaoAlimentacao', data: '2026-10-05' },
      { id: 'd2', titulo: 'Continente', valor: 23.45, categoria: 'supermercado', data: '2026-10-04' },
    ]);
    const onFechar = jest.fn();
    const ecra = await desenhar(<NovoGastoRapido visivel onFechar={onFechar} />);

    expect(getDoMes).toHaveBeenCalledWith('u1', '2026-10');
    await carregar(ecra, 'Café · 1,50 €');
    const campo = (rotulo: string) => ecra.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === rotulo);
    expect(campo('Valor em euros')?.props.value).toBe('1,50');
    expect(campo('Título')?.props.value).toBe('Café');

    await carregar(ecra, 'Guardar');
    expect(add).toHaveBeenCalledWith('u1', {
      titulo: 'Café',
      valor: 1.5,
      data: hojeISO(),
      categoria: 'restauracao',
      meioPagamento: 'cartaoAlimentacao',
    });
    expect(onFechar).toHaveBeenCalled();
    await act(async () => ecra.unmount());
  });

  it('sem gastos do mês (ou a corrigir um pendente) não há chips nem pedido de lista', async () => {
    const semChips = await desenhar(<NovoGastoRapido visivel onFechar={jest.fn()} />);
    expect(getDoMes).toHaveBeenCalledWith('u1', '2026-10');
    expect(semChips.root.findAllByType(Text).map(textoDe)).not.toEqual(expect.arrayContaining(['Repetir']));
    await act(async () => semChips.unmount());

    const pendente: GastoPendente = {
      id: 'p1',
      userId: 'u1',
      criadoEm: '2026-10-03T10:00:00.000Z',
      gasto: { titulo: 'Jantar', valor: 30, data: '2026-10-02', categoria: 'restauracao' },
    };
    getDoMes.mockClear();
    const ecra = await desenhar(<NovoGastoRapido visivel pendente={pendente} onFechar={jest.fn()} />);
    expect(getDoMes).not.toHaveBeenCalled();
    expect(ecra.root.findAllByType(Text).map(textoDe)).not.toEqual(expect.arrayContaining(['Repetir']));
    await act(async () => ecra.unmount());
  });
});
