// O estado do arranque da API (Render grátis: adormece e o 1.º pedido demora até ~1 minuto).
// Fica à parte de services/api.ts (que carrega o Firebase) para o aviso do cabeçalho o poder ouvir sem isso.

type OuvinteAcordar = (aAcordar: boolean) => void;
const ouvintes = new Set<OuvinteAcordar>();
let pedidosLentos = 0;
let aAcordarDesde: number | null = null;
let acordado = false;
let tentativa = 0;

/** Avisa quando há pedidos a demorar mais de AVISO_LENTO_MS (true) e quando acabam todos (false). Devolve a função para deixar de ouvir. */
export function aoAcordarServidor(ouvinte: OuvinteAcordar): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function servidorAAcordar(): boolean {
  return pedidosLentos > 0;
}

/** Desde quando (Date.now) o servidor está a acordar; null se não estiver. Para o contador do aviso. */
export function servidorAAcordarDesde(): number | null {
  return aAcordarDesde;
}

/** +1 quando um pedido passa a "lento" (ou começa a repetir), -1 quando acaba. */
export function mudarLentos(diferenca: number) {
  const antes = pedidosLentos > 0;
  pedidosLentos += diferenca;
  const agora = pedidosLentos > 0;
  if (antes !== agora) {
    aAcordarDesde = agora ? Date.now() : null;
    ouvintes.forEach((ouvinte) => ouvinte(agora));
  }
}

/** True depois de a API responder pela primeira vez: a partir daí uma falha é uma falha a sério. */
export function servidorJaAcordou(): boolean {
  return acordado;
}

export function marcarServidorAcordado() {
  acordado = true;
}

/** Em que nova tentativa vai o arranque (0 = nenhuma). */
export function tentativaDeAcordar(): number {
  return tentativa;
}

export function definirTentativa(n: number) {
  tentativa = n;
}

/** Só para os testes: o estado do arranque. */
export function __reporServidor(jaAcordou = false) {
  acordado = jaAcordou;
  tentativa = 0;
  pedidosLentos = 0;
  aAcordarDesde = null;
}
