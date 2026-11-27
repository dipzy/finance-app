import { api } from './api';
import { t } from '../i18n';
import type { Categoria, Despesa, MeioPagamento } from './tipos';

// Pesquisa dos gastos do dia a dia em todos os meses (GET /api/despesas-extras/pesquisa).
// O texto é comparado na API sem acentos nem maiúsculas ("cafe" encontra "Café").

export interface FiltroPesquisa {
  texto?: string;
  categoria?: Categoria;
  meioPagamento?: MeioPagamento;
  valorMin?: number;
  valorMax?: number;
  de?: string; // AAAA-MM-DD, inclusive
  ate?: string;
  pagina?: number;
  tamanho?: number;
}

export interface ResultadoPesquisa {
  total: number; // todos os resultados (não só os da página)
  soma: number;
  pagina: number;
  tamanho: number;
  itens: Despesa[];
}

export type IntervaloRapido = 'mes' | '3meses' | 'ano' | 'tudo';

export const INTERVALOS_RAPIDOS: { valor: IntervaloRapido; rotulo: string }[] = [
  { valor: 'mes', rotulo: t('Este mês') },
  { valor: '3meses', rotulo: t('3 meses') },
  { valor: 'ano', rotulo: t('Este ano') },
  { valor: 'tudo', rotulo: t('Tudo') },
];

const iso = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/**
 * As datas de um intervalo rápido, a contar de hoje (no fuso do telemóvel):
 * este mês = desde o dia 1; 3 meses = desde o dia 1 de há dois meses (o mês atual e os dois
 * anteriores); este ano = desde 1 de janeiro; tudo = sem datas.
 */
export function datasDoIntervalo(intervalo: IntervaloRapido, hoje: Date = new Date()): { de?: string; ate?: string } {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const ate = iso(ano, mes, hoje.getDate());
  switch (intervalo) {
    case 'mes':
      return { de: iso(ano, mes, 1), ate };
    case '3meses': {
      const inicio = new Date(ano, mes - 3, 1);
      return { de: iso(inicio.getFullYear(), inicio.getMonth() + 1, 1), ate };
    }
    case 'ano':
      return { de: iso(ano, 1, 1), ate };
    case 'tudo':
      return {};
  }
}

/** A query string da pesquisa, só com os filtros preenchidos. */
export function queryPesquisa(filtro: FiltroPesquisa): string {
  const partes: string[] = [];
  const juntar = (nome: string, valor: string | number | undefined) => {
    if (valor === undefined || valor === '' || (typeof valor === 'number' && !Number.isFinite(valor))) return;
    partes.push(`${nome}=${encodeURIComponent(String(valor))}`);
  };
  juntar('texto', filtro.texto?.trim());
  juntar('categoria', filtro.categoria);
  juntar('meioPagamento', filtro.meioPagamento);
  juntar('valorMin', filtro.valorMin);
  juntar('valorMax', filtro.valorMax);
  juntar('de', filtro.de);
  juntar('ate', filtro.ate);
  juntar('pagina', filtro.pagina);
  juntar('tamanho', filtro.tamanho);
  return partes.length ? `?${partes.join('&')}` : '';
}

export const PesquisaDB = {
  pesquisar(filtro: FiltroPesquisa): Promise<ResultadoPesquisa> {
    return api.get<ResultadoPesquisa>(`/api/despesas-extras/pesquisa${queryPesquisa(filtro)}`);
  },
};
