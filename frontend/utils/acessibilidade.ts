import { Text, TextInput } from 'react-native';

// Tamanho de letra dinâmico: o texto acompanha o tamanho de letra do telemóvel (o allowFontScaling dos
// Text/TextInput é verdadeiro por defeito), mas com um teto para os ecrãs não partirem quando alguém
// tem a letra no máximo (os valores em euros e os botões de ícone têm largura limitada).

/** Até quanto o texto cresce com a definição de letra do sistema (1 = sem crescer; 1.3 = +30%). */
export const ESCALA_MAXIMA_TEXTO = 1.3;
/** Campos de escrita: um pouco menos, para não deixarem de caber nas linhas. */
export const ESCALA_MAXIMA_CAMPOS = 1.2;

// No React 19 o defaultProps das funções já não vale: o Text e o TextInput do React Native são
// "forwardRef", por isso embrulha-se o render deles uma única vez, pondo o teto quando o ecrã não pediu outro
export function limitarEscala(componente: unknown, maximo: number): boolean {
  const alvo = componente as { render?: (props: Record<string, unknown>, ref: unknown) => unknown; __escalaLimitada?: boolean };
  if (typeof alvo?.render !== 'function' || alvo.__escalaLimitada) return false;
  const original = alvo.render;
  alvo.render = function (props, ref) {
    return original.call(this, { maxFontSizeMultiplier: maximo, ...props }, ref);
  };
  alvo.__escalaLimitada = true;
  return true;
}

/** Chamar uma vez ao arrancar (app/_layout.tsx). Devolve se o Text foi limitado agora. */
export function limitarEscalaDeLetra(): boolean {
  const texto = limitarEscala(Text, ESCALA_MAXIMA_TEXTO);
  limitarEscala(TextInput, ESCALA_MAXIMA_CAMPOS);
  return texto;
}
