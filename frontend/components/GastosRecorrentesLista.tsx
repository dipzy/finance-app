import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../i18n';
import { comAlfa, cores, espaco, raio, tipografia } from '../constants/tema';
import { descreverFrequencia, GastoRecorrente, GastosRecorrentesDB } from '../services/gastosRecorrentes';
import { infoCategoria } from '../utils/categorias';
import { confirmar } from '../utils/confirmar';
import { mostrarAlerta, parseValor } from '../utils/helpers';
import { Botao, Cartao, CampoTexto, TituloSecao, ValorEuro } from './ui';

interface GastosRecorrentesListaProps {
  cor: string;
  // Muda quando o ecrã recarrega (ex.: depois de criar um gasto com "Repetir"): volta a ler a lista
  versao: number;
  // Depois de pausar/retomar/mudar/apagar: o ecrã recarrega (retomar pode gerar o gasto de hoje)
  onAlterado: () => void;
}

// "Gastos que se repetem": ver, pausar/retomar, mudar o valor e apagar. Fechado por defeito
export function GastosRecorrentesLista({ cor, versao, onAlterado }: GastosRecorrentesListaProps) {
  const t = useT();
  const [gastos, setGastos] = useState<GastoRecorrente[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<{ id: string; valor: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      setGastos(await GastosRecorrentesDB.getAll());
    } catch (error) {
      console.error('Erro ao carregar os gastos que se repetem:', error);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, versao]);

  async function executar(acao: () => Promise<void>, erro: string) {
    try {
      await acao();
      await carregar();
      onAlterado();
    } catch (error) {
      console.error(erro, error);
      mostrarAlerta(t('Erro'), erro);
    }
  }

  async function guardarValor(gasto: GastoRecorrente) {
    if (!emEdicao) return;
    const valor = parseValor(emEdicao.valor);
    if (!(valor > 0)) {
      mostrarAlerta(t('Erro'), t('Escreve um valor maior que zero'));
      return;
    }
    setEmEdicao(null);
    await executar(() => GastosRecorrentesDB.update(gasto.id, { valor }), t('Não foi possível mudar o valor.'));
  }

  async function apagar(gasto: GastoRecorrente) {
    const sim = await confirmar(
      t('Deixar de repetir'),
      t('Apagar "{titulo}"? Os gastos que já foram registados ficam.', { titulo: gasto.titulo }),
      'Apagar'
    );
    if (sim) await executar(() => GastosRecorrentesDB.remove(gasto.id), t('Não foi possível apagar.'));
  }

  if (!gastos || gastos.length === 0) return null;

  return (
    <Cartao style={styles.cartao}>
      <Pressable
        onPress={() => setAberto((a) => !a)}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
        accessibilityLabel={t('Gastos que se repetem, {n}', { n: gastos.length })}
      >
        <TituloSecao
          titulo={t('Gastos que se repetem ({n})', { n: gastos.length })}
          icone="repeat"
          cor={cor}
          direita={<Ionicons name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={cores.textoMudo} />}
          style={styles.titulo}
        />
      </Pressable>

      {aberto &&
        gastos.map((gasto) => {
          const categoria = infoCategoria(gasto.categoria);
          return (
            <View key={gasto.id} style={[styles.item, !gasto.ativo && styles.pausado]}>
              <View style={styles.linha}>
                <View style={[styles.icone, { backgroundColor: comAlfa(categoria.cor, 0.12) }]}>
                  <Ionicons name={categoria.icone} size={16} color={categoria.cor} />
                </View>
                <View style={styles.info}>
                  <Text style={styles.nome}>{gasto.titulo}</Text>
                  <Text style={styles.nota}>
                    {descreverFrequencia(gasto)}
                    {gasto.meioPagamento === 'cartaoAlimentacao' ? t(' · cartão') : ''}
                    {gasto.ativo ? '' : t(' · em pausa')}
                  </Text>
                </View>
                <ValorEuro valor={gasto.valor} tipo="saida" />
              </View>

              {emEdicao?.id === gasto.id ? (
                <View style={styles.acoes}>
                  <CampoTexto
                    rotulo={t('Novo valor (€)')}
                    keyboardType="numeric"
                    value={emEdicao.valor}
                    onChangeText={(valor) => setEmEdicao({ id: gasto.id, valor })}
                    estiloCaixa={styles.campo}
                  />
                  <Botao pequeno icone="checkmark" titulo={t('Guardar')} onPress={() => guardarValor(gasto)} />
                  <Botao pequeno variante="fantasma" titulo={t('Cancelar')} onPress={() => setEmEdicao(null)} />
                </View>
              ) : (
                <View style={styles.acoes}>
                  <Botao
                    pequeno
                    variante="secundario"
                    cor={cor}
                    icone={gasto.ativo ? 'pause' : 'play'}
                    titulo={t(gasto.ativo ? 'Pausar' : 'Retomar')}
                    onPress={() =>
                      executar(() => GastosRecorrentesDB.definirAtivo(gasto.id, !gasto.ativo), t('Não foi possível mudar.'))
                    }
                  />
                  <Botao
                    pequeno
                    variante="secundario"
                    cor={cores.textoSecundario}
                    icone="create-outline"
                    titulo={t('Valor')}
                    onPress={() => setEmEdicao({ id: gasto.id, valor: gasto.valor.toFixed(2).replace('.', ',') })}
                    accessibilityLabel={t('Mudar o valor de {titulo}', { titulo: gasto.titulo })}
                  />
                  <Botao
                    pequeno
                    variante="perigo"
                    icone="trash-outline"
                    titulo={t('Apagar')}
                    onPress={() => apagar(gasto)}
                    accessibilityLabel={t('Deixar de repetir {titulo}', { titulo: gasto.titulo })}
                  />
                </View>
              )}
            </View>
          );
        })}
    </Cartao>
  );
}

const styles = StyleSheet.create({
  cartao: {
    marginBottom: espaco.xl,
  },
  titulo: {
    marginBottom: 0,
  },
  item: {
    marginTop: espaco.md,
    paddingTop: espaco.md,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  pausado: {
    opacity: 0.6,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icone: {
    width: 32,
    height: 32,
    borderRadius: raio.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: espaco.md,
  },
  info: {
    flex: 1,
    marginRight: espaco.sm,
  },
  nome: {
    ...tipografia.corpoMedio,
  },
  nota: {
    ...tipografia.nota,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  acoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: espaco.sm,
    marginTop: espaco.sm,
  },
  campo: {
    flexGrow: 1,
    marginBottom: 0,
  },
});
