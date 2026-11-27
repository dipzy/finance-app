import { GRUPOS_MENU, type GrupoMenu } from '../components/Separadores';

// Que páginas se podem esconder (definições do telemóvel). O id é a rota sem o "/(tabs)/".
// Início e Definições nunca se escondem. Um grupo (ex.: Compromissos) some do menu quando
// todas as suas páginas estão escondidas.

export const PAGINAS_SOLTAS = [
  { id: 'despesas-extras', rotulo: 'Gastos do Dia a Dia' },
  { id: 'salario', rotulo: 'Salário' },
  { id: 'poupanca-partilhada', rotulo: 'Poupança conjunta' },
] as const;

export const TITULO_GRUPO: Record<GrupoMenu, string> = {
  compromissos: 'Compromissos',
  planeamento: 'Orçamentos e poupança',
  mes: 'Resumo e calendário',
};

export function idDaRota(rota: string) {
  return rota.replace('/(tabs)/', '');
}

export function paginaVisivel(id: string, ocultos: readonly string[]) {
  return !ocultos.includes(id);
}

/** As páginas de um grupo que não estão escondidas, pela ordem do menu. */
export function paginasVisiveisDoGrupo(grupo: GrupoMenu, ocultos: readonly string[]) {
  return GRUPOS_MENU[grupo].filter((p) => paginaVisivel(idDaRota(p.rota), ocultos));
}
