import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { comAlfa, cores, espaco, fontes, raio, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useGrupos } from '../../contexts/ParceriasContext';
import { useT } from '../../i18n';
import { GruposDB, type GrupoMembroDto } from '../../services/grupos';
import type { DivisaoFixa, ModoDivisao } from '../../services/partilhado';
import { parseValor } from '../../utils/formatos';
import { dividir } from '../../utils/partilhado';
import { ModalFormulario, estilosFormulario } from '../ModalFormulario';
import { Botao, Chip, formatarEuro } from '../ui';

const COR = cores.violetaTexto;

const MODOS: { chave: ModoDivisao; rotulo: string }[] = [
  { chave: 'igual', rotulo: 'Partes iguais' },
  { chave: 'valores', rotulo: 'Valores' },
  { chave: 'percentagem', rotulo: '%' },
  { chave: 'partes', rotulo: 'Partes' },
];

/** O que o formulário recebe: a divisão pronta a enviar (null = sem divisão) ou o erro a mostrar. */
export interface EstadoDivisao {
  divisao: DivisaoFixa | null;
  erro: string | null;
  /** A parte de quem paga (o que conta nos totais dele), quando a divisão está certa. */
  minhaParte: number | null;
}

interface Props {
  /** O valor total da despesa (o que sai da conta), para mostrar a parte de cada um. */
  total: number;
  /** A divisão que a despesa já tem (ao editar). Só se lê quando o componente aparece. */
  inicial?: DivisaoFixa | null;
  onChange: (estado: EstadoDivisao) => void;
  /** O texto por baixo do interruptor. */
  nota?: string;
  /** Os campos da despesa (título, valor, categoria…), mostrados no topo da janela como nos gastos do dia a dia. */
  campos?: ReactNode;
}

// Dividir uma despesa que se repete (fixa, anual, prestação de uma dívida) com um grupo: escolhe-se o grupo,
// quem participa e como se divide. Quem paga fica com a despesa toda na conta e só a parte dele conta nos totais.
// Sem grupos, não mostra nada.
export function DivisaoGrupo({ total, inicial, onChange, nota, campos }: Props) {
  const t = useT();
  const { user } = useAuth();
  // Os grupos vêm do contexto (já carregados pela app), como nos gastos do dia a dia
  const { grupos: gruposCtx, isLoading } = useGrupos();
  const grupos = isLoading ? null : gruposCtx;
  const [ligado, setLigado] = useState(!!inicial);
  const [aberto, setAberto] = useState(false);
  const [grupo, setGrupo] = useState<string | undefined>(inicial?.grupoId);
  const [membros, setMembros] = useState<GrupoMembroDto[] | null>(null);
  const [modo, setModo] = useState<ModoDivisao>(inicial?.modo ?? 'igual');
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set(inicial?.participantes.map((p) => p.uid) ?? []));
  const [pesos, setPesos] = useState<Record<string, string>>(
    Object.fromEntries((inicial?.participantes ?? []).filter((p) => p.peso != null).map((p) => [p.uid, String(p.peso).replace('.', ',')]))
  );
  const jaTinha = useRef(!!inicial);

  useEffect(() => {
    if (!inicial && gruposCtx.length === 1) setGrupo((g) => g ?? gruposCtx[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gruposCtx]);

  // Os membros do grupo escolhido; ao começar de novo, todos participam por defeito
  useEffect(() => {
    if (!ligado || !grupo) return;
    let ativo = true;
    GruposDB.listarMembros(grupo)
      .then((lista) => {
        if (!ativo) return;
        setMembros(lista);
        if (!jaTinha.current || grupo !== inicial?.grupoId) setEscolhidos(new Set(lista.map((m) => m.uid)));
        jaTinha.current = false;
      })
      .catch(() => ativo && setMembros([]));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligado, grupo]);

  const participantes = (membros ?? [])
    .filter((m) => escolhidos.has(m.uid))
    .map((m) => ({ uid: m.uid, peso: modo === 'igual' ? undefined : parseValor(pesos[m.uid]) }));
  const resultado = useMemo(() => dividir(total, modo, participantes), [total, modo, JSON.stringify(participantes)]);
  const parteDe = (uid: string) => ('partes' in resultado ? resultado.partes.find((p) => p.uid === uid)?.valor : undefined);

  // O formulário fica a saber o que enviar (ou o que falta) sempre que algo muda
  const estado = useMemo<EstadoDivisao>(() => {
    if (!ligado) return { divisao: null, erro: null, minhaParte: null };
    if (!grupo) return { divisao: null, erro: t('Escolhe o grupo.'), minhaParte: null };
    if (membros === null) return { divisao: null, erro: t('A carregar as pessoas do grupo…'), minhaParte: null };
    if (!participantes.some((p) => p.uid === user?.id)) {
      return { divisao: null, erro: t('Tu tens de estar na divisão: é a tua parte que conta nas tuas despesas.'), minhaParte: null };
    }
    if ('erro' in resultado) return { divisao: null, erro: resultado.erro, minhaParte: null };
    return {
      divisao: { grupoId: grupo, modo, participantes: participantes.map((p) => ({ uid: p.uid, peso: p.peso })) },
      erro: null,
      minhaParte: parteDe(user?.id ?? '') ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligado, grupo, membros, modo, resultado, user?.id]);

  const aoMudar = useRef(onChange);
  aoMudar.current = onChange;
  useEffect(() => {
    aoMudar.current(estado);
  }, [estado]);

  function alternar(uid: string) {
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(uid)) novo.delete(uid);
      else novo.add(uid);
      return novo;
    });
  }

  function abrir() {
    setLigado(true);
    setAberto(true);
  }

  // Fechar sem uma divisão certa (ainda sem grupo, ou com erro) é desistir de dividir
  function fechar() {
    setAberto(false);
    if (!estado.divisao) setLigado(false);
  }

  function semDivisao() {
    setAberto(false);
    setLigado(false);
  }

  // Sem grupos (ou sem ligação) não há com quem dividir
  if (grupos === null || (grupos.length === 0 && !inicial)) return null;

  return (
    <View style={styles.caixa}>
      <Pressable style={styles.linhaInterruptor} onPress={abrir} accessibilityRole="button">
        <Ionicons name="people-outline" size={22} color={COR} />
        <View style={styles.textos}>
          <Text style={styles.titulo}>{t('Dividir num grupo')}</Text>
          <Text style={styles.nota}>
            {ligado && estado.divisao
              ? `${grupos.find((g) => g.id === grupo)?.nome ?? ''} · ${t('A tua parte: {valor}', { valor: formatarEuro(estado.minhaParte ?? 0) })}`
              : (nota ?? t('Pagas tu; nos teus gastos só fica a tua parte'))}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={cores.textoMudo} />
      </Pressable>

      <ModalFormulario visivel={aberto} titulo={t('Dividir num grupo')} onFechar={fechar}>
        {campos}
        <View style={styles.corpo}>
          <Text style={styles.rotulo}>{t('Grupo')}</Text>
          <View style={styles.chips}>
            {grupos.map((g) => (
              <Chip key={g.id} rotulo={g.nome} ativo={grupo === g.id} cor={COR} onPress={() => setGrupo(g.id)} />
            ))}
          </View>

          <Text style={[styles.rotulo, styles.espacoAcima]}>{t('Como dividir')}</Text>
          <View style={styles.chips}>
            {MODOS.map((m) => (
              <Chip key={m.chave} rotulo={t(m.rotulo)} ativo={modo === m.chave} cor={COR} onPress={() => setModo(m.chave)} />
            ))}
          </View>

          <Text style={[styles.rotulo, styles.espacoAcima]}>{t('Quem participa')}</Text>
          {membros === null ? (
            grupo ? <ActivityIndicator color={COR} /> : <Text style={styles.nota}>{t('Escolhe o grupo.')}</Text>
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

          {estado.erro && total > 0 && membros !== null && <Text style={styles.erro}>{estado.erro}</Text>}
          {estado.minhaParte !== null && (
            <Text style={styles.minhaParte}>{t('A tua parte: {valor}', { valor: formatarEuro(estado.minhaParte) })}</Text>
          )}

          <Botao titulo={t('Concluído')} onPress={fechar} desativado={!estado.divisao} style={estilosFormulario.botaoPrincipal} />
          <View style={estilosFormulario.linhaBotoes}>
            {ligado && <Botao titulo={t('Não dividir')} variante="secundario" onPress={semDivisao} style={estilosFormulario.botaoLinha} />}
            <Botao titulo={t('Cancelar')} variante="secundario" onPress={fechar} style={estilosFormulario.botaoLinha} />
          </View>
        </View>
      </ModalFormulario>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: {
    borderWidth: 1,
    borderColor: comAlfa(COR, 0.3),
    borderRadius: raio.md,
    padding: espaco.md,
    marginBottom: espaco.md,
  },
  linhaInterruptor: { flexDirection: 'row', alignItems: 'center', gap: espaco.md },
  textos: { flex: 1 },
  titulo: { fontFamily: fontes.corpoForte, color: cores.texto, fontSize: 14 },
  nota: { ...tipografia.nota, marginTop: 1 },
  corpo: { marginTop: espaco.md },
  rotulo: { ...tipografia.rotulo, fontSize: 11, marginBottom: 6 },
  espacoAcima: { marginTop: espaco.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm },
  linhaMembro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    paddingVertical: espaco.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.borda,
  },
  marcar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: espaco.sm, minHeight: 40 },
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
  minhaParte: { ...tipografia.corpo, fontFamily: fontes.corpoForte, marginTop: espaco.sm },
});
