import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CampoData } from '../../components/CampoData';
import { EditarDespesaExtraModal } from '../../components/EditarDespesaExtraModal';
import { DespesaPartilhadaModal, type DespesaInicial } from '../../components/partilhado/DespesaPartilhadaModal';
import { mensagemDaApi } from '../../services/grupos';
import { PartilhadoDB, type DespesaPartilhadaDto } from '../../services/partilhado';
import { LinhaGastoPendente, mesDoPendente, useGastosPendentes } from '../../components/GastosPendentes';
import { GastosRecorrentesLista } from '../../components/GastosRecorrentesLista';
import { Header } from '../../components/Header';
import { SeletorCategoria } from '../../components/SeletorCategoria';
import { SeletorMeioPagamento } from '../../components/SeletorMeioPagamento';
import { COR_CARTAO, ICONE_CARTAO } from '../../constants/meiosPagamento';
import { SeletorMes } from '../../components/SeletorMes';
import { SeletorRepeticao } from '../../components/SeletorRepeticao';
import { SideMenu } from '../../components/SideMenu';
import { Botao, CampoTexto, Cartao, CartaoSaldo, Ecra, TituloSecao, ValorEuro } from '../../components/ui';
import { useSugestaoCategoria } from '../../components/useSugestaoCategoria';
import { acentosFolha, comAlfa, cores, espaco, fontes, raio, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useGrupos } from '../../contexts/ParceriasContext';
import { useT } from '../../i18n';
import {
  calcularSaldoDisponivel,
  Categoria,
  ContaCorrenteDB,
  Despesa,
  DespesasExtrasDB,
  MeioPagamento,
  Mes,
  mesAtual,
  mesDaData,
  nomeMes,
  OrcamentosDB,
} from '../../services/database';
import { ErroApi } from '../../services/api';
import { ouvir } from '../../services/eventos';
import { publicarCartao } from '../../services/saldoCartao';
import { GastosRecorrentesDB, regraDaRepeticao, Repeticao } from '../../services/gastosRecorrentes';
import { eCombustivel, textoLitros } from '../../utils/combustivel';
import { infoCategoria } from '../../utils/categorias';
import { CamposExtra, somarValores, textoHoje, validarDespesaExtra } from '../../utils/ecrasDespesas';
import { formatarData, mostrarAlerta, parseValor } from '../../utils/helpers';
import { alertaOrcamento } from '../../utils/orcamentos';

// O acento das gastos do dia a dia: o roxo do bloco "Despesas do Mês" da folha
const COR = acentosFolha.despesasMes;

// O último meio de pagamento escolhido (enquanto a app está aberta): quem paga o almoço com o
// cartão costuma registar várias seguidas
let ultimoMeio: MeioPagamento = 'conta';

// A mensagem a mostrar quando a API recusa (ex.: 409 "O cartão de alimentação só tem ...")
const mensagemDe = (erro: unknown, porDefeito: string) =>
  erro instanceof ErroApi && (erro.estado === 409 || erro.estado === 400) ? erro.message : porDefeito;

export default function DespesasExtrasScreen() {
  const [menuVisible, setMenuVisible] = useState(false);
  const [mes, setMes] = useState<Mes>(mesAtual);
  // O mês mostrado também numa ref: depois de gravar (await) é preciso saber o mês de agora,
  // não o do momento em que se carregou no botão
  const mesMostrado = useRef(mes);
  // As despesas e o mês a que pertencem: enquanto o mês escolhido não chega, não se mostra a lista de outro
  const [carregadas, setCarregadas] = useState<{ mes: Mes; despesas: Despesa[] } | null>(null);
  const [erroCarregar, setErroCarregar] = useState(false);
  const ultimoPedido = useRef(0);
  const [saldoDisponivel, setSaldoDisponivel] = useState(0);
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoValor, setNovoValor] = useState('');
  const [novosLitros, setNovosLitros] = useState('');
  // null = hoje, lido só ao guardar (com a app aberta de um dia para o outro, "hoje" não fica a ser ontem)
  const [novaData, setNovaData] = useState<string | null>(null);
  // null = a sugerida pelo título (pedida à API enquanto se escreve); tocar num chip fixa-a
  const [categoriaEscolhida, setCategoriaEscolhida] = useState<Categoria | null>(null);
  const [meioPagamento, setMeioPagamento] = useState<MeioPagamento>(ultimoMeio);
  // Saldo do cartão de alimentação (à parte do Saldo Disponível): o seletor do meio de pagamento mostra-o
  const [saldoCartao, setSaldoCartao] = useState<number | undefined>(undefined);
  // A ref trava dois toques seguidos (o estado só muda no render seguinte): o dinheiro sairia duas vezes
  const aAdicionar = useRef(false);
  const [aAdicionarVisivel, setAAdicionarVisivel] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Despesa | null>(null);
  // Dividir num grupo: o gasto (novo, do formulário, ou um já registado) abre como despesa partilhada
  const [aPartilhar, setAPartilhar] = useState<DespesaInicial | null>(null);
  const [partilhadaAberta, setPartilhadaAberta] = useState<DespesaPartilhadaDto | null>(null);
  const { grupos } = useGrupos();
  // "Repetir": cria também um gasto que se repete (precisa de rede)
  const [repeticao, setRepeticao] = useState<Repeticao>('nao');
  // Sobe a cada carregamento: a lista "Gastos que se repetem" volta a ler-se
  const [versao, setVersao] = useState(0);
  const { user } = useAuth();
  const t = useT();

  // A sugestão vem da API: a última categoria usada nesse título, senão pelas palavras-chave
  const sugerirCategoria = useCallback(
    (titulo: string) => DespesasExtrasDB.sugerirCategoria(user?.id ?? '', titulo),
    [user?.id]
  );
  const sugestao = useSugestaoCategoria(novoTitulo, user?.id ? sugerirCategoria : undefined, categoriaEscolhida === null);
  const categoriaMostrada: Categoria = categoriaEscolhida ?? sugestao?.categoria ?? 'outros';

  // Gastos registados sem internet, ainda por enviar (aparecem no topo da lista do seu mês)
  const pendentes = useGastosPendentes(user?.id);

  useFocusEffect(
    useCallback(() => {
      carregarDados(mes);
      // Gravou-se noutro sítio (botão rápido "+", fila offline): carregar outra vez
      return ouvir('dadosMudaram', () => carregarDados(mesMostrado.current));
    }, [user, mes])
  );

  function mudarMes(novo: Mes) {
    mesMostrado.current = novo;
    setErroCarregar(false);
    setMes(novo); // o useFocusEffect carrega o mês novo
  }

  async function carregarDados(mesPedido: Mes) {
    if (!user?.id) return;
    // Só conta a resposta do último pedido: ao mudar de mês depressa, um pedido antigo
    // que chegue depois não pode desenhar o mês errado
    const pedido = ++ultimoPedido.current;
    try {
      // O saldo primeiro (pode receber o salário, que também carrega o cartão), depois o resto
      const saldo = await calcularSaldoDisponivel(user.id);
      const [lista, cartao] = await Promise.all([
        DespesasExtrasDB.getDoMes(user.id, mesPedido),
        ContaCorrenteDB.getCartaoAlimentacao(user.id).catch(() => null),
      ]);
      if (pedido !== ultimoPedido.current) return;
      setCarregadas({ mes: mesPedido, despesas: lista });
      setSaldoDisponivel(saldo);
      if (cartao) setSaldoCartao(cartao.saldo);
      publicarCartao(cartao); // o cabeçalho e o menu mostram o mesmo saldo
      setErroCarregar(false);
      setVersao((v) => v + 1);
    } catch (error) {
      if (pedido !== ultimoPedido.current) return;
      console.error('Erro ao carregar despesas:', error);
      setErroCarregar(true);
    }
  }

  // Depois de gravar: mostrar o mês onde a despesa ficou (se for outro, o seletor muda para lá)
  async function mostrarMes(destino: Mes) {
    if (destino !== mesMostrado.current) {
      mudarMes(destino);
    } else {
      await carregarDados(destino);
    }
  }

  async function adicionarDespesa(dividir = false) {
    if (!user?.id || aAdicionar.current) return;
    const resultado = validarDespesaExtra({
      titulo: novoTitulo,
      valor: novoValor,
      data: novaData ?? textoHoje(),
      litros: eCombustivel(categoriaMostrada) ? novosLitros : undefined,
    });
    if ('erro' in resultado) {
      mostrarAlerta(t('Erro'), resultado.erro);
      return;
    }

    // A escolhida, ou a sugestão se já for a do título escrito. Se a sugestão ainda não chegou
    // (carregou-se em Adicionar logo a seguir a escrever), a API guarda a sua própria sugestão
    const categoria =
      categoriaEscolhida ?? (sugestao && sugestao.titulo === resultado.despesa.titulo ? sugestao.categoria : undefined);
    const mesDaDespesa = mesDaData(resultado.despesa.data) ?? mesMostrado.current;
    const dados = {
      titulo: resultado.despesa.titulo,
      valor: resultado.despesa.valor,
      data: resultado.despesa.data,
      categoria,
      meioPagamento,
      repeticao,
      litros: resultado.despesa.litros,
    };

    // Dividir num grupo: abre a despesa partilhada já preenchida (lá escolhe-se o grupo e quem participa)
    if (dividir) {
      setAPartilhar({ titulo: dados.titulo, valor: dados.valor, data: dados.data, categoria, meioPagamento });
      return;
    }

    await guardarDespesaSimples(dados, mesDaDespesa);
  }

  async function guardarDespesaSimples(
    dados: {
      titulo: string;
      valor: number;
      data: string;
      categoria: Categoria | undefined;
      meioPagamento: MeioPagamento;
      repeticao: Repeticao;
      litros?: number;
    },
    mesDaDespesa: Mes
  ) {
    if (!user?.id) return;
    aAdicionar.current = true;
    setAAdicionarVisivel(true);
    try {
      const { pendente } = await DespesasExtrasDB.add(user.id, { ...dados });
      if (dados.repeticao !== 'nao') {
        await criarRepeticao(dados, dados.repeticao, pendente);
      }
      ultimoMeio = dados.meioPagamento;
      limparFormulario();
      if (pendente) {
        mostrarAlerta(t('Sem ligação à internet'), t('O gasto fica guardado e é enviado quando voltar a internet.'));
        return;
      }
      await mostrarMes(mesDaDespesa);
      await avisarOrcamento(dados.titulo, dados.categoria, mesDaDespesa);
    } catch (error) {
      console.error('Erro ao guardar despesa:', error);
      mostrarAlerta(t('Erro'), mensagemDe(error, t('Não foi possível guardar a despesa.')));
    } finally {
      aAdicionar.current = false;
      setAAdicionarVisivel(false);
    }
  }

  function limparFormulario() {
    setRepeticao('nao');
    setNovoTitulo('');
    setNovoValor('');
    setNovosLitros('');
    setNovaData(null);
    setCategoriaEscolhida(null);
  }


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

  // A despesa partilhada foi guardada (nova, vinda do formulário, ou um gasto que passou a partilhado)
  async function aposPartilhar() {
    if (aPartilhar && !aPartilhar.despesaExtraId) {
      limparFormulario();
    }
    await carregarDados(mesMostrado.current);
  }

  // O gasto deste dia já ficou registado; a regra que se repete começa no dia seguinte.
  // Sem rede (o gasto ficou na fila), a repetição não se cria: avisa-se
  async function criarRepeticao(
    gasto: { titulo: string; valor: number; data: string; categoria?: Categoria; meioPagamento: MeioPagamento },
    frequencia: Exclude<Repeticao, 'nao'>,
    pendente: boolean
  ) {
    if (pendente) {
      mostrarAlerta(t('Sem ligação'), t('O gasto fica guardado e é enviado quando houver rede, mas a repetição precisa de internet: cria-a outra vez mais tarde.'));
      return;
    }
    try {
      await GastosRecorrentesDB.add(regraDaRepeticao(gasto, frequencia));
    } catch (error) {
      console.error('Erro ao criar a repetição:', error);
      mostrarAlerta(t('Erro'), mensagemDe(error, t('O gasto ficou guardado, mas não foi possível criar a repetição.')));
    }
  }

  // Depois de registar: se o orçamento da categoria chegou aos 80% (ou passou do limite), avisar.
  // Se não der para saber (sem rede, sem orçamento), não se diz nada: a despesa já ficou guardada
  async function avisarOrcamento(titulo: string, categoria: Categoria | undefined, mes: Mes) {
    if (!user?.id) return;
    try {
      // Sem categoria enviada, a API guardou a que sugere (que agora já vem do histórico)
      const daDespesa = categoria ?? (await DespesasExtrasDB.sugerirCategoria(user.id, titulo)).categoria;
      const estados = await OrcamentosDB.getEstado(user.id, mes);
      const alerta = alertaOrcamento(estados.find((e) => e.categoria === daDespesa));
      if (alerta) mostrarAlerta(alerta.titulo, alerta.mensagem);
    } catch (error) {
      console.error('Erro ao ver o orçamento:', error);
    }
  }

  async function guardarEdicao(despesa: Despesa, campos: CamposExtra) {
    if (!user?.id) return;
    try {
      await DespesasExtrasDB.update(user.id, despesa.id, campos);
      setEmEdicao(null);
      // Mudar a data pode passar a despesa para outro mês: ir para esse mês para a ver lá
      await mostrarMes((campos.data && mesDaData(campos.data)) || mesMostrado.current);
    } catch (error) {
      console.error('Erro ao editar despesa:', error);
      mostrarAlerta(t('Erro'), mensagemDe(error, t('Não foi possível guardar as alterações.')));
    }
  }

  async function apagarDespesa(despesa: Despesa) {
    if (!user?.id) return;
    try {
      await DespesasExtrasDB.remove(user.id, despesa.id);
      setEmEdicao(null);
      await carregarDados(mesMostrado.current);
    } catch (error) {
      console.error('Erro ao apagar despesa:', error);
      mostrarAlerta(t('Erro'), t('Não foi possível apagar a despesa.'));
    }
  }

  const despesas = carregadas?.mes === mes ? carregadas.despesas : null;
  // Saldo Disponível = conta corrente (cada extra já saiu da conta ao ser registada): não subtrair outra vez
  const saldoRestante = saldoDisponivel;

  return (
    <Ecra
      keyboardShouldPersistTaps="handled"
      cabecalho={
        <>
          <Header
            title={t('Gastos do Dia a Dia')}
            onMenuPress={() => setMenuVisible(true)}
            saldo={saldoRestante}
          />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldoRestante} />
        </>
      }
      sobreposicao={
        <>
          <EditarDespesaExtraModal
            despesa={emEdicao}
            onFechar={() => setEmEdicao(null)}
            onGuardar={guardarEdicao}
            onApagar={apagarDespesa}
            sugerirCategoria={user?.id ? sugerirCategoria : undefined}
            saldoConta={saldoDisponivel}
            saldoCartao={saldoCartao}
          />
          <DespesaPartilhadaModal
            visivel={aPartilhar !== null || partilhadaAberta !== null}
            inicial={aPartilhar}
            despesa={partilhadaAberta}
            podeApagar={partilhadaAberta?.pagadorUid === user?.id}
            onFechar={() => {
              setAPartilhar(null);
              setPartilhadaAberta(null);
            }}
            onGuardado={aposPartilhar}
          />
        </>
      }
    >
      <SeletorMes mes={mes} onChange={mudarMes} />

      <View style={styles.atalhos}>
        <Botao
          variante="secundario"
          pequeno
          cor={COR}
          icone="search"
          titulo={t('Pesquisar gastos')}
          onPress={() => router.push('/(tabs)/pesquisa' as Href)}
          accessibilityHint={t('Procura gastos de todos os meses')}
          style={styles.atalho}
        />
      </View>

      <CartaoSaldo
        variante="violeta"
        alertaNegativo={false}
        rotulo={t('Total em Extras')}
        valor={despesas ? somarValores(despesas) : undefined}
        icone="nota:asas"
        subtitulo={nomeMes(mes)}
        style={styles.totalCard}
      />

      {/* Lista de despesas do mês */}
      <View style={styles.listaContainer}>
        {despesas === null ? (
          erroCarregar ? (
            <View style={styles.estadoContainer}>
              <Text style={styles.vazioText}>{t('Não foi possível carregar as despesas.')}</Text>
              <Botao
                variante="secundario"
                pequeno
                icone="refresh-outline"
                titulo={t('Tentar outra vez')}
                onPress={() => carregarDados(mes)}
              />
            </View>
          ) : (
            <ActivityIndicator style={styles.estadoContainer} color={COR} />
          )
        ) : (
          <>
            {pendentes
              .filter((p) => mesDoPendente(p) === mes)
              .map((p) => (
                <LinhaGastoPendente key={p.id} pendente={p} />
              ))}
            {despesas.map((despesa) => {
              // Sem categoria (despesas antigas): aparece como "Outros"
              const categoria = infoCategoria(despesa.categoria);
              return (
                <Pressable
                  key={despesa.id}
                  style={({ pressed }) => [styles.despesaItem, pressed && styles.despesaPremida]}
                  onPress={() => abrirDespesaPartilhada(despesa)}
                  accessibilityRole="button"
                  accessibilityLabel={t('{titulo}, {valor} euros, {categoria}{data}', {
                    titulo: despesa.titulo,
                    valor: despesa.valor.toFixed(2),
                    categoria: t(categoria.nome),
                    data: despesa.data ? `, ${formatarData(despesa.data)}` : '',
                  })}
                  accessibilityHint={despesa.despesaPartilhadaId ? t('Abre a despesa partilhada') : t('Abre para editar ou apagar')}
                >
                  <View style={[styles.despesaIcone, { backgroundColor: comAlfa(categoria.cor, 0.12) }]}>
                    <Ionicons name={categoria.icone} size={16} color={categoria.cor} />
                  </View>
                  <View style={styles.despesaInfo}>
                    <Text style={styles.despesaTitulo}>{despesa.titulo}</Text>
                    <View style={styles.despesaLinhaNota}>
                      {!!despesa.gastoRecorrenteId && (
                        <Ionicons name="repeat" size={13} color={COR} accessibilityLabel={t('Gasto que se repete')} />
                      )}
                      {despesa.meioPagamento === 'cartaoAlimentacao' && (
                        <Ionicons name={ICONE_CARTAO} size={13} color={COR_CARTAO} accessibilityLabel={t('Paga com o cartão de alimentação')} />
                      )}
                      <Text style={styles.despesaData}>
                        <Text style={{ color: categoria.cor }}>{t(categoria.nome)}</Text>
                        {despesa.data ? ` · ${formatarData(despesa.data)}` : ''}
                        {textoLitros(despesa) ? ` · ${textoLitros(despesa)}` : ''}
                      </Text>
                    </View>
                  </View>
                  <ValorEuro valor={despesa.valor} tipo="saida" style={styles.despesaValor} />
                  {!despesa.despesaPartilhadaId && <Ionicons name="create-outline" size={18} color={cores.textoMudo} style={styles.editarIcone} />}
                  {despesa.despesaPartilhadaId ? (
                    <Ionicons name="people" size={16} color={COR} style={styles.partilhadaIcone} accessibilityLabel={t('A tua parte de uma despesa partilhada')} />
                  ) : grupos.length > 0 ? (
                    <Pressable
                      style={({ pressed }) => [styles.botaoLinha, pressed && styles.botaoLinhaPremido]}
                      onPress={(e) => {
                        e.stopPropagation();
                        setAPartilhar({
                          titulo: despesa.titulo,
                          valor: despesa.valor,
                          data: despesa.data,
                          categoria: despesa.categoria,
                          meioPagamento: despesa.meioPagamento,
                          despesaExtraId: despesa.id,
                        });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('Dividir "{titulo}" num grupo', { titulo: despesa.titulo })}
                    >
                      <Text style={styles.botaoLinhaTexto}>{t('Dividir')}</Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}

            {despesas.length === 0 && (
              <Text style={styles.vazioText}>{t('Nenhum gasto em {mes}', { mes: nomeMes(mes) })}</Text>
            )}
          </>
        )}
      </View>

      <GastosRecorrentesLista cor={COR} versao={versao} onAlterado={() => carregarDados(mesMostrado.current)} />

      {/* Adicionar nova */}
      <Cartao>
        <TituloSecao titulo={t('Adicionar Gasto')} icone="add-circle-outline" cor={COR} />

        <CampoTexto
          placeholder={t('Título (ex: Jantar fora, Cinema, Compras)')}
          value={novoTitulo}
          onChangeText={setNovoTitulo}
          accessibilityLabel={t('Título')}
        />

        <CampoTexto
          placeholder={t('Valor (€)')}
          keyboardType="numeric"
          value={novoValor}
          onChangeText={setNovoValor}
          accessibilityLabel={t('Valor em euros')}
        />

        {/* Pré-escolhida pelo título, enquanto não se tocar num chip */}
        <SeletorCategoria
          valor={categoriaMostrada}
          onChange={setCategoriaEscolhida}
          sugerida={categoriaEscolhida === null && !!sugestao}
          origemTexto={categoriaEscolhida === null ? sugestao?.origemTexto : undefined}
        />

        {eCombustivel(categoriaMostrada) && (
          <CampoTexto
            placeholder={t('Litros (opcional)')}
            keyboardType="numeric"
            value={novosLitros}
            onChangeText={setNovosLitros}
            accessibilityLabel={t('Litros abastecidos')}
          />
        )}

        <SeletorMeioPagamento
          valor={meioPagamento}
          onChange={setMeioPagamento}
          saldoConta={saldoDisponivel}
          saldoCartao={saldoCartao}
        />

        {/* Escolher "Hoje" volta ao automático (null) */}
        <CampoData
          valor={novaData ?? textoHoje()}
          onChange={(texto) => setNovaData(texto === textoHoje() ? null : texto)}
          cor={COR}
        />

        <SeletorRepeticao valor={repeticao} onChange={setRepeticao} cor={COR} />

        {/* Dividir num grupo: abre logo a despesa partilhada, já preenchida (grupo, quem participa e como) */}
        {grupos.length > 0 && (
          <Pressable style={styles.dividirLinha} onPress={() => adicionarDespesa(true)} accessibilityRole="button">
            <Ionicons name="people-outline" size={22} color={COR} />
            <View style={styles.dividirTextos}>
              <Text style={styles.dividirTitulo}>{t('Dividir num grupo')}</Text>
              <Text style={styles.dividirNota}>{t('Pagas tu; nos teus gastos só fica a tua parte')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={cores.textoMudo} />
          </Pressable>
        )}

        <Botao
          titulo={aAdicionarVisivel ? t('A guardar…') : t('Adicionar')}
          icone="add"
          onPress={() => adicionarDespesa()}
          aCarregar={aAdicionarVisivel}
        />
      </Cartao>
    </Ecra>
  );
}

const styles = StyleSheet.create({
  atalhos: {
    flexDirection: 'row',
    marginTop: espaco.md,
  },
  atalho: {
    flexGrow: 1,
  },
  despesaLinhaNota: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  totalCard: {
    marginBottom: espaco.xl,
  },
  listaContainer: {
    marginBottom: espaco.xl,
  },
  estadoContainer: {
    padding: espaco.xl,
    alignItems: 'center',
  },
  despesaItem: {
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
  despesaPremida: {
    backgroundColor: cores.superficiePremida,
    transform: [{ scale: 0.99 }],
  },
  despesaIcone: {
    width: 32,
    height: 32,
    borderRadius: raio.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: espaco.md,
  },
  despesaInfo: {
    flex: 1,
    marginRight: espaco.sm,
  },
  despesaTitulo: {
    ...tipografia.corpoMedio,
    fontSize: 16,
  },
  despesaData: {
    ...tipografia.nota,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  despesaValor: {
    fontSize: 15,
  },
  editarIcone: {
    paddingLeft: espaco.md,
  },
  vazioText: {
    ...tipografia.secundario,
    textAlign: 'center',
    fontStyle: 'italic',
    padding: espaco.xl,
  },
  botaoLinha: {
    paddingVertical: espaco.xs,
    paddingHorizontal: espaco.sm,
  },
  botaoLinhaTexto: {
    ...tipografia.nota,
    color: cores.primaria,
  },
  botaoLinhaPremido: {
    opacity: 0.7,
  },
  partilhadaIcone: {
    marginLeft: espaco.sm,
  },
  dividirLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    borderWidth: 1,
    borderColor: comAlfa(COR, 0.3),
    borderRadius: raio.md,
    padding: espaco.md,
    marginBottom: espaco.md,
  },
  dividirTextos: {
    flex: 1,
  },
  dividirTitulo: {
    fontFamily: fontes.corpoForte,
    color: cores.texto,
    fontSize: 14,
  },
  dividirNota: {
    ...tipografia.nota,
    marginTop: 1,
  },
});
