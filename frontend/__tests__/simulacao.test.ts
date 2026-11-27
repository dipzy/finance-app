// O simulador "e se…": contas puras sobre o que já foi gasto (sem previsões), mais a do cartão de alimentação
import type { Poupanca, PrevisaoCartao, ValorCategoria } from '../services/tipos';
import {
  SEM_AJUSTES_CARTAO,
  SEM_AJUSTES_MES,
  simularCartao,
  simularCartaoMes,
  simularGastos,
  simularMes,
  simularPoupancas,
  textoDiferenca,
  textoVersus,
} from '../utils/simulacao';

const gastos: ValorCategoria[] = [
  { categoria: 'restauracao', valor: 120 },
  { categoria: 'lazer', valor: 40.5 },
];

describe('gastos por categoria: e se gastasse X em vez de Y?', () => {
  it('sem mudanças não muda nada', () => {
    const s = simularGastos(gastos, {});
    expect(s).toEqual({ gastos: 160.5, gastosAtuais: 160.5, poupado: 0, novosAplicados: {}, mexeu: false });
  });

  it('um valor mais baixo poupa a diferença', () => {
    const s = simularGastos(gastos, { restauracao: 70 });
    expect(s).toMatchObject({ gastos: 110.5, poupado: 50, novosAplicados: { restauracao: 70 }, mexeu: true });
  });

  it('um valor mais alto gasta mais (poupado negativo)', () => {
    expect(simularGastos(gastos, { lazer: 100 })).toMatchObject({ gastos: 220, poupado: -59.5 });
  });

  it('tirar de uma categoria e pôr noutra dá zero', () => {
    const s = simularGastos(gastos, { restauracao: 90, lazer: 70.5 });
    expect(s).toMatchObject({ gastos: 160.5, poupado: 0, mexeu: true });
    expect(s.novosAplicados).toEqual({ restauracao: 90, lazer: 70.5 });
  });

  it('zero tira tudo da categoria', () => {
    expect(simularGastos(gastos, { restauracao: 0 })).toMatchObject({ gastos: 40.5, poupado: 120 });
  });

  it('numa categoria sem gastos também se pode pôr dinheiro', () => {
    const s = simularGastos(gastos, { viagens: 30 });
    expect(s).toMatchObject({ gastos: 190.5, poupado: -30, novosAplicados: { viagens: 30 } });
  });

  it('ignora valores vazios, negativos ou que não são números', () => {
    const s = simularGastos(gastos, { restauracao: undefined, lazer: -5, viagens: Number.NaN });
    expect(s.mexeu).toBe(false);
    expect(s.gastos).toBe(160.5);
  });

  it('um valor igual ao de agora não conta como mudança', () => {
    expect(simularGastos(gastos, { restauracao: 120 }).mexeu).toBe(false);
  });

  it('arredonda ao cêntimo', () => {
    expect(simularGastos(gastos, { restauracao: 0.004 }).gastos).toBe(40.5);
  });

  it('o texto em relação a não mexer em nada', () => {
    expect(textoVersus(0, 425, false)).toBe('Sem mudanças');
    expect(textoVersus(50, 425, true)).toBe('Com as mudanças sobram mais 50.00 € (eram 425.00 €)');
    expect(textoVersus(-30, 425, true)).toBe('Com as mudanças sobram menos 30.00 € (eram 425.00 €)');
    expect(textoVersus(0, 425, true)).toBe('Fica igual (425.00 €)');
  });
});

describe('a conta (o que recebo)', () => {
  const plano = { receita: 1500, poupancas: 200, gastos };
  // livre antes de gastar = 1500 - 200 = 1300; gastos 160.50 (de qualquer tipo de despesa); sobra 1139.50

  it('recebo - poupanças = livre antes de gastar; menos o que se gastou = sobra', () => {
    const r = simularMes(plano, SEM_AJUSTES_MES);
    expect(r).toMatchObject({ receita: 1500, poupancas: 200, gastos: 160.5, antesDeGastar: 1300, sobra: 1139.5, diferenca: 0, mexeu: false });
  });

  it('as despesas mensais que faltam pagar descem a sobra mas não o livre antes de gastar', () => {
    const r = simularMes({ ...plano, porPagar: 100 }, SEM_AJUSTES_MES);
    expect(r).toMatchObject({ porPagar: 100, antesDeGastar: 1300, sobra: 1039.5, diferenca: 0, mexeu: false });
    // E o que se muda nos gastos continua a contar por cima
    expect(simularMes({ ...plano, porPagar: 100 }, { novos: { restauracao: 70 } })).toMatchObject({ sobra: 1089.5, diferenca: 50 });
    // Valores inválidos contam como 0
    expect(simularMes({ ...plano, porPagar: -5 }, SEM_AJUSTES_MES).porPagar).toBe(0);
  });

  it('gastar menos numa categoria sobe a sobra mas não o livre antes de gastar', () => {
    const r = simularMes(plano, { novos: { restauracao: 70 } });
    expect(r).toMatchObject({ gastos: 110.5, antesDeGastar: 1300, sobra: 1189.5, diferenca: 50, poupado: 50, mexeu: true });
    expect(r.novosAplicados).toEqual({ restauracao: 70 });
  });

  it('passar dinheiro de uma categoria para outra não muda a sobra, mas conta como mudança', () => {
    const r = simularMes(plano, { novos: { restauracao: 90, lazer: 70.5 } });
    expect(r).toMatchObject({ sobra: 1139.5, diferenca: 0, poupado: 0, mexeu: true });
  });

  it('receber mais e poupar menos sobem o livre e a sobra', () => {
    const r = simularMes(plano, { receita: 1600, poupancas: 150, novos: {} });
    expect(r).toMatchObject({ receita: 1600, poupancas: 150, antesDeGastar: 1450, sobra: 1289.5, diferenca: 150, mexeu: true });
  });

  it('a sobra pode ficar negativa (gasta-se mais do que se recebe)', () => {
    const r = simularMes({ ...plano, receita: 300 }, SEM_AJUSTES_MES);
    expect(r.antesDeGastar).toBe(100);
    expect(r.sobra).toBe(-60.5);
  });

  it('ignora receita ou poupanças vazias, negativas ou que não são números', () => {
    const r = simularMes(plano, { receita: -1, poupancas: Number.NaN, novos: {} });
    expect(r).toMatchObject({ receita: 1500, poupancas: 200, mexeu: false });
  });
});

describe('o cartão de alimentação por mês', () => {
  it('o que carrega menos o que se gasta com ele é o que sobra', () => {
    const r = simularCartaoMes(150, [{ categoria: 'restauracao', valor: 90 }, { categoria: 'supermercado', valor: 40 }], {});
    expect(r).toEqual({ carga: 150, gastos: 130, sobra: 20, poupado: 0, novosAplicados: {}, mexeu: false });
  });

  it('gastar menos no cartão sobe a sobra do cartão', () => {
    const r = simularCartaoMes(150, [{ categoria: 'restauracao', valor: 90 }, { categoria: 'supermercado', valor: 40 }], { restauracao: 60 });
    expect(r).toMatchObject({ gastos: 100, sobra: 50, poupado: 30, mexeu: true });
  });

  it('se gasta mais do que carrega a sobra fica negativa (o resto sai da conta)', () => {
    expect(simularCartaoMes(100, [{ categoria: 'restauracao', valor: 130 }], {}).sobra).toBe(-30);
  });
});

describe('simulador das poupanças', () => {
  const poupanca = (campos: Partial<Poupanca>): Poupanca => ({ id: 'p', nome: 'Revolut', tipo: 'valor', valor: '100', saldo: 0, valorMensal: 100, ...campos });
  const revolut = poupanca({ id: 'r', saldo: 300 });
  const ppr = poupanca({ id: 'ppr', nome: 'PPR', valorMensal: 50, saldo: 1000, taxaAnual: 0 });

  it('sem mudanças fica tudo igual', () => {
    const s = simularPoupancas([revolut, ppr], {});
    expect(s.mexeu).toBe(false);
    expect(s.atual).toEqual(s.simulado);
    expect(s.atual).toEqual({ mensal: 150, em6Meses: 300 + 600 + 1000 + 300, emUmAno: 300 + 1200 + 1000 + 600 });
    expect([s.diferencaMensal, s.diferenca6Meses, s.diferencaUmAno]).toEqual([0, 0, 0]);
  });

  it('tirar 50 € a uma poupança baixa o que se poupa por mês, em 6 meses e num ano', () => {
    const s = simularPoupancas([revolut, ppr], { r: 50 });
    expect(s.mexeu).toBe(true);
    expect(s.simulado.mensal).toBe(100);
    expect(s.diferencaMensal).toBe(-50);
    expect(s.diferenca6Meses).toBe(-300);
    expect(s.diferencaUmAno).toBe(-600);
  });

  it('parar uma poupança (0) e pôr mais noutra', () => {
    const s = simularPoupancas([revolut, ppr], { r: 0, ppr: 120 });
    expect(s.simulado.mensal).toBe(120);
    expect(s.diferencaMensal).toBe(-30);
    expect(s.diferencaUmAno).toBe(-1200 + 840);
  });

  it('com juros o saldo cresce mais do que só as contribuições', () => {
    const comJuros = poupanca({ id: 'j', saldo: 1000, valorMensal: 0, taxaAnual: 12, retencao: 0 });
    const s = simularPoupancas([comJuros], { j: 100 });
    expect(s.simulado.emUmAno).toBeGreaterThan(1000 + 1200 + 120); // as contribuições mais juros sobre o saldo
    expect(s.diferencaUmAno).toBeGreaterThan(1200);
  });

  it('ignora o que está vazio, é negativo ou não é um número e não conta mudanças iguais', () => {
    expect(simularPoupancas([revolut], { r: undefined }).mexeu).toBe(false);
    expect(simularPoupancas([revolut], { r: -10 }).mexeu).toBe(false);
    expect(simularPoupancas([revolut], { r: NaN }).mexeu).toBe(false);
    expect(simularPoupancas([revolut], { r: 100 }).mexeu).toBe(false); // igual à de agora
    expect(simularPoupancas([], { r: 5 })).toMatchObject({ mexeu: false, atual: { mensal: 0 } });
  });

  it('poupança sem valor mensal conta como 0', () => {
    expect(simularPoupancas([poupanca({ valorMensal: undefined })], {}).atual.mensal).toBe(0);
  });

  it('texto da diferença com o sinal à frente', () => {
    expect(textoDiferenca(50)).toBe('+50.00 €');
    expect(textoDiferenca(-12.5)).toBe('-12.50 €');
    expect(textoDiferenca(0)).toBe('0.00 €');
  });
});
describe('simulador do cartão de alimentação', () => {
  const cartao: PrevisaoCartao = {
    saldo: 40,
    cargaPorReceber: 150,
    mediaDiaria: 4,
    gastosRecorrentes: 0,
    estimativaGastos: 104,
    previsaoFinal: 86,
    falta: 0,
  };

  it('sem mudanças é a previsão do cartão e a conta fica como está', () => {
    const s = simularCartao(cartao, 425, 26, SEM_AJUSTES_CARTAO);
    expect(s).toMatchObject({ previsaoFinal: 86, falta: 0, contaFinal: 425, diferencaConta: 0, estimativaGastos: 104, mexeu: false });
    expect(s.diasQueDura).toBe(10); // 40 € a 4 € por dia
  });

  it('gastar mais por dia: se o cartão não chegar, o que falta sai da conta', () => {
    const s = simularCartao(cartao, 425, 26, { ...SEM_AJUSTES_CARTAO, gastoPorDia: 8 });
    expect(s).toMatchObject({ estimativaGastos: 208, previsaoFinal: -18, falta: 18, contaFinal: 407, diferencaConta: -18, mexeu: true });
  });

  it('se o cartão não carregar este mês, falta mais', () => {
    expect(simularCartao(cartao, 425, 26, { ...SEM_AJUSTES_CARTAO, carga: 0 })).toMatchObject({ previsaoFinal: -64, falta: 64, contaFinal: 361 });
  });

  it('um gasto extra só desce o saldo do cartão', () => {
    expect(simularCartao(cartao, 425, 26, { ...SEM_AJUSTES_CARTAO, gastoExtra: 30 })).toMatchObject({ estimativaGastos: 134, previsaoFinal: 56, falta: 0, contaFinal: 425 });
  });

  it('os gastos recorrentes do cartão somam-se à média por dia', () => {
    const comRecorrentes = { ...cartao, gastosRecorrentes: 8, estimativaGastos: 112, previsaoFinal: 78 };
    expect(simularCartao(comRecorrentes, 425, 26, SEM_AJUSTES_CARTAO)).toMatchObject({ estimativaGastos: 112, previsaoFinal: 78, mexeu: false });
  });

  it('sem gastos o saldo dura até ao fim do mês', () => {
    expect(simularCartao({ ...cartao, mediaDiaria: 0, estimativaGastos: 0 }, 425, 26, SEM_AJUSTES_CARTAO).diasQueDura).toBeNull();
    expect(simularCartao({ ...cartao, saldo: 500 }, 425, 26, SEM_AJUSTES_CARTAO).diasQueDura).toBeNull(); // dura mais do que o mês
  });
});
