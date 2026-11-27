import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { t } from '../i18n';

// O estado da ligação à internet (NetInfo, também na web), guardado aqui para ser lido sem esperar.
// Enquanto o NetInfo não responde conta como ligado: na dúvida, tenta-se o pedido.

/** Sem rede, ou com rede mas sem chegar à internet (ex.: Wi-Fi sem acesso). null = ainda não se sabe. */
export function semLigacaoNoEstado(estado: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return estado.isConnected === false || estado.isInternetReachable === false;
}

let semLigacaoAgora = false;
const ouvintes = new Set<(semLigacao: boolean) => void>();
let aOuvirNetInfo = false;

function comecarAOuvir() {
  if (aOuvirNetInfo) return;
  aOuvirNetInfo = true;
  try {
    NetInfo.addEventListener((estado) => {
      const agora = semLigacaoNoEstado(estado);
      if (agora === semLigacaoAgora) return;
      semLigacaoAgora = agora;
      ouvintes.forEach((ouvinte) => ouvinte(agora));
    });
  } catch (erro) {
    console.error('NetInfo indisponível:', erro);
  }
}

/** O último estado conhecido (síncrono). */
export function semLigacao(): boolean {
  comecarAOuvir();
  return semLigacaoAgora;
}

/** Pergunta ao NetInfo agora. Só diz "sem ligação" quando o telemóvel não tem rede nenhuma. */
export async function semRede(): Promise<boolean> {
  try {
    const estado = await NetInfo.fetch();
    return estado.isConnected === false;
  } catch {
    return false;
  }
}

/** Avisa quando a ligação cai (true) e quando volta (false). Devolve a função para deixar de ouvir. */
export function aoMudarLigacao(ouvinte: (semLigacao: boolean) => void): () => void {
  comecarAOuvir();
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Para os ecrãs: true enquanto não houver internet. */
export function useSemLigacao(): boolean {
  const [valor, setValor] = useState(semLigacao);
  useEffect(() => {
    setValor(semLigacao());
    return aoMudarLigacao(setValor);
  }, []);
  return valor;
}

// ---- A última falha de rede de um pedido à API ----
// Os ecrãs mostram "Não foi possível apagar…" sem saber porquê; mostrarAlerta junta "Sem ligação à
// internet" quando um pedido acabou de falhar por falta de rede (e não, por exemplo, por validação)

const RECENTE_MS = 5_000;
let ultimaFalhaRede = 0;

export function registarFalhaRede(): void {
  ultimaFalhaRede = Date.now();
}

export function falhaRedeRecente(agora = Date.now()): boolean {
  return ultimaFalhaRede > 0 && agora - ultimaFalhaRede < RECENTE_MS;
}

export const MENSAGEM_SEM_LIGACAO = 'Sem ligação à internet.';

/** A mensagem de erro de um ecrã, com "Sem ligação à internet." à frente se for essa a causa. */
export function comMotivoDeRede(mensagem: string): string {
  if (mensagem.startsWith('Sem ligação') || mensagem.startsWith(t('Sem ligação')) || !falhaRedeRecente()) return mensagem;
  return `${t(MENSAGEM_SEM_LIGACAO)} ${mensagem}`;
}
