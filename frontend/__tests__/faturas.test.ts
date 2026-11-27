import { textoPrecoPorUnidade, textoUltimaFatura, ultimaFaturaComConsumo } from '../utils/faturas';
import type { PagamentoFixa } from '../services/tipos';

const p = (mes: string, valor: number, consumo?: number, parcial = false): PagamentoFixa => ({
  id: `${mes}_luz`,
  fixaId: 'luz',
  mes,
  titulo: 'Luz',
  valor,
  data: `${mes}-05`,
  estado: 'pago',
  parcial,
  consumo,
});

describe('faturas variáveis', () => {
  it('a última fatura com consumo ignora as parciais e as sem consumo', () => {
    const lista = [p('2026-07', 50, 250), p('2026-08', 70, 300), p('2026-09', 20, 100, true), p('2026-10', 60)];
    expect(ultimaFaturaComConsumo(lista)).toEqual({ mes: '2026-08', valor: 70, consumo: 300, precoPorUnidade: 70 / 300 });
    expect(ultimaFaturaComConsumo(lista, '2026-08')?.mes).toBe('2026-07'); // só as de antes do mês
    expect(ultimaFaturaComConsumo([p('2026-10', 60)])).toBeNull();
  });

  it('mostra o custo por unidade', () => {
    expect(textoUltimaFatura({ mes: '2026-09', valor: 62.3, consumo: 280, precoPorUnidade: 62.3 / 280 }, 'kWh')).toBe(
      'Fatura anterior: 62.30 € · 280 kWh · 0,2225 €/kWh'
    );
    expect(textoPrecoPorUnidade(62.3, 280, 'kWh')).toBe('Esta fatura: 0,2225 €/kWh');
    expect(textoPrecoPorUnidade(0, 280, 'kWh')).toBeNull();
    expect(textoPrecoPorUnidade(62.3, 0, 'kWh')).toBeNull();
  });
});
