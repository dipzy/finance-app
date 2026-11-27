import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { t } from '../i18n';
import { limparAlertas } from '../services/alertas';
import { acordarServidor, ErroApi } from '../services/api';
import { ContaDB, limparDadosLocais } from '../services/conta';
import { definirUtilizador } from '../services/erros';
import { PerfilDB, UserData } from '../services/database';
import { auth } from '../services/firebase';
import { migrarDoFirestoreSeNecessario } from '../services/migracaoFirestore';
import { removerPush } from '../services/push';
import { encontrarUtilizadorLocal, importarDadosLocais } from '../services/migracaoLocal';
import { CHAVE_SESSAO_E2E, E2E_UTILIZADOR, MODO_E2E } from '../utils/e2e';
import { mostrarAlerta } from '../utils/helpers';

// '0' = o utilizador desligou "Lembrar-me": terminar a sessão na próxima abertura da app
const KEY_LEMBRAR = '@financas:lembrar';

interface AuthContextType {
  user: UserData | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // Devolvem null em caso de sucesso, ou a mensagem de erro a mostrar
  login: (email: string, password: string, rememberMe: boolean) => Promise<string | null>;
  register: (email: string, name: string, password: string, rememberMe: boolean) => Promise<string | null>;
  recuperarPassword: (email: string) => Promise<string | null>;
  logout: () => Promise<void>;
  // Apaga todos os dados na API, limpa este telemóvel e apaga o utilizador no Firebase (ver ResultadoApagarConta)
  apagarConta: () => Promise<ResultadoApagarConta>;
  // O Firebase já confirmou o email (link no email): sem isso não se veem nem aceitam convites de grupos
  emailConfirmado: boolean;
  enviarConfirmacaoEmail: () => Promise<string | null>;
  // Volta a ler a conta no Firebase (depois de carregar no link) e devolve se o email já está confirmado
  verificarConfirmacaoEmail: () => Promise<boolean>;
  // Erro da cópia única dos dados do Firestore para o novo servidor (volta a tentar no próximo login)
  erroMigracao: string | null;
}

/**
 * O que aconteceu ao apagar a conta:
 *   - apagada: tudo apagado (dados, telemóvel e acesso); a sessão terminou.
 *   - sessao-antiga: NADA foi apagado; o Firebase só apaga contas de quem entrou há pouco: sair e entrar outra vez.
 *   - erro-servidor: NADA foi apagado (a API recusou ou não respondeu); `mensagem` diz porquê.
 *   - acesso-por-apagar: os dados JÁ foram apagados na API e neste telemóvel, mas o utilizador do Firebase
 *     ficou (pediu novo login ou falhou); a sessão terminou: é entrar outra vez e repetir "Apagar conta".
 */
export type ResultadoApagarConta =
  | { estado: 'apagada' }
  | { estado: 'sessao-antiga' }
  | { estado: 'erro-servidor'; mensagem: string }
  | { estado: 'acesso-por-apagar'; motivo: 'novo-login' | 'falha' };

// O Firebase só apaga o utilizador a quem entrou há pouco tempo (cerca de 5 minutos)
const JANELA_LOGIN_RECENTE_MS = 5 * 60_000 - 20_000;
// Sair da conta não pode ficar à espera do servidor (no plano grátis pode demorar a acordar)
const ESPERA_MAXIMA_REMOVER_PUSH_MS = 4_000;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function paraUserData(fbUser: User): UserData {
  return { id: fbUser.uid, email: fbUser.email ?? '', name: fbUser.displayName ?? '' };
}

function utilizadorE2E(): UserData {
  return { id: E2E_UTILIZADOR.id, email: E2E_UTILIZADOR.email, name: E2E_UTILIZADOR.name };
}

function codigoErro(error: unknown): string | undefined {
  return (error as { code?: string })?.code;
}

function mensagemErro(error: unknown): string {
  switch (codigoErro(error)) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return t('Email ou password incorretos');
    case 'auth/invalid-email':
      return t('Email inválido');
    case 'auth/email-already-in-use':
      return t('Já existe uma conta com este email');
    case 'auth/weak-password':
      return t('A password tem de ter pelo menos 6 caracteres');
    case 'auth/network-request-failed':
      return t('Sem ligação à internet');
    case 'auth/too-many-requests':
      return t('Demasiadas tentativas. Tenta novamente daqui a pouco');
    // Problemas de configuração na consola Firebase (Authentication)
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return t('O login por email/password não está ativo no Firebase (Authentication > Método de login)');
    case 'auth/admin-restricted-operation':
      return t('A criação de contas está desativada no Firebase (Authentication > Configurações > Ações do usuário)');
    default:
      console.error('Erro de autenticação:', error);
      // Mostrar o código ajuda a perceber o problema sem abrir a consola do browser
      const codigo = codigoErro(error);
      return t('Ocorreu um erro{codigo}. Tenta novamente.', { codigo: codigo ? ` (${codigo})` : '' });
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [erroMigracao, setErroMigracao] = useState<string | null>(null);
  const [emailConfirmado, setEmailConfirmado] = useState(false);

  // Logo ao abrir a app: acordar a API (no plano gratuito do Render adormece) enquanto se faz login
  useEffect(() => {
    acordarServidor();
  }, []);

  // Com sessão iniciada: copiar os dados do Firestore para a API, se ainda não estiverem lá.
  // Os pedidos dos ecrãs esperam por isto (ver services/migracaoFirestore.ts)
  function prepararServidor(uid: string) {
    migrarDoFirestoreSeNecessario(uid)
      .then(() => setErroMigracao(null))
      .catch((error) => {
        console.error('Erro ao copiar os dados do Firestore:', error);
        const mensagem = error instanceof Error ? error.message : String(error);
        setErroMigracao(mensagem);
        mostrarAlerta(
          t('Não foi possível preparar os teus dados'),
          t('Os teus dados ainda não foram copiados para o novo servidor ({mensagem}). Volta a tentar no próximo login.', { mensagem })
        );
      });
  }

  // O Firebase restaura a sessão sozinho e avisa sempre que ela muda
  useEffect(() => {
    // Testes E2E: sem Firebase, a sessão é só uma marca no armazenamento (utils/e2e.ts)
    if (MODO_E2E) {
      AsyncStorage.getItem(CHAVE_SESSAO_E2E)
        .then((marca) => marca === '1' && setUser(utilizadorE2E()))
        .catch(() => undefined)
        .finally(() => setIsLoading(false));
      return;
    }
    let primeiraVerificacao = true;

    return onAuthStateChanged(auth, async (fbUser) => {
      if (primeiraVerificacao) {
        primeiraVerificacao = false;
        try {
          if (fbUser && (await AsyncStorage.getItem(KEY_LEMBRAR)) === '0') {
            // signOut volta a chamar este callback com null
            await signOut(auth);
            return;
          }
        } catch (error) {
          console.error('Erro ao verificar sessão:', error);
        }
      }
      // Só o id: o Sentry nunca recebe o email nem o nome
      definirUtilizador(fbUser?.uid ?? null);
      if (fbUser) prepararServidor(fbUser.uid);
      setUser(fbUser ? paraUserData(fbUser) : null);
      setEmailConfirmado(!!fbUser?.emailVerified);
      setIsLoading(false);
    });
  }, []);

  // Copiar para a nuvem os dados que a versão antiga da app tinha guardado neste dispositivo.
  // Uma falha aqui não impede o login: volta a tentar no próximo
  async function importarDadosAntigos(email: string, password: string, uid: string) {
    try {
      await importarDadosLocais(email, password, uid);
    } catch (error) {
      console.error('Erro ao importar dados locais:', error);
    }
  }

  async function criarConta(email: string, name: string, password: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // A conta já existe a partir daqui: falhas no perfil não podem estragar o registo
    try {
      await updateProfile(cred.user, { displayName: name });
      await PerfilDB.criar(cred.user.uid, email, name);
    } catch (error) {
      console.error('Erro ao guardar o perfil:', error);
    }
    // O link de confirmação do email (é preciso para os convites de grupos); se falhar, pede-se outra vez no ecrã Partilhado
    sendEmailVerification(cred.user).catch((error) => console.error('Erro ao enviar a confirmação do email:', error));
    setUser(paraUserData(cred.user));
    return cred.user;
  }

  async function login(email: string, password: string, rememberMe: boolean): Promise<string | null> {
    const emailLimpo = email.trim();
    if (MODO_E2E) {
      if (emailLimpo !== E2E_UTILIZADOR.email || password !== E2E_UTILIZADOR.password) {
        return t('Email ou password incorretos');
      }
      await AsyncStorage.setItem(CHAVE_SESSAO_E2E, '1');
      setUser(utilizadorE2E());
      return null;
    }
    try {
      await AsyncStorage.setItem(KEY_LEMBRAR, rememberMe ? '1' : '0');
      const cred = await signInWithEmailAndPassword(auth, emailLimpo, password);
      await importarDadosAntigos(emailLimpo, password, cred.user.uid);
      return null;
    } catch (error) {
      const codigo = codigoErro(error);
      if (codigo !== 'auth/invalid-credential' && codigo !== 'auth/user-not-found') {
        return mensagemErro(error);
      }

      // Conta que só existia neste dispositivo (versão antiga): criar no Firebase com os mesmos dados
      const local = await encontrarUtilizadorLocal(emailLimpo, password);
      if (!local) return mensagemErro(error);
      try {
        const novo = await criarConta(emailLimpo, local.name, password);
        await importarDadosAntigos(emailLimpo, password, novo.uid);
        return null;
      } catch (erroCriar) {
        // A conta já existe no Firebase, por isso a password estava mesmo errada
        if (codigoErro(erroCriar) === 'auth/email-already-in-use') return mensagemErro(error);
        return mensagemErro(erroCriar);
      }
    }
  }

  async function register(email: string, name: string, password: string, rememberMe: boolean): Promise<string | null> {
    const emailLimpo = email.trim();
    try {
      await AsyncStorage.setItem(KEY_LEMBRAR, rememberMe ? '1' : '0');
      const novo = await criarConta(emailLimpo, name.trim(), password);
      await importarDadosAntigos(emailLimpo, password, novo.uid);
      return null;
    } catch (error) {
      return mensagemErro(error);
    }
  }

  async function recuperarPassword(email: string): Promise<string | null> {
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return null;
    } catch (error) {
      return mensagemErro(error);
    }
  }

  async function logout() {
    // Ainda com sessão: tirar este telemóvel das notificações push da conta que sai (sem esperar muito)
    await Promise.race([removerPush(), new Promise((resolver) => setTimeout(resolver, ESPERA_MAXIMA_REMOVER_PUSH_MS))]);
    limparAlertas();
    if (MODO_E2E) {
      await AsyncStorage.removeItem(CHAVE_SESSAO_E2E);
      setUser(null);
      return;
    }
    await signOut(auth);
  }

  // Entrou há pouco? Sem isto o Firebase recusa apagar o utilizador DEPOIS de a API já ter apagado os dados
  async function entrouHaPouco(): Promise<boolean> {
    try {
      const resultado = await auth.currentUser?.getIdTokenResult();
      const quando = resultado?.authTime ? Date.parse(resultado.authTime) : NaN;
      return Number.isNaN(quando) || Date.now() - quando < JANELA_LOGIN_RECENTE_MS;
    } catch {
      return true; // sem certeza: avançar (se o Firebase recusar, o aviso certo é dado a seguir)
    }
  }

  async function apagarConta(): Promise<ResultadoApagarConta> {
    if (!MODO_E2E && !(await entrouHaPouco())) return { estado: 'sessao-antiga' };

    try {
      await ContaDB.apagar();
    } catch (error) {
      console.error('Erro ao apagar a conta na API:', error);
      return { estado: 'erro-servidor', mensagem: error instanceof ErroApi ? error.message : t('Não foi possível apagar os dados.') };
    }

    // A API já apagou tudo: de aqui para a frente não há volta atrás
    await limparDadosLocais();
    if (MODO_E2E) {
      await AsyncStorage.removeItem(CHAVE_SESSAO_E2E);
      setUser(null);
      return { estado: 'apagada' };
    }

    let resultado: ResultadoApagarConta = { estado: 'apagada' };
    try {
      if (auth.currentUser) await deleteUser(auth.currentUser);
    } catch (error) {
      console.error('Erro ao apagar o utilizador no Firebase:', error);
      resultado = { estado: 'acesso-por-apagar', motivo: codigoErro(error) === 'auth/requires-recent-login' ? 'novo-login' : 'falha' };
    }
    // Com o utilizador apagado o Firebase já terminou a sessão; senão termina-se aqui (volta ao login)
    try {
      if (auth.currentUser) await signOut(auth);
    } catch (error) {
      console.error('Erro ao terminar a sessão:', error);
    }
    setUser(null);
    limparAlertas();
    return resultado;
  }

  async function enviarConfirmacaoEmail(): Promise<string | null> {
    if (!auth.currentUser) return t('Sem sessão iniciada');
    try {
      await sendEmailVerification(auth.currentUser);
      return null;
    } catch (error) {
      return mensagemErro(error);
    }
  }

  // Depois de carregar no link: o token antigo ainda diz "não confirmado", por isso pede-se um novo
  // (é o token que a API lê para os convites)
  async function verificarConfirmacaoEmail(): Promise<boolean> {
    const atual = auth.currentUser;
    if (!atual) return false;
    try {
      await reload(atual);
      if (atual.emailVerified) await atual.getIdToken(true);
      setEmailConfirmado(atual.emailVerified);
      return atual.emailVerified;
    } catch (error) {
      console.error('Erro ao verificar o email:', error);
      return false;
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      recuperarPassword,
      logout,
      apagarConta,
      emailConfirmado,
      enviarConfirmacaoEmail,
      verificarConfirmacaoEmail,
      erroMigracao,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}
