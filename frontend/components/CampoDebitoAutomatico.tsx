import { StyleSheet, Switch, Text, View } from 'react-native';
import { comAlfa, cores, espaco, tipografia } from '../constants/tema';
import { useT } from '../i18n';

interface Props {
  ligado: boolean;
  onMudar: (ligado: boolean) => void;
}

// Só faz sentido numa despesa com dia de débito e de valor fixo (quem mostra decide). Ligado, a despesa é paga sozinha
// nesse dia; desligado, o dia serve de lembrete e paga-se à mão. Pagar à mão antes do dia dá sempre
export function CampoDebitoAutomatico({ ligado, onMudar }: Props) {
  const t = useT();
  return (
    <View style={styles.linha}>
      <View style={styles.textos}>
        <Text style={styles.titulo}>{t('Débito automático')}</Text>
        <Text style={styles.nota}>
          {ligado
            ? t('Paga-se sozinha no dia de débito. Podes pagá-la à mão antes, quando quiseres.')
            : t('Não se paga sozinha: o dia de débito é só um lembrete e pagas à mão.')}
        </Text>
      </View>
      <Switch
        value={ligado}
        onValueChange={onMudar}
        trackColor={{ false: cores.bordaForte, true: comAlfa(cores.positivo, 0.55) }}
        thumbColor={ligado ? cores.positivo : cores.texto}
        accessibilityLabel={t('Débito automático')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: espaco.md, marginBottom: espaco.md },
  textos: { flex: 1 },
  titulo: { ...tipografia.corpoMedio },
  nota: { ...tipografia.nota },
});
