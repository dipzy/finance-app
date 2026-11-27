import { useIdioma } from './idioma';
import { traduzir, type Tradutor } from './tradutor';

/**
 * Um t() para componentes: a função é sempre a mesma, mas o componente volta a desenhar quando o
 * idioma muda (a chamada a useIdioma inscreve-o no estado do idioma).
 */
export function useT(): Tradutor {
  useIdioma();
  return traduzir;
}