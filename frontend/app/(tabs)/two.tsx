import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { BlocoFolha } from '../../components/BlocoFolha';
import { LinhaComparacao, ListaComparacao } from '../../components/ComparacaoMes';
import { GraficoDistribuicao } from '../../components/GraficoDistribuicao';
import { GraficoEvolucao } from '../../components/GraficoEvolucao';
import { Header } from '../../components/Header';
import { SeletorMes } from '../../components/SeletorMes';
import { ResumoPartilhado } from '../../components/partilhado/ResumoPartilhado';
import { SideMenu } from '../../components/SideMenu';
import { Separadores } from '../../components/Separadores';
import { Botao, Cartao, Chip, Ecra, NomeIcone, TituloSecao, ValorEuro } from '../../components/ui';
import { acentosFolha, cores, espaco, fontes, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';
import {
  calcularSaldoDisponivel,
  ComparacaoMes,
  DadosFolhaMes,
  EstatisticasDB,
  EvolucaoMes,
  Mes,
  mesAtual,
  nomeMes,
  Poupanca,
  PoupancasDB,
  totaisFolha,
} from '../../services/database';
import { exportarParaExcel } from '../../services/exportarExcel';
import { ouvir } from '../../services/eventos';
import { obterDadosFolhaMes } from '../../services/folhaMes';
import { exportarRelatorioPdf, mensagemErroPdf } from '../../services/relatorioPdf';
import { podePartilhar } from '../../utils/guardarFicheiro';
import { nomeMesSimples, temComparacao } from '../../utils/comparacao';
import { mostrarAlerta } from '../../utils/helpers';
import { distribuicaoCartao, distribuicaoSalario } from '../../utils/painel';
import { estadoEnvio } from '../../utils/poupancasManuais';

// Cores dos blocos: as do livro Excel, na paleta néon (constants/tema.ts)
const CORES = acentosFolha;

// O gráfico de cima: a evolução dos últimos 12 meses ou a distribuição do salário do mês escolhido
// (em barras ou na roda). A escolha fica guardada neste dispositivo
type VistaGrafico = 'evolucao' | 'distribuicao' | 'roda';
const VISTAS: { chave: VistaGrafico; rotulo: string }[] = [
  { chave: 'evolucao', rotulo: 'Evolução' },
  { chave: 'distribuicao', rotulo: 'Distribuição' },
  { chave: 'roda', rotulo: 'Roda' },
];
const CHAVE_VISTA = 'resumo.vistaGrafico';

// O gráfico de cima é da conta ou do cartão de alimentação (só para quem o tem). A escolha também fica guardada
type OrigemGrafico = 'conta' | 'cartao';
const CHAVE_ORIGEM = 'resumo.origemGrafico';

// Resumo do mês: um gráfico à escolha e a folha do mês escolhido, com os mesmos blocos do livro Excel
export default function ResumoMesScreen() {
  const t = useT();
  const [menuVisible, setMenuVisible] = useState(false);
  const [mes, setMes] = useState<Mes>(mesAtual);
  // A folha e o mês a que pertence: enquanto o mês escolhido não chega, não se mostra a de outro
  const [carregado, setCarregado] = useState<{ mes: Mes; folha: DadosFolhaMes } | null>(null);
  const [erroCarregar, setErroCarregar] = useState(false);
  const ultimoPedido = useRef(0);
  const [saldoDisponivel, setSaldoDisponivel] = useState<number | undefined>(undefined);
  const [aExportar, setAExportar] = useState<Modo | null>(null);
  const [aExportarPdf, setAExportarPdf] = useState<Modo | null>(null);
  // Os últimos 12 meses: à parte da folha (se falharem, a folha aparece na mesma)
  const [evolucao, setEvolucao] = useState<EvolucaoMes[] | null>(null);
  // O mês escolhido comparado com o anterior (e o mês a que pertence)
  const [comparacao, setComparacao] = useState<{ mes: Mes; dados: ComparacaoMes } | null>(null);
  // As poupanças de contribuição manual (o estado do envio aparece no bloco Poupança do mês atual)
  const [poupancasMes, setPoupancasMes] = useState<Poupanca[]>([]);
  const [vista, setVista] = useState<VistaGrafico>('evolucao');
  const [origemEscolhida, setOrigemEscolhida] = useState<OrigemGrafico>('conta');
  const { user } = useAuth();

  // A vista escolhida da última vez (sem AsyncStorage, fica a evolução)
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const guardada = await AsyncStorage.getItem(CHAVE_VISTA);
        if (ativo && VISTAS.some((v) => v.chave === guardada)) setVista(guardada as VistaGrafico);
      } catch {
        // fica a vista por defeito
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  // A origem escolhida da última vez
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const guardada = await AsyncStorage.getItem(CHAVE_ORIGEM);
        if (ativo && (guardada === 'conta' || guardada === 'cartao')) setOrigemEscolhida(guardada);
      } catch {
        // fica a conta
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  function escolherOrigem(nova: OrigemGrafico) {
    setOrigemEscolhida(nova);
    try {
      AsyncStorage.setItem(CHAVE_ORIGEM, nova).catch(() => {
        // não guardar a escolha não impede de a usar agora
      });
    } catch {
      // idem
    }
  }

  function escolherVista(nova: VistaGrafico) {
    setVista(nova);
    try {
      AsyncStorage.setItem(CHAVE_VISTA, nova).catch(() => {
        // não guardar a escolha não impede de a usar agora
      });
    } catch {
      // idem
    }
  }

  useFocusEffect(
    useCallback(() => {
      carregarDados(mes);
      // Gravou-se noutro sítio (botão rápido "+", fila offline): carregar outra vez
      return ouvir('dadosMudaram', () => carregarDados(mes));
    }, [user, mes])
  );

  // A evolução não depende do mês escolhido: só ao voltar ao ecrã
  useFocusEffect(
    useCallback(() => {
      carregarEvolucao();
    }, [user])
  );

  async function carregarEvolucao() {
    if (!user?.id) return;
    try {
      setEvolucao(await EstatisticasDB.evolucao(user.id, 12));
    } catch (error) {
      console.error('Erro ao carregar a evolução:', error);
    }
  }

  function mudarMes(novo: Mes) {
    setErroCarregar(false);
    setMes(novo); // o useFocusEffect carrega o mês novo
  }

  async function carregarDados(mesPedido: Mes) {
    if (!user?.id) return;
    // Só conta a resposta do último pedido: ao mudar de mês depressa, um pedido antigo
    // que chegue depois não pode mostrar o mês errado
    const pedido = ++ultimoPedido.current;
    try {
      // Primeiro o saldo: recebe o salário e faz os débitos automáticos do dia, se for o caso
      const saldo = await calcularSaldoDisponivel(user.id);
      // Os meses passados vêm do histórico guardado (obterDadosFolhaMes trata disso)
      const folha = await obterDadosFolhaMes(user.id, mesPedido);
      if (pedido !== ultimoPedido.current) return;
      setSaldoDisponivel(saldo);
      setCarregado({ mes: mesPedido, folha });
      setErroCarregar(false);
    } catch (error) {
      if (pedido !== ultimoPedido.current) return;
      console.error('Erro ao carregar o resumo do mês:', error);
      setErroCarregar(true);
    }
    // As poupanças manuais (só no mês atual) e a comparação com o mês anterior: à parte (se falharem,
    // a folha aparece na mesma)
    if (mesPedido === mesAtual()) {
      try {
        const lista = await PoupancasDB.getAll(user.id);
        if (pedido === ultimoPedido.current) setPoupancasMes(lista);
      } catch (error) {
        console.error('Erro ao carregar as poupanças:', error);
      }
    }
    try {
      const dados = await EstatisticasDB.comparacao(user.id, mesPedido);
      if (pedido === ultimoPedido.current) setComparacao({ mes: mesPedido, dados });
    } catch (error) {
      console.error('Erro ao carregar a comparação com o mês anterior:', error);
    }
  }

  // "descarregar": guarda o ficheiro; "partilhar": envia para outra app (email, WhatsApp, Drive...)
  async function exportarExcel(modo: Modo) {
    if (!user?.id) return;
    setAExportar(modo);
    try {
      avisarGuardado(await exportarParaExcel(user.id, undefined, modo));
    } catch (error) {
      console.error('Erro ao exportar para Excel:', error);
      mostrarAlerta(t('Erro'), t('Não foi possível exportar para Excel.'));
    } finally {
      setAExportar(null);
    }
  }

  // O relatório do mês escolhido, gerado pela API
  async function exportarPdf(modo: Modo) {
    setAExportarPdf(modo);
    try {
      avisarGuardado(await exportarRelatorioPdf(mes, modo));
    } catch (error) {
      console.error('Erro ao exportar o PDF:', error);
      mostrarAlerta(t('Erro'), mensagemErroPdf(error));
    } finally {
      setAExportarPdf(null);
    }
  }

  // No telemóvel o ficheiro vai para uma pasta: dizer qual (na web o browser já mostra a transferência)
  function avisarGuardado(pasta: string | void) {
    if (pasta && Platform.OS !== 'web') mostrarAlerta(t('Ficheiro guardado'), t('Guardado em {pasta}.', { pasta }));
  }

  const eMesAtual = mes === mesAtual();
  const folha = carregado?.mes === mes ? carregado.folha : null;
  const totais = folha ? totaisFolha(folha) : null;
  // O cartão de alimentação só aparece a quem o tem ligado no Salário (é o que faz o cartão carregar nos meses)
  const temCartao =
    (evolucao?.some((m) => (m.cartaoCarregado ?? 0) > 0) ?? false) || (folha ? distribuicaoCartao(folha).salario > 0 : false);
  const origem: OrigemGrafico = temCartao ? origemEscolhida : 'conta';
  const doCartao = origem === 'cartao';
  const distribuicao = folha ? (doCartao ? distribuicaoCartao(folha) : distribuicaoSalario(folha)) : null;
  const daComparacao = comparacao?.mes === mes ? comparacao.dados : null;

  return (
    <Ecra
      cabecalho={
        <>
          <Header title={t('Resumo do mês')} onMenuPress={() => setMenuVisible(true)} saldo={saldoDisponivel} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldoDisponivel} />
        </>
      }
    >
      <Separadores grupo="mes" />
      <SeletorMes mes={mes} onChange={mudarMes} />

      {/* O gráfico de cima: evolução (tocar num mês escolhe-o no seletor) ou a distribuição do salário do mês */}
      <Cartao brilho>
        {temCartao && (
          <View style={styles.vistas}>
            <Chip rotulo={t('Conta')} ativo={origem === 'conta'} onPress={() => escolherOrigem('conta')} />
            <Chip rotulo={t('Cartão de alimentação')} ativo={origem === 'cartao'} onPress={() => escolherOrigem('cartao')} />
          </View>
        )}
        <View style={styles.vistas}>
          {VISTAS.map((v) => (
            <Chip key={v.chave} rotulo={t(v.rotulo)} ativo={vista === v.chave} onPress={() => escolherVista(v.chave)} />
          ))}
        </View>
        {vista === 'evolucao' ? (
          evolucao && evolucao.length > 0 ? (
            <>
              <TituloSecao titulo={t('Últimos 12 meses')} icone="analytics-outline" />
              <GraficoEvolucao meses={evolucao} selecionado={mes} onEscolher={mudarMes} cartao={doCartao} />
            </>
          ) : (
            <ActivityIndicator style={styles.estado} color={cores.primaria} />
          )
        ) : !distribuicao ? (
          <ActivityIndicator style={styles.estado} color={cores.primaria} />
        ) : (
          <>
            <TituloSecao
              titulo={doCartao ? t('Cartão de alimentação de {mes}', { mes: nomeMes(mes) }) : t('Salário de {mes}', { mes: nomeMes(mes) })}
              icone={doCartao ? 'card-outline' : 'pie-chart-outline'}
              direita={<ValorEuro valor={distribuicao.salario} tipo="entrada" style={styles.salarioTitulo} />}
            />
            {distribuicao.salario > 0 ? (
              <>
                <GraficoDistribuicao distribuicao={distribuicao} tipo={vista === 'roda' ? 'roda' : 'barras'} de={doCartao ? 'cartao' : 'salario'} />
                <View style={styles.divider} />
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>
                    {doCartao ? t('Sobra no cartão (carregou - gastos)') : t('Entra na conta (salário - poupanças)')}
                  </Text>
                  <ValorEuro valor={distribuicao.entraNaConta} tipo="entrada" style={styles.resultValue} />
                </View>
              </>
            ) : (
              <Text style={styles.nota}>
                {doCartao
                  ? t('Sem cartão de alimentação registado em {mes}', { mes: nomeMes(mes) })
                  : t('Sem salário registado em {mes}', { mes: nomeMes(mes) })}
              </Text>
            )}
          </>
        )}
      </Cartao>

      {/* O mês escolhido comparado com o anterior: todas as categorias de gastos (no mês atual, os
          gastos do mês anterior só até ao mesmo dia; nos meses passados, meses completos) */}
      {daComparacao && temComparacao(daComparacao) && (
        <Cartao>
          <TituloSecao titulo={t('Comparado com {mes}', { mes: nomeMesSimples(daComparacao.mesAnterior) })} icone="swap-vertical-outline" />
          <ListaComparacao comparacao={daComparacao} categorias={daComparacao.categorias} />
          {daComparacao.despesasFixas.diferenca !== 0 && (
            <LinhaComparacao rotulo={t('Despesas Fixas')} valor={daComparacao.despesasFixas} destaque separada />
          )}
        </Cartao>
      )}

      {!folha || !totais ? (
        erroCarregar ? (
          <View style={styles.estado}>
            <Text style={styles.vazioTexto}>{t('Não foi possível carregar {mes}.', { mes: nomeMes(mes) })}</Text>
            <Botao
              variante="secundario"
              pequeno
              icone="refresh-outline"
              titulo={t('Tentar outra vez')}
              onPress={() => carregarDados(mes)}
            />
          </View>
        ) : (
          <ActivityIndicator style={styles.estado} color={cores.primaria} />
        )
      ) : (
        <>
          <BlocoFolha
            titulo={t('Lucro')}
            cor={CORES.lucro}
            linhas={folha.lucro}
            total={totais.lucro}
            vazio={t('Sem salário registado neste mês')}
            onPressTitulo={() => router.push('/(tabs)/salario')}
          />
          <BlocoFolha
            titulo={t('Despesas')}
            cor={CORES.despesas}
            linhas={folha.despesas}
            total={totais.despesas}
            mostrarEstado
            vazio={t('Sem despesas fixas')}
            onPressTitulo={() => router.push('/(tabs)/despesas-fixas')}
            rodape={
              // Só no mês atual: o saldo da conta e o que fica depois do que falta pagar
              eMesAtual ? (
                <View style={styles.rodape}>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>{t('Saldo da conta')}</Text>
                    {folha.saldoConta !== undefined ? (
                      <ValorEuro valor={folha.saldoConta} style={styles.resultValue} />
                    ) : (
                      <Text style={styles.resultValue}>—</Text>
                    )}
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>{t('Previsão no fim do mês')}</Text>
                    {totais.previsao !== null ? (
                      <ValorEuro valor={totais.previsao} tipo="destaque" style={styles.totalValue} />
                    ) : (
                      <Text style={styles.resultValue}>—</Text>
                    )}
                  </View>
                </View>
              ) : undefined
            }
          />
          <BlocoFolha
            titulo={t('Poupança')}
            cor={CORES.poupanca}
            linhas={eMesAtual && poupancasMes.length > 0 ? [] : folha.poupanca}
            total={eMesAtual && poupancasMes.length > 0 ? undefined : totais.poupanca}
            vazio={t('Sem poupanças configuradas')}
            semVazio={eMesAtual && poupancasMes.length > 0}
            onPressTitulo={() => router.push('/(tabs)/configuracoes')}
            rodape={
              // Mês atual: cada poupança com o estado do envio (só as manuais) logo a seguir ao nome e o que vai para ela
              eMesAtual && poupancasMes.length > 0 ? (
                <View style={styles.rodape}>
                  {poupancasMes.map((p) => {
                    const estado = estadoEnvio(p, mes);
                    return (
                      <View key={p.id} style={styles.resultRow}>
                        <Text style={styles.poupancaNome} numberOfLines={1}>
                          {p.nome}
                          {estado && (
                            <Text style={[styles.poupancaEstado, { color: estado.porEnviar ? cores.aviso : cores.positivo }]}>
                              {'  ·  '}
                              {estado.texto}
                            </Text>
                          )}
                        </Text>
                        <ValorEuro valor={p.valorMensal ?? 0} style={styles.resultValue} />
                      </View>
                    );
                  })}
                </View>
              ) : undefined
            }
          />
          <BlocoFolha
            titulo={t('Despesas do Mês')}
            cor={CORES.despesasMes}
            linhas={folha.despesasMes}
            total={totais.despesasMes}
            mostrarData
            vazio={t('Sem gastos neste mês')}
            onPressTitulo={() => router.push('/(tabs)/despesas-extras')}
          />
          <BlocoFolha
            titulo={t('Anual')}
            cor={CORES.anual}
            linhas={folha.anual}
            total={totais.anual}
            vazio={t('Sem despesas anuais')}
            onPressTitulo={() => router.push('/(tabs)/anuais' as any)}
          />

          <BlocoFolha
            titulo={t('Saldo Poupança')}
            cor={CORES.poupanca}
            linhas={folha.saldoPoupanca}
            total={totais.saldoPoupanca}
            vazio={t('Sem saldos de poupança')}
            onPressTitulo={() => router.push('/(tabs)/configuracoes')}
          />
          <BlocoFolha
            titulo={t('Total a pagar')}
            cor={CORES.despesas}
            linhas={folha.totalAPagar}
            total={totais.totalAPagar}
            vazio={t('Sem dívidas')}
            onPressTitulo={() => router.push('/(tabs)/dividas' as any)}
          />

          {/* Grupos: o que tenho a receber e a pagar, a minha parte do mês e os mealheiros */}
          <ResumoPartilhado mes={mes} />
        </>
      )}

      {/* Exportar: o Excel é o livro inteiro (uma folha por mês); o PDF é só o mês escolhido,
          gerado pela API .NET (GET /api/relatorios/mes/{mes}.pdf) */}
      <BotoesExportar
        titulo="Excel"
        nota={t('Todos os meses, uma folha por mês')}
        icone="grid-outline"
        aCarregar={aExportar}
        onExportar={exportarExcel}
      />
      <BotoesExportar
        titulo="PDF"
        nota={t('Relatório de {mes}, com gráficos e tabelas', { mes: nomeMes(mes) })}
        icone="document-text-outline"
        aCarregar={aExportarPdf}
        onExportar={exportarPdf}
      />
    </Ecra>
  );
}

type Modo = 'descarregar' | 'partilhar';

// Uma linha com "Descarregar" e "Enviar" para um tipo de ficheiro
function BotoesExportar({ titulo, nota, icone, aCarregar, onExportar }: {
  titulo: string;
  nota: string;
  icone: NomeIcone;
  aCarregar: Modo | null;
  onExportar: (modo: Modo) => void;
}) {
  const t = useT();
  return (
    <>
      <View style={styles.linhaExportar}>
        <Botao
          titulo={aCarregar === 'descarregar' ? t('A preparar…') : t('Descarregar {tipo}', { tipo: titulo })}
          icone={icone}
          onPress={() => onExportar('descarregar')}
          aCarregar={aCarregar === 'descarregar'}
          desativado={!!aCarregar}
          style={styles.botaoExportar}
        />
        {podePartilhar() && (
          <Botao
            variante="secundario"
            titulo={aCarregar === 'partilhar' ? t('A preparar…') : t('Enviar')}
            icone="share-social-outline"
            onPress={() => onExportar('partilhar')}
            aCarregar={aCarregar === 'partilhar'}
            desativado={!!aCarregar}
            style={styles.botaoEnviar}
          />
        )}
      </View>
      <Text style={styles.notaBotao}>{nota}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  linhaExportar: { flexDirection: 'row', gap: espaco.sm, marginTop: espaco.md },
  botaoExportar: { flex: 2 },
  botaoEnviar: { flex: 1 },
  vistas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
    marginBottom: espaco.md,
  },
  rodape: {
    paddingHorizontal: espaco.lg - 2,
    paddingVertical: espaco.sm,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  estado: {
    padding: espaco.xl,
    alignItems: 'center',
    gap: espaco.md,
  },
  vazioTexto: {
    ...tipografia.secundario,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  salarioTitulo: {
    fontFamily: fontes.numeroForte,
    fontSize: 15,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 5,
  },
  resultLabel: {
    ...tipografia.secundario,
    flex: 1,
    marginRight: espaco.sm,
  },
  poupancaNome: {
    ...tipografia.secundario,
    color: cores.texto,
    flex: 1,
    marginRight: espaco.sm,
  },
  poupancaEstado: {
    ...tipografia.nota,
  },
  resultValue: {
    fontSize: 15,
  },
  divider: {
    height: 1,
    backgroundColor: cores.borda,
    marginVertical: espaco.sm,
  },
  totalValue: {
    fontFamily: fontes.numeroForte,
    fontSize: 19,
  },
  nota: {
    ...tipografia.nota,
    fontStyle: 'italic',
    marginTop: espaco.xs,
  },
  notaBotao: {
    ...tipografia.nota,
    textAlign: 'center',
    marginTop: espaco.xs,
  },
});
