import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Header } from '../../../components/Header';
import { AcertoModal } from '../../../components/partilhado/AcertoModal';
import { DespesaPartilhadaModal } from '../../../components/partilhado/DespesaPartilhadaModal';
import { Mealheiros } from '../../../components/partilhado/Mealheiros';
import { SideMenu } from '../../../components/SideMenu';
import { Botao, CampoTexto, Cartao, CartaoSaldo, Chip, Ecra, formatarEuro, TituloSecao, ValorEuro } from '../../../components/ui';
import { comAlfa, cores, espaco, fontes, tipografia } from '../../../constants/tema';
import { useAuth } from '../../../contexts/AuthContext';
import { useGrupos } from '../../../contexts/ParceriasContext';
import { useT } from '../../../i18n';
import { atualizarAlertas } from '../../../services/alertas';
import { ouvir } from '../../../services/eventos';
import {
  eAdmin,
  GruposDB,
  mensagemDaApi,
  type ConviteGrupoDto,
  type GrupoDto,
  type GrupoMembroDto,
} from '../../../services/grupos';
import {
  PartilhadoDB,
  type AtividadeDto,
  type DespesaPartilhadaDto,
  type SaldosGrupoDto,
  type TransferenciaDto,
} from '../../../services/partilhado';
import { calcularSaldoDisponivel } from '../../../services/database';
import { infoCategoria } from '../../../utils/categorias';
import { confirmar } from '../../../utils/confirmar';
import { diaEMes } from '../../../utils/ecrasDespesas';
import { mostrarAlerta } from '../../../utils/helpers';
import { contarPendentes, pendentesDoGrupo, textoEfeito, textoTransferencia } from '../../../utils/partilhado';

const COR = cores.violetaTexto;

type Aba = 'pendentes' | 'atividade' | 'saldos' | 'mealheiros' | 'membros';

const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: 'pendentes', rotulo: 'Pendentes' },
  { chave: 'atividade', rotulo: 'Atividade' },
  { chave: 'saldos', rotulo: 'Saldos' },
  { chave: 'mealheiros', rotulo: 'Mealheiros' },
  { chave: 'membros', rotulo: 'Membros' },
];

interface Dados {
  grupo: GrupoDto;
  membros: GrupoMembroDto[];
  saldos: SaldosGrupoDto;
  atividade: AtividadeDto[];
  convites: ConviteGrupoDto[];
}

// Um grupo: no topo quanto devo ou tenho a receber (e a quem pagar), os botões "+ Despesa" e
// "Acertar contas", e por baixo o feed, os saldos de todos, os mealheiros e os membros
export default function GrupoScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [saldoConta, setSaldoConta] = useState<number | undefined>();
  const { recarregar: recarregarGrupos, resumo } = useGrupos();
  const [menuVisible, setMenuVisible] = useState(false);
  const [aba, setAba] = useState<Aba>('atividade');
  const abaEscolhida = useRef(false); // a aba inicial só se decide uma vez por grupo (depois manda o utilizador)
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);
  const [novaDespesa, setNovaDespesa] = useState(false);
  const [despesaAberta, setDespesaAberta] = useState<{ despesa: DespesaPartilhadaDto; podeApagar: boolean } | null>(null);
  const [acerto, setAcerto] = useState<{ sugestao: TransferenciaDto | null } | null>(null);
  const [emailConvite, setEmailConvite] = useState('');
  const [nomeEditado, setNomeEditado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ultimoPedido = useRef(0);

  const carregar = useCallback(async () => {
    if (!id) return;
    const pedido = ++ultimoPedido.current;
    try {
      const [grupo, membros, saldos, atividade, convites] = await Promise.all([
        GruposDB.obter(id),
        GruposDB.listarMembros(id),
        PartilhadoDB.saldos(id),
        PartilhadoDB.atividade(id),
        GruposDB.listarConvitesDoGrupo(id),
      ]);
      if (pedido !== ultimoPedido.current) return;
      setDados({ grupo, membros, saldos, atividade, convites });
      setErro(false);
      // Se há algo por resolver, abre logo nos Pendentes
      if (!abaEscolhida.current) {
        abaEscolhida.current = true;
        if (contarPendentes(atividade, saldos.transferencias, user?.id) > 0) setAba('pendentes');
      }
    } catch (error) {
      if (pedido !== ultimoPedido.current) return;
      console.error('Erro ao carregar o grupo:', error);
      setErro(true);
    }
  }, [id, user?.id]);

  // Outro grupo (o mesmo ecrã reaproveitado): não mostrar o anterior enquanto carrega
  const idMostrado = useRef(id);
  if (idMostrado.current !== id) {
    idMostrado.current = id;
    abaEscolhida.current = false;
    setDados(null);
    setAba('atividade');
  }

  const carregarSaldo = useCallback(() => {
    if (user?.id) calcularSaldoDisponivel(user.id).then(setSaldoConta).catch(() => {});
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      carregar();
      carregarSaldo();
      return ouvir('dadosMudaram', () => {
        carregar();
        carregarSaldo();
      });
    }, [carregar, carregarSaldo])
  );

  // Depois de mexer em dinheiro: o grupo, o resumo do menu/Início e o saldo da conta mudam
  async function aposAlterar() {
    void atualizarAlertas(); // o alerta de "confirma que recebeste" some logo depois de confirmar
    carregarSaldo();
    await carregar();
    await recarregarGrupos();
  }

  async function abrirAtividade(a: AtividadeDto) {
    if (a.tipo === 'despesa') {
      try {
        setDespesaAberta({ despesa: await PartilhadoDB.obterDespesa(a.id), podeApagar: a.podeApagar });
      } catch (error) {
        mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível abrir a despesa.')));
      }
    } else if (a.tipo === 'acerto' && a.podeConfirmar) {
      const ok = await confirmar(
        t('Confirmar que recebeste'),
        t('Recebeste {valor} de {de}? O valor entra na tua conta.', { valor: formatarEuro(a.valor), de: a.nome }),
        'Confirmar'
      );
      if (!ok) return;
      await correr(() => PartilhadoDB.confirmarAcerto(a.id), 'Não foi possível confirmar o pagamento.');
    } else if (a.tipo === 'acerto' && a.podeApagar) {
      const ok = await confirmar(
        t('Apagar pagamento'),
        t('Apagar o pagamento de {valor} de {de} a {para}? O dinheiro volta para trás nas duas contas.', {
          valor: formatarEuro(a.valor),
          de: a.nome,
          para: a.outroNome ?? '',
        }),
        'Apagar'
      );
      if (!ok) return;
      try {
        await PartilhadoDB.removerAcerto(a.id);
        await aposAlterar();
      } catch (error) {
        mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível apagar o pagamento.')));
      }
    }
  }

  async function aceitarEPagar(a: AtividadeDto) {
    if (!id || !user?.id) return;
    const grupoId = id;
    const uid = user.id;
    const valor = a.minhaParte ?? 0;
    const ok = await confirmar(
      t('Aceitar e pagar'),
      t('A tua parte de {valor} em "{titulo}" vai ser debitada da tua conta. No grupo fica como paga a {nome}. Não te esqueças de lhe transferir o dinheiro.', {
        valor: formatarEuro(valor),
        titulo: a.titulo,
        nome: a.nome,
      }),
      'Aceitar e pagar'
    );
    if (!ok) return;
    await correr(() => PartilhadoDB.aceitarEPagar(a.id, grupoId, uid, a.uid, valor), 'Não foi possível responder à despesa.');
  }

  async function correr(tarefa: () => Promise<unknown>, mensagemErro: string, depois?: () => void) {
    setOcupado(true);
    try {
      await tarefa();
      depois?.();
      await aposAlterar();
    } catch (error) {
      console.error(mensagemErro, error);
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t(mensagemErro)));
    } finally {
      setOcupado(false);
    }
  }

  async function convidar() {
    if (!id || !emailConvite.trim()) {
      mostrarAlerta(t('Erro'), t('Escreve o email da pessoa.'));
      return;
    }
    await correr(() => GruposDB.convidar(id, emailConvite.trim()), 'Não foi possível enviar o convite.', () => {
      setEmailConvite('');
      mostrarAlerta(t('Convite enviado'), t('A pessoa vê o convite no ecrã Poupança conjunta quando entrar na app com este email.'));
    });
  }

  async function guardarNome() {
    if (!id || nomeEditado === null) return;
    const nome = nomeEditado.trim();
    setNomeEditado(null);
    if (!nome || nome === dados?.grupo.nome) return;
    await correr(() => GruposDB.alterar(id, { nome }), 'Não foi possível alterar o nome.');
  }

  async function removerMembro(m: GrupoMembroDto) {
    if (!id) return;
    const ok = await confirmar(
      t('Remover membro'),
      t('Remover {nome} do grupo? As contas que já existem ficam no grupo.', { nome: m.nome }),
      'Remover'
    );
    if (ok) await correr(() => GruposDB.removerMembro(id, m.uid), 'Não foi possível remover o membro.');
  }

  async function sair() {
    if (!id) return;
    const ok = await confirmar(t('Sair do grupo'), t('Sair do grupo? Deixas de o ver; as contas que já existem ficam lá.'), 'Sair');
    if (!ok) return;
    try {
      await GruposDB.sair(id);
      await recarregarGrupos();
      router.back();
    } catch (error) {
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível sair do grupo.')));
    }
  }

  async function apagarGrupo() {
    if (!id || !dados) return;
    const ok = await confirmar(
      t('Apagar grupo'),
      t('Apagar o grupo "{nome}"? Só é possível com as contas acertadas e os mealheiros vazios.', { nome: dados.grupo.nome }),
      'Apagar'
    );
    if (!ok) return;
    try {
      await GruposDB.remover(id);
      await recarregarGrupos();
      router.back();
    } catch (error) {
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível apagar o grupo.')));
    }
  }

  // Os mealheiros deste grupo (no cartão do topo, à parte do saldo da conta corrente)
  const mealheirosDoGrupo = (resumo?.mealheiros ?? []).filter((m) => m.grupoId === id);
  const poupancaGrupo = mealheirosDoGrupo.reduce((s, m) => s + m.saldo, 0);

  const cabecalho = (
    <>
      <Header title={dados?.grupo.nome ?? t('Grupo')} onMenuPress={() => setMenuVisible(true)} saldo={saldoConta} />
      <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldoConta} />
    </>
  );

  if (!dados) {
    return (
      <Ecra cabecalho={cabecalho}>
        {erro ? (
          <Cartao>
            <Text style={styles.nota}>{t('Não foi possível abrir o grupo.')}</Text>
            <Botao titulo={t('Tentar outra vez')} variante="secundario" pequeno icone="refresh-outline" onPress={carregar} />
          </Cartao>
        ) : (
          <ActivityIndicator color={COR} style={styles.carregar} />
        )}
      </Ecra>
    );
  }

  const { grupo, membros, saldos, atividade, convites } = dados;
  const souAdmin = eAdmin(grupo.minhaRole);
  const minhas = saldos.transferencias.filter((tr) => tr.deUid === user?.id || tr.paraUid === user?.id);
  const variante = saldos.meuSaldo > 0.004 ? 'positivo' : saldos.meuSaldo < -0.004 ? 'negativo' : 'primario';
  const sozinho = membros.length < 2;
  const pendentes = pendentesDoGrupo(atividade, saldos.transferencias, user?.id);
  const nPendentes = contarPendentes(atividade, saldos.transferencias, user?.id);
  const aEsperar = pendentes.aReceber.length + pendentes.aEsperar.length;

  return (
    <Ecra
      cabecalho={cabecalho}
      keyboardShouldPersistTaps="handled"
      sobreposicao={
        <>
          <DespesaPartilhadaModal
            visivel={novaDespesa || despesaAberta !== null}
            grupoId={grupo.id}
            despesa={despesaAberta?.despesa}
            podeApagar={despesaAberta?.podeApagar}
            onFechar={() => {
              setNovaDespesa(false);
              setDespesaAberta(null);
            }}
            onGuardado={aposAlterar}
          />
          <AcertoModal
            visivel={acerto !== null}
            grupoId={grupo.id}
            membros={membros}
            sugestao={acerto?.sugestao}
            onFechar={() => setAcerto(null)}
            onGuardado={aposAlterar}
          />
        </>
      }
    >
      {/* O meu saldo no grupo e o que fazer com ele */}
      <CartaoSaldo
        rotulo={saldos.meuSaldo > 0.004 ? t('Tens a receber') : saldos.meuSaldo < -0.004 ? t('Deves') : t('Contas certas')}
        valor={Math.abs(saldos.meuSaldo)}
        variante={variante}
        icone="people-outline"
        subtitulo={t('{n} membros · este mês o grupo gastou {total} (a tua parte: {parte})', {
          n: membros.length,
          total: formatarEuro(saldos.totalGastoMes),
          parte: formatarEuro(saldos.minhaParteMes),
        })}
      >
        {resumo && mealheirosDoGrupo.length > 0 && (
          <View style={styles.poupancaLinha}>
            <View style={styles.poupancaCol}>
              <Text style={styles.poupancaRotulo}>{t('Poupança do grupo')}</Text>
              <ValorEuro valor={poupancaGrupo} cor={cores.aviso} style={styles.poupancaValor} />
            </View>
          </View>
        )}
        {minhas.map((tr) => (
          <View key={`${tr.deUid}-${tr.paraUid}`} style={styles.transferencia}>
            <Text style={styles.transferenciaTexto}>{textoTransferencia(tr, user?.id)}</Text>
            {tr.deUid === user?.id && <Botao titulo={t('Acertar')} pequeno variante="secundario" onPress={() => setAcerto({ sugestao: tr })} />}
          </View>
        ))}
      </CartaoSaldo>

      <View style={styles.acoes}>
        <Botao
          titulo={t('Despesa')}
          icone="add"
          onPress={() => (sozinho ? setAba('membros') : setNovaDespesa(true))}
          style={styles.acao}
        />
      </View>
      {sozinho && <Text style={styles.aviso}>{t('Convida pelo menos uma pessoa (em Membros) para começar a dividir despesas.')}</Text>}

      <View style={styles.abas}>
        {ABAS.map((a) => (
          <Chip
            key={a.chave}
            rotulo={t(a.rotulo)}
            ativo={aba === a.chave}
            cor={COR}
            contador={a.chave === 'pendentes' ? nPendentes : undefined}
            onPress={() => setAba(a.chave)}
          />
        ))}
      </View>

      {aba === 'pendentes' && (
        <>
          {nPendentes === 0 && aEsperar === 0 && (
            <Cartao>
              <Text style={styles.nota}>{t('Nada por resolver. Está tudo em dia.')}</Text>
            </Cartao>
          )}
          {nPendentes === 0 && aEsperar > 0 && (
            <Cartao>
              <Text style={styles.nota}>{t('Não tens nada por resolver. Só falta esperar pelos outros.')}</Text>
            </Cartao>
          )}

          {pendentes.porAceitar.length > 0 && (
            <Cartao acento={cores.aviso}>
              <TituloSecao titulo={t('Por aceitar')} icone="hourglass-outline" cor={cores.aviso} />
              {pendentes.porAceitar.map((a, i) => (
                <LinhaAtividade
                  key={`${a.tipo}-${a.id}`}
                  a={a}
                  meuUid={user?.id}
                  primeira={i === 0}
                  ocupado={ocupado}
                  onPress={() => abrirAtividade(a)}
                  onAceitar={() => aceitarEPagar(a)}
                />
              ))}
            </Cartao>
          )}

          {pendentes.porPagar.length > 0 && (
            <Cartao acento={cores.negativo}>
              <TituloSecao titulo={t('Por pagar')} icone="arrow-up-circle-outline" cor={cores.negativo} />
              {pendentes.porPagar.map((tr) => (
                <View key={`${tr.deUid}-${tr.paraUid}`} style={styles.linha}>
                  <Text style={[styles.linhaTexto, styles.destaque]}>{textoTransferencia(tr, user?.id)}</Text>
                  <Botao titulo={t('Acertar')} pequeno onPress={() => setAcerto({ sugestao: tr })} desativado={ocupado} />
                </View>
              ))}
            </Cartao>
          )}

          {/* Pagamentos que me fizeram: o dinheiro só entra na minha conta depois de eu confirmar que o recebi */}
          {pendentes.porConfirmar.length > 0 && (
            <Cartao acento={cores.aviso}>
              <TituloSecao titulo={t('Por confirmar')} icone="checkmark-done-outline" cor={cores.aviso} />
              {pendentes.porConfirmar.map((a) => (
                <View key={`confirmar-${a.id}`} style={styles.porConfirmar}>
                  <Text style={styles.porConfirmarTexto}>
                    {t('{de} diz que te pagou {valor}. Confirma que recebeste para o valor entrar na tua conta.', { de: a.nome, valor: formatarEuro(a.valor) })}
                  </Text>
                  <Botao titulo={t('Confirmar que recebi')} icone="checkmark" pequeno onPress={() => abrirAtividade(a)} desativado={ocupado} />
                </View>
              ))}
            </Cartao>
          )}

          {aEsperar > 0 && (
            <Cartao>
              <TituloSecao titulo={t('À espera dos outros')} icone="time-outline" />
              {pendentes.aReceber.map((tr) => (
                <View key={`${tr.deUid}-${tr.paraUid}`} style={styles.linha}>
                  <Text style={styles.linhaTexto}>{textoTransferencia(tr, user?.id)}</Text>
                </View>
              ))}
              {pendentes.aEsperar.map((a, i) => (
                <LinhaAtividade
                  key={`${a.tipo}-${a.id}`}
                  a={a}
                  meuUid={user?.id}
                  primeira={i === 0 && pendentes.aReceber.length === 0}
                  ocupado={ocupado}
                  onPress={() => abrirAtividade(a)}
                  onAceitar={() => {}}
                />
              ))}
            </Cartao>
          )}
        </>
      )}

      {aba === 'atividade' && (
        <Cartao>
          {atividade.length === 0 ? (
            <Text style={styles.nota}>{t('Ainda não há nada. Lança a primeira despesa com "+ Despesa".')}</Text>
          ) : (
            atividade.map((a, i) => (
              <LinhaAtividade
                key={`${a.tipo}-${a.id}`}
                a={a}
                meuUid={user?.id}
                primeira={i === 0}
                ocupado={ocupado}
                onPress={() => abrirAtividade(a)}
                onAceitar={() => aceitarEPagar(a)}
              />
            ))
          )}
        </Cartao>
      )}

      {aba === 'saldos' && (
        <>
          <Cartao acento={COR}>
            <TituloSecao titulo={t('Quem deve a quem')} icone="git-compare-outline" cor={COR} />
            {saldos.transferencias.length === 0 ? (
              <Text style={styles.nota}>{t('Está tudo acertado.')}</Text>
            ) : (
              saldos.transferencias.map((tr) => {
                const comigo = tr.deUid === user?.id || tr.paraUid === user?.id;
                // Só quem paga regista o acerto
                const pagoEu = tr.deUid === user?.id;
                return (
                  <View key={`${tr.deUid}-${tr.paraUid}`} style={styles.linha}>
                    <Text style={[styles.linhaTexto, comigo && styles.destaque]}>{textoTransferencia(tr, user?.id)}</Text>
                    {pagoEu && <Botao titulo={t('Acertar')} pequeno variante="secundario" onPress={() => setAcerto({ sugestao: tr })} />}
                  </View>
                );
              })
            )}
            <Text style={styles.nota}>{t('Já simplificado: o mínimo de pagamentos para ficar tudo a zero.')}</Text>
          </Cartao>
          <Cartao>
            <TituloSecao titulo={t('Saldo de cada um')} icone="people-outline" />
            {saldos.membros.map((m) => (
              <View key={m.uid} style={styles.linha}>
                <Text style={[styles.linhaTexto, m.souEu && styles.destaque]}>
                  {m.souEu ? t('Tu') : m.nome}
                  {!m.ativo ? ` ${t('(saiu)')}` : ''}
                </Text>
                <ValorEuro valor={m.saldo} tipo="auto" prefixo={m.saldo > 0 ? '+' : ''} />
              </View>
            ))}
          </Cartao>
        </>
      )}

      {aba === 'mealheiros' && <Mealheiros grupoId={grupo.id} souAdmin={souAdmin} onAlterado={aposAlterar} />}

      {aba === 'membros' && (
        <>
          <Cartao>
            <TituloSecao titulo={t('Membros')} icone="people-outline" />
            {membros.map((m) => (
              <View key={m.uid} style={styles.membro}>
                <View style={styles.membroInfo}>
                  <Text style={[styles.linhaTexto, m.souEu && styles.destaque]}>
                    {m.souEu ? t('{nome} (tu)', { nome: m.nome }) : m.nome}
                  </Text>
                  <Text style={styles.nota}>{eAdmin(m.role) ? t('Admin') : t('Membro')}{m.email ? ` · ${m.email}` : ''}</Text>
                </View>
                {souAdmin && !m.souEu && (
                  <View style={styles.membroBotoes}>
                    <Botao
                      titulo={eAdmin(m.role) ? t('Tirar admin') : t('Tornar admin')}
                      pequeno
                      variante="fantasma"
                      onPress={() => correr(() => GruposDB.alterarRole(grupo.id, m.uid, eAdmin(m.role) ? 'membro' : 'admin'), 'Não foi possível alterar o papel.')}
                    />
                    {!eAdmin(m.role) && <Botao titulo={t('Remover')} pequeno variante="fantasma" cor={cores.negativo} onPress={() => removerMembro(m)} />}
                  </View>
                )}
              </View>
            ))}
          </Cartao>

          <Cartao acento={COR}>
            <TituloSecao titulo={t('Convidar')} icone="person-add-outline" cor={COR} />
            <CampoTexto
              rotulo={t('Email')}
              value={emailConvite}
              onChangeText={setEmailConvite}
              placeholder={t('email@exemplo.com')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Botao titulo={t('Enviar convite')} pequeno onPress={convidar} aCarregar={ocupado} desativado={ocupado} />
            {convites.length > 0 && (
              <View style={styles.bloco}>
                <Text style={styles.rotulo}>{t('À espera de resposta')}</Text>
                {convites.map((c) => (
                  <View key={c.id} style={styles.linha}>
                    <Text style={styles.linhaTexto}>{c.email}</Text>
                    <Botao
                      titulo={t('Cancelar')}
                      pequeno
                      variante="fantasma"
                      onPress={() => correr(() => GruposDB.cancelarConvite(c.id), 'Não foi possível cancelar o convite.')}
                    />
                  </View>
                ))}
              </View>
            )}
          </Cartao>

          <Cartao>
            <TituloSecao titulo={t('Grupo')} icone="settings-outline" />
            {souAdmin && nomeEditado !== null && (
              <>
                <CampoTexto rotulo={t('Nome do grupo')} value={nomeEditado} onChangeText={setNomeEditado} onSubmitEditing={guardarNome} autoFocus />
                <View style={styles.acoes}>
                  <Botao titulo={t('Guardar')} pequeno onPress={guardarNome} />
                  <Botao titulo={t('Cancelar')} pequeno variante="secundario" onPress={() => setNomeEditado(null)} />
                </View>
              </>
            )}
            {nomeEditado === null && (
              <View style={styles.botoesGrupo}>
                {souAdmin && <Botao titulo={t('Mudar o nome')} pequeno variante="secundario" icone="create-outline" onPress={() => setNomeEditado(grupo.nome)} />}
                <Botao titulo={t('Sair do grupo')} pequeno variante="secundario" icone="exit-outline" onPress={sair} />
                {souAdmin && <Botao titulo={t('Apagar grupo')} pequeno variante="perigo" icone="trash-outline" onPress={apagarGrupo} />}
              </View>
            )}
          </Cartao>
        </>
      )}
    </Ecra>
  );
}

// Uma linha do feed: o que foi, quem pagou e o efeito no meu saldo
function LinhaAtividade({
  a,
  meuUid,
  primeira,
  ocupado,
  onPress,
  onAceitar,
}: {
  a: AtividadeDto;
  meuUid?: string;
  primeira: boolean;
  ocupado: boolean;
  onPress: () => void;
  onAceitar: () => void;
}) {
  const t = useT();
  const euPaguei = a.uid === meuUid;
  let icone: keyof typeof Ionicons.glyphMap = 'receipt-outline';
  let corIcone = COR;
  let titulo = a.titulo;
  let detalhe: string;
  // Despesa que ainda não está fechada: eu por aceitar, ou (se fui eu que lancei) outros por aceitar
  const euPorAceitar = a.tipo === 'despesa' && a.meuEstado === 'pendente';
  const outrosPorAceitar = a.tipo === 'despesa' && !euPorAceitar ? (a.porAceitar ?? 0) : 0;
  const emEspera = euPorAceitar || outrosPorAceitar > 0;

  if (a.tipo === 'despesa') {
    const categoria = infoCategoria(a.categoria);
    corIcone = emEspera ? cores.aviso : categoria.cor;
    if (emEspera) icone = 'hourglass-outline';
    detalhe = euPaguei ? t('Pago por ti') : t('Pago por {nome}', { nome: a.nome });
    if (euPorAceitar) detalhe = `${detalhe} · ${t('por aceitar')}`;
    else if (outrosPorAceitar > 0) detalhe = `${detalhe} · ${t('{n} por aceitar', { n: outrosPorAceitar })}`;
    else if (a.meuEstado === 'recusada') detalhe = `${detalhe} · ${t('recusaste')}`;
  } else if (a.tipo === 'acerto') {
    icone = 'swap-horizontal-outline';
    corIcone = cores.positivo;
    if (euPaguei) titulo = t('Pagaste a {para}', { para: a.outroNome ?? '' });
    else if (a.outroUid === meuUid) titulo = t('{de} pagou-te', { de: a.nome });
    else titulo = t('{de} pagou a {para}', { de: a.nome, para: a.outroNome ?? '' });
    detalhe = a.confirmado === false ? t('Acerto de contas · por confirmar') : t('Acerto de contas');
  } else {
    icone = 'wallet-outline';
    corIcone = cores.aviso;
    if (euPaguei) titulo = a.valor >= 0 ? t('Puseste no mealheiro') : t('Levantaste do mealheiro');
    else titulo = a.valor >= 0 ? t('{nome} pôs no mealheiro', { nome: a.nome }) : t('{nome} levantou do mealheiro', { nome: a.nome });
    detalhe = a.titulo;
  }

  const entro = a.tipo === 'despesa' ? a.minhaParte !== undefined || a.uid === meuUid : a.uid === meuUid || a.outroUid === meuUid;
  let efeito: string | null;
  let corEfeito = a.efeito > 0.004 ? cores.positivo : a.efeito < -0.004 ? cores.negativo : cores.textoMudo;
  if (a.tipo === 'mealheiro') {
    efeito = null;
  } else if (a.tipo === 'acerto' && a.outroUid === meuUid) {
    // Um pagamento que recebo não é uma dívida minha: só entra na conta quando confirmo que o recebi
    efeito = a.confirmado === false ? t('toca para confirmar') : t('recebeste {valor}', { valor: formatarEuro(a.valor) });
    corEfeito = a.confirmado === false ? cores.aviso : cores.positivo;
  } else if (a.tipo === 'acerto' && euPaguei) {
    efeito = t('acertaste {valor}', { valor: formatarEuro(a.valor) });
    corEfeito = cores.textoMudo;
  } else {
    efeito = textoEfeito(a.efeito, entro);
  }
  const clicavel = a.tipo === 'despesa' || (a.tipo === 'acerto' && (a.podeApagar || !!a.podeConfirmar));

  return (
    <View style={[!primeira && styles.separada, emEspera && styles.emEspera]}>
      <Pressable
        onPress={onPress}
        disabled={!clicavel}
        style={({ pressed }) => [styles.atividade, pressed && clicavel && styles.premida]}
        accessibilityRole={clicavel ? 'button' : undefined}
      >
        <View style={[styles.icone, { backgroundColor: comAlfa(corIcone, 0.12), borderColor: comAlfa(corIcone, 0.35) }]}>
          <Ionicons name={icone} size={18} color={corIcone} />
        </View>
        <View style={styles.atividadeTextos}>
          <Text style={styles.atividadeTitulo} numberOfLines={1}>
            {titulo}
          </Text>
          <Text style={[styles.nota, emEspera && { color: cores.aviso }]} numberOfLines={1}>
            {detalhe} · {diaEMes(a.data) || a.data}
          </Text>
        </View>
        <View style={styles.atividadeValores}>
          <Text style={styles.atividadeValor}>{formatarEuro(Math.abs(a.valor))}</Text>
          {efeito && <Text style={[styles.efeito, { color: corEfeito }]}>{efeito}</Text>}
        </View>
      </Pressable>
      {euPorAceitar && (
        <View style={styles.acoesLinha}>
          <Botao titulo={t('Aceitar e pagar')} icone="checkmark" pequeno onPress={onAceitar} desativado={ocupado} />
          <Botao titulo={t('Ver ou recusar')} pequeno variante="fantasma" onPress={onPress} desativado={ocupado} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  carregar: { marginTop: espaco.xxxl },
  nota: { ...tipografia.nota },
  aviso: { ...tipografia.nota, color: cores.aviso, marginBottom: espaco.md },
  rotulo: { ...tipografia.rotulo, fontSize: 11, marginBottom: espaco.xs },
  transferencia: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco.sm, marginTop: espaco.sm },
  transferenciaTexto: { ...tipografia.corpoMedio, color: cores.textoHero, flexShrink: 1 },
  poupancaLinha: { flexDirection: 'row', gap: espaco.md, marginTop: espaco.md, paddingTop: espaco.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  poupancaCol: { flex: 1, alignItems: 'center' },
  poupancaRotulo: { ...tipografia.nota, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10 },
  poupancaValor: { fontSize: 17 },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm, marginBottom: espaco.md },
  acao: { flexGrow: 1 },
  abas: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm, marginBottom: espaco.md },
  porConfirmar: { paddingVertical: espaco.sm, gap: espaco.sm },
  porConfirmarTexto: { ...tipografia.corpo },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco.sm, paddingVertical: espaco.sm },
  linhaTexto: { ...tipografia.corpo, flexShrink: 1 },
  destaque: { fontFamily: fontes.corpoMedio },
  bloco: { marginTop: espaco.md },
  membro: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco.sm, paddingVertical: espaco.sm },
  membroInfo: { flexShrink: 1 },
  membroBotoes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: espaco.xs },
  botoesGrupo: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm },
  atividade: { flexDirection: 'row', alignItems: 'center', gap: espaco.md, paddingVertical: espaco.md },
  separada: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  premida: { opacity: 0.7 },
  // Despesa por aceitar: fundo e barra lateral cor de aviso
  emEspera: { backgroundColor: comAlfa(cores.aviso, 0.07), borderLeftWidth: 3, borderLeftColor: cores.aviso, paddingLeft: espaco.sm, marginHorizontal: -espaco.sm, paddingRight: espaco.sm, borderRadius: 6 },
  acoesLinha: { paddingLeft: 36 + espaco.md, flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm, paddingBottom: espaco.md },
  icone: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  atividadeTextos: { flex: 1 },
  atividadeTitulo: { ...tipografia.corpoMedio },
  atividadeValores: { alignItems: 'flex-end' },
  atividadeValor: { ...tipografia.valor },
  efeito: { ...tipografia.nota, marginTop: 2 },
});
