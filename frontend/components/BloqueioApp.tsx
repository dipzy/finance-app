import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Image, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { comAlfa, cores, espaco, fontes, gradientes, layout, tipografia } from '../constants/tema';
import { useAuth } from '../contexts/AuthContext';
import {
  autenticar,
  bloqueioDisponivel,
  deveBloquearAoVoltar,
  ResultadoAutenticacao,
  saidaPermitida,
} from '../services/bloqueio';
import { guardarDefinicoes, obterDefinicoes, useDefinicoes } from '../services/definicoes';
import { useT } from '../i18n';
import { Botao, Etiqueta } from './ui';

// Bloqueio da app com a impressão digital / PIN do telemóvel (Definições > Bloquear a app).
// Envolve a navegação em app/_layout.tsx:
//   - ao abrir a app com a sessão restaurada pelo Firebase: bloqueada até confirmar;
//   - ao voltar de segundo plano: o ecrã fica tapado logo ao sair (nada aparece por instantes ao
//     voltar) e bloqueia se esteve fora pelo menos o tempo escolhido (0, 1 ou 5 minutos);
//   - depois de entrar com a password não bloqueia (acabou de provar quem é);
//   - no ecrã de bloqueio dá sempre para sair da conta.
// Na web não existe: só desenha a navegação.

const SIMBOLO = require('../assets/images/splash-icon.png');

// Ler as definições já ao carregar a app (ao mesmo tempo que as fontes, antes de o ecrã de arranque sair)
if (bloqueioDisponivel) obterDefinicoes();

// true enquanto a app está bloqueada ou tapada (ou ainda a decidir): quem abre janelas por cima
// (ex.: a folha "Novo gasto" vinda de um atalho do ícone) espera pelo desbloqueio
const BloqueioContext = createContext(false);
export const useAppBloqueada = () => useContext(BloqueioContext);

export function BloqueioApp({ children }: { children: ReactNode }) {
  if (!bloqueioDisponivel) return <>{children}</>;
  return <BloqueioNativo>{children}</BloqueioNativo>;
}

type Erro = Extract<ResultadoAutenticacao, { ok: false }>;

function BloqueioNativo({ children }: { children: ReactNode }) {
  const definicoes = useDefinicoes();
  const { isAuthenticated, isLoading, logout } = useAuth();
  const ativo = !!definicoes?.bloqueio;

  const [bloqueado, setBloqueado] = useState(false);
  // Tapado enquanto está em segundo plano (sem botões): ao voltar, ou destapa ou bloqueia
  const [tapado, setTapado] = useState(false);
  const [aAutenticar, setAAutenticar] = useState(false);
  const [erro, setErro] = useState<Erro | null>(null);

  const autenticando = useRef(false);
  const saiuEm = useRef<number | null>(null);
  const arranqueVerificado = useRef(false);
  // O que o ouvinte do AppState precisa de saber (está registado uma só vez)
  const atual = useRef({ ativo, sessao: isAuthenticated, minutos: definicoes?.bloqueioMinutos ?? 0 });
  atual.current = { ativo, sessao: isAuthenticated, minutos: definicoes?.bloqueioMinutos ?? 0 };

  // Arranque: a sessão restaurada pelo Firebase fica bloqueada. Calculado já aqui (e não só no
  // efeito) para o conteúdo não aparecer durante um instante antes do bloqueio
  const bloquearNoArranque = !arranqueVerificado.current && ativo && !isLoading && isAuthenticated;
  useEffect(() => {
    if (arranqueVerificado.current || definicoes === null || isLoading) return;
    arranqueVerificado.current = true;
    if (definicoes.bloqueio && isAuthenticated) setBloqueado(true);
  }, [definicoes, isLoading, isAuthenticated]);

  // Sem sessão, ou com o bloqueio desligado nas Definições, não há nada a tapar
  useEffect(() => {
    if ((!isLoading && !isAuthenticated) || (definicoes && !definicoes.bloqueio)) {
      setBloqueado(false);
      setTapado(false);
      setErro(null);
      saiuEm.current = null;
    }
  }, [isAuthenticated, isLoading, definicoes]);

  useEffect(() => {
    const subscricao = AppState.addEventListener('change', (estado) => {
      // A janela do PIN do telemóvel também põe a app em segundo plano: não conta
      if (autenticando.current) return;
      const { ativo: ligado, sessao, minutos } = atual.current;
      if (!ligado || !sessao) return;
      if (estado === 'background') {
        if (saidaPermitida()) return; // janela do sistema aberta pela app (ex.: permissão)
        saiuEm.current = Date.now();
        setTapado(true);
      } else if (estado === 'active') {
        const saiu = saiuEm.current;
        saiuEm.current = null;
        if (deveBloquearAoVoltar(saiu, Date.now(), minutos)) setBloqueado(true);
        setTapado(false);
      }
    });
    return () => subscricao.remove();
  }, []);

  const desbloquear = useCallback(async () => {
    if (autenticando.current) return;
    autenticando.current = true;
    setAAutenticar(true);
    setErro(null);
    const resultado = await autenticar();
    autenticando.current = false;
    setAAutenticar(false);
    saiuEm.current = null;
    if (resultado.ok) {
      setBloqueado(false);
      setTapado(false);
    } else if (!resultado.cancelado) {
      setErro(resultado);
    }
  }, []);

  const mostrarBloqueio = ativo && isAuthenticated && (bloqueado || bloquearNoArranque);

  // Ao ficar bloqueada (e com a app à frente), pede logo a impressão digital
  useEffect(() => {
    if (!mostrarBloqueio) return;
    const temporizador = setTimeout(() => {
      if (AppState.currentState === 'active') desbloquear();
    }, 350);
    return () => clearTimeout(temporizador);
  }, [mostrarBloqueio, desbloquear]);

  async function sair() {
    const deixarDeBloquear = !!erro?.semBloqueio;
    await logout();
    // O telemóvel já não tem bloqueio do ecrã: a seguir entra-se só com a password
    if (deixarDeBloquear) await guardarDefinicoes({ bloqueio: false });
    setBloqueado(false);
    setTapado(false);
    setErro(null);
    router.replace('/login');
  }

  // Ainda não se sabe se é para bloquear (definições a ler, ou o Firebase a restaurar a sessão)
  const aDecidir = definicoes === null || (ativo && isLoading);
  const tapar = !mostrarBloqueio && ativo && isAuthenticated && tapado;

  return (
    <View style={styles.raiz}>
      <BloqueioContext.Provider value={aDecidir || mostrarBloqueio || tapar}>{children}</BloqueioContext.Provider>
      {/* Por baixo do bloqueio também: enquanto a janela do Modal abre não se vê o conteúdo */}
      {(aDecidir || mostrarBloqueio || tapar) && (
        <View style={StyleSheet.absoluteFill}>
          <Fundo />
        </View>
      )}
      <Modal
        visible={mostrarBloqueio || tapar}
        animationType="none"
        transparent={false}
        statusBarTranslucent
        navigationBarTranslucent
        // O botão "voltar" não fecha o bloqueio
        onRequestClose={() => undefined}
      >
        <EcraBloqueio
          comBotoes={mostrarBloqueio}
          aAutenticar={aAutenticar}
          erro={erro}
          onDesbloquear={desbloquear}
          onSair={sair}
        />
      </Modal>
    </View>
  );
}

function Fundo() {
  return (
    <View style={styles.fundo}>
      <LinearGradient colors={gradientes.fundo} style={StyleSheet.absoluteFill} />
      <View style={[styles.brilho, styles.brilhoCiano]} />
      <View style={[styles.brilho, styles.brilhoVioleta]} />
    </View>
  );
}

interface EcraBloqueioProps {
  comBotoes: boolean;
  aAutenticar: boolean;
  erro: Erro | null;
  onDesbloquear: () => void;
  onSair: () => void;
}

export function EcraBloqueio({ comBotoes, aAutenticar, erro, onDesbloquear, onSair }: EcraBloqueioProps) {
  const insets = useContext(SafeAreaInsetsContext);
  const t = useT();
  return (
    <View
      style={[
        styles.ecra,
        { paddingTop: (insets?.top ?? 36) + espaco.xxl, paddingBottom: (insets?.bottom ?? 0) + espaco.xl },
      ]}
    >
      <Fundo />
      <View style={styles.centro}>
        <View style={styles.simboloCaixa}>
          <Image source={SIMBOLO} style={styles.simbolo} accessibilityIgnoresInvertColors />
        </View>
        <Text style={styles.titulo} accessibilityRole="header">
          {t('Finanças')}
        </Text>
        {comBotoes && (
          <>
            <View style={styles.cadeado}>
              <Ionicons name="lock-closed" size={14} color={cores.primaria} />
              <Text style={styles.cadeadoTexto}>{t('App bloqueada')}</Text>
            </View>
            <Text style={styles.texto}>{t('Usa a impressão digital ou o PIN do telemóvel para continuar.')}</Text>
          </>
        )}
      </View>

      {comBotoes && (
        <View style={styles.acoes}>
          {erro && <Etiqueta texto={erro.mensagem} cor={cores.aviso} icone="alert-circle-outline" style={styles.erro} />}
          <Botao
            titulo={aAutenticar ? t('A confirmar…') : t('Desbloquear')}
            icone="finger-print"
            onPress={onDesbloquear}
            aCarregar={aAutenticar}
            accessibilityHint={t('Pede a impressão digital ou o PIN do telemóvel')}
          />
          <Botao titulo={t('Sair da conta')} variante="fantasma" icone="log-out-outline" cor={cores.negativo} onPress={onSair} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
    backgroundColor: cores.fundo,
  },
  fundo: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    pointerEvents: 'none',
    backgroundColor: cores.fundo,
  },
  brilho: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
  },
  brilhoCiano: {
    top: -160,
    right: -140,
    backgroundColor: comAlfa(cores.primaria, 0.07),
    boxShadow: `0 0 120px 60px ${comAlfa(cores.primaria, 0.06)}`,
  },
  brilhoVioleta: {
    bottom: -180,
    left: -160,
    backgroundColor: comAlfa(cores.violeta, 0.08),
    boxShadow: `0 0 140px 70px ${comAlfa(cores.violeta, 0.07)}`,
  },
  ecra: {
    flex: 1,
    paddingHorizontal: layout.margemEcra + espaco.sm,
    backgroundColor: cores.fundo,
  },
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaco.md,
  },
  simboloCaixa: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espaco.sm,
  },
  simbolo: {
    width: 120,
    height: 120,
  },
  titulo: {
    fontFamily: fontes.titulo,
    fontSize: 30,
    color: cores.texto,
    letterSpacing: -0.4,
  },
  cadeado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: espaco.md,
    paddingVertical: espaco.xs + 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: comAlfa(cores.primaria, 0.3),
    backgroundColor: comAlfa(cores.primaria, 0.08),
  },
  cadeadoTexto: {
    ...tipografia.rotulo,
    color: cores.primaria,
    fontSize: 11,
  },
  texto: {
    ...tipografia.secundario,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
  acoes: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: espaco.sm,
  },
  erro: {
    alignSelf: 'stretch',
    marginBottom: espaco.xs,
  },
});
