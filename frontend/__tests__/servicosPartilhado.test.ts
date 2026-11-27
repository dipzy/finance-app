// Os serviços da parte partilhada (grupos, despesas partilhadas, mealheiros): cada função chama a rota
// certa da API (Financas.Api/Controllers: GruposController, PartilhadoController,
// PoupancasPartilhadasController) com o método e o corpo certos. O jest.setup.js troca estes
// serviços por versões vazias para os ecrãs; aqui usam-se os verdadeiros, com o cliente HTTP falso.
jest.unmock('../services/grupos');
jest.unmock('../services/partilhado');
jest.unmock('../services/poupancasPartilhadas');
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: null } }));

const pedidos: { metodo: string; caminho: string; corpo?: unknown }[] = [];
jest.mock('../services/api', () => {
  const real = jest.requireActual('../services/api');
  const guardar = (metodo: string) => async (caminho: string, corpo?: unknown) => {
    pedidos.push({ metodo, caminho, corpo });
    return {};
  };
  return {
    ...real,
    api: { get: guardar('GET'), post: guardar('POST'), put: guardar('PUT'), patch: guardar('PATCH'), delete: guardar('DELETE') },
  };
});

import { ErroApi } from '../services/api';
import { eAdmin, GruposDB, mensagemDaApi } from '../services/grupos';
import { PartilhadoDB } from '../services/partilhado';
import { PoupancasPartilhadasDB } from '../services/poupancasPartilhadas';

const ultimo = () => pedidos[pedidos.length - 1];

beforeEach(() => {
  pedidos.length = 0;
});

describe('grupos', () => {
  it('convites: enviar, listar os do grupo e os recebidos, responder e cancelar', async () => {
    await GruposDB.convidar('g 1', 'ana@exemplo.pt');
    expect(ultimo()).toEqual({ metodo: 'POST', caminho: '/api/grupos/g%201/convites', corpo: { email: 'ana@exemplo.pt' } });

    await GruposDB.listarConvitesDoGrupo('g1');
    expect(ultimo()).toMatchObject({ metodo: 'GET', caminho: '/api/grupos/g1/convites' });
    await GruposDB.listarConvitesRecebidos();
    expect(ultimo()).toMatchObject({ metodo: 'GET', caminho: '/api/grupos/convites/recebidos' });
    await GruposDB.aceitarConvite('c1');
    expect(ultimo()).toMatchObject({ metodo: 'POST', caminho: '/api/grupos/convites/c1/aceitar' });
    await GruposDB.recusarConvite('c1');
    expect(ultimo()).toMatchObject({ metodo: 'POST', caminho: '/api/grupos/convites/c1/recusar' });
    await GruposDB.cancelarConvite('c1');
    expect(ultimo()).toMatchObject({ metodo: 'DELETE', caminho: '/api/grupos/convites/c1' });
  });

  it('membros: papel em camelCase, remover e sair', async () => {
    await GruposDB.alterarRole('g1', 'u1', 'admin');
    expect(ultimo()).toEqual({ metodo: 'PUT', caminho: '/api/grupos/g1/membros/u1/role', corpo: { role: 'admin' } });
    await GruposDB.removerMembro('g1', 'u1');
    expect(ultimo()).toMatchObject({ metodo: 'DELETE', caminho: '/api/grupos/g1/membros/u1' });
    await GruposDB.sair('g1');
    expect(ultimo()).toMatchObject({ metodo: 'POST', caminho: '/api/grupos/g1/sair' });
  });

  it('eAdmin aceita "admin" e o "Admin" das versões antigas', () => {
    expect(eAdmin('admin')).toBe(true);
    expect(eAdmin('Admin')).toBe(true);
    expect(eAdmin('membro')).toBe(false);
    expect(eAdmin(undefined)).toBe(false);
  });

  it('mensagemDaApi mostra a mensagem da API em 400/404/409 e a por defeito no resto', () => {
    expect(mensagemDaApi(new ErroApi('Só podes dividir com membros do grupo.', 400), 'x')).toBe('Só podes dividir com membros do grupo.');
    expect(mensagemDaApi(new ErroApi('erro interno', 500), 'Não foi possível.')).toBe('Não foi possível.');
    expect(mensagemDaApi(new Error('rede'), 'Não foi possível.')).toBe('Não foi possível.');
  });
});

describe('despesas partilhadas e acertos', () => {
  it('criar, ler, alterar e apagar uma despesa', async () => {
    const pedido = { titulo: 'Jantar', valor: 60, modo: 'valores' as const, participantes: [{ uid: 'a', peso: 20 }, { uid: 'b', peso: 40 }] };
    await PartilhadoDB.criarDespesa('g1', pedido);
    expect(ultimo()).toEqual({ metodo: 'POST', caminho: '/api/grupos/g1/despesas', corpo: pedido });
    await PartilhadoDB.obterDespesa('d1');
    expect(ultimo()).toMatchObject({ metodo: 'GET', caminho: '/api/despesas-partilhadas/d1' });
    await PartilhadoDB.alterarDespesa('d1', pedido);
    expect(ultimo()).toMatchObject({ metodo: 'PUT', caminho: '/api/despesas-partilhadas/d1', corpo: pedido });
    await PartilhadoDB.removerDespesa('d1');
    expect(ultimo()).toMatchObject({ metodo: 'DELETE', caminho: '/api/despesas-partilhadas/d1' });
  });

  it('acertos, saldos, atividade e resumo', async () => {
    await PartilhadoDB.criarAcerto('g1', { deUid: 'a', paraUid: 'b', valor: 10 });
    expect(ultimo()).toEqual({ metodo: 'POST', caminho: '/api/grupos/g1/acertos', corpo: { deUid: 'a', paraUid: 'b', valor: 10 } });
    await PartilhadoDB.removerAcerto('x1');
    expect(ultimo()).toMatchObject({ metodo: 'DELETE', caminho: '/api/acertos/x1' });
    await PartilhadoDB.saldos('g1');
    expect(ultimo().caminho).toBe('/api/grupos/g1/saldos');
    await PartilhadoDB.atividade('g1', 20);
    expect(ultimo().caminho).toBe('/api/grupos/g1/atividade?limite=20');
    await PartilhadoDB.resumo();
    expect(ultimo().caminho).toBe('/api/partilhado/resumo');
    await PartilhadoDB.resumo('2026-10');
    expect(ultimo().caminho).toBe('/api/partilhado/resumo?mes=2026-10');
  });
});

describe('mealheiros', () => {
  it('criar, pôr e levantar dinheiro, histórico e contribuição mensal', async () => {
    await PoupancasPartilhadasDB.criar('g1', { nome: 'Férias', objetivo: 1000 });
    expect(ultimo()).toEqual({ metodo: 'POST', caminho: '/api/grupos/g1/poupancas-partilhadas', corpo: { nome: 'Férias', objetivo: 1000 } });
    await PoupancasPartilhadasDB.listarDoGrupo('g1');
    expect(ultimo().caminho).toBe('/api/grupos/g1/poupancas-partilhadas');
    await PoupancasPartilhadasDB.contribuir('p1', 25);
    expect(ultimo()).toEqual({ metodo: 'POST', caminho: '/api/poupancas-partilhadas/p1/contribuir', corpo: { valor: 25 } });
    await PoupancasPartilhadasDB.levantar('p1', 5);
    expect(ultimo()).toEqual({ metodo: 'POST', caminho: '/api/poupancas-partilhadas/p1/levantar', corpo: { valor: 5 } });
    await PoupancasPartilhadasDB.movimentos('p1');
    expect(ultimo().caminho).toBe('/api/poupancas-partilhadas/p1/movimentos');

    const mensal = { valor: 30, tipo: 'automatica' as const, diaDoSalario: false, diaFixo: 10 };
    await PoupancasPartilhadasDB.guardarMinhaContribuicao('p1', mensal);
    expect(ultimo()).toEqual({ metodo: 'PUT', caminho: '/api/poupancas-partilhadas/p1/contribuicoes/minha', corpo: mensal });
    await PoupancasPartilhadasDB.removerMinhaContribuicao('p1');
    expect(ultimo()).toMatchObject({ metodo: 'DELETE', caminho: '/api/poupancas-partilhadas/p1/contribuicoes/minha' });
    await PoupancasPartilhadasDB.contribuicoes('p1');
    expect(ultimo().caminho).toBe('/api/poupancas-partilhadas/p1/contribuicoes');
    await PoupancasPartilhadasDB.minhasContribuicoes();
    expect(ultimo().caminho).toBe('/api/poupancas-partilhadas/contribuicoes/minhas');
  });
});
