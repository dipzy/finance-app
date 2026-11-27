import { api, ErroApi, parte } from './api';

// A API manda os enums em camelCase ("admin", "membro")
export type RoleGrupo = 'admin' | 'membro';

/** Admin? (sem ligar a maiúsculas: as versões antigas da API mandavam "Admin") */
export const eAdmin = (role: string | undefined | null) => role?.toLowerCase() === 'admin';

/** Um grupo e o meu saldo nele (positivo = tenho a receber; negativo = devo). */
export type GrupoDto = {
  id: string;
  nome: string;
  criadoPorUid: string;
  criadoEm: string;
  minhaRole: RoleGrupo;
  totalMembros: number;
  meuSaldo: number;
};

export type GrupoMembroDto = {
  id: string;
  grupoId: string;
  uid: string;
  nome: string;
  email?: string;
  role: RoleGrupo;
  entradaEm: string;
  souEu: boolean;
};

export type ConviteGrupoDto = {
  id: string;
  grupoId: string;
  grupoNome: string;
  email: string;
  convidadoPorNome?: string;
  estado: 'pendente' | 'aceite' | 'recusado';
  criadoEm: string;
};

/** Os convites para o meu email; sem o email confirmado no Firebase a lista vem vazia. */
export type ConvitesRecebidosDto = {
  emailConfirmado: boolean;
  convites: ConviteGrupoDto[];
};

/** A mensagem da API quando recusa (400/404/409), senão a mensagem por defeito. */
export const mensagemDaApi = (erro: unknown, porDefeito: string) =>
  erro instanceof ErroApi && [400, 404, 409].includes(erro.estado) ? erro.message : porDefeito;

export const GruposDB = {
  listar(): Promise<GrupoDto[]> {
    return api.get<GrupoDto[]>('/api/grupos');
  },
  obter(id: string): Promise<GrupoDto> {
    return api.get<GrupoDto>(`/api/grupos/${parte(id)}`);
  },
  criar(nome: string): Promise<{ id: string }> {
    return api.post<{ id: string }>('/api/grupos', { nome });
  },
  alterar(id: string, pedido: { nome?: string }): Promise<void> {
    return api.put(`/api/grupos/${parte(id)}`, pedido);
  },
  remover(id: string): Promise<void> {
    return api.delete(`/api/grupos/${parte(id)}`);
  },
  sair(id: string): Promise<void> {
    return api.post(`/api/grupos/${parte(id)}/sair`);
  },
  listarMembros(grupoId: string): Promise<GrupoMembroDto[]> {
    return api.get<GrupoMembroDto[]>(`/api/grupos/${parte(grupoId)}/membros`);
  },
  removerMembro(grupoId: string, membroUid: string): Promise<void> {
    return api.delete(`/api/grupos/${parte(grupoId)}/membros/${parte(membroUid)}`);
  },
  alterarRole(grupoId: string, membroUid: string, role: RoleGrupo): Promise<void> {
    return api.put(`/api/grupos/${parte(grupoId)}/membros/${parte(membroUid)}/role`, { role });
  },
  convidar(grupoId: string, email: string): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/api/grupos/${parte(grupoId)}/convites`, { email });
  },
  /** Os convites pendentes deste grupo. */
  listarConvitesDoGrupo(grupoId: string): Promise<ConviteGrupoDto[]> {
    return api.get<ConviteGrupoDto[]>(`/api/grupos/${parte(grupoId)}/convites`);
  },
  listarConvitesRecebidos(): Promise<ConvitesRecebidosDto> {
    return api.get<ConvitesRecebidosDto>('/api/grupos/convites/recebidos');
  },
  aceitarConvite(conviteId: string): Promise<void> {
    return api.post(`/api/grupos/convites/${parte(conviteId)}/aceitar`);
  },
  recusarConvite(conviteId: string): Promise<void> {
    return api.post(`/api/grupos/convites/${parte(conviteId)}/recusar`);
  },
  cancelarConvite(conviteId: string): Promise<void> {
    return api.delete(`/api/grupos/convites/${parte(conviteId)}`);
  },
};
