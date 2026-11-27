import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { comAlfa, cores, espaco, fontes, raio, tipografia } from '../constants/tema';
import { useT } from '../i18n';
import type { Categoria, GastoCategoria } from '../services/tipos';
import { infoCategoria, nomeCategoria } from '../utils/categorias';
import { proporcao } from '../utils/graficos';
import { euros } from '../utils/orcamentos';
import { BarraProgresso } from './BarraProgresso';
import { ValorEuro } from './ui';

interface GraficoGastosCategoriaProps {
  gastos: GastoCategoria[]; // da que tem mais gastos para a que tem menos (como vem da API)
  // Limite do orçamento de cada categoria, se houver (aparece por baixo da barra)
  limites?: Partial<Record<Categoria, number>>;
  vazio?: string;
}

// Barras horizontais néon: quanto se gastou em cada categoria no mês. A maior barra é a categoria
// com mais gastos; as outras são proporcionais a ela
export function GraficoGastosCategoria({ gastos, limites, vazio = 'Sem gastos neste mês' }: GraficoGastosCategoriaProps) {
  const t = useT();
  if (gastos.length === 0) return <Text style={styles.vazio}>{t(vazio)}</Text>;
  const maior = Math.max(...gastos.map((g) => g.total));

  return (
    <View style={styles.lista}>
      {gastos.map((g) => {
        const info = infoCategoria(g.categoria);
        const limite = limites?.[info.chave];
        return (
          <View key={g.categoria} style={styles.linha}>
            <View style={styles.topo}>
              <View style={[styles.icone, { backgroundColor: comAlfa(info.cor, 0.12), borderColor: comAlfa(info.cor, 0.3) }]}>
                <Ionicons name={info.icone} size={14} color={info.cor} />
              </View>
              <Text style={styles.nome} numberOfLines={1}>
                {nomeCategoria(g.categoria)}
              </Text>
              <Text style={styles.percentagem}>{Math.round(g.percentagem)}%</Text>
              <ValorEuro valor={g.total} style={styles.valor} />
            </View>
            <BarraProgresso
              percentagem={proporcao(g.total, maior) * 100}
              cor={info.cor}
              accessibilityLabel={t('{categoria}: {valor} euros, {percentagem}% dos extras do mês', {
                categoria: nomeCategoria(g.categoria),
                valor: g.total.toFixed(2),
                percentagem: Math.round(g.percentagem),
              })}
            />
            {limite !== undefined && (
              <Text style={styles.nota}>
                {t('Orçamento {limite}', { limite: euros(limite) })} ·{' '}
                {g.total > limite
                  ? t('passaste {valor}', { valor: euros(g.total - limite) })
                  : t('sobram {valor}', { valor: euros(limite - g.total) })}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  lista: {
    gap: espaco.md,
  },
  linha: {
    gap: 6,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
  },
  icone: {
    width: 26,
    height: 26,
    borderRadius: raio.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: {
    ...tipografia.corpoMedio,
    fontSize: 14,
    flex: 1,
  },
  percentagem: {
    fontFamily: fontes.numeroLeve,
    fontSize: 12,
    color: cores.textoSecundario,
  },
  valor: {
    fontSize: 14,
  },
  nota: {
    ...tipografia.nota,
  },
  vazio: {
    ...tipografia.secundario,
    fontStyle: 'italic',
    paddingVertical: espaco.sm,
  },
});
