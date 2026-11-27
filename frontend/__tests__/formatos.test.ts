import { formatarData, hojeISO, lerData, lerDataEscrita, parseValor } from '../utils/formatos';

describe('lerDataEscrita (data das gastos do dia a dia)', () => {
  const hoje = new Date(2026, 9, 5, 12);

  it.each([
    ['05/10/2026', '2026-10-05'],
    ['5/10/26', '2026-10-05'],
    ['04-10-2026', '2026-10-04'],
    ['04.10.2026', '2026-10-04'],
    ['2026-10-01', '2026-10-01'],
    [' 30/09/2026 ', '2026-09-30'],
  ])('lê "%s"', (texto, esperado) => {
    expect(lerDataEscrita(texto, hoje)).toEqual({ iso: esperado });
  });

  it('recusa datas que não existem, no futuro ou mal escritas', () => {
    expect(lerDataEscrita('31/02/2026', hoje)).toEqual({ erro: 'Essa data não existe' });
    expect(lerDataEscrita('06/10/2026', hoje)).toEqual({ erro: 'A data não pode ser no futuro' });
    expect(lerDataEscrita('ontem', hoje)).toEqual({ erro: 'Escreve a data como dd/mm/aaaa' });
  });
});

describe('parseValor', () => {
  it.each([
    ['1500', 1500],
    ['1500,50', 1500.5],
    ['1.500', 1500],
    ['1.500,50', 1500.5],
    ['1.234.567', 1234567],
    ['12,50', 12.5],
    ['12.50', 12.5],
    ['1.5', 1.5],
    ['45.1', 45.1],
    ['1 000,00 €', 1000],
    ['0', 0],
    ['', 0],
    ['abc', 0],
  ])('lê "%s" como %d', (texto, esperado) => {
    expect(parseValor(texto)).toBe(esperado);
  });

  it('aceita null e undefined', () => {
    expect(parseValor(null)).toBe(0);
    expect(parseValor(undefined)).toBe(0);
  });
});

describe('datas', () => {
  it('hojeISO usa a data local (não UTC)', () => {
    // 00:30 de 1 de outubro: em UTC ainda seria 30 de setembro
    expect(hojeISO(new Date(2026, 9, 1, 0, 30))).toBe('2026-10-01');
  });

  it('lerData aceita o formato atual e o antigo', () => {
    expect(lerData('2026-10-02')).toEqual({ ano: 2026, mes: 10, dia: 2 });
    expect(lerData('02/10/2026')).toEqual({ ano: 2026, mes: 10, dia: 2 });
    expect(lerData('ontem')).toBeNull();
  });

  it('formatarData mostra dd/mm/aaaa e deixa os outros formatos como estão', () => {
    expect(formatarData('2026-10-02')).toBe('02/10/2026');
    expect(formatarData('02/10/2026')).toBe('02/10/2026');
  });
});
