import { diaEfetivo } from '../services/calculos';
import type { SalarioConfig } from '../services/tipos';

// Recebimento manual do salário: não entra sozinho no dia; a pessoa marca "Já recebi" (com o valor que entrou).
// Sem React Native, para os testes (__tests__/salario.test.ts).

/** O salário deste mês já entrou? (pela data do último recebimento) */
export function recebidoNoMes(config: Pick<SalarioConfig, 'lastReceived'> | null | undefined, hoje: Date = new Date()): boolean {
  if (!config?.lastReceived) return false;
  const ultimo = new Date(config.lastReceived);
  if (Number.isNaN(ultimo.getTime())) return false;
  return ultimo.getFullYear() === hoje.getFullYear() && ultimo.getMonth() === hoje.getMonth();
}

/**
 * Com o recebimento manual ligado: o dia em que o salário devia ter entrado, se esse dia já chegou (ou passou) e o
 * salário deste mês ainda não foi marcado como recebido. Senão null (sem recebimento manual, ainda não é o dia, ou já entrou).
 */
export function salarioPorReceber(config: SalarioConfig | null | undefined, hoje: Date = new Date()): number | null {
  if (!config?.recebimentoManual || recebidoNoMes(config, hoje)) return null;
  const dia = diaEfetivo(config.diaRecebimento, hoje);
  return hoje.getDate() >= dia ? dia : null;
}
