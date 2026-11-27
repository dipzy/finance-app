import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api } from './api';
import { migrarDoFirestoreSeNecessario } from './migracaoFirestore';

// A versão muito antiga da app guardava tudo só no dispositivo (localStorage na web,
// AsyncStorage no telemóvel). No primeiro login esses dados são enviados para a API
// (POST /api/migracao/local). Os dados locais não são apagados: ficam como cópia de segurança.

const KEYS = {
  USERS: '@financas:users',
  FINANCIAL_DATA: '@financas:financial',
  DESPESAS_FIXAS: '@financas:despesas_fixas',
  DESPESAS_EXTRAS: '@financas:despesas_extras',
};

// Marca que os dados deste utilizador local já foram importados (evita duplicar)
const chaveMigrado = (localId: number) => `@financas:migrado:${localId}`;

export interface UtilizadorLocal {
  id: number;
  email: string;
  name: string;
  password: string;
}

interface FinanceiroLocal {
  salario: string;
  pprPercentagem: string;
  poupancaPercentagem: string;
  lastUpdated?: string;
}

interface DespesaLocal {
  id: string;
  titulo: string;
  valor: number;
  data?: string;
}

async function lerItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  }
  return AsyncStorage.getItem(key);
}

async function escreverItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.setItem(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

async function lerJson<T>(key: string, vazio: T): Promise<T> {
  const raw = await lerItem(key);
  if (!raw) return vazio;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return vazio;
  }
}

export async function encontrarUtilizadorLocal(email: string, password: string): Promise<UtilizadorLocal | null> {
  const users = await lerJson<UtilizadorLocal[]>(KEYS.USERS, []);
  const alvo = email.trim().toLowerCase();
  return users.find((u) => u.email?.trim().toLowerCase() === alvo && u.password === password) ?? null;
}

// Os ids antigos eram Date.now(): servem para manter a ordem original
function criadoEm(idLocal: string): string | undefined {
  const ms = Number(idLocal);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : undefined;
}

// Devolve true se importou dados para o utilizador `uid`
export async function importarDadosLocais(email: string, password: string, uid: string): Promise<boolean> {
  const local = await encontrarUtilizadorLocal(email, password);
  if (!local || (await lerItem(chaveMigrado(local.id)))) return false;

  // Primeiro a cópia do Firestore: só é feita se o servidor ainda não tiver dados, e estes contavam como dados
  await migrarDoFirestoreSeNecessario(uid);

  const [financeiro, fixas, extras] = await Promise.all([
    lerJson<Record<string, FinanceiroLocal>>(KEYS.FINANCIAL_DATA, {}),
    lerJson<Record<string, DespesaLocal[]>>(KEYS.DESPESAS_FIXAS, {}),
    lerJson<Record<string, DespesaLocal[]>>(KEYS.DESPESAS_EXTRAS, {}),
  ]);

  const fin = financeiro[local.id];
  await api.post('/api/migracao/local', {
    financeiro: fin && {
      salario: fin.salario,
      pprPercentagem: fin.pprPercentagem,
      poupancaPercentagem: fin.poupancaPercentagem,
      lastUpdated: fin.lastUpdated,
    },
    despesasFixas: (fixas[local.id] ?? []).map((d) => ({ titulo: d.titulo, valor: d.valor, criadoEm: criadoEm(d.id) })),
    // A data pode estar no formato antigo ("02/10/2026"): a API aceita os dois
    despesasExtras: (extras[local.id] ?? []).map((d) => ({ titulo: d.titulo, valor: d.valor, data: d.data, criadoEm: criadoEm(d.id) })),
  });
  await escreverItem(chaveMigrado(local.id), uid);
  return true;
}
