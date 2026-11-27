import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { ModalFormulario } from '../../components/ModalFormulario';
import { Header } from '../../components/Header';
import { EstadoEnvioPoupanca } from '../../components/PoupancasPorEnviar';
import { RendimentoPoupanca } from '../../components/RendimentoPoupanca';
import { SideMenu } from '../../components/SideMenu';
import { Separadores } from '../../components/Separadores';
import { Botao, CampoTexto, Cartao, CartaoSaldo, Chip, Ecra, TituloSecao, ValorEuro } from '../../components/ui';
import { acentosFolha, comAlfa, cores, esquemaAplicado, espaco, fontes, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { t, useT } from '../../i18n';
import {
  calcularSaldoDisponivel,
  contribuicaoDe,
  FinancialDB,
  mesAtual,
  Poupanca,
  PoupancasDB,
  SalarioDB,
  valorSalarioBase,
} from '../../services/database';
import { mostrarAlerta, parseValor } from '../../utils/helpers';
import { projetarTotal } from '../../utils/rendimento';

// O acento das poupanças: o dourado dos blocos "Poupança" e "Saldo Poupança" da folha
const COR = acentosFolha.poupanca;
// Interruptor % / €: ciano na percentagem, menta no valor fixo (as duas opções são válidas, nenhuma é "desligada")
const TRILHO_TIPO = { false: comAlfa(cores.primaria, 0.5), true: comAlfa(cores.positivo, 0.5) };

// Confirmação antes de remover (web: window.confirm; telemóvel: alerta com botões)
function confirmarRemocao(nome: string): Promise<boolean> {
  const mensagem = t('Remover a poupança "{nome}"? O saldo dela deixa de aparecer na app (o dinheiro não volta à conta).', { nome });
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(mensagem));
  return new Promise((resolve) =>
    Alert.alert(t('Remover poupança'), mensagem, [
      { text: t('Cancelar'), style: 'cancel', onPress: () => resolve(false) },
      { text: t('Remover'), style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}

// Poupanças: para onde vai parte do salário todos os meses (Revolut/C.A, PPR, Trade Republic...).
// No dia do salário a contribuição de cada uma sai da conta corrente e soma-se ao saldo dela
export default function PoupancasScreen() {
  const t = useT();
  const [menuVisible, setMenuVisible] = useState(false);
  const [poupancas, setPoupancas] = useState<Poupanca[]>([]);
  const [salario, setSalario] = useState(0);
  const [diaSalario, setDiaSalario] = useState(1);
  const [saldoConta, setSaldoConta] = useState(0);
  // Movimento escrito em cada poupança (reforçar / levantar)
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [movimentos, setMovimentos] = useState<Record<string, string>>({});
  const [novoNome, setNovoNome] = useState('');
  const [novoTipo, setNovoTipo] = useState<Poupanca['tipo']>('valor');
  const [novoValor, setNovoValor] = useState('');
  const [novoSaldo, setNovoSaldo] = useState('');
  const [novoContribuicaoAutomatica, setNovoContribuicaoAutomatica] = useState(true);
  const [novoDiaContribuicao, setNovoDiaContribuicao] = useState<number | undefined>();
  const [contribuicaoEmCurso, setContribuicaoEmCurso] = useState<Record<string, boolean>>({});
  const { user } = useAuth();

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [user])
  );

  async function carregar() {
    if (!user?.id) return;
    try {
      // Primeiro o saldo: também converte a configuração antiga de PPR/Poupança nesta lista
      const saldo = await calcularSaldoDisponivel(user.id);
      const [lista, salarioConfig, financial] = await Promise.all([
        PoupancasDB.getAll(user.id),
        SalarioDB.getConfig(user.id),
        FinancialDB.load(user.id),
      ]);
      setSaldoConta(saldo);
      setPoupancas(lista);
      setSalario(valorSalarioBase(salarioConfig, financial));
      setDiaSalario(salarioConfig?.diaRecebimento ?? 1);
    } catch (error) {
      console.error('Erro ao carregar poupanças:', error);
    }
  }

  // Muda logo no ecrã; grava ao sair do campo (ou logo, no caso do interruptor %/€)
  function alterarLocal(id: string, campos: Partial<Poupanca>) {
    setPoupancas((atuais) => atuais.map((p) => (p.id === id ? { ...p, ...campos } : p)));
  }

  async function gravar(
    id: string,
    campos: Partial<Pick<Poupanca, 'nome' | 'tipo' | 'valor' | 'contribuicaoAutomatica' | 'diaContribuicao' | 'contarNoPrevisto'>>
  ) {
    if (!user?.id) return;
    try {
      await PoupancasDB.update(user.id, id, campos);
    } catch (error) {
      mostrarAlerta(t('Erro'), t('Não foi possível guardar a poupança.'));
    }
  }

  // Taxa, imposto e juros automáticos: depois de guardar volta a ler, porque o servidor calcula campos novos
  // (juros por mês, desde quando contam...)
  async function gravarRendimento(id: string, campos: Partial<Pick<Poupanca, 'taxaAnual' | 'retencao' | 'jurosAutomaticos'>>) {
    if (!user?.id) return;
    try {
      await PoupancasDB.update(user.id, id, campos);
      await carregar();
    } catch (error) {
      mostrarAlerta(t('Erro'), error instanceof Error ? error.message : t('Não foi possível guardar a poupança.'));
      await carregar();
    }
  }

  async function contribuirEsteMes(poupanca: Poupanca) {
    if (!user?.id || contribuicaoEmCurso[poupanca.id]) return;
    setContribuicaoEmCurso((atual) => ({ ...atual, [poupanca.id]: true }));
    try {
      const resultado = await PoupancasDB.contribuirManualmente(user.id, poupanca.id);
      if (resultado === 'saldo-insuficiente') {
        mostrarAlerta(t('Saldo insuficiente'), t('Não tens saldo suficiente na conta para fazer esta contribuição.'));
        return;
      }
      await carregar();
    } catch (error) {
      console.error('Erro ao adicionar contribuição manual:', error);
      mostrarAlerta(t('Erro'), t('Não foi possível registar a contribuição deste mês.'));
    } finally {
      setContribuicaoEmCurso(({ [poupanca.id]: _terminado, ...resto }) => resto);
    }
  }

  async function movimentar(poupanca: Poupanca, tipo: 'reforcar' | 'levantar') {
    if (!user?.id) return;
    const valor = parseValor(movimentos[poupanca.id]);
    if (valor <= 0) {
      mostrarAlerta(t('Erro'), t('Escreve um valor maior do que zero'));
      return;
    }
    try {
      if (tipo === 'reforcar') {
        if (valor > saldoConta) {
          mostrarAlerta(t('Saldo insuficiente'), t('Não tens esse valor na conta corrente.'));
          return;
        }
        await PoupancasDB.transferirDaConta(user.id, poupanca.id, valor);
      } else {
        if (valor > poupanca.saldo) {
          mostrarAlerta(t('Erro'), t('A poupança não tem esse valor.'));
          return;
        }
        // Volta para a conta corrente
        await PoupancasDB.transferirDaConta(user.id, poupanca.id, -valor);
      }
      setMovimentos((m) => ({ ...m, [poupanca.id]: '' }));
      await carregar();
    } catch (error) {
      mostrarAlerta(t('Erro'), t('Não foi possível fazer o movimento.'));
    }
  }

  async function remover(poupanca: Poupanca) {
    if (!user?.id || !(await confirmarRemocao(poupanca.nome))) return;
    try {
      await PoupancasDB.remove(user.id, poupanca.id);
      setAbertaId(null);
      await carregar();
    } catch (error) {
      mostrarAlerta(t('Erro'), t('Não foi possível remover a poupança.'));
    }
  }

  async function adicionar() {
    if (!user?.id) return;
    if (!novoNome.trim()) {
      mostrarAlerta(t('Erro'), t('Escreve o nome da poupança'));
      return;
    }
    try {
      await PoupancasDB.add(user.id, {
        nome: novoNome.trim(),
        tipo: novoTipo,
        valor: String(parseValor(novoValor)),
        saldo: parseValor(novoSaldo),
        contribuicaoAutomatica: novoContribuicaoAutomatica,
        diaContribuicao: novoContribuicaoAutomatica ? novoDiaContribuicao : undefined,
      });
      setNovoNome('');
      setNovoValor('');
      setNovoSaldo('');
      setNovoContribuicaoAutomatica(true);
      setNovoDiaContribuicao(undefined);
      await carregar();
    } catch (error) {
      mostrarAlerta(t('Erro'), t('Não foi possível criar a poupança.'));
    }
  }

  const poupancaAberta = poupancas.find((p) => p.id === abertaId) ?? null;
  const totalSaldo = poupancas.reduce((s, p) => s + p.saldo, 0);
  // O que valem todas as poupanças daqui a 6 meses e a 1 ano (com os juros e as contribuições mensais)
  const aos6Meses = projetarTotal(poupancas, (p) => contribuicaoDe(p, salario), 6);
  const aoAno = projetarTotal(poupancas, (p) => contribuicaoDe(p, salario), 12);
  const totalJurosMes = poupancas.reduce((s, p) => s + (p.jurosMes ?? 0), 0);
  const totalMensal = poupancas
    .filter((p) => p.contribuicaoAutomatica ?? true)
    .reduce((s, p) => s + contribuicaoDe(p, salario), 0);

  // O detalhe de uma poupança abre numa janela (a lista fica só com o nome e o saldo)
  const detalhePoupanca = (p: Poupanca) => (
    <>
          <View style={styles.cardHeader}>
            <TextInput
              style={styles.nomeInput}
              value={p.nome}
              onChangeText={(nome) => alterarLocal(p.id, { nome })}
              onBlur={() => p.nome.trim() && gravar(p.id, { nome: p.nome.trim() })}
              placeholderTextColor={cores.textoMudo}
              keyboardAppearance={esquemaAplicado === 'claro' ? 'light' : 'dark'}
              selectionColor={comAlfa(cores.primaria, 0.4)}
              cursorColor={cores.primaria}
              accessibilityLabel={t('Nome da poupança')}
            />
            <View style={styles.tipoContainer}>
              <Text style={[styles.tipoLabel, p.tipo === 'percentagem' && styles.tipoAtivo]}>%</Text>
              <Switch
                value={p.tipo === 'valor'}
                onValueChange={(valorFixo) => {
                  const tipo: Poupanca['tipo'] = valorFixo ? 'valor' : 'percentagem';
                  alterarLocal(p.id, { tipo });
                  gravar(p.id, { tipo });
                }}
                trackColor={TRILHO_TIPO}
                thumbColor={cores.texto}
                accessibilityLabel={t('Valor fixo em euros (desligado: percentagem do salário)')}
              />
              <Text style={[styles.tipoLabel, p.tipo === 'valor' && styles.tipoAtivo]}>€</Text>
            </View>
          </View>

          <Text style={styles.inputLabel}>{t('Contribuição')}</Text>
          <View style={styles.modoContribuicao}>
            <Chip
              rotulo={t('Automática')}
              ativo={p.contribuicaoAutomatica ?? true}
              onPress={() => {
                const campos = { contribuicaoAutomatica: true };
                alterarLocal(p.id, campos);
                gravar(p.id, campos);
              }}
            />
            <Chip
              rotulo={t('Manual')}
              ativo={!(p.contribuicaoAutomatica ?? true)}
              onPress={() => {
                const campos = { contribuicaoAutomatica: false };
                alterarLocal(p.id, campos);
                gravar(p.id, campos);
              }}
            />
          </View>

          {(p.contribuicaoAutomatica ?? true) ? (
            <>
              <Text style={styles.inputLabel}>{t('Dia da contribuição automática')}</Text>
              <View style={styles.modoContribuicao}>
                <Chip
                  rotulo={t('Dia do salário')}
                  ativo={p.diaContribuicao == null}
                  onPress={() => {
                    const campos = { diaContribuicao: undefined };
                    alterarLocal(p.id, campos);
                    gravar(p.id, campos);
                  }}
                />
                <Chip
                  rotulo={t('Dia fixo')}
                  ativo={p.diaContribuicao != null}
                  onPress={() => {
                    if (p.diaContribuicao != null) return;
                    const campos = { diaContribuicao: diaSalario };
                    alterarLocal(p.id, campos);
                    gravar(p.id, campos);
                  }}
                />
              </View>
              {p.diaContribuicao != null && (
                <CampoTexto
                  rotulo={t('Dia do mês (1-31)')}
                  keyboardType="numeric"
                  value={String(p.diaContribuicao)}
                  onChangeText={(texto) => {
                    if (!/^\d{1,2}$/.test(texto)) return;
                    const dia = Number(texto);
                    if (dia >= 1 && dia <= 31) alterarLocal(p.id, { diaContribuicao: dia });
                  }}
                  onBlur={() => gravar(p.id, { diaContribuicao: p.diaContribuicao })}
                  maxLength={2}
                  accessibilityLabel={t('Dia fixo da contribuição, de 1 a 31')}
                />
              )}
            </>
          ) : (
            <>
              {/* "Por enviar este mês" ou "Enviada dd/mm" */}
              <EstadoEnvioPoupanca poupanca={p} />
              <Botao
                variante="secundario"
                pequeno
                titulo={p.ultimaContribuicaoMes === mesAtual() ? t('Adicionada este mês') : t('Adicionar este mês')}
                icone={p.ultimaContribuicaoMes === mesAtual() ? 'checkmark-circle-outline' : 'add-circle-outline'}
                onPress={() => contribuirEsteMes(p)}
                aCarregar={!!contribuicaoEmCurso[p.id]}
                desativado={p.ultimaContribuicaoMes === mesAtual() || !!contribuicaoEmCurso[p.id]}
                style={styles.botaoContribuicao}
              />
              {/* Enquanto não for enviada, sai do Saldo Previsto e da previsão do fim do mês */}
              <View style={styles.contarNoPrevisto}>
                <View style={styles.contarNoPrevistoTextos}>
                  <Text style={styles.inputLabel}>{t('Contar no previsto')}</Text>
                  <Text style={styles.contarNoPrevistoNota}>{t('Enquanto não for enviada, sai do saldo previsto')}</Text>
                </View>
                <Switch
                  value={p.contarNoPrevisto ?? true}
                  onValueChange={(contarNoPrevisto) => {
                    alterarLocal(p.id, { contarNoPrevisto });
                    gravar(p.id, { contarNoPrevisto });
                  }}
                  trackColor={TRILHO_TIPO}
                  thumbColor={cores.texto}
                  accessibilityLabel={t('Contar no previsto')}
                />
              </View>
            </>
          )}
          {p.ultimaContribuicaoMes === mesAtual() && (p.contribuicaoAutomatica ?? true) && (
            <Text style={styles.contribuicaoFeita}>{t('Contribuição feita este mês')}</Text>
          )}

          <Text style={styles.inputLabel}>
            {p.tipo === 'percentagem' ? t('Percentagem do salário por mês') : t('Valor fixo por mês')}
          </Text>
          <View style={styles.inputRow}>
            <CampoTexto
              estiloCaixa={styles.caixaInput}
              style={styles.input}
              keyboardType="numeric"
              value={p.valor}
              onChangeText={(valor) => alterarLocal(p.id, { valor })}
              onBlur={() => gravar(p.id, { valor: p.valor })}
              placeholder="0"
            />
            <Text style={styles.inputSuffix}>{p.tipo === 'percentagem' ? '%' : '€'}</Text>
            <Text style={styles.calculado}>{t('= {valor} €/mês', { valor: contribuicaoDe(p, salario).toFixed(2) })}</Text>
          </View>

          <View style={styles.saldoLinha}>
            <Text style={styles.saldoLabel}>{t('Saldo')}</Text>
            <ValorEuro valor={p.saldo} cor={COR} style={styles.saldoValor} />
          </View>

          <RendimentoPoupanca key={p.id} poupanca={p} onGravar={(campos) => gravarRendimento(p.id, campos)} />

          <CampoTexto
            keyboardType="numeric"
            value={movimentos[p.id] ?? ''}
            onChangeText={(texto) => setMovimentos((m) => ({ ...m, [p.id]: texto }))}
            placeholder={t('Valor (€)')}
            estiloCaixa={styles.caixaMovimento}
          />
          <View style={styles.botoes}>
            <Botao
              variante="secundario"
              pequeno
              cor={cores.positivo}
              titulo={t('Reforçar da conta')}
              onPress={() => movimentar(p, 'reforcar')}
              style={styles.botao}
            />
            <Botao
              variante="secundario"
              pequeno
              cor={cores.aviso}
              titulo={t('Levantar p/ conta')}
              onPress={() => movimentar(p, 'levantar')}
              style={styles.botao}
            />
          </View>
          <Botao
            variante="fantasma"
            pequeno
            cor={cores.negativo}
            icone="trash-outline"
            titulo={t('Remover poupança')}
            onPress={() => remover(p)}
            style={styles.remover}
          />
    </>
  );

  return (
    <Ecra
      cabecalho={
        <>
          <Header title={t('Poupanças')} onMenuPress={() => setMenuVisible(true)} saldo={saldoConta} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldoConta} />
        </>
      }
    >
      <Separadores grupo="planeamento" />
      <CartaoSaldo
        variante="aviso"
        alertaNegativo={false}
        rotulo={t('Total poupado')}
        valor={totalSaldo}
        icone="trending-up-outline"
        subtitulo={
          t('Contribuições automáticas: {valor} € / mês', { valor: totalMensal.toFixed(2) }) +
          (totalJurosMes > 0 ? ` · ${t('Rendem cerca de {valor} € / mês', { valor: totalJurosMes.toFixed(2) })}` : '')
        }
        style={styles.resumoCard}
      >
        {poupancas.length > 0 && (
          <>
            <View style={styles.previsao}>
              <View style={styles.previsaoCol}>
                <Text style={styles.previsaoRotulo}>{t('Daqui a 6 meses')}</Text>
                <ValorEuro valor={aos6Meses.saldoFinal} cor={COR} style={styles.previsaoValor} />
              </View>
              <View style={styles.previsaoCol}>
                <Text style={styles.previsaoRotulo}>{t('Daqui a 1 ano')}</Text>
                <ValorEuro valor={aoAno.saldoFinal} cor={COR} style={styles.previsaoValor} />
              </View>
            </View>
            <Text style={styles.previsaoNota}>
              {t('Estimativa com as taxas e contribuições mensais que indicaste (juros em 1 ano: +{juros} €)', { juros: aoAno.juros.toFixed(2) })}
            </Text>
          </>
        )}
      </CartaoSaldo>

      {poupancas.map((p) => (
        <Pressable key={p.id} onPress={() => setAbertaId(p.id)} accessibilityRole="button" accessibilityLabel={p.nome}>
          <Cartao acento={COR}>
            <View style={styles.linhaPoupanca}>
              <Text style={styles.nomePoupanca} numberOfLines={1}>
                {p.nome}
              </Text>
              <ValorEuro valor={p.saldo} cor={COR} style={styles.saldoValor} />
              <Ionicons name="chevron-forward" size={18} color={cores.textoMudo} />
            </View>
          </Cartao>
        </Pressable>
      ))}

      <ModalFormulario visivel={!!poupancaAberta} titulo={poupancaAberta?.nome ?? ''} onFechar={() => setAbertaId(null)}>
        {poupancaAberta && detalhePoupanca(poupancaAberta)}
        <Botao titulo={t('Fechar')} variante="secundario" onPress={() => setAbertaId(null)} />
      </ModalFormulario>

      {poupancas.length === 0 ? (
        <Text style={styles.vazio}>{t('Ainda não tens poupanças. Adiciona a primeira abaixo.')}</Text>
      ) : (
        <Text style={styles.ajuda}>{t('Reforçar e levantar mexem na conta corrente.')}</Text>
      )}

      {/* Nova poupança */}
      <Cartao>
        <TituloSecao titulo={t('Nova poupança')} icone="add-circle-outline" cor={COR} />
        <CampoTexto placeholder={t('Nome (ex: Revolut, PPR, Trade Republic)')} value={novoNome} onChangeText={setNovoNome} />
        <View style={[styles.tipoContainer, styles.tipoNovo]}>
          <Text style={[styles.tipoLabel, novoTipo === 'percentagem' && styles.tipoAtivo]}>{t('% do salário')}</Text>
          <Switch
            value={novoTipo === 'valor'}
            onValueChange={(valorFixo) => setNovoTipo(valorFixo ? 'valor' : 'percentagem')}
            trackColor={TRILHO_TIPO}
            thumbColor={cores.texto}
            accessibilityLabel={t('Valor fixo em euros (desligado: percentagem do salário)')}
          />
          <Text style={[styles.tipoLabel, novoTipo === 'valor' && styles.tipoAtivo]}>{t('Valor fixo')}</Text>
        </View>
        <Text style={styles.inputLabel}>{t('Contribuição')}</Text>
        <View style={styles.modoContribuicao}>
          <Chip rotulo={t('Automática')} ativo={novoContribuicaoAutomatica} onPress={() => setNovoContribuicaoAutomatica(true)} />
          <Chip rotulo={t('Manual')} ativo={!novoContribuicaoAutomatica} onPress={() => setNovoContribuicaoAutomatica(false)} />
        </View>
        {novoContribuicaoAutomatica && (
          <>
            <Text style={styles.inputLabel}>{t('Dia da contribuição automática')}</Text>
            <View style={styles.modoContribuicao}>
              <Chip rotulo={t('Dia do salário')} ativo={novoDiaContribuicao == null} onPress={() => setNovoDiaContribuicao(undefined)} />
              <Chip
                rotulo={t('Dia fixo')}
                ativo={novoDiaContribuicao != null}
                onPress={() => setNovoDiaContribuicao((dia) => dia ?? diaSalario)}
              />
            </View>
            {novoDiaContribuicao != null && (
              <CampoTexto
                rotulo={t('Dia do mês (1-31)')}
                keyboardType="numeric"
                value={String(novoDiaContribuicao)}
                onChangeText={(texto) => {
                  if (!/^\d{1,2}$/.test(texto)) return;
                  const dia = Number(texto);
                  if (dia >= 1 && dia <= 31) setNovoDiaContribuicao(dia);
                }}
                maxLength={2}
                accessibilityLabel={t('Dia fixo da contribuição, de 1 a 31')}
              />
            )}
          </>
        )}
        <CampoTexto
          keyboardType="numeric"
          placeholder={novoTipo === 'percentagem' ? t('Contribuição mensal (%)') : t('Contribuição mensal (€)')}
          value={novoValor}
          onChangeText={setNovoValor}
        />
        <CampoTexto keyboardType="numeric" placeholder={t('Saldo atual (€)')} value={novoSaldo} onChangeText={setNovoSaldo} />
        <Botao titulo={t('Adicionar')} icone="add" onPress={adicionar} />
      </Cartao>
    </Ecra>
  );
}

const styles = StyleSheet.create({
  resumoCard: {
    marginBottom: espaco.lg,
  },
  previsao: {
    flexDirection: 'row',
    gap: espaco.md,
    marginTop: espaco.md,
    paddingTop: espaco.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.borda,
    alignSelf: 'stretch',
  },
  previsaoCol: { flex: 1, alignItems: 'center' },
  previsaoRotulo: { ...tipografia.nota, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10 },
  previsaoValor: { fontSize: 17 },
  previsaoNota: { ...tipografia.nota, textAlign: 'center', marginTop: espaco.sm },
  linhaPoupanca: { flexDirection: 'row', alignItems: 'center', gap: espaco.md },
  nomePoupanca: { flex: 1, fontFamily: fontes.corpoForte, color: cores.texto, fontSize: 16 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: espaco.sm,
  },
  nomeInput: {
    flex: 1,
    fontFamily: fontes.tituloMedio,
    fontSize: 17,
    color: cores.texto,
    borderBottomWidth: 1,
    borderBottomColor: cores.bordaForte,
    paddingVertical: 6,
    minHeight: 44,
    marginRight: espaco.sm,
    outlineWidth: 0,
  },
  tipoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tipoNovo: {
    marginBottom: espaco.md,
  },
  modoContribuicao: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
    marginBottom: espaco.md,
  },
  botaoContribuicao: {
    alignSelf: 'flex-start',
    marginBottom: espaco.md,
  },
  contribuicaoFeita: {
    ...tipografia.nota,
    color: cores.positivo,
    marginBottom: espaco.md,
  },
  contarNoPrevisto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    marginBottom: espaco.md,
  },
  contarNoPrevistoTextos: {
    flex: 1,
  },
  contarNoPrevistoNota: {
    ...tipografia.nota,
    color: cores.textoMudo,
  },
  tipoLabel: {
    fontFamily: fontes.corpoForte,
    fontSize: 14,
    color: cores.textoMudo,
  },
  tipoAtivo: {
    color: cores.texto,
  },
  inputLabel: {
    ...tipografia.rotulo,
    fontSize: 11,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    marginBottom: espaco.sm,
  },
  caixaInput: {
    width: 96,
    marginBottom: 0,
  },
  input: {
    fontFamily: fontes.numero,
    fontVariant: ['tabular-nums'],
  },
  inputSuffix: {
    ...tipografia.corpo,
    fontSize: 16,
    color: cores.textoSecundario,
  },
  calculado: {
    flex: 1,
    fontFamily: fontes.numero,
    fontVariant: ['tabular-nums'],
    fontSize: 14,
    color: cores.positivo,
  },
  saldoLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espaco.sm,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    marginTop: espaco.xs,
    marginBottom: espaco.sm,
  },
  saldoLabel: {
    ...tipografia.secundario,
    fontSize: 15,
  },
  saldoValor: {
    fontFamily: fontes.numeroForte,
    fontSize: 20,
  },
  caixaMovimento: {
    marginBottom: espaco.sm,
  },
  botoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  botao: {
    flexGrow: 1,
    flexBasis: 96,
  },
  ajuda: {
    ...tipografia.nota,
    fontStyle: 'italic',
    marginTop: espaco.sm,
  },
  remover: {
    alignSelf: 'center',
    marginTop: espaco.sm,
  },
  vazio: {
    ...tipografia.secundario,
    textAlign: 'center',
    fontStyle: 'italic',
    padding: espaco.xl,
  },
});
