// O ecrã Simulador: parte do que já se gastou (o mês atual ou a média dos últimos meses), por categoria, e vê o que
// sobra se se gastasse noutro sítio (nada é guardado). A conta e o cartão de alimentação aparecem separados.
jest.setTimeout(20_000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('../services/database', () => ({
  ...jest.requireActual('../services/calculos'),
  EstatisticasDB: { previsao: jest.fn(), gastosCategorias: jest.fn() },
  PoupancasDB: { getAll: jest.fn() },
  SalarioDB: { getConfig: jest.fn() },
  calcularDespesasFixasSeparadas: jest.fn(),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'ana@exemplo.pt', name: 'Ana' }, logout: jest.fn() }),
}));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useFocusEffect: (efeito: () => void) => useEffect(efeito, [efeito]),
    usePathname: () => '/simulador',
  };
});
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));

import { act, ReactElement } from 'react';
import { Text, TextInput } from 'react-native';
import SimuladorScreen from '../app/(tabs)/simulador';
import * as database from '../services/database';
import type { GastosCategorias, PrevisaoFimMes } from '../services/tipos';

interface No {
  props: Record<string, any>;
  parent: No | null;
}
interface Ecra {
  root: { findAllByType(tipo: unknown): No[] };
  unmount(): void;
}
const renderer: { create(elemento: ReactElement): Ecra } = require('react-test-renderer');

const textoDe = (no: No) => [no.props.children].flat(Infinity).join('');
const textos = (e: Ecra) => e.root.findAllByType(Text).map(textoDe);
const junto = (e: Ecra) => textos(e).join('|');

async function desenhar() {
  let e!: Ecra;
  await act(async () => {
    e = renderer.create(<SimuladorScreen />);
  });
  return e;
}

async function escrever(e: Ecra, rotulo: string, valor: string) {
  const campo = e.root.findAllByType(TextInput).find((c) => c.props.accessibilityLabel === rotulo);
  if (!campo) throw new Error(`Sem o campo "${rotulo}"`);
  await act(async () => {
    campo.props.onChangeText(valor);
  });
}

async function carregar(e: Ecra, texto: string, indice = 0) {
  const alvos = e.root.findAllByType(Text).filter((t) => textoDe(t) === texto);
  if (!alvos[indice]) throw new Error(`Sem o botão "${texto}"`);
  let no: No | null = alvos[indice];
  while (no && !no.props.onPress) no = no.parent;
  await act(async () => {
    await no!.props.onPress();
  });
}

// O que já se gastou: o mês atual até hoje e a média por mês de 3 meses completos (sem cartão, por defeito)
const gastos = (extra: Partial<GastosCategorias> = {}): GastosCategorias => ({
  mes: '2026-10',
  mesesBase: 3,
  conta: {
    mesAtual: [
      { categoria: 'restauracao', valor: 30 },
      { categoria: 'lazer', valor: 10 },
    ],
    media: [
      { categoria: 'restauracao', valor: 120 },
      { categoria: 'lazer', valor: 40 },
    ],
  },
  cartao: null,
  cartaoMensal: 0,
  ...extra,
});

// A previsão só serve para saber se o cartão chega até ao fim do mês
const previsao = (extra: Partial<PrevisaoFimMes> = {}): PrevisaoFimMes => ({
  mes: '2026-10',
  saldoAtual: 1000,
  porPagarFixas: 300,
  estimativaGastos: 275,
  gastosRecorrentes: 15,
  previsaoFinal: 425,
  mediaDiaria: 10,
  diasRestantes: 26,
  base: '3 meses',
  mesesBase: 3,
  poupancasPorEnviar: 0,
  ...extra,
});

const G = database.EstatisticasDB.gastosCategorias as jest.Mock;
const P = database.EstatisticasDB.previsao as jest.Mock;
const POUPANCAS = database.PoupancasDB.getAll as jest.Mock;
const SALARIO = database.SalarioDB.getConfig as jest.Mock;
const FIXAS = database.calcularDespesasFixasSeparadas as jest.Mock;

// Recebe 1500: sem poupanças, a sobra é 1500 menos o que se gastou
beforeEach(() => {
  jest.clearAllMocks();
  G.mockResolvedValue(gastos());
  P.mockResolvedValue(previsao());
  POUPANCAS.mockResolvedValue([]);
  SALARIO.mockResolvedValue({ valor: '1500', diaRecebimento: 25 });
  // Ainda faltam pagar 100 € de despesas mensais este mês
  FIXAS.mockResolvedValue({ debitadas: 300, porDebitar: 100, total: 400 });
});

describe('Simulador: a média e o mês atual', () => {
  it('por defeito mostra a média por mês, só com valores reais', async () => {
    const e = await desenhar();
    const t = junto(e);
    expect(textos(e)).toEqual(expect.arrayContaining(['Mês atual', 'Média dos últimos 6 meses']));
    expect(t).toContain('Sobra por mês, em média');
    expect(t).toContain('1340.00 €'); // 1500 - (120 + 40)
    expect(t).toContain('Sem mudanças');
    expect(textos(e)).toEqual(expect.arrayContaining(['Restauração', 'média 120 €', 'Lazer', 'média 40 €']));
    expect(t).toContain('A média por mês do que gastaste nos últimos 3 meses completos');
    expect(t.toLowerCase()).not.toContain('previst'); // sem previsões (o cartão não existe aqui)
    await act(async () => e.unmount());
  });

  it('o botão do mês atual mostra o que já se gastou este mês', async () => {
    const e = await desenhar();

    await carregar(e, 'Mês atual');

    const t = junto(e);
    expect(t).toContain('Sobra este mês');
    expect(t).toContain('1360.00 €'); // 1500 - (30 + 10) - 100 por pagar
    expect(textos(e)).toEqual(expect.arrayContaining(['este mês 30 €', 'este mês 10 €']));
    expect(t).toContain('O que já gastaste este mês, até hoje.');

    await carregar(e, 'Média dos últimos 6 meses');
    expect(junto(e)).toContain('1340.00 €');
    await act(async () => e.unmount());
  });

  it('as despesas mensais que faltam pagar entram no mês atual (o previsto), mas não na média', async () => {
    const e = await desenhar();
    expect(junto(e)).not.toContain('Despesas mensais ainda por pagar (previsto)');
    expect(junto(e)).toContain('1340.00 €'); // a média não muda

    await carregar(e, 'Mês atual');
    expect(junto(e)).toContain('Despesas mensais ainda por pagar (previsto)|-100 €');
    expect(junto(e)).toContain('1360.00 €'); // 1500 - 40 - 100
    await act(async () => e.unmount());
  });

  it('sem despesas mensais por pagar não há essa linha, e se a consulta falhar o simulador funciona na mesma', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    FIXAS.mockResolvedValue({ debitadas: 300, porDebitar: 0, total: 300 });
    const sem = await desenhar();
    await carregar(sem, 'Mês atual');
    expect(junto(sem)).not.toContain('Despesas mensais ainda por pagar');
    expect(junto(sem)).toContain('1460.00 €'); // 1500 - 40
    await act(async () => sem.unmount());

    FIXAS.mockRejectedValue(new Error('sem rede'));
    const falha = await desenhar();
    await carregar(falha, 'Mês atual');
    expect(junto(falha)).toContain('1460.00 €');
    await act(async () => falha.unmount());
  });

  it('só há o último mês completo: diz que a média é só desse mês', async () => {
    G.mockResolvedValue(gastos({ mesesBase: 1 }));
    const e = await desenhar();
    expect(junto(e)).toContain('A média por mês é só a do último mês completo');
    await act(async () => e.unmount());
  });

  it('sem nenhum mês completo não há média: fica o mês atual e explica', async () => {
    G.mockResolvedValue(gastos({ mesesBase: 0, conta: { mesAtual: [{ categoria: 'lazer', valor: 10 }], media: [] } }));
    const e = await desenhar();
    const t = junto(e);
    expect(t).toContain('A média ainda não está disponível');
    // O botão da média fica desativado
    const botaoMedia = e.root.findAllByType(Text).find((x) => textoDe(x) === 'Média dos últimos 6 meses');
    let no: No | null = botaoMedia ?? null;
    while (no && !no.props.accessibilityState) no = no.parent;
    expect(no?.props.accessibilityState).toMatchObject({ disabled: true, selected: false });
    expect(t).toContain('Sobra este mês');
    expect(t).toContain('1390.00 €'); // 1500 - 10 - 100 por pagar

    expect(junto(e)).toContain('Sobra este mês');
    await act(async () => e.unmount());
  });

  it('escrever um valor novo numa categoria diz quanto se poupa, por mês e num ano', async () => {
    const e = await desenhar();

    await escrever(e, 'Novo valor de Restauração, em euros', '70');

    const t = junto(e);
    expect(t).toContain('1390.00 €'); // 1500 - (70 + 40)
    expect(t).toContain('Com as mudanças sobram mais 50.00 € (eram 1340.00 €)');
    expect(t).toContain('Poupas 50 €');
    expect(t).toContain('Num ano: +600.00 €');
    await act(async () => e.unmount());
  });

  it('gastar mais do que a média numa categoria desce a sobra', async () => {
    const e = await desenhar();

    await escrever(e, 'Novo valor de Lazer, em euros', '100');

    expect(junto(e)).toContain('1280.00 €');
    expect(junto(e)).toContain('Gastas mais 60 €');
    expect(junto(e)).toContain('Com as mudanças sobram menos 60.00 € (eram 1340.00 €)');
    await act(async () => e.unmount());
  });

  it('tirar de uma categoria e pôr noutra fica igual', async () => {
    const e = await desenhar();

    await escrever(e, 'Novo valor de Restauração, em euros', '90');
    await escrever(e, 'Novo valor de Lazer, em euros', '70');

    expect(junto(e)).toContain('Fica igual (1340.00 €)');
    await act(async () => e.unmount());
  });

  it('os botões "Metade" e "Zero" preenchem o valor novo', async () => {
    const e = await desenhar();

    await carregar(e, 'Metade', 0); // restauração: 120 -> 60
    expect(junto(e)).toContain('1400.00 €');

    await carregar(e, 'Zero', 1); // lazer: 40 -> 0
    expect(junto(e)).toContain('1440.00 €');
    await act(async () => e.unmount());
  });

  it('"Mostrar todas as categorias" deixa passar dinheiro para uma categoria sem gastos', async () => {
    const e = await desenhar();
    expect(junto(e)).not.toContain('Viagens');

    await carregar(e, 'Mostrar todas as categorias');
    expect(textos(e)).toContain('Viagens');
    expect(textos(e)).toContain('Só as que têm gastos');

    await escrever(e, 'Novo valor de Viagens, em euros', '30');
    expect(junto(e)).toContain('1310.00 €');
    expect(junto(e)).toContain('Gastas mais 30 €');

    await carregar(e, 'Só as que têm gastos');
    expect(textos(e)).not.toContain('Viagens');
    await act(async () => e.unmount());
  });

  it('"Repor tudo" volta ao normal', async () => {
    const e = await desenhar();
    await escrever(e, 'Novo valor de Restauração, em euros', '70');
    expect(junto(e)).toContain('1390.00 €');

    await carregar(e, 'Repor tudo');

    expect(junto(e)).toContain('1340.00 €');
    expect(junto(e)).toContain('Sem mudanças');
    expect(textos(e)).not.toContain('Repor tudo');
    await act(async () => e.unmount());
  });

  it('mudar entre o mês atual e a média não leva os valores escritos', async () => {
    const e = await desenhar();
    await escrever(e, 'Novo valor de Restauração, em euros', '70');

    await carregar(e, 'Mês atual');

    expect(junto(e)).toContain('1360.00 €');
    expect(junto(e)).toContain('Sem mudanças');
    await act(async () => e.unmount());
  });

  it('sem gastos explica que não há nada para mudar', async () => {
    G.mockResolvedValue(gastos({ conta: { mesAtual: [], media: [] } }));
    const e = await desenhar();
    expect(junto(e)).toContain('Ainda não há gastos para fazer a média.');
    await act(async () => e.unmount());
  });

  it('se os gastos falharem, mostra o erro e deixa tentar outra vez', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    G.mockRejectedValue(new Error('sem rede'));
    const e = await desenhar();
    expect(junto(e)).toContain('Não foi possível carregar os gastos.');

    G.mockResolvedValue(gastos());
    await carregar(e, 'Tentar outra vez');
    expect(junto(e)).toContain('1340.00 €');
    await act(async () => e.unmount());
  });

  it('sem salário o simulador avisa mas deixa escrever um valor', async () => {
    SALARIO.mockResolvedValue(null);
    const e = await desenhar();
    expect(junto(e)).toContain('Ainda não definiste o salário (no menu Salário)');

    await escrever(e, 'Quanto recebes por mês, em euros', '1000');
    expect(junto(e)).not.toContain('Ainda não definiste o salário');
    await act(async () => e.unmount());
  });

  it('se o salário falhar a conta não aparece mas dá para tentar outra vez', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    SALARIO.mockRejectedValue(new Error('sem rede'));
    const e = await desenhar();
    expect(junto(e)).toContain('Não foi possível carregar o salário.');

    SALARIO.mockResolvedValue({ valor: '1500', diaRecebimento: 25 });
    await carregar(e, 'Tentar outra vez');
    expect(junto(e)).toContain('1340.00 €');
    await act(async () => e.unmount());
  });

  it('as despesas mensais contam na categoria e a linha diz quanto é delas', async () => {
    G.mockResolvedValue(gastos({ conta: { mesAtual: [], media: [{ categoria: 'casa', valor: 640, fixas: 600 }] } }));
    const e = await desenhar();
    expect(textos(e)).toEqual(expect.arrayContaining(['Casa', 'média 640 €', 'Inclui 600 € de despesas mensais']));
    expect(junto(e)).toContain('860.00 €'); // 1500 - 640
    expect(junto(e)).not.toContain('Despesas mensais');
    await act(async () => e.unmount());
  });
});

describe('Simulador das poupanças', () => {
  const poupancas = [
    { id: 'r', nome: 'Revolut', tipo: 'valor', valor: '100', saldo: 300, valorMensal: 100 },
    { id: 'ppr', nome: 'PPR', tipo: 'valor', valor: '50', saldo: 1000, valorMensal: 50 },
  ];

  it('sem poupanças não mostra a parte das poupanças', async () => {
    const e = await desenhar();
    expect(junto(e)).not.toContain('E se mudasse as poupanças?');
    await act(async () => e.unmount());
  });

  it('mostra cada poupança com a contribuição de hoje', async () => {
    POUPANCAS.mockResolvedValue(poupancas);
    const e = await desenhar();
    expect(textos(e)).toEqual(expect.arrayContaining(['E se mudasse as poupanças?', 'Revolut', 'hoje 100 €/mês', 'PPR', 'hoje 50 €/mês']));
    expect(junto(e)).toContain('1190.00 €'); // 1500 - 150 - 160
    await act(async () => e.unmount());
  });

  it('tirar 50 € à Revolut mostra quanto se poupa a menos por mês e a sobra sobe', async () => {
    POUPANCAS.mockResolvedValue(poupancas);
    const e = await desenhar();

    await escrever(e, 'Nova contribuição mensal em Revolut, em euros', '50');

    const t = junto(e);
    expect(t).toContain('100 € (-50.00 €)'); // por mês
    expect(t).toContain('1240.00 €'); // a sobra
    expect(t).toContain('Repor tudo');
    await act(async () => e.unmount());
  });

  it('"Parar" põe a contribuição a 0 e "Repor tudo" volta ao normal', async () => {
    POUPANCAS.mockResolvedValue(poupancas);
    const e = await desenhar();

    await carregar(e, 'Parar', 0);
    expect(junto(e)).toContain('50 € (-100.00 €)');

    await carregar(e, 'Repor tudo');
    expect(junto(e)).toContain('1190.00 €');
    await act(async () => e.unmount());
  });

  it('se as poupanças falharem o simulador funciona na mesma', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    POUPANCAS.mockRejectedValue(new Error('sem rede'));
    const e = await desenhar();
    expect(junto(e)).toContain('1340.00 €');
    expect(junto(e)).not.toContain('E se mudasse as poupanças?');
    await act(async () => e.unmount());
  });
});

describe('Simulador: o cartão de alimentação', () => {
  const cartaoPrevisao = { saldo: 40, cargaPorReceber: 150, mediaDiaria: 4, gastosRecorrentes: 0, estimativaGastos: 104, previsaoFinal: 86, falta: 0 };
  const comCartao = () =>
    gastos({
      cartao: {
        mesAtual: [{ categoria: 'restauracao', valor: 25 }],
        media: [
          { categoria: 'restauracao', valor: 90 },
          { categoria: 'supermercado', valor: 40 },
        ],
      },
      cartaoMensal: 150,
    });

  it('sem cartão de alimentação não há nada dele nem etiquetas de origem', async () => {
    const e = await desenhar();
    expect(junto(e).toLowerCase()).not.toContain('cartão');
    expect(textos(e)).not.toContain('Conta');
    await act(async () => e.unmount());
  });

  it('com cartão a conta e o cartão aparecem na mesma lista, cada linha com a sua origem, e num só resumo', async () => {
    G.mockResolvedValue(comCartao());
    const e = await desenhar();
    const t = junto(e);

    // As mesmas categorias, uma linha da conta e outra do cartão (Restauração tem as duas)
    expect(textos(e).filter((x) => x === 'Conta')).toHaveLength(2); // restauração e lazer
    expect(textos(e).filter((x) => x === 'Cartão de alimentação')).toHaveLength(2); // restauração e supermercado
    expect(textos(e).filter((x) => x === 'Restauração')).toHaveLength(2);
    expect(t).toContain('média 90 €');
    // Sem blocos nem títulos à parte para o cartão
    expect(t).not.toContain('Cartão: sobra');
    expect(t).not.toContain('Para onde vai o cartão');
    expect(textos(e).filter((x) => x === 'E se mudasse os gastos?')).toHaveLength(1);
    // Um só resumo: a conta e, a seguir, o cartão (carrega 150, gasta 90 + 40)
    expect(t).toContain('Despesas e gastos da conta');
    expect(t).toContain('1340.00 €'); // a sobra na conta
    expect(t).toContain('O cartão carrega por mês');
    expect(t).toContain('Gastos pagos com o cartão');
    expect(t).toContain('Sobra no cartão');
    expect(t).toContain('Sobra no cartão|20 €'); // 150 - 130
    await act(async () => e.unmount());
  });

  it('o mês atual também junta a conta e o cartão', async () => {
    G.mockResolvedValue(comCartao());
    const e = await desenhar();

    await carregar(e, 'Mês atual');

    const t = junto(e);
    expect(t).toContain('Sobra no cartão|125 €'); // o cartão: 150 - 25
    expect(t).toContain('1360.00 €'); // a conta: 1500 - 40
    await act(async () => e.unmount());
  });

  it('mudar um valor no cartão só mexe no cartão, e mudar na conta só na conta; o total junta as duas poupanças', async () => {
    G.mockResolvedValue(comCartao());
    const e = await desenhar();

    await escrever(e, 'Novo valor de Restauração (Cartão de alimentação), em euros', '60');
    let t = junto(e);
    expect(t).toContain('Sobra no cartão|50 €'); // o cartão: 150 - (60 + 40)
    expect(t).toContain('1340.00 €'); // a conta não mexeu
    expect(t).toContain('Poupas 30 €');
    expect(t).toContain('Poupas com as mudanças|30 €');

    await escrever(e, 'Novo valor de Restauração (Conta), em euros', '70');
    t = junto(e);
    expect(t).toContain('1390.00 €'); // a conta
    expect(t).toContain('Sobra no cartão|50 €'); // o cartão ficou como estava
    expect(t).toContain('Poupas com as mudanças|80 €'); // 50 da conta + 30 do cartão
    await act(async () => e.unmount());
  });

  it('se o cartão gasta mais do que carrega a sobra do cartão fica negativa', async () => {
    G.mockResolvedValue(gastos({ cartao: { mesAtual: [], media: [{ categoria: 'restauracao', valor: 180 }] }, cartaoMensal: 150 }));
    const e = await desenhar();
    expect(junto(e)).toContain('Sobra no cartão|-30 €');
    await act(async () => e.unmount());
  });

  it('a previsão do cartão (a única) diz se chega até ao fim do mês', async () => {
    G.mockResolvedValue(comCartao());
    P.mockResolvedValue(previsao({ cartao: cartaoPrevisao }));
    const e = await desenhar();

    let t = junto(e);
    expect(t).toContain('O cartão chega até ao fim do mês?');
    expect(t).toContain('É uma previsão');
    expect(t).toContain('Cartão de alimentação no fim do mês');
    expect(t).toContain('86.00 €'); // 40 + 150 - 104
    expect(t).toContain('Chega até ao fim do mês');
    expect(t).not.toContain('O que isto faz à conta');

    await escrever(e, 'Quanto gastas por dia com o cartão, em euros', '8');
    t = junto(e);
    expect(t).toContain('Não chega: faltam 18 €, que saíam da conta');
    expect(t).toContain('O que isto faz à conta');
    expect(t).toContain('407 €'); // 425 - 18
    await act(async () => e.unmount());
  });

  it('sem a previsão o resto do cartão funciona na mesma', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    G.mockResolvedValue(comCartao());
    P.mockRejectedValue(new Error('sem rede'));
    const e = await desenhar();
    expect(junto(e)).toContain('Sobra no cartão');
    expect(junto(e)).not.toContain('O cartão chega até ao fim do mês?');
    await act(async () => e.unmount());
  });
});
