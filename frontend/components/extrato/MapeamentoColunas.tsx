import { StyleSheet, Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../../constants/tema';
import { useT } from '../../i18n';
import type { Mapeamento, Tabela } from '../../services/extratoBancario';
import { Chip } from '../ui';

// Que coluna do CSV é cada coisa. A app adivinha; aqui a pessoa corrige se o banco usar outro formato.
// O valor pode ser uma só coluna (com sinal) ou duas (débito e crédito)
export function MapeamentoColunas({
  tabela,
  mapeamento,
  onChange,
}: {
  tabela: Tabela;
  mapeamento: Mapeamento;
  onChange: (mapeamento: Mapeamento) => void;
}) {
  const t = useT();
  const colunas = tabela.cabecalhos.map((cabecalho, i) => ({ i, nome: cabecalho || t('Coluna {n}', { n: i + 1 }) }));
  const doisValores = mapeamento.valor === undefined;
  const exemplo = tabela.linhas[0] ?? [];

  const escolher = (campo: keyof Mapeamento, indice: number) => onChange({ ...mapeamento, [campo]: indice });

  function Escolha({ campo, rotulo }: { campo: keyof Mapeamento; rotulo: string }) {
    return (
      <View style={styles.bloco}>
        <Text style={styles.rotulo}>{rotulo}</Text>
        <View style={styles.chips}>
          {colunas.map((c) => (
            <Chip key={c.i} rotulo={c.nome} ativo={mapeamento[campo] === c.i} onPress={() => escolher(campo, c.i)} />
          ))}
        </View>
      </View>
    );
  }

  const texto = (indice: number | undefined) => (indice === undefined ? '—' : exemplo[indice] || '—');

  return (
    <View>
      <Escolha campo="data" rotulo={t('Coluna da data')} />
      <Escolha campo="descricao" rotulo={t('Coluna da descrição')} />

      <View style={styles.bloco}>
        <Text style={styles.rotulo}>{t('O valor vem em')}</Text>
        <View style={styles.chips}>
          <Chip
            rotulo={t('Uma coluna (com sinal)')}
            ativo={!doisValores}
            onPress={() => {
              const candidata = mapeamento.debito ?? mapeamento.credito ?? colunas.find((c) => c.i !== mapeamento.data && c.i !== mapeamento.descricao)?.i ?? 0;
              onChange({ data: mapeamento.data, descricao: mapeamento.descricao, valor: candidata });
            }}
          />
          <Chip
            rotulo={t('Débito e crédito')}
            ativo={doisValores}
            onPress={() => {
              const livres = colunas.filter((c) => c.i !== mapeamento.data && c.i !== mapeamento.descricao).map((c) => c.i);
              onChange({ data: mapeamento.data, descricao: mapeamento.descricao, debito: livres[0], credito: livres[1] });
            }}
          />
        </View>
      </View>

      {doisValores ? (
        <>
          <Escolha campo="debito" rotulo={t('Coluna do débito (o que saiu)')} />
          <Escolha campo="credito" rotulo={t('Coluna do crédito (o que entrou)')} />
        </>
      ) : (
        <Escolha campo="valor" rotulo={t('Coluna do valor')} />
      )}

      {exemplo.length > 0 && (
        <Text style={styles.exemplo}>
          {t('Primeira linha: {data} · {descricao} · {valor}', {
            data: texto(mapeamento.data),
            descricao: texto(mapeamento.descricao),
            valor: doisValores ? `${texto(mapeamento.debito)} / ${texto(mapeamento.credito)}` : texto(mapeamento.valor),
          })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: { marginBottom: espaco.md },
  rotulo: { ...tipografia.rotulo, fontSize: 11, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  exemplo: { ...tipografia.nota, color: cores.textoSecundario, fontStyle: 'italic' },
});
