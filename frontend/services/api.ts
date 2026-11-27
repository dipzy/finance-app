import { idiomaAtual, t } from '../i18n';
import { auth } from './firebase';
import { registarErroApi } from './erros';
import { registarFalhaRede, semLigacao } from './ligacao';
import { E2E_UTILIZADOR, MODO_E2E } from '../utils/e2e';
import { definirTentativa, marcarServidorAcordado, mudarLentos, servidorJaAcordou } from './servidor';

// O estado do arranque está em services/servidor.ts; quem já importava daqui continua a poder
export {
  __reporServidor,
  aoAcordarServidor,
  servidorAAcordar,
  servidorAAcordarDesde,
  servidorJaAcordou,
  tentativaDeAcordar,
} from './servidor';

// Cliente HTTP da API (.NET, pasta backend/). Todos os pedidos dos ecrãs passam por aqui
// (através de services/database.ts e services/folhaMes.ts):
//   - o endereço vem de EXPO_PUBLIC_API_URL (.env);
//   - cada pedido leva o ID token do Firebase (Authorization: Bearer ...): é assim que a API sabe
//     quem é o utilizador;
//   - JSON na ida e na volta; os erros da API (ProblemDetails) passam a ErroApi com mensagens em português;
//   - no plano gratuito do Render a API "adormece" e o primeiro pedido pode demorar quase um minuto:
//     o tempo limite é longo e quem quiser mostrar "A acordar o servidor…" pode usar aoAcordarServidor
//     (o aviso está em components/AvisoServidorAcordar.tsx); até a API responder pela primeira vez, os
//     GET que falham por rede/tempo/502-504 repetem com espera crescente, sem bloquear a app;
//   - falhas 5xx e de rede vão para o Sentry (services/erros.ts), sem dados pessoais.

/** Sem EXPO_PUBLIC_API_URL: a API a correr neste computador (no emulador Android: http://10.0.2.2:5080). */
export const URL_LOCAL = 'http://localhost:5080';

/** Tempo máximo de um pedido (acordar o servidor no Render pode demorar ~1 minuto). */
export const TEMPO_LIMITE_MS = 90_000;

/** A partir deste tempo um pedido conta como "lento" (provavelmente o servidor a acordar). */
export const AVISO_LENTO_MS = 3_000;

export function urlApi(): string {
  return (process.env.EXPO_PUBLIC_API_URL || URL_LOCAL).trim().replace(/\/+$/, '');
}

// Resposta de erro da API (RFC 9457), ex.: { status: 404, title: 'Não encontrado', detail: 'Despesa não encontrada.' }
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  errors?: Record<string, string[]>;
}

export class ErroApi extends Error {
  constructor(
    message: string,
    // 0 = sem resposta (sem ligação ou tempo esgotado)
    readonly estado: number,
    readonly problema?: ProblemDetails,
    // Só quando estado = 0: sem ligação ao servidor ou tempo esgotado
    readonly causa?: 'rede' | 'tempo'
  ) {
    super(message);
    this.name = 'ErroApi';
  }
}

// ---- Novas tentativas enquanto o servidor acorda ----

// Esperas (ms) antes de cada nova tentativa: ~50 s no total, o que o Render grátis demora a arrancar
export const ESPERAS_ACORDAR_MS = [2_000, 4_000, 8_000, 15_000, 20_000];

const estadosDeArranque = [502, 503, 504];

function podeTentarOutraVez(erro: unknown): boolean {
  return erro instanceof ErroApi && (erro.estado === 0 || estadosDeArranque.includes(erro.estado));
}

// Repete a tarefa (só GET) com espera crescente enquanto a API ainda não respondeu desde que a app abriu.
// Sem rede no telemóvel não repete: não adianta e os gastos novos vão para a fila (filaOffline)
async function comNovasTentativas<T>(repetir: boolean, tarefa: () => Promise<T>): Promise<T> {
  let aEsperar = false;
  try {
    for (let tentativa = 0; ; tentativa++) {
      try {
        return await tarefa();
      } catch (erro) {
        const pode = repetir && !servidorJaAcordou() && tentativa < ESPERAS_ACORDAR_MS.length && podeTentarOutraVez(erro) && !semLigacao();
        if (!pode) throw erro;
        // O aviso fica ligado durante todas as tentativas (não pisca entre uma e outra)
        if (!aEsperar) {
          aEsperar = true;
          mudarLentos(1);
        }
        definirTentativa(tentativa + 1);
        await new Promise((resolver) => setTimeout(resolver, ESPERAS_ACORDAR_MS[tentativa]));
      }
    }
  } finally {
    definirTentativa(0);
    if (aEsperar) mudarLentos(-1);
  }
}

// O que vai para o Sentry quando um pedido falha de vez (5xx, rede, tempo esgotado)
function registarFalha(erro: unknown, metodo: string, caminho: string) {
  if (!(erro instanceof ErroApi)) return;
  if (erro.estado >= 500) registarErroApi('servidor', { metodo, caminho, estado: erro.estado });
  else if (erro.estado === 0 && !semLigacao()) registarErroApi(erro.causa ?? 'rede', { metodo, caminho });
}

// ---- Espera inicial (a cópia única dos dados do Firestore) ----

let esperaInicial: Promise<unknown> | null = null;

/** Os pedidos seguintes esperam por esta tarefa (ex.: a migração do Firestore) antes de saírem, mesmo que ela falhe. */
export function esperarAntesDosPedidos(tarefa: Promise<unknown>): void {
  const espera = tarefa.then(
    () => undefined,
    () => undefined
  );
  esperaInicial = espera;
  espera.then(() => {
    if (esperaInicial === espera) esperaInicial = null;
  });
}

// ---- Pedidos ----

export type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface OpcoesPedido {
  metodo?: Metodo;
  corpo?: unknown;
  /** Enviar o token do Firebase (por defeito, sim). */
  autenticado?: boolean;
  /** Esperar pela tarefa inicial (por defeito, sim). A própria migração não espera por si mesma. */
  esperar?: boolean;
  /** Cabeçalhos a mais (ex.: Idempotency-Key nos gastos novos, para não ficarem em duplicado). */
  cabecalhos?: Record<string, string>;
}

async function token(forcarNovo: boolean): Promise<string> {
  const utilizador = auth.currentUser;
  if (!utilizador) throw new ErroApi(t('A sessão terminou. Faz login outra vez.'), 401);
  return utilizador.getIdToken(forcarNovo);
}

/** A mensagem a mostrar ao utilizador para uma resposta de erro. */
export function mensagemDeErro(estado: number, problema?: ProblemDetails): string {
  if (estado === 401) return t('A sessão expirou. Faz login outra vez.');
  if (estado === 403) return t('Sem permissão para esta operação.');
  const erroDeCampo = problema?.errors && Object.values(problema.errors).flat()[0];
  if (erroDeCampo) return erroDeCampo;
  if (problema?.detail) return problema.detail;
  if (estado === 404) return t('Não encontrado.');
  if (estado === 409) return t('Os dados mudaram entretanto. Tenta outra vez.');
  if (estado >= 500) return t('Erro no servidor. Tenta novamente daqui a pouco.');
  return problema?.title ?? t('Erro inesperado ({estado}).', { estado });
}

async function lerProblema(resposta: Response): Promise<ProblemDetails | undefined> {
  try {
    const texto = await resposta.text();
    return texto ? (JSON.parse(texto) as ProblemDetails) : undefined;
  } catch {
    return undefined;
  }
}

async function enviar(
  caminho: string,
  opcoes: Required<Pick<OpcoesPedido, 'metodo' | 'autenticado'>> & {
    corpo?: unknown;
    aceitar?: string;
    cabecalhos?: Record<string, string>;
  },
  forcarToken: boolean
) {
  const cabecalhos: Record<string, string> = { ...opcoes.cabecalhos, Accept: opcoes.aceitar ?? 'application/json' };
  // A API responde com as mensagens de erro e o PDF no idioma atual
  cabecalhos['Accept-Language'] = idiomaAtual();
  if (opcoes.corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
  if (opcoes.autenticado) {
    if (MODO_E2E) {
      // Testes E2E (utils/e2e.ts): a API local aceita o utilizador pelo cabeçalho, sem token do Firebase
      cabecalhos['X-Utilizador'] = E2E_UTILIZADOR.id;
      cabecalhos['X-Email'] = E2E_UTILIZADOR.email;
    } else {
      cabecalhos.Authorization = `Bearer ${await token(forcarToken)}`;
    }
  }

  const controlo = new AbortController();
  const limite = setTimeout(() => controlo.abort(), TEMPO_LIMITE_MS);
  let lento = false;
  const aviso = setTimeout(() => {
    lento = true;
    mudarLentos(1);
  }, AVISO_LENTO_MS);

  try {
    const resposta = await fetch(`${urlApi()}${caminho}`, {
      method: opcoes.metodo,
      headers: cabecalhos,
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
      signal: controlo.signal,
    });
    // Qualquer resposta que não seja "a API ainda está a arrancar" quer dizer que já acordou
    if (!estadosDeArranque.includes(resposta.status)) marcarServidorAcordado();
    return resposta;
  } catch (erro) {
    if (controlo.signal.aborted) {
      throw new ErroApi(t('O servidor demorou demasiado a responder. Tenta outra vez.'), 0, undefined, 'tempo');
    }
    registarFalhaRede();
    throw new ErroApi(t('Sem ligação ao servidor. Verifica a internet e tenta outra vez.'), 0, undefined, 'rede');
  } finally {
    clearTimeout(limite);
    clearTimeout(aviso);
    if (lento) mudarLentos(-1);
  }
}

/**
 * Um pedido à API. Devolve o JSON da resposta, ou null quando a resposta não tem corpo (204).
 * Erros: ErroApi com a mensagem para mostrar e o estado HTTP.
 */
export async function pedir<T>(caminho: string, opcoes: OpcoesPedido = {}): Promise<T> {
  const { metodo = 'GET', corpo, autenticado = true, esperar = true, cabecalhos } = opcoes;
  if (esperar && esperaInicial) await esperaInicial;

  try {
    return await comNovasTentativas(metodo === 'GET', async () => {
      let resposta = await enviar(caminho, { metodo, corpo, autenticado, cabecalhos }, false);
      // Token expirado ou revogado entretanto: pedir um novo ao Firebase e tentar mais uma vez
      if (resposta.status === 401 && autenticado) {
        resposta = await enviar(caminho, { metodo, corpo, autenticado, cabecalhos }, true);
      }

      if (!resposta.ok) {
        const problema = await lerProblema(resposta);
        throw new ErroApi(mensagemDeErro(resposta.status, problema), resposta.status, problema);
      }

      if (resposta.status === 204) return null as T;
      const texto = await resposta.text();
      return (texto ? JSON.parse(texto) : null) as T;
    });
  } catch (erro) {
    registarFalha(erro, metodo, caminho);
    throw erro;
  }
}

/**
 * Um ficheiro da API (ex.: o relatório em PDF): GET com o token, com o mesmo tempo limite, aviso de
 * "servidor a acordar" e nova tentativa com um token novo que os outros pedidos. Devolve os bytes.
 */
export async function pedirBytes(caminho: string, tipo: string): Promise<Uint8Array> {
  if (esperaInicial) await esperaInicial;

  const opcoes = { metodo: 'GET' as const, autenticado: true, aceitar: tipo };
  try {
    return await comNovasTentativas(true, async () => {
      let resposta = await enviar(caminho, opcoes, false);
      if (resposta.status === 401) resposta = await enviar(caminho, opcoes, true);

      if (!resposta.ok) {
        const problema = await lerProblema(resposta);
        throw new ErroApi(mensagemDeErro(resposta.status, problema), resposta.status, problema);
      }

      return new Uint8Array(await resposta.arrayBuffer());
    });
  } catch (erro) {
    registarFalha(erro, 'GET', caminho);
    throw erro;
  }
}

/** Atalhos por método HTTP. */
export const api = {
  get: <T>(caminho: string) => pedir<T>(caminho),
  post: <T = unknown>(caminho: string, corpo?: unknown) => pedir<T>(caminho, { metodo: 'POST', corpo }),
  put: <T = unknown>(caminho: string, corpo?: unknown) => pedir<T>(caminho, { metodo: 'PUT', corpo }),
  patch: <T = unknown>(caminho: string, corpo?: unknown) => pedir<T>(caminho, { metodo: 'PATCH', corpo }),
  // O corpo é opcional (ex.: DELETE /api/conta leva { confirmacao })
  delete: <T = unknown>(caminho: string, corpo?: unknown) => pedir<T>(caminho, { metodo: 'DELETE', corpo }),
};

/**
 * Acorda a API (que no Render adormece ao fim de 15 minutos sem pedidos) com um pedido a /saude,
 * que não precisa de login nem de base de dados. Chamar o mais cedo possível (ex.: ao abrir a app).
 * Nunca lança erros: devolve se a API respondeu.
 */
export async function acordarServidor(): Promise<boolean> {
  try {
    await pedir('/saude', { autenticado: false, esperar: false });
    return true;
  } catch {
    return false;
  }
}

/** Para pôr valores (ids, meses) num caminho: "/api/despesas-fixas/" + parte(id). */
export const parte = (valor: string) => encodeURIComponent(valor);
