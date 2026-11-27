import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { brilho, comAlfa, cores, espaco, fontes, layout, raio } from '../../constants/tema';
import { useT } from '../../i18n';
import type { NomeIcone } from './tipos';

interface ChipProps {
  rotulo: string;
  onPress: () => void;
  ativo?: boolean;
  cor?: string; // cor quando está escolhido (por defeito ciano)
  icone?: NomeIcone; // à esquerda do texto, na cor do chip (ex.: a categoria de uma despesa)
  desativado?: boolean; // fica esbatido e não responde ao toque (ex.: uma média que ainda não existe)
  contador?: number; // bolinha com um número ao lado do texto (ex.: pendentes por resolver); não aparece a 0
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

// Opção que se escolhe com um toque (folha do Excel, mês, prestação, "Hoje"/"Ontem")
export function Chip({ rotulo, onPress, ativo, cor = cores.primaria, icone, desativado, contador, accessibilityLabel, style }: ChipProps) {
  const t = useT();
  return (
    <Pressable
      onPress={desativado ? undefined : onPress}
      disabled={desativado}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!ativo, disabled: !!desativado }}
      style={({ pressed }) => [
        styles.chip,
        desativado && styles.desativado,
        icone && styles.comIcone,
        !!contador && styles.comContador,
        ativo && { backgroundColor: cor, borderColor: cor, boxShadow: brilho(cor, 0.35, 16) },
        pressed && styles.premido,
        style,
      ]}
    >
      {icone && (
        <Ionicons name={icone} size={16} color={ativo ? cores.sobreAcento : cor} accessibilityElementsHidden importantForAccessibility="no" aria-hidden />
      )}
      <Text style={[styles.texto, ativo && styles.textoAtivo]}>{t(rotulo)}</Text>
      {!!contador && contador > 0 && (
        <View style={[styles.contador, { backgroundColor: ativo ? cores.sobreAcento : cores.aviso }]}>
          <Text style={[styles.contadorTexto, { color: ativo ? cor : cores.sobreAcento }]}>{contador > 99 ? '99+' : contador}</Text>
        </View>
      )}
    </Pressable>
  );
}

interface EtiquetaProps {
  texto: string;
  cor?: string;
  icone?: NomeIcone;
  style?: StyleProp<ViewStyle>;
}

// Etiqueta pequena, só informativa (ex.: "Pago", para onde vai um bloco ao importar)
export function Etiqueta({ texto, cor = cores.textoSecundario, icone, style }: EtiquetaProps) {
  const t = useT();
  return (
    <View style={[styles.etiqueta, { backgroundColor: comAlfa(cor, 0.12), borderColor: comAlfa(cor, 0.3) }, style]}>
      {icone && <Ionicons name={icone} size={13} color={cor} style={styles.etiquetaIcone} />}
      <Text style={[styles.etiquetaTexto, { color: cor }]}>{t(texto)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: layout.alvoToque,
    paddingHorizontal: espaco.lg - 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: raio.pilula,
    borderWidth: 1,
    borderColor: cores.bordaForte,
    backgroundColor: cores.superficie,
  },
  comIcone: {
    flexDirection: 'row',
    gap: 6,
    paddingLeft: espaco.md,
  },
  comContador: {
    flexDirection: 'row',
    gap: 8,
  },
  premido: {
    opacity: 0.8,
  },
  desativado: {
    opacity: 0.4,
  },
  texto: {
    fontFamily: fontes.corpoMedio,
    fontSize: 14,
    color: cores.texto,
  },
  textoAtivo: {
    fontFamily: fontes.corpoForte,
    color: cores.sobreAcento,
  },
  contador: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contadorTexto: {
    fontFamily: fontes.corpoForte,
    fontSize: 12,
    lineHeight: 16,
  },
  etiqueta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: raio.sm,
    paddingVertical: espaco.xs,
    paddingHorizontal: espaco.sm,
  },
  etiquetaIcone: {
    marginRight: 6,
    marginTop: 1,
  },
  etiquetaTexto: {
    flexShrink: 1,
    fontFamily: fontes.corpoMedio,
    fontSize: 12,
    lineHeight: 16,
  },
});
