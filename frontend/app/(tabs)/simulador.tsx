import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Header } from '../../components/Header';
import { Separadores } from '../../components/Separadores';
import { SideMenu } from '../../components/SideMenu';
import { COR_SIMULADOR as COR, estilos, type Periodo } from '../../components/simulador/PecasSimulador';
import { SimuladorCartao } from '../../components/simulador/SimuladorCartao';
import { SimuladorConta } from '../../components/simulador/SimuladorConta';
import { Botao, Chip, Ecra } from '../../components/ui';
import { espaco, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';
import { calcularDespesasFixasSeparadas, EstatisticasDB, PoupancasDB, SalarioDB } from '../../services/database';
import type { GastosCategorias, Poupanca, PrevisaoFimMes } from '../../services/tipos';
import { parseValor } from '../../utils/helpers';

// Sempre o mesmo array vazio: um novo a cada falha voltava a desenhar o ecrã sem necessidade
const SEM_POUPANCAS: Poupanca[] = [];

// Quantos meses completos entram na média
const MESES_MEDIA = 6;

// Simulador "e se…": parte do que JÁ se gastou (o mês atual até hoje, ou a média por mês dos últimos meses completos),
// por categoria e de qualquer tipo de despesa (mensais e do dia a dia, com a conta e com o cartão de alimentação, tudo
// na mesma lista), e vê o que sobra se se gastasse noutro sítio ou menos. A única previsão é a do cartão (se chega
// até ao fim do mês). Nada é guardado.
export default function SimuladorScreen() {
  const t = useT();
  const { user } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const [escolha, setEscolha] = useState<Periodo | null>(null);
  const [gastos, setGastos] = useState<GastosCategorias | null>(null);
  const [previsao, setPrevisao] = useState<PrevisaoFimMes | null>(null);
  const [receita, setReceita] = useState<number | null>(null);
  // As despesas mensais que ainda faltam pagar este mês (sem elas o simulador funciona na mesma)
  const [fixasPorPagar, setFixasPorPagar] = useState(0);
  const [erroCarregar, setErroCarregar] = useState(false);
  const ultimoPedido = useRef(0);
  // As poupanças e a contribuição mensal nova que se escreveu em cada uma (por id)
  const [poupancas, setPoupancas] = useState<Poupanca[]>(SEM_POUPANCAS);
  const [novasContribuicoes, setNovasContribuicoes] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [user])
  );

  // O salário: sem ele as contas não funcionam
  async function carregarReceita(userId: string): Promise<number | null> {
    try {
      const config = await SalarioDB.getConfig(userId);
      return config ? parseValor(config.valor) : 0;
    } catch (error) {
      console.error('Erro ao carregar o salário para o simulador:', error);
      return null;
    }
  }

  async function carregar() {
    if (!user?.id) return;
    const pedido = ++ultimoPedido.current;
    try {
      const [resposta, previsaoCartao, lista, salario, fixas] = await Promise.all([
        EstatisticasDB.gastosCategorias(user.id, MESES_MEDIA),
        // Só serve para saber se o cartão chega até ao fim do mês: sem ela o resto funciona na mesma
        EstatisticasDB.previsao(user.id).catch((error) => {
          console.error('Erro ao carregar a previsão do cartão para o simulador:', error);
          return null;
        }),
        // Sem as poupanças o simulador funciona na mesma (só não mostra essa parte)
        PoupancasDB.getAll(user.id).catch((error) => {
          console.error('Erro ao carregar as poupanças para o simulador:', error);
          return SEM_POUPANCAS;
        }),
        carregarReceita(user.id),
        calcularDespesasFixasSeparadas(user.id).catch((error) => {
          console.error('Erro ao carregar as despesas mensais por pagar para o simulador:', error);
          return null;
        }),
      ]);
      if (pedido !== ultimoPedido.current) return;
      setGastos(resposta);
      setPrevisao(previsaoCartao);
      setPoupancas(lista);
      setReceita(salario);
      setFixasPorPagar(fixas?.porDebitar ?? 0);
      setErroCarregar(false);
    } catch (error) {
      if (pedido !== ultimoPedido.current) return;
      console.error('Erro ao carregar os gastos para o simulador:', error);
      setErroCarregar(true);
    }
  }

  // Sem um mês completo de histórico não há média: fica o mês atual
  const semMedia = (gastos?.mesesBase ?? 0) === 0;
  const periodo: Periodo = semMedia ? 'atual' : (escolha ?? 'media');
  const temCartao = !!gastos?.cartao;
  const mesesBase = gastos?.mesesBase ?? 0;

  const intro =
    periodo === 'atual'
      ? t('O que já gastaste este mês, até hoje. Só valores reais, sem previsões.')
      : mesesBase === 1
        ? t('A média por mês é só a do último mês completo, sem contar este mês. Só valores reais, sem previsões.')
        : t('A média por mês do que gastaste nos últimos {n} meses completos, sem contar este mês. Só valores reais, sem previsões.', { n: mesesBase });

  return (
    <Ecra
      keyboardShouldPersistTaps="handled"
      cabecalho={
        <>
          <Header title={t('Simulador')} onMenuPress={() => setMenuVisible(true)} saldo={previsao?.saldoAtual} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={previsao?.saldoAtual} />
        </>
      }
    >
      <Separadores grupo="planeamento" />

      {!gastos ? (
        erroCarregar ? (
          <View style={styles.estado}>
            <Text style={estilos.vazio}>{t('Não foi possível carregar os gastos.')}</Text>
            <Botao variante="secundario" pequeno icone="refresh-outline" titulo={t('Tentar outra vez')} onPress={carregar} />
          </View>
        ) : (
          <ActivityIndicator style={styles.estado} color={COR} />
        )
      ) : (
        <>
          <View style={styles.modos}>
            <Chip rotulo={t('Mês atual')} ativo={periodo === 'atual'} onPress={() => setEscolha('atual')} cor={COR} />
            <Chip
              rotulo={t('Média dos últimos {n} meses', { n: MESES_MEDIA })}
              ativo={periodo === 'media'}
              onPress={() => setEscolha('media')}
              desativado={semMedia}
              cor={COR}
            />
          </View>
          <Text style={styles.intro}>{intro}</Text>
          {semMedia && (
            <Text style={styles.avisoMedia}>
              {t('A média ainda não está disponível: precisa de pelo menos um mês completo antes deste, e os teus gastos só começam este mês. Fica disponível quando o mês acabar.')}
            </Text>
          )}

          {receita !== null ? (
            <SimuladorConta
              key={periodo}
              periodo={periodo}
              gastosConta={periodo === 'media' ? gastos.conta.media : gastos.conta.mesAtual}
              gastosCartao={gastos.cartao ? (periodo === 'media' ? gastos.cartao.media : gastos.cartao.mesAtual) : null}
              cargaMensal={gastos.cartaoMensal}
              fixasPorPagar={fixasPorPagar}
              receita={receita}
              poupancas={poupancas}
              novasContribuicoes={novasContribuicoes}
              onNovaContribuicao={(id, texto) => setNovasContribuicoes((atual) => ({ ...atual, [id]: texto }))}
              onReporPoupancas={() => setNovasContribuicoes({})}
            />
          ) : (
            <View style={styles.estado}>
              <Text style={estilos.vazio}>{t('Não foi possível carregar o salário.')}</Text>
              <Botao variante="secundario" pequeno icone="refresh-outline" titulo={t('Tentar outra vez')} onPress={carregar} />
            </View>
          )}

          {temCartao && previsao?.cartao && (
            <SimuladorCartao cartao={previsao.cartao} previsaoConta={previsao.previsaoFinal} diasRestantes={previsao.diasRestantes} />
          )}
        </>
      )}
    </Ecra>
  );
}

const styles = StyleSheet.create({
  estado: {
    padding: espaco.xl,
    alignItems: 'center',
    gap: espaco.md,
  },
  modos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
    marginBottom: espaco.sm,
  },
  intro: {
    ...tipografia.secundario,
    marginBottom: espaco.lg,
  },
  avisoMedia: {
    ...tipografia.nota,
    marginTop: -espaco.sm,
    marginBottom: espaco.lg,
  },
});
