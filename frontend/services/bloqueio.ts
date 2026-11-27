import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { t } from '../i18n';

// Bloqueio da app com a impressão digital (ou o PIN / padrão do telemóvel, se não houver ou falhar).
// Só no telemóvel: na web a opção não aparece. O ecrã de bloqueio é o components/BloqueioApp.tsx;
// a definição (ligado, ao fim de quanto tempo) está em services/definicoes.ts.

export const bloqueioDisponivel = Platform.OS === 'android' || Platform.OS === 'ios';

export type SuporteBloqueio =
  | { pode: true; biometria: boolean } // biometria: há impressão digital/rosto registado (senão é só o PIN)
  | { pode: false; motivo: string };

/** Se o telemóvel tem com que confirmar quem é (impressão digital, rosto, PIN, padrão ou palavra-passe). */
export async function verificarSuporte(): Promise<SuporteBloqueio> {
  if (!bloqueioDisponivel) return { pode: false, motivo: t('O bloqueio só existe na app do telemóvel.') };
  try {
    const nivel = await LocalAuthentication.getEnrolledLevelAsync();
    if (nivel === LocalAuthentication.SecurityLevel.NONE) {
      return {
        pode: false,
        motivo: t(
          'Este telemóvel não tem impressão digital nem PIN, padrão ou palavra-passe de bloqueio do ecrã. Configura o bloqueio do ecrã nas definições do Android e volta aqui.'
        ),
      };
    }
    return { pode: true, biometria: nivel >= LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK };
  } catch (error) {
    console.error('Erro ao ver o bloqueio do telemóvel:', error);
    return { pode: false, motivo: t('Não foi possível verificar o bloqueio do telemóvel.') };
  }
}

export type ResultadoAutenticacao =
  | { ok: true }
  | { ok: false; cancelado: boolean; semBloqueio: boolean; mensagem: string };

function mensagemDoErro(erro: LocalAuthentication.LocalAuthenticationError): string {
  switch (erro) {
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
    case 'user_fallback':
      return t('Desbloqueio cancelado.');
    case 'lockout':
      return t('Demasiadas tentativas. Espera um pouco ou desbloqueia com o PIN do telemóvel.');
    case 'not_enrolled':
    case 'not_available':
    case 'passcode_not_set':
      return t('O telemóvel deixou de ter bloqueio do ecrã. Sai da conta e volta a entrar com a password.');
    case 'authentication_failed':
      return t('Não foi possível confirmar. Tenta outra vez.');
    default:
      return t('Não foi possível desbloquear. Tenta outra vez.');
  }
}

/** Pede a impressão digital, com o PIN / padrão do telemóvel como alternativa. */
export async function autenticar(titulo = t('Desbloquear Finanças')): Promise<ResultadoAutenticacao> {
  if (!bloqueioDisponivel) return { ok: true };
  try {
    const resultado = await LocalAuthentication.authenticateAsync({
      promptMessage: titulo,
      promptSubtitle: t('Usa a impressão digital ou o bloqueio do ecrã'),
      cancelLabel: t('Cancelar'),
      disableDeviceFallback: false,
      requireConfirmation: false,
    });
    if (resultado.success) return { ok: true };
    const erro = resultado.error;
    return {
      ok: false,
      cancelado: ['user_cancel', 'system_cancel', 'app_cancel', 'user_fallback'].includes(erro),
      semBloqueio: ['not_enrolled', 'not_available', 'passcode_not_set'].includes(erro),
      mensagem: mensagemDoErro(erro),
    };
  } catch (error) {
    console.error('Erro ao pedir a impressão digital:', error);
    return {
      ok: false,
      cancelado: false,
      semBloqueio: false,
      mensagem: t('Não foi possível desbloquear. Tenta outra vez.'),
    };
  }
}

/**
 * Ao voltar à app: bloquear se esteve fora pelo menos `minutos` (0 = sempre).
 * saiuEm: quando a app foi para segundo plano (ms), ou null se não chegou a sair.
 */
export function deveBloquearAoVoltar(saiuEm: number | null, agora: number, minutos: number): boolean {
  if (saiuEm === null) return false;
  return agora - saiuEm >= minutos * 60_000;
}

// ---- Saídas da app que não contam (janelas do sistema abertas pela própria app) ----
// No Android, a janela de uma permissão, o seletor de ficheiros ou a partilha põem a app em segundo
// plano por instantes: sem isto, com "Imediatamente", a app bloqueava ao voltar de cada uma delas.

let saidaPermitidaAte = 0;

/** Chamar antes de abrir uma janela do sistema (permissão, seletor de ficheiros, partilhar). */
export function permitirSaidaTemporaria(ms = 2 * 60_000): void {
  saidaPermitidaAte = Date.now() + ms;
}

/** Já voltou da janela do sistema: as saídas seguintes voltam a contar. */
export function terminarSaidaTemporaria(): void {
  saidaPermitidaAte = 0;
}

export const saidaPermitida = (agora: number = Date.now()) => agora < saidaPermitidaAte;
