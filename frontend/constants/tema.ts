import type { TextStyle } from 'react-native';
import { esquemaInicial } from './esquema';
import { comAlfa, temas, type Degrade } from './paletas';

// Tokens do design: tema escuro "fintech" (fundo azul-marinho, cartões de vidro, acentos néon) ou
// claro (ver constants/paletas.ts). Todos os ecrãs e componentes usam estes valores em vez de cores e
// tamanhos soltos. O esquema é escolhido ao arrancar (constants/esquema.ts) e não muda até reiniciar

export { comAlfa };
export type { Degrade };

/** 'escuro' ou 'claro': o esquema desta sessão. */
export const esquemaAplicado = esquemaInicial();
const tema = temas[esquemaAplicado];

export const cores = tema.cores;

export const acentosFolha = tema.acentosFolha;

export const gradientes = tema.gradientes;

export const espaco = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const raio = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pilula: 999,
};

export const layout = {
  // Em ecrãs largos (web) o conteúdo fica centrado com esta largura máxima
  larguraMaxima: 760,
  // Tamanho mínimo confortável para tocar com o dedo
  alvoToque: 44,
  margemEcra: 16,
};

// Os nomes têm de ser os mesmos do useFonts em app/_layout.tsx.
// Cada peso é uma família à parte: no Android, fontWeight com uma fonte própria pode cair na fonte do sistema
export const fontes = {
  titulo: 'SpaceGrotesk_700Bold',
  tituloMedio: 'SpaceGrotesk_600SemiBold',
  numero: 'SpaceGrotesk_600SemiBold',
  numeroForte: 'SpaceGrotesk_700Bold',
  numeroLeve: 'SpaceGrotesk_500Medium',
  corpo: 'Inter_400Regular',
  corpoMedio: 'Inter_500Medium',
  corpoForte: 'Inter_600SemiBold',
};

// Estilos de texto prontos a espalhar nos StyleSheet ({ ...tipografia.corpo, marginTop: 4 })
export const tipografia = {
  tituloEcra: { fontFamily: fontes.titulo, fontSize: 22, color: cores.texto, letterSpacing: -0.3 },
  tituloCartao: { fontFamily: fontes.tituloMedio, fontSize: 16, color: cores.texto },
  rotulo: {
    fontFamily: fontes.corpoMedio,
    fontSize: 12,
    color: cores.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  corpo: { fontFamily: fontes.corpo, fontSize: 15, color: cores.texto },
  corpoMedio: { fontFamily: fontes.corpoMedio, fontSize: 15, color: cores.texto },
  secundario: { fontFamily: fontes.corpo, fontSize: 14, color: cores.textoSecundario },
  nota: { fontFamily: fontes.corpo, fontSize: 12, color: cores.textoMudo, lineHeight: 17 },
  // Valores em dinheiro: algarismos todos com a mesma largura para as colunas alinharem
  valor: { fontFamily: fontes.numero, fontSize: 15, color: cores.texto, fontVariant: ['tabular-nums'] },
  valorGrande: { fontFamily: fontes.numeroForte, fontSize: 36, color: cores.texto, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

// Brilho suave à volta de um elemento, na cor do acento (boxShadow funciona na web e no RN 0.81)
export function brilho(cor: string, alfa = 0.22, raioBlur = 24): string {
  return `0 0 ${raioBlur}px ${comAlfa(cor, alfa)}`;
}

export const sombras = tema.sombras;

export const acentosCategorias = tema.acentosCategorias;
