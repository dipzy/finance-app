import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { Header } from '../../components/Header';
import { DivisaoGrupo, type EstadoDivisao } from '../../components/partilhado/DivisaoGrupo';
import { SideMenu } from '../../components/SideMenu';
import { Separadores } from '../../components/Separadores';
import { Botao, CampoTexto, Cartao, CartaoSaldo, Chip, Ecra, TituloSecao, ValorEuro } from '../../components/ui';
import { acentosFolha, cores, espaco, fontes, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { t, useT } from '../../i18n';
import { calcularSaldoDisponivel, Despesa, DespesasFixasDB, eAnual } from '../../services/database';
import { mensagemDaApi } from '../../services/grupos';
import { reagendarNotificacoes } from '../../services/notificacoes';
import { mostrarAlerta, parseValor } from '../../utils/helpers';
import { mesmaDivisao } from '../../utils/partilhado';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
// O acento das despesas anuais: o verde do bloco "Anual" da folha
const COR = acentosFolha.anual;

function confirmar(titulo: string, mensagem: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${titulo}\n\n${mensagem}`));
  return new Promise((resolve) =>
    Alert.alert(t(titulo), t(mensagem), [
      { text: t('Cancelar'), style: 'cancel', onPress: () => resolve(false) },
      { text: t('Confirmar'), style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}

// Escolha do mês do ano (1-12) em botões
function EscolherMes({ valor, onChange }: { valor?: number; onChange: (mes: number) => void }) {
  const t = useT();
  return (
    <View style={styles.meses}>
      {MESES.map((nome, i) => (
        <Chip key={nome} rotulo={t(nome)} onPress={() => onChange(i + 1)} ativo={valor === i + 1} cor={COR} style={styles.mesBotao} />
      ))}
    </View>
  );
}

// Despesas anuais (seguro do carro, Via Verde, quotas...): repetem-se uma vez por ano, no mês escolhido.
// Nesse mês aparecem nas Despesas Fixas para pagar (e são debitadas no dia, como as outras)
export default function AnuaisScreen() {
  const t = useT();
  const [menuVisible, setMenuVisible] = useState(false);
  const [anuais, setAnuais] = useState<Despesa[]>([]);
  const [saldo, setSaldo] = useState(0);
  const [aEditar, setAEditar] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [valor, setValor] = useState('');
  const [mesAnual, setMesAnual] = useState<number | undefined>(undefined);
  const [dia, setDia] = useState('');
  // Dividir com um grupo; a chave muda ao abrir outra despesa (ou depois de guardar) para o seletor recomeçar
  const [divisao, setDivisao] = useState<EstadoDivisao>({ divisao: null, erro: null, minhaParte: null });
  const [chaveDivisao, setChaveDivisao] = useState(0);
  const { user } = useAuth();

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [user])
  );

  async function carregar() {
    if (!user?.id) return;
    try {
      const [disponivel, fixas] = await Promise.all([calcularSaldoDisponivel(user.id), DespesasFixasDB.getAll(user.id)]);
      setSaldo(disponivel);
      setAnuais(fixas.filter((f) => eAnual(f) && !f.fim).sort((a, b) => (a.mesAnual ?? 13) - (b.mesAnual ?? 13)));
    } catch (error) {
      console.error('Erro ao carregar despesas anuais:', error);
    }
  }

  function limparFormulario() {
    setAEditar(null);
    setTitulo('');
    setValor('');
    setMesAnual(undefined);
    setDia('');
    setChaveDivisao((c) => c + 1);
  }

  function editar(despesa: Despesa) {
    setAEditar(despesa.id);
    setTitulo(despesa.titulo);
    // Dividida: o que se edita é o total (o valor da despesa é só a parte de quem paga)
    setValor(String(despesa.valorTotal ?? despesa.valor));
    setMesAnual(despesa.mesAnual);
    setDia(despesa.diaDebito ? String(despesa.diaDebito) : '');
    setChaveDivisao((c) => c + 1);
  }

  async function guardar() {
    if (!user?.id) return;
    const valorNum = parseValor(valor);
    const diaNum = dia.trim() ? parseInt(dia, 10) : undefined;
    if (!titulo.trim() || valorNum <= 0) {
      mostrarAlerta(t('Erro'), t('Preenche o título e o valor'));
      return;
    }
    if (!mesAnual) {
      mostrarAlerta(t('Erro'), t('Escolhe o mês em que se paga'));
      return;
    }
    if (diaNum !== undefined && (isNaN(diaNum) || diaNum < 1 || diaNum > 31)) {
      mostrarAlerta(t('Erro'), t('O dia de débito deve ser entre 1 e 31 (ou fica vazio para pagar à mão)'));
      return;
    }
    if (divisao.erro) {
      mostrarAlerta(t('Erro'), divisao.erro);
      return;
    }
    try {
      const campos = { titulo: titulo.trim(), valor: valorNum, mesAnual, diaDebito: diaNum, periodicidade: 'anual' as const };
      if (aEditar) {
        // A chave "divisao" só vai se mudou (com undefined, deixa de dividir)
        const original = anuais.find((d) => d.id === aEditar);
        await DespesasFixasDB.update(
          user.id,
          aEditar,
          mesmaDivisao(divisao.divisao, original?.divisao) ? campos : { ...campos, divisao: divisao.divisao ?? undefined }
        );
      } else {
        await DespesasFixasDB.add(user.id, { ...campos, divisao: divisao.divisao ?? undefined });
      }
      limparFormulario();
      reagendarNotificacoes();
      await carregar();
    } catch (error) {
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível guardar a despesa anual.')));
    }
  }

  async function terminar(despesa: Despesa) {
    if (!user?.id) return;
    if (!(await confirmar(t('Terminar despesa anual'), t('"{titulo}" deixa de contar nos próximos anos. O que já foi pago fica no histórico.', { titulo: despesa.titulo })))) return;
    try {
      await DespesasFixasDB.terminar(user.id, despesa.id);
      reagendarNotificacoes();
      if (aEditar === despesa.id) limparFormulario();
      await carregar();
    } catch (error) {
      mostrarAlerta(t('Erro'), t('Não foi possível terminar a despesa.'));
    }
  }

  const total = anuais.reduce((s, d) => s + d.valor, 0);

  // Os campos da despesa: no formulário e no topo da janela de dividir num grupo
  const camposDespesa = (
    <>
      <CampoTexto placeholder={t('Título (ex: Seguro do carro)')} value={titulo} onChangeText={setTitulo} />
      <CampoTexto placeholder={t('Valor (€)')} keyboardType="numeric" value={valor} onChangeText={setValor} />
      <Text style={styles.label}>{t('Mês em que se paga')}</Text>
      <EscolherMes valor={mesAnual} onChange={setMesAnual} />
      <CampoTexto
        placeholder={t('Dia de débito (vazio = pagas à mão)')}
        keyboardType="numeric"
        maxLength={2}
        value={dia}
        onChangeText={setDia}
      />
    </>
  );

  return (
    <Ecra
      cabecalho={
        <>
          <Header title={t('Despesas Anuais')} onMenuPress={() => setMenuVisible(true)} saldo={saldo} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldo} />
        </>
      }
    >
      <Separadores grupo="compromissos" />
      <CartaoSaldo
        variante="positivo"
        alertaNegativo={false}
        rotulo={t('Total por ano')}
        valor={total}
        icone="calendar-number-outline"
        subtitulo={t('≈ {valor} € por mês, se fores pondo de parte', { valor: (total / 12).toFixed(2) })}
        style={styles.totalCard}
      />

      {anuais.map((d) => (
        <Cartao key={d.id} ativo={aEditar === d.id} acento={COR} onPress={() => editar(d)} style={styles.item}>
          <View style={styles.itemLinha}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemTitulo}>{d.titulo}</Text>
              <View style={styles.itemMesLinha}>
                <Ionicons
                  name={d.mesAnual ? 'calendar-outline' : 'warning-outline'}
                  size={14}
                  color={d.mesAnual ? cores.textoSecundario : cores.aviso}
                />
                <Text style={[styles.itemMes, !d.mesAnual && styles.semMes]}>
                  {d.mesAnual
                    ? t(MESES[d.mesAnual - 1]) + (d.diaDebito ? t(', dia {dia}', { dia: d.diaDebito }) : '')
                    : t('Escolhe o mês em que se paga')}
                </Text>
              </View>
            </View>
            <ValorEuro valor={d.valor} cor={COR} style={styles.itemValor} />
          </View>
        </Cartao>
      ))}

      {anuais.length === 0 && <Text style={styles.vazio}>{t('Sem despesas anuais')}</Text>}

      <Cartao style={styles.card}>
        <TituloSecao
          titulo={aEditar ? t('Editar despesa anual') : t('Nova despesa anual')}
          icone={aEditar ? 'create-outline' : 'add-circle-outline'}
          cor={COR}
        />
        {camposDespesa}
        <DivisaoGrupo
          campos={camposDespesa}
          key={chaveDivisao}
          total={parseValor(valor)}
          inicial={aEditar ? (anuais.find((d) => d.id === aEditar)?.divisao ?? null) : null}
          onChange={setDivisao}
        />
        <Botao titulo={aEditar ? t('Guardar') : t('Adicionar')} icone={aEditar ? 'checkmark' : 'add'} onPress={guardar} />
        {aEditar && (
          <View style={styles.linhaBotoes}>
            <Botao variante="fantasma" titulo={t('Cancelar')} onPress={limparFormulario} style={styles.botaoLinha} />
            <Botao
              variante="perigo"
              titulo={t('Terminar despesa')}
              icone="stop-circle-outline"
              onPress={() => terminar(anuais.find((d) => d.id === aEditar)!)}
              style={styles.botaoLinha}
            />
          </View>
        )}
      </Cartao>
    </Ecra>
  );
}

const styles = StyleSheet.create({
  totalCard: { marginBottom: espaco.lg },
  item: { paddingVertical: espaco.md + 2, marginBottom: espaco.sm },
  itemLinha: { flexDirection: 'row', alignItems: 'center' },
  itemInfo: { flex: 1, marginRight: espaco.sm },
  itemTitulo: { ...tipografia.corpoMedio, fontSize: 16 },
  itemMesLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: espaco.xs },
  itemMes: { ...tipografia.secundario, fontSize: 13 },
  semMes: { color: cores.aviso },
  itemValor: { fontFamily: fontes.numeroForte, fontSize: 16 },
  vazio: { ...tipografia.secundario, textAlign: 'center', fontStyle: 'italic', padding: espaco.xl },
  card: { marginTop: espaco.sm },
  label: { ...tipografia.rotulo, fontSize: 11, marginBottom: 6 },
  meses: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: espaco.md },
  mesBotao: { minWidth: 52, paddingHorizontal: espaco.sm },
  linhaBotoes: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm, marginTop: espaco.sm },
  botaoLinha: { flexGrow: 1 },
});
