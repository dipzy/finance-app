import { normalizarTitulo } from '../utils/formatos';
import { api } from './api';
import type { MovimentoLido } from './extratoBancario';
import type { Categoria, OrigemSugestao } from './tipos';

// Importar o extrato da conta bancária: a API categoriza, diz o que já foi importado e grava as despesas
// (no histórico, sem mexer nos saldos). Ver backend ExtratoBancarioService.

// A API aceita no máximo isto de cada vez; mais do que isto envia-se em vários pedidos
export const MAXIMO_POR_PEDIDO = 1000;

export interface MovimentoParaImportar {
  data: string; // AAAA-MM-DD
  descricao: string;
  valor: number; // positivo: o que foi gasto
  ocorrencia: number; // qual dos movimentos iguais é este, contado no extrato inteiro
  categoria?: Categoria;
}

export interface MovimentoPrevisto {
  categoria: Categoria;
  origem: OrigemSugestao;
  regra?: string | null;
  jaImportado: boolean;
  possivelDuplicadoDe?: string | null; // o título de uma despesa feita à mão com a mesma data e valor
}

export interface ResultadoExtrato {
  importados: number;
  jaImportados: number;
  total: number;
  meses: string[]; // "AAAA-MM"
}

// As saídas em movimentos para a API: o valor passa a positivo e cada movimento leva a sua "ocorrência"
// (o 1.º, 2.º... de vários iguais no mesmo dia), contada no extrato inteiro. Assim cada um tem sempre a mesma
// identidade, mesmo que a pessoa deixe alguns de fora, e importar o extrato outra vez não duplica nada
export function prepararMovimentos(saidas: MovimentoLido[]): MovimentoParaImportar[] {
  const vistos = new Map<string, number>();
  return saidas.map((m) => {
    const valor = Math.round(Math.abs(m.valor) * 100) / 100;
    const chave = `${m.data}|${valor.toFixed(2)}|${normalizarTitulo(m.descricao)}`;
    const ocorrencia = vistos.get(chave) ?? 0;
    vistos.set(chave, ocorrencia + 1);
    return { data: m.data, descricao: m.descricao, valor, ocorrencia };
  });
}

function partir<T>(lista: T[]): T[][] {
  const partes: T[][] = [];
  for (let i = 0; i < lista.length; i += MAXIMO_POR_PEDIDO) partes.push(lista.slice(i, i + MAXIMO_POR_PEDIDO));
  return partes;
}

export const ExtratoApi = {
  // Na mesma ordem dos movimentos. Não grava nada
  async previsao(movimentos: MovimentoParaImportar[]): Promise<MovimentoPrevisto[]> {
    const previstos: MovimentoPrevisto[] = [];
    for (const parte of partir(movimentos)) {
      const resposta = await api.post<{ movimentos: MovimentoPrevisto[] }>('/api/despesas-extras/extrato/previsao', { movimentos: parte });
      previstos.push(...resposta.movimentos);
    }
    return previstos;
  },

  // Cria as despesas; os movimentos já importados ficam de fora. Os pedidos são somados
  async importar(movimentos: MovimentoParaImportar[]): Promise<ResultadoExtrato> {
    const resultado: ResultadoExtrato = { importados: 0, jaImportados: 0, total: 0, meses: [] };
    for (const parte of partir(movimentos)) {
      const r = await api.post<ResultadoExtrato>('/api/despesas-extras/extrato', { movimentos: parte });
      resultado.importados += r.importados;
      resultado.jaImportados += r.jaImportados;
      resultado.total = Math.round((resultado.total + r.total) * 100) / 100;
      resultado.meses = [...new Set([...resultado.meses, ...r.meses])].sort();
    }
    return resultado;
  },
};
