import { idPagamento } from '../services/calculos';
import type { Despesa, PagamentoFixa } from '../services/tipos';
import {
  diaEMes,
  gastosRepetiveis,
  mensagemApagarMensal,
  mensagemDesfazerPagamento,
  temDebitoAutomatico,
  resumoDespesasMensais,
  somarValores,
  textoDataGuardada,
  textoEstado,
  textoHoje,
  textoOntem,
  textoValor,
  validarDespesaExtra,
  validarDespesaMensal,
  validarEdicaoExtra,
  validarEdicaoMensal,
} from '../utils/ecrasDespesas';
import { parseValor } from '../utils/formatos';

const outubro5 = new Date(2026, 9, 5, 12);
const OUTUBRO = '2026-10';

const fixa = (campos: Partial<Despesa> = {}): Despesa => ({ id: 'f', titulo: 'Renda', valor: 600, diaDebito: 1, ...campos });

const pagamento = (
  fixaId: string,
  valor: number,
  campos: Partial<PagamentoFixa> = {}
): PagamentoFixa => ({
  id: idPagamento(campos.mes ?? OUTUBRO, fixaId),
  fixaId,
  mes: OUTUBRO,
  titulo: fixaId,
  valor,
  data: `${campos.mes ?? OUTUBRO}-03`,
  estado: 'pago',
  ...campos,
});

describe('textos', () => {
  it('desfazer um pagamento: o dinheiro volta e a despesa fica por pagar (sem "anulado")', () => {
    expect(mensagemDesfazerPagamento('Renda', 600)).toBe('600,00 € voltam para a conta e "Renda" fica por pagar.');
  });

  it('desfazer um pagamento com débito automático avisa que ele não a volta a pagar este mês', () => {
    expect(mensagemDesfazerPagamento('Renda', 600, true)).toBe(
      '600,00 € voltam para a conta e "Renda" fica por pagar. O débito automático não a volta a pagar este mês (só no mês seguinte); se a quiseres pagar, fá-lo à mão.'
    );
  });

  it('só se paga sozinha com dia, valor fixo e o débito automático ligado', () => {
    expect(temDebitoAutomatico({ diaDebito: 10 })).toBe(true);
    expect(temDebitoAutomatico({ diaDebito: 10, debitoAutomatico: false })).toBe(false);
    expect(temDebitoAutomatico({ diaDebito: 10, variavel: true })).toBe(false);
    expect(temDebitoAutomatico({})).toBe(false);
  });

  it('apagar uma despesa fixa diz se ainda aparece este mês', () => {
    expect(mensagemApagarMensal('Luz', false)).toBe('"Luz" deixa de aparecer a partir deste mês. Os meses passados em que foi paga não mudam.');
    expect(mensagemApagarMensal('Luz', true)).toContain('deixa de aparecer a partir do próximo');
  });

  it('valor para editar no formato português, que o parseValor volta a ler igual', () => {
    expect(textoValor(12.5)).toBe('12,50');
    expect(textoValor(1500)).toBe('1500,00');
    expect(textoValor(0.1 + 0.2)).toBe('0,30');
    for (const valor of [12.5, 1500, 1234.56, 0.3]) {
      expect(parseValor(textoValor(valor))).toBe(valor);
    }
  });

  it('atalhos Hoje e Ontem (também na mudança de mês e de ano)', () => {
    expect(textoHoje(outubro5)).toBe('05/10/2026');
    expect(textoOntem(outubro5)).toBe('04/10/2026');
    expect(textoOntem(new Date(2026, 9, 1, 12))).toBe('30/09/2026');
    expect(textoOntem(new Date(2027, 0, 1, 12))).toBe('31/12/2026');
  });

  it('dia e mês de uma data guardada', () => {
    expect(diaEMes('2026-10-05')).toBe('05/10');
    expect(diaEMes('28/09/2026')).toBe('28/09');
    expect(diaEMes(undefined)).toBe('');
  });

  it('data guardada para o campo de edição', () => {
    expect(textoDataGuardada('2026-10-05')).toBe('05/10/2026');
    expect(textoDataGuardada('28/09/2026')).toBe('28/09/2026');
    expect(textoDataGuardada(undefined)).toBe('');
  });

  it('soma ao cêntimo', () => {
    expect(somarValores([{ valor: 0.1 }, { valor: 0.2 }])).toBe(0.3);
    expect(somarValores([])).toBe(0);
  });
});

describe('formulário de despesa extra', () => {
  const form = { titulo: ' Jantar ', valor: '45,50', data: '04/10/2026' };

  it('lê título, valor e data', () => {
    expect(validarDespesaExtra(form, outubro5)).toEqual({ despesa: { titulo: 'Jantar', valor: 45.5, data: '2026-10-04' } });
  });

  it('recusa título ou valor em falta e valores inválidos', () => {
    expect(validarDespesaExtra({ ...form, titulo: '  ' }, outubro5)).toEqual({ erro: 'Preenche o título e o valor' });
    expect(validarDespesaExtra({ ...form, valor: '' }, outubro5)).toEqual({ erro: 'Preenche o título e o valor' });
    expect(validarDespesaExtra({ ...form, valor: 'abc' }, outubro5)).toEqual({ erro: 'Valor inválido' });
    expect(validarDespesaExtra({ ...form, valor: '-5' }, outubro5)).toEqual({ erro: 'Valor inválido' });
    expect(validarDespesaExtra({ ...form, valor: '0,001' }, outubro5)).toEqual({ erro: 'Valor inválido' });
  });

  it('mostra o erro da data (mal escrita, que não existe ou no futuro)', () => {
    expect(validarDespesaExtra({ ...form, data: 'ontem' }, outubro5)).toEqual({ erro: 'Escreve a data como dd/mm/aaaa' });
    expect(validarDespesaExtra({ ...form, data: '31/09/2026' }, outubro5)).toEqual({ erro: 'Essa data não existe' });
    expect(validarDespesaExtra({ ...form, data: '06/10/2026' }, outubro5)).toEqual({ erro: 'A data não pode ser no futuro' });
  });
});

describe('editar despesa extra', () => {
  const original: Despesa = { id: 'e', titulo: 'Jantar', valor: 45.5, data: '2026-10-04', mes: OUTUBRO, descontadaDaConta: true };
  const semAlteracoes = { titulo: 'Jantar', valor: '45,50', data: '04/10/2026' };

  it('sem alterações não há nada a guardar', () => {
    expect(validarEdicaoExtra(original, semAlteracoes, outubro5)).toEqual({ campos: {} });
    // Escrever o mesmo valor ou a mesma data de outra forma também não é uma alteração
    expect(validarEdicaoExtra(original, { ...semAlteracoes, valor: '45.5', data: '4/10/26' }, outubro5)).toEqual({ campos: {} });
  });

  it('devolve só o que mudou', () => {
    expect(validarEdicaoExtra(original, { ...semAlteracoes, valor: '42,5' }, outubro5)).toEqual({ campos: { valor: 42.5 } });
    expect(validarEdicaoExtra(original, { ...semAlteracoes, titulo: 'Jantar fora', data: '30/09/2026' }, outubro5)).toEqual({
      campos: { titulo: 'Jantar fora', data: '2026-09-30' },
    });
  });

  it('valida como ao adicionar', () => {
    expect(validarEdicaoExtra(original, { ...semAlteracoes, valor: '0' }, outubro5)).toEqual({ erro: 'Valor inválido' });
    expect(validarEdicaoExtra(original, { ...semAlteracoes, data: '10/10/2026' }, outubro5)).toEqual({ erro: 'A data não pode ser no futuro' });
  });

  it('não obriga a corrigir a data de despesas de versões anteriores (sem data ou noutro formato)', () => {
    const semData: Despesa = { id: 'a', titulo: 'Cinema', valor: 10 };
    expect(validarEdicaoExtra(semData, { titulo: 'Cinema', valor: '12', data: '' }, outubro5)).toEqual({ campos: { valor: 12 } });
    const formatoAntigo: Despesa = { id: 'b', titulo: 'Cinema', valor: 10, data: '28/09/2026' };
    expect(validarEdicaoExtra(formatoAntigo, { titulo: 'Cinema', valor: '10', data: '28/09/2026' }, outubro5)).toEqual({ campos: {} });
    // Mas se a data for mudada, passa a ser validada e guardada em ISO
    expect(validarEdicaoExtra(semData, { titulo: 'Cinema', valor: '10', data: '01/10/2026' }, outubro5)).toEqual({
      campos: { data: '2026-10-01' },
    });
  });
});

describe('formulário de despesa fixa', () => {
  const form = { titulo: 'Renda', valor: '600', diaDebito: '8' };

  it('lê título, valor e dia de débito', () => {
    expect(validarDespesaMensal(form)).toEqual({ despesa: { titulo: 'Renda', valor: 600, diaDebito: 8 } });
    expect(validarDespesaMensal({ ...form, diaDebito: ' 31 ' })).toEqual({ despesa: { titulo: 'Renda', valor: 600, diaDebito: 31 } });
  });

  it('aceita categoria opcional na despesa fixa', () => {
    expect(validarDespesaMensal({ ...form, categoria: 'casa' })).toEqual({
      despesa: { titulo: 'Renda', valor: 600, diaDebito: 8, categoria: 'casa' },
    });
    expect(validarDespesaMensal(form)).toEqual({ despesa: { titulo: 'Renda', valor: 600, diaDebito: 8 } });
  });

  it('aceita uma despesa sem dia de débito', () => {
    expect(validarDespesaMensal({ ...form, diaDebito: '' })).toEqual({ despesa: { titulo: 'Renda', valor: 600 } });
  });

  it.each(['0', '32', '5a', '-1', '1.5'])('recusa o dia "%s"', (diaDebito) => {
    expect(validarDespesaMensal({ ...form, diaDebito })).toEqual({ erro: 'Dia de débito deve ser entre 1 e 31' });
  });

  it('recusa título ou valor em falta', () => {
    expect(validarDespesaMensal({ ...form, titulo: '' })).toEqual({ erro: 'Preenche o título e o valor' });
    expect(validarDespesaMensal({ ...form, valor: 'x' })).toEqual({ erro: 'Valor inválido' });
  });

  it('ao editar devolve só o que mudou', () => {
    const original = fixa({ id: 'renda', valor: 600, diaDebito: 8 });
    expect(validarEdicaoMensal(original, { titulo: 'Renda', valor: '600,00', diaDebito: '08' })).toEqual({ campos: {} });
    expect(validarEdicaoMensal(original, { titulo: 'Renda casa', valor: '620', diaDebito: '8' })).toEqual({
      campos: { titulo: 'Renda casa', valor: 620 },
    });
    expect(validarEdicaoMensal(original, { titulo: 'Renda', valor: '600', diaDebito: '10' })).toEqual({ campos: { diaDebito: 10 } });
    expect(validarEdicaoMensal(original, { titulo: 'Renda', valor: '600', diaDebito: '' })).toEqual({
      campos: { diaDebito: undefined },
    });
    expect(validarEdicaoMensal(original, { titulo: 'Renda', valor: '600', diaDebito: '8', categoria: 'casa' })).toEqual({
      campos: { categoria: 'casa' },
    });
    expect(validarEdicaoMensal({ ...original, categoria: 'casa' }, { titulo: 'Renda', valor: '600', diaDebito: '8' })).toEqual({
      campos: { categoria: undefined },
    });
  });
});

describe('despesas fixas de um mês', () => {
  it('estado de cada despesa: paga (com o valor pago) ou por pagar (com o valor atual); não há "anulado"', () => {
    const fixas = [
      fixa({ id: 'renda', titulo: 'Renda', valor: 620, diaDebito: 1 }), // paga a 600 antes de ser editada
      fixa({ id: 'luz', titulo: 'Luz', valor: 45.1, diaDebito: 20 }),
      fixa({ id: 'net', titulo: 'Net', valor: 35, diaDebito: 3 }),
    ];
    const pagamentos = [
      pagamento('renda', 600, { data: '2026-10-01' }),
    ];
    const { linhas, totais } = resumoDespesasMensais(fixas, pagamentos, OUTUBRO);

    expect(linhas.map((l) => [l.titulo, l.estado, l.valor, textoEstado(l)])).toEqual([
      ['Renda', 'pago', 600, '✓ Pago em 01/10'],
      ['Luz', 'por-pagar', 45.1, 'Por pagar · dia 20'],
      ['Net', 'por-pagar', 35, 'Por pagar · dia 3'],
    ]);
    expect(linhas.every((l) => l.fixa !== null && !l.terminada)).toBe(true);
    expect(totais).toEqual({ debitadas: 600, porDebitar: 80.1, total: 680.1 });
  });

  it('só as despesas que contam nesse mês, e no fim os pagamentos de despesas que já não contam (histórico)', () => {
    const fixas = [
      fixa({ id: 'renda', titulo: 'Renda', inicio: '2026-01' }),
      fixa({ id: 'ginasio', titulo: 'Ginásio', valor: 30, inicio: '2026-01', fim: '2026-09' }), // terminada
      fixa({ id: 'carro', titulo: 'Carro', valor: 200, inicio: '2026-11' }), // ainda não tinha começado
      fixa({ id: 'seguro', titulo: 'Seguro', valor: 50, inicio: '2026-01', fim: OUTUBRO }), // último mês
    ];
    const pagamentos = [
      pagamento('renda', 600),
      pagamento('dentista', 156.28, { titulo: 'Dentista' }), // despesa apagada
      pagamento('ginasio', 30, { titulo: 'Ginásio' }),
      pagamento('seguro', 50, { mes: '2026-09' }), // de outro mês
    ];
    const { linhas, totais } = resumoDespesasMensais(fixas, pagamentos, OUTUBRO);

    expect(linhas.map((l) => [l.titulo, l.estado, l.fixa?.id ?? null, l.terminada])).toEqual([
      ['Renda', 'pago', 'renda', false],
      ['Seguro', 'por-pagar', 'seguro', true],
      ['Dentista', 'pago', null, true],
      ['Ginásio', 'pago', null, true],
    ]);
    expect(totais).toEqual({ debitadas: 786.28, porDebitar: 50, total: 836.28 });
  });

  it('pagamentos parciais ficam marcados como parciais e o resto continua por pagar', () => {
    const { linhas, totais } = resumoDespesasMensais(
      [fixa({ id: 'combustivel', titulo: 'Combustível', valor: 100, diaDebito: 5 })],
      [{ ...pagamento('combustivel', 40), parcial: true }],
      OUTUBRO
    );

    expect(linhas.map((l) => [l.titulo, l.estado, l.valor, textoEstado(l)])).toEqual([
      ['Combustível', 'parcial', 40, 'Parcial · 40,00 € pagos · faltam 60,00 €'],
    ]);
    expect(totais).toEqual({ debitadas: 40, porDebitar: 60, total: 100 });
  });

  it('a soma das linhas dá os totais do mês', () => {
    const fixas = [fixa({ id: 'a', valor: 10.1 }), fixa({ id: 'b', valor: 20.2 }), fixa({ id: 'c', valor: 30.3, fim: '2026-09' })];
    const pagamentos = [pagamento('a', 10.1), pagamento('c', 30.3)];
    const { linhas, totais } = resumoDespesasMensais(fixas, pagamentos, OUTUBRO);

    const pagas = somarValores(linhas.filter((l) => l.estado === 'pago'));
    const porPagar = somarValores(linhas.filter((l) => l.estado !== 'pago'));
    expect([pagas, porPagar]).toEqual([totais.debitadas, totais.porDebitar]);
    expect(somarValores(linhas)).toBe(totais.total);
  });

  it('pagamentos marcados na própria despesa (versão anterior) contam como pagos, sem data', () => {
    const fixas = [fixa({ id: 'renda', valor: 300, debitado: true, mesDebitado: OUTUBRO }), fixa({ id: 'luz', valor: 40, anuladoMes: OUTUBRO })];
    const { linhas } = resumoDespesasMensais(fixas, [], OUTUBRO);
    expect(linhas.map((l) => [l.estado, l.valor, textoEstado(l)])).toEqual([
      ['pago', 300, '✓ Pago'],
      ['por-pagar', 40, 'Por pagar · dia 1'],
    ]);
  });

  it('despesas sem dia de débito (versões anteriores) ficam só "Por pagar"', () => {
    const { linhas } = resumoDespesasMensais([fixa({ diaDebito: undefined })], [], OUTUBRO);
    expect(textoEstado(linhas[0])).toBe('Por pagar');
  });

  it('mês sem nada', () => {
    expect(resumoDespesasMensais([], [], OUTUBRO)).toEqual({ linhas: [], totais: { debitadas: 0, porDebitar: 0, total: 0 } });
  });
});

describe('gastos para repetir (chips da folha "Novo gasto")', () => {
  const gasto = (id: string, titulo: string, valor: number, campos: Partial<Despesa> = {}): Despesa => ({
    id,
    titulo,
    valor,
    ...campos,
  });

  it('títulos distintos, na ordem em que vêm (a mais recente primeiro)', () => {
    const despesas = [
      gasto('d1', 'Café', 1.5, { data: '2026-10-06' }),
      gasto('d2', 'Continente', 23.45, { data: '2026-10-05' }),
      gasto('d3', 'Café', 1.4, { data: '2026-10-04' }), // o mesmo título: fica o mais recente
      gasto('d4', 'Padaria', 2.8, { data: '2026-10-03' }),
    ];
    expect(gastosRepetiveis(despesas).map((d) => [d.id, d.titulo, d.valor])).toEqual([
      ['d1', 'Café', 1.5],
      ['d2', 'Continente', 23.45],
      ['d4', 'Padaria', 2.8],
    ]);
  });

  it('sem repetir os gerados por um gasto que se repete (esses já saem sozinhos)', () => {
    const despesas = [gasto('d1', 'Netflix', 12.99, { gastoRecorrenteId: 'r1' }), gasto('d2', 'Café', 1.5)];
    expect(gastosRepetiveis(despesas).map((d) => d.titulo)).toEqual(['Café']);
  });

  it('sem títulos vazios e com limite de chips', () => {
    const despesas = [
      gasto('d1', '   ', 1),
      gasto('d2', 'A', 1),
      gasto('d3', 'B', 2),
      gasto('d4', 'C', 3),
    ];
    expect(gastosRepetiveis(despesas, 2).map((d) => d.titulo)).toEqual(['A', 'B']);
    expect(gastosRepetiveis([])).toEqual([]);
  });
});
