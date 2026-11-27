import * as Sentry from '@sentry/react-native';

// Monitorização de erros (Sentry). Tudo passa por este ficheiro: o resto da app só chama
// iniciarErros / registarErro / registarErroApi / definirUtilizador.
//   - Sem EXPO_PUBLIC_SENTRY_DSN fica desligado: todas as funções são "não faz nada".
//   - Nada de dados pessoais: sem email, nome nem IP, sem corpos de pedidos nem texto de despesas.
//     O utilizador é só o id (o uid do Firebase) e os caminhos da API levam os ids trocados por ":id".

export type Contexto = Record<string, string | number | boolean | null | undefined>;

let ativo = false;

export function erroAtivo(): boolean {
  return ativo;
}

/** O DSN do projeto Sentry (vazio = desligado). */
export function dsnSentry(): string {
  return (process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();
}

/** "/api/despesas/3f2a-…/pagar?mes=2026-10" -> "/api/despesas/:id/pagar" (sem ids nem pesquisa). */
export function caminhoSemDados(caminho: string): string {
  const semPesquisa = caminho.split('?')[0].split('#')[0];
  return semPesquisa
    .split('/')
    .map((parte) => (/^\d+$/.test(parte) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(parte) || parte.length > 24 ? ':id' : parte))
    .join('/');
}

// Tira do evento tudo o que possa ser pessoal antes de ir para o Sentry
export function limparEvento<T extends Sentry.ErrorEvent>(evento: T): T {
  if (evento.user) evento.user = evento.user.id ? { id: evento.user.id } : undefined;
  if (evento.request) {
    evento.request = { url: evento.request.url ? caminhoSemDados(evento.request.url.replace(/^https?:\/\/[^/]+/, '')) : undefined };
  }
  return evento;
}

/** Liga o Sentry se houver DSN. Chamar uma vez, o mais cedo possível (app/_layout.tsx). Nunca lança erros. */
export function iniciarErros(): boolean {
  if (ativo) return true;
  const dsn = dsnSentry();
  if (!dsn) return false;
  try {
    Sentry.init({
      dsn,
      enabled: !__DEV__,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend: limparEvento,
    });
    ativo = true;
  } catch (erro) {
    // Ex.: APK antigo sem o módulo nativo do Sentry: a app continua, sem monitorização
    console.error('Sentry indisponível:', erro);
    ativo = false;
  }
  return ativo;
}

/** Associa os erros ao utilizador só pelo id (null ao terminar a sessão). */
export function definirUtilizador(id: string | null | undefined): void {
  if (!ativo) return;
  try {
    Sentry.setUser(id ? { id } : null);
  } catch {
    // a monitorização nunca parte a app
  }
}

/** Envia um erro inesperado (ex.: do ErrorBoundary). O contexto só leva valores simples, sem dados pessoais. */
export function registarErro(erro: unknown, contexto?: Contexto): void {
  if (!ativo) return;
  try {
    Sentry.withScope((scope) => {
      if (contexto) scope.setContext('app', contexto);
      Sentry.captureException(erro instanceof Error ? erro : new Error(String(erro)));
    });
  } catch {
    // idem
  }
}

// Um mesmo problema de rede repetido (ex.: 20 pedidos seguidos com o servidor em baixo) conta uma vez por minuto
const JANELA_MS = 60_000;
const recentes = new Map<string, number>();

/** Falhas do cliente da API: erros 5xx e falhas de rede / tempo esgotado. Só o método, o caminho sem ids e o estado. */
export function registarErroApi(
  tipo: 'servidor' | 'rede' | 'tempo',
  info: { metodo: string; caminho: string; estado?: number },
  agora = Date.now()
): void {
  if (!ativo) return;
  const caminho = caminhoSemDados(info.caminho);
  const chave = `${tipo}|${info.metodo}|${caminho}|${info.estado ?? 0}`;
  const ultimo = recentes.get(chave);
  if (ultimo !== undefined && agora - ultimo < JANELA_MS) return;
  recentes.set(chave, agora);
  try {
    Sentry.withScope((scope) => {
      scope.setTag('api.tipo', tipo);
      scope.setContext('api', { metodo: info.metodo, caminho, estado: info.estado ?? 0 });
      scope.setFingerprint(['api', tipo, info.metodo, caminho, String(info.estado ?? 0)]);
      Sentry.captureMessage(`API ${tipo}: ${info.metodo} ${caminho}${info.estado ? ` (${info.estado})` : ''}`, 'error');
    });
  } catch {
    // idem
  }
}

/** Envolve o componente raiz para o Sentry apanhar os erros de renderização (sem DSN devolve-o igual). */
export function envolverApp<P extends object>(componente: React.ComponentType<P>): React.ComponentType<P> {
  if (!ativo) return componente;
  try {
    return Sentry.wrap(componente as React.ComponentType<Record<string, unknown>>) as unknown as React.ComponentType<P>;
  } catch {
    return componente;
  }
}

// Só para os testes
export function __reporErros() {
  ativo = false;
  recentes.clear();
}
