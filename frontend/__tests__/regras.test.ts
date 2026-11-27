// Regras de categorização: os pedidos à API (rotas e corpos), os pequenos cálculos do ecrã e o texto
// "Regra: <texto>" quando a sugestão vem de uma regra. Quem aplica as regras é a API (backend/tests).
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));

import { ErroApi } from '../services/api';
import {
  jaExiste,
  lerPrioridade,
  mensagemDeRegra,
  ordenarRegras,
  RegraCategoria,
  RegrasDB,
  textoDaRegra,
  textoOrigemSugestao,
} from '../services/regras';
import { DespesasExtrasDB } from '../services/database';
import { importarFolhaMes } from '../services/folhaMes';
import type { DadosFolhaMes } from '../services/tipos';
import { ApiFalsa, instalarApiFalsa } from '../test-utils/apiFalsa';

let api: ApiFalsa;
beforeEach(() => {
  api = instalarApiFalsa();
});

const regra = (extra: Partial<RegraCategoria> = {}): RegraCategoria => ({
  id: 'r1',
  texto: 'Continente',
  categoria: 'supermercado',
  ativa: true,
  prioridade: 0,
  ...extra,
});

describe('RegrasDB', () => {
  it('lista as regras do utilizador e as padrão', async () => {
    api.responder('GET', '/api/regras-categoria', [regra()]);
    api.responder('GET', '/api/regras-categoria/padrao', [{ texto: 'Lidl', categoria: 'supermercado' }]);
    expect(await RegrasDB.listar()).toEqual([regra()]);
    expect(await RegrasDB.padrao()).toEqual([{ texto: 'Lidl', categoria: 'supermercado' }]);
  });

  it('cria (POST), altera (PUT) e apaga (DELETE) com os corpos da API', async () => {
    api.responder('POST', '/api/regras-categoria', { id: 'nova' }, 201);
    api.responder('PUT', '/api/regras-categoria/r%201');
    api.responder('DELETE', '/api/regras-categoria/r%201');

    expect(await RegrasDB.criar({ texto: 'Pingo Doce', categoria: 'supermercado', ativa: true, prioridade: 5 })).toEqual({ id: 'nova' });
    expect(api.feitos('POST', '/api/regras-categoria')[0].corpo).toEqual({ texto: 'Pingo Doce', categoria: 'supermercado', ativa: true, prioridade: 5 });

    await RegrasDB.alterar('r 1', { texto: 'Pingo Doce', categoria: 'restauracao', ativa: false, prioridade: -1 });
    expect(api.feitos('PUT', '/api/regras-categoria/r%201')[0].corpo).toEqual({
      texto: 'Pingo Doce',
      categoria: 'restauracao',
      ativa: false,
      prioridade: -1,
    });

    await RegrasDB.remover('r 1');
    expect(api.feitos('DELETE', '/api/regras-categoria/r%201')).toHaveLength(1);
  });

  it('um texto repetido dá 409 e a mensagem diz que já existe', async () => {
    api.responder('POST', '/api/regras-categoria', { status: 409, title: 'Conflito' }, 409);
    const erro = await RegrasDB.criar({ texto: 'Lidl', categoria: 'supermercado' }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(mensagemDeRegra(erro)).toBe('Já tens uma regra com este texto.');
    expect(mensagemDeRegra(new Error('x'))).toBe('Não foi possível guardar a regra.');
  });

  it('sugerir pergunta à API com a descrição sem espaços a mais e codificada', async () => {
    api.responder('GET', '/api/regras-categoria/sugerir?descricao=Pingo%20Doce%20%26%20Cia', {
      categoria: 'supermercado',
      origem: 'regra',
      regra: { texto: 'Pingo Doce' },
    });
    const sugestao = await RegrasDB.sugerir('  Pingo Doce & Cia ');
    expect(sugestao.categoria).toBe('supermercado');
    expect(textoOrigemSugestao(sugestao)).toBe('Regra: Pingo Doce');
  });
});

describe('texto da origem da sugestão', () => {
  it('"Regra: <texto>" só quando veio de uma regra (do utilizador ou padrão)', () => {
    expect(textoOrigemSugestao({ origem: 'regra', regra: 'Continente' })).toBe('Regra: Continente');
    expect(textoOrigemSugestao({ origem: 'regra-padrao', regra: { texto: 'Lidl' } })).toBe('Regra: Lidl');
    expect(textoOrigemSugestao({ origem: 'historico' })).toBeUndefined();
    expect(textoOrigemSugestao({ origem: 'palavra-chave', regra: 'x' })).toBeUndefined();
    expect(textoOrigemSugestao({ origem: 'regra' })).toBeUndefined();
    expect(textoOrigemSugestao(null)).toBeUndefined();
    expect(textoDaRegra('  ')).toBeUndefined();
  });

  it('o sugerir-categoria dos gastos devolve a origem e a regra tal como a API as manda', async () => {
    api.responder('GET', '/api/despesas-extras/sugerir-categoria?titulo=Lidl', { categoria: 'supermercado', origem: 'regra-padrao', regra: 'Lidl' });
    const sugestao = await DespesasExtrasDB.sugerirCategoria('u', 'Lidl');
    expect(textoOrigemSugestao(sugestao)).toBe('Regra: Lidl');
  });
});

describe('ajudas do ecrã', () => {
  it('ordena: ativas primeiro, prioridade maior primeiro, depois pelo texto', () => {
    const ordenadas = ordenarRegras([
      regra({ id: 'a', texto: 'Zara', prioridade: 0 }),
      regra({ id: 'b', texto: 'Lidl', prioridade: 5 }),
      regra({ id: 'c', texto: 'Aldi', prioridade: 5, ativa: false }),
      regra({ id: 'd', texto: 'Bolt', prioridade: 0 }),
    ]);
    expect(ordenadas.map((r) => r.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('lê a prioridade: vazio = 0, inteiros de -1000 a 1000, o resto é inválido', () => {
    expect(lerPrioridade('')).toBe(0);
    expect(lerPrioridade(' 7 ')).toBe(7);
    expect(lerPrioridade('-1000')).toBe(-1000);
    expect(lerPrioridade('1000')).toBe(1000);
    expect(lerPrioridade('1001')).toBeNull();
    expect(lerPrioridade('2,5')).toBeNull();
    expect(lerPrioridade('abc')).toBeNull();
  });

  it('um texto já usado conta sem maiúsculas nem acentos (e ignora a própria regra ao editar)', () => {
    const regras = [regra({ id: 'r1', texto: 'Café' })];
    expect(jaExiste(regras, ' cafe ')).toBe(true);
    expect(jaExiste(regras, 'cafe', 'r1')).toBe(false);
    expect(jaExiste(regras, 'chá')).toBe(false);
  });
});

describe('importar do Excel não sobrepõe as regras', () => {
  it('as linhas de gastos vão para a API sem categoria: quem escolhe é o servidor (regras)', async () => {
    const dados: DadosFolhaMes = {
      mes: '2026-03',
      lucro: [],
      despesas: [],
      poupanca: [],
      despesasMes: [
        { titulo: 'Continente', valor: 40, data: '2026-03-02' },
        { titulo: 'Lidl', valor: 12.5 },
      ],
      anual: [],
      falta: [],
      saldoPoupanca: [],
      totalAPagar: [],
    };
    api.responder('POST', '/api/folha/2026-03/importar', { mes: '2026-03' });
    await importarFolhaMes('u', dados);

    const { corpo } = api.feitos('POST', '/api/folha/2026-03/importar')[0];
    for (const linha of corpo.dados.despesasMes) expect(linha).not.toHaveProperty('categoria');
    expect(JSON.stringify(corpo)).not.toContain('categoria');
  });
});
