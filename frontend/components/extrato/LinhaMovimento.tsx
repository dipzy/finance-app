import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cores, espaco, fontes, layout, tipografia } from '../../constants/tema';
import { useT } from '../../i18n';
import type { MovimentoPrevisto } from '../../services/extratoApi';
import type { MovimentoLido } from '../../services/extratoBancario';
import { infoCategoria, nomeCategoria } from '../../utils/categorias';
import { dataCurta, euro } from '../../utils/dividas';
import type { EscolhaMovimento } from '../../utils/extrato';

// Um movimento do extrato: caixa para escolher se se importa, a data, a descrição, o valor e a categoria
// (que se muda tocando nela). Os já importados ficam esbatidos e sem caixa; os que parecem repetir uma
// despesa feita à mão levam um aviso
export function LinhaMovimento({
  movimento,
  previsto,
  escolha,
  onAlternar,
  onMudarCategoria,
}: {
  movimento: MovimentoLido;
  previsto: MovimentoPrevisto | undefined;
  escolha: EscolhaMovimento | undefined;
  onAlternar: () => void;
  onMudarCategoria: () => void;
}) {
  const t = useT();
  const jaImportado = previsto?.jaImportado === true;
  const incluido = !jaImportado && escolha?.incluido === true;
  const categoria = infoCategoria(escolha?.categoria ?? previsto?.categoria);

  return (
    <View style={[styles.linha, jaImportado && styles.esbatida]}>
      <Pressable
        onPress={onAlternar}
        disabled={jaImportado}
        style={styles.caixaToque}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: incluido, disabled: jaImportado }}
        accessibilityLabel={`${movimento.descricao}, ${euro(Math.abs(movimento.valor))}, ${dataCurta(movimento.data)}`}
      >
        <View style={[styles.caixa, incluido && styles.caixaMarcada]}>
          {incluido && <Ionicons name="checkmark" size={16} color={cores.fundo} />}
        </View>
      </Pressable>

      <View style={styles.texto}>
        <Text style={styles.titulo} numberOfLines={2}>
          {movimento.descricao}
        </Text>
        <Text style={styles.data}>{dataCurta(movimento.data)}</Text>
        {jaImportado && <Text style={styles.aviso}>{t('Já importado')}</Text>}
        {!jaImportado && !!previsto?.possivelDuplicadoDe && (
          <Text style={styles.aviso}>{t('Parece repetir «{titulo}», que já registaste.', { titulo: previsto.possivelDuplicadoDe })}</Text>
        )}
        {!jaImportado && (
          <Pressable onPress={onMudarCategoria} accessibilityRole="button" accessibilityLabel={t('Mudar a categoria: {nome}', { nome: nomeCategoria(categoria.chave) })} hitSlop={6}>
            <View style={styles.categoria}>
              <Ionicons name={categoria.icone} size={13} color={categoria.cor} />
              <Text style={[styles.categoriaTexto, { color: categoria.cor }]}>{nomeCategoria(categoria.chave)}</Text>
            </View>
          </Pressable>
        )}
      </View>

      <Text style={styles.valor}>{euro(Math.abs(movimento.valor))}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaco.md,
    paddingVertical: espaco.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.borda,
  },
  esbatida: { opacity: 0.5 },
  caixaToque: { minWidth: layout.alvoToque - 12, minHeight: layout.alvoToque - 12, justifyContent: 'center', alignItems: 'center' },
  caixa: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: cores.bordaForte,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caixaMarcada: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  texto: { flex: 1 },
  titulo: { ...tipografia.corpoMedio, fontSize: 14 },
  data: { ...tipografia.nota, marginTop: 1 },
  aviso: { ...tipografia.nota, color: cores.aviso, marginTop: 2 },
  categoria: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  categoriaTexto: { fontFamily: fontes.corpoMedio, fontSize: 12 },
  valor: { ...tipografia.valor, fontSize: 14, marginTop: 2 },
});
