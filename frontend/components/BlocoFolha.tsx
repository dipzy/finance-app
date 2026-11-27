import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COR_CARTAO, ICONE_CARTAO } from '../constants/meiosPagamento';
import { brilho, comAlfa, cores, espaco, fontes, raio, tipografia } from '../constants/tema';
import { useT } from '../i18n';
import type { LinhaFolha } from '../services/tipos';
import { textoEstado } from '../utils/ecrasDespesas';
import { formatarData } from '../utils/helpers';
import { ValorEuro } from './ui';

// Um bloco da folha do mês (como no livro Excel): título colorido, linhas "Categoria | Valor" e total.
// Cada bloco mantém a sua cor (a do livro, em néon): barra à esquerda, cabeçalho e brilho.
// Tocar no título leva ao ecrã onde se gere esse bloco
interface BlocoFolhaProps {
  titulo: string;
  cor: string; // cor de acento do bloco (constants/tema.ts: acentosFolha)
  linhas: LinhaFolha[];
  total?: number; // sem total, o cabeçalho não mostra nenhum valor
  vazio?: string;
  semVazio?: boolean; // com linhas próprias no rodapé, não escrever "Nada registado"
  mostrarData?: boolean;
  // Despesas fixas: se cada uma já foi paga no mês (vem da API em linha.estado)
  mostrarEstado?: boolean;
  onPressTitulo?: () => void;
  // Linhas extra no fim do bloco (ex.: o saldo da conta e a previsão, no Resumo do mês)
  rodape?: ReactNode;
}

export function BlocoFolha({
  titulo,
  cor,
  linhas,
  total,
  vazio,
  semVazio,
  mostrarData,
  mostrarEstado,
  onPressTitulo,
  rodape,
}: BlocoFolhaProps) {
  const t = useT();
  return (
    <View style={[styles.bloco, { borderLeftColor: cor, boxShadow: brilho(cor, 0.1, 22) }]}>
      <Pressable
        disabled={!onPressTitulo}
        onPress={onPressTitulo}
        accessibilityRole={onPressTitulo ? 'button' : 'header'}
        style={({ pressed }) => [
          styles.cabecalho,
          { backgroundColor: comAlfa(cor, pressed ? 0.2 : 0.1), borderBottomColor: comAlfa(cor, 0.25) },
        ]}
      >
        <View style={[styles.ponto, { backgroundColor: cor, boxShadow: brilho(cor, 0.9, 8) }]} />
        <Text style={[styles.titulo, { color: cor }]}>{titulo}</Text>
        {total !== undefined && <ValorEuro valor={total} style={styles.total} />}
        {onPressTitulo && <Ionicons name="chevron-forward" size={18} color={cores.textoSecundario} style={styles.seta} />}
      </Pressable>

      {linhas.map((linha, i) => (
        <View key={`${linha.titulo}-${i}`} style={[styles.linha, i === linhas.length - 1 && styles.ultimaLinha]}>
          <View style={styles.textos}>
            <Text style={[styles.categoria, linha.informativo && styles.informativo]} numberOfLines={1}>
              {linha.titulo}
              {mostrarData && linha.data ? `  ·  ${formatarData(linha.data)}` : ''}
              {linha.informativo ? t('  (à parte)') : ''}
            </Text>
            {mostrarEstado && linha.estado && (
              <Text style={[styles.estado, { color: COR_ESTADO[linha.estado] }]}>
                {textoEstado({
                  estado: linha.estado,
                  dataPagamento: linha.data,
                  valorPago: linha.valor,
                  valorRestante: linha.valorEmFalta,
                })}
              </Text>
            )}
          </View>
          {linha.cartaoAlimentacao && (
            <Ionicons
              name={ICONE_CARTAO}
              size={14}
              color={COR_CARTAO}
              style={styles.cartao}
              accessibilityLabel={t('Paga com o cartão de alimentação')}
            />
          )}
          <ValorEuro valor={linha.valor} style={[styles.valor, linha.informativo && styles.valorInformativo]} />
        </View>
      ))}

      {linhas.length === 0 && !semVazio && <Text style={styles.vazio}>{vazio ?? t('Nada registado')}</Text>}
      {rodape}
    </View>
  );
}

// Pago a menta, parcial a âmbar e por pagar a laranja (como no ecrã Despesas Fixas)
const COR_ESTADO = { pago: cores.positivo, parcial: cores.aviso, 'por-pagar': cores.aviso } as const;

const styles = StyleSheet.create({
  textos: {
    flex: 1,
    marginRight: espaco.sm,
  },
  estado: {
    fontFamily: fontes.corpoMedio,
    fontSize: 11,
    marginTop: 2,
  },
  cartao: {
    marginRight: 6,
    alignSelf: 'center',
  },
  bloco: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.borda,
    borderLeftWidth: 3,
    marginBottom: espaco.md,
    overflow: 'hidden',
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: espaco.lg - 2,
    paddingVertical: espaco.sm,
    borderBottomWidth: 1,
  },
  ponto: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: espaco.sm + 2,
  },
  titulo: {
    flex: 1,
    fontFamily: fontes.tituloMedio,
    fontSize: 15,
    letterSpacing: 0.2,
  },
  total: {
    fontFamily: fontes.numeroForte,
    fontSize: 16,
  },
  seta: {
    marginLeft: 6,
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: espaco.lg - 2,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },
  ultimaLinha: {
    borderBottomWidth: 0,
  },
  categoria: {
    ...tipografia.secundario,
    color: cores.texto,
  },
  valor: {
    fontSize: 14,
  },
  informativo: {
    color: cores.textoMudo,
    fontFamily: fontes.corpo,
    fontStyle: 'italic',
  },
  valorInformativo: {
    color: cores.textoMudo,
  },
  vazio: {
    ...tipografia.nota,
    paddingHorizontal: espaco.lg - 2,
    paddingVertical: espaco.md,
    fontStyle: 'italic',
    fontSize: 13,
  },
});
