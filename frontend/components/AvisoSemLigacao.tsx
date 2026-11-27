import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { comAlfa, cores, espaco, layout, raio, tipografia } from '../constants/tema';
import { useT } from '../i18n';
import { useSemLigacao } from '../services/ligacao';

// Faixa no cabeçalho (Header) enquanto não há internet: os gastos novos não se perdem
export function AvisoSemLigacao() {
  const semLigacao = useSemLigacao();
  const t = useT();
  if (!semLigacao) return null;

  return (
    <View style={styles.faixa} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={16} color={cores.aviso} />
      <Text style={styles.texto}>
        {t('Sem ligação — os gastos ficam guardados e são enviados quando voltar a internet')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    width: '100%',
    maxWidth: layout.larguraMaxima,
    alignSelf: 'center',
    marginTop: espaco.sm,
    paddingVertical: 6,
    paddingHorizontal: espaco.md,
    borderRadius: raio.md,
    backgroundColor: comAlfa(cores.aviso, 0.1),
    borderWidth: 1,
    borderColor: comAlfa(cores.aviso, 0.3),
  },
  texto: {
    ...tipografia.nota,
    flex: 1,
    color: cores.aviso,
  },
});
