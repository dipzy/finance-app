import type { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { comAlfa, cores, espaco, raio, tipografia } from '../../constants/tema';
import { useT } from '../../i18n';
import { Icone } from './Icone';
import type { IconeOuEmoji } from './tipos';

interface TituloSecaoProps {
  titulo: string;
  icone?: IconeOuEmoji;
  cor?: string; // cor do ícone (por defeito ciano)
  direita?: ReactNode; // ex.: um total ao lado do título
  style?: StyleProp<ViewStyle>;
}

// Título de um cartão ou de uma secção do ecrã, com um ícone num quadrado de vidro colorido
export function TituloSecao({ titulo, icone, cor = cores.primaria, direita, style }: TituloSecaoProps) {
  const t = useT();
  return (
    <View style={[styles.linha, style]}>
      {icone && (
        <View style={[styles.icone, { backgroundColor: comAlfa(cor, 0.14), borderColor: comAlfa(cor, 0.3) }]}>
          <Icone nome={icone} size={16} color={cor} />
        </View>
      )}
      <Text style={styles.titulo} accessibilityRole="header">
        {t(titulo)}
      </Text>
      {direita}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm + 2,
    marginBottom: espaco.md,
  },
  icone: {
    width: 30,
    height: 30,
    borderRadius: raio.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    ...tipografia.tituloCartao,
    flex: 1,
  },
});
