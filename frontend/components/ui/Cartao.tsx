import type { ReactNode } from 'react';
import { AccessibilityRole, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { brilho as sombraBrilho, cores, espaco, raio, sombras } from '../../constants/tema';

interface CartaoProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  acento?: string; // barra colorida à esquerda (e cor do brilho)
  brilho?: boolean; // brilho suave à volta, para os cartões mais importantes
  ativo?: boolean; // em edição: borda na cor do acento
  // Com onPress o cartão inteiro é um botão (com resposta ao toque)
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
}

// Cartão de "vidro": branco muito transparente por cima do fundo escuro, com borda fina
export function Cartao({
  children,
  style,
  acento,
  brilho,
  ativo,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
}: CartaoProps) {
  const estilo = [
    styles.cartao,
    acento ? { borderLeftWidth: 3, borderLeftColor: acento } : null,
    brilho ? { boxShadow: `${sombras.cartao}, ${sombraBrilho(acento ?? cores.primaria, 0.14, 28)}` } : null,
    ativo ? { borderColor: acento ?? cores.primaria, borderWidth: 1.5 } : null,
    style,
  ];

  if (!onPress) return <View style={estilo}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [estilo, pressed && styles.premido]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cartao: {
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.lg,
    padding: espaco.lg,
    marginBottom: espaco.md,
  },
  premido: {
    backgroundColor: cores.superficiePremida,
    transform: [{ scale: 0.99 }],
  },
});
