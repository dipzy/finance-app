import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarraProgresso } from '../../components/BarraProgresso';
import { GraficoGastosCategoria } from '../../components/GraficoGastosCategoria';
import { Header } from '../../components/Header';
import { SeletorCategoria } from '../../components/SeletorCategoria';
import { SeletorMes } from '../../components/SeletorMes';
import { SideMenu } from '../../components/SideMenu';
import { Separadores } from '../../components/Separadores';
import { Botao, CampoTexto, Cartao, CartaoSaldo, Ecra, Etiqueta, TituloSecao, ValorEuro } from '../../components/ui';
import { comAlfa, cores, espaco, fontes, raio, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';
import {
  calcularSaldoDisponivel,
  Categoria,
  EstadoOrcamentoMes,
  EstatisticasDB,
  GastosPorCategoria,
  Mes,
  mesAtual,
  nomeMes,
  OrcamentosDB,
} from '../../services/database';
import { CATEGORIAS, infoCategoria, nomeCategoria } from '../../utils/categorias';
import { confirmar } from '../../utils/confirmar';
import { mostrarAlerta, parseValor } from '../../utils/helpers';
import { corEstadoOrcamento, ritmoOrcamento, textoEstadoOrcamento, textoRestante } from '../../utils/orcamentos';

// O acento do ecrã: o violeta dos gastos do dia a dia (extras e despesas mensais com categoria)
const COR = cores.violetaTexto;

interface DadosMes {
  mes: Mes;
  orcamentos: EstadoOrcamentoMes[];
  gastos: GastosPorCategoria;
}

// Orçamentos: um limite por mês para cada categoria de gastos do dia a dia, com o que já se gastou no
// mês escolhido, e os gastos desse mês por categoria (também as que não têm orçamento)
export default function OrcamentosScreen() {
  const t = useT();
  const [menuVisible, setMenuVisible] = useState(false);
  const [mes, setMes] = useState<Mes>(mesAtual);
  // Os dados e o mês a que pertencem: enquanto o mês escolhido não chega, não se mostra o de outro
  const [dados, setDados] = useState<DadosMes | null>(null);
  const [erroCarregar, setErroCarregar] = useState(false);
  const ultimoPedido = useRef(0);
  // Para levar o ecrã ao formulário (em baixo) quando se toca num orçamento para o editar
  const scroll = useRef<ScrollView>(null);
  const posicaoFormulario = useRef(0);
  const [saldo, setSaldo] = useState<number | undefined>(undefined);
  // Formulário: null = orçamento novo; senão o que está a ser editado
  const [aEditar, setAEditar] = useState<EstadoOrcamentoMes | null>(null);
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [limite, setLimite] = useState('');
  const [aGuardar, setAGuardar] = useState(false);
  const { user } = useAuth();

  useFocusEffect(
    useCallback(() => {
      carregar(mes);
    }, [user, mes])
  );

  function mudarMes(novo: Mes) {
    setErroCarregar(false);
    setMes(novo); // o useFocusEffect carrega o mês novo
  }

  async function carregar(mesPedido: Mes) {
    if (!user?.id) return;
    // Só conta a resposta do último pedido (ao mudar de mês depressa)
    const pedido = ++ultimoPedido.current;
    try {
      const [orcamentos, gastos, disponivel] = await Promise.all([
        OrcamentosDB.getEstado(user.id, mesPedido),
        EstatisticasDB.gastosPorCategoria(user.id, mesPedido),
        calcularSaldoDisponivel(user.id),
      ]);
      if (pedido !== ultimoPedido.current) return;
      setDados({ mes: mesPedido, orcamentos, gastos });
      setSaldo(disponivel);
      setErroCarregar(false);
    } catch (error) {
      if (pedido !== ultimoPedido.current) return;
      console.error('Erro ao carregar os orçamentos:', error);
      setErroCarregar(true);
    }
  }

  const doMes = dados?.mes === mes ? dados : null;
  const comOrcamento = new Set(doMes?.orcamentos.map((o) => o.categoria) ?? []);
  // No orçamento novo só aparecem as categorias que ainda não têm; ao editar, também a dele
  const disponiveis = CATEGORIAS.map((c) => c.chave).filter((c) => !comOrcamento.has(c) || c === aEditar?.categoria);
  const categoriaFormulario = categoria ?? disponiveis[0] ?? 'outros';
  const limites = Object.fromEntries(doMes?.orcamentos.map((o) => [o.categoria, o.limite]) ?? []) as Partial<Record<Categoria, number>>;
  const totalLimites = doMes?.orcamentos.reduce((s, o) => s + o.limite, 0) ?? 0;
  const dentro = doMes?.orcamentos.filter((o) => o.estado === 'ok').length ?? 0;

  function limpar() {
    setAEditar(null);
    setCategoria(null);
    setLimite('');
  }

  function editar(orcamento: EstadoOrcamentoMes) {
    setAEditar(orcamento);
    setCategoria(orcamento.categoria);
    setLimite(String(orcamento.limite).replace('.', ','));
    scroll.current?.scrollTo({ y: posicaoFormulario.current, animated: true });
  }

  async function guardar() {
    if (!user?.id || aGuardar) return;
    const valor = parseValor(limite);
    if (!(valor > 0)) {
      mostrarAlerta(t('Erro'), t('Escreve o limite por mês (maior que zero)'));
      return;
    }
    if (!aEditar && disponiveis.length === 0) {
      mostrarAlerta(t('Erro'), t('Todas as categorias já têm orçamento'));
      return;
    }
    setAGuardar(true);
    try {
      if (aEditar) {
        await OrcamentosDB.update(user.id, aEditar.id, {
          limite: valor,
          categoria: categoriaFormulario !== aEditar.categoria ? categoriaFormulario : undefined,
        });
      } else {
        await OrcamentosDB.add(user.id, { categoria: categoriaFormulario, limite: valor });
      }
      limpar();
      await carregar(mes);
    } catch (error) {
      console.error('Erro ao guardar o orçamento:', error);
      mostrarAlerta(t('Erro'), error instanceof Error ? error.message : t('Não foi possível guardar o orçamento.'));
    } finally {
      setAGuardar(false);
    }
  }

  async function remover(orcamento: EstadoOrcamentoMes) {
    if (!user?.id) return;
    const nome = nomeCategoria(orcamento.categoria);
    if (!(await confirmar(t('Remover orçamento'), t('Remover o orçamento de {nome}? As despesas não mudam.', { nome }), t('Remover')))) return;
    try {
      await OrcamentosDB.remove(user.id, orcamento.id);
      limpar();
      await carregar(mes);
    } catch (error) {
      console.error('Erro ao remover o orçamento:', error);
      mostrarAlerta(t('Erro'), t('Não foi possível remover o orçamento.'));
    }
  }

  return (
    <Ecra
      keyboardShouldPersistTaps="handled"
      scrollRef={scroll}
      cabecalho={
        <>
          <Header title={t('Orçamentos')} onMenuPress={() => setMenuVisible(true)} saldo={saldo} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldo} />
        </>
      }
    >
      <Separadores grupo="planeamento" />
      <SeletorMes mes={mes} onChange={mudarMes} />

      {!doMes ? (
        erroCarregar ? (
          <View style={styles.estado}>
            <Text style={styles.vazio}>{t('Não foi possível carregar os orçamentos de {mes}.', { mes: nomeMes(mes) })}</Text>
            <Botao variante="secundario" pequeno icone="refresh-outline" titulo={t('Tentar outra vez')} onPress={() => carregar(mes)} />
          </View>
        ) : (
          <ActivityIndicator style={styles.estado} color={COR} />
        )
      ) : (
        <>
          <CartaoSaldo
            variante="violeta"
            alertaNegativo={false}
            rotulo={t('Gasto este mês')}
            valor={doMes.gastos.total}
            icone="pie-chart-outline"
            subtitulo={
              doMes.orcamentos.length > 0
                ? t('{mes} · {dentro} de {total} orçamentos dentro do limite ({limite} € no total)', {
                    mes: nomeMes(mes),
                    dentro,
                    total: doMes.orcamentos.length,
                    limite: totalLimites.toFixed(2),
                  })
                : nomeMes(mes)
            }
            style={styles.resumo}
          />

          <TituloSecao titulo={t('Orçamentos de {mes}', { mes: nomeMes(mes) })} icone="wallet-outline" cor={COR} />
          {doMes.orcamentos.length === 0 && (
            <Text style={styles.vazio}>
              {t('Ainda não tens orçamentos. Cria um em baixo: a app avisa-te quando chegares aos 80% do limite.')}
            </Text>
          )}
          {doMes.orcamentos.map((o) => {
            const info = infoCategoria(o.categoria);
            const corEstado = corEstadoOrcamento(o.estado);
            const ritmo = ritmoOrcamento(o);
            return (
              <Cartao
                key={o.id}
                acento={info.cor}
                ativo={aEditar?.id === o.id}
                onPress={() => editar(o)}
                accessibilityLabel={t('{nome}: {gasto} de {limite} euros, {percentagem}%, {estado}', {
                  nome: nomeCategoria(o.categoria),
                  gasto: o.gasto.toFixed(2),
                  limite: o.limite.toFixed(2),
                  percentagem: Math.round(o.percentagem),
                  estado: textoEstadoOrcamento(o.estado),
                })}
                accessibilityHint={t('Abre para editar ou remover')}
                style={styles.item}
              >
                <View style={styles.itemTopo}>
                  <View style={[styles.icone, { backgroundColor: comAlfa(info.cor, 0.12), borderColor: comAlfa(info.cor, 0.3) }]}>
                    <Ionicons name={info.icone} size={16} color={info.cor} />
                  </View>
                  <Text style={styles.itemTitulo} numberOfLines={1}>
                    {nomeCategoria(o.categoria)}
                  </Text>
                  <ValorEuro valor={o.gasto} cor={corEstado} style={styles.itemValor} />
                  <Text style={styles.itemLimite}>{t(' / {valor} €', { valor: o.limite.toFixed(2) })}</Text>
                </View>
                <BarraProgresso
                  percentagem={o.percentagem}
                  cor={corEstado}
                  altura={10}
                  style={styles.barra}
                  accessibilityLabel={t('{percentagem}% do orçamento de {nome}', {
                    percentagem: Math.round(o.percentagem),
                    nome: nomeCategoria(o.categoria),
                  })}
                />
                <View style={styles.itemFundo}>
                  <Etiqueta
                    texto={t('{estado} · {percentagem}%', {
                      estado: textoEstadoOrcamento(o.estado),
                      percentagem: Math.round(o.percentagem),
                    })}
                    cor={corEstado}
                    style={styles.etiqueta}
                  />
                  <Text style={styles.itemNota}>{textoRestante(o)}</Text>
                </View>
                {ritmo && <Text style={[styles.ritmo, { color: ritmo.cor }]}>{ritmo.texto}</Text>}
              </Cartao>
            );
          })}

          <Cartao style={styles.cartaoGastos}>
            <TituloSecao titulo={t('Gastos por categoria')} icone="bar-chart-outline" cor={COR} />
            <GraficoGastosCategoria gastos={doMes.gastos.categorias} limites={limites} />
          </Cartao>
        </>
      )}

      <View onLayout={(e) => (posicaoFormulario.current = e.nativeEvent.layout.y)}>
        <Cartao>
          <TituloSecao
            titulo={aEditar ? t('Editar orçamento de {categoria}', { categoria: nomeCategoria(aEditar.categoria) }) : t('Novo orçamento')}
            icone={aEditar ? 'create-outline' : 'add-circle-outline'}
            cor={COR}
          />
          {disponiveis.length === 0 && !aEditar ? (
            <Text style={styles.vazio}>{t('Todas as categorias já têm orçamento. Toca num para o mudar.')}</Text>
          ) : (
            <>
              <SeletorCategoria valor={categoriaFormulario} onChange={setCategoria} disponiveis={disponiveis} />
              <CampoTexto
                rotulo={t('Limite por mês (€)')}
                placeholder={t('ex: 200')}
                keyboardType="numeric"
                value={limite}
                onChangeText={setLimite}
                accessibilityLabel={t('Limite por mês em euros')}
              />
              <Botao
                titulo={aGuardar ? t('A guardar…') : aEditar ? t('Guardar') : t('Adicionar')}
                icone={aEditar ? 'checkmark' : 'add'}
                onPress={guardar}
                aCarregar={aGuardar}
              />
            </>
          )}
          {aEditar && (
            <View style={styles.linhaBotoes}>
              <Botao variante="perigo" icone="trash-outline" titulo={t('Remover')} onPress={() => remover(aEditar)} style={styles.botaoLinha} />
              <Botao variante="secundario" cor={cores.textoSecundario} titulo={t('Cancelar')} onPress={limpar} style={styles.botaoLinha} />
            </View>
          )}
        </Cartao>
      </View>
    </Ecra>
  );
}

const styles = StyleSheet.create({
  estado: {
    padding: espaco.xl,
    alignItems: 'center',
    gap: espaco.md,
  },
  resumo: {
    marginBottom: espaco.xl,
  },
  vazio: {
    ...tipografia.secundario,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: espaco.lg,
  },
  item: {
    marginBottom: espaco.sm,
  },
  itemTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
  },
  icone: {
    width: 30,
    height: 30,
    borderRadius: raio.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitulo: {
    ...tipografia.tituloCartao,
    flex: 1,
  },
  itemValor: {
    fontFamily: fontes.numeroForte,
    fontSize: 16,
  },
  itemLimite: {
    ...tipografia.secundario,
    fontSize: 13,
  },
  barra: {
    marginVertical: espaco.md,
  },
  itemFundo: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: espaco.sm,
  },
  etiqueta: {
    paddingVertical: 2,
  },
  itemNota: {
    ...tipografia.nota,
    color: cores.textoSecundario,
  },
  ritmo: {
    ...tipografia.nota,
    marginTop: espaco.sm,
  },
  cartaoGastos: {
    marginTop: espaco.md,
    marginBottom: espaco.lg,
  },
  linhaBotoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm + 2,
    marginTop: espaco.sm + 2,
  },
  botaoLinha: {
    flexGrow: 1,
  },
});
