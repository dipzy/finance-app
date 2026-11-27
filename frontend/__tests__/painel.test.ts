import { idPagamento, totaisFolha } from '../services/calculos';
import type { DadosFolhaMes, Despesa, PagamentoFixa } from '../services/tipos';
import {
  distribuicaoSalario,
  mesesEmAtraso,
  numerosDoMes,
  pagamentosEmAtraso,
  percentagemDe,
  proximosPagamentos,
  textoQuando,
  ultimasDespesas,
} from '../utils/painel';

// O painel do Início e o gráfico do Resumo do mês (utils/painel.ts)

const outubro5 = new Date(2026, 9, 5, 12);
const OUTUBRO = '2026-10';

const folha = (campos: Partial<DadosFolhaMes> = {}): DadosFolhaMes => ({
  mes: OUTUBRO,
  lucro: [],
  despesas: [],
  poupanca: [],
  despesasMes: [],
  anual: [],
  falta: [],
  saldoPoupanca: [],
  totalAPagar: [],
  ...campos,
});

const fixa = (id: string, campos: Partial<Despesa> = {}): Despesa => ({ id, titulo: id, valor: 10, ...campos });

const pagamento = (fixaId: string, campos: Partial<PagamentoFixa> = {}): PagamentoFixa => ({
  id: idPagamento(campos.mes ?? OUTUBRO, fixaId),
  fixaId,
  mes: OUTUBRO,
  titulo: fixaId,
  valor: 10,
  data: `${campos.mes ?? OUTUBRO}-03`,
  estado: 'pago',
  ...campos,
});

describe('números do mês (cartão "Este mês")', () => {
  const exemplo = folha({
    lucro: [
      { titulo: 'Ordenado', valor: 1500 },
      { titulo: 'Alimen.', valor: 160, informativo: true },
    ],
    despesas: [
      { titulo: 'Renda', valor: 600 },
      { titulo: 'Ginásio', valor: 30.1 },
    ],
    poupanca: [
      { titulo: 'PPR', valor: 150 },
      { titulo: 'Revolut', valor: 100.2 },
    ],
    despesasMes: [
      { titulo: 'Jantar', valor: 45.5, data: '2026-10-02' },
      { titulo: 'Farmácia', valor: 12.3, data: '2026-10-04' },
    ],
    anual: [{ titulo: 'Seguro', valor: 300 }],
  });

  it('entrou sem o cartão de alimentação, gasto = mensais + extras, poupado e o Total da folha', () => {
    expect(numerosDoMes(exemplo)).toEqual({ entrou: 1500, gasto: 687.9, poupado: 250.2, total: 561.9 });
  });

  it('são os mesmos totais da folha (o Resumo do mês mostra os mesmos números)', () => {
    const t = totaisFolha(exemplo);
    const n = numerosDoMes(exemplo);
    expect(n.entrou).toBe(t.lucro);
    expect(n.poupado).toBe(t.poupanca);
    expect(n.total).toBe(t.total);
    expect(n.gasto).toBe(Math.round((t.despesas + t.despesasMes) * 100) / 100);
    // Entrou - Gasto - Poupado = Total, ao cêntimo
    expect(Math.round((n.entrou - n.gasto - n.poupado) * 100) / 100).toBe(n.total);
  });

  it('o bloco Anual é informativo e não entra no gasto', () => {
    expect(numerosDoMes(exemplo).gasto).toBe(numerosDoMes(folha({ ...exemplo, anual: [] })).gasto);
  });

  it('somas de decimais ficam ao cêntimo', () => {
    const n = numerosDoMes(folha({ despesas: [{ titulo: 'a', valor: 0.1 }], despesasMes: [{ titulo: 'b', valor: 0.2 }] }));
    expect(n.gasto).toBe(0.3);
  });

  it('mês sem nada: tudo a zero', () => {
    expect(numerosDoMes(folha())).toEqual({ entrou: 0, gasto: 0, poupado: 0, total: 0 });
  });

  it('sem salário o Total fica negativo (como na folha)', () => {
    expect(numerosDoMes(folha({ despesas: [{ titulo: 'Renda', valor: 600 }] })).total).toBe(-600);
  });
});

describe('distribuição do salário (gráfico do Resumo do mês)', () => {
  it('fatias com os blocos da folha; o Livre é o Total da folha', () => {
    const d = distribuicaoSalario(
      folha({
        lucro: [
          { titulo: 'Ordenado', valor: 1000 },
          { titulo: 'Alimen.', valor: 160, informativo: true },
        ],
        poupanca: [{ titulo: 'PPR', valor: 100 }],
        despesas: [{ titulo: 'Renda', valor: 500 }],
        despesasMes: [{ titulo: 'Jantar', valor: 50 }],
      })
    );
    expect(d.salario).toBe(1000);
    expect(d.entraNaConta).toBe(900);
    expect(d.fatias).toEqual([
      { chave: 'poupancas', nome: 'Poupanças', valor: 100 },
      { chave: 'despesas', nome: 'Despesas fixas', valor: 500 },
      { chave: 'extras', nome: 'Gastos do dia a dia', valor: 50 },
      { chave: 'livre', nome: 'Livre', valor: 350 },
    ]);
  });

  it('sem sobra não há fatia Livre', () => {
    const d = distribuicaoSalario(
      folha({ lucro: [{ titulo: 'Ordenado', valor: 500 }], despesas: [{ titulo: 'Renda', valor: 600 }] })
    );
    expect(d.fatias.map((f) => f.chave)).toEqual(['poupancas', 'despesas', 'extras']);
  });

  it('percentagem no salário entre 0 e 100 (sem salário, 0)', () => {
    expect(percentagemDe(250, 1000)).toBe(25);
    expect(percentagemDe(1500, 1000)).toBe(100);
    expect(percentagemDe(-10, 1000)).toBe(0);
    expect(percentagemDe(50, 0)).toBe(0);
  });
});

describe('próximos pagamentos', () => {
  it('só as por pagar (sem as pagas), pelo dia de débito', () => {
    const fixas = [
      fixa('Ginásio', { diaDebito: 20, valor: 30 }),
      fixa('Renda', { diaDebito: 8, valor: 600 }),
      fixa('Luz', { diaDebito: 1, valor: 45 }),
      fixa('Água', { diaDebito: 12, valor: 20 }),
      fixa('Net', { diaDebito: 10, valor: 35 }),
    ];
    const pagamentos = [pagamento('Luz', { valor: 45 }), pagamento('Água', { valor: 20 })];
    const r = proximosPagamentos(fixas, pagamentos, OUTUBRO, outubro5);
    expect(r.pagamentos.map((p) => [p.dia, p.titulo, p.valor])).toEqual([
      [8, 'Renda', 600],
      [10, 'Net', 35],
      [20, 'Ginásio', 30],
    ]);
    expect(r.total).toBe(665);
  });

  it('dia 29-31 passa para o último dia nos meses mais curtos, e conta assim na ordem', () => {
    const fixas = [fixa('Seguro', { diaDebito: 31 }), fixa('Carro', { diaDebito: 29 }), fixa('Telemóvel', { diaDebito: 27 })];
    const fevereiro = proximosPagamentos(fixas, [], '2027-02', new Date(2027, 1, 1, 12));
    expect(fevereiro.pagamentos.map((p) => [p.dia, p.titulo])).toEqual([
      [27, 'Telemóvel'],
      // As duas no dia 28: por ordem alfabética
      [28, 'Carro'],
      [28, 'Seguro'],
    ]);
    const setembro = proximosPagamentos(fixas, [], '2026-09', new Date(2026, 8, 1, 12));
    expect(setembro.pagamentos.map((p) => p.dia)).toEqual([27, 29, 30]);
  });

  it('as despesas antigas sem dia de débito ficam no fim', () => {
    const fixas = [fixa('Antiga'), fixa('Renda', { diaDebito: 25 }), fixa('Luz', { diaDebito: 6 })];
    const r = proximosPagamentos(fixas, [], OUTUBRO, outubro5);
    expect(r.pagamentos.map((p) => [p.titulo, p.dia])).toEqual([
      ['Luz', 6],
      ['Renda', 25],
      ['Antiga', undefined],
    ]);
  });

  it('as anuais só contam no seu mês (e vêm marcadas como anuais)', () => {
    const fixas = [
      fixa('Seguro carro', { periodicidade: 'anual', mesAnual: 10, diaDebito: 15, valor: 300 }),
      fixa('Via Verde', { periodicidade: 'anual', mesAnual: 3, diaDebito: 2, valor: 50 }),
      fixa('IUC', { periodicidade: 'anual', valor: 120 }), // sem mês escolhido: não conta em nenhum
      fixa('Renda', { diaDebito: 8, valor: 600 }),
    ];
    const r = proximosPagamentos(fixas, [], OUTUBRO, outubro5);
    expect(r.pagamentos.map((p) => [p.titulo, p.anual])).toEqual([
      ['Renda', false],
      ['Seguro carro', true],
    ]);
    expect(r.total).toBe(900);
  });

  it('não mostra despesas que ainda não começaram ou já terminaram, nem pagas na versão anterior', () => {
    const fixas = [
      fixa('Futura', { diaDebito: 9, inicio: '2026-11' }),
      fixa('Terminada', { diaDebito: 9, fim: '2026-09' }),
      fixa('Paga antes', { diaDebito: 9, debitado: true, mesDebitado: OUTUBRO }),
      fixa('Último mês', { diaDebito: 9, fim: OUTUBRO }),
    ];
    expect(proximosPagamentos(fixas, [], OUTUBRO, outubro5).pagamentos.map((p) => p.titulo)).toEqual(['Último mês']);
  });

  it('em atraso, hoje e daqui a quantos dias (no mês atual)', () => {
    const fixas = [fixa('Atrasada', { diaDebito: 3 }), fixa('Hoje', { diaDebito: 5 }), fixa('Amanhã', { diaDebito: 6 }), fixa('Depois', { diaDebito: 15 })];
    const r = proximosPagamentos(fixas, [], OUTUBRO, outubro5);
    expect(r.pagamentos.map((p) => [p.titulo, p.quando, p.emDias])).toEqual([
      ['Atrasada', 'atrasado', -2],
      ['Hoje', 'hoje', 0],
      ['Amanhã', 'proximo', 1],
      ['Depois', 'proximo', 10],
    ]);
    expect(r.pagamentos.map(textoQuando)).toEqual(['Em atraso', 'Hoje', 'Amanhã', 'Daqui a 10 dias']);
  });

  it('noutros meses: os passados estão em atraso e os futuros mostram só o dia', () => {
    const fixas = [fixa('Renda', { diaDebito: 8 })];
    const passado = proximosPagamentos(fixas, [], '2026-09', outubro5).pagamentos[0];
    expect([passado.quando, passado.emDias]).toEqual(['atrasado', undefined]);
    const futuro = proximosPagamentos(fixas, [], '2026-11', outubro5).pagamentos[0];
    expect([futuro.quando, futuro.emDias, textoQuando(futuro)]).toEqual(['proximo', undefined, 'Dia 8']);
  });

  it('sem nada por pagar: lista vazia e total 0', () => {
    const fixas = [fixa('Renda', { diaDebito: 1 })];
    expect(proximosPagamentos(fixas, [pagamento('Renda')], OUTUBRO, outubro5)).toEqual({ pagamentos: [], total: 0 });
    expect(proximosPagamentos([], [], OUTUBRO, outubro5)).toEqual({ pagamentos: [], total: 0 });
  });

  it('texto de uma despesa sem dia de débito', () => {
    expect(textoQuando({ dia: undefined, quando: 'proximo' })).toBe('Sem dia de débito');
  });
});

describe('despesas em atraso de meses anteriores', () => {
  const desde = (id: string, inicio: string, campos: Partial<Despesa> = {}) => fixa(id, { inicio, ...campos });

  it('verifica os 3 meses anteriores ao de hoje, do mais antigo para o mais recente', () => {
    expect(mesesEmAtraso(outubro5)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(mesesEmAtraso(new Date(2027, 0, 10, 12))).toEqual(['2026-10', '2026-11', '2026-12']);
  });

  it('só entra o que ficou por pagar, com o mês a que pertence, e não conta o mês de hoje', () => {
    const fixas = [desde('Renda', '2026-01', { diaDebito: 5, valor: 600 }), desde('Luz', '2026-01', { diaDebito: 10, valor: 45 })];
    const pagamentos = {
      '2026-09': [pagamento('Luz', { mes: '2026-09', valor: 45 })],
      '2026-08': [pagamento('Renda', { mes: '2026-08', valor: 600 }), pagamento('Luz', { mes: '2026-08', valor: 45 })],
      '2026-07': [pagamento('Renda', { mes: '2026-07', valor: 600 }), pagamento('Luz', { mes: '2026-07', valor: 45 })],
    };
    const r = pagamentosEmAtraso(fixas, pagamentos, outubro5);
    expect(r.pagamentos.map((p) => [p.mes, p.titulo, p.valor, p.quando])).toEqual([['2026-09', 'Renda', 600, 'atrasado']]);
    expect(r.total).toBe(600);
    expect(r.pagamentos[0].fixaId).toBe('Renda');
  });

  it('do mais antigo para o mais recente e, em cada mês, pelo dia de débito', () => {
    const fixas = [desde('Luz', '2026-01', { diaDebito: 20 }), desde('Renda', '2026-01', { diaDebito: 5 })];
    const r = pagamentosEmAtraso(fixas, {}, outubro5);
    expect(r.pagamentos.map((p) => `${p.mes} ${p.titulo}`)).toEqual([
      '2026-07 Renda',
      '2026-07 Luz',
      '2026-08 Renda',
      '2026-08 Luz',
      '2026-09 Renda',
      '2026-09 Luz',
    ]);
  });

  it('mais antigo do que 3 meses já não conta, nem antes de a despesa existir', () => {
    const fixas = [desde('Nova', '2026-09'), desde('Velha', '2026-01', { fim: '2026-06' })];
    const r = pagamentosEmAtraso(fixas, {}, outubro5);
    expect(r.pagamentos.map((p) => [p.mes, p.titulo])).toEqual([['2026-09', 'Nova']]);
  });

  it('um pagamento parcial não é atraso: o que sobrou não passa para o mês seguinte', () => {
    const fixas = [desde('Combustível', '2026-01', { valor: 100 })];
    const parcial = { '2026-09': [pagamento('Combustível', { mes: '2026-09', valor: 70, parcial: true })] };
    const r = pagamentosEmAtraso(fixas, parcial, outubro5);
    expect(r.pagamentos.filter((p) => p.mes === '2026-09')).toEqual([]);
  });

  it('as despesas antigas, sem mês de início, não entram (não se sabe desde quando contam)', () => {
    expect(pagamentosEmAtraso([fixa('Antiga')], {}, outubro5)).toEqual({ pagamentos: [], total: 0 });
  });

  it('as anuais só aparecem no seu mês', () => {
    const fixas = [desde('Seguro', '2025-01', { periodicidade: 'anual', mesAnual: 8, valor: 300 })];
    const r = pagamentosEmAtraso(fixas, {}, outubro5);
    expect(r.pagamentos.map((p) => [p.mes, p.titulo, p.anual])).toEqual([['2026-08', 'Seguro', true]]);
  });
});

describe('últimas gastos do dia a dia', () => {
  const extra = (id: string, data?: string): Despesa => ({ id, titulo: id, valor: 1, data });

  it('as 3 mais recentes, da mais nova para a mais antiga', () => {
    const extras = [extra('a', '2026-10-01'), extra('b', '2026-10-04'), extra('c', '2026-10-02'), extra('d', '2026-10-03')];
    expect(ultimasDespesas(extras).map((d) => d.id)).toEqual(['b', 'd', 'c']);
  });

  it('no mesmo dia mantém a ordem recebida (a última registada primeiro)', () => {
    const extras = [extra('nova', '2026-10-04'), extra('velha', '2026-10-04'), extra('antes', '2026-10-01')];
    expect(ultimasDespesas(extras).map((d) => d.id)).toEqual(['nova', 'velha', 'antes']);
  });

  it('lê as datas das versões antigas (dd/mm/aaaa); sem data vão para o fim', () => {
    const extras = [extra('sem'), extra('antiga', '03/10/2026'), extra('nova', '2026-10-02')];
    expect(ultimasDespesas(extras, 5).map((d) => d.id)).toEqual(['antiga', 'nova', 'sem']);
  });

  it('não mexe na lista original', () => {
    const extras = [extra('a', '2026-10-01'), extra('b', '2026-10-04')];
    ultimasDespesas(extras);
    expect(extras.map((d) => d.id)).toEqual(['a', 'b']);
  });
});
