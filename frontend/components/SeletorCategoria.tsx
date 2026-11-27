import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from '../i18n';
import { cores, espaco, tipografia } from '../constants/tema';
import type { Categoria } from '../services/tipos';
import { CATEGORIAS } from '../utils/categorias';
import { Chip } from './ui';

interface SeletorCategoriaProps {
  valor: Categoria | undefined;
  onChange: (categoria: Categoria) => void;
  onLimpar?: () => void;
  // A escolhida é a que a app sugeriu pelo título (mostra "sugerida")
  sugerida?: boolean;
  // Quando a sugestão veio de uma regra de categorização: "Regra: Continente" (no lugar de "sugerida pelo título")
  origemTexto?: string;
  // Só estas (ex.: no orçamento novo, as categorias que ainda não têm orçamento); por defeito todas
  disponiveis?: Categoria[];
  rotulo?: string;
}

// Chips com o ícone e a cor de cada categoria, em várias linhas (todas à vista): cada categoria
// aparece uma só vez e a escolhida (ou a sugerida pelo título) fica destacada
export function SeletorCategoria({ valor, onChange, onLimpar, sugerida, origemTexto, disponiveis, rotulo = 'Categoria' }: SeletorCategoriaProps) {
  const t = useT();
  const lista = disponiveis ? CATEGORIAS.filter((c) => disponiveis.includes(c.chave)) : CATEGORIAS;

  return (
    <View style={styles.caixa}>
      <View style={styles.topo}>
        <Text style={styles.rotulo}>{t(rotulo)}</Text>
        {sugerida && (
          <>
            <Ionicons name="sparkles-outline" size={12} color={cores.textoMudo} />
            <Text style={styles.sugerida}>{origemTexto ?? t('sugerida pelo título')}</Text>
          </>
        )}
      </View>
      <View style={styles.lista}>
        {onLimpar && (
          <Chip
            rotulo={t('Sem categoria')}
            icone="remove-circle-outline"
            cor={cores.textoMudo}
            ativo={valor === undefined}
            onPress={onLimpar}
            accessibilityLabel={valor === undefined ? t('Sem categoria, selecionado') : t('Sem categoria')}
          />
        )}
        {lista.map((c) => (
          <Chip
            key={c.chave}
            rotulo={t(c.nome)}
            icone={c.icone}
            cor={c.cor}
            ativo={valor === c.chave}
            onPress={() => onChange(c.chave)}
            accessibilityLabel={
              valor === c.chave && sugerida ? t('Categoria {nome}, sugerida', { nome: t(c.nome) }) : t('Categoria {nome}', { nome: t(c.nome) })
            }
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
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  rotulo: {
    ...tipografia.rotulo,
    fontSize: 11,
  },
  sugerida: {
    ...tipografia.nota,
    color: cores.textoMudo,
  },
  lista: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 2,
  },
});
