import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { comAlfa, cores, espaco, fontes, layout, raio, tipografia } from '../constants/tema';
import { t, useT } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import {
  calcularSaldoDisponivel,
  Categoria,
  ContaCorrenteDB,
  Despesa,
  DespesasExtrasDB,
  MeioPagamento,
  Mes,
  mesAtual,
  mesDaData,
  OrcamentosDB,
} from '../services/database';
import { ErroApi } from '../services/api';
import { emitir } from '../services/eventos';
import { GruposDB } from '../services/grupos';
import { apagarPendente, editarPendente, sincronizar, type GastoPendente } from '../services/filaOffline';
import { infoCategoria, nomeCategoria } from '../utils/categorias';
import { eCombustivel } from '../utils/combustivel';
import { confirmar } from '../utils/confirmar';
import { gastosRepetiveis, textoDataGuardada, textoHoje, textoValor, validarDespesaExtra } from '../utils/ecrasDespesas';
import { mostrarAlerta } from '../utils/helpers';
import { alertaOrcamento } from '../utils/orcamentos';
import { CampoData } from './CampoData';
import { SeletorCategoria } from './SeletorCategoria';
import { SeletorMeioPagamento } from './SeletorMeioPagamento';
import { DespesaPartilhadaModal, type DespesaInicial } from './partilhado/DespesaPartilhadaModal';
import { Botao, CampoTexto, Chip } from './ui';
import { useSugestaoCategoria } from './useSugestaoCategoria';

// Folha "Novo gasto" (botão rápido "+", atalho do ícone da app): valor primeiro (com o teclado já
// aberto), o resto opcional. No topo, os gastos distintos do mês como chips para repetir com dois
// toques (toca no chip, toca em Guardar). O título, se ficar vazio, é o nome da categoria. Grava
// na hora ou, sem internet, fica na fila offline. Com um gasto por enviar (pendente) serve para o
// corrigir ou apagar.

export interface GastoGuardado {
  titulo: string;
  valor: number;
  pendente: boolean; // ficou na fila (sem internet)
  editado?: boolean; // era um gasto por enviar que foi corrigido
}

interface NovoGastoRapidoProps {
  visivel: boolean;
  pendente?: GastoPendente | null; // editar um gasto por enviar
  onFechar: () => void;
  onGuardado?: (gasto: GastoGuardado) => void;
}

// O último "Pagar com" (enquanto a app está aberta): quem paga o almoço com o cartão regista vários
let ultimoMeio: MeioPagamento = 'conta';

// A mensagem a mostrar quando a API recusa (ex.: 409 "O cartão de alimentação só tem ...")
const mensagemDe = (erro: unknown) =>
  erro instanceof ErroApi && erro.estado >= 400 && erro.estado < 500 ? erro.message : t('Não foi possível guardar o gasto.');

// Depois de registar: se o orçamento da categoria chegou aos 80% (ou passou), avisar.
// Sem saber (sem rede, sem orçamento) não se diz nada: o gasto já ficou guardado
export async function avisarOrcamento(userId: string, titulo: string, categoria: Categoria | undefined, mes: Mes) {
  try {
    const daDespesa = categoria ?? (await DespesasExtrasDB.sugerirCategoria(userId, titulo)).categoria;
    const estados = await OrcamentosDB.getEstado(userId, mes);
    const alerta = alertaOrcamento(estados.find((e) => e.categoria === daDespesa));
    if (alerta) mostrarAlerta(alerta.titulo, alerta.mensagem);
  } catch (erro) {
    console.error('Erro ao ver o orçamento:', erro);
  }
}

export function NovoGastoRapido({ visivel, pendente, onFechar, onGuardado }: NovoGastoRapidoProps) {
  const t = useT();
  const { user } = useAuth();
  const insets = useContext(SafeAreaInsetsContext);
  const [valor, setValor] = useState('');
  const [titulo, setTitulo] = useState('');
  const [litros, setLitros] = useState('');
  const [categoriaEscolhida, setCategoriaEscolhida] = useState<Categoria | null>(null);
  const [meio, setMeio] = useState<MeioPagamento>(ultimoMeio);
  const [data, setData] = useState<string | null>(null); // null = hoje (lido ao guardar)
  const [saldoConta, setSaldoConta] = useState<number | undefined>(undefined);
  const [saldoCartao, setSaldoCartao] = useState<number | undefined>(undefined);
  const aGuardar = useRef(false);
  const [aGuardarVisivel, setAGuardarVisivel] = useState(false);
  // Os gastos do mês oferecidos como chips "Repetir" (vazio: sem rede ou a corrigir um pendente)
  const [repetiveis, setRepetiveis] = useState<Despesa[]>([]);
  // Dividir num grupo: ao guardar, abre a despesa partilhada já preenchida (lá escolhe-se o grupo e quem participa)
  const [temGrupos, setTemGrupos] = useState(false);
  const [aPartilhar, setAPartilhar] = useState<DespesaInicial | null>(null);

  // Ao abrir: limpar (ou preencher com o gasto por enviar) e ler os saldos para o "Pagar com"
  useEffect(() => {
    if (!visivel) return;
    const g = pendente?.gasto;
    setValor(g ? textoValor(g.valor) : '');
    setTitulo(g?.titulo ?? '');
    setLitros(g?.litros ? textoValor(g.litros) : '');
    setCategoriaEscolhida(g?.categoria ?? null);
    setMeio(g?.meioPagamento ?? ultimoMeio);
    const textoData = g?.data ? textoDataGuardada(g.data) : null;
    setData(textoData && textoData !== textoHoje() ? textoData : null);
    setRepetiveis([]);
    if (!user?.id) return;
    let ativo = true;

    // Só se oferece "Dividir num grupo" a quem tem grupos (e num gasto novo: um pendente ainda nem foi enviado)
    if (!pendente) {
      GruposDB.listar().then(
        (lista) => ativo && setTemGrupos(lista.length > 0),
        () => ativo && setTemGrupos(false)
      );
    } else {
      setTemGrupos(false);
    }

    // Os chips "Repetir": só num gasto novo (num pendente não faz sentido) e só com rede;
    // sem ela (ou sem lista) a folha abre na mesma, só sem os chips
    if (!pendente) {
      (async () => {
        try {
          const despesas = await DespesasExtrasDB.getDoMes(user.id, mesAtual());
          if (ativo) setRepetiveis(gastosRepetiveis(despesas));
        } catch {
          // Falhou o pedido: fica sem chips, sem avisos
        }
      })();
    }

    calcularSaldoDisponivel(user.id).then(
      (saldo) => ativo && setSaldoConta(saldo),
      () => undefined
    );
    ContaCorrenteDB.getCartaoAlimentacao(user.id).then(
      (cartao) => ativo && setSaldoCartao(cartao.saldo),
      () => undefined
    );
    return () => {
      ativo = false;
    };
  }, [visivel, pendente, user?.id]);

  const sugerirCategoria = useCallback(
    (texto: string) => DespesasExtrasDB.sugerirCategoria(user?.id ?? '', texto),
    [user?.id]
  );
  const sugestao = useSugestaoCategoria(titulo, user?.id && visivel ? sugerirCategoria : undefined, categoriaEscolhida === null);
  const categoriaMostrada: Categoria = categoriaEscolhida ?? sugestao?.categoria ?? 'outros';

  // Tocar num chip: preenche o gasto como ele foi (valor, título, categoria e meio) e fica a data
  // de hoje — é repetir aqui e agora. Só falta tocar em Guardar (ou mudar o valor, se hoje for outro)
  function repetir(gasto: Despesa) {
    setValor(textoValor(gasto.valor));
    setTitulo(gasto.titulo);
    setCategoriaEscolhida(gasto.categoria ?? null);
    setMeio(gasto.meioPagamento ?? 'conta');
    setData(null);
  }

  // dividir: em vez de guardar, abre já a despesa partilhada preenchida (como em Gastos do dia a dia)
  async function guardar(dividir = false) {
    if (!user?.id || aGuardar.current) return;
    // Sem título: o nome da categoria (ex.: "Restauração"), para gravar em dois toques
    const tituloFinal = titulo.trim() || nomeCategoria(categoriaMostrada);
    const resultado = validarDespesaExtra({
      titulo: tituloFinal,
      valor,
      data: data ?? textoHoje(),
      litros: eCombustivel(categoriaMostrada) ? litros : undefined,
    });
    if ('erro' in resultado) {
      mostrarAlerta(t('Erro'), valor.trim() ? resultado.erro : t('Escreve o valor do gasto'));
      return;
    }
    // A escolhida; sem título, a mostrada; senão a sugestão se já for a deste título (sem ela a API sugere)
    const categoria =
      categoriaEscolhida ??
      (!titulo.trim()
        ? categoriaMostrada
        : sugestao && sugestao.titulo === resultado.despesa.titulo
          ? sugestao.categoria
          : undefined);
    const gasto = { ...resultado.despesa, categoria, meioPagamento: meio };

    // Dividir num grupo: nada se grava aqui; a despesa partilhada abre preenchida e é ela que guarda
    if (dividir && !pendente) {
      ultimoMeio = meio;
      const inicial = { titulo: gasto.titulo, valor: gasto.valor, data: gasto.data, categoria, meioPagamento: meio };
      onFechar();
      // Dois modais não se trocam no mesmo instante (o segundo pode não aparecer): espera-se que a folha feche
      setTimeout(() => setAPartilhar(inicial), 400);
      return;
    }

    aGuardar.current = true;
    setAGuardarVisivel(true);
    try {
      if (pendente) {
        await editarPendente(pendente.id, gasto);
        onFechar();
        onGuardado?.({ titulo: gasto.titulo, valor: gasto.valor, pendente: true, editado: true });
        sincronizar(user.id);
        return;
      }
      const { pendente: ficouNaFila } = await DespesasExtrasDB.add(user.id, gasto);
      ultimoMeio = meio;
      onFechar();
      onGuardado?.({ titulo: gasto.titulo, valor: gasto.valor, pendente: ficouNaFila });
      if (!ficouNaFila) {
        emitir('dadosMudaram');
        await avisarOrcamento(user.id, gasto.titulo, categoria, mesDaData(gasto.data) ?? mesAtual());
      }
    } catch (erro) {
      console.error('Erro ao guardar o gasto:', erro);
      mostrarAlerta(t('Erro'), mensagemDe(erro));
    } finally {
      aGuardar.current = false;
      setAGuardarVisivel(false);
    }
  }

  async function apagar() {
    if (!pendente) return;
    const sim = await confirmar(t('Apagar gasto'), t('Apagar "{titulo}"? Ainda não foi enviado.', { titulo: pendente.gasto.titulo }), 'Apagar');
    if (!sim) return;
    await apagarPendente(pendente.id);
    onFechar();
  }

  return (
    <>
    <DespesaPartilhadaModal
      visivel={aPartilhar !== null}
      inicial={aPartilhar}
      onFechar={() => setAPartilhar(null)}
      onGuardado={() => {
        setAPartilhar(null);
        emitir('dadosMudaram');
      }}
    />
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.raiz} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.fundo} onPress={onFechar} accessibilityRole="button" accessibilityLabel={t('Fechar')} />
        <View style={[styles.folha, { paddingBottom: espaco.lg + (insets?.bottom ?? 0) }]}>
          <View style={styles.pega} />
          <View style={styles.topo}>
            <Text style={styles.titulo} accessibilityRole="header">
              {pendente ? t('Gasto por enviar') : t('Novo gasto')}
            </Text>
            <Pressable onPress={onFechar} style={styles.fechar} accessibilityRole="button" accessibilityLabel={t('Fechar')}>
              <Ionicons name="close" size={22} color={cores.textoSecundario} />
            </Pressable>
          </View>

          {pendente?.erro && (
            <View style={styles.erro}>
              <Ionicons name="alert-circle-outline" size={16} color={cores.negativo} />
              <Text style={styles.erroTexto}>{t('A API recusou este gasto: {erro}', { erro: pendente.erro })}</Text>
            </View>
          )}

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.conteudo}>
            {repetiveis.length > 0 && (
              <View>
                <Text style={styles.repetirRotulo}>{t('Repetir')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.repetirChips}
                  accessibilityLabel={t('Gastos recentes para repetir')}
                >
                  {repetiveis.map((gasto) => {
                    const info = infoCategoria(gasto.categoria);
                    return (
                      <Chip
                        key={gasto.id}
                        rotulo={t('{titulo} · {valor} €', { titulo: gasto.titulo, valor: textoValor(gasto.valor) })}
                        icone={info.icone}
                        cor={info.cor}
                        onPress={() => repetir(gasto)}
                        accessibilityLabel={t('Repetir {titulo}: {valor} euros', {
                          titulo: gasto.titulo,
                          valor: textoValor(gasto.valor),
                        })}
                      />
                    );
                  })}
                </ScrollView>
              </View>
            )}
            {/* O nome primeiro (é o que se pensa primeiro) e depois o valor */}
            <CampoTexto
              placeholder={t('Título (opcional: fica "{categoria}")', { categoria: nomeCategoria(categoriaMostrada) })}
              value={titulo}
              onChangeText={setTitulo}
              autoFocus
              accessibilityLabel={t('Título')}
              returnKeyType="done"
            />
            <CampoTexto
              placeholder={t('0,00 €')}
              keyboardType="decimal-pad"
              value={valor}
              onChangeText={setValor}
              accessibilityLabel={t('Valor em euros')}
              style={styles.valor}
            />
            <SeletorCategoria
              valor={categoriaMostrada}
              onChange={setCategoriaEscolhida}
              sugerida={categoriaEscolhida === null && !!sugestao}
              origemTexto={categoriaEscolhida === null ? sugestao?.origemTexto : undefined}
            />
            {eCombustivel(categoriaMostrada) && (
              <CampoTexto
                placeholder={t('Litros (opcional)')}
                keyboardType="decimal-pad"
                value={litros}
                onChangeText={setLitros}
                accessibilityLabel={t('Litros abastecidos')}
              />
            )}
            <SeletorMeioPagamento valor={meio} onChange={setMeio} saldoConta={saldoConta} saldoCartao={saldoCartao} />
            <CampoData valor={data ?? textoHoje()} onChange={(texto) => setData(texto === textoHoje() ? null : texto)} />
            {temGrupos && (
              // Abre logo a despesa partilhada, já preenchida (grupo, quem participa e como)
              <Pressable style={styles.dividirLinha} onPress={() => guardar(true)} accessibilityRole="button">
                <Ionicons name="people-outline" size={22} color={cores.violetaTexto} />
                <View style={styles.dividirTextos}>
                  <Text style={styles.dividirTitulo}>{t('Dividir num grupo')}</Text>
                  <Text style={styles.dividirNota}>{t('Pagas tu; nos teus gastos só fica a tua parte')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={cores.textoMudo} />
              </Pressable>
            )}
          </ScrollView>

          <View style={styles.botoes}>
            {pendente && (
              <Botao variante="secundario" cor={cores.negativo} icone="trash-outline" titulo={t('Apagar')} onPress={apagar} style={styles.botaoApagar} />
            )}
            <Botao
              titulo={aGuardarVisivel ? t('A guardar…') : t('Guardar')}
              icone="checkmark"
              onPress={() => guardar()}
              aCarregar={aGuardarVisivel}
              style={styles.botaoGuardar}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  fundo: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  folha: {
    width: '100%',
    maxWidth: layout.larguraMaxima,
    maxHeight: '92%',
    alignSelf: 'center',
    backgroundColor: cores.fundoAlto,
    borderTopLeftRadius: raio.lg + 4,
    borderTopRightRadius: raio.lg + 4,
    borderWidth: 1,
    borderColor: cores.borda,
    paddingHorizontal: layout.margemEcra,
    paddingTop: espaco.sm,
  },
  pega: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: cores.borda,
    marginBottom: espaco.sm,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: espaco.sm,
  },
  titulo: {
    ...tipografia.tituloEcra,
    flex: 1,
    fontSize: 20,
  },
  fechar: {
    width: layout.alvoToque,
    height: layout.alvoToque,
    alignItems: 'center',
    justifyContent: 'center',
  },
  erro: {
    flexDirection: 'row',
    gap: espaco.sm,
    padding: espaco.sm,
    borderRadius: raio.md,
    backgroundColor: comAlfa(cores.negativo, 0.1),
    marginBottom: espaco.sm,
  },
  erroTexto: {
    ...tipografia.nota,
    flex: 1,
    color: cores.negativo,
  },
  conteudo: {
    paddingBottom: espaco.sm,
  },
  repetirRotulo: {
    ...tipografia.nota,
    marginBottom: espaco.xs,
  },
  repetirChips: {
    flexDirection: 'row',
    gap: espaco.sm,
    paddingRight: espaco.sm,
  },
  valor: {
    fontFamily: fontes.numero,
    fontSize: 28,
  },
  dividirLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    borderWidth: 1,
    borderColor: comAlfa(cores.violetaTexto, 0.3),
    borderRadius: raio.md,
    padding: espaco.md,
    marginTop: espaco.sm,
  },
  dividirTextos: {
    flex: 1,
  },
  dividirTitulo: {
    fontFamily: fontes.corpoForte,
    color: cores.texto,
    fontSize: 14,
  },
  dividirNota: {
    ...tipografia.nota,
    marginTop: 1,
  },
  botoes: {
    flexDirection: 'row',
    gap: espaco.sm,
    paddingTop: espaco.sm,
  },
  botaoApagar: {
    flexGrow: 1,
  },
  botaoGuardar: {
    flexGrow: 2,
  },
});
