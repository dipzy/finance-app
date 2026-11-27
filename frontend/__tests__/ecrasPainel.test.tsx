// Os ecrãs Início (painel) e Resumo do mês, com os serviços substituídos pelos nomes que exportam
// (não dependem de como os dados são guardados: Firebase ou a API)

// O primeiro render carrega o React Native todo: com a cache do jest vazia (ex.: no CI) passa dos 5 s
jest.setTimeout(20_000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);
jest.mock('../services/notificacoes', () => ({ reagendarNotificacoes: jest.fn(async () => null) }));
jest.mock('../services/database', () => {
  const calculos = jest.requireActual('../services/calculos');
  return {
    ...calculos,
    mesAtual: () => calculos.mesDe(),
    calcularSaldoDisponivel: jest.fn(),
    calcularSaldoPrevisto: jest.fn(),
    DespesasFixasDB: { getAll: jest.fn(), debitar: jest.fn() },
    PagamentosDB: { getDoMes: jest.fn() },
    DespesasExtrasDB: { getDoMes: jest.fn() },
    OrcamentosDB: { getEstado: jest.fn() },
    ObjetivosDB: { getAll: jest.fn() },
    EstatisticasDB: { gastosPorCategoria: jest.fn(), evolucao: jest.fn(), comparacao: jest.fn(), previsao: jest.fn() },
    PoupancasDB: { getAll: jest.fn(), contribuirManualmente: jest.fn(), getEmAtraso: jest.fn() },
    ContaCorrenteDB: { getCartaoAlimentacao: jest.fn() },
    SalarioDB: { getConfig: jest.fn(), receberManual: jest.fn() },
  };
});
// Os gastos por enviar (fila offline) usam o cliente da API, que precisa do Firebase
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('../services/folhaMes', () => ({ obterDadosFolhaMes: jest.fn() }));
jest.mock('../services/exportarExcel', () => ({ exportarParaExcel: jest.fn() }));
jest.mock('../services/relatorioPdf', () => ({
  exportarRelatorioPdf: jest.fn(),
  mensagemErroPdf: () => 'Não foi possível exportar o PDF.',
}));
jest.mock('../contexts/AuthContext', () => {
  const sessao = { user: { id: 'u1', email: 'ana@exemplo.pt', name: 'Ana Silva' }, logout: jest.fn() };
  return { useAuth: () => sessao };
});
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
    useFocusEffect: (efeito: () => void) => useEffect(efeito, [efeito]),
    usePathname: () => '/welcome',
    Redirect: () => null,
  };
});
// Os ícones carregam a fonte depois de aparecerem (avisos de act fora do teste); aqui não interessam
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { act, ReactElement } from 'react';
import { Alert, Text, TextInput } from 'react-native';
import ResumoMesScreen from '../app/(tabs)/two';
import WelcomeScreen from '../app/(tabs)/welcome';
import * as database from '../services/database';
import { exportarParaExcel } from '../services/exportarExcel';
import { obterDadosFolhaMes } from '../services/folhaMes';
import type {
  ComparacaoMes,
  DadosFolhaMes,
  Despesa,
  EstadoOrcamentoMes,
  EvolucaoMes,
  ObjetivoPoupanca,
  PagamentoFixa,
  Poupanca,
  PrevisaoFimMes,
} from '../services/tipos';

// O react-test-renderer não tem tipos instalados: só o que este teste usa
interface No {
  props: Record<string, any>;
  parent: No | null;
}
interface ReactTestRenderer {
  root: { findAllByType(tipo: unknown): No[]; findAll(teste: (n: No) => boolean): No[] };
  unmount(): void;
}
const renderer: { create(elemento: ReactElement): ReactTestRenderer } = require('react-test-renderer');

const textoDe = (no: No) => [no.props.children].flat(Infinity).join('');
const textos = (ecra: ReactTestRenderer) => ecra.root.findAllByType(Text).map(textoDe);

async function desenhar(elemento: ReactElement) {
  let ecra!: ReactTestRenderer;
  await act(async () => {
    ecra = renderer.create(elemento);
  });
  return ecra;
}

// Carrega no que tem este texto (o botão é o primeiro antepassado com onPress)
async function carregar(ecra: ReactTestRenderer, texto: string) {
  const alvo = ecra.root.findAllByType(Text).find((t) => textoDe(t) === texto);
  if (!alvo) throw new Error(`Sem o texto "${texto}" no ecrã`);
  let no: No | null = alvo;
  while (no && !no.props.onPress) no = no.parent;
  if (!no) throw new Error(`"${texto}" não é um botão`);
  await act(async () => {
    await no!.props.onPress();
  });
}

// O botão só com ícone, pelo início do nome que o leitor de ecrã anuncia ("Mês anterior, ...")
function botaoIcone(ecra: ReactTestRenderer, rotulo: string): No {
  const [alvo] = ecra.root.findAll(
    (n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(rotulo) && !!n.props.onPress
  );
  if (!alvo) throw new Error(`Sem o botão "${rotulo}" no ecrã`);
  return alvo;
}

const OUTUBRO = '2026-10';

const folhaOutubro = (campos: Partial<DadosFolhaMes> = {}): DadosFolhaMes => ({
  mes: OUTUBRO,
  lucro: [
    { titulo: 'Ordenado', valor: 1500 },
    { titulo: 'Alimen.', valor: 160, informativo: true },
  ],
  despesas: [
    { titulo: 'Renda', valor: 600, estado: 'por-pagar' },
    { titulo: 'Luz', valor: 45, estado: 'pago', data: '2026-10-01' },
  ],
  poupanca: [{ titulo: 'PPR', valor: 150 }],
  despesasMes: [{ titulo: 'Jantar', valor: 40, data: '2026-10-03' }],
  anual: [],
  saldoConta: 1200,
  falta: [{ titulo: 'Renda', valor: 600 }],
  saldoPoupanca: [{ titulo: 'PPR', valor: 3000 }],
  totalAPagar: [],
  ...campos,
});

const fixas: Despesa[] = [
  { id: 'luz', titulo: 'Luz', valor: 45, diaDebito: 1 },
  { id: 'renda', titulo: 'Renda', valor: 600, diaDebito: 8 },
  { id: 'net', titulo: 'Net', valor: 35, diaDebito: 6 },
  { id: 'seguro', titulo: 'Seguro carro', valor: 300, diaDebito: 20, periodicidade: 'anual', mesAnual: 10 },
];
const pagamentos: PagamentoFixa[] = [
  { id: `${OUTUBRO}_luz`, fixaId: 'luz', mes: OUTUBRO, titulo: 'Luz', valor: 45, data: '2026-10-01', estado: 'pago' },
];
const extras: Despesa[] = [
  { id: 'e1', titulo: 'Jantar', valor: 40, data: '2026-10-03', mes: OUTUBRO },
  { id: 'e2', titulo: 'Farmácia', valor: 12.5, data: '2026-10-04', mes: OUTUBRO },
  { id: 'e3', titulo: 'Cinema', valor: 9, data: '2026-10-01', mes: OUTUBRO },
  { id: 'e4', titulo: 'Café', valor: 1.2, data: '2026-10-02', mes: OUTUBRO },
];

const orcamentos: EstadoOrcamentoMes[] = [
  { id: 'o1', categoria: 'restauracao', mes: OUTUBRO, limite: 50, gasto: 41, restante: 9, percentagem: 82, estado: 'perto' },
  { id: 'o2', categoria: 'lazer', mes: OUTUBRO, limite: 100, gasto: 9, restante: 91, percentagem: 9, estado: 'ok' },
];
const objetivos: ObjetivoPoupanca[] = [
  {
    id: 'ob1',
    nome: 'Férias',
    valorAlvo: 600,
    mesAlvo: '2027-03',
    mesInicio: OUTUBRO,
    valorAtual: 50,
    percentagem: 8.3,
    emFalta: 550,
    mesesRestantes: 6,
    valorPorMes: 91.67,
    estado: 'no-bom-caminho',
  },
];
const evolucao: EvolucaoMes[] = Array.from({ length: 12 }, (_, i) => {
  const mes = `${i < 2 ? 2025 : 2026}-${String(((i + 10) % 12) + 1).padStart(2, '0')}`;
  const gasto = 600 + i * 10;
  return {
    mes,
    entrou: 1500,
    gasto,
    poupado: 150,
    saldoFinal: i === 0 ? null : 900 + i * 20,
    despesasMensais: 500,
    despesasExtras: gasto - 500,
    livre: 1500 - gasto - 150,
  };
});

// A previsão do fim do mês e a comparação com o mês anterior (GET /api/estatisticas/previsao e /comparacao)
const previsao: PrevisaoFimMes = {
  mes: '2026-10',
  saldoAtual: 1200,
  porPagarFixas: 365,
  estimativaGastos: 311.9,
  gastosRecorrentes: 0,
  previsaoFinal: 523.1,
  mediaDiaria: 11.996,
  diasRestantes: 26,
  base: '3 meses',
  mesesBase: 3,
  poupancasPorEnviar: 0,
};

const zero = { atual: 0, anterior: 0, diferenca: 0, variacao: null };
function comparacao(mes: string): ComparacaoMes {
  const atual = mes === OUTUBRO;
  return {
    mes,
    mesAnterior: atual ? '2026-09' : '2026-08',
    ateDia: atual ? 5 : null,
    gastosDiaADia: { atual: 158, anterior: 134, diferenca: 24, variacao: 17.9 },
    despesasFixas: zero,
    poupado: zero,
    entrou: zero,
    categorias: [
      { categoria: 'restauracao', atual: 100, anterior: 34, diferenca: 66, variacao: 194.1 },
      { categoria: 'supermercado', atual: 30, anterior: 90, diferenca: -60, variacao: -66.7 },
      { categoria: 'compras', atual: 28, anterior: 0, diferenca: 28, variacao: null },
      { categoria: 'saude', atual: 0, anterior: 10, diferenca: -10, variacao: -100 },
    ] as ComparacaoMes['categorias'],
  };
}

beforeEach(async () => {
  await AsyncStorage.clear(); // a vista e a origem do gráfico ficam guardadas no dispositivo
  // Só a data é falsa: o React precisa dos temporizadores verdadeiros
  jest.useFakeTimers({
    now: new Date(2026, 9, 5, 12),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  jest.clearAllMocks();
  (database.calcularSaldoDisponivel as jest.Mock).mockResolvedValue(1200);
  (database.calcularSaldoPrevisto as jest.Mock).mockResolvedValue(565);
  (database.SalarioDB.getConfig as jest.Mock).mockResolvedValue(null);
  (database.DespesasFixasDB.getAll as jest.Mock).mockResolvedValue(fixas);
  (database.PagamentosDB.getDoMes as jest.Mock).mockResolvedValue(pagamentos);
  (database.DespesasExtrasDB.getDoMes as jest.Mock).mockResolvedValue(extras);
  (obterDadosFolhaMes as jest.Mock).mockImplementation(async (_uid: string, mes: string) => folhaOutubro({ mes }));
  (database.OrcamentosDB.getEstado as jest.Mock).mockResolvedValue(orcamentos);
  (database.ObjetivosDB.getAll as jest.Mock).mockResolvedValue(objetivos);
  (database.EstatisticasDB.gastosPorCategoria as jest.Mock).mockImplementation(async (_uid: string, mes: string) => ({
    mes,
    total: 52.5,
    categorias: [
      { categoria: 'restauracao', total: 40, quantidade: 1, percentagem: 76.2 },
      { categoria: 'saude', total: 12.5, quantidade: 1, percentagem: 23.8 },
    ],
  }));
  (database.EstatisticasDB.evolucao as jest.Mock).mockResolvedValue(evolucao);
  (database.EstatisticasDB.previsao as jest.Mock).mockResolvedValue(previsao);
  (database.EstatisticasDB.comparacao as jest.Mock).mockImplementation(async (_uid: string, mes?: string) =>
    comparacao(mes ?? OUTUBRO)
  );
  (database.PoupancasDB.getAll as jest.Mock).mockResolvedValue([]);
  (database.PoupancasDB.getEmAtraso as jest.Mock).mockResolvedValue([]);
  (database.ContaCorrenteDB.getCartaoAlimentacao as jest.Mock).mockResolvedValue({ saldo: 98.5, valorMensal: 160 });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Início (painel)', () => {
  it('mostra os saldos, os números do mês, os próximos pagamentos e as últimas extras', async () => {
    const ecra = await desenhar(<WelcomeScreen />);
    const t = textos(ecra);

    expect(t).toContain('Olá, Ana');
    expect(t).toContain('Saldo da conta');
    expect(t).toContain('1200.00 €');
    // O Início só mostra o que é real: já não tem a previsão do fim do mês (nem a previsão pedida à API)
    expect(t).not.toContain('Previsão no fim do mês');
    expect(t).not.toContain('Previsto no fim do mês');
    expect(t.join('|')).not.toContain('€/dia em gastos');
    expect(database.EstatisticasDB.previsao).not.toHaveBeenCalled();
    // O saldo está no cartão grande: o cabeçalho do Início não repete o "Disponível"
    expect(t).not.toContain('Disponível');
    // Sem as explicações por baixo de cada número
    expect(t).not.toContain('Despesas fixas + extras');

    // Este mês: só o Gasto (645 + 40) e o Total (665); o resto está no Resumo do mês
    expect(t).toEqual(expect.arrayContaining(['Gasto no mês', '685.00 €', 'Sobra do mês', '665.00 €']));
    expect(t).not.toContain('Entrou');
    expect(t).not.toContain('Poupado');

    // Próximos pagamentos: pelo dia (a Luz já está paga); a anual deste mês também conta
    const proximos = ['Net', 'Renda', 'Seguro carro'];
    expect(t.filter((x) => proximos.includes(x))).toEqual(proximos);
    expect(t).toContain('Amanhã');
    expect(t).toContain('Anual');
    expect(t).not.toContain('Luz');
    expect(t).toContain('935.00 €'); // total por pagar

    // As 3 extras mais recentes (o Cinema, do dia 1, fica de fora)
    const ultimas = ['Farmácia', 'Jantar', 'Café'];
    expect(t.filter((x) => ultimas.includes(x))).toEqual(ultimas);
    expect(t).not.toContain('Cinema');
    expect(t).toContain('+1 mais');

    // Lê o mês atual
    expect(obterDadosFolhaMes).toHaveBeenCalledWith('u1', OUTUBRO);
    expect(database.PagamentosDB.getDoMes).toHaveBeenCalledWith('u1', OUTUBRO);
    expect(database.DespesasExtrasDB.getDoMes).toHaveBeenCalledWith('u1', OUTUBRO);
    await act(async () => ecra.unmount());
  });

  it('avisa das despesas dos meses anteriores que ficaram por pagar e deixa pagar o mês certo', async () => {
    const antigas = [
      { id: 'renda', titulo: 'Renda', valor: 600, diaDebito: 8, inicio: '2026-01' },
      { id: 'luz', titulo: 'Luz', valor: 45, diaDebito: 1, inicio: '2026-01' },
    ];
    (database.DespesasFixasDB.getAll as jest.Mock).mockResolvedValue(antigas);
    // Setembro e meses anteriores: a Luz foi paga e a Renda ficou por pagar; outubro: tudo pago
    (database.PagamentosDB.getDoMes as jest.Mock).mockImplementation(async (_uid: string, mes: string) =>
      antigas
        .filter((f) => mes === OUTUBRO || f.id === 'luz')
        .map((f) => ({ id: `${mes}_${f.id}`, fixaId: f.id, mes, titulo: f.titulo, valor: f.valor, data: `${mes}-01`, estado: 'pago' }))
    );
    (database.DespesasFixasDB.debitar as jest.Mock).mockResolvedValue('debitada');
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, botoes) => botoes?.[1]?.onPress?.());

    const ecra = await desenhar(<WelcomeScreen />);
    const t = textos(ecra);
    expect(t).toContain('Por pagar de meses anteriores');
    expect(t).toContain('Setembro 2026 · dia 8');
    // Só a Renda de julho, agosto e setembro: a Luz está paga e o mês de hoje não entra
    expect(t.filter((x) => x === 'Renda')).toHaveLength(3);
    expect(t).toContain('1800.00 €');

    await act(async () => {
      ecra.root.findAll((n) => n.props.accessibilityLabel === 'Pagar Renda de Setembro 2026' && !!n.props.onPress)[0].props.onPress();
    });
    expect(alerta).toHaveBeenCalled();
    expect(database.DespesasFixasDB.debitar).toHaveBeenCalledWith('u1', 'renda', '2026-09');
    alerta.mockRestore();
    await act(async () => ecra.unmount());
  });

  it('atalhos e ligações levam aos ecrãs certos (e nenhum à antiga Finanças)', async () => {
    const ecra = await desenhar(<WelcomeScreen />);
    await carregar(ecra, 'Novo gasto');
    await carregar(ecra, 'Orçamentos');
    await carregar(ecra, 'Salário');
    await carregar(ecra, 'Objetivos');
    await carregar(ecra, 'Próximos pagamentos');
    await carregar(ecra, 'Últimos gastos');
    expect((router.push as jest.Mock).mock.calls.map((c) => c[0])).toEqual([
      '/(tabs)/despesas-extras',
      '/(tabs)/orcamentos',
      '/(tabs)/salario',
      '/(tabs)/objetivos',
      '/(tabs)/despesas-fixas',
      '/(tabs)/despesas-extras',
    ]);
    expect(router.push).not.toHaveBeenCalledWith('/(tabs)');
    await act(async () => ecra.unmount());
  });

  it('sem nada por pagar nem extras, diz isso', async () => {
    (database.PagamentosDB.getDoMes as jest.Mock).mockResolvedValue(
      fixas.map((f) => ({ id: `${OUTUBRO}_${f.id}`, fixaId: f.id, mes: OUTUBRO, titulo: f.titulo, valor: f.valor, data: '2026-10-01', estado: 'pago' }))
    );
    (database.DespesasExtrasDB.getDoMes as jest.Mock).mockResolvedValue([]);
    const ecra = await desenhar(<WelcomeScreen />);
    const t = textos(ecra);
    expect(t).toContain('Não falta pagar nada este mês');
    expect(t).toContain('Sem gastos este mês');
    await act(async () => ecra.unmount());
  });

  it('se não conseguir carregar, deixa tentar outra vez', async () => {
    (database.calcularSaldoDisponivel as jest.Mock).mockRejectedValueOnce(new Error('sem rede'));
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {});
    const ecra = await desenhar(<WelcomeScreen />);
    expect(textos(ecra)).toContain('Não foi possível carregar o painel.');
    await carregar(ecra, 'Tentar outra vez');
    expect(textos(ecra)).toContain('Este mês');
    erro.mockRestore();
    await act(async () => ecra.unmount());
  });
});

describe('Resumo do mês', () => {
  it('mostra a folha do mês com os blocos e só o botão de exportar Excel', async () => {
    const ecra = await desenhar(<ResumoMesScreen />);
    const t = textos(ecra);
    expect(t).toContain('Resumo do mês'); // o título do cabeçalho
    expect(t).toContain('Outubro 2026');
    for (const bloco of ['Lucro', 'Despesas', 'Poupança', 'Despesas do Mês', 'Anual', 'Saldo Poupança', 'Total a pagar']) {
      expect(t).toContain(bloco);
    }
    // Sem o bloco "Conta" (nem as linhas "Falta") e sem os gastos por categoria (ficam nos Orçamentos)
    expect(t.filter((x) => x === 'Conta')).toHaveLength(1); // só o seletor Conta | Cartão (o bloco "Conta" saiu)
    expect(t).not.toContain('Falta: Renda');
    expect(t).not.toContain('Gastos por categoria');
    expect(database.EstatisticasDB.gastosPorCategoria).not.toHaveBeenCalled();
    // O bloco "Resultado do mês" saiu (repetia informação)
    expect(t).not.toContain('Resultado do mês');
    expect(t).not.toContain('Total para extras (Sobra - Poupança)');
    // Cada despesa fixa diz se já foi paga no mês
    expect(t).toContain('✓ Pago em 01/10');
    expect(t).toContain('Por pagar');
    // O gráfico de cima tem as três vistas; a distribuição já não é uma secção à parte
    expect(t).toEqual(expect.arrayContaining(['Evolução', 'Distribuição', 'Roda']));
    expect(t).not.toContain('Distribuição do Salário');
    // No fim das Despesas: o saldo da conta e a previsão (mês atual)
    expect(t).toEqual(expect.arrayContaining(['Saldo da conta', 'Previsão no fim do mês']));
    expect(t).toContain('Descarregar Excel');
    expect(t).not.toContain('Copiar para Partilhar');
    expect(t).not.toContain('Descarregar Ficheiro');

    await carregar(ecra, 'Descarregar Excel');
    expect(exportarParaExcel).toHaveBeenCalledWith('u1', undefined, 'descarregar');
    await act(async () => ecra.unmount());
  });

  describe('o cartão de alimentação nos gráficos', () => {
    // Cada mês carregou 160 € no cartão e gastou 40 € + (o mês) com ele
    const comCartao = evolucao.map((m, i) => ({ ...m, cartaoCarregado: 160, cartaoGasto: 40 + i }));

    beforeEach(() => {
      (database.EstatisticasDB.evolucao as jest.Mock).mockResolvedValue(comCartao);
      (obterDadosFolhaMes as jest.Mock).mockImplementation(async (_uid: string, mes: string) =>
        folhaOutubro({ mes, despesasMes: [{ titulo: 'Jantar', valor: 40, data: '2026-10-03' }, { titulo: 'Almoço', valor: 63.49, data: '2026-10-04', cartaoAlimentacao: true }] })
      );
    });

    it('quem tem cartão escolhe entre a conta e o cartão e a escolha fica guardada', async () => {
      const ecra = await desenhar(<ResumoMesScreen />);
      expect(textos(ecra)).toEqual(expect.arrayContaining(['Conta', 'Cartão de alimentação']));
      // Por defeito, a conta
      expect(textos(ecra)).toContain('Gastos do dia a dia');
      expect(textos(ecra)).not.toContain('Gasto no cartão');

      await carregar(ecra, 'Cartão de alimentação');

      expect(await AsyncStorage.getItem('resumo.origemGrafico')).toBe('cartao');
      await act(async () => ecra.unmount());
    });

    it('a evolução do cartão mostra o que carregou, o que gastou e o que ficou livre', async () => {
      const ecra = await desenhar(<ResumoMesScreen />);

      await carregar(ecra, 'Cartão de alimentação');

      const t = textos(ecra);
      expect(t).toEqual(expect.arrayContaining(['Carregou', 'Gasto no cartão', 'Livre']));
      // Sem as legendas da conta
      expect(t).not.toContain('Despesas fixas');
      expect(t).not.toContain('Poupado');
      // O mês atual (o último): carregou 160 e gastou 40 + 11 = 51
      expect(t.join('|')).toContain('Carregou|160.00 €|Gasto no cartão|51.00 €|Livre|109.00 €');
      await act(async () => ecra.unmount());
    });

    it('a roda e a distribuição do cartão dividem o que carregou em gasto e livre', async () => {
      const ecra = await desenhar(<ResumoMesScreen />);
      await carregar(ecra, 'Cartão de alimentação');

      await carregar(ecra, 'Roda');

      let t = textos(ecra);
      expect(t).toContain('Cartão de alimentação de Outubro 2026');
      expect(t).toContain('Cartão'); // o centro da roda
      expect(t).toEqual(expect.arrayContaining(['Gasto no cartão 39.7%', 'Livre 60.3%'])); // 63.49 de 160
      expect(t).toContain('Sobra no cartão (carregou - gastos)');
      expect(t).toContain('96.51 €'); // 160 - 63.49
      // O salário não aparece enquanto se vê o cartão
      expect(t).not.toContain('Salário de Outubro 2026');
      expect(t).not.toContain('Entra na conta (salário - poupanças)');

      await carregar(ecra, 'Distribuição');
      t = textos(ecra);
      expect(t).toContain('Cartão de alimentação de Outubro 2026');

      // De volta à conta
      await carregar(ecra, 'Conta');
      expect(textos(ecra)).toContain('Salário de Outubro 2026');
      await act(async () => ecra.unmount());
    });

    it('sem cartão de alimentação não há seletor nem vistas do cartão', async () => {
      (database.EstatisticasDB.evolucao as jest.Mock).mockResolvedValue(evolucao);
      (obterDadosFolhaMes as jest.Mock).mockImplementation(async (_uid: string, mes: string) =>
        folhaOutubro({ mes, lucro: [{ titulo: 'Ordenado', valor: 1500 }] })
      );
      const ecra = await desenhar(<ResumoMesScreen />);
      const t = textos(ecra);
      expect(t).not.toContain('Cartão de alimentação');
      expect(t.filter((x) => x === 'Conta')).toHaveLength(0);
      await act(async () => ecra.unmount());
    });

    it('com o cartão desligado não há seletor, mesmo com gastos antigos pagos com ele', async () => {
      // O cartão deixou de carregar (nenhum mês tem o que carrega) mas há gastos que foram pagos com ele
      (database.EstatisticasDB.evolucao as jest.Mock).mockResolvedValue(evolucao.map((m) => ({ ...m, cartaoCarregado: 0, cartaoGasto: 30 })));
      (obterDadosFolhaMes as jest.Mock).mockImplementation(async (_uid: string, mes: string) =>
        folhaOutubro({
          mes,
          lucro: [{ titulo: 'Ordenado', valor: 1500 }],
          despesasMes: [{ titulo: 'Almoço', valor: 30, data: '2026-10-03', cartaoAlimentacao: true }],
        })
      );
      const ecra = await desenhar(<ResumoMesScreen />);
      const t = textos(ecra);
      expect(t).not.toContain('Cartão de alimentação');
      expect(t.filter((x) => x === 'Conta')).toHaveLength(0);
      await act(async () => ecra.unmount());
    });

    it('um mês sem cartão diz que não há cartão registado nesse mês', async () => {
      const ecra = await desenhar(<ResumoMesScreen />);
      await carregar(ecra, 'Cartão de alimentação');
      (obterDadosFolhaMes as jest.Mock).mockImplementation(async (_uid: string, mes: string) =>
        folhaOutubro({ mes, lucro: [{ titulo: 'Ordenado', valor: 1500 }], despesasMes: [] })
      );
      await act(async () => {
        await botaoIcone(ecra, 'Mês anterior').props.onPress();
      });
      await carregar(ecra, 'Roda');
      expect(textos(ecra)).toContain('Sem cartão de alimentação registado em Setembro 2026');
      await act(async () => ecra.unmount());
    });
  });

  it('o título de cada bloco leva ao ecrã onde se edita', async () => {
    const ecra = await desenhar(<ResumoMesScreen />);
    await carregar(ecra, 'Lucro');
    await carregar(ecra, 'Despesas do Mês');
    await carregar(ecra, 'Total a pagar');
    expect((router.push as jest.Mock).mock.calls.map((c) => c[0])).toEqual([
      '/(tabs)/salario',
      '/(tabs)/despesas-extras',
      '/(tabs)/dividas',
    ]);
    await act(async () => ecra.unmount());
  });

  it('o seletor de mês carrega a folha do mês anterior (sem saldo da conta nem previsão)', async () => {
    const ecra = await desenhar(<ResumoMesScreen />);
    (obterDadosFolhaMes as jest.Mock).mockImplementation(async (_uid: string, mes: string) =>
      folhaOutubro({ mes, falta: [], saldoConta: 900 })
    );
    await act(async () => {
      await botaoIcone(ecra, 'Mês anterior').props.onPress();
    });
    const t = textos(ecra);
    expect(obterDadosFolhaMes).toHaveBeenLastCalledWith('u1', '2026-09');
    expect(t).toContain('Setembro 2026');
    expect(t).not.toContain('Saldo da conta');
    expect(t).not.toContain('Previsão no fim do mês');
    await act(async () => ecra.unmount());
  });

  it('a resposta atrasada de um mês antigo não substitui o mês escolhido', async () => {
    let soltarSetembro!: (folha: DadosFolhaMes) => void;
    (obterDadosFolhaMes as jest.Mock).mockImplementation((_uid: string, mes: string) =>
      mes === '2026-09'
        ? new Promise<DadosFolhaMes>((resolver) => (soltarSetembro = resolver))
        : Promise.resolve(folhaOutubro({ mes }))
    );
    const ecra = await desenhar(<ResumoMesScreen />);

    // Setembro fica pendurado; volta-se a outubro, que chega primeiro
    await act(async () => {
      botaoIcone(ecra, 'Mês anterior').props.onPress();
    });
    await act(async () => {
      botaoIcone(ecra, 'Mês seguinte').props.onPress();
    });
    expect(textos(ecra)).toContain('Previsão no fim do mês');

    // Setembro chega tarde: não pode aparecer
    await act(async () => {
      soltarSetembro(folhaOutubro({ mes: '2026-09', falta: [], lucro: [{ titulo: 'Ordenado setembro', valor: 1 }] }));
    });
    expect(textos(ecra)).not.toContain('Ordenado setembro');
    expect(textos(ecra)).toContain('Outubro 2026');
    await act(async () => ecra.unmount());
  });
});

describe('orçamentos, objetivos e gráficos novos', () => {
  it('o Início mostra só os orçamentos perto do limite e o objetivo principal, com ligações', async () => {
    const ecra = await desenhar(<WelcomeScreen />);
    const t = textos(ecra);
    expect(t).toContain('Orçamentos');
    expect(t).toContain('Restauração');
    expect(t).toContain('82%');
    expect(t).not.toContain('Lazer'); // está ok: não aparece
    expect(t).toContain('Férias');
    expect(t).toContain('8%'); // o objetivo: nome, percentagem e barra, sem a frase de estado
    expect(t).not.toContain('faltam 550 € · 91.67 €/mês até Março 2027');

    await carregar(ecra, 'Restauração');
    await carregar(ecra, 'Férias');
    expect((router.push as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['/(tabs)/orcamentos', '/(tabs)/objetivos']);
    await act(async () => ecra.unmount());
  });

  it('sem orçamentos em alerta nem objetivos, o Início não mostra esses cartões', async () => {
    (database.OrcamentosDB.getEstado as jest.Mock).mockResolvedValue([orcamentos[1]]);
    (database.ObjetivosDB.getAll as jest.Mock).mockResolvedValue([]);
    const ecra = await desenhar(<WelcomeScreen />);
    const t = textos(ecra);
    expect(t).not.toContain('Restauração');
    expect(t).not.toContain('Férias');
    expect(t).toContain('Este mês');
    await act(async () => ecra.unmount());
  });

  it('se os orçamentos falharem, o painel aparece na mesma', async () => {
    (database.OrcamentosDB.getEstado as jest.Mock).mockRejectedValue(new Error('sem rede'));
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {});
    const ecra = await desenhar(<WelcomeScreen />);
    expect(textos(ecra)).toContain('Este mês');
    expect(textos(ecra)).not.toContain('Restauração');
    erro.mockRestore();
    await act(async () => ecra.unmount());
  });

  it('o Resumo do mês mostra os últimos 12 meses com as despesas separadas e o que ficou livre', async () => {
    const ecra = await desenhar(<ResumoMesScreen />);
    const t = textos(ecra);
    expect(t).toContain('Últimos 12 meses');
    expect(t).toEqual(expect.arrayContaining(['Entrou', 'Despesas fixas', 'Gastos do dia a dia', 'Poupado', 'Livre']));
    expect(t).not.toContain('Saldo final');
    expect(t).not.toContain('Gasto');
    expect(database.EstatisticasDB.evolucao).toHaveBeenCalledWith('u1', 12);
    await act(async () => ecra.unmount());
  });

  it('o gráfico de cima muda para a distribuição do salário (barras ou roda) e lembra-se da escolha', async () => {
    await AsyncStorage.clear();
    const ecra = await desenhar(<ResumoMesScreen />);
    expect(textos(ecra)).toContain('Últimos 12 meses');

    await carregar(ecra, 'Distribuição');
    let t = textos(ecra);
    expect(t).not.toContain('Últimos 12 meses');
    expect(t).toContain('Salário de Outubro 2026');
    expect(t).toContain('Entra na conta (salário - poupanças)');

    await carregar(ecra, 'Roda');
    t = textos(ecra);
    expect(t).toContain('Salário'); // no meio da roda
    expect(t).toContain('Entra na conta (salário - poupanças)');
    expect(await AsyncStorage.getItem('resumo.vistaGrafico')).toBe('roda');
    await act(async () => ecra.unmount());

    // Ao voltar, abre na roda
    const outra = await desenhar(<ResumoMesScreen />);
    expect(textos(outra)).toContain('Salário de Outubro 2026');
    expect(textos(outra)).not.toContain('Últimos 12 meses');
    await act(async () => outra.unmount());
    await AsyncStorage.clear();
  });

  it('tocar num mês do gráfico escolhe-o no seletor', async () => {
    const ecra = await desenhar(<ResumoMesScreen />);
    await act(async () => {
      await botaoIcone(ecra, 'Junho 2026:').props.onPress();
    });
    expect(obterDadosFolhaMes).toHaveBeenLastCalledWith('u1', '2026-06');
    expect(textos(ecra)).toContain('Junho 2026');
    // A evolução não é pedida outra vez ao mudar de mês
    expect(database.EstatisticasDB.evolucao).toHaveBeenCalledTimes(1);
    await act(async () => ecra.unmount());
  });

  it('o Início mostra o saldo do cartão de alimentação (e esconde-o a quem não o usa)', async () => {
    const ecra = await desenhar(<WelcomeScreen />);
    expect(textos(ecra)).toEqual(expect.arrayContaining(['Saldo da conta', 'Cartão', '98.50 €']));
    await act(async () => ecra.unmount());

    (database.ContaCorrenteDB.getCartaoAlimentacao as jest.Mock).mockResolvedValue({ saldo: 0, valorMensal: 0 });
    const semCartao = await desenhar(<WelcomeScreen />);
    expect(textos(semCartao)).not.toContain('Cartão');
    expect(textos(semCartao)).not.toContain('Cartão de alimentação');
    await act(async () => semCartao.unmount());
  });

  it('o Início mostra o gasto e a sobra do cartão ao lado dos do salário (e esconde-os a quem não o usa)', async () => {
    // O cartão carrega 160 € (a linha "Alimen." do Lucro) e já se gastaram 63.49 € com ele
    (obterDadosFolhaMes as jest.Mock).mockImplementation(async (_uid: string, mes: string) =>
      folhaOutubro({
        mes,
        despesasMes: [
          { titulo: 'Jantar', valor: 40, data: '2026-10-03' },
          { titulo: 'Almoço', valor: 63.49, data: '2026-10-04', cartaoAlimentacao: true },
        ],
      })
    );
    const ecra = await desenhar(<WelcomeScreen />);
    const t = textos(ecra);
    // O do salário não mexe: o gasto com o cartão fica de fora
    expect(t).toEqual(expect.arrayContaining(['Gasto no mês', 'Sobra do mês']));
    expect(t.join('|')).toContain('Gasto no cartão|63.49 €|Sobra do cartão|96.51 €'); // 160 - 63.49
    await act(async () => ecra.unmount());

    (database.ContaCorrenteDB.getCartaoAlimentacao as jest.Mock).mockResolvedValue({ saldo: 0, valorMensal: 0 });
    const semCartao = await desenhar(<WelcomeScreen />);
    expect(textos(semCartao)).not.toContain('Gasto no cartão');
    expect(textos(semCartao)).not.toContain('Sobra do cartão');
    await act(async () => semCartao.unmount());
  });

  it('uma despesa paga só em parte mostra o que já foi pago e o que falta', async () => {
    (obterDadosFolhaMes as jest.Mock).mockImplementation(async (_uid: string, mes: string) =>
      folhaOutubro({ mes, despesas: [{ titulo: 'Combustível', valor: 68.57, estado: 'parcial', valorEmFalta: 31.43 }] })
    );
    const ecra = await desenhar(<ResumoMesScreen />);
    expect(textos(ecra)).toContain('Parcial · 68,57 € pagos · faltam 31,43 €');
    await act(async () => ecra.unmount());
  });

  it('nos meses passados, as despesas fixas sem registo não mostram estado', async () => {
    const ecra = await desenhar(<ResumoMesScreen />);
    (obterDadosFolhaMes as jest.Mock).mockImplementation(async (_uid: string, mes: string) =>
      folhaOutubro({ mes, despesas: [{ titulo: 'Renda', valor: 600 }, { titulo: 'Luz', valor: 45, estado: 'pago' }] })
    );
    await act(async () => {
      await botaoIcone(ecra, 'Mês anterior').props.onPress();
    });
    const t = textos(ecra);
    expect(t).toContain('✓ Pago');
    expect(t).not.toContain('Por pagar');
    expect(t).not.toContain('Anulado');
    await act(async () => ecra.unmount());
  });
});

describe('análise: previsão, comparação com o mês anterior e poupanças por enviar', () => {
  it('o Início já não mostra a comparação com o mês anterior (fica no Resumo do mês)', async () => {
    const ecra = await desenhar(<WelcomeScreen />);
    expect(textos(ecra)).not.toContain('Comparado com setembro');
    expect(database.EstatisticasDB.comparacao).not.toHaveBeenCalled();
    await act(async () => ecra.unmount());
  });

  it('o Resumo do mês compara todas as categorias; num mês passado compara meses completos', async () => {
    const ecra = await desenhar(<ResumoMesScreen />);
    let t = textos(ecra);
    expect(t).toContain('Comparado com setembro');
    expect(t).toContain('-100% (-10.00 €)');
    expect(database.EstatisticasDB.comparacao).toHaveBeenLastCalledWith('u1', OUTUBRO);

    await act(async () => {
      await botaoIcone(ecra, 'Mês anterior').props.onPress();
    });
    t = textos(ecra);
    expect(database.EstatisticasDB.comparacao).toHaveBeenLastCalledWith('u1', '2026-09');
    expect(t).toContain('Comparado com agosto');
    expect(t).not.toContain('Gastos de 1 a 5, nos dois meses');
    await act(async () => ecra.unmount());
  });

  const manual = (campos: Partial<Poupanca>): Poupanca => ({
    id: 'ppr',
    nome: 'PPR',
    tipo: 'valor',
    valor: '50',
    saldo: 0,
    contribuicaoAutomatica: false,
    valorMensal: 50,
    ...campos,
  });

  it('o Início mostra as poupanças manuais por enviar e "Já enviei" regista a contribuição', async () => {
    (database.PoupancasDB.getAll as jest.Mock).mockResolvedValue([
      manual({}),
      manual({ id: 'auto', nome: 'Revolut', contribuicaoAutomatica: true }),
      manual({ id: 'enviada', nome: 'Aforro', ultimaContribuicaoMes: OUTUBRO }),
    ]);
    (database.PoupancasDB.contribuirManualmente as jest.Mock).mockResolvedValue('adicionada');
    const ecra = await desenhar(<WelcomeScreen />);
    const t = textos(ecra);
    expect(t).toContain('PPR · 50.00 € · por enviar');
    expect(t.some((x) => x.startsWith('Revolut') || x.startsWith('Aforro'))).toBe(false);

    (database.PoupancasDB.getAll as jest.Mock).mockResolvedValue([manual({ ultimaContribuicaoMes: OUTUBRO })]);
    await carregar(ecra, 'Já enviei');
    expect(database.PoupancasDB.contribuirManualmente).toHaveBeenCalledWith('u1', 'ppr');
    expect(textos(ecra)).not.toContain('PPR · 50.00 € · por enviar');
    await act(async () => ecra.unmount());
  });

  describe('recebimento manual do salário', () => {
    // Hoje é 5 de outubro (a data falsa dos testes)
    const config = (campos: Record<string, unknown> = {}) => ({ valor: '1500', diaRecebimento: 3, recebimentoManual: true, ...campos });
    const recebido = new Date(2026, 9, 5, 12).toISOString();

    it('depois do dia, sem o ter marcado, avisa e "Já recebi" faz entrar o salário configurado', async () => {
      (database.SalarioDB.getConfig as jest.Mock).mockResolvedValue(config());
      (database.SalarioDB.receberManual as jest.Mock).mockResolvedValue({ salario: 1500, ppr: 0, poupanca: 0, liquido: 1500 });
      const ecra = await desenhar(<WelcomeScreen />);
      expect(textos(ecra)).toContain('Salário por receber');
      expect(textos(ecra).join('|')).toContain('Devia ter entrado no dia 3');

      (database.SalarioDB.getConfig as jest.Mock).mockResolvedValue(config({ lastReceived: recebido }));
      await carregar(ecra, 'Já recebi');

      expect(database.SalarioDB.receberManual).toHaveBeenCalledWith('u1', undefined);
      expect(textos(ecra)).not.toContain('Salário por receber');
      await act(async () => ecra.unmount());
    });

    it('com um valor escrito marca com esse valor (um mês com horas extra)', async () => {
      (database.SalarioDB.getConfig as jest.Mock).mockResolvedValue(config());
      (database.SalarioDB.receberManual as jest.Mock).mockResolvedValue({ salario: 1623.45, ppr: 0, poupanca: 0, liquido: 1623.45 });
      const ecra = await desenhar(<WelcomeScreen />);

      const campo = ecra.root.findAllByType(TextInput).find((c) => c.props.accessibilityLabel === 'Valor do salário que entrou, em euros');
      await act(async () => {
        campo!.props.onChangeText('1623,45');
      });
      await carregar(ecra, 'Já recebi');

      expect(database.SalarioDB.receberManual).toHaveBeenCalledWith('u1', 1623.45);
      await act(async () => ecra.unmount());
    });

    it('um valor que não é maior do que zero não é enviado', async () => {
      (database.SalarioDB.getConfig as jest.Mock).mockResolvedValue(config());
      const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const ecra = await desenhar(<WelcomeScreen />);

      const campo = ecra.root.findAllByType(TextInput).find((c) => c.props.accessibilityLabel === 'Valor do salário que entrou, em euros');
      await act(async () => {
        campo!.props.onChangeText('0');
      });
      await carregar(ecra, 'Já recebi');

      expect(database.SalarioDB.receberManual).not.toHaveBeenCalled();
      expect(alerta).toHaveBeenCalledWith('Erro', 'Escreve o valor que entrou, maior do que zero.');
      alerta.mockRestore();
      await act(async () => ecra.unmount());
    });

    it('se a API recusar, mostra o erro e o aviso continua', async () => {
      (database.SalarioDB.getConfig as jest.Mock).mockResolvedValue(config());
      (database.SalarioDB.receberManual as jest.Mock).mockRejectedValue(new Error('sem rede'));
      const erro = jest.spyOn(console, 'error').mockImplementation(() => {});
      const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const ecra = await desenhar(<WelcomeScreen />);

      await carregar(ecra, 'Já recebi');

      expect(alerta).toHaveBeenCalledWith('Erro', expect.any(String));
      expect(textos(ecra)).toContain('Salário por receber');
      erro.mockRestore();
      alerta.mockRestore();
      await act(async () => ecra.unmount());
    });

    it('não aparece no modo automático, antes do dia, nem se o salário deste mês já entrou', async () => {
      for (const campos of [{ recebimentoManual: false }, { diaRecebimento: 20 }, { lastReceived: recebido }]) {
        (database.SalarioDB.getConfig as jest.Mock).mockResolvedValue(config(campos));
        const ecra = await desenhar(<WelcomeScreen />);
        expect(textos(ecra)).not.toContain('Salário por receber');
        await act(async () => ecra.unmount());
      }
    });
  });

  it('avisa das contribuições manuais dos meses anteriores por enviar e "Já enviei" regulariza o mês certo', async () => {
    (database.PoupancasDB.getEmAtraso as jest.Mock).mockResolvedValue([
      { poupancaId: 'ppr', nome: 'PPR', mes: '2026-08', valor: 50 },
      { poupancaId: 'ppr', nome: 'PPR', mes: '2026-09', valor: 50 },
    ]);
    (database.PoupancasDB.contribuirManualmente as jest.Mock).mockResolvedValue('adicionada');
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, botoes) => botoes?.[1]?.onPress?.());

    const ecra = await desenhar(<WelcomeScreen />);
    const t = textos(ecra);
    expect(t).toContain('Poupanças por enviar de meses anteriores');
    expect(t).toContain('Agosto 2026');
    expect(t).toContain('Setembro 2026');
    expect(t).toContain('100.00 €'); // o total em atraso

    await act(async () => {
      ecra.root.findAll((n) => n.props.accessibilityLabel === 'Já enviei PPR de Setembro 2026' && !!n.props.onPress)[0].props.onPress();
    });
    expect(alerta).toHaveBeenCalled();
    // Pede o mês em atraso, não o de hoje
    expect(database.PoupancasDB.contribuirManualmente).toHaveBeenCalledWith('u1', 'ppr', '2026-09');
    alerta.mockRestore();
    await act(async () => ecra.unmount());
  });

  it('sem contribuições em atraso, o Início não mostra esse aviso (nem quebra se a API falhar)', async () => {
    (database.PoupancasDB.getEmAtraso as jest.Mock).mockRejectedValue(new Error('sem rede'));
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {});
    const ecra = await desenhar(<WelcomeScreen />);
    expect(textos(ecra)).toContain('Este mês');
    expect(textos(ecra)).not.toContain('Poupanças por enviar de meses anteriores');
    erro.mockRestore();
    await act(async () => ecra.unmount());
  });

  it('o bloco Poupança do Resumo diz se a contribuição manual já foi enviada', async () => {
    (database.PoupancasDB.getAll as jest.Mock).mockResolvedValue([
      manual({}),
      manual({ id: 'aforro', nome: 'Aforro', ultimaContribuicaoMes: OUTUBRO, ultimaContribuicaoEm: '2026-10-03' }),
    ]);
    const ecra = await desenhar(<ResumoMesScreen />);
    const t = textos(ecra);
    // O estado vem logo a seguir ao nome da poupança, na mesma linha
    const junto = t.join(' ');
    expect(junto).toContain('Por enviar este mês');
    expect(junto).toContain('Enviada 03/10');
    await act(async () => ecra.unmount());
  });
});
