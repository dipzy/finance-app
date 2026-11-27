import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { cores, espaco, fontes, layout, raio, tipografia, comAlfa } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';
import { GruposDB, mensagemDaApi, type GrupoDto, type GrupoMembroDto } from '../../services/grupos';
import { calcularSaldoDisponivel, ContaCorrenteDB } from '../../services/database';
import { PartilhadoDB, type DespesaPartilhadaDto, type EstadoParte, type ModoDivisao } from '../../services/partilhado';
import type { Categoria, MeioPagamento } from '../../services/tipos';
import { textoHoje, validarDespesaExtra } from '../../utils/ecrasDespesas';
import { formatarData, parseValor } from '../../utils/formatos';
import { mostrarAlerta } from '../../utils/helpers';
import { confirmar } from '../../utils/confirmar';
import { dividir } from '../../utils/partilhado';
import { CampoData } from '../CampoData';
import { ModalFormulario, estilosFormulario } from '../ModalFormulario';
import { SeletorCategoria } from '../SeletorCategoria';
import { SeletorMeioPagamento } from '../SeletorMeioPagamento';
import { Botao, CampoTexto, Chip, formatarEuro } from '../ui';

const COR = cores.violetaTexto;

/** Os dados de uma despesa pessoal que vai passar a partilhada (o ecrã de gastos abre o modal com eles). */
export type DespesaInicial = {
  titulo: string;
  valor: number;
  data?: string; // ISO
  categoria?: Categoria;
  meioPagamento?: MeioPagamento;
  despesaExtraId?: string;
};

interface Props {
  visivel: boolean;
  /** O grupo; sem ele, escolhe-se no modal (ex.: ao dividir um gasto do ecrã de gastos). */
  grupoId?: string;
  /** Para ver ou alterar uma despesa que já existe. */
  despesa?: DespesaPartilhadaDto | null;
  /** Para começar preenchido (passar uma despesa pessoal a partilhada). */
  inicial?: DespesaInicial | null;
  podeApagar?: boolean;
  onFechar: () => void;
  onGuardado: () => void;
}

const MODOS: { chave: ModoDivisao; rotulo: string }[] = [
  { chave: 'igual', rotulo: 'Partes iguais' },
  { chave: 'valores', rotulo: 'Valores' },
  { chave: 'percentagem', rotulo: '%' },
  { chave: 'partes', rotulo: 'Partes' },
];

// Lançar (ou alterar) uma despesa paga por mim e dividida no grupo: quem participa e como se divide.
// Mostra a parte de cada um enquanto se escreve. Quem não pagou só vê a despesa (e pode apagá-la se for admin)
export function DespesaPartilhadaModal({ visivel, grupoId, despesa, inicial, podeApagar, onFechar, onGuardado }: Props) {
  const t = useT();
  const { user } = useAuth();
  const [grupos, setGrupos] = useState<GrupoDto[] | null>(null);
  const [grupo, setGrupo] = useState<string | undefined>(grupoId);
  const [membros, setMembros] = useState<GrupoMembroDto[] | null>(null);
  const [titulo, setTitulo] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(textoHoje());
  const [categoria, setCategoria] = useState<Categoria | undefined>();
  const [modo, setModo] = useState<ModoDivisao>('igual');
  const [meio, setMeio] = useState<MeioPagamento>('conta');
  const [saldoConta, setSaldoConta] = useState<number | undefined>(undefined);
  const [saldoCartao, setSaldoCartao] = useState<number | undefined>(undefined);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [pesos, setPesos] = useState<Record<string, string>>({});
  const [aGuardar, setAGuardar] = useState(false);
  // A ref trava dois toques seguidos (o estado só muda no render seguinte): cada despesa mexe em dinheiro
  const emCurso = useRef(false);

  // Uma despesa que veio de uma despesa fixa dividida só se altera ou anula nas despesas fixas
  const daDespesaFixa = !!despesa?.daDespesaFixa;
  const soLeitura = !!despesa && (despesa.pagadorUid !== user?.id || daDespesaFixa);
  const minhaParte = despesa?.partes.find((p) => p.uid === user?.id);
  const [aResponder, setAResponder] = useState(false);

  // Ao abrir: repor o formulário (com a despesa a alterar ou a inicial) e ler os grupos se for preciso
  useEffect(() => {
    if (!visivel) return;
    const base = despesa ?? inicial;
    setGrupo(despesa?.grupoId ?? grupoId);
    setTitulo(base?.titulo ?? '');
    setValor(base ? String(base.valor).replace('.', ',') : '');
    setData(base?.data ? formatarData(base.data) : textoHoje());
    setCategoria(base?.categoria);
    setModo(despesa?.modo ?? 'igual');
    setMeio(base?.meioPagamento ?? 'conta');
    setEscolhidos(new Set(despesa?.partes.map((p) => p.uid) ?? []));
    setPesos(
      Object.fromEntries((despesa?.partes ?? []).filter((p) => p.peso != null).map((p) => [p.uid, String(p.peso).replace('.', ',')]))
    );
    setMembros(null);
    if (!grupoId && !despesa) {
      setGrupos(null);
      GruposDB.listar()
        .then((lista) => {
          setGrupos(lista);
          if (lista.length === 1) setGrupo(lista[0].id);
        })
        .catch(() => setGrupos([]));
    }
  }, [visivel, despesa, inicial, grupoId]);

  // Os saldos que o "Pagar com" mostra (só a quem vai pagar: quem só vê a despesa não precisa deles)
  useEffect(() => {
    if (!visivel || !user?.id || soLeitura) return;
    let ativo = true;
    calcularSaldoDisponivel(user.id).then((s) => ativo && setSaldoConta(s), () => undefined);
    ContaCorrenteDB.getCartaoAlimentacao(user.id).then((c) => ativo && setSaldoCartao(c.saldo), () => undefined);
    return () => {
      ativo = false;
    };
  }, [visivel, user?.id, soLeitura]);

  // Os membros do grupo escolhido; numa despesa nova, todos participam por defeito
  useEffect(() => {
    if (!visivel || !grupo) return;
    let ativo = true;
    GruposDB.listarMembros(grupo)
      .then((lista) => {
        if (!ativo) return;
        setMembros(lista);
        if (!despesa) setEscolhidos(new Set(lista.map((m) => m.uid)));
      })
      .catch(() => ativo && setMembros([]));
    return () => {
      ativo = false;
    };
  }, [visivel, grupo, despesa]);

  const total = parseValor(valor);
  const participantes = (membros ?? [])
    .filter((m) => escolhidos.has(m.uid))
    .map((m) => ({ uid: m.uid, peso: modo === 'igual' ? undefined : parseValor(pesos[m.uid]) }));
  const divisao = useMemo(() => dividir(total, modo, participantes), [total, modo, JSON.stringify(participantes)]);
  const parteDe = (uid: string) => ('partes' in divisao ? divisao.partes.find((p) => p.uid === uid)?.valor : undefined);

  function alternar(uid: string) {
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(uid)) novo.delete(uid);
      else novo.add(uid);
      return novo;
    });
  }

  async function guardar() {
    if (emCurso.current) return;
    if (!grupo) {
      mostrarAlerta(t('Erro'), t('Escolhe o grupo.'));
      return;
    }
    const lido = validarDespesaExtra({ titulo, valor, data });
    if ('erro' in lido) {
      mostrarAlerta(t('Erro'), lido.erro);
      return;
    }
    if ('erro' in divisao) {
      mostrarAlerta(t('Erro'), divisao.erro);
      return;
    }

    const pedido = {
      titulo: lido.despesa.titulo,
      valor: lido.despesa.valor,
      data: lido.despesa.data,
      categoria,
      modo,
      participantes,
      meioPagamento: meio,
      despesaExtraId: despesa ? undefined : inicial?.despesaExtraId,
    };
    emCurso.current = true;
    setAGuardar(true);
    try {
      if (despesa) await PartilhadoDB.alterarDespesa(despesa.id, pedido);
      else await PartilhadoDB.criarDespesa(grupo, pedido);
      onGuardado();
      onFechar();
    } catch (error) {
      console.error('Erro ao guardar a despesa partilhada:', error);
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível guardar a despesa.')));
    } finally {
      emCurso.current = false;
      setAGuardar(false);
    }
  }

  // Aceitar ou recusar a minha parte (só quem ainda não respondeu)
  async function responder(aceitar: boolean) {
    if (!despesa || aResponder) return;
    if (!aceitar) {
      const ok = await confirmar(
        t('Recusar despesa'),
        t('Recusar a tua parte de "{titulo}"? O valor passa a ser dividido pelos outros e não conta nos teus gastos.', { titulo: despesa.titulo }),
        'Recusar'
      );
      if (!ok) return;
    } else {
      if (!user?.id) return;
      const valor = minhaParte?.valorEfetivo ?? minhaParte?.valor ?? 0;
      const ok = await confirmar(
        t('Aceitar e pagar'),
        t('A tua parte de {valor} em "{titulo}" vai ser debitada da tua conta. No grupo fica como paga a {nome}. Não te esqueças de lhe transferir o dinheiro.', {
          valor: formatarEuro(valor),
          titulo: despesa.titulo,
          nome: despesa.pagadorNome,
        }),
        'Aceitar e pagar'
      );
      if (!ok) return;
    }
    setAResponder(true);
    try {
      if (aceitar) {
        if (!user?.id) return;
        await PartilhadoDB.aceitarEPagar(despesa.id, despesa.grupoId, user.id, despesa.pagadorUid, minhaParte?.valorEfetivo ?? minhaParte?.valor ?? 0);
      } else await PartilhadoDB.recusarDespesa(despesa.id);
      onGuardado();
      onFechar();
    } catch (error) {
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível responder à despesa.')));
    } finally {
      setAResponder(false);
    }
  }

  async function apagar() {
    if (!despesa) return;
    const ok = await confirmar(
      t('Apagar despesa'),
      t('Apagar "{titulo}"? O valor volta para a conta de quem pagou e as partes de cada um desaparecem.', { titulo: despesa.titulo }),
      'Apagar'
    );
    if (!ok) return;
    try {
      await PartilhadoDB.removerDespesa(despesa.id);
      onGuardado();
      onFechar();
    } catch (error) {
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível apagar a despesa.')));
    }
  }

  const tituloModal = despesa ? (soLeitura ? despesa.titulo : t('Alterar despesa partilhada')) : t('Nova despesa partilhada');

  return (
    <ModalFormulario visivel={visivel} titulo={tituloModal} onFechar={onFechar}>
      {soLeitura && despesa ? (
        <>
          <Text style={styles.nota}>
            {t('Paga por {nome} · {data}', { nome: despesa.pagadorNome, data: formatarData(despesa.data) })}
            {despesa.meioPagamento === 'cartaoAlimentacao' ? ` · ${t('Cartão de alimentação')}` : ''}
          </Text>
          {despesa.saldoAntes != null && <Text style={styles.nota}>{t('Saldo antes: {valor}', { valor: formatarEuro(despesa.saldoAntes) })}</Text>}
          {despesa.partes.map((p) => (
            <View key={p.uid} style={styles.linhaLeitura}>
              <View style={styles.nomeEEstado}>
                <Text style={[styles.nome, p.uid === user?.id && styles.eu]}>{p.uid === user?.id ? t('Tu') : p.nome}</Text>
                <EstadoDaParte parte={p} />
              </View>
              <Text style={styles.valor}>{formatarEuro(p.valorEfetivo ?? p.valor)}</Text>
            </View>
          ))}
          {minhaParte?.estado === 'pendente' && (
            <>
              <Text style={[styles.nota, styles.espacoAcima]}>
                {t('Ao aceitares, a tua parte é debitada da conta e o grupo fica acertado com quem pagou. Não te esqueças de lhe transferir o dinheiro. Se recusares, a tua parte divide-se pelos outros.')}
              </Text>
              <View style={estilosFormulario.linhaBotoes}>
                <Botao titulo={t('Aceitar e pagar')} onPress={() => responder(true)} desativado={aResponder} style={estilosFormulario.botaoLinha} />
                <Botao titulo={t('Recusar')} variante="perigo" onPress={() => responder(false)} desativado={aResponder} style={estilosFormulario.botaoLinha} />
              </View>
            </>
          )}
          {daDespesaFixa && (
            <Text style={[styles.nota, styles.espacoAcima]}>
              {t('Vem de uma despesa fixa dividida: para a alterar ou anular, vai às despesas fixas de quem a pagou.')}
            </Text>
          )}
          <View style={[estilosFormulario.linhaBotoes, styles.botoes]}>
            {podeApagar && !daDespesaFixa && <Botao titulo={t('Apagar')} variante="perigo" onPress={apagar} style={estilosFormulario.botaoLinha} />}
            <Botao titulo={t('Fechar')} variante="secundario" onPress={onFechar} style={estilosFormulario.botaoLinha} />
          </View>
        </>
      ) : (
        <>
          {/* Sem grupo à partida: escolher em qual */}
          {!grupoId && !despesa && (
            <View style={styles.bloco}>
              <Text style={estilosFormulario.label}>{t('Grupo')}</Text>
              {grupos === null ? (
                <ActivityIndicator color={COR} />
              ) : grupos.length === 0 ? (
                <Text style={styles.nota}>{t('Ainda não tens grupos. Cria um nas Definições.')}</Text>
              ) : (
                <View style={styles.chips}>
                  {grupos.map((g) => (
                    <Chip key={g.id} rotulo={g.nome} ativo={grupo === g.id} cor={COR} onPress={() => setGrupo(g.id)} />
                  ))}
                </View>
              )}
            </View>
          )}

          <CampoTexto rotulo={t('Título')} value={titulo} onChangeText={setTitulo} placeholder={t('Ex: Jantar, Supermercado, Renda')} />
          <CampoTexto rotulo={t('Valor total (€)')} value={valor} onChangeText={setValor} keyboardType="decimal-pad" placeholder="0,00" />
          <Text style={estilosFormulario.label}>{t('Data')}</Text>
          <CampoData valor={data} onChange={setData} cor={COR} />
          <SeletorCategoria valor={categoria} onChange={setCategoria} onLimpar={() => setCategoria(undefined)} />

          <SeletorMeioPagamento valor={meio} onChange={setMeio} saldoConta={saldoConta} saldoCartao={saldoCartao} />

          <Text style={[estilosFormulario.label, styles.espacoAcima]}>{t('Como dividir')}</Text>
          <View style={styles.chips}>
            {MODOS.map((m) => (
              <Chip key={m.chave} rotulo={t(m.rotulo)} ativo={modo === m.chave} cor={COR} onPress={() => setModo(m.chave)} />
            ))}
          </View>

          <Text style={[estilosFormulario.label, styles.espacoAcima]}>{t('Quem participa')}</Text>
          {membros === null ? (
            grupo ? <ActivityIndicator color={COR} /> : null
          ) : (
            membros.map((m) => {
              const dentro = escolhidos.has(m.uid);
              const parte = parteDe(m.uid);
              return (
                <View key={m.uid} style={styles.linhaMembro}>
                  <Pressable
                    style={styles.marcar}
                    onPress={() => alternar(m.uid)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: dentro }}
                    accessibilityLabel={m.souEu ? t('Tu') : m.nome}
                  >
                    <Ionicons name={dentro ? 'checkbox' : 'square-outline'} size={22} color={dentro ? COR : cores.textoMudo} />
                    <Text style={[styles.nome, m.souEu && styles.eu]} numberOfLines={1}>
                      {m.souEu ? t('Tu') : m.nome}
                    </Text>
                  </Pressable>
                  {dentro && modo !== 'igual' && (
                    <View style={styles.pesoCaixa}>
                      <TextInput
                        style={styles.peso}
                        value={pesos[m.uid] ?? ''}
                        onChangeText={(texto) => setPesos((p) => ({ ...p, [m.uid]: texto }))}
                        keyboardType="decimal-pad"
                        placeholder={modo === 'partes' ? '1' : '0'}
                        placeholderTextColor={cores.desativado}
                        accessibilityLabel={t('Valor de {nome}', { nome: m.nome })}
                      />
                      <Text style={styles.unidade}>{modo === 'valores' ? '€' : modo === 'percentagem' ? '%' : '×'}</Text>
                    </View>
                  )}
                  <Text style={[styles.valor, !dentro && styles.fora]}>{dentro && parte !== undefined ? formatarEuro(parte) : '—'}</Text>
                </View>
              );
            })
          )}
          {'erro' in divisao && total > 0 && participantes.length > 0 && <Text style={styles.erro}>{divisao.erro}</Text>}

          {despesa?.saldoAntes != null && (
            <Text style={styles.nota}>{t('Saldo antes: {valor}', { valor: formatarEuro(despesa.saldoAntes) })}</Text>
          )}
          {despesa && despesa.partes.some((p) => p.uid !== user?.id && p.estado && p.estado !== 'aceite') && (
            <View style={styles.bloco}>
              {despesa.partes
                .filter((p) => p.uid !== user?.id && p.estado && p.estado !== 'aceite')
                .map((p) => (
                  <View key={p.uid} style={styles.nomeEEstado}>
                    <Text style={styles.nome}>{p.nome}</Text>
                    <EstadoDaParte parte={p} />
                  </View>
                ))}
              <Text style={styles.nota}>{t('Se alterares a despesa, quem mudar de valor tem de aceitar outra vez.')}</Text>
            </View>
          )}

          {despesa && (
            <Text style={[estilosFormulario.nota, styles.espacoAcima]}>
              {t('Ao alterar, a tua conta só muda pela diferença: o que já recebeste em acertos não se mexe e o saldo do grupo é recalculado.')}
            </Text>
          )}

          <Text style={[estilosFormulario.nota, styles.espacoAcima]}>
            {t('Pagas tu o total (sai da tua conta). Nos gastos do mês de cada pessoa só entra a parte dela.')}
          </Text>

          <Botao
            titulo={aGuardar ? t('A guardar…') : despesa ? t('Guardar') : t('Adicionar')}
            onPress={guardar}
            aCarregar={aGuardar}
            desativado={aGuardar}
            style={estilosFormulario.botaoPrincipal}
          />
          <View style={estilosFormulario.linhaBotoes}>
            {despesa && podeApagar && <Botao titulo={t('Apagar')} variante="perigo" onPress={apagar} style={estilosFormulario.botaoLinha} />}
            <Botao titulo={t('Cancelar')} variante="secundario" onPress={onFechar} style={estilosFormulario.botaoLinha} />
          </View>
        </>
      )}
    </ModalFormulario>
  );
}

// "Por aceitar" / "Recusou" ao lado do nome (as aceites não precisam de aviso)
function EstadoDaParte({ parte }: { parte: { estado?: EstadoParte } }) {
  const t = useT();
  if (!parte.estado || parte.estado === 'aceite') return null;
  return (
    <Text style={[styles.estado, parte.estado === 'recusada' && styles.estadoRecusada]}>
      {parte.estado === 'pendente' ? t('por aceitar') : t('recusou')}
    </Text>
  );
}

const styles = StyleSheet.create({
  nomeEEstado: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm, flexShrink: 1 },
  estado: { ...tipografia.nota, color: cores.aviso },
  estadoRecusada: { color: cores.negativo },
  bloco: { marginBottom: espaco.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm },
  espacoAcima: { marginTop: espaco.md },
  nota: { ...tipografia.nota, marginBottom: espaco.md },
  linhaMembro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    paddingVertical: espaco.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.borda,
  },
  marcar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: espaco.sm, minHeight: layout.alvoToque },
  nome: { ...tipografia.corpo, flexShrink: 1 },
  eu: { fontFamily: fontes.corpoMedio },
  pesoCaixa: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: comAlfa(COR, 0.4),
    borderRadius: raio.sm,
    paddingHorizontal: espaco.sm,
  },
  peso: { ...tipografia.valor, width: 56, paddingVertical: 6, textAlign: 'right' },
  unidade: { ...tipografia.secundario, marginLeft: 4 },
  valor: { ...tipografia.valor, minWidth: 80, textAlign: 'right' },
  fora: { color: cores.desativado },
  erro: { ...tipografia.nota, color: cores.negativo, marginTop: espaco.sm },
  linhaLeitura: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: espaco.sm },
  botoes: { marginTop: espaco.lg },
});
