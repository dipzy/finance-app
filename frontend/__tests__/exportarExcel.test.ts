jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));
jest.mock('../utils/guardarFicheiro', () => ({ guardarFicheiro: jest.fn() }));

import { strFromU8, unzipSync } from 'fflate';
import { CORES, criarFolhaMes, criarLivroExcel, exportarParaExcel, formulaSoma } from '../services/exportarExcel';
import type { DadosFolhaMes, LinhaFolha } from '../services/tipos';
import { ApiFalsa, instalarApiFalsa } from '../test-utils/apiFalsa';
import { guardarFicheiro } from '../utils/guardarFicheiro';
import { CelulaFormatada, Estilo, Folha, gerarXlsx } from '../utils/xlsx';

// Dados inventados de um mês
const outubro: DadosFolhaMes = {
  mes: '2026-10',
  lucro: [{ titulo: 'Ordenado', valor: 1500 }, { titulo: 'Alimen.', valor: 150, informativo: true }],
  despesas: [
    { titulo: 'Renda', valor: 600 },
    { titulo: 'Luz & Gás', valor: 45.1 },
    { titulo: 'Internet', valor: 35 },
  ],
  poupanca: [{ titulo: 'Poupança', valor: 200 }, { titulo: 'PPR', valor: 150 }],
  // O bloco mais comprido: linhas 10 a 14
  despesasMes: [
    { titulo: 'Supermercado', valor: 85.5, data: '2026-10-02' },
    { titulo: 'Combustível', valor: 40, data: '2026-10-03' },
    { titulo: 'Farmácia', valor: 12.99 },
    { titulo: 'Cinema', valor: 14 },
    { titulo: 'Prenda', valor: 25 },
  ],
  anual: [{ titulo: 'Seguro casa', valor: 120 }],
  saldoConta: 900,
  falta: [{ titulo: 'Luz & Gás', valor: 45.1 }, { titulo: 'Internet', valor: 35 }],
  saldoPoupanca: [{ titulo: 'Conta poupança', valor: 2500 }, { titulo: 'PPR', valor: 1200 }],
  totalAPagar: [{ titulo: 'Crédito carro', valor: 5400 }],
};

const vazio = (mes: string): DadosFolhaMes => ({
  mes,
  lucro: [],
  despesas: [],
  poupanca: [],
  despesasMes: [],
  anual: [],
  falta: [],
  saldoPoupanca: [],
  totalAPagar: [],
});

// Célula pela referência do Excel ("E6")
function em(folha: Folha, ref: string): CelulaFormatada | undefined {
  const [, letras, linha] = ref.match(/^([A-Z]+)(\d+)$/)!;
  const coluna = [...letras].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) - 1;
  return folha.linhas[Number(linha) - 1]?.[coluna] as CelulaFormatada | undefined;
}
const valor = (folha: Folha, ref: string) => em(folha, ref)?.valor;
const formula = (folha: Folha, ref: string) => em(folha, ref)?.formula;
const estilo = (folha: Folha, ref: string) => em(folha, ref)?.estilo as Estilo | undefined;

function abrir(bytes: Uint8Array) {
  const ficheiros = unzipSync(bytes);
  return Object.fromEntries(Object.entries(ficheiros).map(([nome, b]) => [nome, strFromU8(b)]));
}
const nomesDasFolhas = (workbook: string) => [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);

describe('folha do mês', () => {
  const folha = criarFolhaMes(outubro);

  it('título com o nome do mês e os cabeçalhos dos blocos', () => {
    expect(folha.nome).toBe('Outubro 2026');
    expect(valor(folha, 'B3')).toBe('Outubro 2026');
    expect(estilo(folha, 'B3')).toMatchObject({ tamanho: 20, fundo: CORES.titulo });
    expect(['E5', 'H5', 'K5', 'N5', 'Q5'].map((r) => valor(folha, r))).toEqual(['Lucro', 'Despesas', 'Poupança', 'Despesas do Mês', 'Anual']);
    expect(['E9', 'F9', 'H9', 'I9', 'K9', 'L9', 'N9', 'O9', 'Q9', 'R9'].map((r) => valor(folha, r))).toEqual(
      Array(5).fill(['Categoria', 'Valor']).flat()
    );
    expect(estilo(folha, 'H5')).toMatchObject({ tamanho: 14, fundo: CORES.despesas, bordas: true });
    expect(estilo(folha, 'O9')).toMatchObject({ fundo: CORES.despesasMes, bordas: true });
  });

  it('as linhas de cada bloco a partir da linha 10, com valores em euros', () => {
    expect([valor(folha, 'H10'), valor(folha, 'I10')]).toEqual(['Renda', 600]);
    expect([valor(folha, 'H12'), valor(folha, 'I12')]).toEqual(['Internet', 35]);
    expect([valor(folha, 'N14'), valor(folha, 'O14')]).toEqual(['Prenda', 25]);
    expect([valor(folha, 'Q10'), valor(folha, 'R10')]).toEqual(['Seguro casa', 120]);
    expect(estilo(folha, 'I10')).toMatchObject({ bordas: true, formato: expect.stringContaining('[$€-2]') });
    expect(em(folha, 'H13')).toBeUndefined();
  });

  it('o total de cada bloco soma exatamente as linhas escritas', () => {
    expect([formula(folha, 'E6'), valor(folha, 'E6')]).toEqual(['SUM(F10)', 1500]); // sem o "Alimen."
    expect([formula(folha, 'H6'), valor(folha, 'H6')]).toEqual(['SUM(I10:I12)', 680.1]);
    expect([formula(folha, 'K6'), valor(folha, 'K6')]).toEqual(['SUM(L10:L11)', 350]);
    expect([formula(folha, 'N6'), valor(folha, 'N6')]).toEqual(['SUM(O10:O14)', 177.49]);
    expect([formula(folha, 'Q6'), valor(folha, 'Q6')]).toEqual(['SUM(R10)', 120]);
  });

  it('as linhas informativas aparecem mas não entram nas contas', () => {
    expect([valor(folha, 'E11'), valor(folha, 'F11')]).toEqual(['Alimen.', 150]);
    expect(estilo(folha, 'E11')).toMatchObject({ italico: true, cor: CORES.informativo });

    const lucro: LinhaFolha[] = [
      { titulo: 'Ordenado', valor: 1500 },
      { titulo: 'Alimen.', valor: 150, informativo: true },
      { titulo: 'Subsídio', valor: 100 },
    ];
    const comSubsidio = criarFolhaMes({ ...outubro, lucro });
    expect([formula(comSubsidio, 'E6'), valor(comSubsidio, 'E6')]).toEqual(['SUM(F10,F12)', 1600]);
    expect(valor(comSubsidio, 'I16')).toBe(919.9);
  });

  it('Sobra, Total para extras e Total 2 linhas abaixo do bloco mais comprido', () => {
    expect(['H16', 'K16', 'N16'].map((r) => valor(folha, r))).toEqual(['Sobra', 'Total para extras', 'Total']);
    // Sobra = Lucro - Despesas
    expect([formula(folha, 'I16'), valor(folha, 'I16')]).toEqual(['E6-H6', 819.9]);
    // Total para extras = Sobra - Poupança
    expect([formula(folha, 'L16'), valor(folha, 'L16')]).toEqual(['I16-K6', 469.9]);
    // Total = Total para extras - Despesas do Mês
    expect([formula(folha, 'O16'), valor(folha, 'O16')]).toEqual(['L16-N6', 292.41]);
    expect(estilo(folha, 'I16')).toMatchObject({ tamanho: 12, fundo: CORES.resultado });
  });

  it.each([0, 1, 3, 8])('com %i despesas as fórmulas acompanham o tamanho do bloco', (n) => {
    const despesas = Array.from({ length: n }, (_, i) => ({ titulo: `Despesa ${i + 1}`, valor: 10 * (i + 1) }));
    const f = criarFolhaMes({ ...vazio('2026-03'), lucro: [{ titulo: 'Ordenado', valor: 1000 }], despesas });
    const ultima = 9 + n;
    const soma = (n * (n + 1) * 10) / 2;
    expect(formula(f, 'H6')).toBe(n === 0 ? undefined : n === 1 ? 'SUM(I10)' : `SUM(I10:I${ultima})`);
    expect(valor(f, 'H6')).toBe(soma);
    expect(valor(f, `H${ultima}`)).toBe(n ? `Despesa ${n}` : 'Categoria');

    const linhaSobra = Math.max(n, 1) + 11; // 2 linhas abaixo do bloco mais comprido
    expect(valor(f, `H${linhaSobra}`)).toBe('Sobra');
    expect([formula(f, `I${linhaSobra}`), valor(f, `I${linhaSobra}`)]).toEqual(['E6-H6', 1000 - soma]);
    expect(valor(f, `E${linhaSobra + 3}`)).toBe('Saldo Conta');
  });

  it('Saldo Conta, Falta, Total e Previsão', () => {
    expect([valor(folha, 'E19'), valor(folha, 'F19')]).toEqual(['Saldo Conta', 900]);
    expect(estilo(folha, 'F19')).toMatchObject({ negrito: true, fundo: CORES.saldo });
    expect(valor(folha, 'D21')).toBe('Falta');
    expect(estilo(folha, 'D21')).toMatchObject({ negrito: true, tamanho: 14, cor: CORES.falta });
    expect([valor(folha, 'E21'), valor(folha, 'F21'), valor(folha, 'E22'), valor(folha, 'F22')]).toEqual(['Luz & Gás', 45.1, 'Internet', 35]);
    expect([valor(folha, 'E23'), formula(folha, 'F23'), valor(folha, 'F23')]).toEqual(['Total', 'SUM(F21:F22)', 80.1]);
    // Previsão = Saldo Conta - o que falta pagar
    expect([valor(folha, 'E24'), formula(folha, 'F24'), valor(folha, 'F24')]).toEqual(['Previsão', 'F19-F23', 819.9]);
  });

  it('Saldo Poupança e Total a pagar, cada um com o seu total', () => {
    expect(valor(folha, 'H19')).toBe('Saldo Poupança');
    expect([valor(folha, 'H21'), valor(folha, 'I22')]).toEqual(['Conta poupança', 1200]);
    expect([valor(folha, 'H23'), formula(folha, 'I23'), valor(folha, 'I23')]).toEqual(['Total', 'SUM(I21:I22)', 3700]);
    expect(valor(folha, 'K21')).toBe('Total a pagar');
    expect(estilo(folha, 'K21')).toMatchObject({ fundo: CORES.aPagar, bordas: true });
    expect([valor(folha, 'K22'), valor(folha, 'L22')]).toEqual(['Crédito carro', 5400]);
    expect([valor(folha, 'K23'), formula(folha, 'L23'), valor(folha, 'L23')]).toEqual(['Total', 'SUM(L22)', 5400]);
  });

  it('um mês sem dados mostra os cabeçalhos e os totais a 0, sem fórmulas com intervalos vazios', () => {
    const f = criarFolhaMes(vazio('2026-02'));
    expect(valor(f, 'B3')).toBe('Fevereiro 2026');
    expect(['E5', 'H5', 'K5', 'N5', 'Q5'].map((r) => valor(f, r))).toEqual(['Lucro', 'Despesas', 'Poupança', 'Despesas do Mês', 'Anual']);
    for (const r of ['E6', 'H6', 'K6', 'N6', 'Q6']) {
      expect([valor(f, r), formula(f, r)]).toEqual([0, undefined]);
    }
    expect(valor(f, 'E9')).toBe('Categoria');
    // Resultados logo abaixo dos cabeçalhos "Categoria | Valor"
    expect([valor(f, 'H11'), formula(f, 'I11'), valor(f, 'I11')]).toEqual(['Sobra', 'E6-H6', 0]);
    expect([formula(f, 'O11'), valor(f, 'O11')]).toEqual(['L11-N6', 0]);
    // Sem saldo da conta (meses passados): o valor e a previsão ficam em branco
    expect([valor(f, 'E14'), valor(f, 'F14')]).toEqual(['Saldo Conta', null]);
    expect([valor(f, 'D16'), valor(f, 'E16'), valor(f, 'F16'), formula(f, 'F16')]).toEqual(['Falta', 'Total', 0, undefined]);
    expect([valor(f, 'E17'), valor(f, 'F17'), formula(f, 'F17')]).toEqual(['Previsão', null, undefined]);
    expect([valor(f, 'H16'), valor(f, 'I16')]).toEqual(['Total', 0]);
    expect([valor(f, 'K16'), valor(f, 'K17'), valor(f, 'L17')]).toEqual(['Total a pagar', 'Total', 0]);
  });

  it('título e blocos em células unidas, com o estilo em todas as células do grupo', () => {
    expect(folha.unidas).toEqual([
      'B3:C4',
      'E5:F5', 'E6:F6',
      'H5:I5', 'H6:I6',
      'K5:L5', 'K6:L6',
      'N5:O5', 'N6:O6',
      'Q5:R5', 'Q6:R6',
    ]);
    // As bordas de um grupo unido são as de cada célula
    expect(em(folha, 'F5')).toEqual({ valor: null, estilo: estilo(folha, 'E5') });
    expect(em(folha, 'C4')).toEqual({ valor: null, estilo: estilo(folha, 'B3') });
    expect(folha.larguras).toHaveLength(18);
    expect(folha.alturas).toEqual({ 5: 18 });
  });

  it('formulaSoma junta as linhas seguidas em intervalos', () => {
    expect(formulaSoma('F', [])).toBeUndefined();
    expect(formulaSoma('F', [10])).toBe('SUM(F10)');
    expect(formulaSoma('F', [10, 11, 12, 14, 16, 17])).toBe('SUM(F10:F12,F14,F16:F17)');
  });
});

describe('livro com uma folha por mês', () => {
  it('por ordem cronológica, com o nome de cada mês', () => {
    const livro = criarLivroExcel([outubro, vazio('2026-08'), vazio('2025-12'), vazio('2026-09')]);
    expect(livro.map((f) => f.nome)).toEqual(['Dezembro 2025', 'Agosto 2026', 'Setembro 2026', 'Outubro 2026']);
    expect(livro.map((f) => valor(f, 'B3'))).toEqual(['Dezembro 2025', 'Agosto 2026', 'Setembro 2026', 'Outubro 2026']);
  });

  it('nomes de folha sem repetidos', () => {
    const livro = criarLivroExcel([vazio('2026-10'), outubro]);
    expect(livro.map((f) => f.nome)).toEqual(['Outubro 2026', 'Outubro 2026 (2)']);
  });

  it('no ficheiro: cores, bordas, formato em euros, células unidas e fórmulas com o resultado em cache', () => {
    const partes = abrir(gerarXlsx(criarLivroExcel([outubro, vazio('2026-09')])));
    expect(nomesDasFolhas(partes['xl/workbook.xml'])).toEqual(['Setembro 2026', 'Outubro 2026']);

    const estilos = partes['xl/styles.xml'];
    for (const cor of [CORES.lucro, CORES.despesas, CORES.poupanca, CORES.despesasMes, CORES.anual, CORES.titulo, CORES.resultado, CORES.saldo, CORES.aPagar]) {
      expect(estilos).toContain(`<fgColor rgb="FF${cor}"/>`);
    }
    expect(estilos).toContain('<border><left style="thin"><color rgb="FF000000"/></left><right style="thin">');
    expect(estilos).toContain('formatCode="_-[$€-2]\\ * #,##0.00_-;\\-[$€-2]\\ * #,##0.00_-;_-[$€-2]\\ * &quot;-&quot;??_-;_-@_-"');
    expect(estilos).toContain('<sz val="20"/><name val="Arial"/>');
    expect(estilos).toContain('<b/><sz val="14"/><color rgb="FFFF0000"/><name val="Arial"/>');
    // Cada fundo uma só vez, apesar de usado em muitas células
    expect(estilos.match(new RegExp(`FF${CORES.despesasMes}`, 'g'))).toHaveLength(1);

    const folha = partes['xl/worksheets/sheet2.xml'];
    expect(folha).toContain('<mergeCell ref="B3:C4"/>');
    expect(folha).toContain('<mergeCell ref="Q6:R6"/>');
    expect(folha).toMatch(/<c r="H6" s="\d+"><f>SUM\(I10:I12\)<\/f><v>680.1<\/v><\/c>/);
    expect(folha).toMatch(/<c r="I16" s="\d+"><f>E6-H6<\/f><v>819.9<\/v><\/c>/);
    expect(folha).toMatch(/<c r="F24" s="\d+"><f>F19-F23<\/f><v>819.9<\/v><\/c>/);
    expect(folha).toContain('<row r="5" ht="18" customHeight="1">');
  });
});

// Os dados de cada mês vêm da API (falsa aqui; os meses com dados e o saldo são testados na API:
// backend/tests/Financas.Services.Tests/FolhaMesTests.cs)
describe('exportar para Excel', () => {
  const guardar = guardarFicheiro as jest.MockedFunction<typeof guardarFicheiro>;
  const UID = 'exportar';
  let api: ApiFalsa;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 5, 12));
    guardar.mockClear();
    api = instalarApiFalsa();
    // Uma renda de 600 € (dia 1) desde agosto, com 1000 € na conta: em outubro já foi debitada
    api.responder('GET', '/api/conta/saldo', { saldo: 400 });
    api.responder('GET', '/api/folha/meses', ['2026-08', '2026-09', '2026-10']);
    for (const mes of ['2026-08', '2026-09']) {
      api.responder('GET', `/api/folha/${mes}`, { ...vazio(mes), despesas: [{ titulo: 'Renda', valor: 600 }] });
    }
    api.responder('GET', '/api/folha/2026-10', { ...vazio('2026-10'), despesas: [{ titulo: 'Renda', valor: 600 }], saldoConta: 400 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('um livro com os meses desde o primeiro com dados até ao atual, a abrir no mês atual', async () => {
    await exportarParaExcel(UID);

    expect(guardar).toHaveBeenCalledTimes(1);
    const [bytes, nome, mime, opcoes] = guardar.mock.calls[0];
    expect(nome).toBe('financas-2026-10-05.xlsx');
    expect(mime).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(opcoes).toEqual({ modo: 'descarregar', titulo: 'Exportar para Excel', uti: 'org.openxmlformats.spreadsheetml.sheet' });

    const partes = abrir(bytes);
    expect(nomesDasFolhas(partes['xl/workbook.xml'])).toEqual(['Agosto 2026', 'Setembro 2026', 'Outubro 2026']);
    expect(partes['xl/workbook.xml']).toContain('<workbookView activeTab="2"/>');
    // O saldo foi atualizado antes de exportar: a renda (dia 1) já foi debitada.
    // Outubro: 1 linha no bloco mais comprido -> Sobra na linha 12 e Saldo Conta na 15
    expect(partes['xl/worksheets/sheet3.xml']).toMatch(/<c r="F15" s="\d+"><v>400<\/v><\/c>/);
    // Primeiro o saldo (que processa o salário e os débitos), depois os meses
    expect(api.pedidos.map((p) => p.caminho)).toEqual([
      '/api/conta/saldo',
      '/api/folha/meses',
      '/api/folha/2026-08',
      '/api/folha/2026-09',
      '/api/folha/2026-10',
    ]);
  });

  it('só os meses pedidos', async () => {
    await exportarParaExcel(UID, ['2026-09']);

    const partes = abrir(guardar.mock.calls[0][0]);
    expect(nomesDasFolhas(partes['xl/workbook.xml'])).toEqual(['Setembro 2026']);
  });
});
