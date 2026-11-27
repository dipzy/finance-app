import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { DetalheCredito } from '../../components/dividas/DetalheCredito';
import { EstrategiasDividas } from '../../components/dividas/EstrategiasDividas';
import { ImportarExtratoDivida } from '../../components/dividas/ImportarExtratoDivida';
import { SimuladorDivida } from '../../components/dividas/SimuladorDivida';
import { Header } from '../../components/Header';
import { DivisaoGrupo, type EstadoDivisao } from '../../components/partilhado/DivisaoGrupo';
import { SideMenu } from '../../components/SideMenu';
import { Separadores } from '../../components/Separadores';
import { Botao, CampoTexto, Cartao, CartaoSaldo, Chip, Ecra, TituloSecao, ValorEuro } from '../../components/ui';
import { acentosFolha, brilho, cores, espaco, fontes, gradientes, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { t, useT } from '../../i18n';
import {
  ativaNoMes,
  calcularSaldoDisponivel,
  Despesa,
  DespesasFixasDB,
  DividaComEstado,
  DividasDB,
  eAnual,
  mesAtual,
  mesSeguinte,
} from '../../services/database';
import { mensagemDaApi } from '../../services/grupos';
import {
  CONTRATO_VAZIO,
  type ContratoTexto,
  contratoParaTexto,
  eCredito,
  textoParaContrato,
  totalAPagar,
} from '../../utils/dividas';
import { mostrarAlerta, parseValor } from '../../utils/helpers';
import { mesmaDivisao } from '../../utils/partilhado';

// O que se mostra nos créditos: tudo o que ainda vai sair (com juros, selo e seguros) ou só o capital em dívida
type ModoValor = 'total' | 'capital';
const CHAVE_MODO = 'dividas.modoValor.v1';

// O acento das dívidas: o laranja do bloco "Total a pagar" da folha (o mesmo das Despesas, como no Excel)
const COR = acentosFolha.despesas;

function confirmar(titulo: string, mensagem: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${titulo}\n\n${mensagem}`));
  return new Promise((resolve) =>
    Alert.alert(t(titulo), t(mensagem), [
      { text: t('Cancelar'), style: 'cancel', onPress: () => resolve(false) },
      { text: t('Remover'), style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}

// Dívidas (crédito do carro, tratamento no dentista...): quanto falta pagar.
// Ligada à despesa fixa da prestação, o valor em falta desce sozinho a cada pagamento.
// Com a taxa (TAN) é um crédito a sério: a app separa juros, selo, seguros e capital, mostra a próxima
// prestação (do extrato em PDF do credor) e simula amortizações
export default function DividasScreen() {
  const t = useT();
  const [menuVisible, setMenuVisible] = useState(false);
  const [dividas, setDividas] = useState<DividaComEstado[]>([]);
  const [prestacoes, setPrestacoes] = useState<Despesa[]>([]);
  const [saldo, setSaldo] = useState(0);
  const [aEditar, setAEditar] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [emFalta, setEmFalta] = useState('');
  const [fixaId, setFixaId] = useState<string | undefined>(undefined);
  const [contrato, setContrato] = useState<ContratoTexto>({ ...CONTRATO_VAZIO });
  const [mostrarContrato, setMostrarContrato] = useState(false);
  const [aSimular, setASimular] = useState<DividaComEstado | null>(null);
  const [importarVisivel, setImportarVisivel] = useState(false);
  const [estrategiasVisivel, setEstrategiasVisivel] = useState(false);
  // Dividir a prestação com um grupo (a divisão é da despesa fixa da prestação); a chave faz o seletor recomeçar
  const [divisao, setDivisao] = useState<EstadoDivisao>({ divisao: null, erro: null, minhaParte: null });
  const [chaveDivisao, setChaveDivisao] = useState(0);
  const { user } = useAuth();
  const prestacaoEscolhida = prestacoes.find((p) => p.id === fixaId);
  const [modo, setModo] = useState<ModoValor>('total');

  // A escolha fica guardada (só uma comodidade: sem ela mostra o total)
  useEffect(() => {
    AsyncStorage.getItem(CHAVE_MODO)
      .then((guardado) => {
        if (guardado === 'total' || guardado === 'capital') setModo(guardado);
      })
      .catch(() => undefined);
  }, []);

  function escolherModo(novo: ModoValor) {
    setModo(novo);
    AsyncStorage.setItem(CHAVE_MODO, novo).catch(() => undefined);
  }
  const temTaxa = contrato.taxa.trim() !== '';

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [user])
  );

  async function carregar() {
    if (!user?.id) return;
    try {
      const disponivel = await calcularSaldoDisponivel(user.id);
      const [lista, fixas] = await Promise.all([DividasDB.getComEstado(user.id), DespesasFixasDB.getAll(user.id)]);
      setSaldo(disponivel);
      setDividas(lista);
      setPrestacoes(fixas.filter((f) => !eAnual(f) && ativaNoMes(f, mesAtual())));
    } catch (error) {
      console.error('Erro ao carregar dívidas:', error);
    }
  }

  function limpar() {
    setAEditar(null);
    setTitulo('');
    setEmFalta('');
    setFixaId(undefined);
    setContrato({ ...CONTRATO_VAZIO });
    setMostrarContrato(false);
    setChaveDivisao((c) => c + 1);
  }

  function editar(divida: DividaComEstado) {
    setAEditar(divida.id);
    setTitulo(divida.titulo);
    setEmFalta(String(divida.emFalta));
    setFixaId(divida.fixaId);
    const texto = contratoParaTexto(divida);
    setContrato(texto);
    setMostrarContrato(Object.values(texto).some((v) => v !== ''));
    setChaveDivisao((c) => c + 1);
  }

  function mudarContrato(campo: keyof ContratoTexto, valor: string) {
    setContrato((c) => ({ ...c, [campo]: valor }));
  }

  async function guardar() {
    if (!user?.id) return;
    const valor = parseValor(emFalta);
    if (!titulo.trim() || valor <= 0) {
      mostrarAlerta(t('Erro'), temTaxa ? t('Preenche o nome e o capital em dívida') : t('Preenche o nome e quanto falta pagar'));
      return;
    }
    const { campos: camposContrato, erro: erroContrato } = textoParaContrato(contrato);
    if (erroContrato) {
      mostrarAlerta(t('Erro'), erroContrato);
      return;
    }
    if (prestacaoEscolhida && divisao.erro) {
      mostrarAlerta(t('Erro'), divisao.erro);
      return;
    }
    try {
      // Dividir (ou deixar de dividir) a prestação: é a despesa fixa dela que muda; o valor passa a ser o total
      if (prestacaoEscolhida && !mesmaDivisao(divisao.divisao, prestacaoEscolhida.divisao)) {
        await DespesasFixasDB.update(user.id, prestacaoEscolhida.id, {
          valor: prestacaoEscolhida.valorTotal ?? prestacaoEscolhida.valor,
          divisao: divisao.divisao ?? undefined,
        });
      }
      // O valor escrito é o que falta pagar hoje: as prestações contam a partir do próximo mês
      // (a deste mês, se já foi paga, já está descontada no valor que escreveste)
      const desde = mesSeguinte(mesAtual());
      const campos = { titulo: titulo.trim(), valorInicial: valor, desde, fixaId, ...camposContrato };
      if (aEditar) {
        // Os campos do contrato vazios ficam a undefined: o PATCH apaga-os
        await DividasDB.update(user.id, aEditar, campos);
      } else {
        await DividasDB.add(user.id, campos);
      }
      limpar();
      await carregar();
    } catch (error) {
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível guardar a dívida.')));
    }
  }

  async function remover(divida: DividaComEstado) {
    if (!user?.id || !(await confirmar(t('Remover dívida'), t('Remover "{titulo}"? A despesa fixa da prestação continua.', { titulo: divida.titulo })))) return;
    try {
      await DividasDB.remove(user.id, divida.id);
      if (aEditar === divida.id) limpar();
      await carregar();
    } catch (error) {
      mostrarAlerta(t('Erro'), t('Não foi possível remover a dívida.'));
    }
  }

  const algumaComTaxa = dividas.some(eCredito);
  // Num crédito, "total" é tudo o que ainda vai sair (com juros, selo e seguros) e "capital" só o que está em dívida
  const valorDe = (d: DividaComEstado) => (modo === 'capital' ? d.emFalta : totalAPagar(d));
  const total = dividas.reduce((soma, d) => soma + valorDe(d), 0);

  return (
    <Ecra
      cabecalho={
        <>
          <Header title={t('Dívidas')} onMenuPress={() => setMenuVisible(true)} saldo={saldo} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldo} />
        </>
      }
    >
      <Separadores grupo="compromissos" />
      <CartaoSaldo
        variante="laranja"
        alertaNegativo={false}
        rotulo={algumaComTaxa && modo === 'capital' ? t('Capital em dívida') : t('Total a pagar')}
        valor={total}
        icone="card-outline"
        style={styles.totalCard}
      />

      {algumaComTaxa && (
        <View style={styles.modo}>
          <Text style={styles.label}>{t('Nos créditos, mostrar')}</Text>
          <View style={styles.opcoes}>
            <Chip rotulo={t('Total a pagar')} ativo={modo === 'total'} onPress={() => escolherModo('total')} cor={COR} />
            <Chip rotulo={t('Só o capital')} ativo={modo === 'capital'} onPress={() => escolherModo('capital')} cor={COR} />
          </View>
          <Text style={styles.nota}>
            {modo === 'total'
              ? t('O total conta o capital, os juros, o selo e os seguros que ainda vais pagar até ao fim.')
              : t('O capital é o que ainda deves ao banco, sem os juros, o selo nem os seguros que ainda vão sair.')}
          </Text>
        </View>
      )}

      <View style={styles.acoes}>
        <Botao
          variante="secundario"
          pequeno
          cor={COR}
          icone="document-attach-outline"
          titulo={t('Importar extrato (PDF)')}
          onPress={() => setImportarVisivel(true)}
        />
        {dividas.length >= 2 && (
          <Botao
            variante="secundario"
            pequeno
            cor={COR}
            icone="git-compare-outline"
            titulo={t('Comparar estratégias')}
            onPress={() => setEstrategiasVisivel(true)}
          />
        )}
      </View>

      {dividas.map((d) => {
        const prestacao = prestacoes.find((p) => p.id === d.fixaId);
        const credito = eCredito(d);
        // Num crédito, a barra mostra quanto do financiado já foi amortizado; nas outras, quanto já se pagou
        const feito = credito && d.resumo?.capitalAmortizado != null && d.valorFinanciado ? d.resumo.capitalAmortizado : d.pago;
        const base = credito && d.valorFinanciado ? d.valorFinanciado : d.valorInicial;
        const percentagem = base > 0 ? Math.min(100, (feito / base) * 100) : 0;
        return (
          <Cartao key={d.id} ativo={aEditar === d.id} acento={COR} onPress={() => editar(d)} style={styles.item}>
            <View style={styles.itemTopo}>
              <Text style={styles.itemTitulo}>{d.titulo}</Text>
              <ValorEuro valor={valorDe(d)} cor={COR} style={styles.itemValor} />
            </View>
            {credito && (
              <Text style={styles.itemDetalhe}>
                {modo === 'capital'
                  ? t('Total a pagar {valor}', { valor: `${totalAPagar(d).toFixed(2)} €` })
                  : t('Capital em dívida {valor}', { valor: `${d.emFalta.toFixed(2)} €` })}
                {d.credor ? ` · ${d.credor}` : ''}
              </Text>
            )}
            {/* Quanto já foi pago (ou amortizado, num crédito) */}
            <View style={styles.barraFundo}>
              <LinearGradient
                colors={gradientes.progresso}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.barra, { width: `${percentagem}%` }]}
              />
            </View>
            <Text style={styles.itemDetalhe}>
              {d.fixaId
                ? t('Prestação: {titulo} ({valor} €)', { titulo: prestacao?.titulo ?? t('despesa fixa'), valor: (d.prestacao ?? 0).toFixed(2) }) +
                  (d.mesesEmFalta !== null
                    ? d.mesesEmFalta === 1
                      ? t(' · falta 1 prestação')
                      : t(' · faltam {n} prestações', { n: d.mesesEmFalta })
                    : '')
                : t('Sem prestação ligada: o valor só muda quando o editares')}
            </Text>
            {d.pago > 0 && (
              <Text style={styles.itemDetalhe}>{t('Já pagaste {valor} € desde que a registaste', { valor: d.pago.toFixed(2) })}</Text>
            )}
            <DetalheCredito divida={d} />
            <View style={styles.itemAcoes}>
              {credito && (
                <Botao
                  variante="secundario"
                  pequeno
                  cor={COR}
                  icone="calculator-outline"
                  titulo={t('Simular amortização')}
                  onPress={() => setASimular(d)}
                />
              )}
              <Botao
                variante="fantasma"
                pequeno
                cor={cores.negativo}
                icone="trash-outline"
                titulo={t('Remover')}
                onPress={() => remover(d)}
                style={styles.remover}
              />
            </View>
          </Cartao>
        );
      })}

      {dividas.length === 0 && <Text style={styles.vazio}>{t('Sem dívidas registadas')}</Text>}
      {dividas.length > 0 && !algumaComTaxa && (
        <Text style={styles.dica}>
          {t('Dica: preenche a taxa (TAN) de um crédito, ou importa o extrato do credor, para ver juros, prestação e simular amortizações.')}
        </Text>
      )}

      <Cartao style={styles.card}>
        <TituloSecao
          titulo={aEditar ? t('Editar dívida') : t('Nova dívida')}
          icone={aEditar ? 'create-outline' : 'add-circle-outline'}
          cor={COR}
        />
        <CampoTexto placeholder={t('Nome (ex: Crédito do carro)')} value={titulo} onChangeText={setTitulo} />
        <CampoTexto
          placeholder={temTaxa ? t('Capital em dívida hoje (€)') : t('Quanto falta pagar hoje (€)')}
          keyboardType="numeric"
          value={emFalta}
          onChangeText={setEmFalta}
        />
        {temTaxa && (
          <Text style={styles.nota}>
            {t('Com taxa, escreve só o capital que falta (sem os juros que ainda vais pagar): a app calcula os juros, o selo e os seguros de cada prestação.')}
          </Text>
        )}
        <Text style={styles.label}>{t('Prestação (despesa fixa que paga esta dívida)')}</Text>
        <View style={styles.opcoes}>
          <Chip rotulo={t('Nenhuma')} onPress={() => setFixaId(undefined)} ativo={!fixaId} cor={COR} />
          {prestacoes.map((p) => (
            <Chip
              key={p.id}
              rotulo={t('{titulo} ({valor} €)', { titulo: p.titulo, valor: p.valor.toFixed(2) })}
              onPress={() => setFixaId(p.id)}
              ativo={fixaId === p.id}
              cor={COR}
            />
          ))}
        </View>
        {prestacaoEscolhida && (
          <>
            <DivisaoGrupo
              key={`${prestacaoEscolhida.id}-${chaveDivisao}`}
              total={prestacaoEscolhida.valorTotal ?? prestacaoEscolhida.valor}
              inicial={prestacaoEscolhida.divisao ?? null}
              onChange={setDivisao}
              campos={
                <>
                  <Text style={styles.label}>{t('Prestação')}</Text>
                  <Text style={styles.vazio}>
                    {t('{titulo} ({valor} €)', {
                      titulo: prestacaoEscolhida.titulo,
                      valor: (prestacaoEscolhida.valorTotal ?? prestacaoEscolhida.valor).toFixed(2),
                    })}
                  </Text>
                </>
              }
              nota={t('Cada prestação paga-se toda por ti e fica dividida no grupo. A dívida conta só a tua parte: escreve em cima só a tua parte do que falta pagar.')}
            />
          </>
        )}

        <Botao
          variante="fantasma"
          pequeno
          cor={COR}
          icone={mostrarContrato ? 'chevron-up' : 'chevron-down'}
          titulo={mostrarContrato ? t('Esconder o contrato') : t('Contrato: taxa, entrada, prazo… (opcional)')}
          onPress={() => setMostrarContrato((m) => !m)}
          style={styles.contratoBotao}
        />
        {mostrarContrato && (
          <View>
            <CampoTexto
              rotulo={t('Taxa anual — TAN (%)')}
              placeholder={t('Ex.: 3,3')}
              keyboardType="numeric"
              value={contrato.taxa}
              onChangeText={(v) => mudarContrato('taxa', v)}
            />
            <CampoTexto
              rotulo={t('Valor financiado (€)')}
              placeholder={t('O que o banco emprestou, sem a entrada')}
              keyboardType="numeric"
              value={contrato.financiado}
              onChangeText={(v) => mudarContrato('financiado', v)}
            />
            <CampoTexto
              rotulo={t('Entrada (€)')}
              placeholder={t('O que pagaste logo, se pagaste')}
              keyboardType="numeric"
              value={contrato.entrada}
              onChangeText={(v) => mudarContrato('entrada', v)}
            />
            <CampoTexto
              rotulo={t('Prazo (meses)')}
              placeholder={t('Ex.: 60')}
              keyboardType="numeric"
              value={contrato.prazo}
              onChangeText={(v) => mudarContrato('prazo', v)}
            />
            <CampoTexto
              rotulo={t('Mês da primeira prestação')}
              placeholder={t('AAAA-MM (ex.: 2026-05)')}
              autoCapitalize="none"
              value={contrato.inicio}
              onChangeText={(v) => mudarContrato('inicio', v)}
            />
            <CampoTexto
              rotulo={t('Seguros e outros encargos por mês (€)')}
              placeholder={t('Vêm dentro da prestação e não abatem a dívida')}
              keyboardType="numeric"
              value={contrato.encargos}
              onChangeText={(v) => mudarContrato('encargos', v)}
            />
            <CampoTexto
              rotulo={t('Comissão de reembolso antecipado (%)')}
              placeholder={t('Vem no contrato; vazio conta como 0 %')}
              keyboardType="numeric"
              value={contrato.comissao}
              onChangeText={(v) => mudarContrato('comissao', v)}
            />
            <Text style={styles.nota}>
              {t('A forma mais fácil de preencher tudo é importar o extrato do credor (botão no topo). Para o saldo ficar certo ao cêntimo, usa o capital do extrato.')}
            </Text>
          </View>
        )}

        <Botao titulo={aEditar ? t('Guardar') : t('Adicionar')} icone={aEditar ? 'checkmark' : 'add'} onPress={guardar} />
        {aEditar && (
          <Botao variante="fantasma" titulo={t('Cancelar')} onPress={limpar} style={styles.cancelarBotao} />
        )}
      </Cartao>

      <SimuladorDivida divida={aSimular} onFechar={() => setASimular(null)} />
      <EstrategiasDividas visivel={estrategiasVisivel} onFechar={() => setEstrategiasVisivel(false)} />
      <ImportarExtratoDivida
        visivel={importarVisivel}
        dividas={dividas}
        prestacoes={prestacoes}
        onFechar={() => setImportarVisivel(false)}
        onAplicado={() => {
          setImportarVisivel(false);
          void carregar();
        }}
      />
    </Ecra>
  );
}

const styles = StyleSheet.create({
  totalCard: { marginBottom: espaco.lg },
  modo: { marginBottom: espaco.md },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm, marginBottom: espaco.lg },
  item: { marginBottom: espaco.sm },
  itemTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitulo: { ...tipografia.tituloCartao, flex: 1, marginRight: espaco.sm },
  itemValor: { fontFamily: fontes.numeroForte, fontSize: 17 },
  barraFundo: {
    height: 8,
    backgroundColor: cores.superficieAlta,
    borderRadius: 4,
    marginVertical: espaco.md,
    overflow: 'hidden',
  },
  barra: { height: 8, borderRadius: 4, boxShadow: brilho(cores.positivo, 0.6, 10) },
  itemDetalhe: { ...tipografia.secundario, fontSize: 13, marginTop: 2 },
  itemAcoes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginTop: espaco.xs },
  remover: { marginRight: -espaco.sm },
  vazio: { ...tipografia.secundario, textAlign: 'center', fontStyle: 'italic', padding: espaco.xl },
  dica: { ...tipografia.nota, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: espaco.lg, marginBottom: espaco.sm },
  nota: { ...tipografia.nota, fontStyle: 'italic', marginBottom: espaco.md },
  card: { marginTop: espaco.sm },
  label: { ...tipografia.rotulo, fontSize: 11, marginBottom: 6 },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: espaco.md },
  contratoBotao: { alignSelf: 'flex-start', marginBottom: espaco.sm, marginLeft: -espaco.sm },
  cancelarBotao: { marginTop: espaco.sm },
});
