import { idiomaAtual } from './idioma';
import { en } from './textos';

export type Parametros = Record<string, string | number>;

// "Faltam {n} prestações" -> troca {n} pelo valor, em qualquer idioma. Um {param} sem valor fica como está.
function substituir(texto: string, params?: Parametros): string {
  if (!params) return texto;
  return texto.replace(/\{(\w+)\}/g, (marca, nome: string) => (nome in params ? String(params[nome]) : marca));
}

/**
 * O texto no idioma atual. A chave é o texto exato em português que está no código ("Guardar"):
 * em português devolve a própria chave, em inglês devolve a tradução do dicionário
 * (e, se ainda não houver tradução, volta ao texto português).
 */
export function traduzir(chave: string, params?: Parametros): string {
  const texto = idiomaAtual() === 'en' ? (en[chave] ?? chave) : chave;
  return substituir(texto, params);
}

export type Tradutor = (chave: string, params?: Parametros) => string;

/** Para módulos (chamadas fora de componentes: utils, services, alertas). Nos componentes prefere-se useT(). */
export const t: Tradutor = traduzir;