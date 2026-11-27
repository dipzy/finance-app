import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ePreferenciaTema, type PreferenciaTema } from '../constants/esquema';

// Definições deste telemóvel (lembretes e bloqueio da app). Ficam só no dispositivo (AsyncStorage),
// não na API: cada telemóvel tem as suas. Qualquer erro a ler ou a gravar cai nos valores por defeito,
// para a app abrir sempre.

// Ao voltar à app: pedir a impressão digital logo (0) ou só depois de 1 ou 5 minutos fora
export const MINUTOS_BLOQUEIO = [0, 1, 5] as const;
export type MinutosBloqueio = (typeof MINUTOS_BLOQUEIO)[number];

export interface Definicoes {
  // Lembretes das despesas mensais por pagar (na véspera, às 9h)
  notificacoes: boolean;
  // Também no próprio dia do débito, às 9h
  lembrarNoDia: boolean;
  // "Hoje é dia de salário" (só com as notificações ligadas)
  lembrarSalario: boolean;
  // Avisos (push) do servidor: orçamentos perto do limite, pagamentos a vencer ou em atraso, objetivos
  // atrasados. Só com permissão do sistema; liga/desliga o registo deste telemóvel (services/push.ts)
  alertasServidor: boolean;
  // Pedir a impressão digital / PIN do telemóvel ao abrir a app
  bloqueio: boolean;
  bloqueioMinutos: MinutosBloqueio;
  // Páginas escondidas do menu e dos separadores (ids de utils/paginas.ts)
  ocultos: string[];
  // Aparência: seguir o sistema, ou sempre claro / sempre escuro (ver services/tema.ts)
  tema: PreferenciaTema;
}

export const DEFINICOES_PADRAO: Definicoes = {
  notificacoes: false,
  lembrarNoDia: false,
  lembrarSalario: true,
  alertasServidor: false,
  bloqueio: false,
  bloqueioMinutos: 1,
  ocultos: [],
  tema: 'sistema',
};

const CHAVE = '@financas:definicoes';

// Só se aproveita o que tem o tipo certo: dados estragados ou de outra versão não partem a app
export function lerDefinicoes(texto: string | null | undefined): Definicoes {
  let guardado: Record<string, unknown> = {};
  try {
    const lido = texto ? JSON.parse(texto) : null;
    if (lido && typeof lido === 'object' && !Array.isArray(lido)) guardado = lido;
  } catch {
    // texto inválido: ficam os valores por defeito
  }
  const booleano = (chave: 'notificacoes' | 'lembrarNoDia' | 'lembrarSalario' | 'alertasServidor' | 'bloqueio') =>
    typeof guardado[chave] === 'boolean' ? (guardado[chave] as boolean) : (DEFINICOES_PADRAO[chave] as boolean);
  const minutos = guardado.bloqueioMinutos;
  return {
    notificacoes: booleano('notificacoes'),
    lembrarNoDia: booleano('lembrarNoDia'),
    lembrarSalario: booleano('lembrarSalario'),
    alertasServidor: booleano('alertasServidor'),
    bloqueio: booleano('bloqueio'),
    bloqueioMinutos: MINUTOS_BLOQUEIO.includes(minutos as MinutosBloqueio)
      ? (minutos as MinutosBloqueio)
      : DEFINICOES_PADRAO.bloqueioMinutos,
    ocultos: Array.isArray(guardado.ocultos)
      ? guardado.ocultos.filter((id): id is string => typeof id === 'string')
      : DEFINICOES_PADRAO.ocultos,
    tema: ePreferenciaTema(guardado.tema) ? guardado.tema : DEFINICOES_PADRAO.tema,
  };
}

// ---- Estado partilhado: o ecrã Definições muda, o bloqueio e os lembretes ouvem ----

let atuais: Definicoes | null = null;
let aCarregar: Promise<Definicoes> | null = null;
const ouvintes = new Set<(definicoes: Definicoes) => void>();

export function obterDefinicoes(): Promise<Definicoes> {
  if (atuais) return Promise.resolve(atuais);
  if (!aCarregar) {
    aCarregar = AsyncStorage.getItem(CHAVE)
      .catch((error) => {
        console.error('Erro ao ler as definições:', error);
        return null;
      })
      .then((texto) => {
        // Se entretanto alguém gravou, ganha o que foi gravado
        atuais = atuais ?? lerDefinicoes(texto);
        return atuais;
      });
  }
  return aCarregar;
}

// Grava só os campos indicados. Devolve as definições completas, já com a mudança
export async function guardarDefinicoes(mudancas: Partial<Definicoes>): Promise<Definicoes> {
  const novas = { ...(await obterDefinicoes()), ...mudancas };
  atuais = novas;
  ouvintes.forEach((ouvinte) => ouvinte(novas));
  try {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(novas));
  } catch (error) {
    // A mudança fica a valer até fechar a app
    console.error('Erro ao gravar as definições:', error);
  }
  return novas;
}

/** Avisa sempre que as definições mudam. Devolve a função para deixar de ouvir. */
export function aoMudarDefinicoes(ouvinte: (definicoes: Definicoes) => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** As definições atuais (null enquanto se leem do dispositivo), sempre atualizadas. */
export function useDefinicoes(): Definicoes | null {
  const [definicoes, setDefinicoes] = useState<Definicoes | null>(atuais);
  useEffect(() => {
    let ativo = true;
    obterDefinicoes().then((d) => ativo && setDefinicoes(d));
    const parar = aoMudarDefinicoes(setDefinicoes);
    return () => {
      ativo = false;
      parar();
    };
  }, []);
  return definicoes;
}

// Só para os testes: esquecer o que já foi lido
export function __reporDefinicoes() {
  atuais = null;
  aCarregar = null;
  ouvintes.clear();
}
