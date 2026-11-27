// O histórico de alterações com as entidades dos grupos: frases, detalhes, quem fez, filtros e pedidos.
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));

import { GruposDB } from '../services/grupos';
import {
  AlteracoesDB,
  carregarContextoNomes,
  ContextoNomes,
  descricaoLegivel,
  FILTROS_ALTERACOES,
  fraseAlteracao,
  linhasDetalhe,
  nomeDoUtilizador,
  ordenarRegistos,
  precisaDeNomes,
  RegistoAlteracao,
} from '../services/alteracoes';
import { en } from '../i18n/textos';
import { definirIdioma } from '../i18n';
import { ApiFalsa, instalarApiFalsa } from '../test-utils/apiFalsa';

const ctx: ContextoNomes = {
  meuId: 'eu',
  utilizadores: new Map([
    ['ana', { nome: 'Ana Silva', email: 'ana@exemplo.pt' }],
    ['rui', { nome: 'rui@exemplo.pt', email: 'rui@exemplo.pt' }],
    ['sem-nome', { email: 'x@exemplo.pt' }],
  ]),
  grupos: new Map([['g1', 'Casa']]),
};

const registo = (extra: Partial<RegistoAlteracao>): RegistoAlteracao => ({
  id: 'a',
  entidade: 'Grupo',
  entidadeId: 'x',
  acao: 'criada',
  quando: '2026-10-05T10:00:00Z',
  origem: 'POST /api/grupos',
  ...extra,
});

describe('quem é quem', () => {
  it('"Tu", nome e email do membro, só o email, e "Utilizador removido" para ids anónimos', () => {
    expect(nomeDoUtilizador('eu', ctx)).toBe('Tu');
    expect(nomeDoUtilizador('ana', ctx)).toBe('Ana Silva (ana@exemplo.pt)');
    expect(nomeDoUtilizador('rui', ctx)).toBe('rui@exemplo.pt');
    expect(nomeDoUtilizador('sem-nome', ctx)).toBe('x@exemplo.pt');
    expect(nomeDoUtilizador('removido-3f2a9c', ctx)).toBe('Utilizador removido');
    expect(nomeDoUtilizador('removido-3f2a9c')).toBe('Utilizador removido'); // mesmo sem contexto
    expect(nomeDoUtilizador('desconhecido', ctx)).toBe('Outro utilizador');
  });
});

describe('frases das novas entidades', () => {
  const frase = (r: Partial<RegistoAlteracao>) => fraseAlteracao(registo(r), ctx);

  it('grupos, despesas partilhadas, mealheiros e movimentos têm nome e artigo certos', () => {
    expect(frase({ entidade: 'Grupo', descricao: 'Casa' })).toBe('Criaste o grupo Casa');
    expect(frase({ entidade: 'DespesaPartilhada', descricao: 'Jantar', acao: 'alterada' })).toBe('Alteraste a despesa partilhada Jantar');
    expect(frase({ entidade: 'PoupancaPartilhada', descricao: 'Férias', acao: 'apagada' })).toBe('Apagaste a poupança partilhada Férias');
    expect(frase({ entidade: 'RegraCategoria', descricao: 'Lidl' })).toBe('Criaste a regra de categorização Lidl');
  });

  it('a participação num grupo mostra o nome do grupo (e não o id técnico)', () => {
    expect(frase({ entidade: 'GrupoMembro', descricao: 'Admin g1' })).toBe('Criaste a participação num grupo Casa');
    expect(frase({ entidade: 'GrupoMembro', descricao: 'Membro g-desconhecido' })).toBe('Criaste a participação num grupo');
  });

  it('o acerto mostra quem pagou a quem, com "Tu" e "Utilizador removido"', () => {
    expect(frase({ entidade: 'AcertoPartilhado', descricao: 'ana -> eu' })).toBe('Criaste o acerto Ana Silva (ana@exemplo.pt) → Tu');
    expect(frase({ entidade: 'AcertoPartilhado', descricao: 'eu -> removido-abc' })).toBe('Criaste o acerto Tu → Utilizador removido');
  });

  it('o movimento mostra o valor; a contribuição esconde o id da poupança', () => {
    expect(frase({ entidade: 'MovimentoPoupancaPartilhada', descricao: '30.5' })).toBe('Criaste o movimento da poupança partilhada 30,50 €');
    expect(frase({ entidade: 'PoupancaPartilhadaMembro', descricao: 'a1b2c3d4e5f60718a1b2c3d4e5f60718' })).toBe(
      'Criaste a contribuição na poupança partilhada'
    );
  });

  it('um id técnico no título nunca aparece; um título normal aparece', () => {
    expect(descricaoLegivel({ entidade: 'Orcamento', descricao: '3f2a9c1b-0d4e-4c11-9a77-0123456789ab' })).toBeUndefined();
    expect(descricaoLegivel({ entidade: 'Orcamento', descricao: 'Lazer' })).toBe('Lazer');
  });

  it('as feitas pela app sozinha dizem "automaticamente"', () => {
    expect(frase({ entidade: 'MovimentoPoupancaPartilhada', descricao: '10', origem: 'sistema' })).toBe(
      'Criado automaticamente: movimento da poupança partilhada 10,00 €'
    );
  });

  it('em inglês os nomes novos estão traduzidos', async () => {
    await definirIdioma('en');
    try {
      expect(frase({ entidade: 'DespesaPartilhada', descricao: 'Dinner' })).toBe('You created shared expense Dinner');
      expect(nomeDoUtilizador('removido-1')).toBe('Removed user');
    } finally {
      await definirIdioma('pt');
    }
    for (const chave of ['grupo', 'participação num grupo', 'acerto', 'movimento da poupança partilhada', 'Quem', 'Pago por', 'Papel']) {
      expect(en[chave]).toBeTruthy();
    }
  });
});

describe('detalhes com pessoas', () => {
  it('os campos de utilizador viram nomes; o papel e as datas ficam legíveis', () => {
    const linhas = linhasDetalhe(
      registo({
        entidade: 'DespesaPartilhada',
        alteracoes: {
          Titulo: { para: 'Jantar' },
          Valor: { para: 60 },
          PagadorUid: { para: 'ana' },
          Role: { para: 'Admin' },
          SaidaEm: { para: '2026-10-05T10:00:00+00:00' },
          GrupoId: { para: 'g1' }, // técnico: não aparece
        },
      }),
      ctx
    );
    expect(linhas).toEqual([
      'Título: Jantar',
      'Valor: 60,00',
      'Pago por: Ana Silva (ana@exemplo.pt)',
      'Papel: administrador',
      'Saída em: 05/10/2026',
    ]);
  });

  it('alterado: "de → para" com nomes; apagado: o que havia; removido aparece como tal', () => {
    expect(linhasDetalhe(registo({ acao: 'alterada', alteracoes: { MembroUid: { de: 'ana', para: 'removido-9' } } }), ctx)).toEqual([
      'Membro: Ana Silva (ana@exemplo.pt) → Utilizador removido',
    ]);
    expect(linhasDetalhe(registo({ acao: 'apagada', alteracoes: { DeUid: { de: 'eu' }, ParaUid: { de: 'removido-1' } } }), ctx)).toEqual([
      'De: Tu',
      'Para: Utilizador removido',
    ]);
  });

  it('só os registos de grupos precisam de ir buscar os nomes dos membros', () => {
    expect(precisaDeNomes(registo({ entidade: 'DespesaExtra', alteracoes: { Valor: { para: 1 } } }))).toBe(false);
    expect(precisaDeNomes(registo({ entidade: 'GrupoMembro' }))).toBe(true);
    expect(precisaDeNomes(registo({ entidade: 'DespesaPartilhada', alteracoes: { PagadorUid: { para: 'ana' } } }))).toBe(true);
  });
});

describe('pedidos e filtros', () => {
  let api: ApiFalsa;
  beforeEach(() => {
    api = instalarApiFalsa();
  });

  const pagina = (itens: RegistoAlteracao[], total = itens.length) => ({ total, pagina: 1, tamanho: 20, itens });
  const filtro = (chave: string) => FILTROS_ALTERACOES.find((f) => f.chave === chave)!;

  it('há um filtro para cada área, incluindo grupos, despesas partilhadas e poupança partilhada', () => {
    expect(FILTROS_ALTERACOES.map((f) => f.chave)).toEqual(['tudo', 'gastos', 'compromissos', 'planeamento', 'grupos', 'partilhadas', 'mealheiros']);
    const entidades = FILTROS_ALTERACOES.flatMap((f) => f.entidades);
    for (const e of ['Grupo', 'GrupoMembro', 'DespesaPartilhada', 'AcertoPartilhado', 'PoupancaPartilhada', 'PoupancaPartilhadaMembro', 'MovimentoPoupancaPartilhada']) {
      expect(entidades).toContain(e);
    }
  });

  it('"Tudo" pede sem tipo; um filtro com um só tipo usa o parâmetro entidade', async () => {
    api.responder('GET', '/api/alteracoes?pagina=1&tamanho=30', pagina([]));
    await AlteracoesDB.listarFiltrado(filtro('tudo'));
    api.responder('GET', '/api/alteracoes?pagina=2&tamanho=30&entidade=Grupo', pagina([]));
    await AlteracoesDB.listarFiltrado({ chave: 'x', rotulo: 'x', entidades: ['Grupo'] }, 2);
    expect(api.pedidos.map((p) => p.caminho)).toEqual(['/api/alteracoes?pagina=1&tamanho=30', '/api/alteracoes?pagina=2&tamanho=30&entidade=Grupo']);
  });

  it('um filtro com vários tipos faz um pedido por tipo e junta por data, somando os totais', async () => {
    api.responder('GET', '/api/alteracoes?pagina=1&tamanho=20&entidade=DespesaPartilhada', pagina([registo({ id: 'd1', quando: '2026-10-03T10:00:00Z' })], 5));
    api.responder('GET', '/api/alteracoes?pagina=1&tamanho=20&entidade=AcertoPartilhado', pagina([registo({ id: 'a1', quando: '2026-10-04T10:00:00Z' })], 2));
    const resultado = await AlteracoesDB.listarFiltrado(filtro('partilhadas'));
    expect(resultado.itens.map((r) => r.id)).toEqual(['a1', 'd1']); // o mais recente primeiro
    expect(resultado.total).toBe(7);
  });

  it('juntar páginas ordena por data e não repete registos', () => {
    const lista = ordenarRegistos([
      registo({ id: 'b', quando: '2026-10-02T00:00:00Z' }),
      registo({ id: 'a', quando: '2026-10-03T00:00:00Z' }),
      registo({ id: 'b', quando: '2026-10-02T00:00:00Z' }),
    ]);
    expect(lista.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('os nomes vêm dos membros de todos os grupos (e uma falha não parte nada)', async () => {
    (GruposDB.listar as jest.Mock).mockResolvedValueOnce([
      { id: 'g1', nome: 'Casa' },
      { id: 'g2', nome: 'Férias' },
    ]);
    (GruposDB.listarMembros as jest.Mock)
      .mockResolvedValueOnce([{ uid: 'ana', nome: 'Ana', email: 'ana@exemplo.pt' }])
      .mockRejectedValueOnce(new Error('sem rede'));
    const contexto = await carregarContextoNomes('eu');
    expect(contexto.grupos?.get('g2')).toBe('Férias');
    expect(nomeDoUtilizador('ana', contexto)).toBe('Ana (ana@exemplo.pt)');
    expect(nomeDoUtilizador('eu', contexto)).toBe('Tu');

    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (GruposDB.listar as jest.Mock).mockRejectedValueOnce(new Error('x'));
    expect((await carregarContextoNomes('eu')).utilizadores?.size).toBe(0);
  });
});
