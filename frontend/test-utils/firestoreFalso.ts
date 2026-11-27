// Firestore falso, em memória. Os dados já não vivem no Firestore (passaram para a API): isto serve
// para testar a cópia única do Firestore para a API (services/migracaoFirestore.ts) sem rede:
//   jest.mock('firebase/firestore', () => require('../test-utils/firestoreFalso'));

type Dados = Record<string, any>;
type RefDoc = { tipo: 'doc'; path: string; id: string };
type RefColecao = { tipo: 'col'; path: string };
type Restricao = { ordenarPor?: string; onde?: { campo: string; op: string; valor: unknown }; limite?: number };
type Consulta = { tipo: 'consulta'; colecao: RefColecao; restricoes: Restricao[] };

const documentos = new Map<string, Dados>();
let proximoId = 0;

const clonar = <T>(valor: T): T => JSON.parse(JSON.stringify(valor));

class Incremento {
  constructor(readonly valor: number) {}
}
class ApagarCampo {}

const eObjeto = (v: unknown): v is Dados =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Incremento) && !(v instanceof ApagarCampo);

// set com merge junta mapas em profundidade; update substitui cada campo de topo
function aplicar(alvo: Dados, dados: Dados, profundo: boolean): Dados {
  for (const [chave, valor] of Object.entries(dados)) {
    if (valor instanceof ApagarCampo) {
      delete alvo[chave];
    } else if (valor instanceof Incremento) {
      alvo[chave] = (typeof alvo[chave] === 'number' ? alvo[chave] : 0) + valor.valor;
    } else if (eObjeto(valor)) {
      alvo[chave] = aplicar(profundo && eObjeto(alvo[chave]) ? alvo[chave] : {}, valor, true);
    } else if (valor !== undefined) {
      // ignoreUndefinedProperties: true, como em services/firebase.ts
      alvo[chave] = clonar(valor);
    }
  }
  return alvo;
}

function fotografia(ref: RefDoc) {
  const dados = documentos.get(ref.path);
  return {
    id: ref.id,
    exists: () => dados !== undefined,
    data: () => (dados === undefined ? undefined : clonar(dados)),
  };
}

function fazerSet(ref: RefDoc, dados: Dados, opcoes?: { merge?: boolean }) {
  const atual = opcoes?.merge ? clonar(documentos.get(ref.path) ?? {}) : {};
  documentos.set(ref.path, aplicar(atual, dados, true));
}

function fazerUpdate(ref: RefDoc, dados: Dados) {
  const atual = documentos.get(ref.path);
  if (!atual) throw new Error(`Documento não existe: ${ref.path}`);
  documentos.set(ref.path, aplicar(clonar(atual), dados, false));
}

// ---- Ajudas para os testes ----

export function limparFirestore() {
  documentos.clear();
  proximoId = 0;
}

export function lerDocumento(path: string): Dados | undefined {
  const dados = documentos.get(path);
  return dados && clonar(dados);
}

export function escreverDocumento(path: string, dados: Dados) {
  documentos.set(path, clonar(dados));
}

// ---- API do Firestore usada pela app ----

export const increment = (valor: number) => new Incremento(valor);
export const deleteField = () => new ApagarCampo();

export function collection(_db: unknown, ...partes: string[]): RefColecao {
  return { tipo: 'col', path: partes.join('/') };
}

// doc(db, 'users', uid) | doc(colecao) com id automático | doc(colecao, id)
export function doc(base: any, ...partes: string[]): RefDoc {
  if (base?.tipo === 'col') {
    const id = partes[0] ?? `auto-${String(++proximoId).padStart(4, '0')}`;
    return { tipo: 'doc', path: `${base.path}/${id}`, id };
  }
  return { tipo: 'doc', path: partes.join('/'), id: partes[partes.length - 1] };
}

export async function getDoc(ref: RefDoc) {
  return fotografia(ref);
}

export async function setDoc(ref: RefDoc, dados: Dados, opcoes?: { merge?: boolean }) {
  fazerSet(ref, dados, opcoes);
}

export async function updateDoc(ref: RefDoc, dados: Dados) {
  fazerUpdate(ref, dados);
}

export async function addDoc(colecao: RefColecao, dados: Dados) {
  const ref = doc(colecao);
  fazerSet(ref, dados);
  return ref;
}

export async function deleteDoc(ref: RefDoc) {
  documentos.delete(ref.path);
}

export const orderBy = (campo: string): Restricao => ({ ordenarPor: campo });
export const limit = (n: number): Restricao => ({ limite: n });
export function where(campo: string, op: string, valor: unknown): Restricao {
  if (op !== '==') throw new Error(`Firestore falso: operador ${op} não suportado`);
  return { onde: { campo, op, valor } };
}

export function query(colecao: RefColecao, ...restricoes: Restricao[]): Consulta {
  return { tipo: 'consulta', colecao, restricoes };
}

// Aceita uma coleção ou uma consulta (where ==, orderBy, limit)
export async function getDocs(alvo: RefColecao | Consulta) {
  const consulta: Consulta = alvo.tipo === 'col' ? { tipo: 'consulta', colecao: alvo, restricoes: [] } : alvo;
  const prefixo = `${consulta.colecao.path}/`;
  let encontrados = [...documentos.entries()].filter(
    ([path]) => path.startsWith(prefixo) && !path.slice(prefixo.length).includes('/')
  );
  for (const r of consulta.restricoes) {
    if (r.onde) {
      const { campo, valor } = r.onde;
      encontrados = encontrados.filter(([, dados]) => dados[campo] === valor);
    }
    if (r.ordenarPor) {
      const campo = r.ordenarPor;
      // Como no Firestore real: orderBy exclui documentos sem o campo
      encontrados = encontrados
        .filter(([, dados]) => dados[campo] !== undefined)
        .sort(([, a], [, b]) => String(a[campo]).localeCompare(String(b[campo])));
    }
  }
  const limite = consulta.restricoes.find((r) => r.limite !== undefined)?.limite;
  if (limite !== undefined) encontrados = encontrados.slice(0, limite);
  const docs = encontrados.map(([path, dados]) => {
    const id = path.split('/').pop()!;
    return { id, ref: { tipo: 'doc' as const, path, id }, data: () => clonar(dados) };
  });
  return { docs, empty: docs.length === 0, size: docs.length };
}

// As escritas só são aplicadas no fim, como numa transação real
export async function runTransaction<T>(_db: unknown, funcao: (tx: any) => Promise<T>): Promise<T> {
  const pendentes: (() => void)[] = [];
  const tx = {
    get: async (ref: RefDoc) => fotografia(ref),
    set: (ref: RefDoc, dados: Dados, opcoes?: { merge?: boolean }) => (pendentes.push(() => fazerSet(ref, dados, opcoes)), tx),
    update: (ref: RefDoc, dados: Dados) => (pendentes.push(() => fazerUpdate(ref, dados)), tx),
    delete: (ref: RefDoc) => (pendentes.push(() => documentos.delete(ref.path)), tx),
  };
  const resultado = await funcao(tx);
  pendentes.forEach((escrita) => escrita());
  return resultado;
}

export function writeBatch(_db: unknown) {
  const pendentes: (() => void)[] = [];
  const batch = {
    set: (ref: RefDoc, dados: Dados, opcoes?: { merge?: boolean }) => (pendentes.push(() => fazerSet(ref, dados, opcoes)), batch),
    update: (ref: RefDoc, dados: Dados) => (pendentes.push(() => fazerUpdate(ref, dados)), batch),
    delete: (ref: RefDoc) => (pendentes.push(() => documentos.delete(ref.path)), batch),
    commit: async () => pendentes.forEach((escrita) => escrita()),
  };
  return batch;
}
