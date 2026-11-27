// A camada de dados da app (services/database.ts e services/folhaMes.ts) fala com a API: aqui
// verifica-se que cada função faz o pedido certo (método, caminho, corpo) e entrega o resultado
// no formato de sempre. As regras de negócio são testadas na API (backend/tests).
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));

import {
  calcularDespesasFixasSeparadas,
  calcularSaldoDisponivel,
  calcularSaldoPrevisto,
  ContaCorrenteDB,
  DespesasExtrasDB,
  DespesasFixasDB,
  DividasDB,
  EstatisticasDB,
  ObjetivosDB,
  OrcamentosDB,
  PagamentosDB,
  PoupancasDB,
  SalarioDB,
} from '../services/database';
import { importarFolhaMes, mesesComDados, normalizarTitulo, obterDadosFolhaMes } from '../services/folhaMes';
import type { DadosFolhaMes } from '../services/tipos';
import { ApiFalsa, instalarApiFalsa } from '../test-utils/apiFalsa';

const UID = 'utilizador-1';
let api: ApiFalsa;

beforeEach(() => {
  api = instalarApiFalsa();
});

describe('saldos', () => {
  it('Saldo Disponível e Previsto vêm da API (que antes processa salário e débitos)', async () => {
    api.responder('GET', '/api/conta/saldo', { saldo: 954.5 });
    api.responder('GET', '/api/conta/saldos', { disponivel: 954.5, previsto: 654.5, porPagar: 300 });
    expect(await calcularSaldoDisponivel(UID)).toBe(954.5);
    expect(await calcularSaldoPrevisto(UID)).toBe(654.5);
  });

  it('a conta: ler sem processar, acertar e movimentar', async () => {
    api.responder('GET', '/api/conta', { saldo: 100.005, ultimaAtualizacao: '2026-10-05T10:00:00Z' });
    api.responder('POST', '/api/conta/movimentos');
    api.responder('PUT', '/api/conta/saldo');

    expect(await ContaCorrenteDB.getSaldo(UID)).toBe(100.01);
    await ContaCorrenteDB.adicionar(UID, 500);
    await ContaCorrenteDB.subtrair(UID, 120);
    await ContaCorrenteDB.setSaldo(UID, 42);
    expect(api.feitos('POST', '/api/conta/movimentos').map((p) => p.corpo)).toEqual([{ valor: 500 }, { valor: -120 }]);
    expect(api.feitos('PUT', '/api/conta/saldo')[0].corpo).toEqual({ saldo: 42 });
    expect(api.pedidos[0].cabecalhos.Authorization).toBe('Bearer token-de-teste');
  });

  it('totais das despesas fixas do mês (por defeito, o atual da API)', async () => {
    api.responder('GET', '/api/despesas-fixas/totais', { debitadas: 0, porDebitar: 300, total: 300 });
    api.responder('GET', '/api/despesas-fixas/totais?mes=2026-04', { debitadas: 156.28, porDebitar: 0, total: 156.28 });
    expect(await calcularDespesasFixasSeparadas(UID)).toEqual({ debitadas: 0, porDebitar: 300, total: 300 });
    expect(await DespesasFixasDB.calcularTotal(UID, '2026-04')).toBe(156.28);
  });
});

describe('salário', () => {
  it('sem configuração (204) é null; guardar só envia o que o ecrã muda', async () => {
    api.responder('GET', '/api/salario');
    api.responder('PUT', '/api/salario');
    api.responder('POST', '/api/salario/receber');

    expect(await SalarioDB.getConfig(UID)).toBeNull();
    expect(await SalarioDB.processarRecebimento(UID)).toBeNull();
    await SalarioDB.saveConfig(UID, { valor: '1500', diaRecebimento: 25, cartaoAlimentacao: '150', lastReceived: '2026-09-25' });
    expect(api.feitos('PUT', '/api/salario')[0].corpo).toEqual({ valor: '1500', diaRecebimento: 25, cartaoAlimentacao: '150' });
  });
});

describe('despesas fixas', () => {
  it('criar devolve o id; debitar e anular devolvem o resultado', async () => {
    api.responder('POST', '/api/despesas-fixas', { id: 'abc' }, 201);
    api.responder('POST', '/api/despesas-fixas/abc/debitar', { resultado: 'ja-debitada' });
    api.responder('POST', '/api/despesas-fixas/abc/debitar?mes=2026-09', { resultado: 'debitada' });
    api.responder('POST', '/api/despesas-fixas/abc/anular', { anulado: true });

    expect(await DespesasFixasDB.add(UID, { titulo: 'Renda', valor: 300, diaDebito: 1 })).toBe('abc');
    expect(api.feitos('POST', '/api/despesas-fixas')[0].corpo).toEqual({ titulo: 'Renda', valor: 300, diaDebito: 1 });
    expect(await DespesasFixasDB.debitar(UID, 'abc')).toBe('ja-debitada');
    expect(await DespesasFixasDB.debitar(UID, 'abc', '2026-09')).toBe('debitada');
    expect(await DespesasFixasDB.anularDebito(UID, 'abc')).toBe(true);
  });

  it('editar: o dia de débito apagado no formulário vai em "limpar" (anual sem dia = pagar à mão)', async () => {
    api.responder('PATCH', '/api/despesas-fixas/abc');
    await DespesasFixasDB.update(UID, 'abc', { titulo: 'Seguro', valor: 715.2, mesAnual: 3, diaDebito: undefined, periodicidade: 'anual' });
    expect(api.feitos('PATCH', '/api/despesas-fixas/abc')[0].corpo).toEqual({
      titulo: 'Seguro',
      valor: 715.2,
      mesAnual: 3,
      periodicidade: 'anual',
      limpar: ['diaDebito'],
    });
  });

  it('terminar e remover (que passou a terminar)', async () => {
    api.responder('POST', '/api/despesas-fixas/abc/terminar');
    await DespesasFixasDB.terminar(UID, 'abc');
    await DespesasFixasDB.remove(UID, 'abc');
    expect(api.feitos('POST', '/api/despesas-fixas/abc/terminar')).toHaveLength(2);
  });

  it('pagamentos do mês, de uma despesa e históricos', async () => {
    const pagamento = { id: '2026-10_abc', fixaId: 'abc', mes: '2026-10', titulo: 'Renda', valor: 300, data: '2026-10-05', estado: 'pago' };
    api.responder('GET', '/api/pagamentos?mes=2026-10', [pagamento]);
    api.responder('GET', '/api/pagamentos?fixaId=abc', [pagamento]);
    api.responder('PUT', '/api/pagamentos/2026-04/abc');

    expect(await PagamentosDB.getDoMes(UID, '2026-10')).toEqual([pagamento]);
    expect(await PagamentosDB.getDaDespesa(UID, 'abc')).toEqual([pagamento]);
    await PagamentosDB.registarHistorico(UID, { id: 'abc', titulo: 'Dentista' }, '2026-04', 156.28);
    expect(api.feitos('PUT', '/api/pagamentos/2026-04/abc')[0].corpo).toEqual({ titulo: 'Dentista', valor: 156.28 });
  });
});

describe('gastos do dia a dia', () => {
  it('criar, editar só o que mudou e apagar (ids com caracteres especiais vão codificados)', async () => {
    api.responder('POST', '/api/despesas-extras', { id: 'x/1' }, 201);
    api.responder('PATCH', '/api/despesas-extras/x%2F1');
    api.responder('DELETE', '/api/despesas-extras/x%2F1');

    await DespesasExtrasDB.add(UID, { titulo: 'Jantar', valor: 45.5, data: '2026-10-05' });
    await DespesasExtrasDB.update(UID, 'x/1', { valor: 42.5 });
    await DespesasExtrasDB.remove(UID, 'x/1');
    expect(api.feitos('PATCH', '/api/despesas-extras/x%2F1')[0].corpo).toEqual({ valor: 42.5 });
    expect(api.feitos('DELETE', '/api/despesas-extras/x%2F1')).toHaveLength(1);
  });

  it('o total do mês é a soma ao cêntimo', async () => {
    api.responder('GET', '/api/despesas-extras?mes=2026-10', [
      { id: 'a', titulo: 'a', valor: 0.1 },
      { id: 'b', titulo: 'b', valor: 0.2 },
    ]);
    expect(await DespesasExtrasDB.calcularTotal(UID, '2026-10')).toBe(0.3);
  });

  it('as históricas vão para outro endpoint (não mexem na conta)', async () => {
    api.responder('POST', '/api/despesas-extras/historicas', { id: 'h' }, 201);
    await DespesasExtrasDB.addHistorica(UID, { titulo: 'Temu', valor: 21.44, data: '2026-04-01' });
    expect(api.feitos('POST', '/api/despesas-extras/historicas')[0].corpo).toEqual({ titulo: 'Temu', valor: 21.44, data: '2026-04-01' });
  });
});

describe('categorias, orçamentos, objetivos e estatísticas', () => {
  it('a categoria vai na despesa nova, na histórica e na edição; a sugestão vem da API', async () => {
    api.responder('POST', '/api/despesas-extras', { id: 'n' }, 201);
    api.responder('POST', '/api/despesas-extras/historicas', { id: 'h' }, 201);
    api.responder('PATCH', '/api/despesas-extras/n');
    api.responder('GET', '/api/despesas-extras/sugerir-categoria?titulo=Pingo%20Doce', { categoria: 'supermercado', origem: 'palavra-chave' });

    await DespesasExtrasDB.add(UID, { titulo: 'Jantar', valor: 20, data: '2026-10-05', categoria: 'restauracao' });
    await DespesasExtrasDB.addHistorica(UID, { titulo: 'Temu', valor: 5, data: '2026-04-01', categoria: 'compras' });
    await DespesasExtrasDB.update(UID, 'n', { categoria: 'lazer' });
    expect(api.feitos('POST', '/api/despesas-extras')[0].corpo).toEqual({ titulo: 'Jantar', valor: 20, data: '2026-10-05', categoria: 'restauracao' });
    expect(api.feitos('POST', '/api/despesas-extras/historicas')[0].corpo.categoria).toBe('compras');
    expect(api.feitos('PATCH', '/api/despesas-extras/n')[0].corpo).toEqual({ categoria: 'lazer' });
    expect(await DespesasExtrasDB.sugerirCategoria(UID, ' Pingo Doce ')).toEqual({ categoria: 'supermercado', origem: 'palavra-chave' });
  });

  it('orçamentos: listar, estado do mês, criar, mudar o limite e apagar', async () => {
    const estado = { id: 'o1', categoria: 'restauracao', mes: '2026-09', limite: 200, gasto: 164, restante: 36, percentagem: 82, estado: 'perto' };
    api.responder('GET', '/api/orcamentos', [{ id: 'o1', categoria: 'restauracao', limite: 200 }]);
    api.responder('GET', '/api/orcamentos/estado', [{ ...estado, mes: '2026-10' }]);
    api.responder('GET', '/api/orcamentos/estado?mes=2026-09', [estado]);
    api.responder('POST', '/api/orcamentos', { id: 'o2' }, 201);
    api.responder('PATCH', '/api/orcamentos/o1');
    api.responder('DELETE', '/api/orcamentos/o1');

    expect(await OrcamentosDB.getAll(UID)).toHaveLength(1);
    expect((await OrcamentosDB.getEstado(UID))[0].mes).toBe('2026-10');
    expect(await OrcamentosDB.getEstado(UID, '2026-09')).toEqual([estado]);
    expect(await OrcamentosDB.add(UID, { categoria: 'lazer', limite: 50 })).toBe('o2');
    await OrcamentosDB.update(UID, 'o1', { limite: 250, categoria: undefined });
    await OrcamentosDB.remove(UID, 'o1');
    expect(api.feitos('POST', '/api/orcamentos')[0].corpo).toEqual({ categoria: 'lazer', limite: 50 });
    expect(api.feitos('PATCH', '/api/orcamentos/o1')[0].corpo).toEqual({ limite: 250 });
    expect(api.feitos('DELETE', '/api/orcamentos/o1')).toHaveLength(1);
  });

  it('a categoria repetida (409) chega ao ecrã com a mensagem da API', async () => {
    api.responder('POST', '/api/orcamentos', { status: 409, title: 'Conflito', detail: 'Já existe um orçamento para Lazer: altera esse.' }, 409);
    await expect(OrcamentosDB.add(UID, { categoria: 'lazer', limite: 10 })).rejects.toThrow('Já existe um orçamento para Lazer: altera esse.');
  });

  it('objetivos: criar, desligar a poupança ("limpar") e apagar', async () => {
    api.responder('GET', '/api/objetivos', []);
    api.responder('GET', '/api/objetivos/ob1', { id: 'ob1', nome: 'Férias' });
    api.responder('POST', '/api/objetivos', { id: 'ob1' }, 201);
    api.responder('PATCH', '/api/objetivos/ob1');
    api.responder('DELETE', '/api/objetivos/ob1');

    expect(await ObjetivosDB.getAll(UID)).toEqual([]);
    expect(await ObjetivosDB.add(UID, { nome: 'Férias', valorAlvo: 600, mesAlvo: '2027-03', poupancaId: 'p1' })).toBe('ob1');
    expect((await ObjetivosDB.get(UID, 'ob1')).nome).toBe('Férias');
    await ObjetivosDB.update(UID, 'ob1', { nome: 'Férias no Algarve', poupancaId: undefined, valorAtual: 100 });
    await ObjetivosDB.remove(UID, 'ob1');
    expect(api.feitos('POST', '/api/objetivos')[0].corpo).toEqual({ nome: 'Férias', valorAlvo: 600, mesAlvo: '2027-03', poupancaId: 'p1' });
    expect(api.feitos('PATCH', '/api/objetivos/ob1')[0].corpo).toEqual({ nome: 'Férias no Algarve', valorAtual: 100, limpar: ['poupancaId'] });
  });

  it('estatísticas: gastos por categoria e evolução', async () => {
    api.responder('GET', '/api/estatisticas/categorias', { mes: '2026-10', total: 0, categorias: [] });
    api.responder('GET', '/api/estatisticas/categorias?mes=2026-09', { mes: '2026-09', total: 10, categorias: [] });
    api.responder('GET', '/api/estatisticas/evolucao?meses=12', [{ mes: '2026-10', entrou: 1, gasto: 2, poupado: 3, saldoFinal: null }]);
    api.responder('GET', '/api/estatisticas/evolucao?meses=3&ate=2026-06', []);

    expect((await EstatisticasDB.gastosPorCategoria(UID)).mes).toBe('2026-10');
    expect((await EstatisticasDB.gastosPorCategoria(UID, '2026-09')).total).toBe(10);
    expect((await EstatisticasDB.evolucao(UID))[0].saldoFinal).toBeNull();
    expect(await EstatisticasDB.evolucao(UID, 3, '2026-06')).toEqual([]);
  });

  it('análise: comparação com o mês anterior e previsão do fim do mês', async () => {
    const valor = { atual: 0, anterior: 0, diferenca: 0, variacao: null };
    const comparacao = (mes: string, mesAnterior: string, ateDia: number | null) => ({
      mes,
      mesAnterior,
      ateDia,
      gastosDiaADia: { atual: 56, anterior: 80, diferenca: -24, variacao: -30 },
      despesasFixas: valor,
      poupado: valor,
      entrou: valor,
      categorias: [{ categoria: 'lazer', atual: 12, anterior: 0, diferenca: 12, variacao: null }],
    });
    api.responder('GET', '/api/estatisticas/comparacao', comparacao('2026-10', '2026-09', 5));
    api.responder('GET', '/api/estatisticas/comparacao?mes=2026-09', comparacao('2026-09', '2026-08', null));
    api.responder('GET', '/api/estatisticas/previsao', {
      mes: '2026-10',
      saldoAtual: 1000,
      porPagarFixas: 300,
      estimativaGastos: 275,
      gastosRecorrentes: 15,
      previsaoFinal: 425,
      mediaDiaria: 10,
      diasRestantes: 26,
      base: '3 meses',
      mesesBase: 3,
    });

    const atual = await EstatisticasDB.comparacao(UID);
    expect(atual.ateDia).toBe(5);
    expect(atual.categorias[0].variacao).toBeNull();
    expect((await EstatisticasDB.comparacao(UID, '2026-09')).ateDia).toBeNull();
    const previsao = await EstatisticasDB.previsao(UID);
    expect(previsao.previsaoFinal).toBe(425);
    expect(previsao.base).toBe('3 meses');
    expect(api.pedidos.map((p) => p.caminho)).toEqual([
      '/api/estatisticas/comparacao',
      '/api/estatisticas/comparacao?mes=2026-09',
      '/api/estatisticas/previsao',
    ]);
  });
});

describe('cartão de alimentação', () => {
  it('ler e acertar o saldo do cartão; o meio de pagamento vai na despesa e na edição', async () => {
    api.responder('GET', '/api/conta/cartao-alimentacao', { saldo: 98.5, valorMensal: 160 });
    api.responder('PUT', '/api/conta/cartao-alimentacao');
    api.responder('POST', '/api/despesas-extras', { id: 'c1' }, 201);
    api.responder('PATCH', '/api/despesas-extras/c1');

    expect(await ContaCorrenteDB.getCartaoAlimentacao(UID)).toEqual({ saldo: 98.5, valorMensal: 160 });
    await ContaCorrenteDB.setSaldoCartaoAlimentacao(UID, 120);
    await DespesasExtrasDB.add(UID, { titulo: 'Almoço', valor: 8.5, data: '2026-10-05', meioPagamento: 'cartaoAlimentacao' });
    await DespesasExtrasDB.update(UID, 'c1', { meioPagamento: 'conta' });
    expect(api.feitos('PUT', '/api/conta/cartao-alimentacao')[0].corpo).toEqual({ saldo: 120 });
    expect(api.feitos('POST', '/api/despesas-extras')[0].corpo.meioPagamento).toBe('cartaoAlimentacao');
    expect(api.feitos('PATCH', '/api/despesas-extras/c1')[0].corpo).toEqual({ meioPagamento: 'conta' });
  });

  it('sem saldo no cartão, a mensagem da API (409) chega ao ecrã', async () => {
    const detail = 'O cartão de alimentação só tem 5.00 €: não chega para 8.50 €. Paga com a conta, ou acerta primeiro o saldo do cartão.';
    api.responder('POST', '/api/despesas-extras', { status: 409, title: 'Conflito', detail }, 409);
    await expect(DespesasExtrasDB.add(UID, { titulo: 'Almoço', valor: 8.5, meioPagamento: 'cartaoAlimentacao' })).rejects.toThrow(detail);
  });
});

describe('poupanças e dívidas', () => {
  it('movimentos das poupanças', async () => {
    api.responder('POST', '/api/poupancas', { id: 'p1' }, 201);
    api.responder('POST', '/api/poupancas/p1/transferir');
    api.responder('POST', '/api/poupancas/p1/contribuir', { resultado: 'adicionada' });
    api.responder('POST', '/api/poupancas/p1/ajustar');
    api.responder('PUT', '/api/poupancas/p1/saldo');

    expect(await PoupancasDB.add(UID, { nome: 'Revolut', tipo: 'valor', valor: '600', saldo: 0 })).toBe('p1');
    await PoupancasDB.transferirDaConta(UID, 'p1', 250);
    expect(await PoupancasDB.contribuirManualmente(UID, 'p1')).toBe('adicionada');
    await PoupancasDB.ajustarSaldo(UID, 'p1', -50);
    await PoupancasDB.definirSaldo(UID, 'p1', 3100.5);
    expect(api.feitos('POST', '/api/poupancas/p1/transferir')[0].corpo).toEqual({ valor: 250 });
    expect(api.feitos('POST', '/api/poupancas/p1/contribuir')[0].corpo).toBeUndefined();
    expect(api.feitos('POST', '/api/poupancas/p1/ajustar')[0].corpo).toEqual({ valor: -50 });
    expect(api.feitos('PUT', '/api/poupancas/p1/saldo')[0].corpo).toEqual({ saldo: 3100.5 });
  });

  it('contribuições manuais em atraso: lê a lista e regulariza o mês pedido', async () => {
    const emAtraso = [{ poupancaId: 'p1', nome: 'PPR', mes: '2026-09', valor: 50 }];
    api.responder('GET', '/api/poupancas/em-atraso', emAtraso);
    api.responder('POST', '/api/poupancas/p1/contribuir?mes=2026-09', { resultado: 'adicionada' });

    expect(await PoupancasDB.getEmAtraso(UID)).toEqual(emAtraso);
    expect(await PoupancasDB.contribuirManualmente(UID, 'p1', '2026-09')).toBe('adicionada');
    expect(api.feitos('POST', '/api/poupancas/p1/contribuir?mes=2026-09')).toHaveLength(1);
  });

  it('escolher "Nenhuma" prestação desliga a dívida da despesa', async () => {
    api.responder('PATCH', '/api/dividas/d1');
    api.responder('GET', '/api/dividas/estado', [{ id: 'd1', titulo: 'Carro', valorInicial: 7179, desde: '2026-10', emFalta: 7179, pago: 0, mesesEmFalta: null }]);

    await DividasDB.update(UID, 'd1', { titulo: 'Carro', valorInicial: 7000, desde: '2026-10', fixaId: undefined });
    expect(api.feitos('PATCH', '/api/dividas/d1')[0].corpo).toEqual({ titulo: 'Carro', valorInicial: 7000, desde: '2026-10', limpar: ['fixaId'] });
    expect((await DividasDB.getComEstado(UID))[0].mesesEmFalta).toBeNull();
  });
});

describe('histórico do mês', () => {
});

describe('folha do mês', () => {
  const marco: DadosFolhaMes = {
    mes: '2026-03',
    lucro: [{ titulo: 'Salário', valor: 1500 }],
    despesas: [{ titulo: 'Renda', valor: 600 }],
    poupanca: [],
    // Uma célula "31/02" do Excel daria uma data que não existe: vai sem data
    despesasMes: [{ titulo: 'Cinema', valor: 12, data: '2026-03-14' }, { titulo: 'Prenda', valor: 25, data: '2026-02-31' }],
    anual: [],
    saldoConta: 950.4,
    falta: [],
    saldoPoupanca: [],
    totalAPagar: [],
  };

  it('importar envia a folha e as opções e devolve o resumo da API', async () => {
    const resumo = { mes: '2026-03', despesasCriadas: ['Renda'], pagamentosRegistados: 1, extrasRegistadas: 2, anuaisCriadas: [], historico: ['Lucro', 'Saldo Conta'], poupancasAtualizadas: [], dividasAtualizadas: [], porPagar: [], ignoradas: [] };
    api.responder('POST', '/api/folha/2026-03/importar', resumo);

    expect(await importarFolhaMes(UID, marco, { atualizarDividas: true })).toEqual(resumo);
    const { corpo } = api.feitos('POST', '/api/folha/2026-03/importar')[0];
    expect(corpo.opcoes).toEqual({ atualizarDividas: true });
    expect(corpo.dados.despesasMes).toEqual([{ titulo: 'Cinema', valor: 12, data: '2026-03-14' }, { titulo: 'Prenda', valor: 25 }]);
    expect(corpo.dados.saldoConta).toBe(950.4);
  });

  it('os dados de um mês e os meses com dados', async () => {
    api.responder('GET', '/api/folha/2026-03', marco);
    api.responder('GET', '/api/folha/meses', ['2026-08', '2026-09', '2026-10']);
    expect(await obterDadosFolhaMes(UID, '2026-03')).toEqual(marco);
    expect(await mesesComDados(UID)).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('normaliza títulos (sem maiúsculas, acentos nem espaços a mais)', () => {
    expect(normalizarTitulo('  Ginásio   Carro ')).toBe('ginasio carro');
  });
});
