// Contas dos gráficos feitos com Views (escala das barras, roda e rótulos dos meses)
import {
  escalaMaxima,
  destinoDoMes,
  maximoEvolucao,
  proporcao,
  rotuloMes,
  tracosDaRoda,
} from '../utils/graficos';
import type { EvolucaoMes } from '../services/tipos';

const mesEvolucao = (campos: Partial<EvolucaoMes>): EvolucaoMes => ({
  mes: '2026-10',
  entrou: 1500,
  gasto: 900,
  poupado: 100,
  saldoFinal: 9000,
  despesasMensais: 600,
  despesasExtras: 300,
  livre: 500,
  ...campos,
});

describe('escala', () => {
  it('o topo do eixo é um valor redondo que chega ao maior', () => {
    expect(escalaMaxima([1500, 640, 150])).toBe(2000);
    expect(escalaMaxima([2600])).toBe(5000);
    expect(escalaMaxima([2400])).toBe(2500);
    expect(escalaMaxima([1000])).toBe(1000);
    expect(escalaMaxima([7.3])).toBe(10);
    expect(escalaMaxima([])).toBe(1);
    expect(escalaMaxima([0, -50])).toBe(1);
  });

  it('proporções e larguras nunca saem de 0-100%', () => {
    expect(proporcao(50, 200)).toBe(0.25);
    expect(proporcao(300, 200)).toBe(1);
    expect(proporcao(-5, 200)).toBe(0);
    expect(proporcao(5, 0)).toBe(0);
  });

  it('o máximo da evolução: o que entrou ou a barra empilhada (o saldo final não conta)', () => {
    expect(maximoEvolucao([mesEvolucao({})])).toBe(2000); // 1500 arredondado para cima
    // Gastou mais do que entrou: a barra empilhada é a maior
    expect(maximoEvolucao([mesEvolucao({ despesasMensais: 1500, despesasExtras: 600, livre: 0 })])).toBe(2500);
  });

  it('destino do mês: despesas fixas, extras, poupado e livre, sem as partes a zero', () => {
    expect(destinoDoMes(mesEvolucao({})).map((p) => [p.chave, p.valor])).toEqual([
      ['despesasMensais', 600],
      ['despesasExtras', 300],
      ['poupado', 100],
      ['livre', 500],
    ]);
    expect(destinoDoMes(mesEvolucao({ despesasExtras: 0, livre: 0 })).map((p) => p.nome)).toEqual(['Despesas fixas', 'Poupado']);
  });

  it('roda: cada fatia fica com os traços proporcionais ao valor, o resto do salário fica vazio', () => {
    const fatias = [
      { chave: 'a', valor: 50 },
      { chave: 'b', valor: 25 },
    ];
    const tracos = tracosDaRoda(fatias, 100, 8);
    expect(tracos).toEqual(['a', 'a', 'a', 'a', 'b', 'b', null, null]);
    // Fatias que passam do salário: a base passa a ser a soma (o anel nunca dá mais de uma volta)
    expect(tracosDaRoda([{ chave: 'a', valor: 150 }, { chave: 'b', valor: 50 }], 100, 4)).toEqual(['a', 'a', 'a', 'b']);
    expect(tracosDaRoda([], 0, 3)).toEqual([null, null, null]);
    expect(tracosDaRoda([{ chave: 'a', valor: 0 }], 100, 2)).toEqual([null, null]);
  });
});

describe('rótulos dos meses', () => {
  it('rótulos dos meses: o ano só no primeiro e em janeiro', () => {
    expect(rotuloMes('2026-10')).toEqual({ mes: 'Out' });
    expect(rotuloMes('2025-11', true)).toEqual({ mes: 'Nov', ano: '25' });
    expect(rotuloMes('2027-01')).toEqual({ mes: 'Jan', ano: '27' });
  });
});
