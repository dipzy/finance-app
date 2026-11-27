import { LinearGradient } from 'expo-linear-gradient';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { brilho, cores } from '../constants/tema';

type Degrade = readonly [string, string, ...string[]];

interface BarraProgressoProps {
  percentagem: number; // 0-100 (acima de 100 fica cheia)
  cor: string; // cor da barra e do brilho néon
  degrade?: Degrade; // em vez da cor lisa (ex.: gradientes.progresso)
  altura?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

// Barra de progresso néon (orçamentos, objetivos, gráficos de barras horizontais)
export function BarraProgresso({ percentagem, cor, degrade, altura = 8, accessibilityLabel, style }: BarraProgressoProps) {
  const parte = Math.min(100, Math.max(0, Number.isFinite(percentagem) ? percentagem : 0));
  const forma = { height: altura, borderRadius: altura / 2 };
  const barra = [styles.barra, forma, { width: `${parte}%` as const, boxShadow: brilho(cor, 0.6, 10) }];

  return (
    <View
      style={[styles.fundo, forma, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(parte) }}
    >
      {parte > 0 &&
        (degrade ? (
          <LinearGradient colors={degrade} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={barra} />
        ) : (
          <View style={[barra, { backgroundColor: cor }]} />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fundo: {
    backgroundColor: cores.superficieAlta,
    overflow: 'hidden',
  },
  barra: {
    minWidth: 3,
  },
});
