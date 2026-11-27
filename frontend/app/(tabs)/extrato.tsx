import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LinhaMovimento } from '../../components/extrato/LinhaMovimento';
import { MapeamentoColunas } from '../../components/extrato/MapeamentoColunas';
import { Header } from '../../components/Header';
import { ModalFormulario, estilosFormulario } from '../../components/ModalFormulario';
import { SeletorCategoria } from '../../components/SeletorCategoria';
import { SideMenu } from '../../components/SideMenu';
import { Botao, Cartao, Ecra, TituloSecao } from '../../components/ui';
import { cores, espaco, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';
import { calcularSaldoDisponivel, nomeMes } from '../../services/database';
import { ExtratoApi, type MovimentoPrevisto, prepararMovimentos, type ResultadoExtrato } from '../../services/extratoApi';
import {
  aplicarMapeamento,
  assinaturaDaTabela,
  ErroExtrato,
  lerExtrato,
  type Mapeamento,
  type MovimentoLido,
  separarSaidas,
  type Tabela,
} from '../../services/extratoBancario';
import { mensagemDaApi } from '../../services/grupos';
import type { Categoria } from '../../services/tipos';
import { dataCurta, euro } from '../../utils/dividas';
import { type EscolhaMovimento, escolhasIniciais, marcarTodos, movimentosAImportar, resumoSelecao } from '../../utils/extrato';
import { lerFicheiro } from '../../utils/lerFicheiro';

// Quantos movimentos se desenham de cada vez (um extrato pode ter centenas)
const POR_PAGINA = 100;
const CHAVE_MAPEAMENTOS = 'extrato.mapeamentos.v1';

async function lerMapeamentoGuardado(assinatura: string): Promise<Mapeamento | null> {
  try {
    const guardados = JSON.parse((await AsyncStorage.getItem(CHAVE_MAPEAMENTOS)) ?? '{}');
    return guardados[assinatura] ?? null;
  } catch {
    return null;
  }
}

async function guardarMapeamento(assinatura: string, mapeamento: Mapeamento) {
  try {
    const guardados = JSON.parse((await AsyncStorage.getItem(CHAVE_MAPEAMENTOS)) ?? '{}');
    await AsyncStorage.setItem(CHAVE_MAPEAMENTOS, JSON.stringify({ ...guardados, [assinatura]: mapeamento }));
  } catch {
    // Só uma comodidade: da próxima vez a app adivinha outra vez
  }
}

// Importar o extrato da conta bancária (CSV ou OFX): lê o ficheiro, sugere a categoria de cada saída, avisa
// do que já foi importado ou parece repetido, e cria as despesas (no histórico, sem mexer nos saldos)
export default function ExtratoScreen() {
  const t = useT();
  const { user } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const [saldo, setSaldo] = useState<number | undefined>(undefined);

  const [nomeFicheiro, setNomeFicheiro] = useState('');
  const [tabela, setTabela] = useState<Tabela | null>(null); // só nos CSV
  const [mapeamento, setMapeamento] = useState<Mapeamento | null>(null);
  const [lidos, setLidos] = useState<MovimentoLido[] | null>(null); // todos os movimentos lidos
  const [avisos, setAvisos] = useState<string[]>([]);
  const [previstos, setPrevistos] = useState<MovimentoPrevisto[]>([]);
  const [escolhas, setEscolhas] = useState<EscolhaMovimento[]>([]);
  const [aLer, setALer] = useState(false);
  const [aImportar, setAImportar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoExtrato | null>(null);
  const [aMudar, setAMudar] = useState<number | null>(null); // o índice do movimento cuja categoria se escolhe
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const [colunasAbertas, setColunasAbertas] = useState(false);

  const { saidas, entradas } = useMemo(() => separarSaidas(lidos ?? []), [lidos]);
  const preparados = useMemo(() => prepararMovimentos(saidas), [saidas]);
  const resumo = useMemo(() => resumoSelecao(saidas, escolhas, previstos), [saidas, escolhas, previstos]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) calcularSaldoDisponivel(user.id).then(setSaldo).catch(() => undefined);
    }, [user])
  );

  // Pede à API a categoria e o estado de cada saída; as escolhas recomeçam
  async function preverSaidas(novasSaidas: MovimentoLido[]) {
    if (novasSaidas.length === 0) {
      setPrevistos([]);
      setEscolhas([]);
      return;
    }
    const resposta = await ExtratoApi.previsao(prepararMovimentos(novasSaidas));
    setPrevistos(resposta);
    setEscolhas(escolhasIniciais(resposta));
  }

  async function tratar(movimentos: MovimentoLido[], avisosDoFicheiro: string[]) {
    setLidos(movimentos);
    setAvisos(avisosDoFicheiro);
    setMostrar(POR_PAGINA);
    await preverSaidas(separarSaidas(movimentos).saidas);
  }

  async function escolherFicheiro() {
    setErro(null);
    setResultado(null);
    try {
      const escolha = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (escolha.canceled || !escolha.assets?.length) return;
      const asset = escolha.assets[0];
      setALer(true);
      const leitura = lerExtrato(await lerFicheiro(asset));
      setNomeFicheiro(asset.name);
      if (leitura.formato === 'ofx') {
        setTabela(null);
        setMapeamento(null);
        await tratar(leitura.movimentos, leitura.avisos);
        return;
      }
      // CSV: o mapeamento que já usaste com este formato, senão o adivinhado, senão a pessoa escolhe
      const guardado = await lerMapeamentoGuardado(assinaturaDaTabela(leitura.tabela));
      const escolhido = guardado ?? leitura.sugestao;
      setTabela(leitura.tabela);
      setMapeamento(escolhido);
      setColunasAbertas(escolhido === null);
      if (escolhido) {
        const aplicado = aplicarMapeamento(leitura.tabela, escolhido);
        await tratar(aplicado.movimentos, aplicado.avisos);
      } else {
        setLidos(null);
        setPrevistos([]);
        setEscolhas([]);
        setAvisos([t('Não consegui adivinhar as colunas: escolhe abaixo qual é a data, a descrição e o valor.')]);
      }
    } catch (e) {
      setLidos(null);
      setTabela(null);
      setErro(e instanceof ErroExtrato ? e.message : mensagemDaApi(e, t('Não foi possível ler o ficheiro.')));
    } finally {
      setALer(false);
    }
  }

  async function mudarMapeamento(novo: Mapeamento) {
    if (!tabela) return;
    setMapeamento(novo);
    setErro(null);
    setResultado(null);
    const completo = novo.valor !== undefined || (novo.debito !== undefined && novo.credito !== undefined);
    if (!completo) return;
    try {
      setALer(true);
      const aplicado = aplicarMapeamento(tabela, novo);
      await tratar(aplicado.movimentos, aplicado.avisos);
    } catch (e) {
      setErro(mensagemDaApi(e, t('Não foi possível ler o ficheiro.')));
    } finally {
      setALer(false);
    }
  }

  async function importar() {
    setAImportar(true);
    setErro(null);
    try {
      const r = await ExtratoApi.importar(movimentosAImportar(preparados, escolhas, previstos));
      setResultado(r);
      if (tabela && mapeamento) await guardarMapeamento(assinaturaDaTabela(tabela), mapeamento);
      // Os que acabaram de entrar passam a "já importados"
      await preverSaidas(saidas);
    } catch (e) {
      setErro(mensagemDaApi(e, t('Não foi possível importar o extrato.')));
    } finally {
      setAImportar(false);
    }
  }

  const mapeamentoOk = !tabela || (!!mapeamento && (mapeamento.valor !== undefined || (mapeamento.debito !== undefined && mapeamento.credito !== undefined)));
  const podeImportar = !!lidos && resumo.quantos > 0 && !aImportar && !aLer && mapeamentoOk;

  // A cada novo ficheiro, a lista volta ao início
  useEffect(() => setMostrar(POR_PAGINA), [nomeFicheiro]);

  return (
    <Ecra
      cabecalho={
        <>
          <Header title={t('Importar extrato')} onMenuPress={() => setMenuVisible(true)} saldo={saldo} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldo} />
        </>
      }
    >
      <Cartao style={styles.cartao}>
        <TituloSecao titulo={t('Extrato do banco')} icone="document-text-outline" />
        <Text style={styles.nota}>
          {t('Escolhe o extrato da tua conta em CSV ou OFX (no homebanking: Movimentos → Exportar). As saídas passam a despesas, já com categoria, sem mexer no saldo da app.')}
        </Text>
        <Botao
          titulo={aLer ? t('A ler…') : lidos || tabela ? t('Escolher outro ficheiro') : t('Escolher ficheiro')}
          icone="document-attach-outline"
          onPress={escolherFicheiro}
          desativado={aLer || aImportar}
        />
        {aLer && <ActivityIndicator color={cores.primaria} style={styles.carregar} />}
        {!!erro && <Text style={styles.erro}>{erro}</Text>}
      </Cartao>

      {tabela && (
        <Cartao style={styles.cartao}>
          <TituloSecao titulo={t('Colunas do ficheiro')} icone="grid-outline" />
          {!colunasAbertas && mapeamento ? (
            <>
              <Text style={styles.nota}>{t('A app reconheceu as colunas. Se os movimentos não estiverem certos, muda-as.')}</Text>
              <Botao variante="fantasma" pequeno icone="options-outline" titulo={t('Mudar as colunas')} onPress={() => setColunasAbertas(true)} style={styles.esquerda} />
            </>
          ) : (
            <MapeamentoColunas
              tabela={tabela}
              mapeamento={mapeamento ?? { data: 0, descricao: Math.min(1, tabela.cabecalhos.length - 1), valor: Math.min(2, tabela.cabecalhos.length - 1) }}
              onChange={mudarMapeamento}
            />
          )}
        </Cartao>
      )}

      {avisos.map((aviso) => (
        <Text key={aviso} style={styles.aviso}>
          {aviso}
        </Text>
      ))}

      {lidos && (
        <Cartao style={styles.cartao}>
          <TituloSecao titulo={t('{n} saídas', { n: saidas.length })} icone="list-outline" />
          {saidas.length === 0 ? (
            <Text style={styles.nota}>{t('Não há saídas neste ficheiro (só entradas).')}</Text>
          ) : (
            <>
              <Text style={styles.nota}>
                {t('{ficheiro} · de {de} a {ate}', {
                  ficheiro: nomeFicheiro,
                  de: dataCurta(saidas[0].data),
                  ate: dataCurta(saidas[saidas.length - 1].data),
                })}
                {entradas > 0 ? ` · ${t('{n} entradas ignoradas', { n: entradas })}` : ''}
              </Text>
              {resumo.jaImportados > 0 && <Text style={styles.nota}>{t('{n} já importadas (ficam de fora)', { n: resumo.jaImportados })}</Text>}
              {resumo.possiveisDuplicados > 0 && (
                <Text style={styles.aviso}>
                  {t('{n} parecem repetir despesas que já registaste: vêm desmarcadas, vê se são mesmo repetidas.', { n: resumo.possiveisDuplicados })}
                </Text>
              )}
              <View style={styles.acoesLista}>
                <Botao variante="fantasma" pequeno titulo={t('Marcar todas')} onPress={() => setEscolhas((e) => marcarTodos(previstos, e, true))} />
                <Botao variante="fantasma" pequeno titulo={t('Desmarcar todas')} onPress={() => setEscolhas((e) => marcarTodos(previstos, e, false))} />
              </View>
              {saidas.slice(0, mostrar).map((m, i) => (
                <LinhaMovimento
                  key={`${m.data}-${m.linha}-${i}`}
                  movimento={m}
                  previsto={previstos[i]}
                  escolha={escolhas[i]}
                  onAlternar={() => setEscolhas((e) => e.map((x, k) => (k === i ? { ...x, incluido: !x.incluido } : x)))}
                  onMudarCategoria={() => setAMudar(i)}
                />
              ))}
              {saidas.length > mostrar && (
                <Botao
                  variante="fantasma"
                  titulo={t('Mostrar mais ({n})', { n: saidas.length - mostrar })}
                  onPress={() => setMostrar((m) => m + POR_PAGINA)}
                />
              )}
            </>
          )}
        </Cartao>
      )}

      {lidos && saidas.length > 0 && (
        <Cartao style={styles.cartao} brilho>
          <Text style={styles.resumo}>
            {t('{n} despesas · {total}', { n: resumo.quantos, total: euro(resumo.total) })}
          </Text>
          <Botao
            titulo={aImportar ? t('A importar…') : t('Importar {n} despesas', { n: resumo.quantos })}
            icone="cloud-download-outline"
            onPress={importar}
            desativado={!podeImportar}
          />
        </Cartao>
      )}

      {resultado && (
        <Cartao style={styles.cartao} acento={cores.positivo}>
          <TituloSecao titulo={t('Importado')} icone="checkmark-circle-outline" cor={cores.positivo} />
          <Text style={styles.nota}>
            {resultado.importados === 0
              ? t('Não entrou nada de novo: estes movimentos já estavam importados.')
              : t('{n} despesas importadas ({total}) em {meses}.', {
                  n: resultado.importados,
                  total: euro(resultado.total),
                  meses: resultado.meses.map((mes) => nomeMes(mes)).join(', '),
                })}
            {resultado.jaImportados > 0 ? ` ${t('{n} já existiam e ficaram de fora.', { n: resultado.jaImportados })}` : ''}
          </Text>
          <Botao
            variante="secundario"
            pequeno
            icone="receipt-outline"
            titulo={t('Ver as despesas')}
            onPress={() => router.push('/(tabs)/despesas-extras' as Href)}
            style={styles.esquerda}
          />
        </Cartao>
      )}

      <ModalFormulario visivel={aMudar !== null} titulo={t('Categoria')} onFechar={() => setAMudar(null)}>
        {aMudar !== null && (
          <>
            <Text style={estilosFormulario.nota}>{saidas[aMudar]?.descricao}</Text>
            <SeletorCategoria
              valor={escolhas[aMudar]?.categoria}
              onChange={(categoria: Categoria) => {
                setEscolhas((e) => e.map((x, k) => (k === aMudar ? { ...x, categoria } : x)));
                setAMudar(null);
              }}
            />
          </>
        )}
        <Botao variante="fantasma" titulo={t('Cancelar')} onPress={() => setAMudar(null)} style={styles.esquerda} />
      </ModalFormulario>
    </Ecra>
  );
}

const styles = StyleSheet.create({
  cartao: { marginBottom: espaco.md },
  nota: { ...tipografia.nota, marginBottom: espaco.sm },
  aviso: { ...tipografia.secundario, color: cores.aviso, fontSize: 13, marginBottom: espaco.sm },
  erro: { ...tipografia.secundario, color: cores.negativo, fontSize: 13, marginTop: espaco.sm },
  carregar: { marginVertical: espaco.md },
  acoesLista: { flexDirection: 'row', justifyContent: 'flex-end', gap: espaco.sm },
  resumo: { ...tipografia.tituloCartao, marginBottom: espaco.sm },
  esquerda: { alignSelf: 'flex-start' },
});
