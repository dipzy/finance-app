import { Alert, Platform } from 'react-native';
import { t } from '../i18n';
import { comMotivoDeRede } from '../services/ligacao';

// As funções de formatação vivem em formatos.ts (sem React Native, para os testes)
export { formatarData, hojeISO, lerData, parseValor } from './formatos';

// Alert.alert não faz nada na web (react-native-web), por isso usamos window.alert
export function mostrarAlerta(titulo: string, mensagem: string) {
  // Um pedido acabou de falhar por falta de rede: dizê-lo (os ecrãs só sabem que não deu).
  // Com o seletor em inglês o título chega traduzido; aceitam-se as duas formas
  if (titulo === 'Erro' || titulo === t('Erro')) mensagem = comMotivoDeRede(mensagem);
  if (Platform.OS === 'web') {
    window.alert(`${titulo}\n\n${mensagem}`);
  } else {
    Alert.alert(titulo, mensagem);
  }
}
