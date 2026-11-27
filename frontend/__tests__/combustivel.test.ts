import { textoLitros } from '../utils/combustivel';
import { validarDespesaExtra, validarEdicaoExtra } from '../utils/ecrasDespesas';
import type { Despesa } from '../services/tipos';

const hoje = new Date(2026, 9, 10);

describe('litros do combustível', () => {
  it('mostra os litros e o preço por litro', () => {
    expect(textoLitros({ valor: 60.5, litros: 35.2 })).toBe('35,2 L · 1,719 €/L');
    expect(textoLitros({ valor: 60.5 })).toBeNull();
  });

  it('um gasto novo leva os litros só se forem escritos e válidos', () => {
    const base = { titulo: 'Galp', valor: '60,50', data: '10/10/2026' };
    expect(validarDespesaExtra({ ...base, litros: '35,2' }, hoje)).toMatchObject({ despesa: { litros: 35.2 } });
    expect(validarDespesaExtra({ ...base, litros: '  ' }, hoje)).toEqual({ despesa: expect.not.objectContaining({ litros: expect.anything() }) });
    expect(validarDespesaExtra({ ...base, litros: 'abc' }, hoje)).toHaveProperty('erro');
    expect(validarDespesaExtra({ ...base, litros: '0' }, hoje)).toHaveProperty('erro');
  });

  it('na edição só muda o que mudou (apagar os litros envia 0)', () => {
    const original = { id: 'x', titulo: 'Galp', valor: 60.5, data: '2026-10-10', categoria: 'combustivel', litros: 35.2 } as Despesa;
    const form = { titulo: 'Galp', valor: '60,50', data: '10/10/2026', categoria: 'combustivel' as const };
    expect(validarEdicaoExtra(original, { ...form, litros: '35,2' }, hoje)).toEqual({ campos: {} });
    expect(validarEdicaoExtra(original, { ...form, litros: '40' }, hoje)).toEqual({ campos: { litros: 40 } });
    expect(validarEdicaoExtra(original, { ...form, litros: '' }, hoje)).toEqual({ campos: { litros: 0 } });
    expect(validarEdicaoExtra(original, form, hoje)).toEqual({ campos: {} }); // sem campo no formulário: fica como está
  });
});
