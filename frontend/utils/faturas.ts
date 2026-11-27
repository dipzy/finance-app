import { t } from '../i18n';
import type { PagamentoFixa } from '../services/tipos';

// Despesas de valor variável (água, luz, gás): o que a fatura anterior custou e consumiu, para se ter
// uma ideia do que esperar. Sem React Native, para os testes (__tests__/faturas.test.ts)

export interface UltimaFatura {
  mes: string;
  valor: number;
  consumo: number;
  precoPorUnidade: number; // € por kWh, m³...
}

// A fatura mais recente (de um mês antes de `ate`, se for dado) em que se registou o consumo
export function ultimaFaturaComConsumo(pagamentos: PagamentoFixa[], ate?: string): UltimaFatura | null {
  const p = pagamentos
    .filter((x) => !x.parcial && x.valor > 0 && (x.consumo ?? 0) > 0 && (ate === undefined || x.mes < ate))
    .sort((a, b) => b.mes.localeCompare(a.mes))[0];
  if (!p || !p.consumo) return null;
  return { mes: p.mes, valor: p.valor, consumo: p.consumo, precoPorUnidade: p.valor / p.consumo };
}

// 280 → "280"; 12.5 → "12,5" (até 3 casas, sem zeros a mais)
const numero = (n: number) => String(Number(n.toFixed(3))).replace('.', ',');

// "Fatura anterior: 62,30 € · 280 kWh · 0,2225 €/kWh"
export function textoUltimaFatura(f: UltimaFatura, unidade: string): string {
  return t('Fatura anterior: {valor} € · {consumo} {unidade} · {preco} €/{unidade}', {
    valor: f.valor.toFixed(2),
    consumo: numero(f.consumo),
    unidade,
    preco: f.precoPorUnidade.toFixed(4).replace('.', ','),
  });
}

// O custo por unidade desta fatura, enquanto se escreve (vazio se faltar o valor ou o consumo)
export function textoPrecoPorUnidade(valor: number, consumo: number, unidade: string): string | null {
  if (!(valor > 0) || !(consumo > 0)) return null;
  return t('Esta fatura: {preco} €/{unidade}', { preco: (valor / consumo).toFixed(4).replace('.', ','), unidade });
}
