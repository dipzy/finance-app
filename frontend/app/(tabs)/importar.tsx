import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Header } from '../../components/Header';
import { SideMenu } from '../../components/SideMenu';
import { Botao, Cartao, Chip, Ecra, Etiqueta, TituloSecao, ValorEuro } from '../../components/ui';
import { t, useT } from '../../i18n';
import { acentosFolha, brilho, comAlfa, cores, espaco, fontes, gradientes, raio, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { calcularSaldoDisponivel, mesAnterior, mesAtual, mesSeguinte, nomeMes } from '../../services/database';
import { importarFolhaMes, normalizarTitulo, OpcoesImportacao, ResumoImportacao } from '../../services/folhaMes';
import { BlocoFolha, interpretarFolhaMes, LeituraFolha, NOMES_BLOCOS, sugerirMes, totalLinhas } from '../../services/importarExcel';
import type { RotuloFolha } from '../../services/importarExcel';
import type { LinhaFolha, Mes } from '../../services/tipos';
import { reagendarNotificacoes } from '../../services/notificacoes';
import { mostrarAlerta } from '../../utils/helpers';
import { lerFicheiro } from '../../utils/lerFicheiro';
import { abrirLivro, Livro } from '../../utils/lerXlsx';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Na web também pela extensão; no telemóvel alguns gestores de ficheiros marcam os .xlsx como "ms-excel"
const TIPOS_EXCEL = Platform.OS === 'web' ? [MIME_XLSX, '.xlsx'] : [MIME_XLSX, 'application/vnd.ms-excel'];

// Blocos pela ordem da folha ("Saldo Conta" aparece à parte, entre o Anual e a Falta)
const BLOCOS_CIMA: BlocoFolha[] = ['lucro', 'despesas', 'poupanca', 'despesasMes', 'anual'];
const BLOCOS_BAIXO: BlocoFolha[] = ['falta', 'saldoPoupanca', 'totalAPagar'];

// O que importarFolhaMes (services/folhaMes.ts) grava de cada bloco.
// A "Falta" só conta no mês atual (ver renderBloco)
const DESTINO: Partial<Record<BlocoFolha, (mes: string) => string>> = {
  lucro: (mes) => t('Fica no histórico de {mes}', { mes }),
  despesas: (mes) =>
    t('Vão para as despesas fixas (as que ainda não existem são criadas) com o pagamento de {mes}', { mes }),
  poupanca: (mes) => t('Fica no histórico de {mes}', { mes }),
  despesasMes: (mes) => t('Vão para as gastos do dia a dia de {mes}', { mes }),
  anual: () =>
    t('Vão para as despesas anuais (as que ainda não existem são criadas; escolhe depois o mês em que se pagam)'),
  saldoPoupanca: (mes) => t('Fica no histórico de {mes}', { mes }),
  totalAPagar: (mes) => t('Fica no histórico de {mes}', { mes }),
};
const BLOCOS_IMPORTADOS: BlocoFolha[] = ['lucro', 'despesas', 'poupanca', 'despesasMes', 'anual', 'saldoPoupanca', 'totalAPagar'];

// A cor de cada bloco, a mesma da folha do mês no ecrã Resumo do mês (como no livro Excel)
const ACENTOS: Record<RotuloFolha, string> = {
  lucro: acentosFolha.lucro,
  despesas: acentosFolha.despesas,
  poupanca: acentosFolha.poupanca,
  despesasMes: acentosFolha.despesasMes,
  anual: acentosFolha.anual,
  saldoConta: acentosFolha.conta,
  falta: cores.aviso,
  saldoPoupanca: acentosFolha.poupanca,
  totalAPagar: acentosFolha.despesas,
};

// As mesmas regras de importarFolhaMes: só linhas com nome e valor acima de zero
const importavel = (linha: LinhaFolha) => !!linha.titulo.trim() && linha.valor > 0;

export default function ImportarScreen() {
  const [menuVisible, setMenuVisible] = useState(false);
  const [saldo, setSaldo] = useState<number | undefined>(undefined);
  const [ficheiro, setFicheiro] = useState<{ nome: string; livro: Livro } | null>(null);
  const [folha, setFolha] = useState<string | null>(null);
  const [mes, setMes] = useState<Mes>(mesAtual());
  const [aAbrir, setAAbrir] = useState(false);
  const [aImportar, setAImportar] = useState(false);
  const [resumo, setResumo] = useState<ResumoImportacao | null>(null);
  const [opcoes, setOpcoes] = useState<OpcoesImportacao>({});
  const { user } = useAuth();
  const t = useT();

  useFocusEffect(
    useCallback(() => {
      carregarSaldo();
    }, [user])
  );

  async function carregarSaldo() {
    if (!user?.id) return;
    try {
      setSaldo(await calcularSaldoDisponivel(user.id));
    } catch (error) {
      console.error('Erro ao carregar saldo:', error);
    }
  }

  // A folha escolhida, lida para o mês escolhido
  const leitura = useMemo((): { resultado?: LeituraFolha; erro?: string } => {
    if (!ficheiro || !folha) return {};
    try {
      return { resultado: interpretarFolhaMes(ficheiro.livro.lerFolha(folha), mes, ficheiro.livro.data1904) };
    } catch (error: any) {
      return { erro: error?.message || t('Não foi possível ler esta folha.') };
    }
  }, [ficheiro, folha, mes]);

  const dados = leitura.resultado?.dados;
  const sugestao = folha ? sugerirMes(folha) : null;
  const hoje = mesAtual();
  const nomeDoMes = nomeMes(mes);
  const despesasAImportar = dados?.despesas.filter(importavel) ?? [];
  const extrasAImportar = dados?.despesasMes.filter(importavel) ?? [];
  // Mês atual: as despesas que ainda estão na "Falta" ficam por pagar
  const emFalta = new Set(mes === hoje ? (dados?.falta.filter(importavel) ?? []).map((l) => normalizarTitulo(l.titulo)) : []);
  const despesasPorPagar = despesasAImportar.filter((l) => emFalta.has(normalizarTitulo(l.titulo)));
  const temSaldosPoupanca = (dados?.saldoPoupanca.filter(importavel).length ?? 0) > 0;
  const temDividas = (dados?.totalAPagar.filter(importavel).length ?? 0) > 0;
  const algoAImportar =
    !!dados && (dados.saldoConta !== undefined || BLOCOS_IMPORTADOS.some((b) => dados[b].some(importavel)));
  const podeImportar = !!dados && mes <= hoje && algoAImportar && !aImportar;

  async function escolherFicheiro() {
    try {
      const escolha = await DocumentPicker.getDocumentAsync({
        type: TIPOS_EXCEL,
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      });
      if (escolha.canceled || !escolha.assets?.length) return;
      const asset = escolha.assets[0];

      setAAbrir(true);
      const livro = abrirLivro(await lerFicheiro(asset));
      if (!livro.folhas.length) {
        throw new Error(t('O ficheiro não tem folhas.'));
      }
      setFicheiro({ nome: asset.name, livro });
      setFolha(null);
      setResumo(null);
      if (livro.folhas.length === 1) escolherFolha(livro.folhas[0]);
    } catch (error: any) {
      console.error('Erro ao abrir o ficheiro:', error);
      mostrarAlerta(t('Erro'), error?.message || t('Não foi possível ler o ficheiro.'));
    } finally {
      setAAbrir(false);
    }
  }

  function escolherFolha(nome: string) {
    setFolha(nome);
    setResumo(null);
    setOpcoes({});
    // O mês sugerido pelo nome da folha ("Abril ..." -> abril), se não for no futuro
    const sugerido = sugerirMes(nome);
    if (sugerido && sugerido <= mesAtual()) setMes(sugerido);
  }

  function mudarMes(novo: Mes) {
    if (novo > mesAtual()) return;
    setMes(novo);
    setResumo(null);
  }

  async function importar() {
    if (!user?.id || !dados || !podeImportar) return;
    setAImportar(true);
    try {
      setResumo(
        await importarFolhaMes(user.id, dados, {
          atualizarSaldosPoupancas: temSaldosPoupanca && opcoes.atualizarSaldosPoupancas,
          atualizarDividas: temDividas && opcoes.atualizarDividas,
        })
      );
      reagendarNotificacoes();
      carregarSaldo();
    } catch (error) {
      console.error('Erro ao importar a folha:', error);
      mostrarAlerta(t('Erro'), t('Não foi possível importar a folha. Tenta outra vez.'));
    } finally {
      setAImportar(false);
    }
  }

  function renderBloco(bloco: BlocoFolha) {
    const linhas = dados?.[bloco] ?? [];
    const destino =
      bloco === 'falta' && mes === hoje
        ? () => t('É o mês atual: as despesas fixas que estão aqui ficam por pagar')
        : DESTINO[bloco];
    const encontrado = leitura.resultado?.encontrados.includes(bloco);
    const cor = ACENTOS[bloco];
    return (
      <Cartao key={bloco} acento={cor} style={!destino && styles.blocoConsulta}>
        <View style={styles.blocoCabecalho}>
          <Text style={[styles.blocoTitulo, { color: cor }]}>{t(NOMES_BLOCOS[bloco])}</Text>
          <ValorEuro valor={totalLinhas(linhas)} style={styles.blocoTotal} />
        </View>
        {destino ? (
          <Etiqueta texto={destino(nomeDoMes)} icone="download-outline" cor={cores.positivo} style={styles.etiqueta} />
        ) : (
          <Etiqueta texto={t('Só para conferir: este bloco ainda não é importado')} icone="eye-outline" style={styles.etiqueta} />
        )}

        {linhas.map((linha, i) => (
          <View key={i} style={styles.linha}>
            <Text style={[styles.linhaTitulo, linha.informativo && styles.linhaInformativa]}>
              {linha.titulo}
              {linha.informativo ? t(' (à parte, não conta)') : ''}
              {destino && !importavel(linha) ? t(' (não é importada)') : ''}
            </Text>
            <ValorEuro valor={linha.valor} style={[styles.linhaValor, linha.informativo && styles.valorInformativo]} />
          </View>
        ))}
        {linhas.length === 0 && (
          <Text style={styles.vazioText}>{encontrado ? t('Sem linhas com valor') : t('Não encontrado nesta folha')}</Text>
        )}
      </Cartao>
    );
  }

  return (
    <Ecra
      cabecalho={
        <>
          <Header title={t('Importar Excel')} onMenuPress={() => setMenuVisible(true)} saldo={saldo} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldo} />
        </>
      }
    >
      <Text style={styles.subtitle}>{t('Carrega um mês do teu livro Excel (uma folha) para o histórico da app')}</Text>

      {/* 1. Ficheiro */}
      <Cartao>
        <TituloSecao titulo={t('1. Ficheiro')} icone="document-attach-outline" />
        <Botao
          variante="secundario"
          cor={cores.positivo}
          titulo={aAbrir ? t('A abrir...') : t('Escolher ficheiro')}
          icone="folder-open-outline"
          onPress={escolherFicheiro}
          aCarregar={aAbrir}
        />
        {ficheiro ? (
          <Text style={styles.ajuda}>
            {ficheiro.nome} · {ficheiro.livro.folhas.length}{' '}
            {ficheiro.livro.folhas.length === 1 ? t('folha') : t('folhas')}
          </Text>
        ) : (
          <Text style={styles.ajuda}>{t('Um ficheiro .xlsx com uma folha por mês')}</Text>
        )}
      </Cartao>

      {/* 2. Folha */}
      {ficheiro && (
        <Cartao>
          <TituloSecao titulo={t('2. Folha')} icone="layers-outline" />
          <View style={styles.folhas}>
            {ficheiro.livro.folhas.map((nome) => (
              <Chip key={nome} rotulo={nome} ativo={folha === nome} onPress={() => escolherFolha(nome)} />
            ))}
          </View>
        </Cartao>
      )}

      {/* 3. Mês */}
      {folha !== null && (
        <Cartao>
          <TituloSecao titulo={t('3. Mês desta folha')} icone="calendar-outline" />
          <View style={styles.seletorMes}>
            <Pressable
              style={({ pressed }) => [styles.setaMes, pressed && styles.setaPremida]}
              onPress={() => mudarMes(mesAnterior(mes))}
              accessibilityRole="button"
              accessibilityLabel={t('Mês anterior')}
            >
              <Ionicons name="chevron-back" size={22} color={cores.primaria} />
            </Pressable>
            <Text style={styles.mesTexto}>{nomeDoMes}</Text>
            <Pressable
              style={({ pressed }) => [styles.setaMes, mes >= hoje && styles.setaDesativada, pressed && styles.setaPremida]}
              onPress={() => mudarMes(mesSeguinte(mes))}
              disabled={mes >= hoje}
              accessibilityRole="button"
              accessibilityLabel={t('Mês seguinte')}
              accessibilityState={{ disabled: mes >= hoje }}
            >
              <Ionicons name="chevron-forward" size={22} color={mes >= hoje ? cores.desativado : cores.primaria} />
            </Pressable>
          </View>
          {sugestao === mes ? (
            <Text style={styles.ajuda}>{t('Sugerido pelo nome da folha')}</Text>
          ) : sugestao && sugestao <= hoje ? (
            <Pressable onPress={() => mudarMes(sugestao)} style={styles.ligacaoToque} accessibilityRole="button">
              <Text style={styles.ligacao}>{t('Usar {mes} (pelo nome da folha)', { mes: nomeMes(sugestao) })}</Text>
            </Pressable>
          ) : null}
          {mes === hoje && (
            <View style={styles.aviso}>
              <Ionicons name="information-circle-outline" size={18} color={cores.aviso} />
              <Text style={styles.avisoTexto}>
                {t('É o mês atual: as despesas que a folha tem na Falta ficam por pagar; as outras ficam pagas este mês sem sair da conta. Confirma que o saldo da conta na app é o que tens no banco.')}
              </Text>
            </View>
          )}
        </Cartao>
      )}

      {/* 4. Pré-visualização */}
      {!!leitura.erro && <Text style={styles.erroText}>{leitura.erro}</Text>}
      {dados && leitura.resultado && (
        <>
          <Text style={styles.tituloSecao}>{t('4. O que está na folha')}</Text>

          {leitura.resultado.encontrados.length === 0 ? (
            <Cartao>
              <Text style={styles.vazioText}>
                {t('Esta folha não tem os blocos do livro (Lucro, Despesas, Poupança, Despesas do Mês...). Escolhe outra folha.')}
              </Text>
            </Cartao>
          ) : (
            <>
              <View style={styles.resumoCard}>
                <LinearGradient colors={gradientes.heroPrimario} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.resumoDegrade} />
                <Text style={styles.resumoTitulo}>{t('Ao importar {mes}:', { mes: nomeDoMes })}</Text>
                <Text style={styles.resumoTexto}>
                  {t('• {n} despesas fixas com o pagamento desse mês', {
                    n: despesasAImportar.length - despesasPorPagar.length,
                  })}
                </Text>
                {despesasPorPagar.length > 0 && (
                  <Text style={styles.resumoTexto}>
                    {t('• {n} despesas fixas por pagar (estão na Falta)', { n: despesasPorPagar.length })}
                  </Text>
                )}
                <Text style={styles.resumoTexto}>{t('• {n} gastos do dia a dia desse mês', { n: extrasAImportar.length })}</Text>
                <Text style={styles.resumoNota}>
                  {t('O saldo da conta de hoje não muda: o dinheiro desses meses já saiu da conta na altura. Importar o mesmo mês outra vez não duplica nada.')}
                </Text>
              </View>

              {BLOCOS_CIMA.map(renderBloco)}

              <Cartao acento={ACENTOS.saldoConta} style={styles.blocoConsulta}>
                <View style={styles.blocoCabecalho}>
                  <Text style={[styles.blocoTitulo, { color: ACENTOS.saldoConta }]}>{t(NOMES_BLOCOS.saldoConta)}</Text>
                  {dados.saldoConta !== undefined ? (
                    <ValorEuro valor={dados.saldoConta} style={styles.blocoTotal} />
                  ) : (
                    <Text style={styles.blocoTotal}>—</Text>
                  )}
                </View>
                <Etiqueta
                  texto={t('Fica no histórico de {mes}: o saldo da conta de hoje não muda', { mes: nomeDoMes })}
                  icone="eye-outline"
                  style={styles.etiqueta}
                />
              </Cartao>

              {BLOCOS_BAIXO.map(renderBloco)}

              {(temSaldosPoupanca || temDividas) && (
                <Cartao>
                  <TituloSecao titulo={t('Também atualizar (só para o mês mais recente)')} icone="sync-outline" />
                  {temSaldosPoupanca && (
                    <Pressable
                      style={({ pressed }) => [styles.opcaoLinha, pressed && styles.opcaoPremida]}
                      onPress={() => setOpcoes((o) => ({ ...o, atualizarSaldosPoupancas: !o.atualizarSaldosPoupancas }))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !!opcoes.atualizarSaldosPoupancas }}
                    >
                      <Ionicons
                        name={opcoes.atualizarSaldosPoupancas ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={opcoes.atualizarSaldosPoupancas ? cores.primaria : cores.textoSecundario}
                      />
                      <Text style={styles.opcaoTexto}>
                        {t('O saldo das poupanças passa a ser o do {blocoSaldoPoupanca} desta folha (as que não existem são criadas)', { blocoSaldoPoupanca: '"' + t('Saldo Poupança') + '"' })}
                      </Text>
                    </Pressable>
                  )}
                  {temDividas && (
                    <Pressable
                      style={({ pressed }) => [styles.opcaoLinha, pressed && styles.opcaoPremida]}
                      onPress={() => setOpcoes((o) => ({ ...o, atualizarDividas: !o.atualizarDividas }))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !!opcoes.atualizarDividas }}
                    >
                      <Ionicons
                        name={opcoes.atualizarDividas ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={opcoes.atualizarDividas ? cores.primaria : cores.textoSecundario}
                      />
                      <Text style={styles.opcaoTexto}>
                        {t('O que falta pagar nas dívidas passa a ser o do {blocoTotalAPagar} desta folha (as que não existem são criadas e ligadas à despesa fixa com o mesmo nome)', { blocoTotalAPagar: '"' + t('Total a pagar') + '"' })}
                      </Text>
                    </Pressable>
                  )}
                </Cartao>
              )}

              {leitura.resultado.avisos.length > 0 && (
                <View style={styles.avisosCard}>
                  <View style={styles.avisosCabecalho}>
                    <Ionicons name="warning-outline" size={18} color={cores.aviso} />
                    <Text style={styles.avisosTitulo}>{t('Linhas que não foram lidas')}</Text>
                  </View>
                  {leitura.resultado.avisos.map((aviso, i) => (
                    <Text key={i} style={styles.avisoLinha}>• {aviso}</Text>
                  ))}
                </View>
              )}

              <Botao
                titulo={aImportar ? t('A importar...') : t('Importar {mes}', { mes: nomeDoMes })}
                icone="cloud-upload-outline"
                onPress={importar}
                desativado={!podeImportar && !aImportar}
                aCarregar={aImportar}
                style={styles.botaoImportar}
              />
            </>
          )}
        </>
      )}

      {/* 5. Resultado */}
      {resumo && (
        <Cartao acento={cores.positivo} brilho style={styles.resultadoCard}>
          <View style={styles.resultadoCabecalho}>
            <Ionicons name="checkmark-circle" size={22} color={cores.positivo} />
            <Text style={styles.resultadoTitulo}>{t('{mes} importado', { mes: nomeMes(resumo.mes) })}</Text>
          </View>
          <View style={styles.linha}>
            <Text style={styles.linhaTitulo}>{t('Despesas fixas criadas')}</Text>
            <Text style={styles.linhaValor}>{resumo.despesasCriadas.length}</Text>
          </View>
          {resumo.despesasCriadas.length > 0 && (
            <Text style={styles.resultadoLista}>{resumo.despesasCriadas.join(', ')}</Text>
          )}
          <View style={styles.linha}>
            <Text style={styles.linhaTitulo}>{t('Pagamentos registados')}</Text>
            <Text style={styles.linhaValor}>{resumo.pagamentosRegistados}</Text>
          </View>
          <View style={styles.linha}>
            <Text style={styles.linhaTitulo}>{t('Gastos do dia a dia registadas')}</Text>
            <Text style={styles.linhaValor}>{resumo.extrasRegistadas}</Text>
          </View>
          {resumo.porPagar.length > 0 && (
            <>
              <View style={styles.linha}>
                <Text style={styles.linhaTitulo}>{t('Ficaram por pagar (estão na Falta)')}</Text>
                <Text style={styles.linhaValor}>{resumo.porPagar.length}</Text>
              </View>
              <Text style={styles.resultadoLista}>{resumo.porPagar.join(', ')}</Text>
            </>
          )}
          {resumo.anuaisCriadas.length > 0 && (
            <>
              <View style={styles.linha}>
                <Text style={styles.linhaTitulo}>{t('Despesas anuais criadas')}</Text>
                <Text style={styles.linhaValor}>{resumo.anuaisCriadas.length}</Text>
              </View>
              <Text style={styles.resultadoLista}>
                {t('{lista} · escolhe o mês de cada uma em Despesas Anuais', { lista: resumo.anuaisCriadas.join(', ') })}
              </Text>
            </>
          )}
          {resumo.historico.length > 0 && (
            <Text style={styles.resultadoLista}>{t('Histórico do mês: {lista}', { lista: resumo.historico.join(', ') })}</Text>
          )}
          {resumo.poupancasAtualizadas.length > 0 && (
            <Text style={styles.resultadoLista}>
              {t('Poupanças atualizadas: {lista}', { lista: resumo.poupancasAtualizadas.join(', ') })}
            </Text>
          )}
          {resumo.dividasAtualizadas.length > 0 && (
            <Text style={styles.resultadoLista}>
              {t('Dívidas atualizadas: {lista}', { lista: resumo.dividasAtualizadas.join(', ') })}
            </Text>
          )}
          <View style={styles.linha}>
            <Text style={styles.linhaTitulo}>{t('Ignoradas')}</Text>
            <Text style={styles.linhaValor}>{resumo.ignoradas.length}</Text>
          </View>
          {resumo.ignoradas.map((texto, i) => (
            <Text key={i} style={styles.resultadoLista}>• {texto}</Text>
          ))}
        </Cartao>
      )}
    </Ecra>
  );
}

const styles = StyleSheet.create({
  opcaoLinha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaco.sm + 2,
    paddingVertical: espaco.sm + 2,
    paddingHorizontal: espaco.xs,
    borderRadius: raio.sm,
    minHeight: 44,
  },
  opcaoPremida: {
    backgroundColor: cores.superficiePremida,
  },
  opcaoTexto: {
    ...tipografia.corpo,
    flex: 1,
    fontSize: 14,
  },
  subtitle: {
    ...tipografia.secundario,
    textAlign: 'center',
    marginBottom: espaco.lg,
  },
  tituloSecao: {
    ...tipografia.tituloEcra,
    fontSize: 19,
    marginTop: espaco.sm,
    marginBottom: espaco.md,
  },
  ajuda: {
    ...tipografia.nota,
    marginTop: espaco.sm,
    textAlign: 'center',
  },
  ligacaoToque: {
    minHeight: 44,
    justifyContent: 'center',
  },
  ligacao: {
    fontFamily: fontes.corpoForte,
    fontSize: 13,
    color: cores.primaria,
    textAlign: 'center',
  },
  aviso: {
    flexDirection: 'row',
    gap: espaco.sm,
    backgroundColor: comAlfa(cores.aviso, 0.08),
    borderWidth: 1,
    borderColor: comAlfa(cores.aviso, 0.3),
    padding: espaco.md,
    borderRadius: raio.md,
    marginTop: espaco.md,
  },
  avisoTexto: {
    ...tipografia.nota,
    flex: 1,
    color: cores.aviso,
  },
  folhas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
  },
  seletorMes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  setaMes: {
    width: 48,
    height: 48,
    borderRadius: raio.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: comAlfa(cores.primaria, 0.08),
    borderWidth: 1,
    borderColor: comAlfa(cores.primaria, 0.3),
  },
  setaPremida: {
    backgroundColor: comAlfa(cores.primaria, 0.18),
  },
  setaDesativada: {
    backgroundColor: cores.superficie,
    borderColor: cores.borda,
  },
  mesTexto: {
    ...tipografia.tituloEcra,
    flex: 1,
    fontSize: 18,
    textAlign: 'center',
  },
  resumoCard: {
    padding: espaco.lg,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: comAlfa(cores.primaria, 0.35),
    backgroundColor: cores.fundoAlto,
    boxShadow: brilho(cores.primaria, 0.16, 28),
    marginBottom: espaco.md,
  },
  resumoDegrade: {
    ...StyleSheet.absoluteFill,
    borderRadius: raio.lg,
  },
  resumoTitulo: {
    ...tipografia.tituloCartao,
    marginBottom: espaco.sm,
  },
  resumoTexto: {
    ...tipografia.corpo,
    fontSize: 14,
    marginBottom: espaco.xs,
  },
  resumoNota: {
    ...tipografia.nota,
    color: cores.textoHero,
    marginTop: espaco.sm,
  },
  // Blocos que não são importados (só para conferir) ficam mais apagados
  blocoConsulta: {
    opacity: 0.85,
  },
  blocoCabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaco.md,
  },
  blocoTitulo: {
    fontFamily: fontes.tituloMedio,
    fontSize: 16,
  },
  blocoTotal: {
    fontFamily: fontes.numeroForte,
    fontSize: 16,
    color: cores.texto,
  },
  etiqueta: {
    marginTop: espaco.sm,
    marginBottom: espaco.sm,
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: espaco.md,
  },
  linhaTitulo: {
    ...tipografia.secundario,
    flex: 1,
    color: cores.texto,
  },
  linhaValor: {
    ...tipografia.valor,
    fontSize: 14,
  },
  linhaInformativa: {
    color: cores.textoMudo,
    fontStyle: 'italic',
  },
  valorInformativo: {
    color: cores.textoMudo,
  },
  vazioText: {
    ...tipografia.secundario,
    textAlign: 'center',
    fontStyle: 'italic',
    padding: espaco.sm,
  },
  erroText: {
    ...tipografia.corpo,
    color: cores.negativo,
    textAlign: 'center',
    marginBottom: espaco.md,
  },
  avisosCard: {
    backgroundColor: comAlfa(cores.aviso, 0.07),
    borderWidth: 1,
    borderColor: comAlfa(cores.aviso, 0.3),
    padding: espaco.lg,
    borderRadius: raio.lg,
    marginBottom: espaco.md,
  },
  avisosCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    marginBottom: 6,
  },
  avisosTitulo: {
    fontFamily: fontes.corpoForte,
    fontSize: 14,
    color: cores.aviso,
  },
  avisoLinha: {
    ...tipografia.nota,
    color: cores.texto,
    marginBottom: 2,
  },
  botaoImportar: {
    marginTop: espaco.sm,
    marginBottom: espaco.md,
  },
  resultadoCard: {
    borderColor: comAlfa(cores.positivo, 0.4),
  },
  resultadoCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    marginBottom: espaco.sm,
  },
  resultadoTitulo: {
    fontFamily: fontes.tituloMedio,
    fontSize: 16,
    color: cores.positivo,
  },
  resultadoLista: {
    ...tipografia.nota,
    marginBottom: espaco.xs,
  },
});
