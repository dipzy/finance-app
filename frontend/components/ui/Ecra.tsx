import { LinearGradient } from 'expo-linear-gradient';
import { useContext, type ReactNode, type Ref } from 'react';
import { ScrollView, ScrollViewProps, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { comAlfa, cores, espaco, gradientes, layout } from '../../constants/tema';

// Espaço a mais no fim dos ecrãs principais (os que têm cabeçalho) para o botão rápido "+"
// (components/GestorGastoRapido.tsx) não tapar o último elemento da lista
export const ESPACO_BOTAO_RAPIDO = 72;

interface EcraProps {
  children: ReactNode;
  cabecalho?: ReactNode; // Header e SideMenu: ficam fora do scroll, a toda a largura
  sobreposicao?: ReactNode; // modais do ecrã (fora do scroll)
  centrarVertical?: boolean; // conteúdo ao meio do ecrã quando é curto (login)
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  scrollRef?: Ref<ScrollView>; // para o ecrã poder rolar até um ponto (ex.: ao formulário de edição)
}

// Fundo de todos os ecrãs: degradê azul-marinho com dois brilhos decorativos.
// O conteúdo rola e fica centrado com uma largura máxima (na web, em ecrãs largos);
// em baixo soma-se a barra de navegação do Android (a app desenha por trás dela)
export function Ecra({ children, cabecalho, sobreposicao, centrarVertical, keyboardShouldPersistTaps, scrollRef }: EcraProps) {
  // Sem SafeAreaProvider (testes) fica 0
  const insets = useContext(SafeAreaInsetsContext);

  return (
    <View style={styles.raiz}>
      {/* O fundo fica numa camada à parte, cortada à medida do ecrã: os brilhos saem para fora dela
          e, se estivessem diretamente na raiz, a web podia fazer scroll da raiz ao focar um campo */}
      <View style={styles.fundo}>
        <LinearGradient colors={gradientes.fundo} style={StyleSheet.absoluteFill} />
        <View style={[styles.brilho, styles.brilhoCiano]} />
        <View style={[styles.brilho, styles.brilhoVioleta]} />
      </View>

      {cabecalho}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.conteudo,
          { paddingBottom: espaco.xxxl + (insets?.bottom ?? 0) + (cabecalho ? ESPACO_BOTAO_RAPIDO : 0) },
          centrarVertical && styles.centrado,
          centrarVertical && !cabecalho && { paddingTop: espaco.xxl + (insets?.top ?? 0) },
        ]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      >
        {children}
      </ScrollView>

      {sobreposicao}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
    backgroundColor: cores.fundo,
  },
  fundo: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  // Círculos muito ténues com um brilho largo: dão profundidade sem distrair do conteúdo
  brilho: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    pointerEvents: 'none',
  },
  brilhoCiano: {
    top: -180,
    right: -140,
    backgroundColor: comAlfa(cores.primaria, 0.06),
    boxShadow: `0 0 120px 60px ${comAlfa(cores.primaria, 0.05)}`,
  },
  brilhoVioleta: {
    bottom: -200,
    left: -160,
    backgroundColor: comAlfa(cores.violeta, 0.07),
    boxShadow: `0 0 140px 70px ${comAlfa(cores.violeta, 0.06)}`,
  },
  scroll: {
    flex: 1,
  },
  conteudo: {
    width: '100%',
    maxWidth: layout.larguraMaxima,
    alignSelf: 'center',
    padding: layout.margemEcra,
  },
  centrado: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
