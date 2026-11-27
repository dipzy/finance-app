import { Alert, Platform } from 'react-native';
import { t } from '../i18n';

// Pergunta antes de uma ação que mexe no dinheiro ou não se desfaz (apagar, terminar).
// Alert.alert não faz nada na web (react-native-web), por isso aí usamos window.confirm.
// Devolve true só se a pessoa escolher o botão de confirmar
export function confirmar(titulo: string, mensagem: string, textoConfirmar = 'Confirmar'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${titulo}\n\n${mensagem}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      titulo,
      mensagem,
      [
        { text: t('Cancelar'), style: 'cancel', onPress: () => resolve(false) },
        { text: t(textoConfirmar), onPress: () => resolve(true) },
      ],
      // No Android, tocar fora do alerta (ou no botão de voltar) fecha-o sem escolher: conta como Cancelar
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
