// Recebimento manual do salário: quando falta marcá-lo como recebido
import type { SalarioConfig } from '../services/tipos';
import { recebidoNoMes, salarioPorReceber } from '../utils/salario';

const config = (campos: Partial<SalarioConfig> = {}): SalarioConfig => ({ valor: '1500', diaRecebimento: 25, recebimentoManual: true, ...campos });

describe('recebidoNoMes', () => {
  const hoje = new Date(2026, 9, 28, 12);

  it('sem último recebimento não entrou', () => {
    expect(recebidoNoMes(config(), hoje)).toBe(false);
    expect(recebidoNoMes(null, hoje)).toBe(false);
  });

  it('entrou se o último recebimento é deste mês, e não se é de um mês anterior', () => {
    expect(recebidoNoMes(config({ lastReceived: new Date(2026, 9, 3, 9).toISOString() }), hoje)).toBe(true);
    expect(recebidoNoMes(config({ lastReceived: new Date(2026, 8, 25, 9).toISOString() }), hoje)).toBe(false);
    // O mesmo mês de outro ano não conta
    expect(recebidoNoMes(config({ lastReceived: new Date(2025, 9, 25, 9).toISOString() }), hoje)).toBe(false);
  });

  it('uma data inválida conta como não recebido', () => {
    expect(recebidoNoMes(config({ lastReceived: 'ontem' }), hoje)).toBe(false);
  });
});

describe('salarioPorReceber', () => {
  it('no dia e depois do dia, sem ter sido marcado, devolve o dia em que devia ter entrado', () => {
    expect(salarioPorReceber(config(), new Date(2026, 9, 25, 9))).toBe(25);
    expect(salarioPorReceber(config(), new Date(2026, 9, 29, 9))).toBe(25);
  });

  it('antes do dia ainda não falta nada', () => {
    expect(salarioPorReceber(config(), new Date(2026, 9, 24, 23))).toBeNull();
  });

  it('já marcado este mês não falta nada', () => {
    const marcado = config({ lastReceived: new Date(2026, 9, 26, 9).toISOString() });
    expect(salarioPorReceber(marcado, new Date(2026, 9, 29, 9))).toBeNull();
    // Mas no mês seguinte, depois do dia, volta a faltar
    expect(salarioPorReceber(marcado, new Date(2026, 10, 26, 9))).toBe(25);
  });

  it('no modo automático (ou sem configuração) nunca avisa', () => {
    expect(salarioPorReceber(config({ recebimentoManual: false }), new Date(2026, 9, 29, 9))).toBeNull();
    expect(salarioPorReceber(config({ recebimentoManual: undefined }), new Date(2026, 9, 29, 9))).toBeNull();
    expect(salarioPorReceber(null, new Date(2026, 9, 29, 9))).toBeNull();
  });

  it('o dia 29-31 passa para o último dia dos meses curtos', () => {
    const dia31 = config({ diaRecebimento: 31 });
    expect(salarioPorReceber(dia31, new Date(2026, 8, 29, 9))).toBeNull(); // setembro tem 30 dias
    expect(salarioPorReceber(dia31, new Date(2026, 8, 30, 9))).toBe(30);
  });
});
