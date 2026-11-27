import { StyleSheet, Text, View } from 'react-native';
import { useT } from '../i18n';
import { cores, espaco, tipografia } from '../constants/tema';
import { OPCOES_REPETICAO, Repeticao } from '../services/gastosRecorrentes';
import { Chip } from './ui';

interface SeletorRepeticaoProps {
  valor: Repeticao;
  onChange: (valor: Repeticao) => void;
  cor?: string;
}

// "Repetir": Não / Todos os dias / Todas as semanas / Todos os meses
export function SeletorRepeticao({ valor, onChange, cor = cores.primaria }: SeletorRepeticaoProps) {
  const t = useT();
  return (
    <View style={styles.caixa}>
      <Text style={styles.rotulo}>{t('Repetir')}</Text>
      <View style={styles.opcoes}>
        {OPCOES_REPETICAO.map((opcao) => (
          <Chip
            key={opcao.valor}
            rotulo={t(opcao.rotulo)}
            icone={opcao.valor === 'nao' ? undefined : 'repeat'}
            cor={cor}
            ativo={valor === opcao.valor}
            onPress={() => onChange(opcao.valor)}
            accessibilityLabel={t('Repetir: {rotulo}', { rotulo: t(opcao.rotulo) })}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: {
    marginBottom: espaco.md,
  },
  rotulo: {
    ...tipografia.rotulo,
    fontSize: 11,
    marginBottom: 6,
  },
  opcoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
});
