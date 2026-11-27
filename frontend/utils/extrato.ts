import type { MovimentoLido } from '../services/extratoBancario';
import type { MovimentoParaImportar, MovimentoPrevisto } from '../services/extratoApi';
import type { Categoria } from '../services/tipos';

// A escolha da pessoa sobre cada movimento do extrato (ecrã Importar extrato): importar ou não, e com que categoria

export interface EscolhaMovimento {
  incluido: boolean;
  categoria: Categoria;
}

// De início vão todos, menos os que já foram importados e os que parecem repetir uma despesa feita à mão
// (a pessoa vê o aviso e decide). A categoria é a sugerida pela API
export function escolhasIniciais(previstos: MovimentoPrevisto[]): EscolhaMovimento[] {
  return previstos.map((p) => ({ incluido: !p.jaImportado && !p.possivelDuplicadoDe, categoria: p.categoria }));
}

export interface ResumoSelecao {
  quantos: number;
  total: number; // o que se gastou nos selecionados
  de: string | null; // a data mais antiga (AAAA-MM-DD)
  ate: string | null; // a mais recente
  jaImportados: number;
  possiveisDuplicados: number;
}

export function resumoSelecao(saidas: MovimentoLido[], escolhas: EscolhaMovimento[], previstos: MovimentoPrevisto[]): ResumoSelecao {
  const selecionados = saidas.map((m, i) => ({ m, incluido: escolhas[i]?.incluido === true && !previstos[i]?.jaImportado })).filter((s) => s.incluido);
  const datas = selecionados.map((s) => s.m.data).sort();
  return {
    quantos: selecionados.length,
    total: Math.round(selecionados.reduce((soma, s) => soma + Math.abs(s.m.valor), 0) * 100) / 100,
    de: datas[0] ?? null,
    ate: datas[datas.length - 1] ?? null,
    jaImportados: previstos.filter((p) => p.jaImportado).length,
    possiveisDuplicados: previstos.filter((p) => !p.jaImportado && !!p.possivelDuplicadoDe).length,
  };
}

// O que se envia: os incluídos que ainda não foram importados, cada um com a categoria escolhida
export function movimentosAImportar(
  preparados: MovimentoParaImportar[],
  escolhas: EscolhaMovimento[],
  previstos: MovimentoPrevisto[]
): MovimentoParaImportar[] {
  return preparados
    .map((m, i) => ({ ...m, categoria: escolhas[i]?.categoria }))
    .filter((_, i) => escolhas[i]?.incluido === true && !previstos[i]?.jaImportado);
}

// Marca (ou desmarca) todos os que podem ser importados
export function marcarTodos(previstos: MovimentoPrevisto[], escolhas: EscolhaMovimento[], incluir: boolean): EscolhaMovimento[] {
  return escolhas.map((e, i) => (previstos[i]?.jaImportado ? e : { ...e, incluido: incluir }));
}
