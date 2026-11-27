import {
  aplicarMapeamento,
  assinaturaDaTabela,
  decodificarTexto,
  detetarDelimitador,
  dividirLinha,
  ErroExtrato,
  lerData,
  lerExtrato,
  lerNumero,
  lerOfx,
  lerTabela,
  limparDescricao,
  type LeituraCsv,
  separarSaidas,
  sugerirMapeamento,
} from '../services/extratoBancario';

// Os ficheiros são inventados mas têm a forma dos que os bancos portugueses exportam
const latin1 = (texto: string) => Uint8Array.from(Array.from(texto, (c) => c.charCodeAt(0) & 0xff));
const utf8 = (texto: string) => Uint8Array.from(Buffer.from(texto, 'utf8'));

const DEBITO_CREDITO = [
  'Extrato Combinado;;;;;',
  'Conta;0000 0000000 00;;;;',
  'Período;01-09-2026 a 30-09-2026;;;;',
  ';;;;;',
  'Data Mov.;Data Valor;Descrição;Débito;Crédito;Saldo',
  '05-09-2026;05-09-2026;COMPRA 1234 PINGO DOCE LISBOA;45,67;;1.234,56',
  '06-09-2026;06-09-2026;TRF DE JOAO SILVA;;1.500,00;2.734,56',
  '07-09-2026;07-09-2026;COMPRA ****4321 UBER *TRIP;12,30;;2.722,26',
  '08-09-2026;08-09-2026;PAG SERV 21456 EDP COMERCIAL;63,00;;2.659,26',
].join('\r\n');

const CGD = [
  'Consultar saldos e movimentos à ordem',
  'Conta;0000000000000;EUR',
  '',
  'Data mov.;Data valor;Descrição;Montante;Saldo contabilístico;Moeda',
  '05-10-2026;05-10-2026;COMPRA CONTINENTE MODELO;-23,45;976,55;EUR',
  '04-10-2026;04-10-2026;DEPOSITO;200,00;1000,00;EUR',
  '03-10-2026;03-10-2026;DD NETFLIX;-11,99;800,00;EUR',
].join('\n');

const INGLES = ['Date,Description,Amount,Balance', '2026-10-05,"Pingo Doce, Lisboa",-45.67,1234.56', '2026-10-06,Salary,1500.00,2734.56', '2026-10-07,"Cafe ""Central""",-1.50,2733.06'].join('\n');

const OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<DTSTART>20261001
<DTEND>20261031
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261005120000[0:GMT]
<TRNAMT>-45.67
<FITID>111
<NAME>PINGO DOCE
<MEMO>COMPRA LISBOA
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261006
<TRNAMT>1500.00
<FITID>112
<NAME>SALARIO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261007
<TRNAMT>-12,30
<FITID>113
<NAME>UBER
<MEMO>UBER
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe('lerNumero', () => {
  it.each([
    ['45,67', 45.67],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['-12,50', -12.5],
    ['12,50-', -12.5],
    ['(12,50)', -12.5],
    ['−3,00', -3],
    ['€ 12.5', 12.5],
    ['12.50 EUR', 12.5],
    ['1.500', 1500], // grupos de 3 dígitos: milhares
    ['1,234', 1234],
    ['1.234.567,89', 1234567.89],
    ['+7,5', 7.5],
    ['0,99', 0.99],
    ['1500', 1500],
  ])('%s → %s', (texto, esperado) => {
    expect(lerNumero(texto)).toBe(esperado);
  });

  it.each(['', 'abc', '12a', '--5', '1.2.3,4,5x'])('"%s" não é um número', (texto) => {
    expect(Number.isNaN(lerNumero(texto))).toBe(true);
  });
});

describe('lerData', () => {
  it.each([
    ['05-10-2026', '2026-10-05'],
    ['05/10/2026', '2026-10-05'],
    ['05.10.2026', '2026-10-05'],
    ['5/1/2026', '2026-01-05'],
    ['2026-10-05', '2026-10-05'],
    ['2026/10/05', '2026-10-05'],
    ['05-10-26', '2026-10-05'],
    ['20261005', '2026-10-05'],
    ['20261005120000[0:GMT]', '2026-10-05'],
    ['2026-10-05 13:45:00', '2026-10-05'],
    ['05-10-2026 a 30-10-2026', '2026-10-05'],
  ])('%s → %s', (texto, esperada) => {
    expect(lerData(texto)).toBe(esperada);
  });

  it.each(['', 'ola', '31-02-2026', '2026-13-01', '00-10-2026', '45,67', '1.234,56', '123'])('"%s" não é uma data', (texto) => {
    expect(lerData(texto)).toBeNull();
  });
});

describe('texto do ficheiro', () => {
  it('lê UTF-8 (com e sem BOM) e Windows-1252', () => {
    expect(decodificarTexto(utf8('Descrição € ção'))).toBe('Descrição € ção');
    expect(decodificarTexto(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8('Olá')]))).toBe('Olá');
    // "Descrição" em Latin-1/1252: ç = 0xE7, ã = 0xE3; o € do 1252 é 0x80
    expect(decodificarTexto(Uint8Array.from([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f, 0x20, 0x80]))).toBe('Descrição €');
  });

  it('bytes que não são UTF-8 válido caem para Windows-1252', () => {
    expect(decodificarTexto(Uint8Array.from([0xe7]))).toBe('ç'); // sozinho não é UTF-8
    expect(decodificarTexto(Uint8Array.from([0xc3]))).toBe('Ã'); // sequência cortada
  });
});

describe('limparDescricao', () => {
  it('tira o prefixo, as referências e as máscaras de cartão', () => {
    expect(limparDescricao('COMPRA 1234 PINGO DOCE LISBOA')).toBe('1234 Pingo Doce Lisboa'); // 4 dígitos ficam (podem ser parte do nome)
    expect(limparDescricao('COMPRA ****4321 UBER *TRIP')).toBe('Uber *trip');
    expect(limparDescricao('PAG SERV 2145612 EDP COMERCIAL')).toBe('Pag Serv Edp Comercial');
  });

  it('só põe maiúscula inicial quando o banco escreveu tudo em maiúsculas', () => {
    expect(limparDescricao('Pingo Doce Lisboa')).toBe('Pingo Doce Lisboa');
    expect(limparDescricao('MCDONALDS')).toBe('Mcdonalds');
    expect(limparDescricao('Uber BV')).toBe('Uber BV');
  });

  it('nunca devolve vazio nem passa de 200 caracteres', () => {
    expect(limparDescricao('12345678')).toBe('12345678');
    expect(limparDescricao('x'.repeat(500)).length).toBe(200);
  });
});

describe('CSV: delimitador e tabela', () => {
  it('deteta o separador', () => {
    expect(detetarDelimitador(DEBITO_CREDITO)).toBe(';');
    expect(detetarDelimitador(INGLES)).toBe(',');
    expect(detetarDelimitador('a\tb\tc\n1\t2\t3')).toBe('\t');
  });

  it('respeita as aspas', () => {
    expect(dividirLinha('2026-10-05,"Pingo Doce, Lisboa",-45.67', ',')).toEqual(['2026-10-05', 'Pingo Doce, Lisboa', '-45.67']);
    expect(dividirLinha('a,"b ""c"" d",e', ',')).toEqual(['a', 'b "c" d', 'e']);
  });

  it('salta as linhas antes do cabeçalho e encontra os movimentos', () => {
    const tabela = lerTabela(DEBITO_CREDITO)!;
    expect(tabela.cabecalhos).toEqual(['Data Mov.', 'Data Valor', 'Descrição', 'Débito', 'Crédito', 'Saldo']);
    expect(tabela.linhas).toHaveLength(4);
    expect(tabela.primeiraLinha).toBe(6); // a linha do primeiro movimento no ficheiro
  });

  it('um ficheiro sem datas não é um extrato', () => {
    expect(lerTabela('a;b;c\n1;2;3\n4;5;6')).toBeNull();
  });
});

describe('CSV com débito e crédito', () => {
  const leitura = lerExtrato(latin1(DEBITO_CREDITO)) as LeituraCsv;

  it('adivinha as colunas', () => {
    expect(leitura.formato).toBe('csv');
    // A "Data Mov." é a primeira (a data valor também é uma data, mas o nome "mov" ganha)
    expect(leitura.sugestao).toEqual({ data: 0, descricao: 2, debito: 3, credito: 4 });
  });

  it('lê os movimentos: débitos negativos, créditos positivos, descrições limpas', () => {
    const { movimentos, avisos } = aplicarMapeamento(leitura.tabela, leitura.sugestao!);
    expect(avisos).toEqual([]);
    expect(movimentos.map((m) => [m.data, m.descricao, m.valor])).toEqual([
      ['2026-09-05', '1234 Pingo Doce Lisboa', -45.67],
      ['2026-09-06', 'Trf De Joao Silva', 1500],
      ['2026-09-07', 'Uber *trip', -12.3],
      ['2026-09-08', 'Pag Serv Edp Comercial', -63],
    ]);
    expect(movimentos[0].original).toBe('COMPRA 1234 PINGO DOCE LISBOA');
    expect(movimentos[0].linha).toBe(6);
  });

  it('separa as saídas das entradas', () => {
    const { movimentos } = aplicarMapeamento(leitura.tabela, leitura.sugestao!);
    const { saidas, entradas } = separarSaidas(movimentos);
    expect(saidas).toHaveLength(3);
    expect(entradas).toBe(1);
  });
});

describe('CSV com uma coluna de valor com sinal', () => {
  it('Caixa: lê o valor e ignora o saldo', () => {
    const leitura = lerExtrato(latin1(CGD)) as LeituraCsv;
    expect(leitura.sugestao).toEqual({ data: 0, descricao: 2, valor: 3 });
    const { movimentos } = aplicarMapeamento(leitura.tabela, leitura.sugestao!);
    expect(movimentos.map((m) => [m.data, m.valor])).toEqual([
      ['2026-10-05', -23.45],
      ['2026-10-04', 200],
      ['2026-10-03', -11.99],
    ]);
  });

  it('formato inglês com vírgula e aspas', () => {
    const leitura = lerExtrato(utf8(INGLES)) as LeituraCsv;
    expect(leitura.sugestao).toEqual({ data: 0, descricao: 1, valor: 2 });
    const { movimentos } = aplicarMapeamento(leitura.tabela, leitura.sugestao!);
    expect(movimentos.map((m) => [m.descricao, m.valor])).toEqual([
      ['Pingo Doce, Lisboa', -45.67],
      ['Salary', 1500],
      ['Cafe "Central"', -1.5],
    ]);
  });

  it('sem cabeçalho nenhum adivinha pelo conteúdo', () => {
    const texto = ['05-10-2026;COMPRA CONTINENTE;-23,45', '04-10-2026;DD NETFLIX;-11,99', '03-10-2026;DEPOSITO;200,00'].join('\n');
    const leitura = lerExtrato(utf8(texto)) as LeituraCsv;
    expect(leitura.tabela.cabecalhos).toEqual(['', '', '']);
    expect(leitura.sugestao).toEqual({ data: 0, descricao: 1, valor: 2 });
  });

  it('valores com o sinal no fim (12,50-)', () => {
    const texto = ['Data;Descrição;Valor', '05-10-2026;Compra A;12,50-', '06-10-2026;Compra B;7,00-'].join('\n');
    const leitura = lerExtrato(utf8(texto)) as LeituraCsv;
    const { movimentos } = aplicarMapeamento(leitura.tabela, leitura.sugestao!);
    expect(movimentos.map((m) => m.valor)).toEqual([-12.5, -7]);
  });
});

describe('CSV: casos difíceis', () => {
  it('linhas sem data ou sem valor ficam de fora e há aviso', () => {
    const texto = ['Data;Descrição;Valor', '05-10-2026;Compra A;-12,50', 'Total;Soma;-12,50', '07-10-2026;Sem valor;', '08-10-2026;Zero;0,00'].join('\n');
    const leitura = lerExtrato(utf8(texto)) as LeituraCsv;
    const { movimentos, avisos } = aplicarMapeamento(leitura.tabela, leitura.sugestao!);
    expect(movimentos).toHaveLength(1);
    expect(avisos).toEqual(['2 linha(s) sem valor (ou com valor 0) ficaram de fora.']);
  });

  it('um mapeamento escolhido à mão (outra coluna de descrição)', () => {
    const leitura = lerExtrato(latin1(DEBITO_CREDITO)) as LeituraCsv;
    const { movimentos } = aplicarMapeamento(leitura.tabela, { data: 1, descricao: 2, debito: 3, credito: 4 });
    expect(movimentos).toHaveLength(4);
  });

  it('só débito (sem coluna de crédito) ou só crédito também funciona', () => {
    const leitura = lerExtrato(latin1(DEBITO_CREDITO)) as LeituraCsv;
    expect(aplicarMapeamento(leitura.tabela, { data: 0, descricao: 2, debito: 3 }).movimentos.every((m) => m.valor < 0)).toBe(true);
  });

  it('não é um extrato', () => {
    expect(() => lerExtrato(utf8('isto não tem movimentos nenhuns'))).toThrow(ErroExtrato);
    expect(() => lerExtrato(utf8(''))).toThrow(ErroExtrato);
  });

  it('a assinatura do formato muda quando mudam as colunas, não os dados', () => {
    const a = lerTabela(DEBITO_CREDITO)!;
    const b = lerTabela(DEBITO_CREDITO.replace('45,67', '99,99'))!;
    const c = lerTabela(CGD)!;
    expect(assinaturaDaTabela(a)).toBe(assinaturaDaTabela(b));
    expect(assinaturaDaTabela(a)).not.toBe(assinaturaDaTabela(c));
  });

  it('sem sugestão possível devolve null (a pessoa escolhe as colunas)', () => {
    const tabela = { delimitador: ';', cabecalhos: ['', '', ''], linhas: [['05-10-2026', 'abc', 'def']], primeiraLinha: 1 };
    expect(sugerirMapeamento(tabela)).toBeNull();
  });
});

describe('OFX', () => {
  it('lê os movimentos de um ficheiro SGML', () => {
    const leitura = lerExtrato(latin1(OFX));
    expect(leitura.formato).toBe('ofx');
    const { movimentos } = leitura as ReturnType<typeof lerOfx>;
    expect(movimentos.map((m) => [m.data, m.descricao, m.valor])).toEqual([
      ['2026-10-05', 'Pingo Doce Compra Lisboa', -45.67],
      ['2026-10-06', 'Salario', 1500],
      ['2026-10-07', 'Uber', -12.3], // vírgula decimal e NAME igual a MEMO (só conta uma vez)
    ]);
  });

  it('também lê OFX em XML (com as etiquetas fechadas)', () => {
    const xml = '<OFX><STMTTRN><DTPOSTED>20261005</DTPOSTED><TRNAMT>-9.99</TRNAMT><NAME>NETFLIX</NAME></STMTTRN></OFX>';
    const { movimentos } = lerOfx(xml);
    expect(movimentos.map((m) => [m.data, m.valor, m.descricao])).toEqual([['2026-10-05', -9.99, 'Netflix']]);
  });

  it('OFX sem movimentos avisa', () => {
    expect(lerOfx('<OFX></OFX>').avisos[0]).toMatch(/Não encontrei movimentos/);
  });
});
