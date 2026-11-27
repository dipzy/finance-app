import { StyleSheet, Text, TextProps } from 'react-native';
import { cores, tipografia } from '../../constants/tema';

// auto: entra em menta, sai em coral (pelo sinal) · entrada/saida: cor fixa ·
// neutro: texto normal (coral se for negativo) · destaque: ciano (coral se for negativo)
export type TipoValor = 'auto' | 'entrada' | 'saida' | 'neutro' | 'destaque';

interface ValorEuroProps extends Omit<TextProps, 'children'> {
  valor: number | undefined; // undefined enquanto carrega: mostra "…"
  tipo?: TipoValor;
  prefixo?: string; // ex.: "-" nas despesas, "+" no salário
  cor?: string; // força uma cor (ex.: o acento de um bloco)
}

// "12.50 €": o mesmo formato que a app sempre mostrou
export function formatarEuro(valor: number | undefined, prefixo = ''): string {
  return valor === undefined ? '…' : `${prefixo}${valor.toFixed(2)} €`;
}

export function corDoValor(valor: number | undefined, tipo: TipoValor = 'neutro'): string {
  const v = valor ?? 0;
  switch (tipo) {
    case 'entrada':
      return cores.positivo;
    case 'saida':
      return cores.negativo;
    case 'auto':
      return v > 0 ? cores.positivo : v < 0 ? cores.negativo : cores.texto;
    case 'destaque':
      return v < 0 ? cores.negativo : cores.primaria;
    default:
      return v < 0 ? cores.negativo : cores.texto;
  }
}

// Um valor em euros com 2 casas decimais, em Space Grotesk com algarismos de largura fixa
export function ValorEuro({ valor, tipo = 'neutro', prefixo, cor, style, ...resto }: ValorEuroProps) {
  return (
    <Text style={[styles.valor, { color: cor ?? corDoValor(valor, tipo) }, style]} {...resto}>
      {formatarEuro(valor, prefixo)}
    </Text>
  );
}

const styles = StyleSheet.create({
  valor: {
    ...tipografia.valor,
  },
});
