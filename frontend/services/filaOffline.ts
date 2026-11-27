import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErroApi, pedir } from './api';
import { emitir } from './eventos';
import { semRede } from './ligacao';
import type { Categoria, MeioPagamento } from './tipos';

// Fila offline dos gastos novos (Gastos do Dia a Dia).
//
// Registar um gasto sem internet não se perde: fica guardado no telemóvel (AsyncStorage), aparece
// logo nas listas como "por enviar" e é enviado à API, pela ordem em que foi registado, quando a
// ligação voltar (ao voltar a rede, ao voltar à app e ao mudar de ecrã: ver GestorGastoRapido).
//
//   - Só entram na fila as falhas de rede (sem rede no NetInfo, sem resposta, tempo esgotado). Uma
//     recusa da API (4xx, ex.: 409 "o cartão não tem saldo") é mostrada logo e não entra na fila;
//     se for na fila que a API recusa, o gasto fica marcado com o erro para ser editado ou apagado.
//   - Cada gasto tem um id gerado aqui, enviado no cabeçalho Idempotency-Key: se a API gravou mas a
//     resposta se perdeu, o reenvio com a mesma chave não cria um segundo gasto.
//   - Os saldos continuam a ser só os da API: um gasto por enviar ainda não saiu da conta.

const CHAVE = 'financas.filaGastos.v1';
const CAMINHO = '/api/despesas-extras';

export interface NovoGasto {
  titulo: string;
  valor: number;
  data?: string; // ISO (aaaa-mm-dd)
  categoria?: Categoria;
  meioPagamento?: MeioPagamento;
  litros?: number; // combustível
}

export interface GastoPendente {
  id: string; // também é a Idempotency-Key
  userId: string;
  gasto: NovoGasto;
  criadoEm: string; // ISO, para a ordem de envio
  erro?: string; // a API recusou (4xx): fica à espera que seja editado ou apagado
}

export type ResultadoAdicionar = 
  | { pendente: false; id: string } 
  | { pendente: true; gasto: GastoPendente };

/** Um id único (UUID v4) para a Idempotency-Key. */
export function novoId(): string {
  const cripto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cripto?.randomUUID) return cripto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** A falha foi de rede (sem resposta ou tempo esgotado) e não uma recusa da API? */
export const eFalhaDeRede = (erro: unknown) => erro instanceof ErroApi && erro.estado === 0;

// Recusa definitiva: o mesmo pedido voltaria a ser recusado (401 não: é a sessão, tenta-se mais tarde)
const eRecusa = (erro: unknown) =>
  erro instanceof ErroApi && erro.estado >= 400 && erro.estado < 500 && erro.estado !== 401 && erro.estado !== 408 && erro.estado !== 429;

function enviarGasto(gasto: NovoGasto, id: string): Promise<unknown> {
  return pedir(CAMINHO, {
    metodo: 'POST',
    corpo: {
      titulo: gasto.titulo,
      valor: gasto.valor,
      data: gasto.data,
      categoria: gasto.categoria,
      meioPagamento: gasto.meioPagamento,
      litros: gasto.litros,
    },
    cabecalhos: { 'Idempotency-Key': id },
  });
}

// ---- Armazenamento (uma operação de cada vez: ler, mudar e gravar não se podem cruzar) ----

let emCurso: Promise<unknown> = Promise.resolve();

function emSerie<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado = emCurso.then(tarefa, tarefa);
  emCurso = resultado.catch(() => undefined);
  return resultado;
}

async function ler(): Promise<GastoPendente[]> {
  try {
    const texto = await AsyncStorage.getItem(CHAVE);
    const lista = texto ? JSON.parse(texto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch (erro) {
    console.error('Erro ao ler a fila de gastos:', erro);
    return [];
  }
}

const ouvintes = new Set<() => void>();

async function gravar(lista: GastoPendente[]): Promise<void> {
  await AsyncStorage.setItem(CHAVE, JSON.stringify(lista));
  ouvintes.forEach((ouvinte) => ouvinte());
}

function mudar(alterar: (lista: GastoPendente[]) => GastoPendente[]): Promise<void> {
  return emSerie(async () => gravar(alterar(await ler())));
}

/** Avisa sempre que a fila muda. Devolve a função para deixar de ouvir. */
export function aoMudarFila(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Esquece todos os gastos por enviar (ao apagar a conta: não são de mais ninguém neste telemóvel). */
export function limparFila(): Promise<void> {
  return emSerie(async () => {
    await AsyncStorage.removeItem(CHAVE);
    ouvintes.forEach((ouvinte) => ouvinte());
  });
}

/** Os gastos por enviar deste utilizador, pela ordem em que foram registados. */
export async function listarPendentes(userId: string): Promise<GastoPendente[]> {
  const lista = await emSerie(ler);
  return lista.filter((p) => p.userId === userId);
}

async function enfileirar(userId: string, gasto: NovoGasto, id: string): Promise<GastoPendente> {
  const pendente: GastoPendente = { id, userId, gasto, criadoEm: new Date().toISOString() };
  await mudar((lista) => [...lista.filter((p) => p.id !== id), pendente]);
  return pendente;
}

/**
 * Regista um gasto: envia-o à API e, se não houver internet, guarda-o na fila (resultado pendente).
 * Recusas da API (4xx) e erros do servidor são lançados como antes (ErroApi).
 */
export async function adicionarGasto(userId: string, gasto: NovoGasto): Promise<ResultadoAdicionar> {
  const id = novoId();
  if (await semRede()) return { pendente: true, gasto: await enfileirar(userId, gasto, id) };
  try {
    const resposta = await enviarGasto(gasto, id) as { id: string };
    return { pendente: false, id: resposta.id };
  } catch (erro) {
    if (!eFalhaDeRede(erro)) throw erro;
    // Pode ter chegado à API (a resposta é que se perdeu): o reenvio leva a mesma chave
    return { pendente: true, gasto: await enfileirar(userId, gasto, id) };
  }
}

/** Corrigir um gasto por enviar (tira-lhe o erro: volta a ser tentado). */
export function editarPendente(id: string, gasto: NovoGasto): Promise<void> {
  return mudar((lista) => lista.map((p) => (p.id === id ? { ...p, gasto, erro: undefined } : p)));
}

export function apagarPendente(id: string): Promise<void> {
  return mudar((lista) => lista.filter((p) => p.id !== id));
}

// ---- Envio ----

let aSincronizar: Promise<number> | null = null;

/**
 * Envia os gastos por enviar deste utilizador, por ordem. Pára na primeira falha de rede (os
 * seguintes ficam para a próxima). Os recusados pela API ficam marcados com o erro e passa-se ao
 * seguinte. Devolve quantos foram enviados; se algum foi, emite "dadosMudaram".
 * Chamadas enquanto já está a enviar esperam por esse envio (não há envios em paralelo).
 */
export function sincronizar(userId: string): Promise<number> {
  if (!aSincronizar) {
    aSincronizar = enviarFila(userId).finally(() => {
      aSincronizar = null;
    });
  }
  return aSincronizar;
}

async function enviarFila(userId: string): Promise<number> {
  let enviados = 0;
  const tentados = new Set<string>();
  try {
    if (await semRede()) return 0;
    for (;;) {
      const lista = await listarPendentes(userId);
      const seguinte = lista.find((p) => !p.erro && !tentados.has(p.id));
      if (!seguinte) break;
      tentados.add(seguinte.id);
      try {
        await enviarGasto(seguinte.gasto, seguinte.id);
        await apagarPendente(seguinte.id);
        enviados++;
      } catch (erro) {
        if (eRecusa(erro)) {
          const mensagem = (erro as ErroApi).message;
          await mudar((atual) => atual.map((p) => (p.id === seguinte.id ? { ...p, erro: mensagem } : p)));
          continue;
        }
        // Sem rede, servidor em baixo, sessão a renovar: tenta-se mais tarde, pela mesma ordem
        break;
      }
    }
  } catch (erro) {
    console.error('Erro ao enviar os gastos por enviar:', erro);
  }
  if (enviados > 0) emitir('dadosMudaram');
  return enviados;
}
