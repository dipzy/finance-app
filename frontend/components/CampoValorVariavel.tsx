import { StyleSheet, Switch, Text, View } from 'react-native';
import { comAlfa, cores, espaco, tipografia } from '../constants/tema';
import { useT } from '../i18n';
import { CampoTexto } from './ui';

interface Props {
  variavel: boolean;
  onVariavel: (variavel: boolean) => void;
  unidade: string;
  onUnidade: (unidade: string) => void;
}

// Despesas cujo valor muda todos os meses (água, luz, gás): o valor passa a ser uma estimativa, não há débito
// automático e paga-se com o valor da fatura. A unidade do contador (kWh, m³) é opcional: com ela pede-se o consumo
export function CampoValorVariavel({ variavel, onVariavel, unidade, onUnidade }: Props) {
  const t = useT();
  return (
    <View style={styles.caixa}>
      <View style={styles.linha}>
        <View style={styles.textos}>
          <Text style={styles.titulo}>{t('O valor muda todos os meses')}</Text>
          <Text style={styles.nota}>{t('Água, luz, gás... O valor é uma estimativa (a média das últimas faturas) e pagas com o valor da fatura.')}</Text>
        </View>
        <Switch
          value={variavel}
          onValueChange={onVariavel}
          trackColor={{ false: cores.bordaForte, true: comAlfa(cores.positivo, 0.55) }}
          thumbColor={variavel ? cores.positivo : cores.texto}
          accessibilityLabel={t('O valor muda todos os meses')}
        />
      </View>
      {variavel && (
        <CampoTexto
          rotulo={t('Unidade do contador (opcional)')}
          placeholder={t('ex: kWh, m³')}
          value={unidade}
          onChangeText={onUnidade}
          maxLength={20}
          accessibilityLabel={t('Unidade do contador, por exemplo kWh ou m³')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { marginBottom: espaco.md },
  linha: { flexDirection: 'row', alignItems: 'center', gap: espaco.md, marginBottom: espaco.sm },
  textos: { flex: 1 },
  titulo: { ...tipografia.corpoMedio },
  nota: { ...tipografia.nota },
});
