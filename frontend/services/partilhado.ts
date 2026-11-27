import { api, parte } from './api';
import type { Categoria, MeioPagamento } from './tipos';

// Despesas partilhadas, acertos de contas, saldos e o resumo da parte partilhada (API: PartilhadoController)

export type ModoDivisao = 'igual' | 'valores' | 'percentagem' | 'partes';

/** Uma pessoa na divisão: o peso é o valor (modo valores), a % ou o nº de partes; sem peso em partes iguais. */
export type ParticipantePedido = { uid: string; peso?: number };

export type DespesaPartilhadaPedido = {
  titulo: string;
  valor: number;
  participantes: ParticipantePedido[];
  modo?: ModoDivisao;
  data?: string; // AAAA-MM-DD; sem data é hoje
  categoria?: Categoria;
  meioPagamento?: MeioPagamento;
  /** Uma despesa pessoal já registada que passa a ser partilhada. */
  despesaExtraId?: string;
};

/** Com quem uma despesa fixa se divide (cada pagamento passa a ser uma despesa partilhada no grupo). */
export type DivisaoFixa = { grupoId: string; modo: ModoDivisao; participantes: ParticipantePedido[] };

/** A minha parte: aceite (quem paga aceita à partida), por aceitar (ainda não conta) ou recusada (reparte-se pelos outros). */
export type EstadoParte = 'aceite' | 'pendente' | 'recusada';

export type ParteDto = {
  uid: string;
  nome: string;
  valor: number;
  peso?: number;
  estado?: EstadoParte;
  /** O que cabe de facto a esta pessoa (sem as partes recusadas dos outros); vazio se recusou. */
  valorEfetivo?: number;
};

export type DespesaPartilhadaDto = {
  id: string;
  grupoId: string;
  titulo: string;
  valor: number;
  data: string;
  categoria?: Categoria;
  pagadorUid: string;
  pagadorNome: string;
  meioPagamento: MeioPagamento;
  modo: ModoDivisao;
  partes: ParteDto[];
  criadoEm: string;
  /** Veio do pagamento de uma despesa fixa dividida: só se altera ou anula nas despesas fixas. */
  daDespesaFixa?: boolean;
  /** O saldo do meio de pagamento de quem pagou, logo antes de a despesa o debitar (vazio nas antigas). */
  saldoAntes?: number;
};

export type MembroSaldoDto = { uid: string; nome: string; saldo: number; ativo: boolean; souEu: boolean };

/** Um pagamento sugerido para acertar contas: deUid paga a paraUid. */
export type TransferenciaDto = { deUid: string; deNome: string; paraUid: string; paraNome: string; valor: number };

export type SaldosGrupoDto = {
  meuSaldo: number;
  membros: MembroSaldoDto[];
  transferencias: TransferenciaDto[];
  mes: string;
  totalGastoMes: number;
  minhaParteMes: number;
};

export type TipoAtividade = 'despesa' | 'acerto' | 'mealheiro';

/** Uma linha do feed do grupo. efeito = o que muda no meu saldo do grupo (+ fico a receber; - fico a dever). */
export type AtividadeDto = {
  tipo: TipoAtividade;
  id: string;
  data: string;
  criadoEm: string;
  titulo: string;
  valor: number;
  uid: string;
  nome: string;
  outroUid?: string;
  outroNome?: string;
  minhaParte?: number;
  efeito: number;
  categoria?: Categoria;
  podeApagar: boolean;
  /** Só nos acertos: quem recebeu já confirmou que o dinheiro chegou? */
  confirmado?: boolean;
  /** Sou eu quem recebe e ainda falta confirmar. */
  podeConfirmar?: boolean;
  /** Nas despesas: o estado da minha parte (vazio se não participo). */
  meuEstado?: EstadoParte;
  /** Nas despesas: quantas das outras pessoas ainda não aceitaram a sua parte. */
  porAceitar?: number;
};

export type ResumoGrupoDto = {
  grupoId: string;
  nome: string;
  meuSaldo: number;
  totalMembros: number;
  minhasTransferencias: TransferenciaDto[];
};

export type ResumoMealheiroDto = {
  id: string;
  grupoId: string;
  grupoNome: string;
  nome: string;
  saldo: number;
  objetivo?: number;
  dataObjetivo?: string;
  meuTotal: number;
  meuMes: number;
};

/** A parte partilhada para o Início e o Resumo do mês. */
export type ResumoPartilhadoDto = {
  mes: string;
  aReceber: number;
  aPagar: number;
  /** A minha parte das despesas partilhadas do mês (já está nos gastos do mês). */
  minhaParteMes: number;
  /** O que paguei pelo grupo este mês (o total, que saiu da minha conta). */
  pagoPorMimMes: number;
  convitesPendentes: number;
  grupos: ResumoGrupoDto[];
  mealheiros: ResumoMealheiroDto[];
};

export const PartilhadoDB = {
  resumo(mes?: string): Promise<ResumoPartilhadoDto> {
    return api.get<ResumoPartilhadoDto>(`/api/partilhado/resumo${mes ? `?mes=${parte(mes)}` : ''}`);
  },
  saldos(grupoId: string): Promise<SaldosGrupoDto> {
    return api.get<SaldosGrupoDto>(`/api/grupos/${parte(grupoId)}/saldos`);
  },
  atividade(grupoId: string, limite = 50): Promise<AtividadeDto[]> {
    return api.get<AtividadeDto[]>(`/api/grupos/${parte(grupoId)}/atividade?limite=${limite}`);
  },
  criarDespesa(grupoId: string, pedido: DespesaPartilhadaPedido): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/api/grupos/${parte(grupoId)}/despesas`, pedido);
  },
  obterDespesa(id: string): Promise<DespesaPartilhadaDto> {
    return api.get<DespesaPartilhadaDto>(`/api/despesas-partilhadas/${parte(id)}`);
  },
  alterarDespesa(id: string, pedido: DespesaPartilhadaPedido): Promise<void> {
    return api.put(`/api/despesas-partilhadas/${parte(id)}`, pedido);
  },
  aceitarDespesa(id: string): Promise<void> {
    return api.post(`/api/despesas-partilhadas/${parte(id)}/aceitar`, {});
  },
  /** Aceitar a parte e, se for o caso, acertar já com quem pagou (sai da conta). */
  async aceitarEPagar(despesaId: string, grupoId: string, deUid: string, paraUid: string, valor: number): Promise<void> {
    await PartilhadoDB.aceitarDespesa(despesaId);
    if (deUid === paraUid || !(valor > 0.004)) return;
    await PartilhadoDB.criarAcerto(grupoId, { deUid, paraUid, valor });
  },
  recusarDespesa(id: string): Promise<void> {
    return api.post(`/api/despesas-partilhadas/${parte(id)}/recusar`, {});
  },
  removerDespesa(id: string): Promise<void> {
    return api.delete(`/api/despesas-partilhadas/${parte(id)}`);
  },
  criarAcerto(grupoId: string, pedido: { deUid: string; paraUid: string; valor: number; data?: string }): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/api/grupos/${parte(grupoId)}/acertos`, pedido);
  },
  confirmarAcerto(id: string): Promise<void> {
    return api.post(`/api/acertos/${parte(id)}/confirmar`, {});
  },
  removerAcerto(id: string): Promise<void> {
    return api.delete(`/api/acertos/${parte(id)}`);
  },
};
