import { useEffect, useState } from 'react';
import { ContaCorrenteDB } from './database';
import { ouvir } from './eventos';
import type { CartaoAlimentacao } from './tipos';

// O saldo do cartão de alimentação que o cabeçalho e o menu mostram ao lado do da conta. Os ecrãs que já leem o
// cartão (Início, Gastos do Dia a Dia, Salário) publicam aqui o que leram; os outros ecrãs pedem à API só se o que
// se conhece tem mais de meio minuto. null: sem cartão (ou ainda não se sabe), e nesse caso o cabeçalho não o mostra.

const VALIDADE_MS = 30_000;

let atual: number | null = null;
let utilizador: string | undefined;
let quando = 0;
let emCurso: Promise<void> | null = null;
const ouvintes = new Set<(saldo: number | null) => void>();
// Há cartão de alimentação? undefined = ainda não se sabe (o saldo null não distingue os dois casos)
let tem: boolean | undefined;
const ouvintesTem = new Set<(tem: boolean | undefined) => void>();

function definirTem(valor: boolean | undefined) {
  if (tem === valor) return;
  tem = valor;
  ouvintesTem.forEach((o) => o(valor));
}

function mudar(saldo: number | null) {
  atual = saldo;
  quando = Date.now();
  ouvintes.forEach((o) => o(saldo));
}

// Outra conta a usar a app: esquece o saldo da anterior
function paraUtilizador(userId: string) {
  const mudouDeConta = utilizador !== undefined && utilizador !== userId;
  utilizador = userId;
  if (!mudouDeConta) return;
  emCurso = null;
  mudar(null);
  definirTem(undefined);
  quando = 0;
}

/** Um ecrã que acabou de ler o cartão partilha-o: o cabeçalho mostra o mesmo número sem novo pedido. */
export function publicarCartao(cartao: CartaoAlimentacao | null | undefined): void {
  if (!cartao) return;
  mudar(cartao.valorMensal > 0 ? cartao.saldo : null);
  definirTem(cartao.valorMensal > 0);
}

async function atualizar(userId: string | undefined): Promise<void> {
  if (emCurso) return emCurso;
  const pedido = (async () => {
    try {
      const cartao = await ContaCorrenteDB.getCartaoAlimentacao(userId ?? '');
      if (userId === utilizador) publicarCartao(cartao);
    } catch {
      // Sem ligação ou sem sessão: fica o último saldo que se conhecia (e tenta-se outra vez na próxima vez)
    }
  })().finally(() => {
    emCurso = null;
  });
  emCurso = pedido;
  return pedido;
}

/** O saldo do cartão de alimentação (null se não se usa), sempre atualizado. */
export function useSaldoCartao(userId: string | undefined): number | null {
  const [saldo, setSaldo] = useState<number | null>(atual);

  useEffect(() => {
    if (!userId) return;
    paraUtilizador(userId);
    setSaldo(atual);
    ouvintes.add(setSaldo);
    if (Date.now() - quando > VALIDADE_MS) void atualizar(userId);
    // Gravou-se um gasto fora do ecrã (botão rápido "+", fila offline): o cartão pode ter mudado
    const deixar = ouvir('dadosMudaram', () => void atualizar(userId));
    return () => {
      ouvintes.delete(setSaldo);
      deixar();
    };
  }, [userId]);

  return saldo;
}

/**
 * Há cartão de alimentação (ligado no Salário)? true/false, ou undefined enquanto não se sabe. Serve para esconder tudo o
 * que é do cartão a quem não o usa.
 */
export function useTemCartao(userId: string | undefined): boolean | undefined {
  const [valor, setValor] = useState<boolean | undefined>(tem);
  useSaldoCartao(userId); // pede o cartão se ainda não se conhece
  useEffect(() => {
    setValor(tem);
    ouvintesTem.add(setValor);
    return () => {
      ouvintesTem.delete(setValor);
    };
  }, [userId]);
  return valor;
}

// Só para os testes
export function __reporSaldoCartao() {
  tem = undefined;
  ouvintesTem.clear();
  atual = null;
  utilizador = undefined;
  quando = 0;
  emCurso = null;
  ouvintes.clear();
}
