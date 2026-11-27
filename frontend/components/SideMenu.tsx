import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import { useContext } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { COR_CARTAO, COR_CONTA, ICONE_CARTAO, ICONE_CONTA } from '../constants/meiosPagamento';
import { comAlfa, cores, esquemaAplicado, espaco, fontes, gradientes, layout, raio, sombras, tipografia } from '../constants/tema';
import { useAuth } from '../contexts/AuthContext';
import { useGrupos } from '../contexts/ParceriasContext';
import { useDefinicoes } from '../services/definicoes';
import { useSaldoCartao } from '../services/saldoCartao';
import { paginasVisiveisDoGrupo } from '../utils/paginas';
import { useT, type Tradutor, useIdioma, definirIdioma, type Idioma } from '../i18n';
import { mudarTema } from '../services/tema';
import { caminhoDe, GRUPOS_MENU, type GrupoMenu } from './Separadores';
import { Icone, IconeOuEmoji, ValorEuro } from './ui';

interface SideMenuProps {
  visible: boolean;
  onClose: () => void;
  saldo?: number;
}

interface ItemMenu {
  label: string;
  route: string;
  icon: IconeOuEmoji;
  badge?: number; // ex.: convites por responder
  badgeRotulo?: string; // o que o número quer dizer, para o leitor de ecrã
  grupo?: GrupoMenu; // vários ecrãs numa só entrada: fica ativa em qualquer um deles
}

// O menu em secções: o dia a dia primeiro, depois o planeamento e o resto.
// A lista resolve-se dentro do render (recebe a função de tradução), senão fica presa no primeiro idioma
function secoesMenu(t: Tradutor, convitesPendentes: number, ocultos: readonly string[]): { titulo: string; itens: ItemMenu[] }[] {
  const visivel = (id: string) => !ocultos.includes(id);
  // Um grupo entra pela primeira página que ainda se vê; sem nenhuma, não aparece
  const entrada = (grupo: GrupoMenu) => paginasVisiveisDoGrupo(grupo, ocultos)[0]?.rota;
  const rotaCompromissos = entrada('compromissos');
  const rotaPlaneamento = entrada('planeamento');
  const rotaMes = entrada('mes');
  const secoes: { titulo: string; itens: (ItemMenu | false)[] }[] = [
    {
      titulo: t('Dia a dia'),
      itens: [
        { label: t('Início'), route: '/(tabs)/welcome', icon: 'home-outline' },
        visivel('despesas-extras') && { label: t('Gastos do Dia a Dia'), route: '/(tabs)/despesas-extras', icon: 'nota:asas' },
        !!rotaCompromissos && { label: t('Compromissos'), route: rotaCompromissos, icon: 'repeat-outline', grupo: 'compromissos' },
        visivel('salario') && { label: t('Salário'), route: '/(tabs)/salario', icon: 'cash-outline' },
      ],
    },
    {
      titulo: t('Planeamento'),
      itens: [
        !!rotaPlaneamento && { label: t('Orçamentos e poupança'), route: rotaPlaneamento, icon: 'pie-chart-outline', grupo: 'planeamento' },
        // Com convites por responder aparece sempre: é aqui que se veem
        (visivel('poupanca-partilhada') || convitesPendentes > 0) && {
          label: t('Poupança conjunta'),
          route: '/(tabs)/poupanca-partilhada',
          icon: 'people-outline',
          badge: convitesPendentes,
          badgeRotulo: t('{n} convites por responder', { n: convitesPendentes }),
        },
      ],
    },
    {
      titulo: t('Outros'),
      itens: [
        !!rotaMes && { label: t('Resumo e calendário'), route: rotaMes, icon: 'stats-chart-outline', grupo: 'mes' },
        { label: t('Definições'), route: '/(tabs)/definicoes', icon: 'settings-outline' },
      ],
    },
  ];
  return secoes
    .map((secao) => ({ ...secao, itens: secao.itens.filter((i): i is ItemMenu => !!i) }))
    .filter((secao) => secao.itens.length > 0);
}

export function SideMenu({ visible, onClose, saldo }: SideMenuProps) {
  const { user, logout } = useAuth();
  const { convitesPendentes } = useGrupos();
  const t = useT();
  const idioma = useIdioma();
  const ocultos = useDefinicoes()?.ocultos ?? [];
  const secoes = secoesMenu(t, convitesPendentes, ocultos);
  const caminhoAtual = usePathname();
  const insets = useContext(SafeAreaInsetsContext);
  const topo = insets?.top ?? (Platform.OS === 'web' ? 0 : 36);
  const nome = user?.name || user?.email || '';
  const saldoCartao = useSaldoCartao(user?.id);

  function navigateTo(route: string) {
    onClose();
    router.push(route as any);
  }

  // O mesmo que o botão de sair do cabeçalho
  async function sair() {
    onClose();
    await logout();
    router.replace('/login');
  }

  async function mudarIdioma(novo: Idioma) {
    await definirIdioma(novo);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.menu, { paddingTop: topo + espaco.lg, paddingBottom: insets?.bottom ?? 0 }]}>
          <LinearGradient colors={gradientes.menu} style={StyleSheet.absoluteFill} />

          <View style={styles.header}>
            <View style={styles.perfil}>
              <LinearGradient colors={gradientes.avatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                <Text style={styles.avatarLetra}>{(nome.charAt(0) || '?').toUpperCase()}</Text>
              </LinearGradient>
              <View style={styles.perfilTextos}>
                <Text style={styles.userName} numberOfLines={1}>{nome}</Text>
                <Text style={styles.userEmail} numberOfLines={1}>{user?.email}</Text>
              </View>
            </View>
            {saldo !== undefined && (
              <View style={styles.saldos}>
                <View style={[styles.saldoContainer, { borderColor: comAlfa(COR_CONTA, 0.25), backgroundColor: comAlfa(COR_CONTA, 0.07) }]}>
                  <View style={styles.saldoTopo}>
                    <Ionicons name={ICONE_CONTA} size={14} color={COR_CONTA} />
                    <Text style={styles.saldoLabel}>{t('Conta')}</Text>
                  </View>
                  <ValorEuro valor={saldo} style={[styles.saldoValor, { textShadowColor: comAlfa(COR_CONTA, 0.45) }]} numberOfLines={1} />
                </View>
                {saldoCartao !== null && (
                  <View style={[styles.saldoContainer, { borderColor: comAlfa(COR_CARTAO, 0.25), backgroundColor: comAlfa(COR_CARTAO, 0.07) }]}>
                    <View style={styles.saldoTopo}>
                      <Ionicons name={ICONE_CARTAO} size={14} color={COR_CARTAO} />
                      <Text style={styles.saldoLabel} numberOfLines={1}>
                        {t('Cartão')}
                      </Text>
                    </View>
                    <ValorEuro
                      valor={saldoCartao}
                      cor={COR_CARTAO}
                      style={[styles.saldoValor, { textShadowColor: comAlfa(COR_CARTAO, 0.45) }]}
                      numberOfLines={1}
                    />
                  </View>
                )}
              </View>
            )}
          </View>

          <ScrollView style={styles.menuItems} contentContainerStyle={styles.menuItemsConteudo}>
            {secoes.map((secao) => (
              <View key={secao.titulo} style={styles.secao}>
                <Text style={styles.secaoTitulo} accessibilityRole="header">
                  {secao.titulo}
                </Text>
                {secao.itens.map((item) => {
                  const rotas = item.grupo ? GRUPOS_MENU[item.grupo].map((s) => s.rota) : [item.route];
                  const ativo = rotas.some((r) => caminhoAtual === caminhoDe(r));
                  return (
                    <Pressable
                      key={item.route}
                      style={({ pressed }) => [styles.menuItem, ativo && styles.menuItemAtivo, pressed && styles.menuItemPremido]}
                      onPress={() => navigateTo(item.route)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: ativo }}
                    >
                      {ativo && <View style={styles.marcaAtivo} />}
                      <Icone nome={item.icon} size={20} color={ativo ? cores.primaria : cores.textoSecundario} />
                      <Text style={[styles.menuItemText, ativo && styles.menuItemTextAtivo]}>{item.label}</Text>
                      {!!item.badge && (
                        <View style={styles.badge} accessibilityLabel={item.badgeRotulo}>
                          <Text style={styles.badgeTexto}>{item.badge}</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.footerLinha}>
              <Pressable
                onPress={sair}
                style={({ pressed }) => [styles.sair, pressed && styles.menuItemPremido]}
                accessibilityRole="button"
              >
                <Ionicons name="log-out-outline" size={20} color={cores.negativo} />
                <Text style={styles.sairTexto}>{t('Sair')}</Text>
              </Pressable>
              <View style={styles.idiomaContainer}>
                {/* Atalho claro/escuro (a escolha completa, com "Sistema", está nas Definições) */}
                <Pressable
                  onPress={() => mudarTema(esquemaAplicado === 'claro' ? 'escuro' : 'claro')}
                  style={({ pressed }) => [styles.idiomaBotao, pressed && styles.idiomaBotaoPremido]}
                  accessibilityRole="button"
                  accessibilityLabel={esquemaAplicado === 'claro' ? t('Mudar para o tema escuro') : t('Mudar para o tema claro')}
                >
                  <Ionicons name={esquemaAplicado === 'claro' ? 'moon-outline' : 'sunny-outline'} size={18} color={cores.texto} />
                </Pressable>
                <Pressable
                  onPress={() => mudarIdioma('pt')}
                  style={({ pressed }) => [styles.idiomaBotao, idioma === 'pt' && styles.idiomaBotaoAtivo, pressed && styles.idiomaBotaoPremido]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: idioma === 'pt' }}
                  accessibilityLabel={t('Mudar para Português')}
                >
                  <Text style={[styles.idiomaBotaoTexto, idioma === 'pt' && styles.idiomaBotaoTextoAtivo]}>PT</Text>
                </Pressable>
                <Pressable
                  onPress={() => mudarIdioma('en')}
                  style={({ pressed }) => [styles.idiomaBotao, idioma === 'en' && styles.idiomaBotaoAtivo, pressed && styles.idiomaBotaoPremido]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: idioma === 'en' }}
                  accessibilityLabel={t('Change to English')}
                >
                  <Text style={[styles.idiomaBotaoTexto, idioma === 'en' && styles.idiomaBotaoTextoAtivo]}>EN</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.version}>{t('Finanças App v1.0')}</Text>
          </View>
        </View>

        {/* Tocar fora do menu fecha-o */}
        <Pressable style={styles.fora} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('Fechar menu')} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: cores.sobreposicao,
    flexDirection: 'row',
  },
  fora: {
    flex: 1,
  },
  menu: {
    width: 296,
    maxWidth: '86%',
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: cores.borda,
    boxShadow: sombras.menu,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: espaco.xl,
    paddingBottom: espaco.lg,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },
  perfil: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetra: {
    fontFamily: fontes.titulo,
    fontSize: 18,
    color: cores.sobreAcento,
  },
  perfilTextos: {
    flex: 1,
  },
  userName: {
    fontFamily: fontes.tituloMedio,
    color: cores.texto,
    fontSize: 17,
  },
  userEmail: {
    ...tipografia.secundario,
    fontSize: 13,
    marginTop: 2,
  },
  saldos: {
    marginTop: espaco.lg,
    flexDirection: 'row',
    gap: espaco.sm,
  },
  saldoContainer: {
    flex: 1,
    padding: espaco.sm + 2,
    borderRadius: raio.md,
    borderWidth: 1,
  },
  saldoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saldoLabel: {
    ...tipografia.rotulo,
    fontSize: 11,
    flexShrink: 1,
  },
  saldoValor: {
    fontFamily: fontes.numeroForte,
    fontSize: 19,
    marginTop: 2,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  menuItems: {
    flex: 1,
  },
  menuItemsConteudo: {
    paddingVertical: espaco.sm,
    paddingHorizontal: espaco.sm,
  },
  secao: {
    marginBottom: espaco.sm,
  },
  secaoTitulo: {
    ...tipografia.rotulo,
    fontSize: 11,
    paddingHorizontal: espaco.md + 2,
    paddingTop: espaco.sm,
    paddingBottom: espaco.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md + 2,
    minHeight: 46,
    paddingHorizontal: espaco.md + 2,
    borderRadius: raio.md,
  },
  menuItemAtivo: {
    backgroundColor: comAlfa(cores.primaria, 0.1),
  },
  menuItemPremido: {
    backgroundColor: cores.superficiePremida,
  },
  // Barrinha ciano à esquerda da opção do ecrã atual
  marcaAtivo: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderRadius: 2,
    backgroundColor: cores.primaria,
    boxShadow: `0 0 10px ${comAlfa(cores.primaria, 0.8)}`,
  },
  menuItemText: {
    fontFamily: fontes.corpoMedio,
    fontSize: 15,
    color: cores.texto,
  },
  badge: {
    marginLeft: 'auto',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.negativo,
  },
  badgeTexto: {
    fontFamily: fontes.corpoForte,
    fontSize: 11,
    color: cores.sobreAcento,
  },
  menuItemTextAtivo: {
    fontFamily: fontes.corpoForte,
    color: cores.primaria,
  },
  footer: {
    paddingHorizontal: espaco.lg,
    paddingTop: espaco.md,
    paddingBottom: espaco.lg,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    gap: espaco.sm,
  },
  sair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    minHeight: layout.alvoToque,
    paddingHorizontal: espaco.md,
    borderRadius: raio.md,
  },
  sairTexto: {
    fontFamily: fontes.corpoMedio,
    fontSize: 15,
    color: cores.negativo,
  },
  footerLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  idiomaContainer: {
    flexDirection: 'row',
    gap: espaco.xs,
  },
  idiomaBotao: {
    minWidth: 44,
    minHeight: layout.alvoToque,
    borderRadius: raio.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  idiomaBotaoAtivo: {
    backgroundColor: cores.primaria,
    borderColor: cores.primaria,
  },
  idiomaBotaoPremido: {
    backgroundColor: cores.superficiePremida,
  },
  idiomaBotaoTexto: {
    fontFamily: fontes.corpoMedio,
    fontSize: 12,
    color: cores.texto,
  },
  idiomaBotaoTextoAtivo: {
    color: cores.sobreAcento,
  },
  version: {
    ...tipografia.nota,
    textAlign: 'center',
  },
});
