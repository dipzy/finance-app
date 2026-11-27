import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { EditarDespesaExtraModal } from '../../components/EditarDespesaExtraModal';
import { DespesaPartilhadaModal } from '../../components/partilhado/DespesaPartilhadaModal';
import { mensagemDaApi } from '../../services/grupos';
import { PartilhadoDB, type DespesaPartilhadaDto } from '../../services/partilhado';
import { Header } from '../../components/Header';
import { COR_CARTAO, COR_CONTA, ICONE_CARTAO, ICONE_CONTA } from '../../constants/meiosPagamento';
import { SideMenu } from '../../components/SideMenu';
import { Botao, CampoTexto, Cartao, Chip, Ecra, ValorEuro } from '../../components/ui';
import { acentosFolha, comAlfa, cores, espaco, raio, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useTemCartao } from '../../services/saldoCartao';
import { useT } from '../../i18n';
import { ErroApi } from '../../services/api';
import { Categoria, Despesa, DespesasExtrasDB, MeioPagamento } from '../../services/database';
import {
  datasDoIntervalo,
  FiltroPesquisa,
  INTERVALOS_RAPIDOS,
  IntervaloRapido,
  PesquisaDB,
  ResultadoPesquisa,
} from '../../services/pesquisa';
import { CATEGORIAS, infoCategoria } from '../../utils/categorias';
import { CamposExtra } from '../../utils/ecrasDespesas';
import { formatarData, mostrarAlerta, parseValor } from '../../utils/helpers';

// Pesquisa dos gastos do dia a dia em todos os meses (aberta pela lupa em "Gastos do Dia a Dia";
// não tem entrada no menu). Os filtros aplicam-se sozinhos, com o texto a esperar que se pare de escrever
const COR = acentosFolha.despesasMes;
const ESPERA_TEXTO_MS = 350;
const TAMANHO_PAGINA = 30;

const valorOuNada = (texto: string) => (texto.trim() ? parseValor(texto) : undefined);

export default function PesquisaScreen() {
  const { user } = useAuth();
  const temCartao = useTemCartao(user?.id);
  const t = useT();
  const [menuVisible, setMenuVisible] = useState(false);
  const [texto, setTexto] = useState('');
  const [textoPesquisado, setTextoPesquisado] = useState('');
  const [categoria, setCategoria] = useState<Categoria | undefined>(undefined);
  const [meio, setMeio] = useState<MeioPagamento | undefined>(undefined);
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');
  const [intervalo, setIntervalo] = useState<IntervaloRapido>('tudo');
  const [resultado, setResultado] = useState<ResultadoPesquisa | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [emEdicao, setEmEdicao] = useState<Despesa | null>(null);
  const [partilhadaAberta, setPartilhadaAberta] = useState<DespesaPartilhadaDto | null>(null);
  const ultimoPedido = useRef(0);

  // O texto só conta quando se para de escrever
  useEffect(() => {
    const espera = setTimeout(() => setTextoPesquisado(texto), ESPERA_TEXTO_MS);
    return () => clearTimeout(espera);
  }, [texto]);

  const filtro = useCallback(
    (pagina: number): FiltroPesquisa => ({
      texto: textoPesquisado,
      categoria,
      meioPagamento: meio,
      valorMin: valorOuNada(valorMin),
      valorMax: valorOuNada(valorMax),
      ...datasDoIntervalo(intervalo),
      pagina,
      tamanho: TAMANHO_PAGINA,
    }),
    [textoPesquisado, categoria, meio, valorMin, valorMax, intervalo]
  );

  const pesquisar = useCallback(
    async (pagina = 1) => {
      if (!user?.id) return;
      const pedido = ++ultimoPedido.current;
      setACarregar(true);
      try {
        const novo = await PesquisaDB.pesquisar(filtro(pagina));
        if (pedido !== ultimoPedido.current) return;
        // "Ver mais": junta a página seguinte às que já estão
        setResultado((antes) => (pagina > 1 && antes ? { ...novo, itens: [...antes.itens, ...novo.itens] } : novo));
        setErro(null);
      } catch (error) {
        if (pedido !== ultimoPedido.current) return;
        console.error('Erro na pesquisa:', error);
        setErro(error instanceof ErroApi && error.estado === 400 ? error.message : t('Não foi possível pesquisar.'));
      } finally {
        if (pedido === ultimoPedido.current) setACarregar(false);
      }
    },
    [user?.id, filtro]
  );

  useEffect(() => {
    pesquisar(1);
  }, [pesquisar]);

// A minha parte de uma despesa partilhada não se edita aqui: abre a despesa do grupo (onde se muda o meio de pagamento)
  async function abrirDespesaPartilhada(despesa: Despesa) {
    if (!despesa.despesaPartilhadaId) {
      setEmEdicao(despesa);
      return;
    }
    try {
      setPartilhadaAberta(await PartilhadoDB.obterDespesa(despesa.despesaPartilhadaId));
    } catch (error) {
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível abrir a despesa.')));
    }
  }

  async function guardarEdicao(despesa: Despesa, campos: CamposExtra) {
    if (!user?.id) return;
    try {
      await DespesasExtrasDB.update(user.id, despesa.id, campos);
      setEmEdicao(null);
      await pesquisar(1);
    } catch (error) {
      console.error('Erro ao editar despesa:', error);
      mostrarAlerta(t('Erro'), error instanceof ErroApi && error.estado === 409 ? error.message : t('Não foi possível guardar as alterações.'));
    }
  }

  async function apagarDespesa(despesa: Despesa) {
    if (!user?.id) return;
    try {
      await DespesasExtrasDB.remove(user.id, despesa.id);
      setEmEdicao(null);
      await pesquisar(1);
    } catch (error) {
      console.error('Erro ao apagar despesa:', error);
      mostrarAlerta(t('Erro'), t('Não foi possível apagar a despesa.'));
    }
  }

  const haMais = !!resultado && resultado.itens.length < resultado.total;

  return (
    <Ecra
      keyboardShouldPersistTaps="handled"
      cabecalho={
        <>
          <Header title={t('Pesquisar gastos')} onMenuPress={() => setMenuVisible(true)} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} />
        </>
      }
      sobreposicao={
        <>
          <EditarDespesaExtraModal
            despesa={emEdicao}
            onFechar={() => setEmEdicao(null)}
            onGuardar={guardarEdicao}
            onApagar={apagarDespesa}
          />
          <DespesaPartilhadaModal
            visivel={partilhadaAberta !== null}
            despesa={partilhadaAberta}
            podeApagar={partilhadaAberta?.pagadorUid === user?.id}
            onFechar={() => setPartilhadaAberta(null)}
            onGuardado={() => pesquisar(1)}
          />
        </>
      }
    >
      <Botao
        variante="fantasma"
        pequeno
        icone="arrow-back"
        titulo={t('Gastos do Dia a Dia')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/despesas-extras' as Href))}
        style={styles.voltar}
      />

      <Cartao>
        <CampoTexto
          placeholder={t('Procurar (ex: café, continente)')}
          value={texto}
          onChangeText={setTexto}
          accessibilityLabel={t('Texto a procurar no título')}
          autoFocus
        />

        <Text style={styles.rotulo}>{t('Quando')}</Text>
        <View style={styles.chips}>
          {INTERVALOS_RAPIDOS.map((opcao) => (
            <Chip
              key={opcao.valor}
              rotulo={t(opcao.rotulo)}
              cor={COR}
              ativo={intervalo === opcao.valor}
              onPress={() => setIntervalo(opcao.valor)}
            />
          ))}
        </View>

        <Text style={styles.rotulo}>{t('Categoria')}</Text>
        <View style={styles.chips}>
          <Chip rotulo={t('Todas')} cor={COR} ativo={categoria === undefined} onPress={() => setCategoria(undefined)} />
          {CATEGORIAS.map((c) => (
            <Chip
              key={c.chave}
              rotulo={c.nome}
              icone={c.icone}
              cor={c.cor}
              ativo={categoria === c.chave}
              onPress={() => setCategoria(categoria === c.chave ? undefined : c.chave)}
            />
          ))}
        </View>

        {/* Conta ou cartão de alimentação: só a quem tem cartão */}
        {(temCartao === true || meio !== undefined) && (
          <>
            <Text style={styles.rotulo}>{t('Pago com')}</Text>
            <View style={styles.chips}>
              <Chip rotulo={t('Tudo')} cor={COR} ativo={meio === undefined} onPress={() => setMeio(undefined)} />
              <Chip rotulo={t('Conta')} icone={ICONE_CONTA} cor={COR_CONTA} ativo={meio === 'conta'} onPress={() => setMeio('conta')} />
              <Chip
                rotulo={t('Cartão')}
                icone={ICONE_CARTAO}
                cor={COR_CARTAO}
                ativo={meio === 'cartaoAlimentacao'}
                onPress={() => setMeio('cartaoAlimentacao')}
              />
            </View>
          </>
        )}

        <View style={styles.valores}>
          <CampoTexto
            rotulo={t('Valor mínimo (€)')}
            keyboardType="numeric"
            value={valorMin}
            onChangeText={setValorMin}
            estiloCaixa={styles.valor}
          />
          <CampoTexto
            rotulo={t('Valor máximo (€)')}
            keyboardType="numeric"
            value={valorMax}
            onChangeText={setValorMax}
            estiloCaixa={styles.valor}
          />
        </View>
      </Cartao>

      {resultado && (
        <View style={styles.resumo}>
          <Text style={styles.resumoTexto}>
            {resultado.total === 1 ? t('1 gasto') : t('{n} gastos', { n: resultado.total })}
          </Text>
          <ValorEuro valor={resultado.soma} tipo="saida" style={styles.resumoValor} />
        </View>
      )}

      {erro && <Text style={styles.vazio}>{erro}</Text>}
      {!resultado && aCarregar && <ActivityIndicator style={styles.estado} color={COR} />}

      {resultado?.itens.map((despesa) => {
        const info = infoCategoria(despesa.categoria);
        return (
          <Pressable
            key={despesa.id}
            style={({ pressed }) => [styles.item, pressed && styles.premido]}
            onPress={() => abrirDespesaPartilhada(despesa)}
            accessibilityRole="button"
            accessibilityLabel={t('{titulo}, {valor} euros, {categoria}{data}', {
              titulo: despesa.titulo,
              valor: despesa.valor.toFixed(2),
              categoria: t(info.nome),
              data: despesa.data ? `, ${formatarData(despesa.data)}` : '',
            })}
            accessibilityHint={despesa.despesaPartilhadaId ? t('Abre a despesa partilhada') : t('Abre para editar ou apagar')}
          >
            <View style={[styles.icone, { backgroundColor: comAlfa(info.cor, 0.12) }]}>
              <Ionicons name={info.icone} size={16} color={info.cor} />
            </View>
            <View style={styles.info}>
              <Text style={styles.titulo}>{despesa.titulo}</Text>
              <View style={styles.nota}>
                {!!despesa.gastoRecorrenteId && <Ionicons name="repeat" size={13} color={COR} />}
                {despesa.meioPagamento === 'cartaoAlimentacao' && <Ionicons name={ICONE_CARTAO} size={13} color={COR_CARTAO} />}
                <Text style={styles.notaTexto}>
                  <Text style={{ color: info.cor }}>{t(info.nome)}</Text>
                  {despesa.data ? ` · ${formatarData(despesa.data)}` : ''}
                </Text>
              </View>
            </View>
            <ValorEuro valor={despesa.valor} tipo="saida" />
          </Pressable>
        );
      })}

      {resultado && resultado.total === 0 && <Text style={styles.vazio}>{t('Nenhum gasto encontrado')}</Text>}

      {haMais && (
        <Botao
          variante="secundario"
          cor={COR}
          titulo={aCarregar ? t('A carregar…') : t('Ver mais')}
          aCarregar={aCarregar}
          onPress={() => pesquisar(resultado!.pagina + 1)}
          style={styles.mais}
        />
      )}
    </Ecra>
  );
}

const styles = StyleSheet.create({
  voltar: {
    alignSelf: 'flex-start',
    marginTop: espaco.md,
    marginBottom: espaco.sm,
  },
  rotulo: {
    ...tipografia.rotulo,
    fontSize: 11,
    marginBottom: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: espaco.md,
  },
  valores: {
    flexDirection: 'row',
    gap: espaco.sm,
  },
  valor: {
    flex: 1,
  },
  resumo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: espaco.md,
  },
  resumoTexto: {
    ...tipografia.corpoMedio,
  },
  resumoValor: {
    fontSize: 17,
  },
  estado: {
    padding: espaco.xl,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    paddingVertical: espaco.md,
    paddingHorizontal: espaco.md + 2,
    borderRadius: raio.md + 2,
    marginBottom: espaco.sm,
  },
  premido: {
    backgroundColor: cores.superficiePremida,
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
  titulo: {
    ...tipografia.corpoMedio,
  },
  nota: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  notaTexto: {
    ...tipografia.nota,
    color: cores.textoSecundario,
  },
  vazio: {
    ...tipografia.secundario,
    textAlign: 'center',
    fontStyle: 'italic',
    padding: espaco.xl,
  },
  mais: {
    marginBottom: espaco.xl,
  },
});
