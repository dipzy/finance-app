import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { EditarDespesaMensalModal } from '../../components/EditarDespesaMensalModal';
import { CampoDebitoAutomatico } from '../../components/CampoDebitoAutomatico';
import { CampoValorVariavel } from '../../components/CampoValorVariavel';
import { DespesasEmAtraso } from '../../components/DespesasEmAtraso';
import { Header } from '../../components/Header';
import { DivisaoGrupo, type EstadoDivisao } from '../../components/partilhado/DivisaoGrupo';
import { SeletorCategoria } from '../../components/SeletorCategoria';
import { SeletorMes } from '../../components/SeletorMes';
import { SideMenu } from '../../components/SideMenu';
import { Separadores } from '../../components/Separadores';
import { Botao, CampoTexto, Cartao, CartaoSaldo, Ecra, TituloSecao, ValorEuro } from '../../components/ui';
import { acentosFolha, comAlfa, cores, espaco, fontes, raio, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';
import { calcularSaldoDisponivel, Despesa, DespesasFixasDB, Mes, mesAtual, nomeMes, PagamentoFixa, PagamentosDB } from '../../services/database';
import { carregarEmAtraso } from '../../services/emAtraso';
import { mensagemDaApi } from '../../services/grupos';
import type { Categoria } from '../../services/tipos';
import { reagendarNotificacoes } from '../../services/notificacoes';
import { confirmar } from '../../utils/confirmar';
import { infoCategoria, nomeCategoria } from '../../utils/categorias';
import {
  CamposMensal,
  LinhaMensal,
  mensagemApagarMensal,
  mensagemDesfazerPagamento,
  temDebitoAutomatico,
  resumoDespesasMensais,
  textoEstado,
  validarDespesaMensal,
} from '../../utils/ecrasDespesas';
import { mostrarAlerta, parseValor } from '../../utils/helpers';
import { ResumoEmAtraso, SEM_ATRASO } from '../../utils/painel';

// Menta para o que já está pago; o acento do ecrã é o laranja do bloco "Despesas" da folha
const COR = cores.positivo;
const ACENTO = acentosFolha.despesas;

export default function DespesasFixasScreen() {
  const [menuVisible, setMenuVisible] = useState(false);
  const [mes, setMes] = useState<Mes>(mesAtual);
  // O mês mostrado também numa ref: depois de gravar (await) é preciso saber o mês de agora,
  // não o do momento em que se carregou no botão
  const mesMostrado = useRef(mes);
  // Os dados e o mês a que pertencem: enquanto o mês escolhido não chega, não se mostram os de outro
  const [carregado, setCarregado] = useState<{ mes: Mes; fixas: Despesa[]; pagamentos: PagamentoFixa[] } | null>(null);
  const [erroCarregar, setErroCarregar] = useState(false);
  const [emAtraso, setEmAtraso] = useState<ResumoEmAtraso>(SEM_ATRASO);
  const ultimoPedido = useRef(0);
  const [saldoRestante, setSaldoRestante] = useState(0);
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoValor, setNovoValor] = useState('');
  const [novoDiaDebito, setNovoDiaDebito] = useState('');
  const [novaCategoria, setNovaCategoria] = useState<Categoria | undefined>();
  const [novaVariavel, setNovaVariavel] = useState(false);
  const [novaUnidade, setNovaUnidade] = useState('');
  const [novoDebitoAutomatico, setNovoDebitoAutomatico] = useState(true);
  // Dividir com um grupo; a chave sobe depois de guardar para o seletor voltar ao início
  const [novaDivisao, setNovaDivisao] = useState<EstadoDivisao>({ divisao: null, erro: null, minhaParte: null });
  const [chaveDivisao, setChaveDivisao] = useState(0);
  // A ref trava dois toques seguidos (o estado só muda no render seguinte)
  const aAdicionar = useRef(false);
  const [aAdicionarVisivel, setAAdicionarVisivel] = useState(false);
  // Débitos/anulações a decorrer (id -> valor pedido): o switch mostra já o valor pedido e fica
  // bloqueado até a resposta chegar, em vez de voltar atrás e depois mudar outra vez
  const [emCurso, setEmCurso] = useState<Record<string, boolean>>({});
  const [emEdicao, setEmEdicao] = useState<Despesa | null>(null);
  // A edição abre já no pagamento da fatura (ao carregar em "Pagar" numa despesa de valor variável)
  const [abrirFatura, setAbrirFatura] = useState(false);
  const { user } = useAuth();
  const t = useT();

  useFocusEffect(
    useCallback(() => {
      carregarDados(mes);
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
      // Primeiro o saldo: também faz os débitos automáticos que já chegaram ao dia
      const saldo = await calcularSaldoDisponivel(user.id);
      const [fixas, pagamentos] = await Promise.all([
        DespesasFixasDB.getAll(user.id),
        PagamentosDB.getDoMes(user.id, mesPedido),
      ]);
      // Os meses anteriores por pagar: só se vê no mês de hoje
      const atrasadas = mesPedido === mesAtual() ? await carregarEmAtraso(user.id, fixas) : SEM_ATRASO;
      if (pedido !== ultimoPedido.current) return;
      setCarregado({ mes: mesPedido, fixas, pagamentos });
      setEmAtraso(atrasadas);
      setSaldoRestante(saldo);
      setErroCarregar(false);
    } catch (error) {
      if (pedido !== ultimoPedido.current) return;
      console.error('Erro ao carregar despesas:', error);
      setErroCarregar(true);
    }
  }

  // Só no mês atual: pagar e desfazer o pagamento mexem no dinheiro de hoje
  async function toggleDebitado(linha: LinhaMensal) {
    const despesa = linha.fixa;
    if (!user?.id || !despesa || despesa.id in emCurso) return;
    // Parcial conta como por pagar: o switch paga o que falta (o débito só cobra o resto)
    const paga = linha.estado === 'pago';

    // Valor variável: o que se paga é o da fatura, que se escreve na janela da despesa
    if (!paga && despesa.variavel && !despesa.divisao) {
      setAbrirFatura(true);
      setEmEdicao(despesa);
      return;
    }

    // Desfazer: o valor pago volta para a conta e a despesa fica por pagar
    if (paga && !(await confirmar(t('Desfazer pagamento'), mensagemDesfazerPagamento(linha.titulo, despesa.valorTotal ?? linha.valor, temDebitoAutomatico(despesa)), 'Desfazer pagamento'))) {
      return;
    }

    setEmCurso((atual) => ({ ...atual, [despesa.id]: !paga }));
    try {
      if (paga) {
        await DespesasFixasDB.anularDebito(user.id, despesa.id);
      } else {
        const resultado = await DespesasFixasDB.debitar(user.id, despesa.id);
        if (resultado === 'saldo-insuficiente') {
          mostrarAlerta(t('Saldo insuficiente'), t('Não tens saldo suficiente para debitar esta despesa.'));
        }
      }
      reagendarNotificacoes();
      await carregarDados(mesMostrado.current);
    } catch (error) {
      console.error('Erro ao atualizar despesa:', error);
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível atualizar a despesa.')));
    } finally {
      setEmCurso(({ [despesa.id]: _terminado, ...resto }) => resto);
    }
  }

  async function adicionarDespesa() {
    if (!user?.id || aAdicionar.current) return;
    const resultado = validarDespesaMensal({ titulo: novoTitulo, valor: novoValor, diaDebito: novoDiaDebito, categoria: novaCategoria });
    if ('erro' in resultado) {
      mostrarAlerta(t('Erro'), resultado.erro);
      return;
    }

    if (novaDivisao.erro) {
      mostrarAlerta(t('Erro'), novaDivisao.erro);
      return;
    }

    // Dividida, o valor é o total; a API guarda só a parte de quem paga como valor da despesa
    const dados = {
      titulo: resultado.despesa.titulo,
      valor: resultado.despesa.valor,
      diaDebito: resultado.despesa.diaDebito,
      categoria: resultado.despesa.categoria,
      divisao: novaDivisao.divisao ?? undefined,
      variavel: novaVariavel || undefined,
      debitoAutomatico: novoDebitoAutomatico ? undefined : false,
      unidadeConsumo: novaVariavel && novaUnidade.trim() ? novaUnidade.trim() : undefined,
    };

    aAdicionar.current = true;
    setAAdicionarVisivel(true);
    try {
      await DespesasFixasDB.add(user.id, dados);
      setNovoTitulo('');
      setNovoValor('');
      setNovoDiaDebito('');
      setNovaCategoria(undefined);
      setNovaVariavel(false);
      setNovaUnidade('');
      setNovoDebitoAutomatico(true);
      setChaveDivisao((c) => c + 1);
      reagendarNotificacoes();
      await carregarDados(mesMostrado.current);
    } catch (error) {
      console.error('Erro ao guardar despesa:', error);
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível guardar a despesa.')));
    } finally {
      aAdicionar.current = false;
      setAAdicionarVisivel(false);
    }
  }

  async function guardarEdicao(despesa: Despesa, campos: CamposMensal) {
    if (!user?.id) return;
    try {
      await DespesasFixasDB.update(user.id, despesa.id, campos);
      setEmEdicao(null);
      reagendarNotificacoes();
      await carregarDados(mesMostrado.current);
    } catch (error) {
      console.error('Erro ao editar despesa:', error);
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível guardar as alterações.')));
    }
  }

  async function pagarFatura(despesa: Despesa, valor: number, consumo?: number) {
    if (!user?.id) return;

    setEmCurso((atual) => ({ ...atual, [despesa.id]: true }));
    try {
      const resultado = await DespesasFixasDB.pagarFatura(user.id, despesa.id, valor, consumo);
      if (resultado === 'saldo-insuficiente') {
        mostrarAlerta(t('Saldo insuficiente'), t('Não tens saldo suficiente para pagar esta fatura.'));
        return;
      }
      if (resultado === 'ja-debitada') mostrarAlerta(t('Erro'), t('Esta despesa já está paga este mês.'));

      reagendarNotificacoes();
      await carregarDados(mesMostrado.current);
    } catch (error) {
      console.error('Erro ao pagar a fatura:', error);
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível pagar a fatura.')));
    } finally {
      setEmCurso(({ [despesa.id]: _terminado, ...resto }) => resto);
    }
  }

  async function debitarParcial(despesa: Despesa, valor: number) {
    if (!user?.id) return;

    setEmCurso((atual) => ({ ...atual, [despesa.id]: true }));
    try {
      const resultado = await DespesasFixasDB.debitarParcial(user.id, despesa.id, valor);
      if (resultado === 'saldo-insuficiente') {
        mostrarAlerta(t('Saldo insuficiente'), t('Não tens saldo suficiente para pagar este valor parcial.'));
        return;
      }
      if (resultado === 'ja-debitada') {
        mostrarAlerta(t('Erro'), t('Esta despesa já está paga este mês.'));
        // Os dados estavam desatualizados: recarregar para mostrar o estado real
      }

      reagendarNotificacoes();
      await carregarDados(mesMostrado.current);
    } catch (error) {
      console.error('Erro ao pagar parcialmente:', error);
      mostrarAlerta(t('Erro'), t('Não foi possível guardar o pagamento parcial.'));
    } finally {
      setEmCurso(({ [despesa.id]: _terminado, ...resto }) => resto);
    }
  }

  // Apagar = terminar (DespesasFixasDB.terminar): deixa de aparecer daqui para a frente e os
  // meses passados em que foi paga ficam no histórico. A confirmação é de quem chama
  async function apagarDespesa(despesa: Despesa) {
    if (!user?.id) return;
    try {
      await DespesasFixasDB.terminar(user.id, despesa.id);
      setEmEdicao(null);
      reagendarNotificacoes();
      await carregarDados(mesMostrado.current);
    } catch (error) {
      console.error('Erro ao apagar despesa:', error);
      mostrarAlerta(t('Erro'), t('Não foi possível apagar a despesa.'));
    }
  }

  async function confirmarApagar(linha: LinhaMensal) {
    if (!linha.fixa) return;
    if (await confirmar(t('Apagar despesa'), mensagemApagarMensal(linha.titulo, linha.estado === 'pago'), 'Apagar')) {
      await apagarDespesa(linha.fixa);
    }
  }

  // Meses passados são só para consulta: o que lá aconteceu já não se muda aqui
  const eMesAtual = mes === mesAtual();
  const resumo = carregado?.mes === mes ? resumoDespesasMensais(carregado.fixas, carregado.pagamentos, mes) : null;
  const linhaEmEdicao = emEdicao ? resumo?.linhas.find((l) => l.fixa?.id === emEdicao.id) : undefined;
  const emFaltaEmEdicao =
    linhaEmEdicao?.estado === 'pago' ? 0 : linhaEmEdicao?.estado === 'parcial' ? linhaEmEdicao.valorRestante ?? 0 : emEdicao?.valor ?? 0;

  // Os campos da nova despesa: no formulário e no topo da janela de dividir num grupo
  const camposNovaDespesa = (
    <>
      <CampoTexto
        placeholder={t('Título (ex: Renda, Luz, Água)')}
        value={novoTitulo}
        onChangeText={setNovoTitulo}
        accessibilityLabel={t('Título')}
      />

      <CampoTexto
        placeholder={novaVariavel ? t('Valor estimado (€)') : t('Valor (€)')}
        keyboardType="numeric"
        value={novoValor}
        onChangeText={setNovoValor}
        accessibilityLabel={t('Valor em euros')}
      />

      <CampoTexto
        placeholder={t('Dia de débito (opcional, 1-31)')}
        keyboardType="numeric"
        value={novoDiaDebito}
        onChangeText={setNovoDiaDebito}
        maxLength={2}
        accessibilityLabel={t('Dia de débito opcional, de 1 a 31')}
      />

      <SeletorCategoria valor={novaCategoria} onChange={setNovaCategoria} onLimpar={() => setNovaCategoria(undefined)} />
    </>
  );

  return (
    <Ecra
      keyboardShouldPersistTaps="handled"
      cabecalho={
        <>
          <Header
            title={t('Despesas Fixas')}
            onMenuPress={() => setMenuVisible(true)}
            saldo={saldoRestante}
          />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldoRestante} />
        </>
      }
      sobreposicao={
        <>
          <EditarDespesaMensalModal
            despesa={emEdicao}
            pagaEsteMes={linhaEmEdicao?.estado !== 'por-pagar'}
            emFalta={emFaltaEmEdicao}
            onFechar={() => {
              setEmEdicao(null);
              setAbrirFatura(false);
            }}
            onGuardar={guardarEdicao}
            onApagar={apagarDespesa}
            onDebitarParcial={debitarParcial}
            onPagarFatura={pagarFatura}
            obterPagamentos={(fixaId) => PagamentosDB.getDaDespesa(user?.id ?? '', fixaId)}
            iniciarEmFatura={abrirFatura}
          />
        </>
      }
    >
      <Separadores grupo="compromissos" />
      <SeletorMes mes={mes} onChange={mudarMes} />

      {!eMesAtual && <Text style={styles.subtitle}>{t('O que aconteceu em {mes} (só para consulta)', { mes: nomeMes(mes) })}</Text>}

      {eMesAtual && <DespesasEmAtraso resumo={emAtraso} onPago={() => carregarDados(mesMostrado.current)} />}

      <CartaoSaldo
        variante="laranja"
        alertaNegativo={false}
        rotulo={t('Total Mensal')}
        valor={resumo?.totais.total}
        icone="repeat-outline"
        style={styles.totalCard}
      >
        <View style={styles.parcelas}>
          <View style={styles.parcela}>
            <Text style={styles.parcelaLabel}>{t('Pago')}</Text>
            <ValorEuro valor={resumo?.totais.debitadas} tipo="entrada" style={styles.parcelaValor} />
          </View>
          <View style={styles.parcelaSeparador} />
          <View style={styles.parcela}>
            <Text style={styles.parcelaLabel}>{t('Por pagar')}</Text>
            <ValorEuro valor={resumo?.totais.porDebitar} cor={cores.aviso} style={styles.parcelaValor} />
          </View>
        </View>
      </CartaoSaldo>

      {/* Lista de despesas do mês */}
      <View style={styles.listaContainer}>
        {resumo === null ? (
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
            {resumo.linhas.map((linha) => {
              const estaMarcada = linha.estado === 'pago';
              // O switch e a edição só existem no mês atual, e não no histórico de despesas terminadas
              const editavel = eMesAtual && linha.fixa !== null;
              const pedido = linha.fixa ? emCurso[linha.fixa.id] : undefined;
              const desabilitado = pedido !== undefined;
              const nota =
                linha.fixa === null
                  ? t('Despesa terminada')
                  : linha.terminada
                    ? t('Último mês desta despesa')
                    : linha.fixa.valorTotal
                      ? t('Dividida com um grupo: a tua parte (sai {total} € da conta)', { total: linha.fixa.valorTotal.toFixed(2) })
                      : null;

              const categoria = infoCategoria(linha.categoria);
              const info = (
                <>
                  <View style={[styles.despesaIcone, { backgroundColor: comAlfa(categoria.cor, 0.14) }]}>
                    <Ionicons name={categoria.icone} size={18} color={categoria.cor} accessibilityElementsHidden importantForAccessibility="no" />
                  </View>
                  <View style={styles.despesaInfo}>
                    <Text style={styles.despesaTitulo}>{linha.titulo}</Text>
                    <Text style={[styles.despesaEstado, estaMarcada && styles.estadoPago]}>
                      {textoEstado(linha)}
                    </Text>
                    {!!linha.categoria && <Text style={styles.despesaCategoria}>{nomeCategoria(linha.categoria)}</Text>}
                    {!!nota && <Text style={styles.despesaNota}>{nota}</Text>}
                  </View>
                  <ValorEuro valor={linha.valor} tipo="saida" style={styles.despesaValor} />
                  {editavel && <Ionicons name="create-outline" size={18} color={cores.textoMudo} style={styles.editarIcone} />}
                </>
              );

              return (
                <View
                  key={linha.chave}
                  style={[styles.despesaItem, estaMarcada && styles.despesaDebitada]}
                >
                  {editavel && (
                    <View style={styles.checkboxContainer}>
                      <Switch
                        value={pedido ?? estaMarcada}
                        onValueChange={() => toggleDebitado(linha)}
                        disabled={desabilitado}
                        trackColor={{ false: cores.bordaForte, true: comAlfa(COR, 0.55) }}
                        thumbColor={estaMarcada ? COR : cores.texto}
                        accessibilityLabel={estaMarcada ? t('Desfazer pagamento de {titulo}', { titulo: linha.titulo }) : t('Pagar {titulo}', { titulo: linha.titulo })}
                      />
                      <Text style={styles.checkboxLabel}>
                        {estaMarcada ? t('✓ Pago') : t('Pagar')}
                      </Text>
                    </View>
                  )}
                  {/* Tocar na despesa (fora do switch) abre a edição; separados para um toque no switch não abrir o modal */}
                  {editavel ? (
                    <Pressable
                      style={({ pressed }) => [styles.despesaToque, pressed && styles.despesaPremida]}
                      onPress={() => setEmEdicao(linha.fixa)}
                      accessibilityRole="button"
                      accessibilityLabel={t('{titulo}, {valor} euros, {estado}', {
                        titulo: linha.titulo,
                        valor: linha.valor.toFixed(2),
                        estado: textoEstado(linha),
                      })}
                      accessibilityHint={t('Abre para editar ou apagar')}
                    >
                      {info}
                    </Pressable>
                  ) : (
                    <View style={styles.despesaToque}>{info}</View>
                  )}
                  {editavel && (
                    <Pressable
                      onPress={() => confirmarApagar(linha)}
                      hitSlop={8}
                      style={({ pressed }) => [styles.apagar, pressed && styles.despesaPremida]}
                      accessibilityRole="button"
                      accessibilityLabel={t('Apagar {titulo}', { titulo: linha.titulo })}
                    >
                      <Ionicons name="trash-outline" size={18} color={cores.negativo} />
                    </Pressable>
                  )}
                </View>
              );
            })}

            {resumo.linhas.length === 0 && (
              <Text style={styles.vazioText}>
                {eMesAtual
                  ? t('Nenhuma despesa adicionada')
                  : t('Nenhuma despesa fixa em {mes}', { mes: nomeMes(mes) })}
              </Text>
            )}
          </>
        )}
      </View>

      {/* Adicionar nova (começa a contar este mês, por isso só no mês atual) */}
      {eMesAtual && (
        <Cartao>
          <TituloSecao titulo={t('Adicionar Despesa')} icone="add-circle-outline" cor={ACENTO} />

          {camposNovaDespesa}

          <CampoValorVariavel variavel={novaVariavel} onVariavel={setNovaVariavel} unidade={novaUnidade} onUnidade={setNovaUnidade} />

          {!!novoDiaDebito.trim() && !novaVariavel && <CampoDebitoAutomatico ligado={novoDebitoAutomatico} onMudar={setNovoDebitoAutomatico} />}

          <DivisaoGrupo key={chaveDivisao} total={parseValor(novoValor)} onChange={setNovaDivisao} campos={camposNovaDespesa} />

          <Botao
            titulo={aAdicionarVisivel ? t('A guardar…') : t('Adicionar')}
            icone="add"
            onPress={adicionarDespesa}
            aCarregar={aAdicionarVisivel}
          />
        </Cartao>
      )}
    </Ecra>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    ...tipografia.secundario,
    textAlign: 'center',
    marginBottom: espaco.lg,
  },
  totalCard: {
    marginBottom: espaco.xl,
  },
  resumoCategorias: {
    marginTop: -espaco.lg,
    marginBottom: espaco.xl,
    paddingHorizontal: espaco.sm,
  },
  resumoCategoriasTitulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espaco.xs,
  },
  resumoCategoriaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espaco.xs,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },
  resumoCategoriaNome: {
    ...tipografia.secundario,
    color: cores.texto,
  },
  resumoCategoriaValor: {
    fontFamily: fontes.numeroForte,
    fontSize: 14,
  },
  parcelas: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: espaco.md,
    paddingTop: espaco.md,
    borderTopWidth: 1,
    borderTopColor: cores.bordaForte,
  },
  parcela: {
    flex: 1,
    alignItems: 'center',
  },
  parcelaSeparador: {
    width: 1,
    backgroundColor: cores.bordaForte,
  },
  parcelaLabel: {
    ...tipografia.rotulo,
    color: cores.textoHero,
  },
  parcelaValor: {
    fontFamily: fontes.numeroForte,
    fontSize: 18,
    marginTop: 2,
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
    justifyContent: 'space-between',
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    paddingVertical: espaco.md,
    paddingHorizontal: espaco.md + 2,
    borderRadius: raio.md + 2,
    marginBottom: espaco.sm,
  },
  despesaDebitada: {
    backgroundColor: comAlfa(COR, 0.06),
    borderColor: comAlfa(COR, 0.25),
    borderLeftWidth: 3,
    borderLeftColor: COR,
  },
  checkboxContainer: {
    alignItems: 'center',
    marginRight: espaco.md,
    minWidth: 64,
  },
  checkboxLabel: {
    fontFamily: fontes.corpoForte,
    fontSize: 10,
    color: COR,
    marginTop: espaco.xs,
    textAlign: 'center',
  },
  checkboxDesabilitado: {
    color: cores.textoMudo,
  },
  despesaToque: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderRadius: raio.sm,
  },
  despesaPremida: {
    opacity: 0.75,
  },
  despesaIcone: {
    width: 36,
    height: 36,
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
  despesaEstado: {
    ...tipografia.nota,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  despesaCategoria: {
    ...tipografia.nota,
    color: cores.textoMudo,
    marginTop: 2,
  },
  estadoPago: {
    fontFamily: fontes.corpoForte,
    color: COR,
  },
  despesaNota: {
    ...tipografia.nota,
    fontSize: 11,
    marginTop: 2,
  },
  despesaValor: {
    fontSize: 15,
  },
  editarIcone: {
    paddingLeft: espaco.md,
  },
  apagar: {
    paddingLeft: espaco.md,
    paddingVertical: espaco.sm,
  },
  vazioText: {
    ...tipografia.secundario,
    textAlign: 'center',
    fontStyle: 'italic',
    padding: espaco.xl,
  },
});
