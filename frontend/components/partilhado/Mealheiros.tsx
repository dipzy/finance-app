import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { cores, espaco, fontes, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';
import { mesAtual } from '../../services/database';
import { mensagemDaApi } from '../../services/grupos';
import {
  PoupancasPartilhadasDB,
  type PoupancaPartilhadaDto,
  type PoupancaPartilhadaMembroDto,
  type TipoContribuicaoPartilhada,
} from '../../services/poupancasPartilhadas';
import { confirmar } from '../../utils/confirmar';
import { formatarData, parseValor } from '../../utils/formatos';
import { mostrarAlerta } from '../../utils/helpers';
import { BarraProgresso } from '../BarraProgresso';
import { Botao, Cartao, CampoTexto, Chip, formatarEuro, TituloSecao, ValorEuro } from '../ui';

const COR = cores.aviso;

type Acao = { id: string; tipo: 'contribuir' | 'levantar' | 'mensal' | 'objetivo' | 'nome' } | null;

interface Props {
  grupoId: string;
  /** Só um admin levanta dinheiro (os membros só põem). */
  souAdmin: boolean;
  /** Depois de mexer em dinheiro (o saldo da conta e o resumo mudam). */
  onAlterado: () => void;
}

// Os mealheiros do grupo: saldo, objetivo, quanto pôs cada um, pôr/levantar dinheiro e a contribuição
// mensal de cada pessoa (automática no dia do salário ou num dia fixo, ou só um lembrete)
export function Mealheiros({ grupoId, souAdmin, onAlterado }: Props) {
  const t = useT();
  const { user } = useAuth();
  const [lista, setLista] = useState<PoupancaPartilhadaDto[] | null>(null);
  const [contribuicoes, setContribuicoes] = useState<Record<string, PoupancaPartilhadaMembroDto[]>>({});
  const [acao, setAcao] = useState<Acao>(null);
  const [valor, setValor] = useState('');
  const [tipo, setTipo] = useState<TipoContribuicaoPartilhada>('automatica');
  const [diaDoSalario, setDiaDoSalario] = useState(true);
  const [diaFixo, setDiaFixo] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [novoObjetivo, setNovoObjetivo] = useState('');
  const [aCriar, setACriar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  // A ref trava dois toques seguidos (o estado só muda no render seguinte): cada toque mexe em dinheiro
  const emCurso = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const mealheiros = await PoupancasPartilhadasDB.listarDoGrupo(grupoId);
      const todas = await Promise.all(mealheiros.map((m) => PoupancasPartilhadasDB.contribuicoes(m.id)));
      setLista(mealheiros);
      setContribuicoes(Object.fromEntries(mealheiros.map((m, i) => [m.id, todas[i]])));
    } catch (error) {
      console.error('Erro ao carregar os mealheiros:', error);
      setLista((atual) => atual ?? []);
    }
  }, [grupoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrir(id: string, tipoAcao: NonNullable<Acao>['tipo']) {
    if (acao?.id === id && acao.tipo === tipoAcao) {
      setAcao(null);
      return;
    }
    setAcao({ id, tipo: tipoAcao });
    const minha = contribuicoes[id]?.find((c) => c.membroUid === user?.id);
    if (tipoAcao === 'nome') {
      setValor(lista?.find((m) => m.id === id)?.nome ?? '');
    } else if (tipoAcao === 'objetivo') {
      const atual = lista?.find((m) => m.id === id)?.objetivo;
      setValor(atual ? atual.toFixed(2).replace('.', ',') : '');
    } else if (tipoAcao === 'mensal' && minha) {
      setValor(minha.valor.toFixed(2).replace('.', ','));
      setTipo(minha.tipo);
      setDiaDoSalario(minha.diaDoSalario);
      setDiaFixo(minha.diaFixo ? String(minha.diaFixo) : '');
    } else {
      setValor('');
      setTipo('automatica');
      setDiaDoSalario(true);
      setDiaFixo('');
    }
  }

  async function executar(tarefa: () => Promise<unknown>, erro: string) {
    if (emCurso.current) return;
    emCurso.current = true;
    setOcupado(true);
    try {
      await tarefa();
      setAcao(null);
      await carregar();
      onAlterado();
    } catch (e) {
      console.error(erro, e);
      mostrarAlerta(t('Erro'), mensagemDaApi(e, t(erro)));
    } finally {
      emCurso.current = false;
      setOcupado(false);
    }
  }

  async function confirmarAcao(m: PoupancaPartilhadaDto) {
    if (!acao) return;
    if (acao.tipo === 'nome') {
      const nome = valor.trim();
      if (!nome) {
        mostrarAlerta(t('Erro'), t('Escreve o nome do mealheiro.'));
        return;
      }
      await executar(() => PoupancasPartilhadasDB.alterar(m.id, { nome }), 'Não foi possível mudar o nome do mealheiro.');
      return;
    }
    const quanto = parseValor(valor);
    if (!(quanto > 0)) {
      mostrarAlerta(t('Erro'), t('Escreve o valor.'));
      return;
    }
    if (acao.tipo === 'contribuir') {
      await executar(() => PoupancasPartilhadasDB.contribuir(m.id, quanto), 'Não foi possível pôr o dinheiro no mealheiro.');
    } else if (acao.tipo === 'levantar') {
      await executar(() => PoupancasPartilhadasDB.levantar(m.id, quanto), 'Não foi possível levantar o dinheiro.');
    } else if (acao.tipo === 'objetivo') {
      await executar(() => PoupancasPartilhadasDB.alterar(m.id, { objetivo: quanto }), 'Não foi possível guardar o objetivo.');
    } else {
      const dia = parseInt(diaFixo, 10);
      if (tipo === 'automatica' && !diaDoSalario && !(dia >= 1 && dia <= 28)) {
        mostrarAlerta(t('Erro'), t('O dia fixo tem de ser entre 1 e 28.'));
        return;
      }
      await executar(
        () =>
          PoupancasPartilhadasDB.guardarMinhaContribuicao(m.id, {
            valor: quanto,
            tipo,
            diaDoSalario: tipo === 'manual' || diaDoSalario,
            diaFixo: tipo === 'automatica' && !diaDoSalario ? dia : undefined,
          }),
        'Não foi possível guardar a contribuição.'
      );
    }
  }

  async function removerObjetivo(m: PoupancaPartilhadaDto) {
    await executar(() => PoupancasPartilhadasDB.alterar(m.id, { limpar: ['objetivo', 'dataObjetivo'] }), 'Não foi possível remover o objetivo.');
  }

  // Já pus este mês (à mão ou fora da app): tira-a do previsto do fim do mês, sem mexer no dinheiro
  async function marcarFeita(m: PoupancaPartilhadaDto, feita: boolean) {
    await executar(() => PoupancasPartilhadasDB.marcarContribuicaoFeita(m.id, feita), 'Não foi possível marcar a contribuição.');
  }

  async function pararContribuicao(m: PoupancaPartilhadaDto) {
    await executar(() => PoupancasPartilhadasDB.removerMinhaContribuicao(m.id), 'Não foi possível remover a contribuição.');
  }

  async function apagar(m: PoupancaPartilhadaDto) {
    if (!(await confirmar(t('Apagar mealheiro'), t('Apagar o mealheiro "{nome}"?', { nome: m.nome }), 'Apagar'))) return;
    await executar(() => PoupancasPartilhadasDB.remover(m.id), 'Não foi possível apagar o mealheiro.');
  }

  async function criar() {
    if (!novoNome.trim()) {
      mostrarAlerta(t('Erro'), t('Escreve o nome do mealheiro.'));
      return;
    }
    const objetivo = parseValor(novoObjetivo);
    await executar(
      () => PoupancasPartilhadasDB.criar(grupoId, { nome: novoNome.trim(), objetivo: objetivo > 0 ? objetivo : undefined }),
      'Não foi possível criar o mealheiro.'
    );
    setNovoNome('');
    setNovoObjetivo('');
    setACriar(false);
  }

  function textoContribuicao(c: PoupancaPartilhadaMembroDto) {
    const valorMes = formatarEuro(c.valor);
    if (c.tipo === 'manual') return t('{valor}/mês, à mão', { valor: valorMes });
    if (c.diaDoSalario) return t('{valor}/mês, no dia do salário', { valor: valorMes });
    return t('{valor}/mês, no dia {dia}', { valor: valorMes, dia: c.diaFixo ?? '' });
  }

  if (lista === null) return <ActivityIndicator color={COR} style={styles.carregar} />;

  return (
    <>
      {lista.length === 0 && !aCriar && (
        <Cartao acento={COR}>
          <TituloSecao titulo={t('Mealheiros')} icone="wallet-outline" cor={COR} />
          <Text style={styles.nota}>
            {t('Um mealheiro junta dinheiro de todos para um objetivo (férias, casa, prenda). Cada um põe quando quer ou todos os meses, automaticamente.')}
          </Text>
        </Cartao>
      )}

      {lista.map((m) => {
        const minha = contribuicoes[m.id]?.find((c) => c.membroUid === user?.id);
        const outras = (contribuicoes[m.id] ?? []).filter((c) => c.membroUid !== user?.id);
        const percentagem = m.objetivo ? Math.min(100, (m.saldo / m.objetivo) * 100) : 0;
        const aberta = acao?.id === m.id ? acao.tipo : null;
        return (
          <Cartao key={m.id} acento={COR}>
            <TituloSecao titulo={m.nome} icone="wallet-outline" cor={COR} direita={<ValorEuro valor={m.saldo} cor={COR} style={styles.saldo} />} />

            {m.objetivo ? (
              <>
                <BarraProgresso percentagem={percentagem} cor={COR} />
                <Text style={styles.nota}>
                  {t('{atual} de {objetivo} ({pct}%)', {
                    atual: formatarEuro(m.saldo),
                    objetivo: formatarEuro(m.objetivo),
                    pct: Math.floor(percentagem),
                  })}
                  {m.dataObjetivo ? ` · ${t('até {data}', { data: formatarData(m.dataObjetivo) })}` : ''}
                </Text>
              </>
            ) : null}

            {/* Quanto pôs cada um */}
            {m.contribuidores.length > 0 && (
              <View style={styles.bloco}>
                {m.contribuidores.map((c) => (
                  <View key={c.uid} style={styles.linha}>
                    <Text style={[styles.nome, c.uid === user?.id && styles.eu]}>{c.uid === user?.id ? t('Tu') : c.nome}</Text>
                    <Text style={styles.valor}>{formatarEuro(c.total)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Contribuições mensais */}
            <View style={styles.bloco}>
              <Text style={styles.rotulo}>{t('Todos os meses')}</Text>
              <Text style={styles.nota}>{minha ? t('Tu: {texto}', { texto: textoContribuicao(minha) }) : t('Tu: sem contribuição mensal')}</Text>
              {!!minha && (
                <View style={styles.estadoMes}>
                  <Text style={[styles.estado, { color: minha.feitaEsteMes ? cores.positivo : cores.aviso }]}>
                    {minha.feitaEsteMes
                      ? t('✓ Já puseste este mês')
                      : minha.tipo === 'automatica'
                        ? t('Por pôr este mês (entra sozinho no dia certo)')
                        : t('Por pôr este mês (conta no previsto do fim do mês)')}
                  </Text>
                  {minha.tipo === 'manual' && !minha.feitaEsteMes && (
                    <Botao titulo={t('Já pus este mês')} pequeno variante="secundario" icone="checkmark" onPress={() => marcarFeita(m, true)} desativado={ocupado} />
                  )}
                  {minha.tipo === 'manual' && minha.feitaEsteMes && minha.ultimaContribuicaoMes === mesAtual() && (
                    <Botao titulo={t('Desmarcar')} pequeno variante="fantasma" onPress={() => marcarFeita(m, false)} desativado={ocupado} />
                  )}
                </View>
              )}
              {outras.map((c) => (
                <Text key={c.id} style={styles.nota}>
                  {c.membroNome}: {textoContribuicao(c)}
                </Text>
              ))}
            </View>

            <View style={styles.botoes}>
              <Botao titulo={t('Pôr dinheiro')} pequeno icone="add" onPress={() => abrir(m.id, 'contribuir')} />
              {souAdmin && <Botao titulo={t('Levantar')} pequeno variante="secundario" onPress={() => abrir(m.id, 'levantar')} />}
              <Botao titulo={minha ? t('Mudar mensal') : t('Contribuir todos os meses')} pequeno variante="fantasma" onPress={() => abrir(m.id, 'mensal')} />
              {souAdmin && (
                <>
                  <Botao titulo={m.objetivo ? t('Mudar objetivo') : t('Definir objetivo')} pequeno variante="fantasma" onPress={() => abrir(m.id, 'objetivo')} />
                  <Botao titulo={t('Mudar nome')} pequeno variante="fantasma" onPress={() => abrir(m.id, 'nome')} />
                </>
              )}
            </View>

            {aberta && (
              <View style={styles.form}>
                <CampoTexto
                  rotulo={
                    aberta === 'nome'
                      ? t('Nome')
                      : aberta === 'mensal'
                        ? t('Valor por mês (€)')
                        : aberta === 'objetivo'
                          ? t('Objetivo (€)')
                          : t('Valor (€)')
                  }
                  value={valor}
                  onChangeText={setValor}
                  keyboardType={aberta === 'nome' ? 'default' : 'decimal-pad'}
                  placeholder={aberta === 'nome' ? t('Ex: Férias 2027') : '0,00'}
                  autoFocus
                />
                {aberta === 'contribuir' && <Text style={styles.nota}>{t('Sai da tua conta.')}</Text>}
                {aberta === 'levantar' && <Text style={styles.nota}>{t('Entra na tua conta.')}</Text>}
                {aberta === 'mensal' && (
                  <>
                    <View style={styles.chips}>
                      <Chip rotulo={t('Automática')} ativo={tipo === 'automatica'} cor={COR} onPress={() => setTipo('automatica')} />
                      <Chip rotulo={t('Só lembrar')} ativo={tipo === 'manual'} cor={COR} onPress={() => setTipo('manual')} />
                    </View>
                    {tipo === 'automatica' && (
                      <View style={styles.chips}>
                        <Chip rotulo={t('No dia do salário')} ativo={diaDoSalario} cor={COR} onPress={() => setDiaDoSalario(true)} />
                        <Chip rotulo={t('Num dia fixo')} ativo={!diaDoSalario} cor={COR} onPress={() => setDiaDoSalario(false)} />
                      </View>
                    )}
                    {tipo === 'automatica' && !diaDoSalario && (
                      <CampoTexto rotulo={t('Dia do mês (1-28)')} value={diaFixo} onChangeText={setDiaFixo} keyboardType="number-pad" placeholder="1" />
                    )}
                    <Text style={styles.nota}>
                      {tipo === 'automatica'
                        ? t('Sai da tua conta todos os meses, se houver dinheiro. Se o dia deste mês já passou, começa no próximo.')
                        : t('Não mexe no dinheiro: fica só como lembrete para os outros verem.')}
                    </Text>
                  </>
                )}
                <View style={styles.botoes}>
                  <Botao titulo={t('Confirmar')} pequeno onPress={() => confirmarAcao(m)} aCarregar={ocupado} desativado={ocupado} />
                  {aberta === 'objetivo' && m.objetivo ? (
                    <Botao titulo={t('Remover objetivo')} pequeno variante="perigo" onPress={() => removerObjetivo(m)} desativado={ocupado} />
                  ) : null}
                  {aberta === 'mensal' && minha && (
                    <Botao titulo={t('Parar')} pequeno variante="perigo" onPress={() => pararContribuicao(m)} desativado={ocupado} />
                  )}
                  <Botao titulo={t('Cancelar')} pequeno variante="secundario" onPress={() => setAcao(null)} />
                </View>
              </View>
            )}

            {m.saldo === 0 && (
              <Botao titulo={t('Apagar mealheiro')} pequeno variante="fantasma" cor={cores.negativo} onPress={() => apagar(m)} style={styles.apagar} />
            )}
          </Cartao>
        );
      })}

      <Cartao acento={COR}>
        {aCriar ? (
          <>
            <TituloSecao titulo={t('Novo mealheiro')} icone="add-circle-outline" cor={COR} />
            <CampoTexto rotulo={t('Nome')} value={novoNome} onChangeText={setNovoNome} placeholder={t('Ex: Férias 2027')} />
            <CampoTexto
              rotulo={t('Objetivo (€, opcional)')}
              value={novoObjetivo}
              onChangeText={setNovoObjetivo}
              keyboardType="decimal-pad"
              placeholder="1200"
            />
            <View style={styles.botoes}>
              <Botao titulo={t('Criar')} pequeno onPress={criar} aCarregar={ocupado} desativado={ocupado} />
              <Botao titulo={t('Cancelar')} pequeno variante="secundario" onPress={() => setACriar(false)} />
            </View>
          </>
        ) : (
          <Botao titulo={t('Novo mealheiro')} icone="add" variante="secundario" cor={COR} onPress={() => setACriar(true)} />
        )}
      </Cartao>
    </>
  );
}

const styles = StyleSheet.create({
  carregar: { marginTop: espaco.xl },
  saldo: { fontSize: 18 },
  nota: { ...tipografia.nota, marginTop: espaco.xs },
  rotulo: { ...tipografia.rotulo, fontSize: 11 },
  bloco: { marginTop: espaco.md },
  estadoMes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espaco.sm, marginTop: espaco.xs },
  estado: { ...tipografia.nota },
  linha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  nome: { ...tipografia.secundario },
  eu: { fontFamily: fontes.corpoMedio, color: cores.texto },
  valor: { ...tipografia.valor, fontSize: 14 },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm, marginTop: espaco.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm, marginTop: espaco.sm },
  form: { marginTop: espaco.md, paddingTop: espaco.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  apagar: { marginTop: espaco.md, alignSelf: 'flex-start' },
});
