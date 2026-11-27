import type { ComparacaoEstrategias, ResultadoEstrategia } from '../services/tipos';
import {
  bytesParaBase64,
  dataCurta,
  eCredito,
  euro,
  formatarDuracao,
  melhorEstrategia,
  percentagem,
  textoAcaba,
  textoMes,
} from '../utils/dividas';

const resultado = (meses: number, juros: number, viavel = true): ResultadoEstrategia => ({ meses, juros, viavel, ordem: [] });
const comparacao = (soPrestacoes: ResultadoEstrategia, bolaDeNeve: ResultadoEstrategia, avalanche: ResultadoEstrategia): ComparacaoEstrategias => ({
  extraMensal: 100,
  dividas: [],
  soPrestacoes,
  bolaDeNeve,
  avalanche,
  ignoradas: [],
});

describe('dívidas: textos', () => {
  it('eCredito: só com taxa', () => {
    expect(eCredito({ taxaAnual: 3.3 })).toBe(true);
    expect(eCredito({ taxaAnual: 0 })).toBe(true); // crédito sem juros continua a ser um crédito
    expect(eCredito({ taxaAnual: undefined })).toBe(false);
    expect(eCredito({})).toBe(false);
  });

  it('formatarDuracao', () => {
    expect(formatarDuracao(0)).toBe('nenhuma prestação');
    expect(formatarDuracao(1)).toBe('1 mês');
    expect(formatarDuracao(8)).toBe('8 meses');
    expect(formatarDuracao(12)).toBe('1 ano');
    expect(formatarDuracao(24)).toBe('2 anos');
    expect(formatarDuracao(13)).toBe('1 ano e 1 mês');
    expect(formatarDuracao(27)).toBe('2 anos e 3 meses');
  });

  it('textoMes e dataCurta', () => {
    expect(textoMes('2031-12')).toBe('Dezembro 2031');
    expect(textoMes(null)).toBe('—');
    expect(dataCurta('2026-10-05')).toBe('05/10/2026');
    expect(dataCurta('2026-10-05T10:00:00Z')).toBe('05/10/2026');
    expect(dataCurta(undefined)).toBe('—');
    expect(dataCurta('lixo')).toBe('—');
  });

  it('euro e percentagem têm sempre duas casas', () => {
    expect(euro(156.2)).toBe('156.20 €');
    expect(percentagem(3.3)).toBe('3.30 %');
  });
});

describe('bytesParaBase64', () => {
  const comBuffer = (texto: string) => Buffer.from(texto, 'latin1').toString('base64');
  const bytes = (texto: string) => Uint8Array.from(Buffer.from(texto, 'latin1'));

  it('dá o mesmo que o Buffer, com 0, 1 e 2 bytes a sobrar', () => {
    for (const texto of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', '%PDF-1.7\n', 'Montepio Crédito']) {
      expect(bytesParaBase64(bytes(texto))).toBe(comBuffer(texto));
    }
  });

  it('aguenta todos os valores de byte e ficheiros grandes', () => {
    const todos = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(bytesParaBase64(todos)).toBe(Buffer.from(todos).toString('base64'));
    const grande = new Uint8Array(3_000_001).map((_, i) => (i * 31) % 251);
    expect(bytesParaBase64(grande)).toBe(Buffer.from(grande).toString('base64'));
  });
});

describe('melhorEstrategia', () => {
  it('escolhe a que paga menos juros', () => {
    expect(melhorEstrategia(comparacao(resultado(60, 900), resultado(50, 700), resultado(52, 650)))).toBe('avalanche');
  });

  it('a empatar nos juros, a que acaba mais cedo', () => {
    expect(melhorEstrategia(comparacao(resultado(60, 900), resultado(50, 700), resultado(48, 700)))).toBe('avalanche');
  });

  it('ignora as que nunca acabam', () => {
    expect(melhorEstrategia(comparacao(resultado(60, 900), resultado(0, 0, false), resultado(0, 0, false)))).toBe('soPrestacoes');
  });

  it('se nenhuma acaba, não rebenta', () => {
    expect(melhorEstrategia(comparacao(resultado(0, 0, false), resultado(0, 0, false), resultado(0, 0, false)))).toBe('soPrestacoes');
  });
});

describe('textoAcaba', () => {
  it('diz quando acaba', () => {
    expect(textoAcaba(resultado(1, 10))).toBe('daqui a 1 mês');
    expect(textoAcaba(resultado(14, 10))).toBe('daqui a 14 meses');
    expect(textoAcaba(resultado(0, 0, false))).toBe('nunca (a prestação não chega para os juros)');
  });
});

describe('formulário do contrato', () => {
  const { CONTRATO_VAZIO, contratoParaTexto, textoParaContrato } = require('../utils/dividas');

  it('uma dívida sem contrato dá campos vazios', () => {
    expect(contratoParaTexto()).toEqual(CONTRATO_VAZIO);
    expect(contratoParaTexto({ id: 'd', titulo: 'x', valorInicial: 1, desde: '2026-10' })).toEqual(CONTRATO_VAZIO);
  });

  it('ida e volta: os campos de uma dívida passam a texto e voltam iguais', () => {
    const divida = {
      id: 'd',
      titulo: 'Carro',
      valorInicial: 7169.1,
      desde: '2026-10',
      taxaAnual: 3.3,
      valorFinanciado: 7766.69,
      entrada: 1000,
      prazoMeses: 60,
      inicioContrato: '2026-05',
      encargosMensais: 15.23,
      comissaoReembolso: 0.5,
    };
    const { campos, erro } = textoParaContrato(contratoParaTexto(divida));
    expect(erro).toBeNull();
    expect(campos).toEqual({
      taxaAnual: 3.3,
      valorFinanciado: 7766.69,
      entrada: 1000,
      prazoMeses: 60,
      inicioContrato: '2026-05',
      encargosMensais: 15.23,
      comissaoReembolso: 0.5,
    });
  });

  it('aceita o formato português e deixa os campos vazios por preencher (para apagar o valor antigo)', () => {
    const { campos, erro } = textoParaContrato({ ...CONTRATO_VAZIO, taxa: '3,30', financiado: '7.766,69' });
    expect(erro).toBeNull();
    expect(campos.taxaAnual).toBe(3.3);
    expect(campos.valorFinanciado).toBe(7766.69);
    expect(campos.entrada).toBeUndefined();
    expect(Object.keys(campos)).toContain('entrada'); // a chave existe com undefined: o PATCH manda-a em "limpar"
  });

  it.each([
    [{ taxa: '101' }, 'A taxa (TAN) tem de estar entre 0 e 100 %.'],
    [{ taxa: '-1' }, 'A taxa (TAN) tem de estar entre 0 e 100 %.'],
    [{ comissao: '120' }, 'A comissão de reembolso tem de estar entre 0 e 100 %.'],
    [{ prazo: '0' }, 'O prazo tem de ser um número de meses (1 a 1200).'],
    [{ prazo: '12,5' }, 'O prazo tem de ser um número de meses (1 a 1200).'],
    [{ prazo: '1201' }, 'O prazo tem de ser um número de meses (1 a 1200).'],
    [{ inicio: '10/2026' }, 'O início do contrato tem de ser um mês no formato AAAA-MM (ex.: 2026-05).'],
    [{ inicio: '2026-13' }, 'O início do contrato tem de ser um mês no formato AAAA-MM (ex.: 2026-05).'],
    [{ entrada: '-5' }, 'A entrada não pode ser negativo(a).'],
  ])('recusa valores sem sentido (%j)', (parcial, mensagem) => {
    expect(textoParaContrato({ ...CONTRATO_VAZIO, ...parcial }).erro).toBe(mensagem);
  });

  it('taxa 0 % é válida (crédito sem juros)', () => {
    const { campos, erro } = textoParaContrato({ ...CONTRATO_VAZIO, taxa: '0' });
    expect(erro).toBeNull();
    expect(campos.taxaAnual).toBe(0);
  });
});
