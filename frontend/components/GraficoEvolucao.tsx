import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { acentosFolha, brilho, comAlfa, cores, espaco, fontes, raio, tipografia } from '../constants/tema';
import { useT } from '../i18n';
import { nomeMes } from '../services/calculos';
import type { EvolucaoMes, Mes } from '../services/tipos';
import { ChaveDestino, destinoDoMes, maximoEvolucao, proporcao, rotuloMes } from '../utils/graficos';
import { ValorEuro } from './ui';

// As cores das séries: as mesmas dos blocos da folha (e da distribuição do salário)
export const CORES_EVOLUCAO: Record<ChaveDestino | 'entrou', string> = {
  entrou: cores.positivo,
  despesasMensais: cores.negativo,
  despesasExtras: acentosFolha.despesasMes,
  poupado: acentosFolha.poupanca,
  livre: cores.primaria,
};

const COLUNA = 46; // largura de cada mês
const ALTURA = 150; // altura da zona das barras
const BARRA = 10;

interface GraficoEvolucaoProps {
  meses: EvolucaoMes[]; // do mais antigo para o mais recente
  selecionado: Mes;
  onEscolher: (mes: Mes) => void;
  // O cartão de alimentação em vez da conta: o que carregou e, empilhado, o que se gastou e o que ficou livre
  cartao?: boolean;
}

// Os meses do cartão de alimentação, na forma dos da conta: "entrou" é o que o cartão carregou e o gasto vai nos "extras"
const doCartao = (m: EvolucaoMes): EvolucaoMes => {
  const carregado = m.cartaoCarregado ?? 0;
  const gasto = m.cartaoGasto ?? 0;
  return { ...m, entrou: carregado, gasto, poupado: 0, despesasMensais: 0, despesasExtras: gasto, livre: Math.max(0, carregado - gasto) };
};

// Últimos meses: por mês, uma barra com o que entrou e, ao lado, uma barra empilhada com o destino
// (despesas fixas, gastos do dia a dia, poupado e o que ficou livre), na mesma escala.
// Feito só com Views. Tocar num mês escolhe-o. Em ecrãs estreitos arrasta-se para o lado
// (começa no mês mais recente)
export function GraficoEvolucao({ meses: mesesDaConta, selecionado, onEscolher, cartao = false }: GraficoEvolucaoProps) {
  const t = useT();
  const scroll = useRef<ScrollView>(null);
  const meses = cartao ? mesesDaConta.map(doCartao) : mesesDaConta;
  const maximo = maximoEvolucao(meses);
  const escolhido = meses.find((m) => m.mes === selecionado);
  // Para onde foi o dinheiro de um mês, de baixo para cima na barra empilhada
  const partesDoMes = (m: EvolucaoMes) =>
    cartao
      ? [
          { chave: 'despesasExtras' as const, nome: t('Gasto no cartão'), valor: m.despesasExtras },
          { chave: 'livre' as const, nome: t('Livre'), valor: m.livre },
        ].filter((p) => p.valor > 0)
      : destinoDoMes(m);

  return (
    <View>
      <View style={styles.legenda}>
        {cartao ? (
          <>
            <Legenda cor={CORES_EVOLUCAO.entrou} texto={t('Carregou')} />
            <Legenda cor={CORES_EVOLUCAO.despesasExtras} texto={t('Gasto no cartão')} />
            <Legenda cor={CORES_EVOLUCAO.livre} texto={t('Livre')} />
          </>
        ) : (
          <>
            <Legenda cor={CORES_EVOLUCAO.entrou} texto={t('Entrou')} />
            <Legenda cor={CORES_EVOLUCAO.despesasMensais} texto={t('Despesas fixas')} />
            <Legenda cor={CORES_EVOLUCAO.despesasExtras} texto={t('Gastos do dia a dia')} />
            <Legenda cor={CORES_EVOLUCAO.poupado} texto={t('Poupado')} />
            <Legenda cor={CORES_EVOLUCAO.livre} texto={t('Livre')} />
          </>
        )}
      </View>

      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => scroll.current?.scrollToEnd?.({ animated: false })}
        contentContainerStyle={styles.conteudo}
      >
        <View>
          <View style={[styles.area, { width: meses.length * COLUNA }]}>
            {/* Linhas de grelha: metade e topo da escala das barras */}
            <View style={[styles.grelha, { top: 0 }]} />
            <View style={[styles.grelha, { top: ALTURA / 2 }]} />

            {meses.map((m, i) => {
              const ativo = m.mes === selecionado;
              const destino = partesDoMes(m);
              return (
                <Pressable
                  key={m.mes}
                  onPress={() => onEscolher(m.mes)}
                  style={({ pressed }) => [
                    styles.coluna,
                    { left: i * COLUNA },
                    ativo && styles.colunaAtiva,
                    pressed && styles.colunaPremida,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
                  accessibilityLabel={t(cartao ? '{mes}: carregou {valor} euros{resto}' : '{mes}: entrou {valor} euros{resto}', {
                    mes: nomeMes(m.mes),
                    valor: m.entrou.toFixed(2),
                    resto: destino.map((p) => `, ${p.nome.toLowerCase()} ${p.valor.toFixed(2)}`).join(''),
                  })}
                >
                  <Barra valor={m.entrou} maximo={maximo} cor={CORES_EVOLUCAO.entrou} />
                  {/* Empilhada: a primeira parte fica em baixo */}
                  <View style={styles.pilha}>
                    {destino.map((p) => (
                      <Barra key={p.chave} valor={p.valor} maximo={maximo} cor={CORES_EVOLUCAO[p.chave]} empilhada />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.rotulos}>
            {meses.map((m, i) => {
              const r = rotuloMes(m.mes, i === 0);
              const ativo = m.mes === selecionado;
              return (
                <View key={m.mes} style={styles.rotulo}>
                  <Text style={[styles.rotuloMes, ativo && styles.rotuloAtivo]}>{r.mes}</Text>
                  <Text style={styles.rotuloAno}>{r.ano ?? ' '}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {escolhido ? (
        <View style={styles.detalhe}>
          <Text style={styles.detalheTitulo}>{nomeMes(escolhido.mes)}</Text>
          <View style={styles.detalheGrelha}>
            {cartao ? (
              <>
                <Numero rotulo={t('Carregou')} valor={escolhido.entrou} cor={CORES_EVOLUCAO.entrou} />
                <Numero rotulo={t('Gasto no cartão')} valor={escolhido.despesasExtras} cor={CORES_EVOLUCAO.despesasExtras} />
                <Numero rotulo={t('Livre')} valor={escolhido.livre} cor={CORES_EVOLUCAO.livre} />
              </>
            ) : (
              <>
                <Numero rotulo={t('Entrou')} valor={escolhido.entrou} cor={CORES_EVOLUCAO.entrou} />
                <Numero rotulo={t('Despesas fixas')} valor={escolhido.despesasMensais} cor={CORES_EVOLUCAO.despesasMensais} />
                <Numero rotulo={t('Gastos do dia a dia')} valor={escolhido.despesasExtras} cor={CORES_EVOLUCAO.despesasExtras} />
                <Numero rotulo={t('Poupado')} valor={escolhido.poupado} cor={CORES_EVOLUCAO.poupado} />
                <Numero rotulo={t('Livre')} valor={escolhido.livre} cor={CORES_EVOLUCAO.livre} />
              </>
            )}
          </View>
        </View>
      ) : (
        <Text style={styles.nota}>{t('Toca num mês do gráfico para o ver aqui em baixo.')}</Text>
      )}
    </View>
  );
}

function Barra({ valor, maximo, cor, empilhada }: { valor: number; maximo: number; cor: string; empilhada?: boolean }) {
  const altura = proporcao(valor, maximo) * (ALTURA - espaco.sm);
  return (
    <View
      style={[
        styles.barra,
        empilhada && styles.barraEmpilhada,
        { height: valor > 0 ? Math.max(2, altura) : 0, backgroundColor: cor, boxShadow: valor > 0 && !empilhada ? brilho(cor, 0.55, 8) : undefined },
      ]}
    />
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <View style={styles.legendaItem}>
      <View style={[styles.legendaCor, { backgroundColor: cor, boxShadow: brilho(cor, 0.7, 6) }]} />
      <Text style={styles.legendaTexto}>{texto}</Text>
    </View>
  );
}

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <View style={styles.numero}>
      <Text style={styles.numeroRotulo}>{rotulo}</Text>
      <ValorEuro valor={valor} cor={cor} style={styles.numeroValor} numberOfLines={1} adjustsFontSizeToFit />
    </View>
  );
}

const styles = StyleSheet.create({
  legenda: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.md,
    marginBottom: espaco.md,
  },
  legendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendaCor: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendaTexto: {
    ...tipografia.nota,
    color: cores.textoSecundario,
  },
  conteudo: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  area: {
    height: ALTURA,
    position: 'relative',
  },
  grelha: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: cores.borda,
  },
  coluna: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: COLUNA - 4,
    marginHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    borderRadius: raio.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  colunaAtiva: {
    backgroundColor: comAlfa(cores.primaria, 0.08),
    borderColor: comAlfa(cores.primaria, 0.35),
  },
  colunaPremida: {
    backgroundColor: cores.superficiePremida,
  },
  barra: {
    width: BARRA,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  // As partes da barra empilhada ficam umas por cima das outras, sem cantos redondos no meio
  pilha: {
    flexDirection: 'column-reverse',
    width: BARRA,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    overflow: 'hidden',
  },
  barraEmpilhada: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  rotulos: {
    flexDirection: 'row',
    marginTop: espaco.xs,
  },
  rotulo: {
    width: COLUNA,
    alignItems: 'center',
  },
  rotuloMes: {
    fontFamily: fontes.corpoMedio,
    fontSize: 11,
    color: cores.textoSecundario,
  },
  rotuloAtivo: {
    fontFamily: fontes.corpoForte,
    color: cores.primaria,
  },
  rotuloAno: {
    fontFamily: fontes.corpo,
    fontSize: 10,
    color: cores.textoMudo,
  },
  detalhe: {
    marginTop: espaco.md,
    paddingTop: espaco.md,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  detalheTitulo: {
    ...tipografia.corpoMedio,
    marginBottom: espaco.sm,
  },
  detalheGrelha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
  },
  numero: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: espaco.sm + 2,
    borderRadius: raio.md,
    backgroundColor: cores.superficieAlta,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  numeroRotulo: {
    ...tipografia.rotulo,
    fontSize: 10,
  },
  numeroValor: {
    fontFamily: fontes.numeroForte,
    fontSize: 16,
    color: cores.texto,
    marginTop: 2,
  },
  nota: {
    ...tipografia.nota,
    marginTop: espaco.sm,
  },
});
