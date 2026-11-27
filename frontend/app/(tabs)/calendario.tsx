import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Header } from '../../components/Header';
import { SideMenu } from '../../components/SideMenu';
import { Separadores } from '../../components/Separadores';
import { Botao, Cartao, Ecra, TituloSecao, ValorEuro } from '../../components/ui';
import { acentosFolha, brilho, comAlfa, cores, espaco, fontes, raio, sombras, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';
import { ativaNoMes, calcularSaldoDisponivel, Despesa, DespesasExtrasDB, DespesasFixasDB, mesDe, SalarioDB } from '../../services/database';
import { lerData, parseValor } from '../../utils/helpers';

// Cores dos indicadores: despesas fixas em coral, extras no roxo das Despesas do Mês, salário em menta
const COR_FIXA = cores.negativo;
const COR_EXTRA = acentosFolha.despesasMes;

interface DiaCalendario {
  dia: number;
  despesasFixas: Despesa[];
  despesasExtras: Despesa[];
  isHoje: boolean;
  isDiaSalario: boolean;
}

export default function CalendarioScreen() {
  const t = useT();
  const [menuVisible, setMenuVisible] = useState(false);
  const [saldoDisponivel, setSaldoDisponivel] = useState(0);
  const [dataAtual, setDataAtual] = useState(new Date());
  const [diasCalendario, setDiasCalendario] = useState<DiaCalendario[]>([]);
  const [diaSelecionado, setDiaSelecionado] = useState<DiaCalendario | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [salarioConfig, setSalarioConfig] = useState<{ valor: string; diaRecebimento: number } | null>(null);
  const { user } = useAuth();

  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  useFocusEffect(
    useCallback(() => {
      // Ao mudar de mês depressa, a resposta de um pedido antigo não pode desenhar o mês errado
      let ativo = true;
      carregarDados(() => ativo);
      return () => {
        ativo = false;
      };
    }, [dataAtual, user])
  );

  async function carregarDados(estaAtivo: () => boolean) {
    if (user?.id) {
      try {
        const [saldo, fixas, extras, config] = await Promise.all([
          calcularSaldoDisponivel(user.id),
          DespesasFixasDB.getAll(user.id),
          DespesasExtrasDB.getDoMes(user.id, mesDe(dataAtual)),
          SalarioDB.getConfig(user.id),
        ]);
        if (!estaAtivo()) return;

        setSaldoDisponivel(saldo);
        setSalarioConfig(config);

        // Construir calendário
        construirCalendario(fixas, extras, config?.diaRecebimento);
      } catch (error) {
        console.error('Erro ao carregar calendário:', error);
      }
    }
  }

  function construirCalendario(despesasFixas: Despesa[], despesasExtras: Despesa[], diaSalario?: number) {
    const ano = dataAtual.getFullYear();
    const mes = dataAtual.getMonth();

    // Último dia do mês
    const ultimoDia = new Date(ano, mes + 1, 0);
    
    const dias: DiaCalendario[] = [];
    const hoje = new Date();
    
    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
      // Despesas fixas para este dia
      // Dia 29-31 em meses mais curtos aparece no último dia do mês (como no débito)
      const fixasDoDia = despesasFixas.filter(
        d => ativaNoMes(d, mesDe(dataAtual)) && !!d.diaDebito && Math.min(d.diaDebito, ultimoDia.getDate()) === dia
      );
      
      // Gastos do dia a dia para este dia (comparar data)
      const extrasDoDia = despesasExtras.filter(d => {
        const dataDespesa = d.data ? lerData(d.data) : null;
        return !!dataDespesa && dataDespesa.dia === dia && dataDespesa.mes === mes + 1 && dataDespesa.ano === ano;
      });
      
      dias.push({
        dia,
        despesasFixas: fixasDoDia,
        despesasExtras: extrasDoDia,
        isHoje: hoje.getDate() === dia && hoje.getMonth() === mes && hoje.getFullYear() === ano,
        isDiaSalario: !!diaSalario && Math.min(diaSalario, ultimoDia.getDate()) === dia,
      });
    }
    
    setDiasCalendario(dias);
  }

  function abrirDetalhesDia(dia: DiaCalendario) {
    if (dia.despesasFixas.length > 0 || dia.despesasExtras.length > 0 || dia.isDiaSalario) {
      setDiaSelecionado(dia);
      setModalVisible(true);
    }
  }

  function mudarMes(delta: number) {
    setDataAtual(new Date(dataAtual.getFullYear(), dataAtual.getMonth() + delta, 1));
  }

  const totalDespesasNoDia = (dia: DiaCalendario) => {
    const totalFixas = dia.despesasFixas.reduce((sum, d) => sum + d.valor, 0);
    const totalExtras = dia.despesasExtras.reduce((sum, d) => sum + d.valor, 0);
    return totalFixas + totalExtras;
  };

  return (
    <Ecra
      cabecalho={
        <>
          <Header
            title={t('Calendário')}
            onMenuPress={() => setMenuVisible(true)}
            saldo={saldoDisponivel}
          />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldoDisponivel} />
        </>
      }
      sobreposicao={
        /* Modal de detalhes do dia */
        <Modal
          animationType="fade"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              {diaSelecionado && (
                <ScrollView>
                  <Text style={styles.modalTitulo}>
                    {t('{dia} de {mes}', { dia: diaSelecionado.dia, mes: meses[dataAtual.getMonth()] })}
                  </Text>

                  {/* Salário */}
                  {diaSelecionado.isDiaSalario && salarioConfig && (
                    <View style={styles.modalSecao}>
                      <TituloSecao titulo={t('Salário')} icone="cash-outline" cor={cores.positivo} />
                      <View style={styles.modalItem}>
                        <Text style={styles.modalItemTexto}>{t('Recebimento')}</Text>
                        <ValorEuro valor={parseValor(salarioConfig.valor)} prefixo="+" tipo="entrada" style={styles.modalItemValor} />
                      </View>
                    </View>
                  )}

                  {/* Despesas Fixas */}
                  {diaSelecionado.despesasFixas.length > 0 && (
                    <View style={styles.modalSecao}>
                      <TituloSecao titulo={t('Despesas Fixas')} icone="repeat-outline" cor={COR_FIXA} />
                      {diaSelecionado.despesasFixas.map(despesa => (
                        <View key={despesa.id} style={styles.modalItem}>
                          <Text style={styles.modalItemTexto}>{despesa.titulo}</Text>
                          <ValorEuro valor={despesa.valor} prefixo="-" tipo="saida" style={styles.modalItemValor} />
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Gastos do Dia a Dia */}
                  {diaSelecionado.despesasExtras.length > 0 && (
                    <View style={styles.modalSecao}>
                      <TituloSecao titulo={t('Gastos do Dia a Dia')} icone="nota:asas" cor={COR_EXTRA} />
                      {diaSelecionado.despesasExtras.map(despesa => (
                        <View key={despesa.id} style={styles.modalItem}>
                          <Text style={styles.modalItemTexto}>{despesa.titulo}</Text>
                          <ValorEuro valor={despesa.valor} prefixo="-" tipo="saida" style={styles.modalItemValor} />
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Total do dia */}
                  <View style={styles.modalTotal}>
                    <Text style={styles.modalTotalTexto}>{t('Total do Dia:')}</Text>
                    <Text style={[
                      styles.modalTotalValor,
                      totalDespesasNoDia(diaSelecionado) > 0 ? styles.modalTotalNeg : styles.modalTotalPos
                    ]}>
                      {diaSelecionado.isDiaSalario && salarioConfig
                        ? `+${(parseValor(salarioConfig.valor) - totalDespesasNoDia(diaSelecionado)).toFixed(2)} €`
                        : `-${totalDespesasNoDia(diaSelecionado).toFixed(2)} €`
                      }
                    </Text>
                  </View>

                  <Botao
                    variante="secundario"
                    titulo={t('Fechar')}
                    onPress={() => setModalVisible(false)}
                    style={styles.modalFechar}
                  />
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      }
    >
      <Separadores grupo="mes" />
      {/* Navegação do mês */}
      <View style={styles.mesContainer}>
        <Pressable
          onPress={() => mudarMes(-1)}
          style={({ pressed }) => [styles.mesButton, pressed && styles.mesButtonPremido]}
          accessibilityRole="button"
          accessibilityLabel={t('Mês anterior')}
        >
          <Ionicons name="chevron-back" size={22} color={cores.primaria} />
        </Pressable>
        <Text style={styles.mesTitulo} accessibilityRole="header">{t(meses[dataAtual.getMonth()])} {dataAtual.getFullYear()}</Text>
        <Pressable
          onPress={() => mudarMes(1)}
          style={({ pressed }) => [styles.mesButton, pressed && styles.mesButtonPremido]}
          accessibilityRole="button"
          accessibilityLabel={t('Mês seguinte')}
        >
          <Ionicons name="chevron-forward" size={22} color={cores.primaria} />
        </Pressable>
      </View>

      {/* Legenda */}
      <View style={styles.legendaContainer}>
        <View style={styles.legendaItem}>
          <View style={[styles.legendaCor, { backgroundColor: COR_FIXA }]} />
          <Text style={styles.legendaTexto}>{t('Despesa')}</Text>
        </View>
        <View style={styles.legendaItem}>
          <View style={[styles.legendaCor, { backgroundColor: COR_EXTRA }]} />
          <Text style={styles.legendaTexto}>{t('Extra')}</Text>
        </View>
        <View style={styles.legendaItem}>
          <View style={[styles.legendaCor, { backgroundColor: cores.positivo }]} />
          <Text style={styles.legendaTexto}>{t('Salário')}</Text>
        </View>
        <View style={styles.legendaItem}>
          <View style={[styles.legendaCor, styles.legendaHoje]} />
          <Text style={styles.legendaTexto}>{t('Hoje')}</Text>
        </View>
      </View>

      <Cartao style={styles.calendarioCartao}>
        {/* Dias da semana */}
        <View style={styles.diasSemana}>
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(dia => (
            <Text key={dia} style={styles.diaSemanaTexto}>{t(dia)}</Text>
          ))}
        </View>

        {/* Grid do calendário */}
        <View style={styles.calendarioGrid}>
          {/* Espaços vazios para alinhar com o dia da semana */}
          {Array.from({ length: new Date(dataAtual.getFullYear(), dataAtual.getMonth(), 1).getDay() }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.diaVazio} />
          ))}

          {diasCalendario.map((dia) => {
            const temDespesa = dia.despesasFixas.length > 0 || dia.despesasExtras.length > 0;
            const total = totalDespesasNoDia(dia);
            const infoDoDia =
              (temDespesa ? t(', despesas {total} euros', { total: total.toFixed(2) }) : '') +
              (dia.isDiaSalario ? t(', dia do salário') : '') +
              (dia.isHoje ? t(', hoje') : '');

            return (
              <View key={dia.dia} style={styles.diaVazio}>
                <Pressable
                  style={({ pressed }) => [
                    styles.diaCell,
                    temDespesa && styles.diaComDespesa,
                    dia.isDiaSalario && styles.diaSalario,
                    dia.isHoje && styles.diaHoje,
                    pressed && styles.diaPremido,
                  ]}
                  onPress={() => abrirDetalhesDia(dia)}
                  accessibilityRole="button"
                  accessibilityLabel={t('Dia {dia}{info}', { dia: dia.dia, info: infoDoDia })}
                >
                  <Text style={[
                    styles.diaNumero,
                    dia.isHoje && styles.diaHojeTexto,
                  ]}>{dia.dia}</Text>

                  {temDespesa && (
                    <Text style={styles.diaValor} numberOfLines={1}>-{total.toFixed(0)}€</Text>
                  )}

                  {dia.isDiaSalario && (
                    <Text style={styles.diaSalarioTexto} numberOfLines={1}>+{salarioConfig?.valor}€</Text>
                  )}

                  {/* Indicadores */}
                  <View style={styles.indicadores}>
                    {dia.despesasFixas.length > 0 && <View style={[styles.indicador, { backgroundColor: COR_FIXA }]} />}
                    {dia.despesasExtras.length > 0 && <View style={[styles.indicador, { backgroundColor: COR_EXTRA }]} />}
                    {dia.isDiaSalario && <View style={[styles.indicador, { backgroundColor: cores.positivo }]} />}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      </Cartao>
    </Ecra>
  );
}

const styles = StyleSheet.create({
  mesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: espaco.lg,
  },
  mesButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
  },
  mesButtonPremido: {
    backgroundColor: comAlfa(cores.primaria, 0.12),
  },
  mesTitulo: {
    ...tipografia.tituloEcra,
    fontSize: 20,
  },
  legendaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: espaco.lg,
    marginBottom: espaco.lg,
  },
  legendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendaCor: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendaHoje: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: cores.primaria,
  },
  legendaTexto: {
    ...tipografia.secundario,
    fontSize: 12,
  },
  calendarioCartao: {
    padding: espaco.xs,
  },
  diasSemana: {
    flexDirection: 'row',
    marginBottom: espaco.sm,
    marginTop: espaco.xs,
  },
  diaSemanaTexto: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontes.corpoForte,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: cores.textoSecundario,
  },
  calendarioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // Cada dia ocupa 1/7 da largura; a célula tem uma pequena margem para os dias não se colarem
  diaVazio: {
    width: '14.28%',
    aspectRatio: 1,
    padding: 1.5,
  },
  diaCell: {
    flex: 1,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.sm,
    paddingVertical: 2,
    paddingHorizontal: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  diaHoje: {
    borderColor: cores.primaria,
    borderWidth: 1.5,
    backgroundColor: comAlfa(cores.primaria, 0.12),
    boxShadow: brilho(cores.primaria, 0.45, 12),
  },
  diaComDespesa: {
    backgroundColor: comAlfa(cores.negativo, 0.08),
    borderColor: comAlfa(cores.negativo, 0.25),
  },
  diaSalario: {
    backgroundColor: comAlfa(cores.positivo, 0.1),
    borderColor: comAlfa(cores.positivo, 0.3),
  },
  diaPremido: {
    opacity: 0.7,
  },
  diaNumero: {
    fontFamily: fontes.numero,
    fontSize: 13,
    lineHeight: 15,
    color: cores.texto,
  },
  diaHojeTexto: {
    color: cores.primaria,
  },
  diaValor: {
    fontFamily: fontes.numero,
    fontSize: 10,
    lineHeight: 11,
    color: cores.negativo,
  },
  diaSalarioTexto: {
    fontFamily: fontes.numero,
    fontSize: 9,
    lineHeight: 10,
    color: cores.positivo,
  },
  // Os pontos ficam no canto (em coluna) para caberem com os valores nas células pequenas dos telemóveis
  indicadores: {
    position: 'absolute',
    top: 4,
    right: 3,
    gap: 2,
  },
  indicador: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: cores.sobreposicao,
    justifyContent: 'center',
    alignItems: 'center',
    padding: espaco.xl,
  },
  modalContent: {
    backgroundColor: cores.superficieSolida,
    borderWidth: 1,
    borderColor: cores.bordaForte,
    borderRadius: raio.xl,
    padding: espaco.xl,
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    boxShadow: `${sombras.cartao}, ${brilho(cores.primaria, 0.12, 40)}`,
  },
  modalTitulo: {
    ...tipografia.tituloEcra,
    fontSize: 20,
    textAlign: 'center',
    marginBottom: espaco.xl,
  },
  modalSecao: {
    marginBottom: espaco.lg,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: espaco.sm,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
    gap: espaco.md,
  },
  modalItemTexto: {
    ...tipografia.corpo,
    fontSize: 14,
    flex: 1,
  },
  modalItemValor: {
    fontSize: 14,
  },
  modalTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: espaco.lg,
    marginTop: espaco.sm,
    borderTopWidth: 1,
    borderTopColor: cores.bordaForte,
  },
  modalTotalTexto: {
    ...tipografia.tituloCartao,
  },
  modalTotalValor: {
    fontFamily: fontes.numeroForte,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  modalTotalNeg: {
    color: cores.negativo,
  },
  modalTotalPos: {
    color: cores.positivo,
  },
  modalFechar: {
    marginTop: espaco.xl,
  },
});
