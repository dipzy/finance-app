import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cores, espaco, layout, tipografia } from '../constants/tema';
import { useT } from '../i18n';
import { type Alerta, rotaDoAlerta, SeveridadeAlerta, textoSeveridade } from '../utils/alertas';

const ICONE: Record<SeveridadeAlerta, 'alert-circle' | 'warning-outline' | 'information-circle-outline'> = {
  critico: 'alert-circle',
  aviso: 'warning-outline',
  info: 'information-circle-outline',
};

export const corDoAlerta = (severidade: SeveridadeAlerta) =>
  severidade === 'critico' ? cores.negativo : severidade === 'aviso' ? cores.aviso : cores.azul;

// Um alerta: a gravidade (ícone + cor + texto para o leitor de ecrã), o título e a mensagem. Tocar
// abre o ecrã onde se resolve (orçamentos, despesas fixas, dívidas ou objetivos)
export function LinhaAlerta({ alerta, separada }: { alerta: Alerta; separada?: boolean }) {
  const t = useT();
  const cor = corDoAlerta(alerta.severidade);
  return (
    <Pressable
      onPress={() => router.push(rotaDoAlerta(alerta) as Href)}
      style={({ pressed }) => [styles.linha, separada && styles.separada, pressed && styles.premida]}
      accessibilityRole="button"
      accessibilityLabel={`${textoSeveridade(t, alerta.severidade)}: ${alerta.titulo}. ${alerta.mensagem}`}
      accessibilityHint={t('Abre o ecrã deste alerta')}
    >
      <Ionicons name={ICONE[alerta.severidade]} size={22} color={cor} accessibilityElementsHidden importantForAccessibility="no" />
      <View style={styles.textos}>
        <Text style={styles.titulo}>{alerta.titulo}</Text>
        <Text style={styles.mensagem}>{alerta.mensagem}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={cores.textoMudo} accessibilityElementsHidden importantForAccessibility="no" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    minHeight: layout.alvoToque + 8,
    paddingVertical: espaco.sm,
  },
  separada: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  premida: { opacity: 0.7 },
  textos: { flex: 1 },
  titulo: { ...tipografia.corpoMedio },
  mensagem: { ...tipografia.nota, color: cores.textoSecundario, marginTop: 2 },
});
