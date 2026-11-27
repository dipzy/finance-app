// Categorias (nome, ícone e cor), textos e avisos dos orçamentos e dos objetivos: funções puras
import { acentosCategorias, cores } from '../constants/tema';
import type { EstadoOrcamentoMes, ObjetivoPoupanca } from '../services/tipos';
import { CATEGORIAS, categoriaDe, eCategoria, infoCategoria, nomeCategoria } from '../utils/categorias';
import { validarEdicaoExtra } from '../utils/ecrasDespesas';
import {
  alertaOrcamento,
  euros,
  objetivoPrincipal,
  orcamentosEmAlerta,
  ritmoObjetivo,
  ritmoOrcamento,
  textoEstadoObjetivo,
  textoObjetivo,
  textoRestante,
} from '../utils/orcamentos';

const orcamento = (campos: Partial<EstadoOrcamentoMes> = {}): EstadoOrcamentoMes => ({
  id: 'o',
  categoria: 'restauracao',
  mes: '2026-10',
  limite: 200,
  gasto: 164,
  restante: 36,
  percentagem: 82,
  estado: 'perto',
  ...campos,
});

describe('categorias', () => {
  it('as 14 categorias da API, pela mesma ordem, com outros no fim e uma cor e um ícone cada', () => {
    expect(CATEGORIAS.map((c) => c.chave)).toEqual([
      'supermercado',
      'restauracao',
      'transportes',
      'carro',
      'combustivel',
      'casa',
      'telecomunicacoes',
      'saude',
      'lazer',
      'compras',
      'educacao',
      'viagens',
      'presentes',
      'outros',
    ]);
    expect(Object.keys(acentosCategorias).sort()).toEqual(CATEGORIAS.map((c) => c.chave).sort());
    expect(new Set(CATEGORIAS.map((c) => c.cor)).size).toBe(14);
    expect(new Set(CATEGORIAS.map((c) => c.icone)).size).toBe(14);
  });

  it('sem categoria (despesas antigas) ou desconhecida conta como Outros', () => {
    expect(categoriaDe(undefined)).toBe('outros');
    expect(categoriaDe(null)).toBe('outros');
    expect(categoriaDe('comida')).toBe('outros');
    expect(categoriaDe('saude')).toBe('saude');
    expect(eCategoria('lazer')).toBe(true);
    expect(eCategoria(3)).toBe(false);
    expect(nomeCategoria('restauracao')).toBe('Restauração');
    expect(nomeCategoria('telecomunicacoes')).toBe('Telecomunicações');
    expect(nomeCategoria('carro')).toBe('Carro');
    expect(infoCategoria(undefined)).toMatchObject({ chave: 'outros', nome: 'Outros', icone: 'pricetag-outline' });
  });

  it('editar uma extra: a categoria só conta como mudança se for diferente (antigas = outros)', () => {
    const hoje = new Date(2026, 9, 5);
    const antiga = { id: 'a', titulo: 'Jantar', valor: 10, data: '2026-10-01' };
    const form = { titulo: 'Jantar', valor: '10', data: '01/10/2026' };
    expect(validarEdicaoExtra(antiga, { ...form, categoria: 'outros' }, hoje)).toEqual({ campos: {} });
    expect(validarEdicaoExtra(antiga, { ...form, categoria: 'restauracao' }, hoje)).toEqual({ campos: { categoria: 'restauracao' } });
    expect(validarEdicaoExtra({ ...antiga, categoria: 'lazer' }, { ...form, categoria: 'lazer' }, hoje)).toEqual({ campos: {} });
    expect(validarEdicaoExtra({ ...antiga, categoria: 'lazer' }, form, hoje)).toEqual({ campos: {} });
  });

  it('editar uma extra: mudar o meio de pagamento (as antigas são da conta)', () => {
    const hoje = new Date(2026, 9, 5);
    const antiga = { id: 'a', titulo: 'Almoço', valor: 8, data: '2026-10-01' };
    const form = { titulo: 'Almoço', valor: '8', data: '01/10/2026' };
    expect(validarEdicaoExtra(antiga, { ...form, meioPagamento: 'conta' }, hoje)).toEqual({ campos: {} });
    expect(validarEdicaoExtra(antiga, { ...form, meioPagamento: 'cartaoAlimentacao' }, hoje)).toEqual({
      campos: { meioPagamento: 'cartaoAlimentacao' },
    });
    expect(
      validarEdicaoExtra({ ...antiga, meioPagamento: 'cartaoAlimentacao' }, { ...form, meioPagamento: 'conta' }, hoje)
    ).toEqual({ campos: { meioPagamento: 'conta' } });
  });
});

describe('orçamentos', () => {
  it('o aviso depois de registar uma despesa', () => {
    expect(alertaOrcamento(orcamento())).toEqual({
      titulo: 'Orçamento quase no limite',
      mensagem: 'Já gastaste 82% do orçamento de Restauração (164 € de 200 €).',
    });
    expect(alertaOrcamento(orcamento({ gasto: 210.5, percentagem: 105.3, estado: 'ultrapassado', restante: 0 }))).toEqual({
      titulo: 'Orçamento ultrapassado',
      mensagem: 'Já gastaste 105% do orçamento de Restauração (210.50 € de 200 €).',
    });
    expect(alertaOrcamento(orcamento({ estado: 'ok', percentagem: 10 }))).toBeNull();
    expect(alertaOrcamento(undefined)).toBeNull(); // a categoria não tem orçamento
  });

  it('o que resta, e os que merecem aviso (ultrapassados primeiro)', () => {
    expect(textoRestante(orcamento())).toBe('Ainda podes gastar 36 €');
    expect(textoRestante(orcamento({ gasto: 210, restante: 0 }))).toBe('Passaste 10 €');
    expect(textoRestante(orcamento({ gasto: 200, restante: 0 }))).toBe('Chegaste ao limite');

    const lista = [
      orcamento({ id: 'a', percentagem: 85 }),
      orcamento({ id: 'b', estado: 'ok', percentagem: 20 }),
      orcamento({ id: 'c', estado: 'ultrapassado', percentagem: 101 }),
      orcamento({ id: 'd', percentagem: 95 }),
    ];
    expect(orcamentosEmAlerta(lista).map((o) => o.id)).toEqual(['c', 'd', 'a']);
    expect(euros(12)).toBe('12 €');
    expect(euros(0.1 + 0.2)).toBe('0.30 €');
  });
});

describe('objetivos', () => {
  const objetivo = (campos: Partial<ObjetivoPoupanca> = {}): ObjetivoPoupanca => ({
    id: 'x',
    nome: 'Férias',
    valorAlvo: 600,
    mesAlvo: '2027-03',
    mesInicio: '2026-10',
    valorAtual: 50,
    percentagem: 8.3,
    emFalta: 550,
    mesesRestantes: 6,
    valorPorMes: 91.67,
    estado: 'no-bom-caminho',
    ...campos,
  });

  it('o texto de cada objetivo', () => {
    expect(textoObjetivo(objetivo())).toBe('faltam 550 € · 91.67 €/mês até Março 2027');
    expect(textoObjetivo(objetivo({ mesesRestantes: 0, estado: 'atrasado', mesAlvo: '2026-09' }))).toBe(
      'faltam 550 € · o prazo (Setembro 2026) já passou'
    );
    expect(textoObjetivo(objetivo({ estado: 'atingido', emFalta: 0 }))).toBe('Objetivo atingido (era até Março 2027)');
    expect(textoEstadoObjetivo('no-bom-caminho')).toBe('No bom caminho');
  });

  it('o principal é o primeiro por atingir', () => {
    expect(objetivoPrincipal([objetivo({ id: 'a', estado: 'atingido' }), objetivo({ id: 'b' })])?.id).toBe('b');
    expect(objetivoPrincipal([objetivo({ estado: 'atingido' })])).toBeNull();
    expect(objetivoPrincipal([])).toBeNull();
  });
});

describe('ritmo dos orçamentos e dos objetivos', () => {
  it('orçamento: onde se chega no fim do mês ao ritmo de agora', () => {
    const ritmo = ritmoOrcamento(orcamento({ estado: 'ok', gasto: 140, limite: 200, previsto: 289.33 }));
    expect(ritmo?.texto).toBe('Ao ritmo atual chegas a 289.33 € no fim do mês (89.33 € acima do limite)');
    expect(ritmo?.cor).toBe(cores.aviso);

    const dentro = ritmoOrcamento(orcamento({ estado: 'perto', gasto: 164, limite: 200, previsto: 200 }));
    expect(dentro?.texto).toBe('Ao ritmo atual ficas nos 200 € no fim do mês');
    expect(dentro?.cor).toBe(cores.textoSecundario);
  });

  it('orçamento: sem previsão (outro mês), sem gasto ou já ultrapassado não há ritmo', () => {
    expect(ritmoOrcamento(orcamento({ previsto: undefined }))).toBeNull();
    expect(ritmoOrcamento(orcamento({ previsto: null }))).toBeNull();
    expect(ritmoOrcamento(orcamento({ gasto: 0, previsto: 0, estado: 'ok' }))).toBeNull();
    expect(ritmoOrcamento(orcamento({ estado: 'ultrapassado', gasto: 250, previsto: 500 }))).toBeNull();
  });

  const objetivo = (campos: Partial<ObjetivoPoupanca> = {}): ObjetivoPoupanca => ({
    id: 'x',
    nome: 'Carro novo',
    valorAlvo: 1000,
    mesAlvo: '2026-12',
    mesInicio: '2026-10',
    poupancaId: 'p',
    valorAtual: 300,
    percentagem: 30,
    emFalta: 700,
    mesesRestantes: 3,
    valorPorMes: 233.34,
    estado: 'no-bom-caminho',
    contribuicaoMensal: 100,
    diferenca: -133.34,
    mesPrevisto: '2027-04',
    ...campos,
  });

  it('objetivo abaixo do ritmo: diz quanto falta por mês e quando se chega lá', () => {
    const ritmo = ritmoObjetivo(objetivo());
    expect(ritmo?.texto).toBe('Poupas 100 €/mês, faltam 133.34 €/mês: ao ritmo atual chegas em Abril 2027');
    expect(ritmo?.cor).toBe(cores.aviso);
  });

  it('objetivo acima do ritmo ou no ritmo certo', () => {
    const acima = ritmoObjetivo(objetivo({ contribuicaoMensal: 300, diferenca: 66.66, mesPrevisto: '2026-12' }));
    expect(acima?.texto).toBe('Poupas 300 €/mês, mais 66.66 € do que o necessário: chegas em Dezembro 2026');
    expect(acima?.cor).toBe(cores.positivo);
    expect(ritmoObjetivo(objetivo({ contribuicaoMensal: 233.34, diferenca: 0, mesPrevisto: '2026-12' }))?.texto).toBe(
      'Poupas 233.34 €/mês, o necessário: chegas em Dezembro 2026'
    );
  });

  it('objetivo com a poupança parada ou a demorar uma eternidade', () => {
    expect(ritmoObjetivo(objetivo({ contribuicaoMensal: 0, diferenca: -233.34, mesPrevisto: null }))?.texto).toBe(
      'A poupança ligada não recebe nada por mês: para lá chegares precisas de 233.34 €/mês'
    );
    expect(ritmoObjetivo(objetivo({ mesPrevisto: null }))?.texto).toBe('Poupas 100 €/mês: ao ritmo atual demoras mais de 50 anos');
  });

  it('objetivo com o prazo já passado só diz quando se chega lá', () => {
    expect(ritmoObjetivo(objetivo({ mesesRestantes: 0, estado: 'atrasado', mesAlvo: '2026-09' }))?.texto).toBe(
      'Poupas 100 €/mês: ao ritmo atual chegas em Abril 2027'
    );
  });

  it('sem poupança ligada ou já atingido não há ritmo', () => {
    expect(ritmoObjetivo(objetivo({ contribuicaoMensal: null, diferenca: null, mesPrevisto: null }))).toBeNull();
    expect(ritmoObjetivo(objetivo({ contribuicaoMensal: undefined }))).toBeNull();
    expect(ritmoObjetivo(objetivo({ estado: 'atingido', emFalta: 0 }))).toBeNull();
  });
});
