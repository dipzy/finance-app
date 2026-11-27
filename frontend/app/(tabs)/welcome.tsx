import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BarraProgresso } from '../../components/BarraProgresso';
import { CartaoAlertas } from '../../components/CartaoAlertas';
import { DespesasEmAtraso } from '../../components/DespesasEmAtraso';
import { PoupancasEmAtraso } from '../../components/PoupancasEmAtraso';
import { SalarioPorReceber } from '../../components/SalarioPorReceber';
import { LinhaPoupancaPorEnviar } from '../../components/PoupancasPorEnviar';
import { LinhaGastoPendente, mesDoPendente, useGastosPendentes } from '../../components/GastosPendentes';
import { Header } from '../../components/Header';
import { ResumoPartilhado } from '../../components/partilhado/ResumoPartilhado';
import { SideMenu } from '../../components/SideMenu';
import { Botao, Cartao, CartaoSaldo, Ecra, Etiqueta, NomeIcone, TipoValor, TituloSecao, ValorEuro } from '../../components/ui';
import { COR_CARTAO, ICONE_CARTAO, ICONE_CONTA } from '../../constants/meiosPagamento';
import { acentosFolha, comAlfa, cores, espaco, fontes, gradientes, raio, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';
import {
  calcularSaldoDisponivel,
  CartaoAlimentacao,
  ContaCorrenteDB,
  ContribuicaoEmAtraso,
  DadosFolhaMes,
  Despesa,
  DespesasExtrasDB,
  DespesasFixasDB,
  EstadoOrcamentoMes,
  Mes,
  mesAtual,
  nomeMes,
  ObjetivoPoupanca,
  ObjetivosDB,
  OrcamentosDB,
  PagamentoFixa,
  PagamentosDB,
  SalarioDB,
  Poupanca,
  PoupancasDB,
} from '../../services/database';
import { carregarEmAtraso, carregarPoupancasEmAtraso } from '../../services/emAtraso';
import { salarioPorReceber } from '../../utils/salario';
import { ouvir } from '../../services/eventos';
import { obterDadosFolhaMes } from '../../services/folhaMes';
import { publicarCartao } from '../../services/saldoCartao';
import { infoCategoria, nomeCategoria } from '../../utils/categorias';
import { diaEMes, somarValores } from '../../utils/ecrasDespesas';
import {
  corEstadoObjetivo,
  corEstadoOrcamento,
  euros,
  objetivoPrincipal,
  orcamentosEmAlerta,
} from '../../utils/orcamentos';
import { mostrarAlerta } from '../../utils/helpers';
import { cartaoDaFolha, numerosDoMes, proximosPagamentos, ResumoEmAtraso, SEM_ATRASO, textoQuando, ultimasDespesas } from '../../utils/painel';
import { poupancasPorEnviar } from '../../utils/poupancasManuais';

// Quantos pagamentos e gastos do dia a dia o painel mostra (o resto está nos ecrãs de cada um)
const MAX_PROXIMOS = 5;
const MAX_EXTRAS = 3;

const ATALHOS: { rotulo: string; icone: NomeIcone; rota: Href; cor: string }[] = [
  { rotulo: 'Novo gasto', icone: 'add-circle-outline', rota: '/(tabs)/despesas-extras', cor: acentosFolha.despesasMes },
  { rotulo: 'Orçamentos', icone: 'pie-chart-outline', rota: '/(tabs)/orcamentos' as Href, cor: cores.primaria },
  { rotulo: 'Salário', icone: 'cash-outline', rota: '/(tabs)/salario', cor: cores.positivo },
  { rotulo: 'Objetivos', icone: 'flag-outline', rota: '/(tabs)/objetivos' as Href, cor: cores.azul },
];

// Tudo o que o painel mostra vem do mesmo pedido (e do mês a que pertence)
interface DadosPainel {
  mes: Mes;
  saldo: number;
  folha: DadosFolhaMes;
  fixas: Despesa[];
  pagamentos: PagamentoFixa[];
  extras: Despesa[];
  cartao: CartaoAlimentacao | null; // null se não deu para ler (o painel aparece na mesma)
}

// Início: o painel do mês (saldos, atalhos, números do mês, o que falta pagar e as últimas extras).
// A folha completa do mês está no Resumo do mês (two.tsx)
export default function WelcomeScreen() {
  const t = useT();
  const [menuVisible, setMenuVisible] = useState(false);
  // null enquanto carrega (os saldos mostram "…" e o cabeçalho ainda não mostra o saldo)
  const [dados, setDados] = useState<DadosPainel | null>(null);
  const [erroCarregar, setErroCarregar] = useState(false);
  // Orçamentos perto do limite e o objetivo principal: à parte (se falharem, o painel aparece na mesma)
  const [planeamento, setPlaneamento] = useState<{ alertas: EstadoOrcamentoMes[]; objetivo: ObjetivoPoupanca | null } | null>(
    null
  );
  // Poupanças de contribuição manual ainda por enviar este mês (e a que está a ser enviada)
  const [porEnviar, setPorEnviar] = useState<Poupanca[]>([]);
  const [aEnviar, setAEnviar] = useState<string | null>(null);
  // Despesas fixas dos últimos meses que ficaram por pagar
  const [emAtraso, setEmAtraso] = useState<ResumoEmAtraso>(SEM_ATRASO);
  // Contribuições manuais dos últimos meses que ficaram por enviar
  const [poupancasEmAtraso, setPoupancasEmAtraso] = useState<ContribuicaoEmAtraso[]>([]);
  // Recebimento manual: o salário deste mês que já devia ter entrado e ainda não foi marcado
  const [salarioEmFalta, setSalarioEmFalta] = useState<{ dia: number; valor: string } | null>(null);
  const ultimoPedido = useRef(0);
  const { user } = useAuth();

  // Volta a carregar sempre que se regressa ao Início (depois de pagar ou registar uma despesa)
  const pendentes = useGastosPendentes(user?.id);

  useFocusEffect(
    useCallback(() => {
      carregarDados();
      // Gravou-se noutro sítio (botão rápido "+", fila offline): carregar outra vez
      return ouvir('dadosMudaram', () => carregarDados());
    }, [user])
  );

  async function carregarPlaneamento(userId: string, mes: Mes) {
    try {
      const [estados, objetivos] = await Promise.all([OrcamentosDB.getEstado(userId, mes), ObjetivosDB.getAll(userId)]);
      return { alertas: orcamentosEmAlerta(estados), objetivo: objetivoPrincipal(objetivos) };
    } catch (error) {
      console.error('Erro ao carregar orçamentos e objetivos:', error);
      return null;
    }
  }

  // O cartão de alimentação: lido depois do saldo (o dia do salário também o carrega); uma falha não estraga o painel
  async function lerCartao(userId: string): Promise<CartaoAlimentacao | null> {
    try {
      const cartao = await ContaCorrenteDB.getCartaoAlimentacao(userId);
      publicarCartao(cartao); // o cabeçalho e o menu dos outros ecrãs mostram o mesmo saldo
      return cartao;
    } catch (error) {
      console.error('Erro ao ler o cartão de alimentação:', error);
      return null;
    }
  }

  async function carregarPorEnviar(userId: string, mes: Mes): Promise<Poupanca[]> {
    try {
      return poupancasPorEnviar(await PoupancasDB.getAll(userId), mes);
    } catch (error) {
      console.error('Erro ao carregar as poupanças:', error);
      return [];
    }
  }

  // "Já enviei": regista a contribuição manual deste mês (sai da conta) e volta a carregar o painel
  async function enviarPoupanca(poupanca: Poupanca) {
    if (!user?.id || aEnviar) return;
    setAEnviar(poupanca.id);
    try {
      const resultado = await PoupancasDB.contribuirManualmente(user.id, poupanca.id);
      if (resultado === 'saldo-insuficiente') {
        mostrarAlerta(t('Saldo insuficiente'), t('Não tens saldo suficiente na conta para fazer esta contribuição.'));
        return;
      }
      await carregarDados();
    } catch (error) {
      console.error('Erro ao registar a contribuição manual:', error);
      mostrarAlerta(t('Erro'), t('Não foi possível registar a contribuição deste mês.'));
    } finally {
      setAEnviar(null);
    }
  }

  async function lerSalarioEmFalta(userId: string): Promise<{ dia: number; valor: string } | null> {
    try {
      const config = await SalarioDB.getConfig(userId);
      const dia = salarioPorReceber(config);
      return config && dia !== null ? { dia, valor: config.valor } : null;
    } catch (error) {
      console.error('Erro ao ver se falta receber o salário:', error);
      return null;
    }
  }

  async function carregarDados() {
    if (!user?.id) return;
    // Só conta a resposta do último pedido: um pedido antigo que chegue depois
    // não pode substituir dados mais recentes
    const pedido = ++ultimoPedido.current;
    const mes = mesAtual();
    const pedidoPlaneamento = carregarPlaneamento(user.id, mes);
    const pedidoPorEnviar = carregarPorEnviar(user.id, mes);
    let pedidoEmAtraso: Promise<ResumoEmAtraso> = Promise.resolve(SEM_ATRASO);
    const pedidoPoupancasEmAtraso = carregarPoupancasEmAtraso(user.id);
    const pedidoSalario = lerSalarioEmFalta(user.id);
    try {
      // Primeiro o disponível: também recebe o salário e faz os débitos automáticos do dia
      const saldo = await calcularSaldoDisponivel(user.id);
      const [folha, fixas, pagamentos, extras, cartao] = await Promise.all([
        obterDadosFolhaMes(user.id, mes),
        DespesasFixasDB.getAll(user.id),
        PagamentosDB.getDoMes(user.id, mes),
        DespesasExtrasDB.getDoMes(user.id, mes),
        lerCartao(user.id),
      ]);
      if (pedido !== ultimoPedido.current) return;
      // Os meses anteriores vêm à parte: o painel não espera por eles
      pedidoEmAtraso = carregarEmAtraso(user.id, fixas);
      setDados({ mes, saldo, folha, fixas, pagamentos, extras, cartao });
      setErroCarregar(false);
    } catch (error) {
      if (pedido !== ultimoPedido.current) return;
      console.error('Erro ao carregar o painel:', error);
      setErroCarregar(true);
    }
    const [doPlaneamento, poupancas, atrasadas, poupancasAtrasadas, salarioPorMarcar] = await Promise.all([
      pedidoPlaneamento,
      pedidoPorEnviar,
      pedidoEmAtraso,
      pedidoPoupancasEmAtraso,
      pedidoSalario,
    ]);
    if (pedido !== ultimoPedido.current) return;
    setPlaneamento(doPlaneamento);
    setPorEnviar(poupancas);
    setEmAtraso(atrasadas);
    setPoupancasEmAtraso(poupancasAtrasadas);
    setSalarioEmFalta(salarioPorMarcar);
  }

  const mes = dados?.mes ?? mesAtual();
  // Só quem usa o cartão de alimentação o vê (valorMensal 0 = sem cartão)
  const cartao = dados?.cartao && dados.cartao.valorMensal > 0 ? dados.cartao : null;
  const numeros = dados ? numerosDoMes(dados.folha) : null;
  // O que o cartão carrega por mês (o da folha; senão o configurado) menos o que já se gastou com ele
  const numerosCartao = (() => {
    if (!dados || !cartao) return null;
    const { carregado, gasto } = cartaoDaFolha(dados.folha);
    return { gasto, sobra: Math.round(((carregado || cartao.valorMensal) - gasto) * 100) / 100 };
  })();
  const proximos = dados ? proximosPagamentos(dados.fixas, dados.pagamentos, dados.mes) : null;
  const ultimas = dados ? ultimasDespesas(dados.extras, MAX_EXTRAS) : [];
  const mesCurto = nomeMes(mes).slice(0, 3).toUpperCase();
  // O primeiro nome (ou o email, se não houver nome)
  const nome = user?.name?.trim().split(/\s+/)[0] || user?.email || '';

  return (
    <Ecra
      cabecalho={
        <>
          {/* O saldo já está no cartão grande: aqui o cabeçalho não repete o "Disponível" */}
          <Header title={t('Início')} onMenuPress={() => setMenuVisible(true)} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={dados?.saldo} />
        </>
      }
    >
      <View style={styles.saudacao}>
        <Text style={styles.ola} numberOfLines={1}>
          {t('Olá, {nome}', { nome })}
        </Text>
        <Text style={styles.mesTexto}>{nomeMes(mes)}</Text>
      </View>

      {/* Saldo da conta (o da carteira azul do cabeçalho dos outros ecrãs) e, a quem tem cartão, o do cartão de
          alimentação (laranja) ao lado, os dois mais pequenos */}
      <View style={cartao ? styles.saldosLinha : undefined}>
        <CartaoSaldo
          rotulo={t('Saldo da conta')}
          valor={dados?.saldo}
          icone={ICONE_CONTA}
          compacto={!!cartao}
          style={cartao ? undefined : styles.hero}
        />
        {cartao && (
          <CartaoSaldo
            rotulo={t('Cartão')}
            valor={cartao.saldo}
            variante="laranja"
            icone={ICONE_CARTAO}
            compacto
            alertaNegativo={false}
          />
        )}
      </View>

      {/* Este mês (logo a seguir ao saldo): o que já gastei e o que ainda sobra do salário; o resto está no Resumo do mês */}
      {dados && numeros && (
        <Cartao brilho onPress={() => router.push('/(tabs)/two')} style={styles.hero}>
          <TituloSecao titulo={t('Este mês')} icone="calendar-outline" />
          <View style={styles.grelha}>
            <Numero rotulo={t('Gasto no mês')} valor={numeros.gasto} tipo="saida" />
            <Numero rotulo={t('Sobra do mês')} valor={numeros.total} tipo="destaque" />
          </View>
          {/* O mesmo para o cartão de alimentação (só para quem o usa): o que já gastou com ele e o que sobra do que carrega */}
          {numerosCartao && (
            <View style={[styles.grelha, styles.grelhaCartao]}>
              <Numero rotulo={t('Gasto no cartão')} valor={numerosCartao.gasto} cor={COR_CARTAO} />
              <Numero rotulo={t('Sobra do cartão')} valor={numerosCartao.sobra} cor={COR_CARTAO} />
            </View>
          )}
        </Cartao>
      )}

      {/* Atalhos */}
      <View style={styles.atalhos}>
        {ATALHOS.map((atalho) => (
          <Pressable
            key={atalho.rotulo}
            onPress={() => router.push(atalho.rota)}
            style={({ pressed }) => [styles.atalho, pressed && styles.atalhoPremido]}
            accessibilityRole="button"
            accessibilityLabel={t(atalho.rotulo)}
          >
            <View style={[styles.atalhoIcone, { backgroundColor: comAlfa(atalho.cor, 0.12), borderColor: comAlfa(atalho.cor, 0.35) }]}>
              <Ionicons name={atalho.icone} size={20} color={atalho.cor} />
            </View>
            <Text style={styles.atalhoTexto} numberOfLines={2}>
              {t(atalho.rotulo)}
            </Text>
          </Pressable>
        ))}
      </View>

      {dados === null || numeros === null || proximos === null ? (
        erroCarregar ? (
          <Cartao style={styles.estado}>
            <Text style={styles.vazioTexto}>{t('Não foi possível carregar o painel.')}</Text>
            <Botao variante="secundario" pequeno icone="refresh-outline" titulo={t('Tentar outra vez')} onPress={carregarDados} />
          </Cartao>
        ) : (
          <ActivityIndicator style={styles.estado} color={cores.primaria} />
        )
      ) : (
        <>
          {/* Alertas do servidor (a vencer, em atraso, objetivos atrasados...); sem nenhum, não aparece */}
          <CartaoAlertas semOrcamentos={!!planeamento && planeamento.alertas.length > 0} />

          {/* Orçamentos perto do limite (80% ou mais) ou ultrapassados; sem nenhum, não aparece */}
          {planeamento && planeamento.alertas.length > 0 && (
            <Cartao acento={cores.aviso} onPress={() => router.push('/(tabs)/orcamentos' as Href)}>
              <TituloSecao titulo={t('Orçamentos')} icone="pie-chart-outline" cor={cores.aviso} />
              {planeamento.alertas.map((o, i) => {
                const info = infoCategoria(o.categoria);
                const cor = corEstadoOrcamento(o.estado);
                return (
                  <View key={o.id} style={[styles.orcamento, i > 0 && styles.linhaSeparada]}>
                    <View style={styles.orcamentoTopo}>
                      <Ionicons name={info.icone} size={16} color={info.cor} />
                      <Text style={styles.orcamentoNome} numberOfLines={1}>
                        {nomeCategoria(o.categoria)}
                      </Text>
                      <Text style={[styles.orcamentoPercentagem, { color: cor }]}>{Math.round(o.percentagem)}%</Text>
                    </View>
                    <BarraProgresso percentagem={o.percentagem} cor={cor} altura={6} />
                    <Text style={styles.linhaNota}>
                      {t('{gasto} de {limite}', { gasto: euros(o.gasto), limite: euros(o.limite) })}
                      {o.estado === 'ultrapassado' ? t(' · ultrapassado') : t(' · perto do limite')}
                    </Text>
                  </View>
                );
              })}
            </Cartao>
          )}

          {/* O objetivo de poupança mais próximo: nome, percentagem e barra (o cartão abre os objetivos) */}
          {planeamento?.objetivo && (
            <Cartao
              acento={corEstadoObjetivo(planeamento.objetivo.estado)}
              onPress={() => router.push('/(tabs)/objetivos' as Href)}
            >
              <View style={styles.orcamentoTopo}>
                <Ionicons name="flag-outline" size={16} color={cores.positivo} />
                <Text style={styles.orcamentoNome} numberOfLines={1}>
                  {planeamento.objetivo.nome}
                </Text>
                <Text style={[styles.orcamentoPercentagem, { color: cores.positivo }]}>
                  {Math.round(planeamento.objetivo.percentagem)}%
                </Text>
              </View>
              <BarraProgresso
                percentagem={planeamento.objetivo.percentagem}
                cor={cores.positivo}
                degrade={gradientes.progresso}
                style={styles.objetivoBarra}
              />
            </Cartao>
          )}

          {/* Recebimento manual: o salário que já devia ter entrado e ainda não foi marcado; sem nada por receber, não aparece */}
          {salarioEmFalta && <SalarioPorReceber dia={salarioEmFalta.dia} valorConfigurado={salarioEmFalta.valor} onRecebido={carregarDados} />}

          {/* Despesas fixas de meses anteriores que ficaram por pagar; sem nenhuma, não aparece */}
          <DespesasEmAtraso resumo={emAtraso} onPago={carregarDados} maximo={MAX_PROXIMOS} />

          {/* O mesmo para as poupanças de contribuição manual que ficaram por enviar */}
          <PoupancasEmAtraso contribuicoes={poupancasEmAtraso} onEnviada={carregarDados} maximo={MAX_PROXIMOS} />

          {/* Próximos pagamentos: as despesas fixas (e as anuais deste mês) ainda por pagar */}
          <Cartao acento={acentosFolha.despesas} onPress={() => router.push('/(tabs)/despesas-fixas')}>
            <TituloSecao
              titulo={t('Próximos pagamentos')}
              icone="time-outline"
              cor={acentosFolha.despesas}
              direita={proximos.total > 0 ? <ValorEuro valor={proximos.total} cor={cores.aviso} style={styles.totalTitulo} /> : undefined}
            />
            {proximos.pagamentos.length === 0 ? (
              <View style={styles.tudoPago}>
                <Ionicons name="checkmark-circle-outline" size={18} color={cores.positivo} />
                <Text style={styles.tudoPagoTexto}>{t('Não falta pagar nada este mês')}</Text>
              </View>
            ) : (
              proximos.pagamentos.slice(0, MAX_PROXIMOS).map((p, i) => {
                const atrasado = p.quando === 'atrasado';
                const corDia = atrasado ? cores.negativo : p.quando === 'hoje' ? cores.aviso : acentosFolha.despesas;
                return (
                  <View key={p.chave} style={[styles.linha, i > 0 && styles.linhaSeparada]}>
                    <View style={[styles.dia, { backgroundColor: comAlfa(corDia, 0.1), borderColor: comAlfa(corDia, 0.35) }]}>
                      <Text style={[styles.diaNumero, { color: corDia }]}>{p.dia ?? '—'}</Text>
                      <Text style={styles.diaMes}>{mesCurto}</Text>
                    </View>
                    <View style={styles.linhaTextos}>
                      <Text style={styles.linhaTitulo} numberOfLines={1}>
                        {p.titulo}
                      </Text>
                      <View style={styles.linhaDetalhe}>
                        <Text style={[styles.linhaNota, atrasado && styles.notaAtrasada]}>{textoQuando(p)}</Text>
                        {p.anual && <Etiqueta texto={t('Anual')} cor={acentosFolha.anual} style={styles.etiqueta} />}
                      </View>
                    </View>
                    <ValorEuro valor={p.valor} tipo="saida" style={styles.linhaValor} />
                  </View>
                );
              })
            )}
            {/* Poupanças de contribuição manual ainda por enviar este mês, com "Já enviei" */}
            {porEnviar.map((p, i) => (
              <LinhaPoupancaPorEnviar
                key={p.id}
                poupanca={p}
                onEnviar={() => enviarPoupanca(p)}
                aEnviar={aEnviar === p.id}
                separada={i > 0 || proximos.pagamentos.length > 0}
              />
            ))}
            {proximos.pagamentos.length > MAX_PROXIMOS && (
              <Text style={styles.linhaNota}>{t('+{n} mais', { n: proximos.pagamentos.length - MAX_PROXIMOS })}</Text>
            )}
          </Cartao>

          {/* Últimos gastos do mês */}
          <Cartao acento={acentosFolha.despesasMes} onPress={() => router.push('/(tabs)/despesas-extras')}>
            <TituloSecao
              titulo={t('Últimos gastos')}
              icone="flash-outline"
              cor={acentosFolha.despesasMes}
              direita={
                dados.extras.length > 0 ? (
                  <ValorEuro valor={somarValores(dados.extras)} tipo="saida" style={styles.totalTitulo} />
                ) : undefined
              }
            />
            {/* Registados sem internet, ainda por enviar */}
            {pendentes.filter((p) => mesDoPendente(p) === mes).map((p) => (
              <LinhaGastoPendente key={p.id} pendente={p} />
            ))}
            {ultimas.length === 0 ? (
              <Text style={styles.vazioTexto}>{t('Sem gastos este mês')}</Text>
            ) : (
              ultimas.map((d, i) => (
                <View key={d.id} style={[styles.linha, i > 0 && styles.linhaSeparada]}>
                  <View style={styles.linhaTextos}>
                    <Text style={styles.linhaTitulo} numberOfLines={1}>
                      {d.titulo}
                    </Text>
                    {!!d.data && <Text style={styles.linhaNota}>{diaEMes(d.data) || d.data}</Text>}
                  </View>
                  <ValorEuro valor={d.valor} tipo="saida" style={styles.linhaValor} />
                </View>
              ))
            )}
            {dados.extras.length > MAX_EXTRAS && (
              <Text style={styles.linhaNota}>{t('+{n} mais', { n: dados.extras.length - MAX_EXTRAS })}</Text>
            )}
          </Cartao>

          {/* Grupos: quanto tenho a receber e a pagar (só aparece com grupos ou convites) */}
          <ResumoPartilhado compacto />
        </>
      )}
    </Ecra>
  );
}

// Um dos números do cartão "Este mês"
function Numero({ rotulo, valor, tipo, cor }: { rotulo: string; valor: number; tipo?: TipoValor; cor?: string }) {
  return (
    <View style={styles.numero}>
      <Text style={styles.numeroRotulo}>{rotulo}</Text>
      <ValorEuro valor={valor} tipo={tipo} cor={cor} style={styles.numeroValor} numberOfLines={1} adjustsFontSizeToFit />
    </View>
  );
}

const styles = StyleSheet.create({
  saudacao: {
    marginTop: espaco.sm,
    marginBottom: espaco.lg,
  },
  ola: {
    ...tipografia.tituloEcra,
    fontSize: 26,
  },
  mesTexto: {
    ...tipografia.secundario,
    marginTop: 2,
  },
  hero: {
    marginBottom: espaco.lg,
  },
  // A conta e o cartão de alimentação, lado a lado
  saldosLinha: {
    flexDirection: 'row',
    gap: espaco.md,
    marginBottom: espaco.lg,
  },
  // Grelha 2x2: cada atalho com o ícone ao lado do texto (cabe "Novo gasto" num telemóvel estreito)
  atalhos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
    marginBottom: espaco.lg,
  },
  atalho: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm + 2,
    minHeight: 56,
    paddingVertical: espaco.sm,
    paddingHorizontal: espaco.md,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  atalhoPremido: {
    backgroundColor: cores.superficiePremida,
    transform: [{ scale: 0.98 }],
  },
  atalhoIcone: {
    width: 36,
    height: 36,
    borderRadius: raio.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  atalhoTexto: {
    flex: 1,
    fontFamily: fontes.corpoMedio,
    fontSize: 13,
    lineHeight: 17,
    color: cores.texto,
  },
  estado: {
    padding: espaco.xl,
    alignItems: 'center',
    gap: espaco.md,
  },
  grelha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
  },
  grelhaCartao: {
    marginTop: espaco.sm,
  },
  numero: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: espaco.md,
    borderRadius: raio.md,
    backgroundColor: cores.superficieAlta,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  numeroRotulo: {
    ...tipografia.rotulo,
    fontSize: 11,
  },
  numeroValor: {
    fontFamily: fontes.numeroForte,
    fontSize: 19,
    marginTop: espaco.xs,
  },
  totalTitulo: {
    fontFamily: fontes.numeroForte,
    fontSize: 15,
  },
  tudoPago: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    paddingVertical: espaco.sm,
  },
  tudoPagoTexto: {
    ...tipografia.secundario,
    color: cores.positivo,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingVertical: espaco.sm + 2,
  },
  linhaSeparada: {
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  dia: {
    width: 44,
    paddingVertical: 4,
    borderRadius: raio.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  diaNumero: {
    fontFamily: fontes.numeroForte,
    fontSize: 17,
    lineHeight: 20,
  },
  diaMes: {
    fontFamily: fontes.corpoMedio,
    fontSize: 9,
    letterSpacing: 0.8,
    color: cores.textoSecundario,
  },
  linhaTextos: {
    flex: 1,
  },
  linhaTitulo: {
    ...tipografia.corpoMedio,
  },
  linhaDetalhe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    marginTop: 2,
  },
  linhaNota: {
    ...tipografia.nota,
    color: cores.textoSecundario,
  },
  notaAtrasada: {
    fontFamily: fontes.corpoForte,
    color: cores.negativo,
  },
  etiqueta: {
    paddingVertical: 1,
    paddingHorizontal: 6,
  },
  orcamento: {
    gap: 6,
    paddingVertical: espaco.sm + 2,
  },
  orcamentoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
  },
  orcamentoNome: {
    ...tipografia.corpoMedio,
    flex: 1,
  },
  orcamentoPercentagem: {
    fontFamily: fontes.numeroForte,
    fontSize: 15,
  },
  objetivoBarra: {
    marginVertical: espaco.sm + 2,
  },
  linhaValor: {
    fontSize: 15,
  },
  vazioTexto: {
    ...tipografia.secundario,
    fontStyle: 'italic',
    paddingVertical: espaco.sm,
  },
});
