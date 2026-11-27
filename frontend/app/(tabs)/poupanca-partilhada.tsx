import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BarraProgresso } from '../../components/BarraProgresso';
import { Header } from '../../components/Header';
import { SideMenu } from '../../components/SideMenu';
import { Botao, CampoTexto, Cartao, CartaoSaldo, Ecra, Etiqueta, formatarEuro, TituloSecao, ValorEuro } from '../../components/ui';
import { comAlfa, cores, espaco, fontes, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useGrupos } from '../../contexts/ParceriasContext';
import { useT } from '../../i18n';
import { eAdmin, GruposDB, mensagemDaApi, type ConvitesRecebidosDto } from '../../services/grupos';
import { calcularSaldoDisponivel } from '../../services/database';
import { mostrarAlerta } from '../../utils/helpers';
import { textoSaldo, textoTransferencia } from '../../utils/partilhado';

const COR = cores.violetaTexto;
const COR_POUPANCA = cores.aviso;
// Abaixo desta largura os dois cartões de cima ficam com o número mais pequeno (para caberem lado a lado)
const LARGURA_COMPACTA = 600;

// Poupança conjunta: quanto já poupei nos mealheiros dos grupos, quanto têm agora, se devo ou me devem,
// os mealheiros e os grupos (cada um abre o ecrã grupo/[id]). Os grupos criam-se aqui mesmo
export default function PoupancaConjuntaScreen() {
  const t = useT();
  const { emailConfirmado, enviarConfirmacaoEmail, verificarConfirmacaoEmail, user } = useAuth();
  const { grupos, resumo, recarregar, isLoading } = useGrupos();
  const { width } = useWindowDimensions();
  const [menuVisible, setMenuVisible] = useState(false);
  const [convites, setConvites] = useState<ConvitesRecebidosDto | null>(null);
  const [aProcessar, setAProcessar] = useState<string | null>(null);
  const [saldoConta, setSaldoConta] = useState<number | undefined>();
  const [nomeGrupo, setNomeGrupo] = useState('');
  const [aCriarGrupo, setACriarGrupo] = useState(false);

  const carregarConvites = useCallback(async () => {
    try {
      setConvites(await GruposDB.listarConvitesRecebidos());
    } catch (error) {
      console.error('Erro ao carregar convites:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      recarregar();
      carregarConvites();
      if (user?.id) calcularSaldoDisponivel(user.id).then(setSaldoConta).catch(() => {});
    }, [recarregar, carregarConvites, user?.id])
  );

  async function responder(conviteId: string, aceitar: boolean) {
    if (aProcessar) return;
    setAProcessar(conviteId);
    try {
      if (aceitar) await GruposDB.aceitarConvite(conviteId);
      else await GruposDB.recusarConvite(conviteId);
      await Promise.all([carregarConvites(), recarregar()]);
    } catch (error) {
      console.error('Erro ao responder ao convite:', error);
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível responder ao convite.')));
    } finally {
      setAProcessar(null);
    }
  }

  async function reenviarConfirmacao() {
    const erro = await enviarConfirmacaoEmail();
    mostrarAlerta(
      erro ? t('Erro') : t('Email enviado'),
      erro ?? t('Abre o link no email {email} e depois volta aqui e carrega em "Já confirmei".', { email: user?.email ?? '' })
    );
  }

  async function jaConfirmei() {
    if (await verificarConfirmacaoEmail()) {
      await carregarConvites();
      await recarregar();
    } else {
      mostrarAlerta(t('Ainda não'), t('O email ainda não está confirmado. Abre o link que recebeste e tenta outra vez.'));
    }
  }

  const abrirGrupo = (id: string) => router.push(`/(tabs)/grupo/${id}` as Href);

  async function criarGrupo() {
    if (!nomeGrupo.trim()) {
      mostrarAlerta(t('Erro'), t('Escreve o nome do grupo.'));
      return;
    }
    setACriarGrupo(true);
    try {
      const { id } = await GruposDB.criar(nomeGrupo.trim());
      setNomeGrupo('');
      await recarregar();
      abrirGrupo(id);
    } catch (error) {
      console.error('Erro ao criar grupo:', error);
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível criar o grupo.')));
    } finally {
      setACriarGrupo(false);
    }
  }

  // Criar um grupo novo (aparece com ou sem grupos)
  const cartaoNovoGrupo = (
    <Cartao>
      <TituloSecao titulo={t('Novo grupo')} icone="add-circle-outline" cor={COR} />
      <CampoTexto rotulo={t('Nome do grupo')} value={nomeGrupo} onChangeText={setNomeGrupo} placeholder={t('Ex: Casa, Férias, Família...')} />
      <Botao titulo={t('Criar grupo')} icone="add" onPress={criarGrupo} aCarregar={aCriarGrupo} desativado={aCriarGrupo} />
    </Cartao>
  );

  const listaConvites = convites?.convites ?? [];
  const mealheiros = resumo?.mealheiros ?? [];
  const temosAgora = mealheiros.reduce((s, m) => s + m.saldo, 0);
  const aReceber = resumo?.aReceber ?? 0;
  const aPagar = resumo?.aPagar ?? 0;
  const liquido = aReceber - aPagar;
  const transferencias = (resumo?.grupos ?? []).flatMap((g) =>
    g.minhasTransferencias.map((tr) => ({ ...tr, grupoId: g.grupoId, grupoNome: g.nome }))
  );
  const compacto = width < LARGURA_COMPACTA;

  return (
    <Ecra
      cabecalho={
        <>
          <Header title={t('Poupança conjunta')} onMenuPress={() => setMenuVisible(true)} saldo={saldoConta} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldoConta} />
        </>
      }
    >
      {/* Convites (só com o email confirmado: o convite é para quem é dono do email) */}
      {convites && !convites.emailConfirmado && !emailConfirmado && (
        <Cartao acento={cores.aviso}>
          <TituloSecao titulo={t('Confirma o teu email')} icone="mail-unread-outline" cor={cores.aviso} />
          <Text style={styles.nota}>
            {t('Para veres e aceitares convites de grupos tens de confirmar o email {email}.', { email: user?.email ?? '' })}
          </Text>
          <View style={styles.botoes}>
            <Botao titulo={t('Enviar o email outra vez')} pequeno variante="secundario" onPress={reenviarConfirmacao} />
            <Botao titulo={t('Já confirmei')} pequeno onPress={jaConfirmei} />
          </View>
        </Cartao>
      )}

      {listaConvites.length > 0 && (
        <Cartao acento={COR} brilho>
          <TituloSecao titulo={t('Convites')} icone="mail-outline" cor={COR} />
          {listaConvites.map((c) => (
            <View key={c.id} style={styles.convite}>
              <Text style={styles.texto}>
                {c.convidadoPorNome
                  ? t('{nome} convidou-te para «{grupo}»', { nome: c.convidadoPorNome, grupo: c.grupoNome })
                  : t('Convite para «{grupo}»', { grupo: c.grupoNome })}
              </Text>
              <View style={styles.botoes}>
                <Botao titulo={t('Aceitar')} pequeno onPress={() => responder(c.id, true)} aCarregar={aProcessar === c.id} desativado={!!aProcessar} />
                <Botao titulo={t('Recusar')} pequeno variante="secundario" onPress={() => responder(c.id, false)} desativado={!!aProcessar} />
              </View>
            </View>
          ))}
        </Cartao>
      )}

      {isLoading && grupos.length === 0 ? (
        <ActivityIndicator color={COR} style={styles.carregar} />
      ) : grupos.length === 0 ? (
        <>
          <Cartao>
            <TituloSecao titulo={t('Poupar e dividir com outras pessoas')} icone="people-outline" cor={COR} />
            <Text style={styles.nota}>
              {t('Cria um grupo (casa, férias, amigos) e convida as pessoas pelo email. Juntam dinheiro num mealheiro do grupo, lançam as despesas e a app diz quem deve a quem.')}
            </Text>
          </Cartao>
          {cartaoNovoGrupo}
        </>
      ) : (
        <>
          {/* Em grande: o que há agora nos mealheiros */}
          <View style={styles.destaques}>
            <CartaoSaldo
              variante="primario"
              alertaNegativo={false}
              compacto={compacto}
              rotulo={t('Temos agora')}
              valor={resumo ? temosAgora : undefined}
              icone="wallet-outline"
              subtitulo={
                resumo
                  ? mealheiros.length === 1
                    ? t('Em 1 mealheiro')
                    : t('Em {n} mealheiros', { n: mealheiros.length })
                  : undefined
              }
              style={styles.destaque}
            >
            </CartaoSaldo>
          </View>

          {/* Se devo ou se me devem */}
          <Cartao acento={liquido > 0.004 ? cores.positivo : liquido < -0.004 ? cores.negativo : COR}>
            <TituloSecao
              titulo={liquido > 0.004 ? t('Devem-te dinheiro') : liquido < -0.004 ? t('Deves dinheiro') : t('Contas certas')}
              icone="swap-horizontal-outline"
              cor={liquido > 0.004 ? cores.positivo : liquido < -0.004 ? cores.negativo : COR}
              direita={
                resumo && Math.abs(liquido) > 0.004 ? (
                  <ValorEuro valor={liquido} tipo="auto" prefixo={liquido > 0 ? '+' : ''} style={styles.liquido} />
                ) : undefined
              }
            />
            {transferencias.length > 0 ? (
              transferencias.map((tr, i) => {
                const recebo = tr.paraUid === user?.id;
                return (
                  <Pressable
                    key={`${tr.grupoId}-${tr.deUid}-${tr.paraUid}-${i}`}
                    onPress={() => abrirGrupo(tr.grupoId)}
                    style={({ pressed }) => [styles.linha, i > 0 && styles.separado, pressed && styles.premido]}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name={recebo ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                      size={20}
                      color={recebo ? cores.positivo : cores.negativo}
                    />
                    <View style={styles.linhaTextos}>
                      <Text style={styles.texto}>{textoTransferencia(tr, user?.id)}</Text>
                      <Text style={styles.nota}>{tr.grupoNome}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={cores.textoMudo} />
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.nota}>{t('Ninguém te deve nada e não deves nada a ninguém.')}</Text>
            )}
            {(aReceber > 0.004 || aPagar > 0.004) && (
              <Text style={[styles.nota, styles.rodape]}>
                {t('A receber {receber} · A pagar {pagar}', { receber: formatarEuro(aReceber), pagar: formatarEuro(aPagar) })}
              </Text>
            )}
          </Cartao>

          {/* Os mealheiros: quanto têm e quanto é meu */}
          <Cartao acento={COR_POUPANCA}>
            <TituloSecao titulo={t('Mealheiros')} icone="wallet-outline" cor={COR_POUPANCA} />
            {mealheiros.length === 0 ? (
              <Text style={styles.nota}>{t('Ainda não há mealheiros. Abre um grupo para criar um e começar a juntar dinheiro.')}</Text>
            ) : (
              mealheiros.map((m, i) => (
                <Pressable
                  key={m.id}
                  onPress={() => abrirGrupo(m.grupoId)}
                  style={({ pressed }) => [styles.mealheiro, i > 0 && styles.separado, pressed && styles.premido]}
                  accessibilityRole="button"
                >
                  <View style={styles.linhaTopo}>
                    <View style={styles.linhaTextos}>
                      <Text style={styles.nome} numberOfLines={1}>
                        {m.nome}
                      </Text>
                      <Text style={styles.nota} numberOfLines={1}>
                        {m.grupoNome}
                      </Text>
                    </View>
                    <ValorEuro valor={m.saldo} cor={COR_POUPANCA} style={styles.saldoMealheiro} />
                  </View>
                  {m.objetivo ? (
                    <>
                      <BarraProgresso percentagem={(m.saldo / m.objetivo) * 100} cor={COR_POUPANCA} altura={6} style={styles.barra} />
                      <Text style={styles.nota}>
                        {t('{atual} de {objetivo} ({pct}%)', {
                          atual: formatarEuro(m.saldo),
                          objetivo: formatarEuro(m.objetivo),
                          pct: Math.floor(Math.min(100, (m.saldo / m.objetivo) * 100)),
                        })}
                      </Text>
                    </>
                  ) : null}
                </Pressable>
              ))
            )}
          </Cartao>

          {/* Os grupos (cada um abre para gerir) */}
          <Cartao>
            <TituloSecao titulo={t('Os teus grupos')} icone="people-outline" cor={COR} />
            {grupos.map((g, i) => {
              const cor = g.meuSaldo > 0.004 ? cores.positivo : g.meuSaldo < -0.004 ? cores.negativo : cores.textoMudo;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => abrirGrupo(g.id)}
                  style={({ pressed }) => [styles.linha, i > 0 && styles.separado, pressed && styles.premido]}
                  accessibilityRole="button"
                >
                  <View style={[styles.avatar, { backgroundColor: comAlfa(COR, 0.14), borderColor: comAlfa(COR, 0.4) }]}>
                    <Text style={styles.avatarLetra}>{g.nome.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.linhaTextos}>
                    <View style={styles.nomeLinha}>
                      <Text style={[styles.nome, styles.nomeFlex]} numberOfLines={1}>
                        {g.nome}
                      </Text>
                      {eAdmin(g.minhaRole) && <Etiqueta texto="Admin" cor={cores.primaria} />}
                    </View>
                    <Text style={styles.nota}>
                      {g.totalMembros === 1 ? t('1 membro') : t('{count} membros', { count: g.totalMembros })}
                    </Text>
                  </View>
                  <Text style={[styles.saldoGrupo, { color: cor }]}>{textoSaldo(g.meuSaldo)}</Text>
                  <Ionicons name="chevron-forward" size={18} color={cores.textoMudo} />
                </Pressable>
              );
            })}
          </Cartao>

          {cartaoNovoGrupo}
        </>
      )}
    </Ecra>
  );
}

const styles = StyleSheet.create({
  carregar: { marginTop: espaco.xl },
  nota: { ...tipografia.nota },
  texto: { ...tipografia.corpo },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm, marginTop: espaco.sm },
  convite: { paddingVertical: espaco.sm },
  destaques: { flexDirection: 'row', gap: espaco.md, marginBottom: espaco.md },
  destaque: { flex: 1, marginBottom: 0 },
  poupancaLinha: { alignItems: 'center', marginTop: espaco.sm, gap: 2 },
  poupancaValor: { fontSize: 17 },
  liquido: { fontSize: 18 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: espaco.md, paddingVertical: espaco.md },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.md },
  linhaTextos: { flex: 1 },
  separado: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  premido: { opacity: 0.7 },
  rodape: { marginTop: espaco.sm },
  mealheiro: { paddingVertical: espaco.md, gap: espaco.xs },
  saldoMealheiro: { fontSize: 18 },
  barra: { marginTop: espaco.xs },
  nome: { ...tipografia.corpoMedio },
  nomeLinha: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },
  nomeFlex: { flexShrink: 1 },
  saldoGrupo: { ...tipografia.nota, fontSize: 13, fontFamily: fontes.corpoMedio },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarLetra: { ...tipografia.tituloCartao, color: COR },
});
