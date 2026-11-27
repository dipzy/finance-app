// Funções de formatação, sem React nem React Native (só o tradutor), para poderem ser testadas diretamente
import { t } from '../i18n/tradutor';

// Converte texto em número aceitando o formato português ("1.500,50", "12,5")
// parseFloat sozinho lê "12,50" como 12 e corta os cêntimos sem avisar
export function parseValor(texto: string | null | undefined): number {
  if (!texto) return 0;
  const limpo = texto.replace(/[\s€]/g, '');
  // Com vírgula, os pontos são separadores de milhares. Sem vírgula, "1.500" também é mil e quinhentos
  // (grupos de 3 dígitos), mas "1.5" e "12.50" continuam a ser decimais
  const milhares = !limpo.includes(',') && /^-?\d{1,3}(\.\d{3})+$/.test(limpo);
  const normalizado = limpo.includes(',') || milhares ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const valor = parseFloat(normalizado);
  return isNaN(valor) ? 0 : valor;
}

// Data no fuso local, em ISO (AAAA-MM-DD)
// toISOString() usa UTC e depois da meia-noite em Portugal ainda daria o dia anterior
export function hojeISO(data: Date = new Date()): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

// Lê "2026-10-02" (formato atual) ou "02/10/2026" (versões antigas) sem passar por fusos horários.
// O mês é 1-12
export function lerData(data: string): { ano: number; mes: number; dia: number } | null {
  const iso = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { ano: Number(iso[1]), mes: Number(iso[2]), dia: Number(iso[3]) };
  const pt = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (pt) return { ano: Number(pt[3]), mes: Number(pt[2]), dia: Number(pt[1]) };
  return null;
}

// Data escrita à mão nas gastos do dia a dia -> ISO.
// Aceita "05/10/2026", "5/10/26", "05-10-2026", "05.10.2026" e "2026-10-05";
// recusa datas que não existem (31/02) e datas no futuro
export function lerDataEscrita(texto: string, hoje: Date = new Date()): { iso: string } | { erro: string } {
  const limpo = texto.trim();
  let ano: number, mes: number, dia: number;
  const iso = limpo.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const pt = limpo.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (iso) {
    [ano, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (pt) {
    [dia, mes, ano] = [Number(pt[1]), Number(pt[2]), Number(pt[3])];
    if (pt[3].length === 2) ano += 2000;
  } else {
    return { erro: t('Escreve a data como dd/mm/aaaa') };
  }

  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    return { erro: t('Essa data não existe') };
  }
  if (hojeISO(data) > hojeISO(hoje)) {
    return { erro: t('A data não pode ser no futuro') };
  }
  return { iso: hojeISO(data) };
}

// "2026-10-02" -> "02/10/2026" (outros formatos são mostrados tal como estão)
export function formatarData(data: string): string {
  const partes = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : data;
}

// Títulos comparados sem maiúsculas, acentos nem espaços a mais ("Ginásio" = "ginasio ")
export function normalizarTitulo(titulo: string): string {
  return titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
