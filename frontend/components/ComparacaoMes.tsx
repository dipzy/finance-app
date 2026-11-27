import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../constants/tema';
import type { ComparacaoCategoria, ComparacaoMes, ComparacaoValor } from '../services/tipos';
import { useT } from '../i18n';
import { infoCategoria, nomeCategoria } from '../utils/categorias';
import { corGasto, notaPeriodo, sentido, textoVariacao } from '../utils/comparacao';
import type { NomeIcone } from './ui';

// A comparação de um mês com o anterior, em linhas: "↑ Restauração +18% (+24.00 €)".
// Usada no Início (as 3 categorias que mais mudaram) e no Resumo do mês (todas).

const SETAS: Record<ReturnType<typeof sentido>, NomeIcone> = {
  subiu: 'arrow-up',
  desceu: 'arrow-down',
  igual: 'remove',
};

// Uma linha: ícone, nome e, à direita, a seta com a variação (coral = gastou mais, menta = gastou menos)
export function LinhaComparacao({
  rotulo,
  valor,
  icone,
  corIcone,
  destaque,
  separada,
}: {
  rotulo: string;
  valor: ComparacaoValor;
  icone?: NomeIcone;
  corIcone?: string;
  destaque?: boolean;
  separada?: boolean;
}) {
  useT(); // os textos da variação (utils/comparacao) mudam com o idioma
  const cor = corGasto(valor);
  const texto = textoVariacao(valor);
  return (
    <View style={[styles.linha, separada && styles.separada]} accessible accessibilityLabel={`${rotulo}: ${texto}`}>
      {icone && <Ionicons name={icone} size={16} color={corIcone ?? cores.textoSecundario} />}
      <Text style={[styles.rotulo, destaque && styles.rotuloDestaque]} numberOfLines={1}>
        {rotulo}
      </Text>
      <Ionicons name={SETAS[sentido(valor)]} size={14} color={cor} />
      <Text style={[styles.variacao, { color: cor }]} numberOfLines={1}>
        {texto}
      </Text>
    </View>
  );
}

function LinhaCategoria({ c, separada }: { c: ComparacaoCategoria; separada: boolean }) {
  const info = infoCategoria(c.categoria);
  return <LinhaComparacao rotulo={nomeCategoria(c.categoria)} valor={c} icone={info.icone} corIcone={info.cor} separada={separada} />;
}

// O total dos Gastos do Dia a Dia e as categorias escolhidas (no Início, só as que mais mudaram)
export function ListaComparacao({ comparacao, categorias }: { comparacao: ComparacaoMes; categorias: ComparacaoCategoria[] }) {
  const t = useT();
  const nota = notaPeriodo(comparacao);
  return (
    <View>
      <LinhaComparacao rotulo={t('Gastos do Dia a Dia')} valor={comparacao.gastosDiaADia} destaque />
      {nota && <Text style={styles.nota}>{nota}</Text>}
      {categorias.map((c, i) => (
        <LinhaCategoria key={c.categoria} c={c} separada={i > 0} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    paddingVertical: espaco.sm,
  },
  separada: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.borda,
  },
  rotulo: {
    ...tipografia.corpo,
    flex: 1,
  },
  rotuloDestaque: {
    ...tipografia.corpoMedio,
  },
  variacao: {
    ...tipografia.secundario,
    fontVariant: ['tabular-nums'],
  },
  nota: {
    ...tipografia.secundario,
    fontSize: 12,
    color: cores.textoMudo,
    marginBottom: espaco.xs,
  },
});
