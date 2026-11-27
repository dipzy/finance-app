import { t } from '../i18n';
import type { EvolucaoMes, Mes } from '../services/tipos';

// Contas dos gráficos feitos só com Views (barras e linhas), sem React Native, para poder ser
// testado diretamente (__tests__/graficos.test.ts).

// O topo do eixo: o primeiro valor "redondo" (1, 2, 2,5, 5 ou 10 × 10^n) que chega ao maior valor.
// Sem valores (ou só zeros e negativos) é 1, para nunca dividir por zero
export function escalaMaxima(valores: number[]): number {
  const maior = Math.max(0, ...valores.filter((v) => Number.isFinite(v)));
  if (maior <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(maior));
  for (const passo of [1, 2, 2.5, 5, 10]) {
    if (passo * potencia >= maior) return passo * potencia;
  }
  return 10 * potencia;
}

// Que parte do eixo ocupa um valor (0 a 1; negativos ficam em 0 e acima do máximo em 1)
export function proporcao(valor: number, maximo: number): number {
  if (!(maximo > 0) || !(valor > 0)) return 0;
  return Math.min(1, valor / maximo);
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// "2026-10" -> "Out"; o ano ("26") só no primeiro mês e em janeiro, para se perceber onde muda
export function rotuloMes(mes: Mes, primeiro = false): { mes: string; ano?: string } {
  const [ano, m] = mes.split('-');
  const rotulo = t(MESES_CURTOS[Number(m) - 1] ?? mes);
  return primeiro || m === '01' ? { mes: rotulo, ano: ano.slice(2) } : { mes: rotulo };
}

// ---- Evolução (últimos 12 meses): por mês, a barra do que entrou e outra, empilhada, com o destino ----

export type ChaveDestino = 'despesasMensais' | 'despesasExtras' | 'poupado' | 'livre';

export interface ParteDestino {
  chave: ChaveDestino;
  nome: string;
  valor: number;
}

// Para onde foi o dinheiro de um mês, de baixo para cima na barra empilhada (só valores acima de 0)
export function destinoDoMes(m: EvolucaoMes): ParteDestino[] {
  const partes: ParteDestino[] = [
    { chave: 'despesasMensais', nome: t('Despesas fixas'), valor: m.despesasMensais },
    { chave: 'despesasExtras', nome: t('Gastos do dia a dia'), valor: m.despesasExtras },
    { chave: 'poupado', nome: t('Poupado'), valor: m.poupado },
    { chave: 'livre', nome: t('Livre'), valor: m.livre },
  ];
  return partes.filter((p) => p.valor > 0);
}

// O máximo comum às duas barras de cada mês: o que entrou e a soma da barra empilhada
export const maximoEvolucao = (meses: EvolucaoMes[]): number =>
  escalaMaxima(meses.flatMap((m) => [m.entrou, destinoDoMes(m).reduce((s, p) => s + p.valor, 0)]));

// ---- Roda (distribuição do salário em anel), feita com pequenos traços à volta de um círculo ----

// A que fatia pertence cada um dos "tracos" traços do anel (do topo, no sentido dos ponteiros do relógio):
// cada fatia fica com os traços proporcionais ao seu valor; null = parte do anel sem nada (fundo)
export function tracosDaRoda<T extends string>(fatias: { chave: T; valor: number }[], base: number, tracos: number): (T | null)[] {
  const resultado: (T | null)[] = Array(tracos).fill(null);
  const total = Math.max(base, fatias.reduce((s, f) => s + Math.max(0, f.valor), 0));
  if (!(total > 0)) return resultado;
  let acumulado = 0;
  for (const fatia of fatias) {
    if (!(fatia.valor > 0)) continue;
    const inicio = Math.round((acumulado / total) * tracos);
    acumulado += fatia.valor;
    const fim = Math.round((acumulado / total) * tracos);
    for (let i = inicio; i < fim && i < tracos; i++) resultado[i] = fatia.chave;
  }
  return resultado;
}
