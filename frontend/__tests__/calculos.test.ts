import {
  ativaNoMes,
  calcularDivida,
  calcularPoupancaComConfig,
  calcularPPRComConfig,
  calcularRecebimento,
  centimos,
  contribuicaoDe,
  descricaoConfigurada,
  deveDebitarAutomaticamente,
  diaEfetivo,
  diasUteisDoMes,
  estadoNoMes,
  idPagamento,
  mesAnterior,
  mesDaData,
  mesDe,
  mesSeguinte,
  nomeMes,
  podeDebitar,
  separarDespesasFixas,
  totaisFolha,
  valorSalarioBase,
} from '../services/calculos';
import type { ConfigPPRPoupanca, Despesa, Divida, FinancialData, PagamentoFixa, Poupanca, SalarioConfig } from '../services/tipos';

const outubro5 = new Date(2026, 9, 5, 12);
const OUTUBRO = '2026-10';

const fixa = (campos: Partial<Despesa> = {}): Despesa => ({ id: 'f', titulo: 'Renda', valor: 600, diaDebito: 1, ...campos });

const pago = (fixaId: string, valor: number, mes = OUTUBRO, estado: PagamentoFixa['estado'] = 'pago'): PagamentoFixa => ({
  id: idPagamento(mes, fixaId),
  fixaId,
  mes,
  titulo: fixaId,
  valor,
  data: `${mes}-01`,
  estado,
});

const config = (campos: Partial<ConfigPPRPoupanca> = {}): ConfigPPRPoupanca => ({
  pprTipo: 'percentagem',
  pprValor: '10',
  poupancaTipo: 'valor',
  poupancaValor: '200',
  ...campos,
});

const antigo: FinancialData = { salario: '1000', pprPercentagem: '5', poupancaPercentagem: '20', lastUpdated: '' };

describe('meses', () => {
  it('formato AAAA-MM e nome do mês', () => {
    expect(mesDe(outubro5)).toBe('2026-10');
    expect(mesDe(new Date(2026, 0, 1))).toBe('2026-01');
    expect(nomeMes('2026-10')).toBe('Outubro 2026');
    expect(nomeMes('2026-03')).toBe('Março 2026');
  });

  it('mês seguinte e anterior, passando o ano', () => {
    expect(mesSeguinte('2026-12')).toBe('2027-01');
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(mesSeguinte('2026-10')).toBe('2026-11');
  });

  it('mês de uma data (formato atual e antigo)', () => {
    expect(mesDaData('2026-10-05')).toBe('2026-10');
    expect(mesDaData('28/09/2026')).toBe('2026-09');
    expect(mesDaData(undefined)).toBeNull();
  });
});

describe('saldos', () => {
  it('o que falta pagar = despesas fixas ainda por pagar', () => {
    const fixas = [fixa({ id: 'renda', valor: 600 }), fixa({ id: 'luz', valor: 45.1 }), fixa({ id: 'net', valor: 35 })];
    const pagamentos = [pago('renda', 600)]; // já paga: já saiu da conta
    expect(separarDespesasFixas(fixas, pagamentos, OUTUBRO).porDebitar).toBe(80.1);
  });

  it('uma despesa paga noutro mês volta a ficar por pagar', () => {
    expect(separarDespesasFixas([fixa({ id: 'renda' })], [pago('renda', 600, '2026-09')], OUTUBRO).porDebitar).toBe(600);
  });

  it('um pagamento parcial deixa só o que resta por pagar na previsão', () => {
    expect(
      separarDespesasFixas([fixa({ id: 'combustivel', valor: 100 })], [{ ...pago('combustivel', 40), parcial: true }], OUTUBRO)
    ).toEqual({ debitadas: 40, porDebitar: 60, total: 100 });
  });

  it('as despesas terminadas ou que ainda não começaram não contam', () => {
    const fixas = [fixa({ id: 'velha', fim: '2026-09' }), fixa({ id: 'nova', inicio: '2026-11' }), fixa({ id: 'atual', valor: 50 })];
    expect(separarDespesasFixas(fixas, [], OUTUBRO).porDebitar).toBe(50);
  });

  it('pagas: conta o valor pago (mesmo que a despesa tenha mudado de valor depois)', () => {
    const fixas = [fixa({ id: 'dentista', valor: 160 })];
    expect(separarDespesasFixas(fixas, [pago('dentista', 159.25)], OUTUBRO)).toEqual({ debitadas: 159.25, porDebitar: 0, total: 159.25 });
  });

  it('pagamentos de despesas entretanto terminadas continuam no histórico do mês', () => {
    const fixas = [fixa({ id: 'ginasio', valor: 20, fim: OUTUBRO })];
    expect(separarDespesasFixas(fixas, [pago('ginasio', 20)], OUTUBRO).debitadas).toBe(20);
  });

  it('reconhece os pagamentos guardados pela versão anterior na própria despesa', () => {
    const antiga = fixa({ id: 'renda', debitado: true, mesDebitado: OUTUBRO });
    expect(estadoNoMes(antiga, [], OUTUBRO)).toBe('pago');
    expect(separarDespesasFixas([antiga], [], OUTUBRO)).toEqual({ debitadas: 600, porDebitar: 0, total: 600 });
    // Não há "anulado": um pagamento desfeito na versão anterior fica só por pagar
    expect(estadoNoMes(fixa({ anuladoMes: OUTUBRO }), [], OUTUBRO)).toBe('por-pagar');
  });

  it('centimos acerta erros de vírgula flutuante', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(centimos(0.1 + 0.2)).toBe(0.3);
  });

  it('centimos nunca devolve -0 (que aparecia como "-0.00 €")', () => {
    expect(Object.is(centimos(0.3 - 0.1 - 0.2), 0)).toBe(true);
    expect(Object.is(centimos(-0.001), 0)).toBe(true);
    expect(centimos(NaN)).toBe(0);
  });
});

describe('PPR e Poupança', () => {
  it('percentagem do salário ou valor fixo', () => {
    expect(calcularPPRComConfig(config(), null, 1500)).toBe(150);
    expect(calcularPoupancaComConfig(config(), null, 1500)).toBe(200);
  });

  it('"0" é mesmo 0% e o campo vazio usa o valor por defeito', () => {
    expect(calcularPPRComConfig(config({ pprValor: '0' }), null, 1500)).toBe(0);
    expect(calcularPPRComConfig(config({ pprValor: '' }), null, 1000)).toBe(100);
    expect(calcularPoupancaComConfig(config({ poupancaTipo: 'percentagem', poupancaValor: '' }), null, 1000)).toBe(150);
  });

  it('sem configuração usa as percentagens da versão anterior', () => {
    expect(calcularPPRComConfig(null, antigo, 1000)).toBe(50);
    expect(calcularPoupancaComConfig(null, antigo, 1000)).toBe(200);
  });

  it('aceita vírgula decimal', () => {
    expect(calcularPPRComConfig(config({ pprValor: '12,5' }), null, 1000)).toBe(125);
  });

  it('descrição para os ecrãs', () => {
    expect(descricaoConfigurada('percentagem', '12,5', undefined, 10)).toBe('12.5%');
    expect(descricaoConfigurada('valor', '200', undefined, 10)).toBe('valor fixo');
    expect(descricaoConfigurada(undefined, undefined, '5', 10)).toBe('5%');
  });

  it('salário base: o configurado ou, se não houver, o antigo', () => {
    expect(valorSalarioBase({ valor: '1500', diaRecebimento: 25 }, antigo)).toBe(1500);
    expect(valorSalarioBase(null, antigo)).toBe(1000);
    expect(valorSalarioBase(null, null)).toBe(0);
  });
});

describe('dia do salário', () => {
  const salario: SalarioConfig = { valor: '1500', diaRecebimento: 25 };

  it('entra o salário e saem logo o PPR e a Poupança', () => {
    expect(calcularRecebimento(salario, config(), null)).toMatchObject({ salario: 1500, ppr: 150, poupanca: 200, liquido: 1150 });
  });

  it('dia 31 passa para o último dia dos meses mais curtos', () => {
    expect(diaEfetivo(31, new Date(2026, 8, 30, 9))).toBe(30); // setembro tem 30 dias
    expect(diaEfetivo(31, new Date(2026, 1, 28, 9))).toBe(28); // fevereiro de 2026 tem 28
    expect(diaEfetivo(31, new Date(2026, 9, 30, 9))).toBe(31); // outubro tem 31
    expect(diaEfetivo(31, new Date(2028, 1, 10))).toBe(29); // 2028 é bissexto
  });
});

describe('débito das despesas fixas', () => {
  it('à mão: a partir do dia de débito; sem dia definido, a qualquer altura', () => {
    expect(podeDebitar(1, outubro5)).toBe(true);
    expect(podeDebitar(5, outubro5)).toBe(true);
    expect(podeDebitar(6, outubro5)).toBe(false);
    expect(podeDebitar(undefined, outubro5)).toBe(true);
    expect(podeDebitar(31, new Date(2026, 8, 30))).toBe(true); // dia 31 em setembro passa para 30
  });

  it('automático: só com dia definido, já no dia, a contar este mês e sem registo este mês', () => {
    expect(deveDebitarAutomaticamente(fixa({ diaDebito: 1 }), [], outubro5)).toBe(true);
    expect(deveDebitarAutomaticamente(fixa({ diaDebito: 10 }), [], outubro5)).toBe(false);
    expect(deveDebitarAutomaticamente(fixa({ diaDebito: undefined }), [], outubro5)).toBe(false);
    expect(deveDebitarAutomaticamente(fixa({ id: 'f' }), [pago('f', 600)], outubro5)).toBe(false);
    expect(deveDebitarAutomaticamente(fixa({ fim: '2026-09' }), [], outubro5)).toBe(false);
    expect(deveDebitarAutomaticamente(fixa({ debitado: true, mesDebitado: OUTUBRO }), [], outubro5)).toBe(false);
  });

  it('automático: não volta a debitar um pagamento desfeito à mão este mês, mas no mês seguinte sim', () => {
    expect(deveDebitarAutomaticamente(fixa({ id: 'f', anuladoMes: OUTUBRO }), [], outubro5)).toBe(false);
    expect(deveDebitarAutomaticamente(fixa({ id: 'f', anuladoMes: OUTUBRO }), [], new Date(2026, 10, 5))).toBe(true);
  });

  it('despesa ativa no mês', () => {
    expect(ativaNoMes(fixa(), OUTUBRO)).toBe(true); // sem início (antiga): conta sempre
    expect(ativaNoMes(fixa({ inicio: '2026-10' }), '2026-09')).toBe(false);
    expect(ativaNoMes(fixa({ inicio: '2026-10', fim: '2026-12' }), '2026-12')).toBe(true);
    expect(ativaNoMes(fixa({ fim: '2026-12' }), '2027-01')).toBe(false);
  });
});

describe('totais da folha do mês (como no livro Excel)', () => {
  it('Sobra, Total para extras, Total e Previsão', () => {
    const totais = totaisFolha({
      mes: OUTUBRO,
      lucro: [{ titulo: 'Ordenado', valor: 1276 }, { titulo: 'Alimen.', valor: 180, informativo: true }],
      despesas: [{ titulo: 'Carro', valor: 162 }, { titulo: 'Dentista', valor: 159.25 }, { titulo: 'Ginásio', valor: 20 }],
      poupanca: [{ titulo: 'Revolut/C.A', valor: 600 }, { titulo: 'PPR', valor: 50 }],
      despesasMes: [{ titulo: 'Jantar', valor: 30 }],
      anual: [{ titulo: 'Seguro Carro', valor: 715.2 }],
      saldoConta: 2000,
      falta: [{ titulo: 'Dentista', valor: 159.25 }, { titulo: 'Ginásio', valor: 20 }],
      saldoPoupanca: [{ titulo: 'Revolut', valor: 2000 }, { titulo: 'PPR', valor: 300 }],
      totalAPagar: [{ titulo: 'Carro', valor: 7179 }],
    });
    expect(totais).toEqual({
      lucro: 1276, // o cartão de alimentação não conta
      despesas: 341.25,
      poupanca: 650,
      despesasMes: 30,
      anual: 715.2,
      sobra: 934.75,
      totalParaExtras: 284.75,
      total: 254.75,
      falta: 179.25,
      previsao: 1820.75,
      saldoPoupanca: 2300,
      totalAPagar: 7179,
    });
  });

  it('sem Saldo Conta não há previsão', () => {
    const vazio = { mes: OUTUBRO, lucro: [], despesas: [], poupanca: [], despesasMes: [], anual: [], falta: [], saldoPoupanca: [], totalAPagar: [] };
    expect(totaisFolha(vazio).previsao).toBeNull();
    expect(totaisFolha(vazio).total).toBe(0);
  });
});


// Antes em __tests__/fase2.test.ts (o resto desse ficheiro passou para a API: backend/tests)
describe('fase 2: poupanças em lista, despesas anuais e dívidas', () => {
  const poupanca = (campos: Partial<Poupanca>): Poupanca => ({ id: 'p', nome: 'Revolut/C.A', tipo: 'valor', valor: '600', saldo: 0, ...campos });

  it('contribuição: valor fixo ou percentagem do salário', () => {
    expect(contribuicaoDe(poupanca({}), 1276)).toBe(600);
    expect(contribuicaoDe(poupanca({ tipo: 'percentagem', valor: '10' }), 1276)).toBe(127.6);
    expect(contribuicaoDe(poupanca({ valor: '50,5' }), 1276)).toBe(50.5);
  });

  it('dia do salário com a lista de poupanças', () => {
    const lista = [poupanca({ id: 'rev' }), poupanca({ id: 'ppr', nome: 'PPR', valor: '50' })];
    expect(calcularRecebimento({ valor: '1276', diaRecebimento: 25 }, null, null, lista)).toEqual({
      salario: 1276,
      ppr: 50,
      poupanca: 600,
      liquido: 626,
      contribuicoes: [
        { poupancaId: 'rev', nome: 'Revolut/C.A', valor: 600 },
        { poupancaId: 'ppr', nome: 'PPR', valor: 50 },
      ],
    });
  });

  it('no salário só desconta contribuições automáticas configuradas para esse dia', () => {
    const lista = [
      poupanca({ id: 'automatica' }),
      poupanca({ id: 'manual', nome: 'Manual', contribuicaoAutomatica: false }),
      poupanca({ id: 'dia-fixo', nome: 'Dia fixo', diaContribuicao: 10 }),
    ];
    expect(calcularRecebimento({ valor: '1276', diaRecebimento: 25 }, null, null, lista)).toMatchObject({
      salario: 1276,
      poupanca: 600,
      liquido: 676,
      contribuicoes: [{ poupancaId: 'automatica', nome: 'Revolut/C.A', valor: 600 }],
    });
  });

  it('despesas anuais só contam no seu mês', () => {
    const seguro: Despesa = { id: 's', titulo: 'Seguro Carro', valor: 715.2, periodicidade: 'anual', mesAnual: 3, inicio: '2026-01' };
    expect(ativaNoMes(seguro, '2026-03')).toBe(true);
    expect(ativaNoMes(seguro, '2027-03')).toBe(true);
    expect(ativaNoMes(seguro, '2026-04')).toBe(false);
    expect(ativaNoMes({ ...seguro, mesAnual: undefined }, '2026-03')).toBe(false); // mês por escolher
  });

  it('dívida: o valor em falta desce com as prestações pagas desde o registo', () => {
    const carro: Divida = { id: 'd', titulo: 'Carro', valorInicial: 7179, desde: '2026-10', fixaId: 'prest' };
    const p = (mes: string): PagamentoFixa => ({
      id: `${mes}_prest`, fixaId: 'prest', mes, titulo: 'Carro', valor: 162, data: `${mes}-01`, estado: 'pago',
    });
    expect(calcularDivida(carro, [p('2026-09'), p('2026-10'), p('2026-11')], 162)).toEqual({
      emFalta: 6855, pago: 324, mesesEmFalta: 43, // 6855 / 162 = 42.3 -> 43 prestações
    });
    expect(calcularDivida({ ...carro, fixaId: undefined }, [], undefined)).toEqual({ emFalta: 7179, pago: 0, mesesEmFalta: null });
    expect(calcularDivida({ ...carro, valorInicial: 100 }, [p('2026-10')], 162).emFalta).toBe(0); // nunca negativo
  });
});

describe('dias úteis do mês (cartão de alimentação por dia útil)', () => {
  it('conta de segunda a sexta, como o backend', () => {
    expect(diasUteisDoMes(new Date(2026, 9, 15))).toBe(22); // outubro de 2026
    expect(diasUteisDoMes(new Date(2026, 10, 1))).toBe(21); // novembro: começa ao domingo
    expect(diasUteisDoMes(new Date(2026, 1, 10))).toBe(20); // fevereiro de 28 dias
    expect(diasUteisDoMes(new Date(2028, 1, 10))).toBe(21); // fevereiro bissexto
  });

  it('a previsão do mês é o valor por dia vezes os dias úteis, ao cêntimo', () => {
    expect(centimos(7.5 * diasUteisDoMes(new Date(2026, 9, 1)))).toBe(165);
    expect(centimos(7.33 * diasUteisDoMes(new Date(2026, 10, 1)))).toBe(153.93);
  });
});
