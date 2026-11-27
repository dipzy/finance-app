import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cores, espaco, fontes, tipografia } from '../../constants/tema';

// Peças pequenas dos blocos de dívidas (detalhe do crédito, simulador, estratégias)

// Uma linha "rótulo ........ valor"; o valor pode levar cor (ex.: verde para o que se poupa)
export function LinhaDado({
  rotulo,
  valor,
  cor,
  forte,
  nota,
}: {
  rotulo: string;
  valor: string;
  cor?: string;
  forte?: boolean;
  nota?: string;
}) {
  return (
    <View style={styles.linha} accessible accessibilityLabel={`${rotulo}: ${valor}`}>
      <View style={styles.rotuloCaixa}>
        <Text style={[styles.rotulo, forte && styles.rotuloForte]}>{rotulo}</Text>
        {!!nota && <Text style={styles.nota}>{nota}</Text>}
      </View>
      <Text style={[styles.valor, forte && styles.valorForte, cor ? { color: cor } : null]}>{valor}</Text>
    </View>
  );
}

// Um título pequeno que separa blocos dentro de um cartão
export function SubTitulo({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.subtitulo} accessibilityRole="header">
      {children}
    </Text>
  );
}

// Uma caixa com fundo suave para um cenário ou um bloco de números
export function Caixa({ children, destaque }: { children: ReactNode; destaque?: string }) {
  return <View style={[styles.caixa, destaque ? { borderColor: destaque } : null]}>{children}</View>;
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: espaco.md, paddingVertical: 3 },
  rotuloCaixa: { flex: 1 },
  rotulo: { ...tipografia.secundario, fontSize: 13 },
  rotuloForte: { color: cores.texto, fontFamily: fontes.corpoMedio },
  nota: { ...tipografia.nota, marginTop: 1 },
  valor: { ...tipografia.valor, fontSize: 14, textAlign: 'right' },
  valorForte: { fontFamily: fontes.numeroForte, fontSize: 15 },
  subtitulo: { ...tipografia.rotulo, fontSize: 11, marginTop: espaco.md, marginBottom: 4 },
  caixa: {
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 12,
    padding: espaco.md,
    marginTop: espaco.sm,
  },
});
