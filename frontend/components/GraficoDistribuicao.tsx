import { StyleSheet, Text, View } from 'react-native';
import { acentosFolha, brilho, cores, espaco, fontes, tipografia } from '../constants/tema';
import { useT, type Tradutor } from '../i18n';
import { tracosDaRoda } from '../utils/graficos';
import { ChaveFatia, DistribuicaoSalario, percentagemDe } from '../utils/painel';
import { ValorEuro } from './ui';

// Cor de cada fatia do salário (as dos blocos da folha e do gráfico da evolução)
export const COR_FATIA: Record<ChaveFatia, string> = {
  poupancas: acentosFolha.poupanca,
  despesas: cores.negativo,
  extras: acentosFolha.despesasMes,
  cartao: acentosFolha.despesasMes,
  livre: cores.primaria,
};

// A roda: um anel de pequenos traços (só Views, sem SVG), cada um com a cor da fatia a que pertence
const DIAMETRO = 168;
const ESPESSURA = 16;
const TRACOS = 90;
const RAIO = DIAMETRO / 2 - ESPESSURA / 2;
const LARGURA_TRACO = ((2 * Math.PI * RAIO) / TRACOS) * 0.72;

// Largura de uma barra em % do salário (nunca passa dos 100%)
const largura = (valor: number, base: number): `${number}%` => `${percentagemDe(valor, base)}%`;

interface GraficoDistribuicaoProps {
  distribuicao: DistribuicaoSalario;
  tipo: 'barras' | 'roda';
  // O que se está a dividir: o salário (por defeito) ou o que o cartão de alimentação carrega
  de?: 'salario' | 'cartao';
}

// Para onde vai o salário (ou o cartão de alimentação) de um mês: barras horizontais ou a roda, com a mesma legenda
export function GraficoDistribuicao({ distribuicao, tipo, de = 'salario' }: GraficoDistribuicaoProps) {
  const t = useT();
  const { salario, fatias } = distribuicao;

  if (tipo === 'roda') {
    const tracos = tracosDaRoda(fatias, salario, TRACOS);
    return (
      <View>
        <View style={styles.roda} accessibilityRole="image" accessibilityLabel={descricao(t, distribuicao, de)}>
          {tracos.map((chave, i) => (
            <View
              key={i}
              style={[
                styles.traco,
                {
                  backgroundColor: chave ? COR_FATIA[chave] : cores.superficieAlta,
                  transform: [{ rotate: `${(i * 360) / TRACOS}deg` }, { translateY: -RAIO }],
                },
              ]}
            />
          ))}
          <View style={styles.centro}>
            <Text style={styles.centroRotulo}>{de === 'cartao' ? t('Cartão') : t('Salário')}</Text>
            <ValorEuro valor={salario} tipo="entrada" style={styles.centroValor} numberOfLines={1} adjustsFontSizeToFit />
          </View>
        </View>
        <View style={styles.legenda}>
          {fatias.map((fatia) => (
            <LinhaLegenda key={fatia.chave} chave={fatia.chave} nome={fatia.nome} valor={fatia.valor} salario={salario} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.barras}>
      {fatias.map((fatia) => {
        const cor = COR_FATIA[fatia.chave];
        return (
          <View key={fatia.chave} style={styles.barraContainer}>
            <LinhaLegenda chave={fatia.chave} nome={fatia.nome} valor={fatia.valor} salario={salario} />
            <View style={styles.barraFundo}>
              <View style={[styles.barra, { width: largura(fatia.valor, salario), backgroundColor: cor, boxShadow: brilho(cor, 0.5, 10) }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function LinhaLegenda({ chave, nome, valor, salario }: { chave: ChaveFatia; nome: string; valor: number; salario: number }) {
  const cor = COR_FATIA[chave];
  return (
    <View style={styles.linha}>
      <View style={[styles.ponto, { backgroundColor: cor, boxShadow: brilho(cor, 0.8, 8) }]} />
      <Text style={styles.linhaNome}>
        {nome} {percentagemDe(valor, salario).toFixed(1)}%
      </Text>
      <ValorEuro valor={valor} style={styles.linhaValor} />
    </View>
  );
}

function descricao(t: Tradutor, { salario, fatias }: DistribuicaoSalario, de: 'salario' | 'cartao'): string {
  const parametros = {
    valor: salario.toFixed(2),
    detalhe: fatias.map((f) => `${f.nome} ${percentagemDe(f.valor, salario).toFixed(0)}%`).join(', '),
  };
  return de === 'cartao' ? t('Cartão {valor} euros: {detalhe}', parametros) : t('Salário {valor} euros: {detalhe}', parametros);
}

const styles = StyleSheet.create({
  barras: {
    gap: espaco.md,
  },
  barraContainer: {
    gap: 6,
  },
  barraFundo: {
    height: 8,
    borderRadius: 4,
    backgroundColor: cores.superficieAlta,
  },
  barra: {
    height: 8,
    borderRadius: 4,
    minWidth: 2,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
  },
  ponto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  linhaNome: {
    ...tipografia.secundario,
    flex: 1,
    fontSize: 13,
  },
  linhaValor: {
    fontSize: 13,
  },
  roda: {
    width: DIAMETRO,
    height: DIAMETRO,
    alignSelf: 'center',
    marginVertical: espaco.sm,
  },
  // Cada traço começa no centro da roda e é rodado e empurrado para fora até ao anel
  traco: {
    position: 'absolute',
    left: DIAMETRO / 2 - LARGURA_TRACO / 2,
    top: DIAMETRO / 2 - ESPESSURA / 2,
    width: LARGURA_TRACO,
    height: ESPESSURA,
    borderRadius: 2,
  },
  centro: {
    position: 'absolute',
    left: ESPESSURA + espaco.sm,
    right: ESPESSURA + espaco.sm,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  centroRotulo: {
    ...tipografia.rotulo,
    fontSize: 10,
  },
  centroValor: {
    fontFamily: fontes.numeroForte,
    fontSize: 18,
    marginTop: 2,
  },
  legenda: {
    gap: espaco.sm,
    marginTop: espaco.md,
  },
});
