import { mesDe } from './calculos';
import { PagamentosDB, PoupancasDB } from './database';
import type { ContribuicaoEmAtraso, Despesa } from './tipos';
import { mesesEmAtraso, pagamentosEmAtraso, ResumoEmAtraso, SEM_ATRASO } from '../utils/painel';

// As despesas fixas dos últimos meses que ficaram por pagar (regras em utils/painel.ts).
// Um aviso nunca pode estragar o ecrã: se os meses anteriores não carregarem, devolve "nada em atraso"
export async function carregarEmAtraso(userId: string, fixas: Despesa[], hoje: Date = new Date()): Promise<ResumoEmAtraso> {
  const atual = mesDe(hoje);
  // Sem nenhuma despesa que já existisse antes deste mês não há nada a verificar (poupa os pedidos)
  if (!fixas.some((f) => f.inicio && f.inicio < atual)) return SEM_ATRASO;
  try {
    const meses = mesesEmAtraso(hoje);
    const pagamentos = await Promise.all(meses.map((mes) => PagamentosDB.getDoMes(userId, mes)));
    return pagamentosEmAtraso(fixas, Object.fromEntries(meses.map((mes, i) => [mes, pagamentos[i]])), hoje);
  } catch (error) {
    console.error('Erro ao carregar as despesas em atraso:', error);
    return SEM_ATRASO;
  }
}

// As contribuições manuais das poupanças dos últimos 3 meses que ficaram por enviar (a API é que sabe quais).
// Pela mesma razão, uma falha não estraga o ecrã: devolve uma lista vazia
export async function carregarPoupancasEmAtraso(userId: string): Promise<ContribuicaoEmAtraso[]> {
  try {
    return await PoupancasDB.getEmAtraso(userId);
  } catch (error) {
    console.error('Erro ao carregar as poupanças em atraso:', error);
    return [];
  }
}
