import { api, parte } from './api';

// Mealheiros do grupo (poupanças partilhadas): o saldo só muda com dinheiro de verdade
// (contribuir tira da minha conta, levantar põe na minha conta) e cada movimento fica no histórico.

export type ContribuidorDto = { uid: string; nome: string; total: number };

export type PoupancaPartilhadaDto = {
  id: string;
  grupoId: string;
  nome: string;
  saldo: number;
  objetivo?: number;
  dataObjetivo?: string;
  versao: number;
  criadoEm: string;
  /** Quanto pôs cada pessoa (entradas menos levantamentos). */
  contribuidores: ContribuidorDto[];
};

export type MovimentoPoupancaPartilhadaDto = {
  id: string;
  uid: string;
  nome: string;
  valor: number; // positivo = entrada; negativo = levantamento
  automatico: boolean;
  data: string;
};

export type TipoContribuicaoPartilhada = 'manual' | 'automatica';

export type PoupancaPartilhadaMembroDto = {
  id: string;
  poupancaPartilhadaId: string;
  membroUid: string;
  membroNome: string;
  valor: number; // em euros
  tipo: TipoContribuicaoPartilhada;
  diaDoSalario: boolean;
  diaFixo?: number;
  ultimaContribuicaoMes?: string;
  versao: number;
  criadoEm: string;
  /** A contribuição deste mês já foi feita (processada, marcada à mão, ou já puseste o valor no mealheiro). */
  feitaEsteMes?: boolean;
};

export type ContribuicaoPedido = {
  valor: number;
  tipo: TipoContribuicaoPartilhada;
  diaDoSalario: boolean;
  diaFixo?: number;
};

export const PoupancasPartilhadasDB = {
  listarDoGrupo(grupoId: string): Promise<PoupancaPartilhadaDto[]> {
    return api.get<PoupancaPartilhadaDto[]>(`/api/grupos/${parte(grupoId)}/poupancas-partilhadas`);
  },
  criar(grupoId: string, pedido: { nome: string; objetivo?: number; dataObjetivo?: string }): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/api/grupos/${parte(grupoId)}/poupancas-partilhadas`, pedido);
  },
  alterar(
    id: string,
    pedido: { nome?: string; objetivo?: number; dataObjetivo?: string; limpar?: ('objetivo' | 'dataObjetivo')[] }
  ): Promise<void> {
    return api.patch(`/api/poupancas-partilhadas/${parte(id)}`, pedido);
  },
  remover(id: string): Promise<void> {
    return api.delete(`/api/poupancas-partilhadas/${parte(id)}`);
  },
  contribuir(id: string, valor: number): Promise<void> {
    return api.post(`/api/poupancas-partilhadas/${parte(id)}/contribuir`, { valor });
  },
  levantar(id: string, valor: number): Promise<void> {
    return api.post(`/api/poupancas-partilhadas/${parte(id)}/levantar`, { valor });
  },
  movimentos(id: string): Promise<MovimentoPoupancaPartilhadaDto[]> {
    return api.get<MovimentoPoupancaPartilhadaDto[]>(`/api/poupancas-partilhadas/${parte(id)}/movimentos`);
  },
  contribuicoes(id: string): Promise<PoupancaPartilhadaMembroDto[]> {
    return api.get<PoupancaPartilhadaMembroDto[]>(`/api/poupancas-partilhadas/${parte(id)}/contribuicoes`);
  },
  minhasContribuicoes(): Promise<PoupancaPartilhadaMembroDto[]> {
    return api.get<PoupancaPartilhadaMembroDto[]>('/api/poupancas-partilhadas/contribuicoes/minhas');
  },
  guardarMinhaContribuicao(id: string, pedido: ContribuicaoPedido): Promise<{ id: string }> {
    return api.put<{ id: string }>(`/api/poupancas-partilhadas/${parte(id)}/contribuicoes/minha`, pedido);
  },
  /** Marca (ou desmarca) que a contribuição manual deste mês já foi feita; não mexe no dinheiro. */
  marcarContribuicaoFeita(id: string, feita: boolean): Promise<void> {
    return api.post(`/api/poupancas-partilhadas/${parte(id)}/contribuicoes/minha/feita`, { feita });
  },
  removerMinhaContribuicao(id: string): Promise<void> {
    return api.delete(`/api/poupancas-partilhadas/${parte(id)}/contribuicoes/minha`);
  },
};
