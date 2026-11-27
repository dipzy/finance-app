import Ionicons from '@expo/vector-icons/Ionicons';
import * as QuickActions from 'expo-quick-actions';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname, useSegments } from 'expo-router';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { cores, espaco, gradientes, raio, tipografia } from '../constants/tema';
import { useT } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { ATALHOS, destinoDoAtalho, type DestinoAtalho } from '../services/atalhos';
import { ouvir } from '../services/eventos';
import { listarPendentes, sincronizar, type GastoPendente } from '../services/filaOffline';
import { aoMudarLigacao } from '../services/ligacao';
import { textoValor } from '../utils/ecrasDespesas';
import { useAppBloqueada } from './BloqueioApp';
import { NovoGastoRapido, type GastoGuardado } from './NovoGastoRapido';

// O botão rápido "+" e tudo o que o rodeia (fica em app/_layout.tsx, por cima da navegação):
//   - o botão flutuante nos ecrãs principais (não no login, nem com a app bloqueada; os modais dos
//     ecrãs abrem por cima dele) e a folha "Novo gasto";
//   - os atalhos do ícone da app (expo-quick-actions): com a app fechada ou em segundo plano. A folha
//     só abre depois do login e do desbloqueio (impressão digital);
//   - o envio da fila offline: ao entrar, ao voltar a internet, ao voltar à app e ao mudar de ecrã;
//   - a mensagem rápida (toast) depois de guardar.

const TAMANHO = 56;

export function GestorGastoRapido() {
  const t = useT();
  const { user, isAuthenticated } = useAuth();
  const segmentos = useSegments();
  const caminho = usePathname();
  const bloqueada = useAppBloqueada();
  const insets = useContext(SafeAreaInsetsContext);
  const emEcraPrincipal = isAuthenticated && segmentos[0] === '(tabs)';
  const pronto = emEcraPrincipal && !bloqueada;

  // null = fechada; {} = gasto novo; { pendente } = corrigir um gasto por enviar
  const [folha, setFolha] = useState<{ pendente?: GastoPendente } | null>(null);
  const [atalho, setAtalho] = useState<DestinoAtalho | null>(() => destinoDoAtalho(QuickActions.initial));
  const [toast, setToast] = useState<string | null>(null);
  const temporizadorToast = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = user?.id;

  // Atalhos do ícone: registados ao abrir; os tocados com a app em segundo plano chegam pelo ouvinte
  useEffect(() => {
    QuickActions.setItems(ATALHOS).catch((erro) => console.error('Erro ao criar os atalhos:', erro));
    const subscricao = QuickActions.addListener((acao) => setAtalho(destinoDoAtalho(acao)));
    return () => subscricao.remove();
  }, []);

  // Cumprir o atalho só com sessão, num ecrã principal e com a app desbloqueada
  useEffect(() => {
    if (!atalho || !pronto) return;
    setAtalho(null);
    if (atalho.href) router.navigate(atalho.href);
    if (atalho.abrirGastoRapido) setFolha({});
  }, [atalho, pronto]);

  // Tocar num gasto por enviar (LinhaGastoPendente) abre a folha para o corrigir
  useEffect(
    () =>
      ouvir('abrirGastoRapido', async (dados) => {
        if (!dados?.idPendente || !userId) {
          setFolha({});
          return;
        }
        const pendente = (await listarPendentes(userId)).find((p) => p.id === dados.idPendente);
        if (pendente) setFolha({ pendente });
      }),
    [userId]
  );

  // Fila offline: enviar ao entrar, ao mudar de ecrã, ao voltar a internet e ao voltar à app
  const enviarFila = useCallback(() => {
    if (userId && isAuthenticated) sincronizar(userId);
  }, [userId, isAuthenticated]);

  useEffect(() => {
    enviarFila();
  }, [enviarFila, caminho]);

  useEffect(() => {
    const deixarLigacao = aoMudarLigacao((semLigacao) => {
      if (!semLigacao) enviarFila();
    });
    const subscricao = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') enviarFila();
    });
    return () => {
      deixarLigacao();
      subscricao.remove();
    };
  }, [enviarFila]);

  useEffect(() => () => {
    if (temporizadorToast.current) clearTimeout(temporizadorToast.current);
  }, []);

  function mostrarToast(texto: string) {
    if (temporizadorToast.current) clearTimeout(temporizadorToast.current);
    setToast(texto);
    temporizadorToast.current = setTimeout(() => setToast(null), 3500);
  }

  function aoGuardar(gasto: GastoGuardado) {
    const euros = `${textoValor(gasto.valor)} €`;
    if (gasto.editado) mostrarToast(t('Gasto corrigido: {titulo} · {euros}. Vai ser enviado outra vez.', { titulo: gasto.titulo, euros }));
    else if (gasto.pendente)
      mostrarToast(t('Sem ligação: {titulo} ({euros}) fica guardado e é enviado quando voltar a internet.', { titulo: gasto.titulo, euros }));
    else mostrarToast(t('Gasto guardado: {titulo} · {euros}', { titulo: gasto.titulo, euros }));
  }

  const fundo = insets?.bottom ?? 0;

  return (
    <>
      {pronto && !folha && (
        <Pressable
          onPress={() => setFolha({})}
          style={({ pressed }) => [styles.botao, { bottom: fundo + espaco.lg }, pressed && styles.premido]}
          accessibilityRole="button"
          accessibilityLabel={t('Novo gasto')}
          testID="botao-gasto-rapido"
        >
          <LinearGradient colors={gradientes.primario} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradiente}>
            <Ionicons name="add" size={30} color={cores.sobreAcento} />
          </LinearGradient>
        </Pressable>
      )}

      {toast && pronto && (
        <View style={[styles.toast, { bottom: fundo + espaco.lg + TAMANHO + espaco.md }]} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text style={styles.toastTexto}>{toast}</Text>
        </View>
      )}

      <NovoGastoRapido
        visivel={!!folha && pronto}
        pendente={folha?.pendente ?? null}
        onFechar={() => setFolha(null)}
        onGuardado={aoGuardar}
      />
    </>
  );
}

const styles = StyleSheet.create({
  botao: {
    position: 'absolute',
    right: espaco.lg,
    width: TAMANHO,
    height: TAMANHO,
    borderRadius: TAMANHO / 2,
    boxShadow: `0 6px 20px rgba(0,229,255,0.35)`,
  },
  premido: {
    transform: [{ scale: 0.94 }],
  },
  gradiente: {
    flex: 1,
    borderRadius: TAMANHO / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    position: 'absolute',
    left: espaco.lg,
    right: espaco.lg,
    alignSelf: 'center',
    maxWidth: 520,
    paddingVertical: espaco.md,
    paddingHorizontal: espaco.lg,
    borderRadius: raio.md,
    backgroundColor: cores.fundoAlto,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  toastTexto: {
    ...tipografia.secundario,
    color: cores.texto,
  },
});
