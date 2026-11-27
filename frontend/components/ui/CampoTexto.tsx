import { useState } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { comAlfa, cores, esquemaAplicado, espaco, fontes, raio, tipografia } from '../../constants/tema';
import { useT } from '../../i18n';

interface CampoTextoProps extends TextInputProps {
  rotulo?: string; // texto por cima do campo (também é o nome lido pelo leitor de ecrã, se não houver outro)
  estiloCaixa?: StyleProp<ViewStyle>; // a caixa à volta (rótulo + campo)
}

// Campo de texto escuro: fundo de vidro, borda ciano quando está a ser escrito.
// Os onFocus/onBlur de quem o usa continuam a ser chamados (ex.: gravar ao sair do campo)
export function CampoTexto({ rotulo, estiloCaixa, style, onFocus, onBlur, accessibilityLabel, ...resto }: CampoTextoProps) {
  const [focado, setFocado] = useState(false);
  const t = useT();

  return (
    <View style={[styles.caixa, estiloCaixa]}>
      {!!rotulo && <Text style={styles.rotulo}>{t(rotulo)}</Text>}
      <TextInput
        placeholderTextColor={cores.textoMudo}
        keyboardAppearance={esquemaAplicado === 'claro' ? 'light' : 'dark'}
        selectionColor={comAlfa(cores.primaria, 0.4)}
        cursorColor={cores.primaria}
        accessibilityLabel={accessibilityLabel ?? (rotulo ? t(rotulo) : undefined)}
        {...resto}
        onFocus={(e) => {
          setFocado(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocado(false);
          onBlur?.(e);
        }}
        style={[estilosCampo.campo, focado && estilosCampo.campoFocado, style]}
      />
    </View>
  );
}

// Também usados por campos que não cabem no CampoTexto (ex.: o nome editável de cada poupança)
export const estilosCampo = StyleSheet.create({
  campo: {
    minHeight: 48,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.bordaForte,
    borderRadius: raio.md,
    paddingHorizontal: espaco.md + 2,
    paddingVertical: espaco.md,
    fontFamily: fontes.corpo,
    fontSize: 16,
    color: cores.texto,
    // Na web o contorno do browser somava-se à borda de foco
    outlineWidth: 0,
  },
  campoFocado: {
    borderColor: cores.primaria,
    backgroundColor: comAlfa(cores.primaria, 0.05),
    boxShadow: `0 0 0 3px ${comAlfa(cores.primaria, 0.12)}`,
  },
});

const styles = StyleSheet.create({
  caixa: {
    marginBottom: espaco.md,
  },
  rotulo: {
    ...tipografia.rotulo,
    fontSize: 11,
    marginBottom: 6,
  },
});
