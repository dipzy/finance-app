import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { ErroApi, esperarAntesDosPedidos, pedir } from './api';
import { db } from './firebase';

// Cópia única dos dados do Firestore para a API (.NET + PostgreSQL).
//
// Até esta versão, os dados de cada utilizador viviam no Firestore (users/{uid} e subcoleções).
// Agora vivem na API. No primeiro login com esta versão:
//   1. pergunta-se à API se já tem dados deste utilizador (GET /api/migracao/estado);
//   2. se não tiver, lê-se tudo do Firestore (só leitura: nada é apagado, fica como cópia de segurança);
//   3. e envia-se tudo para a API (POST /api/migracao), que grava numa só transação mantendo os ids.
// Enquanto isto corre, os outros pedidos à API esperam (esperarAntesDosPedidos), para nenhum ecrã
// criar dados no servidor antes da cópia.

const COLECOES = ['despesasFixas', 'pagamentosFixas', 'despesasExtras', 'poupancas', 'dividas', 'meses'] as const;
type Colecao = (typeof COLECOES)[number];

export type DadosFirestore = { utilizador: Record<string, unknown> | null } & Record<Colecao, Record<string, unknown>[]>;

export interface ResumoMigracao {
  despesasFixas: number;
  pagamentosFixas: number;
  despesasExtras: number;
  poupancas: number;
  dividas: number;
  meses: number;
  ignorados: string[];
}

export type ResultadoMigracao = { copiado: false } | { copiado: true; resumo: ResumoMigracao };

// ---- Normalização: os documentos do Firestore para JSON com os tipos que a API espera ----
// Versões antigas da app guardaram alguns campos com outro tipo (ex.: valor de uma poupança como
// número) e o Firestore tem Timestamps; a API aceita só texto, números e booleanos.

type Esquema = 'texto' | 'numero' | 'inteiro' | 'booleano' | 'instante' | { [campo: string]: Esquema } | [Esquema];

const LINHA: Esquema = { titulo: 'texto', valor: 'numero', data: 'texto', informativo: 'booleano' };
const RECEBIMENTO: Esquema = {
  salario: 'numero',
  ppr: 'numero',
  poupanca: 'numero',
  liquido: 'numero',
  contribuicoes: [{ poupancaId: 'texto', nome: 'texto', valor: 'numero' }],
  data: 'instante',
};
const DESPESA: Esquema = {
  id: 'texto',
  titulo: 'texto',
  valor: 'numero',
  data: 'texto',
  mes: 'texto',
  descontadaDaConta: 'booleano',
  diaDebito: 'inteiro',
  inicio: 'texto',
  fim: 'texto',
  periodicidade: 'texto',
  mesAnual: 'inteiro',
  debitado: 'booleano',
  mesDebitado: 'texto',
  anuladoMes: 'texto',
  criadoEm: 'instante',
};

const ESQUEMAS: { utilizador: Esquema } & Record<Colecao, Esquema> = {
  utilizador: {
    email: 'texto',
    name: 'texto',
    createdAt: 'instante',
    financeiro: { salario: 'texto', pprPercentagem: 'texto', poupancaPercentagem: 'texto', lastUpdated: 'instante' },
    salario: { valor: 'texto', diaRecebimento: 'inteiro', lastReceived: 'instante', ultimoRecebimento: RECEBIMENTO, cartaoAlimentacao: 'texto' },
    contaCorrente: { saldo: 'numero', ultimaAtualizacao: 'instante' },
    configPPRPoupanca: { pprTipo: 'texto', pprValor: 'texto', poupancaTipo: 'texto', poupancaValor: 'texto' },
    migracoes: { pagamentosPorMes: 'booleano', poupancasLista: 'booleano' },
  },
  despesasFixas: DESPESA,
  despesasExtras: DESPESA,
  pagamentosFixas: { id: 'texto', fixaId: 'texto', mes: 'texto', titulo: 'texto', valor: 'numero', data: 'texto', estado: 'texto' },
  poupancas: { id: 'texto', nome: 'texto', tipo: 'texto', valor: 'texto', saldo: 'numero', ordem: 'inteiro' },
  dividas: { id: 'texto', titulo: 'texto', valorInicial: 'numero', desde: 'texto', fixaId: 'texto' },
  meses: {
    id: 'texto',
    saldoInicial: 'numero',
    saldoFinal: 'numero',
    abertoEm: 'instante',
    recebimento: RECEBIMENTO,
    importado: { lucro: [LINHA], poupanca: [LINHA], saldoConta: 'numero', saldoPoupanca: [LINHA], totalAPagar: [LINHA] },
  },
};

// Timestamp do Firestore, Date ou texto -> ISO 8601
function instante(valor: unknown): string | undefined {
  if (typeof valor === 'string') return valor;
  if (valor instanceof Date) return valor.toISOString();
  const v = valor as { toDate?: () => Date; seconds?: number } | null;
  if (typeof v?.toDate === 'function') return v.toDate().toISOString();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return undefined;
}

function converter(valor: unknown, esquema: Esquema): unknown {
  if (valor === undefined || valor === null) return undefined;
  if (Array.isArray(esquema)) {
    return Array.isArray(valor) ? valor.map((v) => converter(v, esquema[0])).filter((v) => v !== undefined) : undefined;
  }
  if (typeof esquema === 'object') {
    if (typeof valor !== 'object') return undefined;
    const resultado: Record<string, unknown> = {};
    for (const [campo, sub] of Object.entries(esquema)) {
      const convertido = converter((valor as Record<string, unknown>)[campo], sub);
      if (convertido !== undefined) resultado[campo] = convertido;
    }
    return resultado;
  }
  switch (esquema) {
    case 'texto':
      return typeof valor === 'string' ? valor : typeof valor === 'number' || typeof valor === 'boolean' ? String(valor) : instante(valor);
    case 'numero':
    case 'inteiro': {
      const numero = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() ? Number(valor) : NaN;
      if (!Number.isFinite(numero)) return undefined;
      return esquema === 'inteiro' ? Math.round(numero) : numero;
    }
    case 'booleano':
      return typeof valor === 'boolean' ? valor : valor === 'true' ? true : valor === 'false' ? false : undefined;
    case 'instante':
      return instante(valor);
  }
}

/** Os dados lidos do Firestore no formato que a API espera (pura: sem rede, para os testes). */
export function normalizarDadosFirestore(
  utilizador: Record<string, unknown> | null | undefined,
  colecoes: Partial<Record<Colecao, Record<string, unknown>[]>>
): DadosFirestore {
  const dados = { utilizador: utilizador ? (converter(utilizador, ESQUEMAS.utilizador) as Record<string, unknown>) : null } as DadosFirestore;
  for (const nome of COLECOES) {
    dados[nome] = (colecoes[nome] ?? []).map((d) => converter(d, ESQUEMAS[nome]) as Record<string, unknown>);
  }
  return dados;
}

/** Lê (só leitura) tudo o que o utilizador tem no Firestore. */
export async function lerDadosFirestore(uid: string): Promise<DadosFirestore> {
  const [utilizador, ...snaps] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    ...COLECOES.map((nome) => getDocs(collection(db, 'users', uid, nome))),
  ]);
  const colecoes = {} as Record<Colecao, Record<string, unknown>[]>;
  COLECOES.forEach((nome, i) => {
    colecoes[nome] = snaps[i].docs.map((d) => ({ ...d.data(), id: d.id }));
  });
  return normalizarDadosFirestore(utilizador.data() as Record<string, unknown> | undefined, colecoes);
}

async function migrar(uid: string): Promise<ResultadoMigracao> {
  const estado = await pedir<{ temDados: boolean; importado: boolean }>('/api/migracao/estado', { esperar: false });
  if (estado.temDados || estado.importado) return { copiado: false };

  const dados = await lerDadosFirestore(uid);
  try {
    const resumo = await pedir<ResumoMigracao>('/api/migracao', { metodo: 'POST', corpo: dados, esperar: false });
    if (resumo.ignorados.length) console.warn('Migração do Firestore: documentos ignorados', resumo.ignorados);
    return { copiado: true, resumo };
  } catch (erro) {
    // Outro dispositivo fez a cópia entretanto
    if (erro instanceof ErroApi && erro.estado === 409) return { copiado: false };
    throw erro;
  }
}

let emCurso: { uid: string; promessa: Promise<ResultadoMigracao> } | null = null;
const verificados = new Set<string>();

/**
 * Copia os dados do Firestore para a API se ainda não estiverem lá. Corre no máximo uma vez ao
 * mesmo tempo (quem chamar enquanto corre recebe a mesma promessa) e, depois de correr bem, não
 * volta a perguntar à API nesta sessão. Se falhar, a promessa rejeita (para mostrar o erro) e
 * volta a tentar na próxima chamada.
 */
export function migrarDoFirestoreSeNecessario(uid: string): Promise<ResultadoMigracao> {
  if (verificados.has(uid)) return Promise.resolve({ copiado: false });
  if (emCurso?.uid === uid) return emCurso.promessa;

  const promessa = migrar(uid).then((resultado) => {
    verificados.add(uid);
    return resultado;
  });
  const atual = { uid, promessa };
  emCurso = atual;
  promessa.then(
    () => undefined,
    () => undefined
  ).then(() => {
    if (emCurso === atual) emCurso = null;
  });
  esperarAntesDosPedidos(promessa);
  return promessa;
}

/** Só para os testes: esquecer o que já foi verificado. */
export function reiniciarMigracaoFirestore(): void {
  emCurso = null;
  verificados.clear();
}
