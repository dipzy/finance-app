import type { Href } from 'expo-router';
import type { Action } from 'expo-quick-actions';
import { t } from '../i18n';

// Atalhos no ícone da app (Android: tocar sem largar no ícone). Os ícones vêm do app.json
// (plugin expo-quick-actions, "androidIcons"): só aparecem depois de um build novo (EAS).

export const ATALHO_NOVO_GASTO = 'novo-gasto';

export const ATALHOS: Action[] = [
  { id: ATALHO_NOVO_GASTO, title: t('Novo gasto'), icon: 'atalho_novo', params: {} },
  { id: 'gastos', title: t('Gastos do dia a dia'), icon: 'atalho_lista', params: { href: '/(tabs)/despesas-extras' } },
  { id: 'resumo', title: t('Resumo do mês'), icon: 'atalho_resumo', params: { href: '/(tabs)/two' } },
];

export interface DestinoAtalho {
  href?: Href; // ecrã a abrir (sem href fica-se no ecrã em que se está)
  abrirGastoRapido: boolean; // abrir a folha "Novo gasto"
}

/** O que fazer com um atalho tocado (null = atalho desconhecido, ex.: de uma versão antiga). */
export function destinoDoAtalho(acao: Pick<Action, 'id' | 'params'> | null | undefined): DestinoAtalho | null {
  if (!acao) return null;
  if (acao.id === ATALHO_NOVO_GASTO) return { abrirGastoRapido: true };
  const href = acao.params?.href;
  if (typeof href === 'string' && href.startsWith('/(tabs)/')) return { href: href as Href, abrirGastoRapido: false };
  return null;
}
