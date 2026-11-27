import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { comAlfa, cores, espaco, fontes, gradientes, layout, raio, sombras } from '../../constants/tema';
import { useT } from '../../i18n';
import type { NomeIcone } from './tipos';

// primario: degradê ciano → violeta (a ação principal do ecrã) · secundario: vidro com borda no acento ·
// perigo: coral (apagar, remover, terminar) · fantasma: só texto (cancelar, ligações)
export type VarianteBotao = 'primario' | 'secundario' | 'perigo' | 'fantasma';

interface BotaoProps {
  titulo: string;
  onPress: () => void;
  variante?: VarianteBotao;
  icone?: NomeIcone;
  desativado?: boolean;
  aCarregar?: boolean; // mostra um indicador no lugar do ícone (o texto vem do ecrã, ex.: "A guardar…")
  pequeno?: boolean;
  cor?: string; // secundario/fantasma: cor do texto e da borda (por defeito ciano / cinzento)
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Botao({
  titulo,
  onPress,
  variante = 'primario',
  icone,
  desativado,
  aCarregar,
  pequeno,
  cor,
  style,
  accessibilityLabel,
  accessibilityHint,
}: BotaoProps) {
  const t = useT();
  const corTexto =
    variante === 'primario'
      ? cores.sobreAcento
      : variante === 'perigo'
        ? cores.negativo
        : variante === 'secundario'
          ? (cor ?? cores.primaria)
          : (cor ?? cores.textoSecundario);
  const estiloVariante =
    variante === 'primario'
      ? styles.primario
      : variante === 'fantasma'
        ? null
        : { backgroundColor: comAlfa(corTexto, 0.08), borderWidth: 1, borderColor: comAlfa(corTexto, 0.45) };
  const inativo = !!desativado || !!aCarregar;

  return (
    <Pressable
      onPress={onPress}
      disabled={inativo}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inativo, busy: !!aCarregar }}
      style={({ pressed }) => [
        styles.base,
        pequeno && styles.pequeno,
        estiloVariante,
        pressed && styles.premido,
        desativado && styles.desativado,
        style,
      ]}
    >
      {variante === 'primario' && (
        <LinearGradient
          colors={gradientes.primario}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.degrade, pequeno && styles.degradePequeno]}
        />
      )}
      {aCarregar ? (
        <ActivityIndicator size="small" color={corTexto} />
      ) : (
        icone && (
          <Ionicons name={icone} size={pequeno ? 16 : 18} color={corTexto} accessibilityElementsHidden importantForAccessibility="no" aria-hidden />
        )
      )}
      <Text style={[styles.texto, pequeno && styles.textoPequeno, { color: corTexto }]}>{t(titulo)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    paddingHorizontal: espaco.xl,
    paddingVertical: espaco.md,
    borderRadius: raio.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaco.sm,
  },
  pequeno: {
    minHeight: layout.alvoToque,
    paddingHorizontal: espaco.md,
    paddingVertical: espaco.sm,
    borderRadius: raio.md,
    gap: 6,
  },
  primario: {
    boxShadow: sombras.botao,
  },
  degrade: {
    ...StyleSheet.absoluteFill,
    borderRadius: raio.md + 2,
  },
  degradePequeno: {
    borderRadius: raio.md,
  },
  premido: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  desativado: {
    opacity: 0.4,
  },
  texto: {
    fontFamily: fontes.corpoForte,
    fontSize: 16,
    textAlign: 'center',
    flexShrink: 1,
  },
  textoPequeno: {
    fontSize: 13,
  },
});
