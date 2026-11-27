import { cores } from '../constants/tema';
import { idiomaAtual, t } from '../i18n';
import { nomeMes } from '../services/calculos';
import type { ComparacaoMes, ComparacaoValor, Mes, PrevisaoFimMes } from '../services/tipos';

// Textos e cores da comparação com o mês anterior e da previsão do fim do mês (Início e Resumo do
// mês), sem React Native, para os testes (__tests__/comparacao.test.ts). Os números vêm da API
// (GET /api/estatisticas/comparacao e /previsao): aqui só se escolhe como os mostrar.

// "24.00 €", com o sinal à frente: o formato do resto da app (formatarEuro)
const euro = (valor: number, sinal = '') => `${sinal}${valor.toFixed(2)} €`;

export type Sentido = 'subiu' | 'desceu' | 'igual';

export function sentido(c: ComparacaoValor): Sentido {
  return c.diferenca > 0 ? 'subiu' : c.diferenca < 0 ? 'desceu' : 'igual';
}

// Em gastos: gastar mais é coral, gastar menos é menta
export function corGasto(c: ComparacaoValor): string {
  const s = sentido(c);
  return s === 'subiu' ? cores.negativo : s === 'desceu' ? cores.positivo : cores.textoSecundario;
}

// "+18% (+24.00 €)", "-50% (-25.00 €)", "novo (+12.00 €)" ou "igual"
export function textoVariacao(c: ComparacaoValor): string {
  if (c.diferenca === 0) return t('igual');
  const sinal = c.diferenca > 0 ? '+' : '-';
  const euros = euro(Math.abs(c.diferenca), sinal);
  if (c.variacao === null) return t('novo ({valor})', { valor: euros });
  return `${sinal}${Math.round(Math.abs(c.variacao))}% (${euros})`;
}

// "setembro" (o nome do mês sem o ano: "Comparado com setembro"; em inglês fica com maiúscula)
export function nomeMesSimples(mes: Mes): string {
  const nome = nomeMes(mes).split(' ')[0];
  return idiomaAtual() === 'pt' ? nome.toLowerCase() : nome;
}

// No mês atual compara-se o mesmo período: "Gastos de 1 a 15, nos dois meses"
export function notaPeriodo(c: ComparacaoMes): string | null {
  if (c.ateDia === null) return null;
  return c.ateDia === 1 ? t('Gastos só do dia 1, nos dois meses') : t('Gastos de 1 a {dia}, nos dois meses', { dia: c.ateDia });
}

// Há alguma coisa para comparar? (sem gastos em nenhum dos dois meses, o cartão não aparece)
export function temComparacao(c: ComparacaoMes): boolean {
  return c.categorias.length > 0 || c.gastosDiaADia.atual !== 0 || c.gastosDiaADia.anterior !== 0;
}

// ---- Previsão do fim do mês ----

// A nota por baixo da previsão no Início: com que gastos do dia a dia conta (só o essencial)
export function notaPrevisao(p: PrevisaoFimMes): string {
  if (p.estimativaGastos <= 0) return t('depois das despesas fixas por pagar');
  const porDia = Math.round(p.mediaDiaria);
  if (porDia >= 1 && p.diasRestantes > 0) return t('conta com ~{valor} €/dia em gastos', { valor: porDia });
  return t('conta com {valor} em gastos', { valor: euro(p.estimativaGastos) });
}
