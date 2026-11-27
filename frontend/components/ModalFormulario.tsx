import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { brilho, cores, espaco, raio, sombras, tipografia } from '../constants/tema';

interface ModalFormularioProps {
  visivel: boolean;
  titulo: string;
  onFechar: () => void; // botão "voltar" do Android
  children: ReactNode;
}

// Caixa por cima do ecrã para editar uma despesa (usada pelos modais de edição).
// O ScrollView e o KeyboardAvoidingView evitam que o teclado tape os campos e os botões em telemóveis pequenos;
// keyboardShouldPersistTaps deixa carregar em "Guardar" à primeira, mesmo com o teclado aberto
export function ModalFormulario({ visivel, titulo, onFechar, children }: ModalFormularioProps) {
  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={onFechar}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
          <View style={styles.cartao}>
            <Text style={styles.titulo} accessibilityRole="header">
              {titulo}
            </Text>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Estilos comuns aos formulários dos modais (os campos e botões são os componentes de components/ui)
export const estilosFormulario = StyleSheet.create({
  // Rótulo de um campo que não é um CampoTexto (ex.: a data); igual ao rótulo do CampoTexto
  label: {
    ...tipografia.rotulo,
    fontSize: 11,
    marginBottom: 6,
  },
  nota: {
    ...tipografia.nota,
    fontStyle: 'italic',
    marginBottom: espaco.lg,
  },
  botaoPrincipal: {
    marginBottom: espaco.sm + 2,
  },
  // Lado a lado quando cabem; em ecrãs estreitos cada botão passa para a sua linha (o texto não parte)
  linhaBotoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm + 2,
  },
  botaoLinha: {
    flexGrow: 1,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: cores.sobreposicao,
  },
  conteudo: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: espaco.xl,
  },
  cartao: {
    backgroundColor: cores.superficieSolida,
    borderWidth: 1,
    borderColor: cores.bordaForte,
    borderRadius: raio.xl,
    padding: espaco.xl,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    boxShadow: `${sombras.cartao}, ${brilho(cores.primaria, 0.12, 40)}`,
  },
  titulo: {
    ...tipografia.tituloEcra,
    fontSize: 20,
    textAlign: 'center',
    marginBottom: espaco.xl,
  },
});
