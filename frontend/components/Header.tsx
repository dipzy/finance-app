import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router } from 'expo-router';
import { useContext } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { COR_CARTAO, COR_CONTA, ICONE_CARTAO, ICONE_CONTA } from '../constants/meiosPagamento';
import { cores, espaco, fontes, layout, raio } from '../constants/tema';
import { useT } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { useAlertas } from '../services/alertas';
import { useDefinicoes } from '../services/definicoes';
import { useSaldoCartao } from '../services/saldoCartao';
import { alertasPorVer } from '../utils/alertas';
import { AvisoSemLigacao } from './AvisoSemLigacao';
import { AvisoServidorAcordar } from './AvisoServidorAcordar';
import { formatarEuro, ValorEuro } from './ui';
import type { NomeIcone } from './ui/tipos';

interface HeaderProps {
  title?: string;
  onMenuPress?: () => void;
  saldo?: number;
}

export function Header({ title = 'Meu Plano Financeiro', onMenuPress, saldo }: HeaderProps) {
  const { logout, user } = useAuth();
  const t = useT();
  // O saldo do cartão de alimentação ao lado do da conta (null a quem não o usa)
  const saldoCartao = useSaldoCartao(user?.id);
  const ocultos = useDefinicoes()?.ocultos ?? [];
  // Só ouve: quem pede os alertas à API é o cartão do Início e o ecrã Alertas
  const { alertas, vistos } = useAlertas(false);
  const pendentes = alertasPorVer(alertas ?? [], vistos ?? new Set()).length;
  // A app desenha por trás da barra de estado: o cabeçalho começa abaixo dela
  // (sem SafeAreaProvider, nos testes, usa uma altura habitual)
  const insets = useContext(SafeAreaInsetsContext);
  const topo = insets?.top ?? (Platform.OS === 'web' ? 0 : 36);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <View style={[styles.header, { paddingTop: topo + espaco.sm }]}>
      <View style={styles.linha}>
        <Pressable
          onPress={onMenuPress}
          style={({ pressed }) => [styles.botaoIcone, pressed && styles.premido]}
          accessibilityRole="button"
          accessibilityLabel={t('Abrir menu')}
        >
          <Ionicons name="menu-outline" size={26} color={cores.texto} />
        </Pressable>

        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {t(title)}
        </Text>

        <View style={styles.userSection}>
          {saldo !== undefined && (
            <View style={styles.saldoContainer}>
              <LinhaSaldo icone={ICONE_CONTA} cor={COR_CONTA} rotulo={t('Conta')} valor={saldo} />
              {saldoCartao !== null && (
                <LinhaSaldo icone={ICONE_CARTAO} cor={COR_CARTAO} rotulo={t('Cartão de alimentação')} valor={saldoCartao} />
              )}
            </View>
          )}
          {!ocultos.includes('alertas') && (
            <Pressable
              onPress={() => router.push('/(tabs)/alertas' as Href)}
              style={({ pressed }) => [styles.botaoIcone, styles.botaoSair, pressed && styles.premido]}
              accessibilityRole="button"
              accessibilityLabel={t('Alertas')}
            >
              <Ionicons name="notifications-outline" size={22} color={cores.textoSecundario} />
              {pendentes > 0 && (
                <View style={styles.badge} accessibilityLabel={t('{n} alertas por ver', { n: pendentes })}>
                  <Text style={styles.badgeTexto}>{pendentes}</Text>
                </View>
              )}
            </Pressable>
          )}
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [styles.botaoIcone, styles.botaoSair, pressed && styles.premido]}
            accessibilityRole="button"
            accessibilityLabel={t('Sair')}
          >
            <Ionicons name="log-out-outline" size={22} color={cores.textoSecundario} />
          </Pressable>
        </View>
      </View>
      {/* Sem internet: os gastos novos ficam na fila (services/filaOffline.ts) */}
      <AvisoSemLigacao />
      {/* API a arrancar (Render grátis): contador e novas tentativas automáticas, sem bloquear */}
      <AvisoServidorAcordar />
    </View>
  );
}

// Um saldo no canto: o ícone na cor do meio de pagamento (azul a conta, laranja o cartão) e o valor
function LinhaSaldo({ icone, cor, rotulo, valor }: { icone: NomeIcone; cor: string; rotulo: string; valor: number }) {
  return (
    <View style={styles.saldoLinha} accessible accessibilityLabel={`${rotulo}: ${formatarEuro(valor)}`}>
      <Ionicons name={icone} size={13} color={cor} />
      <ValorEuro valor={valor} style={styles.saldoValor} numberOfLines={1} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: espaco.sm,
    paddingBottom: espaco.sm,
    backgroundColor: cores.cabecalho,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    maxWidth: layout.larguraMaxima,
    alignSelf: 'center',
  },
  botaoIcone: {
    width: layout.alvoToque,
    height: layout.alvoToque,
    borderRadius: raio.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoSair: {
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: cores.negativo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTexto: {
    fontFamily: fontes.corpoMedio,
    color: '#fff',
    fontSize: 10,
  },
  premido: {
    backgroundColor: cores.superficiePremida,
  },
  title: {
    flex: 1,
    fontFamily: fontes.titulo,
    fontSize: 17,
    color: cores.texto,
    letterSpacing: -0.2,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saldoContainer: {
    gap: 2,
    paddingHorizontal: espaco.sm,
    paddingVertical: 4,
    borderRadius: raio.md,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  saldoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  saldoValor: {
    fontSize: 13,
    maxWidth: 104,
  },
});
