import { api, parte } from './api';
import type { ComparacaoEstrategias, ExtratoCredito, ExtratoLido, SimulacaoDivida } from './tipos';

// Simulador, estratégias e extrato das dívidas com taxa (a API faz as contas: backend Regras/Amortizacao.cs).
// Nenhuma destas chamadas altera dívidas, exceto aplicarExtrato.

export interface PedidoSimulacao {
  amortizacao?: number; // amortizar tanto de uma vez
  extraMensal?: number; // pagar mais tanto por mês
}

export const DividasApi = {
  // A dívida tem de ter taxa e prestação (ou um extrato importado); senão a API responde 400 com o motivo
  simular(id: string, pedido: PedidoSimulacao): Promise<SimulacaoDivida> {
    return api.post<SimulacaoDivida>(`/api/dividas/${parte(id)}/simulacao`, {
      amortizacao: pedido.amortizacao ?? null,
      extraMensal: pedido.extraMensal ?? null,
    });
  },

  // Bola de neve e avalanche para todas as dívidas com prestação ligada
  compararEstrategias(extraMensal: number): Promise<ComparacaoEstrategias> {
    return api.post<ComparacaoEstrategias>('/api/dividas/estrategias', { extraMensal });
  },

  // Lê o PDF do extrato (em base64). Não grava nada nem guarda o PDF
  lerExtrato(pdfBase64: string): Promise<ExtratoLido> {
    return api.post<ExtratoLido>('/api/dividas/extrato/ler', { pdfBase64 });
  },

  // Atualiza a dívida (dividaId) ou cria uma nova (titulo) com o extrato lido; devolve o id
  async aplicarExtrato(pedido: {
    extrato: ExtratoCredito;
    dividaId?: string;
    titulo?: string;
    fixaId?: string;
  }): Promise<string> {
    return (
      await api.post<{ id: string }>('/api/dividas/extrato/aplicar', {
        extrato: pedido.extrato,
        dividaId: pedido.dividaId ?? null,
        titulo: pedido.titulo ?? null,
        fixaId: pedido.fixaId ?? null,
      })
    ).id;
  },
};
