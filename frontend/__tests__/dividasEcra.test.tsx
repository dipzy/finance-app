// Sem rede: a API é falsa (test-utils/apiFalsa.ts) e só se verifica o que o ecrã lhe envia e mostra
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);
jest.mock('../services/notificacoes', () => ({ reagendarNotificacoes: jest.fn(async () => null) }));
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));
jest.mock('../contexts/AuthContext', () => {
  const sessao = { user: { id: 'ecra-dividas', email: 'teste@exemplo.pt', name: 'Teste' }, logout: jest.fn() };
  return { useAuth: () => sessao };
});
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    useFocusEffect: (efeito: () => void) => useEffect(efeito, [efeito]),
    usePathname: () => '/dividas',
  };
});
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
jest.mock('../utils/lerFicheiro', () => ({ lerFicheiro: jest.fn() }));

import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, ReactElement } from 'react';
import { Text } from 'react-native';
import DividasScreen from '../app/(tabs)/dividas';
import { ApiFalsa, instalarApiFalsa, type PedidoFalso } from '../test-utils/apiFalsa';
import { lerFicheiro } from '../utils/lerFicheiro';

interface No {
  props: Record<string, any>;
  parent: No | null;
}
interface ReactTestRenderer {
  root: { findAllByType(tipo: unknown): No[]; findAll(teste: (n: No) => boolean): No[] };
}
const renderer: { create(elemento: ReactElement): ReactTestRenderer } = require('react-test-renderer');

const textoDe = (no: No) => [no.props.children].flat(Infinity).join('');
const textos = (ecra: ReactTestRenderer) => ecra.root.findAllByType(Text).map(textoDe);

// Carrega no botão (ou chip) que tem este texto; com "indice" escolhe a n-ésima ocorrência
async function carregar(ecra: ReactTestRenderer, texto: string, indice = 0) {
  const alvos = ecra.root.findAllByType(Text).filter((t) => textoDe(t) === texto);
  const alvo = alvos[indice];
  if (!alvo) throw new Error(`Sem o texto "${texto}" no ecrã (há ${alvos.length})`);
  let no: No | null = alvo;
  while (no && !no.props.onPress) no = no.parent;
  if (!no) throw new Error(`"${texto}" não é carregável`);
  await act(async () => {
    await no!.props.onPress();
  });
}

// Escreve num campo, encontrado pelo texto de ajuda
async function escrever(ecra: ReactTestRenderer, placeholder: string, valor: string) {
  const campo = ecra.root.findAll((n) => n.props.placeholder === placeholder && typeof n.props.onChangeText === 'function')[0];
  if (!campo) throw new Error(`Sem o campo "${placeholder}" no ecrã`);
  await act(async () => {
    campo.props.onChangeText(valor);
  });
}

const resumo = {
  prestacaoSemEncargos: 140.26,
  jurosProximaPrestacao: 19.72,
  primeiroMes: '2026-10',
  mesesRestantes: 55,
  fim: '2031-04',
  jurosRestantes: 567.34,
  totalRestante: 8546.8,
  viavel: true,
  precoTotal: 8766.69,
  capitalAmortizado: 597.59,
  jurosContrato: 650.1,
  custoTotalContrato: 9890.4,
  pagoEmJurosEEncargos: 0,
};

const extrato = {
  emitidoEm: '2026-09-25',
  proximaPrestacaoNumero: 6,
  prestacaoTotal: 60,
  vencimento: '2026-10-05',
  prestacaoValor: 156.28,
  prestacaoCapital: 120.54,
  prestacaoJuros: 19.72,
  prestacaoSelo: 0.79,
  prestacaoSeguros: 15.23,
  capitalVencido: 0,
  emAtraso: false,
};

const credito = {
  id: 'd1',
  titulo: 'Crédito pessoal',
  valorInicial: 7169.1,
  desde: '2026-10',
  fixaId: 'f1',
  emFalta: 7169.1,
  pago: 0,
  mesesEmFalta: 55,
  prestacao: 156.28,
  taxaAnual: 3.3,
  valorFinanciado: 7766.69,
  entrada: 1000,
  prazoMeses: 60,
  inicioContrato: '2026-05',
  encargosMensais: 15.23,
  numeroContrato: 'XX 123456',
  credor: 'Montepio Crédito',
  resumo,
  extrato,
};

const dentista = { id: 'd2', titulo: 'Dentista', valorInicial: 500, desde: '2026-10', emFalta: 500, pago: 0, mesesEmFalta: null };

const cenario = (campos: Record<string, unknown> = {}) => ({
  prestacao: 140.26,
  prestacaoTotal: 156.28,
  meses: 56,
  fim: '2031-05',
  juros: 567.34,
  comissao: 0,
  amortizadoAgora: 0,
  totalAPagar: 8546.8,
  poupancaJuros: 0,
  poupancaLiquida: 0,
  mesesPoupados: 0,
  viavel: true,
  ...campos,
});

const simulacao = (extra: Record<string, unknown> = {}) => ({
  capitalEmFalta: 7169.1,
  taxaAnual: 3.3,
  comissaoReembolso: 0,
  encargosMensais: 15.23,
  primeiroMes: '2026-10',
  atual: cenario(),
  manterPrestacao: null,
  reduzirPrestacao: null,
  amortizacaoTotal: cenario({ meses: 0, fim: null, juros: 0, amortizadoAgora: 7169.1, totalAPagar: 7169.1, poupancaJuros: 567.34, poupancaLiquida: 1377.7, mesesPoupados: 56 }),
  extraMensal: null,
  ...extra,
});

let api: ApiFalsa;

beforeEach(async () => {
  await AsyncStorage.clear();
  api = instalarApiFalsa();
  api.responder('GET', '/api/conta/saldo', { saldo: 500 });
  api.responder('GET', '/api/dividas/estado', [credito, dentista]);
  api.responder('GET', '/api/despesas-fixas', [
    { id: 'f1', titulo: 'Crédito pessoal', valor: 156.28, diaDebito: 5, inicio: '2026-01', periodicidade: 'mensal' },
  ]);
  jest.useFakeTimers({
    now: new Date(2026, 9, 8, 12),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
});

afterEach(() => {
  jest.useRealTimers();
});

async function abrir(): Promise<ReactTestRenderer> {
  let ecra!: ReactTestRenderer;
  await act(async () => {
    ecra = renderer.create(<DividasScreen />);
  });
  return ecra;
}

describe('ecrã Dívidas: crédito com taxa', () => {
  it('mostra a próxima prestação do extrato, o que falta e as contas do contrato', async () => {
    const ecra = await abrir();
    expect(textos(ecra)).toEqual(
      expect.arrayContaining([
        'Crédito pessoal',
        'Capital em dívida 7169.10 € · Montepio Crédito',
        '8546.80 €', // o grande: tudo o que ainda vai sair (com juros, selo e seguros)
        'Próxima prestação',
        'Em dia',
        '6 de 60 · vence a 05/10/2026',
        '156.28 €',
        '120.54 €', // capital
        '19.72 €', // juros
        '0.79 €', // selo
        '15.23 €', // seguros
        'Segundo o extrato de 25/09/2026.',
        '3.30 %', // TAN
        '4 anos e 7 meses', // 55 prestações
        'Acaba em Abril 2031',
        '567.34 €', // juros que ainda vai pagar
        '8546.80 €', // total que ainda vai pagar
        '8766.69 €', // valor do bem
        '1000.00 €', // entrada
        '7766.69 €', // financiado
      ])
    );
  });

  it('só os créditos têm o botão de simular; as dívidas sem taxa continuam como antes', async () => {
    const ecra = await abrir();
    expect(textos(ecra).filter((t) => t === 'Simular amortização')).toHaveLength(1);
    expect(textos(ecra)).toEqual(expect.arrayContaining(['Dentista', 'Sem prestação ligada: o valor só muda quando o editares']));
    // Com duas dívidas há o que comparar; e como há um crédito com taxa, a dica para preencher a taxa não aparece
    expect(textos(ecra)).toContain('Comparar estratégias');
    expect(textos(ecra).some((t) => t.startsWith('Dica: preenche a taxa'))).toBe(false);
  });

  it('aguenta o que a API omite quando está vazio (sem contrato, sem selo, sem seguros...)', async () => {
    const { precoTotal, capitalAmortizado, jurosContrato, custoTotalContrato, ...contratoIncompleto } = resumo;
    const { prestacaoSelo, prestacaoSeguros, ...extratoIncompleto } = extrato;
    const { entrada, valorFinanciado, ...semContrato } = credito;
    api.responder('GET', '/api/dividas/estado', [{ ...semContrato, resumo: contratoIncompleto, extrato: extratoIncompleto }]);

    const ecra = await abrir();

    expect(textos(ecra)).toEqual(expect.arrayContaining(['Próxima prestação', '156.28 €', 'Faltam', '567.34 €']));
    expect(textos(ecra)).not.toContain('O contrato');
    expect(textos(ecra)).not.toContain('Imposto do selo');
    expect(textos(ecra).some((t) => t.includes('undefined') || t.includes('NaN'))).toBe(false);
  });

  it('marca o crédito em atraso quando o extrato tem capital vencido', async () => {
    api.responder('GET', '/api/dividas/estado', [{ ...credito, extrato: { ...extrato, capitalVencido: 120.54, emAtraso: true } }]);
    const ecra = await abrir();
    expect(textos(ecra)).toContain('Em atraso: 120.54 €');
    expect(textos(ecra)).not.toContain('Em dia');
  });

  it('um crédito que não chega para os juros avisa em vez de mostrar prazos', async () => {
    // A API não envia os campos vazios: sem prazo nem fim, as chaves nem existem
    const { mesesRestantes, fim, ...semPrazo } = resumo;
    api.responder('GET', '/api/dividas/estado', [{ ...credito, mesesEmFalta: null, resumo: { ...semPrazo, viavel: false } }]);
    const ecra = await abrir();
    expect(textos(ecra)).toContain('A prestação não chega para pagar os juros: a dívida não desce.');
  });
});

describe('total a pagar ou só o capital', () => {
  it('por defeito mostra o total (com juros, selo e seguros) e deixa passar para só o capital', async () => {
    const ecra = await abrir();
    expect(textos(ecra)).toEqual(expect.arrayContaining(['Nos créditos, mostrar', 'Só o capital', '9046.80 €', '8546.80 €']));
    expect(textos(ecra)).toContain('Capital em dívida 7169.10 € · Montepio Crédito');

    await carregar(ecra, 'Só o capital');

    // O total do topo passa a ser o capital (7169,10 do crédito + 500 do dentista) e o cartão do crédito mostra o capital
    expect(textos(ecra)).toEqual(expect.arrayContaining(['Capital em dívida', '7669.10 €', '7169.10 €', 'Total a pagar 8546.80 € · Montepio Crédito']));
    expect(textos(ecra)).not.toContain('9046.80 €');
  });

  it('a escolha fica guardada para a próxima vez', async () => {
    const ecra = await abrir();
    await carregar(ecra, 'Só o capital');
    expect(await AsyncStorage.getItem('dividas.modoValor.v1')).toBe('capital');

    const outra = await abrir();
    await act(async () => {});
    expect(textos(outra)).toContain('Total a pagar 8546.80 € · Montepio Crédito');
  });

  it('sem nenhum crédito não há escolha: só há um valor', async () => {
    api.responder('GET', '/api/dividas/estado', [dentista]);
    const ecra = await abrir();
    expect(textos(ecra)).not.toContain('Nos créditos, mostrar');
  });
});

describe('simulador', () => {
  it('abre com a situação atual e o que custa pagar tudo, e simula uma amortização', async () => {
    api.responder('POST', '/api/dividas/d1/simulacao', (p: PedidoFalso) =>
      p.corpo.amortizacao
        ? simulacao({
            manterPrestacao: cenario({ meses: 41, amortizadoAgora: 2000, comissao: 10, poupancaJuros: 190.5, poupancaLiquida: 301.2, mesesPoupados: 15 }),
            reduzirPrestacao: cenario({ prestacao: 103.12, prestacaoTotal: 119.14, meses: 56, amortizadoAgora: 2000, comissao: 10, poupancaJuros: 90.2, poupancaLiquida: 120.3 }),
          })
        : simulacao()
    );
    const ecra = await abrir();
    await carregar(ecra, 'Simular amortização');

    // Ao abrir: sem amortização nem extra
    expect(api.feitos('POST', '/api/dividas/d1/simulacao')[0].corpo).toEqual({ amortizacao: null, extraMensal: null });
    expect(textos(ecra)).toEqual(
      expect.arrayContaining(['Simular: Crédito pessoal', 'Se não fizeres nada', 'Pagar tudo agora', 'Poupas no total', '1377.70 €'])
    );
    expect(textos(ecra).some((t) => /^Amortizar .*: (manter|reduzir)/.test(t))).toBe(false);

    await escrever(ecra, 'Ex.: 2000', '2000');
    await carregar(ecra, 'Simular');

    expect(api.pedidos.filter((p) => p.caminho === '/api/dividas/d1/simulacao').at(-1)!.corpo).toEqual({ amortizacao: 2000, extraMensal: null });
    expect(textos(ecra)).toEqual(
      expect.arrayContaining([
        'Amortizar 2000.00 €: manter a prestação',
        'Amortizar 2000.00 €: reduzir a prestação',
        'Inclui 10.00 € de comissão',
        '301.20 €', // poupança líquida de manter a prestação
        '3 anos e 5 meses', // 41 prestações
      ])
    );
  });

  it('manda também o extra mensal e mostra o cenário', async () => {
    api.responder('POST', '/api/dividas/d1/simulacao', (p: PedidoFalso) =>
      simulacao(p.corpo.extraMensal ? { extraMensal: cenario({ prestacao: 190.26, prestacaoTotal: 206.28, meses: 42, poupancaJuros: 140, poupancaLiquida: 220, mesesPoupados: 14 }) } : {})
    );
    const ecra = await abrir();
    await carregar(ecra, 'Simular amortização');
    await escrever(ecra, 'Ex.: 50', '50');
    await carregar(ecra, 'Simular');

    expect(api.pedidos.filter((p) => p.caminho === '/api/dividas/d1/simulacao').at(-1)!.corpo).toEqual({ amortizacao: null, extraMensal: 50 });
    expect(textos(ecra)).toContain('Pagar mais 50.00 € por mês');
  });

  it('mostra o motivo quando a API recusa (ex.: sem prestação)', async () => {
    api.responder('POST', '/api/dividas/d1/simulacao', { status: 400, title: 'Pedido inválido', detail: 'Liga a prestação' }, 400);
    const ecra = await abrir();
    await carregar(ecra, 'Simular amortização');
    expect(textos(ecra)).toContain('Não foi possível simular.');
  });
});

describe('formulário do contrato', () => {
  it('um crédito novo envia a taxa, o financiado e o prazo; com taxa o campo passa a ser o capital', async () => {
    api.responder('POST', '/api/dividas', { id: 'novo' }, 201);
    const ecra = await abrir();

    await carregar(ecra, 'Contrato: taxa, entrada, prazo… (opcional)');
    await escrever(ecra, 'Nome (ex: Crédito do carro)', 'Carro');
    expect(ecra.root.findAll((n) => n.props.placeholder === 'Quanto falta pagar hoje (€)').length).toBeGreaterThan(0);
    await escrever(ecra, 'Ex.: 3,3', '3,3');
    expect(ecra.root.findAll((n) => n.props.placeholder === 'Capital em dívida hoje (€)').length).toBeGreaterThan(0);

    await escrever(ecra, 'Capital em dívida hoje (€)', '5000');
    await escrever(ecra, 'O que o banco emprestou, sem a entrada', '6.000,50');
    await escrever(ecra, 'Ex.: 60', '48');
    await carregar(ecra, 'Adicionar');

    const [pedido] = api.feitos('POST', '/api/dividas');
    expect(pedido.corpo).toEqual({
      titulo: 'Carro',
      valorInicial: 5000,
      desde: '2026-11',
      taxaAnual: 3.3,
      valorFinanciado: 6000.5,
      prazoMeses: 48,
    });
  });

  it('não deixa guardar uma taxa fora de 0 a 100 %', async () => {
    const ecra = await abrir();
    await carregar(ecra, 'Contrato: taxa, entrada, prazo… (opcional)');
    await escrever(ecra, 'Nome (ex: Crédito do carro)', 'Carro');
    await escrever(ecra, 'Quanto falta pagar hoje (€)', '5000');
    await escrever(ecra, 'Ex.: 3,3', '330');
    await carregar(ecra, 'Adicionar');
    expect(api.feitos('POST', '/api/dividas')).toHaveLength(0);
  });

  it('editar um crédito e apagar a taxa manda-a em "limpar"', async () => {
    api.responder('PATCH', '/api/dividas/d1');
    const ecra = await abrir();
    await carregar(ecra, 'Crédito pessoal');
    // O formulário abre com o contrato preenchido
    expect(ecra.root.findAll((n) => n.props.value === '3.3' && typeof n.props.onChangeText === 'function').length).toBeGreaterThan(0);

    await act(async () => {
      ecra.root.findAll((n) => n.props.value === '3.3' && typeof n.props.onChangeText === 'function')[0].props.onChangeText('');
    });
    await carregar(ecra, 'Guardar');

    const [pedido] = api.feitos('PATCH', '/api/dividas/d1');
    // Os campos do contrato vazios apagam-se (a comissão já não tinha valor: fica vazia na mesma)
    expect(pedido.corpo.limpar).toEqual(['taxaAnual', 'comissaoReembolso']);
    expect(pedido.corpo.valorFinanciado).toBe(7766.69);
    expect(pedido.corpo.entrada).toBe(1000);
    expect(pedido.corpo.prazoMeses).toBe(60);
    expect(pedido.corpo.encargosMensais).toBe(15.23);
    expect(pedido.corpo.fixaId).toBe('f1');
  });
});

describe('importar o extrato em PDF', () => {
  const lido = {
    extrato: {
      credor: 'Montepio Crédito',
      numeroContrato: 'XX 123456',
      categoria: 'Crédito Pessoal',
      dataContrato: '2026-04-01',
      emitidoEm: '2026-09-25',
      taxaAnual: 3.3,
      capitalInicial: 7766.69,
      capitalAmortizado: 597.59,
      capitalVencido: 0,
      capitalVincendo: 7169.1,
      prestacaoNumero: 6,
      prestacaoTotal: 60,
      vencimento: '2026-10-05',
      prestacaoValor: 156.28,
      prestacaoCapital: 120.54,
      prestacaoJuros: 19.72,
      prestacaoSelo: 0.79,
      prestacaoSeguros: 15.23,
      avisos: ['O extrato tem capital em atraso: 10,00 €.'],
    },
    dividaId: 'd1',
    dividaTitulo: 'Crédito pessoal',
  };

  beforeEach(() => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ name: 'extrato.pdf', uri: 'file:///cache/extrato.pdf', lastModified: 0 }],
    });
    (lerFicheiro as jest.Mock).mockResolvedValue(Uint8Array.from(Buffer.from('%PDF-1.7 teste')));
    api.responder('POST', '/api/dividas/extrato/ler', lido);
    api.responder('POST', '/api/dividas/extrato/aplicar', { id: 'd1' });
  });

  it('lê o PDF, mostra o que diz e atualiza a dívida do mesmo contrato', async () => {
    const ecra = await abrir();
    await carregar(ecra, 'Importar extrato (PDF)');
    await carregar(ecra, 'Escolher PDF');

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ type: ['application/pdf'] }));
    // O PDF vai em base64, tal e qual
    expect(api.feitos('POST', '/api/dividas/extrato/ler')[0].corpo).toEqual({ pdfBase64: Buffer.from('%PDF-1.7 teste').toString('base64') });
    expect(textos(ecra)).toEqual(
      expect.arrayContaining([
        'extrato.pdf',
        'Montepio Crédito',
        'XX 123456',
        'Capital em dívida',
        '7169.10 €',
        '6 de 60 · vence a 05/10/2026',
        'O extrato tem capital em atraso: 10,00 €.',
        'Crédito pessoal (mesmo contrato)',
        'Atualizar dívida',
      ])
    );

    await carregar(ecra, 'Atualizar dívida');
    const [aplicar] = api.feitos('POST', '/api/dividas/extrato/aplicar');
    expect(aplicar.corpo).toEqual({ extrato: lido.extrato, dividaId: 'd1', titulo: null, fixaId: 'f1' });
    // Depois de aplicar, o ecrã recarrega as dívidas
    expect(api.feitos('GET', '/api/dividas/estado').length).toBeGreaterThanOrEqual(2);
  });

  it('um contrato novo cria uma dívida com o nome escolhido e a prestação ligada', async () => {
    // Sem dívida do mesmo contrato a API não envia dividaId nem dividaTitulo
    const { dividaId, dividaTitulo, ...contratoNovo } = lido;
    api.responder('POST', '/api/dividas/extrato/ler', contratoNovo);
    const ecra = await abrir();
    await carregar(ecra, 'Importar extrato (PDF)');
    await carregar(ecra, 'Escolher PDF');

    expect(textos(ecra)).toContain('Criar dívida');
    // O nome vem sugerido pelo número do contrato
    expect(ecra.root.findAll((n) => n.props.value === 'Crédito XX 123456' && typeof n.props.onChangeText === 'function').length).toBeGreaterThan(0);

    await act(async () => {
      ecra.root.findAll((n) => n.props.value === 'Crédito XX 123456' && typeof n.props.onChangeText === 'function')[0].props.onChangeText('Carro');
    });
    // Há uma prestação "Crédito pessoal (156.28 €)" no formulário principal e no modal: a do modal é a última
    const chipsPrestacao = ecra.root.findAllByType(Text).filter((t) => textoDe(t) === 'Crédito pessoal (156.28 €)');
    expect(chipsPrestacao.length).toBeGreaterThanOrEqual(2);
    let no: No | null = chipsPrestacao[chipsPrestacao.length - 1];
    while (no && !no.props.onPress) no = no.parent;
    await act(async () => {
      no!.props.onPress();
    });
    await carregar(ecra, 'Criar dívida');

    expect(api.feitos('POST', '/api/dividas/extrato/aplicar')[0].corpo).toEqual({ extrato: lido.extrato, dividaId: null, titulo: 'Carro', fixaId: 'f1' });
  });

  it('um PDF que a API não consegue ler mostra o motivo e deixa tentar outro', async () => {
    api.responder('POST', '/api/dividas/extrato/ler', { status: 400, title: 'Pedido inválido', detail: 'Não reconheci este extrato.' }, 400);
    const ecra = await abrir();
    await carregar(ecra, 'Importar extrato (PDF)');
    await carregar(ecra, 'Escolher PDF');
    expect(textos(ecra)).toContain('Não foi possível ler o PDF.');
    expect(textos(ecra)).toContain('Escolher PDF'); // continua a poder escolher
    expect(api.feitos('POST', '/api/dividas/extrato/aplicar')).toHaveLength(0);
  });

  it('cancelar a escolha do ficheiro não faz nada', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    const ecra = await abrir();
    await carregar(ecra, 'Importar extrato (PDF)');
    await carregar(ecra, 'Escolher PDF');
    expect(api.feitos('POST', '/api/dividas/extrato/ler')).toHaveLength(0);
  });
});

describe('comparar estratégias', () => {
  const resultado = (meses: number, juros: number, ordem: { id: string; titulo: string; mes: number }[] = []) => ({ meses, juros, viavel: true, ordem });

  it('compara a bola de neve e a avalanche e destaca a melhor', async () => {
    api.responder('POST', '/api/dividas/estrategias', (p: PedidoFalso) => ({
      extraMensal: p.corpo.extraMensal,
      dividas: [{ id: 'd1', titulo: 'Crédito pessoal', capital: 7169.1, taxaAnual: 3.3, prestacao: 140.26 }],
      soPrestacoes: resultado(60, 900),
      bolaDeNeve: resultado(50, 700, [{ id: 'd2', titulo: 'Dentista', mes: 5 }, { id: 'd1', titulo: 'Crédito pessoal', mes: 50 }]),
      avalanche: resultado(50, 650),
      ignoradas: ['Cartão'],
    }));
    const ecra = await abrir();
    await carregar(ecra, 'Comparar estratégias');
    await carregar(ecra, 'Comparar');

    expect(api.feitos('POST', '/api/dividas/estrategias')[0].corpo).toEqual({ extraMensal: 50 });
    expect(textos(ecra)).toEqual(
      expect.arrayContaining([
        'Só as prestações',
        'Bola de neve',
        'Avalanche',
        'A melhor',
        'daqui a 50 meses',
        '250.00 €', // avalanche: 900 - 650
        'Ordem: Dentista (mês 5) → Crédito pessoal (mês 50)',
        'Ficaram de fora (sem prestação ligada ou já pagas): Cartão',
      ])
    );
    expect(textos(ecra).filter((t) => t === 'A melhor')).toHaveLength(1);
  });

  it('só aparece o botão quando há duas ou mais dívidas', async () => {
    api.responder('GET', '/api/dividas/estado', [credito]);
    const ecra = await abrir();
    expect(textos(ecra)).not.toContain('Comparar estratégias');
  });
});
