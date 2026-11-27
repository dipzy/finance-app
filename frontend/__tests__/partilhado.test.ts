// As contas da divisão no telemóvel (utils/partilhado.ts): têm de dar o mesmo que a API
// (Financas.Services/Regras/Partilhado.cs, testada em PartilhadoRegrasTests)
import type { AtividadeDto } from '../services/partilhado';
import { contarPendentes, dividir, mesmaDivisao, pendentesDoGrupo, textoEfeito, textoSaldo, textoTransferencia } from '../utils/partilhado';

const valores = (r: ReturnType<typeof dividir>) => ('partes' in r ? r.partes.map((p) => p.valor) : r.erro);

describe('dividir', () => {
  it('partes iguais: os cêntimos que sobram vão para os primeiros', () => {
    expect(valores(dividir(10, 'igual', [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }]))).toEqual([3.34, 3.33, 3.33]);
  });

  it('percentagem tem de somar 100', () => {
    expect(valores(dividir(80, 'percentagem', [{ uid: 'a', peso: 75 }, { uid: 'b', peso: 25 }]))).toEqual([60, 20]);
    expect(valores(dividir(80, 'percentagem', [{ uid: 'a', peso: 70 }, { uid: 'b', peso: 20 }]))).toBe(
      'As percentagens somam 90% (têm de dar 100%).'
    );
  });

  it('valores têm de dar o total e dizem quanto falta', () => {
    expect(valores(dividir(50, 'valores', [{ uid: 'a', peso: 30.5 }, { uid: 'b', peso: 19.5 }]))).toEqual([30.5, 19.5]);
    expect(valores(dividir(50, 'valores', [{ uid: 'a', peso: 30 }, { uid: 'b', peso: 10 }]))).toBe('As partes somam 40.00 €; faltam 10.00 €.');
  });

  it('partes pelo peso, ao cêntimo', () => {
    expect(valores(dividir(100, 'partes', [{ uid: 'a', peso: 2 }, { uid: 'b', peso: 1 }]))).toEqual([66.67, 33.33]);
  });

  it('sem valor, sem pessoas ou com peso zero dá erro', () => {
    expect('erro' in dividir(0, 'igual', [{ uid: 'a' }])).toBe(true);
    expect('erro' in dividir(10, 'igual', [])).toBe(true);
    expect('erro' in dividir(10, 'partes', [{ uid: 'a', peso: 0 }])).toBe(true);
  });

  it('a soma das partes é sempre o total (sem erros de vírgula flutuante)', () => {
    for (const total of [0.01, 0.1, 1.11, 33.33, 99.99, 1234.56]) {
      const r = dividir(total, 'igual', [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }, { uid: 'd' }, { uid: 'e' }, { uid: 'f' }, { uid: 'g' }]);
      if (!('partes' in r)) throw new Error(r.erro);
      expect(Math.round(r.partes.reduce((s, p) => s + p.valor, 0) * 100)).toBe(Math.round(total * 100));
    }
  });
});

describe('textos', () => {
  it('saldo, pagamento sugerido e efeito do meu ponto de vista', () => {
    expect(textoSaldo(12)).toBe('Recebes 12.00 €');
    expect(textoSaldo(-3.5)).toBe('Deves 3.50 €');
    expect(textoSaldo(0)).toBe('Contas certas');

    const tr = { deUid: 'eu', deNome: 'Eu', paraUid: 'ana', paraNome: 'Ana', valor: 10 };
    expect(textoTransferencia(tr, 'eu')).toBe('Pagas 10.00 € a Ana');
    expect(textoTransferencia(tr, 'ana')).toBe('Eu paga-te 10.00 €');
    expect(textoTransferencia(tr, 'rui')).toBe('Eu paga 10.00 € a Ana');

    expect(textoEfeito(60, true)).toBe('emprestaste 60.00 €');
    expect(textoEfeito(-30, true)).toBe('deves 30.00 €');
    expect(textoEfeito(0, false)).toBe('não entras');
  });
});

describe('mesmaDivisao', () => {
  const base = { grupoId: 'g', modo: 'igual' as const, participantes: [{ uid: 'a' }, { uid: 'b' }] };

  it('sem divisão dos dois lados é igual; com divisão só de um lado não', () => {
    expect(mesmaDivisao(null, undefined)).toBe(true);
    expect(mesmaDivisao(base, null)).toBe(false);
    expect(mesmaDivisao(undefined, base)).toBe(false);
  });

  it('ignora a ordem das pessoas e o peso em partes iguais (a API manda null)', () => {
    expect(mesmaDivisao(base, { ...base, participantes: [{ uid: 'b', peso: undefined }, { uid: 'a' }] })).toBe(true);
    expect(mesmaDivisao(base, { ...base, participantes: [{ uid: 'a', peso: 1 }, { uid: 'b', peso: 1 }] })).toBe(true);
  });

  it('muda com o grupo, o modo, as pessoas ou os pesos', () => {
    expect(mesmaDivisao(base, { ...base, grupoId: 'h' })).toBe(false);
    expect(mesmaDivisao(base, { ...base, participantes: [{ uid: 'a' }] })).toBe(false);
    const pct = { grupoId: 'g', modo: 'percentagem' as const, participantes: [{ uid: 'a', peso: 60 }, { uid: 'b', peso: 40 }] };
    expect(mesmaDivisao(pct, { ...pct, modo: 'partes' })).toBe(false);
    expect(mesmaDivisao(pct, { ...pct, participantes: [{ uid: 'a', peso: 50 }, { uid: 'b', peso: 50 }] })).toBe(false);
    expect(mesmaDivisao(pct, { ...pct, participantes: [{ uid: 'b', peso: 40 }, { uid: 'a', peso: 60 }] })).toBe(true);
  });
});

describe('pendentesDoGrupo', () => {
  const base = { data: '2026-10-01', criadoEm: '2026-10-01T10:00:00Z', titulo: 'x', valor: 10, efeito: 0, podeApagar: false };
  const atividade = [
    { ...base, tipo: 'despesa', id: 'd1', uid: 'ana', nome: 'Ana', meuEstado: 'pendente' },
    { ...base, tipo: 'despesa', id: 'd2', uid: 'eu', nome: 'Eu', meuEstado: 'aceite', porAceitar: 2 },
    { ...base, tipo: 'despesa', id: 'd3', uid: 'ana', nome: 'Ana', meuEstado: 'aceite' },
    { ...base, tipo: 'acerto', id: 'a1', uid: 'ana', nome: 'Ana', outroUid: 'eu', confirmado: false, podeConfirmar: true },
    { ...base, tipo: 'acerto', id: 'a2', uid: 'eu', nome: 'Eu', outroUid: 'rui', confirmado: false },
    { ...base, tipo: 'acerto', id: 'a3', uid: 'eu', nome: 'Eu', outroUid: 'rui', confirmado: true },
  ] as AtividadeDto[];
  const transferencias = [
    { deUid: 'eu', deNome: 'Eu', paraUid: 'ana', paraNome: 'Ana', valor: 5 },
    { deUid: 'rui', deNome: 'Rui', paraUid: 'eu', paraNome: 'Eu', valor: 7 },
  ];

  it('separa o que me cabe do que depende dos outros', () => {
    const p = pendentesDoGrupo(atividade, transferencias, 'eu');
    expect(p.porAceitar.map((a) => a.id)).toEqual(['d1']);
    expect(p.porConfirmar.map((a) => a.id)).toEqual(['a1']);
    expect(p.porPagar).toEqual([transferencias[0]]);
    expect(p.aReceber).toEqual([transferencias[1]]);
    expect(p.aEsperar.map((a) => a.id)).toEqual(['d2', 'a2']);
  });

  it('a bolinha conta só o que tenho de resolver (aceitar, pagar e confirmar)', () => {
    expect(contarPendentes(atividade, transferencias, 'eu')).toBe(3);
    expect(contarPendentes([], [], 'eu')).toBe(0);
  });
});
