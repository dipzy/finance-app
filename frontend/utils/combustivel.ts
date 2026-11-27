import { t } from '../i18n';
import type { Despesa } from '../services/tipos';

// Combustível: os litros de cada abastecimento e o preço por litro. Sem React Native, para os testes

export const eCombustivel = (categoria: string | undefined) => categoria === 'combustivel';

// "35,2 L · 1,72 €/L" (null sem litros)
export function textoLitros(despesa: Pick<Despesa, 'litros' | 'valor'>): string | null {
  if (!despesa.litros || despesa.litros <= 0) return null;
  const litros = String(Number(despesa.litros.toFixed(3))).replace('.', ',');
  const preco = (despesa.valor / despesa.litros).toFixed(3).replace('.', ',');
  return t('{litros} L · {preco} €/L', { litros, preco });
}
