import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { idiomaAtual } from '../i18n';
import { MODO_E2E } from '../utils/e2e';
import { api, parte } from './api';
import { configurarNotificacoes, definirPushDoServidor, estadoPermissao, notificacoesDisponiveis } from './notificacoes';

// Notificações push do servidor (alertas: orçamentos, despesas e dívidas a vencer, objetivos atrasados).
//
//   - Este telemóvel regista o token do Expo na API (POST /api/dispositivos) ao entrar na app, se
//     o utilizador as ligou nas Definições e o sistema deu permissão. O registo repete-se sempre que a
//     app abre (renova o token e o idioma). Na web não há push: nunca se regista nada.
//   - Ao sair da conta, ao desligar a opção ou ao apagar a conta o token é removido (DELETE).
//   - A push do servidor traz data { tipo, referencia, url } e o canal "pagamentos": tocar abre o `url`
//     (ver components/GestorLembretes).
//   - Para não avisar duas vezes, com o registo feito os lembretes locais das despesas deixam de se
//     agendar (services/notificacoes.ts, definirPushDoServidor). Sem registo (web, sem permissão, sem
//     ligação ao servidor) os lembretes locais continuam: são o plano B.

const CHAVE_TOKEN = '@financas:push-token';

export type ResultadoRegisto = 'registado' | 'sem-permissao' | 'indisponivel' | 'erro';

/** Push só no telemóvel (Android/iOS) e fora dos testes E2E. */
export const pushDisponivel = notificacoesDisponiveis && !MODO_E2E;

/** O id do projeto no Expo/EAS (app.json: extra.eas.projectId), que o token push precisa. */
export function projectIdExpo(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
}

async function tokenGuardado(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

/** Ao abrir a app: ver se este telemóvel já estava registado (os lembretes locais ajustam-se logo). */
export async function carregarEstadoPush(): Promise<boolean> {
  if (!pushDisponivel) return false;
  const registado = !!(await tokenGuardado());
  definirPushDoServidor(registado);
  return registado;
}

/**
 * Regista (ou renova) este telemóvel na API. Sem permissão não pede nada: quem a pede, com a explicação,
 * é o ecrã Definições (pedirPermissao). Nunca lança erros.
 */
export async function registarPush(): Promise<ResultadoRegisto> {
  if (!pushDisponivel) return 'indisponivel';
  try {
    if ((await estadoPermissao()) !== 'concedida') return 'sem-permissao';
    await configurarNotificacoes();
    const projectId = projectIdExpo();
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.post('/api/dispositivos', { token, plataforma: Platform.OS === 'ios' ? 'ios' : 'android', idioma: idiomaAtual() });
    await AsyncStorage.setItem(CHAVE_TOKEN, token);
    definirPushDoServidor(true);
    return 'registado';
  } catch (error) {
    // Sem ligação, servidor a acordar ou sem projeto Expo: ficam os lembretes locais
    console.warn('Não foi possível registar as notificações push:', error);
    return 'erro';
  }
}

/** Esquece o registo sem falar com o servidor (a API já apagou os dispositivos ao apagar a conta). */
export async function esquecerPush(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CHAVE_TOKEN);
  } catch {
    // sem armazenamento: nada a esquecer
  }
  definirPushDoServidor(false);
}

/**
 * Tira este telemóvel da API (DELETE /api/dispositivos): é preciso ter a sessão iniciada, por isso
 * chama-se ANTES de terminar a sessão. Esquece o token guardado, mesmo que o servidor não responda
 * (o servidor também apaga os tokens que o Expo diz já não existirem). Nunca lança erros.
 */
export async function removerPush(): Promise<void> {
  if (!pushDisponivel) return;
  const token = await tokenGuardado();
  if (!token) {
    definirPushDoServidor(false);
    return;
  }
  try {
    await api.delete(`/api/dispositivos?token=${parte(token)}`);
  } catch (error) {
    console.warn('Não foi possível remover as notificações push do servidor:', error);
  }
  try {
    await AsyncStorage.removeItem(CHAVE_TOKEN);
  } catch {
    // o token fica guardado e volta a tentar-se na próxima vez
  }
  definirPushDoServidor(false);
}
