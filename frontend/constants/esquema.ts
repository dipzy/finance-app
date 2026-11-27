import { Appearance, Platform } from 'react-native';
import type { Esquema } from './paletas';

// Que paleta usar (escuro/claro). As cores são lidas ao arrancar (os StyleSheet são criados uma vez),
// por isso a escolha tem de ser conhecida de imediato:
//   - web: a preferência fica também no localStorage (leitura imediata);
//   - telemóvel: segue o esquema do sistema (Appearance). Uma escolha "Claro"/"Escuro" é aplicada com
//     Appearance.setColorScheme logo ao abrir (services/tema.ts) e a app reinicia uma vez para a usar.

export type PreferenciaTema = 'sistema' | 'claro' | 'escuro';
export const PREFERENCIAS_TEMA: readonly PreferenciaTema[] = ['sistema', 'claro', 'escuro'];

/** A chave do localStorage (só web) com a preferência, para a ler antes de desenhar o primeiro ecrã. */
export const CHAVE_TEMA_WEB = '@financas:tema';

export function ePreferenciaTema(valor: unknown): valor is PreferenciaTema {
  return valor === 'sistema' || valor === 'claro' || valor === 'escuro';
}

/** O esquema do sistema (telemóvel ou browser). Sem resposta, escuro: era o único que a app tinha. */
export function esquemaDoSistema(): Esquema {
  try {
    return Appearance.getColorScheme() === 'light' ? 'claro' : 'escuro';
  } catch {
    return 'escuro';
  }
}

export function resolverEsquema(preferencia: PreferenciaTema, sistema: Esquema = esquemaDoSistema()): Esquema {
  return preferencia === 'sistema' ? sistema : preferencia;
}

/** A preferência guardada no localStorage (só na web), ou null. */
export function preferenciaWeb(): PreferenciaTema | null {
  if (Platform.OS !== 'web') return null;
  try {
    const valor = typeof localStorage !== 'undefined' ? localStorage.getItem(CHAVE_TEMA_WEB) : null;
    return ePreferenciaTema(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** O esquema com que a app arranca: a preferência da web, ou o do sistema. */
export function esquemaInicial(): Esquema {
  return resolverEsquema(preferenciaWeb() ?? 'sistema');
}
