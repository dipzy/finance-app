import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Header } from '../../components/Header';
import { SideMenu } from '../../components/SideMenu';
import { Botao, CampoTexto, Cartao, Chip, Ecra, TituloSecao, ValorEuro } from '../../components/ui';
import { COR_CARTAO, COR_CONTA, ICONE_CARTAO, ICONE_CONTA } from '../../constants/meiosPagamento';
import { acentosFolha, comAlfa, cores, espaco, fontes, raio, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { t, useT } from '../../i18n';
import { calcularRecebimento, calcularSaldoDisponivel, ConfigPPRPoupanca, ConfiguracoesDB, ContaCorrenteDB, diaEfetivo, FinancialData, FinancialDB, Poupanca, PoupancasDB, Recebimento, SalarioConfig, SalarioDB } from '../../services/database';
import { diasUteisDoMes } from '../../services/calculos';
import { publicarCartao } from '../../services/saldoCartao';
import { reagendarNotificacoes } from '../../services/notificacoes';
import { mensagemDaApi } from '../../services/grupos';
import { mostrarAlerta, parseValor } from '../../utils/helpers';
import { recebidoNoMes } from '../../utils/salario';

// O acento do salário: o azul do bloco "Lucro" da folha
const COR = acentosFolha.lucro;

function descreverRecebimento(r: Recebimento): string {
  const saidas = (r.contribuicoes ?? [{ nome: 'PPR', valor: r.ppr }, { nome: t('Poupança'), valor: r.poupanca }])
    .filter((c) => c.valor)
    .map((c) => ` - ${c.nome} ${c.valor.toFixed(2)}€`)
    .join('');
  return t('Salário +{salario}€{saidas} = {liquido}€ na conta', {
    salario: r.salario.toFixed(2),
    saidas,
    liquido: r.liquido.toFixed(2),
  });
}

export default function SalarioScreen() {
  const t = useT();
  const [menuVisible, setMenuVisible] = useState(false);
  const [valor, setValor] = useState('');
  const [diaRecebimento, setDiaRecebimento] = useState('');
  const [cartaoAlimentacao, setCartaoAlimentacao] = useState('');
  // Só quem tem cartão de alimentação o vê no Início e nas ações manuais
  const [temCartao, setTemCartao] = useState(false);
  // Em vez de um valor fixo por mês: valor por dia útil vezes os dias úteis do mês
  const [cartaoPorDia, setCartaoPorDia] = useState(false);
  const [valorPorDiaUtil, setValorPorDiaUtil] = useState('');
  const [saldoConta, setSaldoConta] = useState(0);
  // Ações manuais: um só valor, para a conta ou para o cartão de alimentação
  const [valorManual, setValorManual] = useState('');
  const [destinoManual, setDestinoManual] = useState<'conta' | 'cartao'>('conta');
  const [saldoCartao, setSaldoCartao] = useState(0);
  // Para mostrar o que entra de facto na conta no dia do salário
  const [configPPR, setConfigPPR] = useState<ConfigPPRPoupanca | null>(null);
  const [financialAntigo, setFinancialAntigo] = useState<FinancialData | null>(null);
  const [poupancas, setPoupancas] = useState<Poupanca[] | null>(null);
  const [ultimoRecebimento, setUltimoRecebimento] = useState<SalarioConfig['ultimoRecebimento'] | null>(null);
  // Recebimento manual: o salário não entra sozinho, marca-se "Já recebi". O "Já recebi" só funciona com o modo já guardado
  const [recebimentoManual, setRecebimentoManual] = useState(false);
  const [manualGuardado, setManualGuardado] = useState(false);
  const [recebidoEm, setRecebidoEm] = useState<string | undefined>(undefined);
  const [valorRecebido, setValorRecebido] = useState('');
  const { user } = useAuth();

  // O que vai entrar na conta no próximo dia de salário, com os valores escritos no ecrã
  const previsaoRecebimento = calcularRecebimento(
    { valor, diaRecebimento: parseInt(diaRecebimento) || 1 },
    configPPR,
    financialAntigo,
    poupancas
  );

  // Cartão por dia útil: a previsão do mês é o valor diário vezes os dias de segunda a sexta
  const diasUteisMes = diasUteisDoMes();
  const previsaoCartaoMes = Math.round(parseValor(valorPorDiaUtil) * diasUteisMes * 100) / 100;

  useFocusEffect(
    useCallback(() => {
      carregarDados();
    }, [user])
  );

  async function carregarDados() {
    if (user?.id) {
      try {
        // Primeiro o saldo: recebe o salário se for o dia (e faz os débitos automáticos)
        await calcularSaldoDisponivel(user.id);

        // Carregar configuração
        const [config, configuracoes, antigo, lista] = await Promise.all([
          SalarioDB.getConfig(user.id),
          ConfiguracoesDB.getPPRPoupanca(user.id),
          FinancialDB.load(user.id),
          PoupancasDB.getAll(user.id),
        ]);
        setConfigPPR(configuracoes);
        setPoupancas(lista);
        setFinancialAntigo(antigo);
        setUltimoRecebimento(config?.ultimoRecebimento ?? null);
        setRecebidoEm(config?.lastReceived);
        if (config) {
          setValor(config.valor);
          setDiaRecebimento(config.diaRecebimento.toString());
          setRecebimentoManual(!!config.recebimentoManual);
          setManualGuardado(!!config.recebimentoManual);
          setCartaoAlimentacao(config.cartaoAlimentacao || '');
          const porDia = parseValor(config.cartaoPorDiaUtil || '') > 0;
          setCartaoPorDia(porDia);
          setValorPorDiaUtil(config.cartaoPorDiaUtil || '');
          setTemCartao(porDia || parseValor(config.cartaoAlimentacao || '') > 0);
        } else if (antigo?.salario) {
          // Ainda sem configuração: sugerir o salário guardado na versão anterior (falta só o dia)
          setValor(antigo.salario);
        }

        // Carregar saldo da conta corrente
        const [saldo, cartao] = await Promise.all([
          ContaCorrenteDB.getSaldo(user.id),
          ContaCorrenteDB.getCartaoAlimentacao(user.id).catch(() => null),
        ]);
        if (cartao) setSaldoCartao(cartao.saldo);
        publicarCartao(cartao); // o cabeçalho e o menu mostram o mesmo saldo
        setSaldoConta(saldo);
      } catch (error) {
        console.error('Erro ao carregar salário:', error);
      }
    }
  }

  async function guardarConfiguracao() {
    if (!user?.id) {
      mostrarAlerta(t('Erro'), t('Utilizador não autenticado'));
      return;
    }

    const valorNum = parseValor(valor);
    const diaNum = parseInt(diaRecebimento);

    if (valorNum <= 0) {
      mostrarAlerta(t('Erro'), t('Valor do salário inválido'));
      return;
    }

    if (isNaN(diaNum) || diaNum < 1 || diaNum > 31) {
      mostrarAlerta(t('Erro'), t('Dia de recebimento deve ser entre 1 e 31'));
      return;
    }

    if (temCartao && cartaoPorDia && parseValor(valorPorDiaUtil) <= 0) {
      mostrarAlerta(t('Erro'), t('Indica o valor por dia útil do cartão de alimentação'));
      return;
    }

    if (temCartao && !cartaoPorDia && parseValor(cartaoAlimentacao) <= 0) {
      mostrarAlerta(t('Erro'), t('Indica o valor mensal do cartão de alimentação'));
      return;
    }

    // Por dia útil: o valor fixo fica a 0 (e vice-versa, '' desliga o modo por dia útil)
    const porDiaAtivo = temCartao && cartaoPorDia;
    const config: SalarioConfig = {
      valor: valorNum.toString(),
      diaRecebimento: diaNum,
      cartaoAlimentacao: temCartao && !cartaoPorDia ? parseValor(cartaoAlimentacao).toString() : '0',
      cartaoPorDiaUtil: porDiaAtivo ? parseValor(valorPorDiaUtil).toString() : '',
      recebimentoManual,
    };

    try {
      await SalarioDB.saveConfig(user.id, config);
      setManualGuardado(recebimentoManual);
      reagendarNotificacoes();
      mostrarAlerta(t('Sucesso'), t('Configuração guardada!'));
    } catch (error) {
      mostrarAlerta(t('Erro'), t('Não foi possível guardar a configuração.'));
    }
  }

  async function receberSalarioHoje() {
    if (!user?.id) return;

    try {
      const config = await SalarioDB.getConfig(user.id);
      if (!config) {
        mostrarAlerta(t('Erro'), t('Configura o salário primeiro'));
        return;
      }

      const diaHoje = new Date().getDate();
      const diaSalario = diaEfetivo(config.diaRecebimento);
      if (diaHoje !== diaSalario) {
        mostrarAlerta(
          t('Aviso'),
          t('Hoje é dia {hoje}, mas o salário está configurado para o dia {salario}.\n\nUsa "Adicionar à Conta" para adicionar manualmente.', {
            hoje: diaHoje,
            salario: diaSalario,
          })
        );
        return;
      }

      // A mesma transação do recebimento automático: o salário nunca entra duas vezes no mesmo mês
      const recebimento = await SalarioDB.processarRecebimento(user.id);
      if (!recebimento) {
        mostrarAlerta(t('Aviso'), t('Já recebeste o salário este mês!'));
        return;
      }

      reagendarNotificacoes();
      await carregarDados();
      mostrarAlerta(t('Salário recebido'), descreverRecebimento(recebimento));
    } catch (error) {
      mostrarAlerta(t('Erro'), t('Não foi possível registar o salário.'));
    }
  }

  // Recebimento manual: o salário entra agora, com o valor que entrou de facto (vazio: o configurado)
  async function marcarRecebido() {
    if (!user?.id) return;
    if (!manualGuardado) {
      mostrarAlerta(t('Aviso'), t('Guarda a configuração primeiro: o recebimento manual ainda não está ligado.'));
      return;
    }
    const escrito = valorRecebido.trim() ? parseValor(valorRecebido) : undefined;
    if (escrito !== undefined && !(escrito > 0)) {
      mostrarAlerta(t('Erro'), t('Escreve o valor que entrou, maior do que zero.'));
      return;
    }

    try {
      const recebimento = await SalarioDB.receberManual(user.id, escrito);
      setValorRecebido('');
      reagendarNotificacoes();
      await carregarDados();
      mostrarAlerta(t('Salário recebido'), descreverRecebimento(recebimento));
    } catch (error) {
      console.error('Erro ao marcar o salário como recebido:', error);
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível registar o salário.')));
    }
  }

  // Acertar o saldo do cartão de alimentação para o valor real (ex.: o que a app do banco mostra)
  async function acertarSaldoCartao() {
    if (!user?.id) return;
    const valorNum = parseValor(valorManual);
    if (!valorManual.trim() || !(valorNum >= 0)) {
      mostrarAlerta(t('Erro'), t('Escreve o saldo do cartão (0 ou mais)'));
      return;
    }
    try {
      await ContaCorrenteDB.setSaldoCartaoAlimentacao(user.id, valorNum);
      setValorManual('');
      await carregarDados();
      mostrarAlerta(t('Sucesso'), t('Saldo do cartão acertado para {valor} €', { valor: valorNum.toFixed(2) }));
    } catch (error) {
      mostrarAlerta(t('Erro'), t('Não foi possível guardar o saldo do cartão.'));
    }
  }

  async function movimentoManual(sinal: 1 | -1) {
    if (!user?.id) return;

    const valorNum = parseValor(valorManual);
    if (valorNum <= 0) {
      mostrarAlerta(t('Erro'), t('Valor inválido'));
      return;
    }
    const nome = destinoManual === 'conta' ? t('conta corrente') : t('cartão de alimentação');

    try {
      if (destinoManual === 'conta') {
        if (sinal < 0 && valorNum > (await ContaCorrenteDB.getSaldo(user.id))) {
          mostrarAlerta(t('Erro'), t('Não tens saldo suficiente na conta'));
          return;
        }
        await (sinal > 0 ? ContaCorrenteDB.adicionar(user.id, valorNum) : ContaCorrenteDB.subtrair(user.id, valorNum));
      } else {
        const atual = (await ContaCorrenteDB.getCartaoAlimentacao(user.id)).saldo;
        if (sinal < 0 && valorNum > atual) {
          mostrarAlerta(t('Erro'), t('Não tens saldo suficiente no cartão de alimentação'));
          return;
        }
        await ContaCorrenteDB.setSaldoCartaoAlimentacao(user.id, Math.round((atual + sinal * valorNum) * 100) / 100);
      }
      setValorManual('');
      await carregarDados();
      mostrarAlerta(
        t('Sucesso'),
        t('{valor} € {acao} {nome}', { valor: valorNum.toFixed(2), acao: sinal > 0 ? t('adicionado ao') : t('retirado do'), nome })
      );
    } catch (error) {
      mostrarAlerta(t('Erro'), t('Não foi possível atualizar o {nome}.', { nome }));
    }
  }

  return (
    <Ecra
      cabecalho={
        <>
          <Header
            title={t('Salário')}
            onMenuPress={() => setMenuVisible(true)}
            saldo={saldoConta}
          />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldoConta} />
        </>
      }
    >
      {/* Configuração do Salário */}
      <Cartao>
        <TituloSecao titulo={t('Configuração do Salário')} icone="cash-outline" cor={COR} />

        <CampoTexto
          rotulo={t('Valor do Salário (€)')}
          keyboardType="numeric"
          value={valor}
          onChangeText={setValor}
          placeholder={t('Ex: 1500')}
          style={styles.input}
        />

        <CampoTexto
          rotulo={t('Dia de Recebimento (1-31)')}
          keyboardType="numeric"
          value={diaRecebimento}
          onChangeText={setDiaRecebimento}
          placeholder={t('Ex: 25')}
          maxLength={2}
          style={styles.input}
        />

        {/* Automático: entra sozinho no dia. Manual: marca-se "Já recebi", com o valor que entrou */}
        <Text style={styles.recebimentoNome}>{t('Receber o salário')}</Text>
        <View style={styles.destinos}>
          <Chip rotulo={t('Automático')} ativo={!recebimentoManual} onPress={() => setRecebimentoManual(false)} />
          <Chip rotulo={t('Manual')} ativo={recebimentoManual} onPress={() => setRecebimentoManual(true)} />
        </View>
        <Text style={styles.infoText}>
          {recebimentoManual
            ? t('O salário não entra sozinho: marcas tu quando entrar, com o valor que entrou de facto.')
            : t('O salário entra sozinho no dia de recebimento.')}
        </Text>

        <View style={styles.linhaCartao}>
          <Text style={styles.recebimentoNome}>{t('Tenho cartão de alimentação')}</Text>
          <Switch
            value={temCartao}
            onValueChange={(v) => {
              setTemCartao(v);
              if (!v) setDestinoManual('conta');
            }}
            accessibilityLabel={t('Tenho cartão de alimentação')}
          />
        </View>
        {temCartao && (
          <View style={styles.linhaCartao}>
            <Text style={styles.recebimentoNome}>{t('Calcular por dia útil')}</Text>
            <Switch value={cartaoPorDia} onValueChange={setCartaoPorDia} accessibilityLabel={t('Calcular por dia útil')} />
          </View>
        )}
        {temCartao && !cartaoPorDia && (
          <CampoTexto
            rotulo={t('Cartão de Alimentação (€/mês)')}
            keyboardType="numeric"
            value={cartaoAlimentacao}
            onChangeText={setCartaoAlimentacao}
            placeholder={t('Ex: 150')}
            style={styles.input}
          />
        )}
        {temCartao && cartaoPorDia && (
          <>
            <CampoTexto
              rotulo={t('Cartão de Alimentação (€/dia útil)')}
              keyboardType="numeric"
              value={valorPorDiaUtil}
              onChangeText={setValorPorDiaUtil}
              placeholder={t('Ex: 7.63')}
              style={styles.input}
            />
            {previsaoCartaoMes > 0 && (
              <Text style={styles.infoText}>
                {t('Previsão para este mês: {dias} dias úteis × {valor} € = {total} €', {
                  dias: diasUteisMes,
                  valor: parseValor(valorPorDiaUtil).toFixed(2),
                  total: previsaoCartaoMes.toFixed(2),
                })}
              </Text>
            )}
          </>
        )}

        {/* O que entra na conta no dia do salário */}
        <View style={styles.recebimentoBox}>
          <Text style={styles.recebimentoTitulo}>
            {recebimentoManual ? t('Quando marcares que recebeste, entra na conta:') : t('No dia do salário entra na conta:')}
          </Text>
          <View style={styles.recebimentoLinha}>
            <Text style={styles.recebimentoNome}>{t('Salário')}</Text>
            <ValorEuro valor={previsaoRecebimento.salario} prefixo="+" tipo="entrada" style={styles.recebimentoValor} />
          </View>
          {(previsaoRecebimento.contribuicoes ?? []).map((c, i) => (
            <View key={`${c.nome}-${i}`} style={styles.recebimentoLinha}>
              <Text style={styles.recebimentoNome}>{c.nome}</Text>
              <ValorEuro valor={c.valor} prefixo="-" cor={cores.aviso} style={styles.recebimentoValor} />
            </View>
          ))}
          {!previsaoRecebimento.contribuicoes?.length && (
            <Text style={styles.recebimentoNome}>{t('Sem poupanças configuradas (menu Poupanças)')}</Text>
          )}
          <View style={[styles.recebimentoLinha, styles.recebimentoTotalLinha]}>
            <Text style={styles.recebimentoTotal}>{t('Líquido')}</Text>
            <ValorEuro valor={previsaoRecebimento.liquido} tipo="destaque" style={styles.recebimentoTotalValor} />
          </View>
          {temCartao && <Text style={styles.infoText}>{t('O cartão de alimentação fica à parte e não entra na conta.')}</Text>}
        </View>

        <Botao titulo={t('Guardar Configuração')} icone="save-outline" onPress={guardarConfiguracao} style={styles.saveButton} />

        {recebimentoManual ? (
          <>
            <Text style={styles.infoText}>
              {recebidoNoMes({ lastReceived: recebidoEm })
                ? t('Este mês: já recebido ({data}).', { data: new Date(recebidoEm as string).toLocaleDateString('pt-PT') })
                : t('Este mês: ainda por receber.')}
            </Text>
            {!recebidoNoMes({ lastReceived: recebidoEm }) && (
              <>
                <CampoTexto
                  rotulo={t('Valor que entrou (€)')}
                  keyboardType="numeric"
                  value={valorRecebido}
                  onChangeText={setValorRecebido}
                  placeholder={t('Agora: {valor}', { valor: `${valor || '0'} €` })}
                  accessibilityLabel={t('Valor do salário que entrou, em euros')}
                  style={styles.input}
                />
                <Botao
                  variante="secundario"
                  cor={COR}
                  titulo={t('Já recebi')}
                  icone="checkmark-outline"
                  onPress={marcarRecebido}
                  accessibilityLabel={t('Já recebi o salário deste mês')}
                  style={styles.receberButton}
                />
              </>
            )}
          </>
        ) : (
          <Botao
            variante="secundario"
            cor={COR}
            titulo={t('Receber Salário Hoje')}
            icone="cash-outline"
            onPress={receberSalarioHoje}
            style={styles.receberButton}
          />
        )}
      </Cartao>

      {/* Ações Manuais */}
      <Cartao>
        <TituloSecao titulo={t('Ações Manuais')} icone="swap-vertical-outline" />

        <View style={styles.destinos}>
          <Chip
            rotulo={t('Conta · {saldo} €', { saldo: saldoConta.toFixed(2) })}
            icone={ICONE_CONTA}
            cor={COR_CONTA}
            ativo={destinoManual === 'conta'}
            onPress={() => setDestinoManual('conta')}
          />
          {temCartao && (
            <Chip
              rotulo={t('Cartão de alimentação · {saldo} €', { saldo: saldoCartao.toFixed(2) })}
              icone={ICONE_CARTAO}
              cor={COR_CARTAO}
              ativo={destinoManual === 'cartao'}
              onPress={() => setDestinoManual('cartao')}
            />
          )}
        </View>
        <CampoTexto
          rotulo={t('Valor (€)')}
          keyboardType="numeric"
          value={valorManual}
          onChangeText={setValorManual}
          placeholder={t('Ex: 100')}
          style={styles.input}
        />
        <View style={styles.linhaBotoes}>
          <Botao
            variante="secundario"
            cor={cores.positivo}
            titulo={t('Adicionar')}
            icone="add-circle-outline"
            onPress={() => movimentoManual(1)}
            style={styles.botaoMetade}
          />
          <Botao
            variante="perigo"
            titulo={t('Retirar')}
            icone="remove-circle-outline"
            onPress={() => movimentoManual(-1)}
            style={styles.botaoMetade}
          />
        </View>
        {destinoManual === 'cartao' && (
          <Botao
            variante="fantasma"
            titulo={t('Acertar o saldo do cartão para este valor')}
            icone="checkmark-done-outline"
            onPress={acertarSaldoCartao}
            accessibilityLabel={t('Acertar o saldo do cartão de alimentação para o valor escrito')}
          />
        )}

        {ultimoRecebimento && (
          <Text style={styles.infoText}>
            {t('Último salário ({data}): {descricao}', {
              data: new Date(ultimoRecebimento.data).toLocaleDateString('pt-PT'),
              descricao: descreverRecebimento(ultimoRecebimento),
            })}
          </Text>
        )}
      </Cartao>
    </Ecra>
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: fontes.numero,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
  },
  saveButton: {
    marginTop: espaco.sm,
  },
  receberButton: {
    marginTop: espaco.md,
  },
  destinos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
    marginBottom: espaco.md,
  },
  linhaBotoes: {
    flexDirection: 'row',
    gap: espaco.sm,
    marginBottom: espaco.md,
  },
  botaoMetade: {
    flex: 1,
  },
  infoText: {
    ...tipografia.nota,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: espaco.sm,
  },
  recebimentoBox: {
    backgroundColor: comAlfa(cores.positivo, 0.05),
    borderWidth: 1,
    borderColor: comAlfa(cores.positivo, 0.2),
    borderRadius: raio.md,
    padding: espaco.md,
    marginBottom: espaco.md,
  },
  recebimentoTitulo: {
    ...tipografia.corpoMedio,
    fontSize: 14,
    marginBottom: espaco.sm,
  },
  recebimentoLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
    gap: espaco.md,
  },
  linhaCartao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
    marginBottom: espaco.md,
  },
  recebimentoNome: {
    ...tipografia.secundario,
    flex: 1,
  },
  recebimentoValor: {
    fontSize: 14,
  },
  recebimentoTotalLinha: {
    marginTop: espaco.xs,
    paddingTop: espaco.sm,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  recebimentoTotal: {
    ...tipografia.tituloCartao,
    fontSize: 15,
    flex: 1,
  },
  recebimentoTotalValor: {
    fontFamily: fontes.numeroForte,
    fontSize: 16,
  },
});
