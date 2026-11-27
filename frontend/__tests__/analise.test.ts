// Análise: textos da comparação com o mês anterior e da previsão, e o estado das poupanças manuais
// (utils/comparacao.ts e utils/poupancasManuais.ts). Os números vêm da API: aqui só a apresentação.

import { __reporIdioma, definirIdioma } from '../i18n';
import type { ComparacaoMes, Poupanca, PrevisaoFimMes } from '../services/tipos';
import { cores } from '../constants/tema';
import {
  corGasto,
  nomeMesSimples,
  notaPeriodo,
  notaPrevisao,
  sentido,
  temComparacao,
  textoVariacao,
} from '../utils/comparacao';
import { estadoEnvio, poupancasPorEnviar } from '../utils/poupancasManuais';

const valor = (atual: number, anterior: number, variacao: number | null) => ({
  atual,
  anterior,
  diferenca: Math.round((atual - anterior) * 100) / 100,
  variacao,
});

const comparacao = (campos: Partial<ComparacaoMes> = {}): ComparacaoMes => ({
  mes: '2026-10',
  mesAnterior: '2026-09',
  ateDia: 15,
  gastosDiaADia: valor(158, 134, 17.9),
  despesasFixas: valor(500, 500, 0),
  poupado: valor(0, 0, null),
  entrou: valor(0, 0, null),
  categorias: [
    { categoria: 'restauracao', ...valor(100, 34, 194.1) },
    { categoria: 'supermercado', ...valor(30, 90, -66.7) },
    { categoria: 'casa', ...valor(20, 20, 0) },
    { categoria: 'lazer', ...valor(28, 0, null) },
  ],
  ...campos,
});

afterEach(() => __reporIdioma());

describe('comparação com o mês anterior', () => {
  it('variação com sinal, percentagem arredondada e euros; "novo" sem mês anterior', () => {
    expect(textoVariacao(valor(158, 134, 17.9))).toBe('+18% (+24.00 €)');
    expect(textoVariacao(valor(25, 50, -50))).toBe('-50% (-25.00 €)');
    expect(textoVariacao(valor(12, 0, null))).toBe('novo (+12.00 €)');
    expect(textoVariacao(valor(10, 10, 0))).toBe('igual');
  });

  it('gastar mais é coral (↑), gastar menos é menta (↓)', () => {
    expect([sentido(valor(2, 1, 100)), corGasto(valor(2, 1, 100))]).toEqual(['subiu', cores.negativo]);
    expect([sentido(valor(1, 2, -50)), corGasto(valor(1, 2, -50))]).toEqual(['desceu', cores.positivo]);
    expect(sentido(valor(1, 1, 0))).toBe('igual');
  });

  it('nota do período (mês atual) e se há alguma coisa para comparar', () => {
    expect(notaPeriodo(comparacao())).toBe('Gastos de 1 a 15, nos dois meses');
    expect(notaPeriodo(comparacao({ ateDia: 1 }))).toBe('Gastos só do dia 1, nos dois meses');
    expect(notaPeriodo(comparacao({ ateDia: null }))).toBeNull();
    expect(temComparacao(comparacao())).toBe(true);
    expect(temComparacao(comparacao({ categorias: [], gastosDiaADia: valor(0, 0, null) }))).toBe(false);
  });

  it('o nome do mês: minúsculas em português, maiúscula em inglês', async () => {
    expect(nomeMesSimples('2026-09')).toBe('setembro');
    await definirIdioma('en');
    expect(nomeMesSimples('2026-09')).toBe('September');
    expect(textoVariacao(valor(12, 0, null))).toBe('new (+12.00 €)');
    expect(notaPeriodo(comparacao())).toBe('Spending from day 1 to 15, in both months');
  });
});

describe('previsão do fim do mês', () => {
  const previsao = (campos: Partial<PrevisaoFimMes>): PrevisaoFimMes => ({
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
    ...campos,
  });

  it('diz com quantos euros por dia conta', () => {
    expect(notaPrevisao(previsao({ mediaDiaria: 11.6 }))).toBe('conta com ~12 €/dia em gastos');
    // Menos de 1 €/dia (só os recorrentes) ou no último dia: o total
    expect(notaPrevisao(previsao({ mediaDiaria: 0.2, estimativaGastos: 20 }))).toBe('conta com 20.00 € em gastos');
    expect(notaPrevisao(previsao({ estimativaGastos: 0, diasRestantes: 0 }))).toBe('depois das despesas fixas por pagar');
  });
});

describe('poupanças de contribuição manual', () => {
  const p = (campos: Partial<Poupanca>): Poupanca => ({ id: 'x', nome: 'PPR', tipo: 'valor', valor: '50', saldo: 0, ...campos });

  it('por enviar este mês ou enviada no dia; as automáticas não têm estado', () => {
    expect(estadoEnvio(p({ contribuicaoAutomatica: false, ultimaContribuicaoMes: '2026-09' }), '2026-10')).toEqual({
      porEnviar: true,
      texto: 'Por enviar este mês',
    });
    expect(
      estadoEnvio(p({ contribuicaoAutomatica: false, ultimaContribuicaoMes: '2026-10', ultimaContribuicaoEm: '2026-10-05' }), '2026-10')
    ).toEqual({ porEnviar: false, texto: 'Enviada 05/10' });
    expect(estadoEnvio(p({ contribuicaoAutomatica: false, ultimaContribuicaoMes: '2026-10' }), '2026-10')?.texto).toBe('Enviada este mês');
    expect(estadoEnvio(p({ contribuicaoAutomatica: true }), '2026-10')).toBeNull();
    expect(estadoEnvio(p({}), '2026-10')).toBeNull(); // as antigas são automáticas

    const lista = [
      p({ id: 'a', contribuicaoAutomatica: false }),
      p({ id: 'b', contribuicaoAutomatica: false, ultimaContribuicaoMes: '2026-10' }),
      p({ id: 'c' }),
    ];
    expect(poupancasPorEnviar(lista, '2026-10').map((x) => x.id)).toEqual(['a']);
  });
});
