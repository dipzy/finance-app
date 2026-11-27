import { idPagamento } from '../services/calculos';
import type { Despesa, PagamentoFixa, SalarioConfig } from '../services/tipos';
import { calcularLembretes, descreverProximo, Lembrete, OpcoesLembretes, PREFIXO_LEMBRETE } from '../utils/lembretes';

// O que a app agenda como notificação (utils/lembretes.ts): véspera e dia das despesas por pagar e dia do salário

const fixa = (id: string, campos: Partial<Despesa> = {}): Despesa => ({ id, titulo: id, valor: 10, ...campos });

const pagamento = (fixaId: string, mes: string, estado: PagamentoFixa['estado'] = 'pago'): PagamentoFixa => ({
  id: idPagamento(mes, fixaId),
  fixaId,
  mes,
  titulo: fixaId,
  valor: 10,
  data: `${mes}-03`,
  estado,
});

const SO_VESPERA: OpcoesLembretes = { noProprioDia: false, salario: false };
const COM_DIA: OpcoesLembretes = { noProprioDia: true, salario: false };

// "2026-10-09 09:00" (hora local, como o Date que se agenda)
const quando = (l: Lembrete) => {
  const d = l.data;
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
};

const lembretes = (
  fixas: Despesa[],
  agora: Date,
  opcoes: OpcoesLembretes = SO_VESPERA,
  pagamentos: Record<string, PagamentoFixa[]> = {},
  salario: SalarioConfig | null = null
) => calcularLembretes({ fixas, pagamentos, salario }, opcoes, agora);

const outubro5 = new Date(2026, 9, 5, 12, 0);

describe('calcularLembretes: despesas fixas', () => {
  it('lembra na véspera às 9h, este mês e o próximo', () => {
    const r = lembretes([fixa('Renda', { valor: 550, diaDebito: 10 })], outubro5);
    expect(r.map(quando)).toEqual(['2026-10-09 09:00', '2026-11-09 09:00']);
    expect(r[0]).toMatchObject({
      tipo: 'vespera',
      titulo: 'Renda sai amanhã — 550,00 €',
      corpo: 'Despesa mensal ainda por pagar. Confirma que tens saldo na conta.',
    });
  });

  it('com "no próprio dia" também lembra no dia do débito', () => {
    const r = lembretes([fixa('Renda', { valor: 550, diaDebito: 10 })], outubro5, COM_DIA);
    expect(r.map(quando)).toEqual(['2026-10-09 09:00', '2026-10-10 09:00', '2026-11-09 09:00', '2026-11-10 09:00']);
    expect(r[1]).toMatchObject({ tipo: 'dia', titulo: 'Renda sai hoje — 550,00 €' });
  });

  it('não lembra o que já foi pago nesse mês (o mês seguinte continua)', () => {
    const r = lembretes([fixa('Renda', { diaDebito: 10 }), fixa('Luz', { diaDebito: 12 })], outubro5, SO_VESPERA, {
      '2026-10': [pagamento('Renda', '2026-10'), pagamento('Luz', '2026-10')],
    });
    expect(r.map(quando)).toEqual(['2026-11-09 09:00', '2026-11-11 09:00']);
  });

  it('o que já passou fica de fora (inclui hoje depois das 9h)', () => {
    const r = lembretes([fixa('Renda', { diaDebito: 5 }), fixa('Luz', { diaDebito: 6 })], outubro5, COM_DIA);
    // Renda: véspera a 4 e dia 5 às 9h já passaram. Luz: véspera hoje às 9h já passou, dia 6 ainda não
    expect(r.filter((l) => l.data.getMonth() === 9).map(quando)).toEqual(['2026-10-06 09:00']);
  });

  it('hoje antes das 9h ainda lembra a véspera de amanhã', () => {
    const r = lembretes([fixa('Luz', { diaDebito: 6 })], new Date(2026, 9, 5, 8, 59));
    expect(quando(r[0])).toBe('2026-10-05 09:00');
  });

  it('dia 31 em meses mais curtos passa para o último dia (e a véspera é a anterior)', () => {
    const r = lembretes([fixa('Seguro', { diaDebito: 31 })], outubro5, COM_DIA);
    expect(r.map(quando)).toEqual(['2026-10-30 09:00', '2026-10-31 09:00', '2026-11-29 09:00', '2026-11-30 09:00']);
  });

  it('fevereiro: dia 30 passa para 28 (e 29 nos anos bissextos)', () => {
    const fixas = [fixa('Ginásio', { diaDebito: 30 })];
    expect(lembretes(fixas, new Date(2027, 1, 1, 12), COM_DIA).slice(0, 2).map(quando)).toEqual([
      '2027-02-27 09:00',
      '2027-02-28 09:00',
    ]);
    expect(lembretes(fixas, new Date(2028, 1, 1, 12), COM_DIA).slice(0, 2).map(quando)).toEqual([
      '2028-02-28 09:00',
      '2028-02-29 09:00',
    ]);
  });

  it('a véspera do dia 1 é o último dia do mês anterior', () => {
    const fixas = [fixa('Renda', { diaDebito: 1 })];
    expect(lembretes(fixas, new Date(2026, 9, 31, 8)).map(quando)).toEqual(['2026-10-31 09:00']);
    // Já passou das 9h do último dia: só o lembrete do próprio dia, se ligado
    expect(lembretes(fixas, new Date(2026, 9, 31, 10)).map(quando)).toEqual([]);
    expect(lembretes(fixas, new Date(2026, 9, 31, 10), COM_DIA).map(quando)).toEqual(['2026-11-01 09:00']);
  });

  it('de dezembro para janeiro muda o ano', () => {
    const r = lembretes([fixa('Renda', { diaDebito: 8 })], new Date(2026, 11, 20, 12));
    expect(r.map(quando)).toEqual(['2027-01-07 09:00']);
    expect(r[0].id).toBe(`${PREFIXO_LEMBRETE}-vespera-2027-01-08`);
  });

  it('as anuais só no seu mês', () => {
    const r = lembretes([fixa('IUC', { valor: 120, diaDebito: 15, periodicidade: 'anual', mesAnual: 11 })], outubro5);
    expect(r.map(quando)).toEqual(['2026-11-14 09:00']);
    expect(r[0].corpo).toBe('Despesa anual ainda por pagar. Confirma que tens saldo na conta.');
  });

  it('respeita o início e o fim das despesas', () => {
    const r = lembretes(
      [fixa('Antiga', { diaDebito: 20, fim: '2026-10' }), fixa('Nova', { diaDebito: 20, inicio: '2026-11' })],
      outubro5
    );
    expect(r.map((l) => `${quando(l)} ${l.titulo}`)).toEqual([
      '2026-10-19 09:00 Antiga sai amanhã — 10,00 €',
      '2026-11-19 09:00 Nova sai amanhã — 10,00 €',
    ]);
  });

  it('sem dia de débito não há lembrete', () => {
    expect(lembretes([fixa('Sem dia')], outubro5)).toEqual([]);
  });

  it('várias no mesmo dia dão uma só notificação, com o total', () => {
    const r = lembretes(
      [
        fixa('Renda', { valor: 550, diaDebito: 10 }),
        fixa('Internet', { valor: 40, diaDebito: 10 }),
        fixa('Ginásio', { valor: 30.5, diaDebito: 10 }),
      ],
      outubro5
    ).filter((l) => l.data.getMonth() === 9);
    expect(r).toHaveLength(1);
    expect(r[0].titulo).toBe('3 despesas saem amanhã — 620,50 €');
    expect(r[0].corpo).toBe('Ginásio (30,50 €), Internet (40,00 €) e Renda (550,00 €).');
  });

  it('os ids são estáveis e únicos (reagendar substitui em vez de duplicar)', () => {
    const fixas = [fixa('A', { diaDebito: 3 }), fixa('B', { diaDebito: 20 }), fixa('C', { diaDebito: 31 })];
    const salario: SalarioConfig = { valor: '1500', diaRecebimento: 25 };
    const opcoes = { noProprioDia: true, salario: true };
    const r1 = calcularLembretes({ fixas, pagamentos: {}, salario }, opcoes, outubro5);
    const r2 = calcularLembretes({ fixas, pagamentos: {}, salario }, opcoes, new Date(2026, 9, 5, 12, 30));
    expect(r1.map((l) => l.id)).toEqual(r2.map((l) => l.id));
    expect(new Set(r1.map((l) => l.id)).size).toBe(r1.length);
    expect(r1.every((l) => l.id.startsWith(PREFIXO_LEMBRETE))).toBe(true);
  });

  it('ficam por ordem de data', () => {
    const r = lembretes([fixa('B', { diaDebito: 20 }), fixa('A', { diaDebito: 8 })], outubro5);
    const tempos = r.map((l) => l.data.getTime());
    expect(tempos).toEqual([...tempos].sort((a, b) => a - b));
  });
});

describe('calcularLembretes: salário', () => {
  const opcoes = { noProprioDia: false, salario: true };

  it('no dia de recebimento às 9h, este mês e o próximo', () => {
    const r = lembretes([], outubro5, opcoes, {}, { valor: '1500', diaRecebimento: 25 });
    expect(r.map(quando)).toEqual(['2026-10-25 09:00', '2026-11-25 09:00']);
    expect(r[0]).toMatchObject({
      tipo: 'salario',
      titulo: 'Hoje é dia de salário',
      corpo: 'O salário (1500,00 €) entra na conta quando abrires a app.',
    });
  });

  it('dia 31 em novembro passa para 30', () => {
    const r = lembretes([], outubro5, opcoes, {}, { valor: '1500', diaRecebimento: 31 });
    expect(r.map(quando)).toEqual(['2026-10-31 09:00', '2026-11-30 09:00']);
  });

  it('já recebido este mês: só o do mês seguinte', () => {
    const r = lembretes([], outubro5, opcoes, {}, { valor: '1500', diaRecebimento: 25, lastReceived: '2026-10-02T10:00:00' });
    expect(r.map(quando)).toEqual(['2026-11-25 09:00']);
  });

  it('desligado nas definições ou sem salário configurado: nada', () => {
    expect(lembretes([], outubro5, SO_VESPERA, {}, { valor: '1500', diaRecebimento: 25 })).toEqual([]);
    expect(lembretes([], outubro5, opcoes, {}, null)).toEqual([]);
  });
});

describe('descreverProximo', () => {
  it('conta os lembretes e diz quando é o próximo', () => {
    const r = lembretes([fixa('Renda', { diaDebito: 10 })], outubro5);
    expect(descreverProximo(r)).toBe('2 lembretes agendados · o próximo a 09/10 às 09:00.');
    expect(descreverProximo(r.slice(0, 1))).toBe('1 lembrete agendado · o próximo a 09/10 às 09:00.');
    expect(descreverProximo([])).toBe('Sem lembretes agendados para já.');
  });
});
