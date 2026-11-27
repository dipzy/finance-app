import { StyleSheet, View } from 'react-native';
import { useT } from '../i18n';
import { cores, espaco } from '../constants/tema';
import { textoHoje, textoOntem } from '../utils/ecrasDespesas';
import { CampoTexto, Chip } from './ui';

interface CampoDataProps {
  valor: string; // dd/mm/aaaa, tal como está escrito
  onChange: (texto: string) => void;
  cor?: string; // cor do atalho escolhido (a do ecrã)
}

// Data de uma despesa: atalhos "Hoje" e "Ontem" (os casos mais comuns) ou escrita à mão.
// A validação (datas que não existem, no futuro...) é feita ao guardar, com lerDataEscrita
export function CampoData({ valor, onChange, cor = cores.primaria }: CampoDataProps) {
  const t = useT();
  const atalhos = [
    { rotulo: 'Hoje', texto: textoHoje() },
    { rotulo: 'Ontem', texto: textoOntem() },
  ];

  return (
    <View style={styles.container}>
      {atalhos.map(({ rotulo, texto }) => (
        <Chip
          key={rotulo}
          rotulo={t(rotulo)}
          ativo={valor.trim() === texto}
          cor={cor}
          onPress={() => onChange(texto)}
          accessibilityLabel={t('{rotulo}, {texto}', { rotulo: t(rotulo), texto })}
        />
      ))}
      {/* Teclado normal: o numérico do Android nem sempre tem a "/" */}
      <CampoTexto
        estiloCaixa={styles.caixaInput}
        placeholder={t('dd/mm/aaaa')}
        value={valor}
        onChangeText={onChange}
        maxLength={10}
        autoCorrect={false}
        accessibilityLabel={t('Data da despesa (dd/mm/aaaa)')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    marginBottom: espaco.md,
  },
  caixaInput: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
  },
});
