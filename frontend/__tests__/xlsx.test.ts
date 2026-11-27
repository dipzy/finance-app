import { strFromU8, unzipSync } from 'fflate';
import { Celula, Estilo, Folha, FORMATOS, gerarXlsx, nomesFolhas } from '../utils/xlsx';

function abrir(folhas: Folha[], folhaAtiva?: number) {
  const ficheiros = unzipSync(gerarXlsx(folhas, { folhaAtiva }));
  return Object.fromEntries(Object.entries(ficheiros).map(([nome, bytes]) => [nome, strFromU8(bytes)]));
}

const folha1 = (linhas: Celula[][], extra: Partial<Folha> = {}) =>
  abrir([{ nome: 'Teste', linhas, ...extra }])['xl/worksheets/sheet1.xml'];

// Posição (atributo s) de uma célula na folha
const estiloDe = (xml: string, ref: string) => Number((xml.match(new RegExp(`<c r="${ref}" s="(\\d+)"`)) ?? [])[1] ?? 0);

describe('gerador de .xlsx', () => {
  it('cria as partes obrigatórias de um ficheiro Excel', () => {
    const partes = abrir([{ nome: 'A', linhas: [['x']] }, { nome: 'B', linhas: [] }]);
    expect(Object.keys(partes).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
    expect(partes['xl/workbook.xml']).toContain('<calcPr fullCalcOnLoad="1"/>');
  });

  it('escapa texto, guarda números, fórmulas e datas', () => {
    const linha: Celula[] = [
      'Luz & Gás <casa> "x"',
      { valor: 12.5, estilo: 'euro', formula: 'SUM(A1:A2)' },
      { valor: new Date(2026, 9, 2), estilo: 'data' },
    ];
    const folha = folha1([linha]);
    expect(folha).toContain('Luz &amp; Gás &lt;casa&gt; &quot;x&quot;');
    expect(folha).toContain('<c r="B1" s="2"><f>SUM(A1:A2)</f><v>12.5</v></c>');
    expect(folha).toContain('<c r="C1" s="4"><v>46297</v></c>'); // 02/10/2026 em número de série do Excel
  });

  it('nomeia colunas depois do Z (AA, AB...)', () => {
    const folha = folha1([Array.from({ length: 28 }, (_, i) => i)]);
    expect(folha).toContain('r="Z1"');
    expect(folha).toContain('r="AA1"');
    expect(folha).toContain('r="AB1"');
  });

  it('células vazias com estilo, fórmulas com texto e listas esparsas', () => {
    const esparsa: Celula[] = [];
    esparsa[3] = 'D';
    const folha = folha1([[{ valor: null, estilo: { bordas: true } }, null, { valor: 'sim', formula: 'IF(1,"sim","não")' }], [], esparsa]);
    expect(folha).toMatch(/<c r="A1" s="\d+"\/>/);
    expect(folha).not.toContain('r="B1"');
    expect(folha).toContain('<c r="C1" t="str"><f>IF(1,&quot;sim&quot;,&quot;não&quot;)</f><v>sim</v></c>');
    expect(folha).not.toContain('<row r="2"');
    expect(folha).toContain('<row r="3"><c r="D3" t="inlineStr">');
  });
});

describe('formatação', () => {
  const azul: Estilo = { fundo: '8EA9DB', bordas: true, tamanho: 14, tipoLetra: 'Arial', horizontal: 'center' };

  it('estilos iguais ficam uma só vez em styles.xml', () => {
    const partes = abrir([
      { nome: 'A', linhas: [[{ valor: 'x', estilo: { ...azul } }, { valor: 'y', estilo: { ...azul } }, { valor: 'z', estilo: { ...azul, negrito: true } }]] },
      { nome: 'B', linhas: [[{ valor: 'w', estilo: { ...azul } }]] },
    ]);
    const [a, b, estilos] = [partes['xl/worksheets/sheet1.xml'], partes['xl/worksheets/sheet2.xml'], partes['xl/styles.xml']];
    expect(estiloDe(a, 'A1')).toBeGreaterThan(4); // depois dos estilos com nome
    expect(estiloDe(a, 'B1')).toBe(estiloDe(a, 'A1'));
    expect(estiloDe(b, 'A1')).toBe(estiloDe(a, 'A1'));
    expect(estiloDe(a, 'C1')).not.toBe(estiloDe(a, 'A1'));
    // O mesmo fundo e as mesmas bordas servem os dois estilos
    expect(estilos.match(/FF8EA9DB/g)).toHaveLength(1);
    expect(estilos).toContain('<cellXfs count="7">'); // padrão + 4 com nome + 2
    expect(estilos).toContain('<fills count="3">');
    expect(estilos).toContain('<borders count="2">');
  });

  it('tipo de letra, preenchimento, bordas por lado, formato e alinhamento', () => {
    const estilos = abrir([
      {
        nome: 'A',
        linhas: [[
          { valor: 1, estilo: { negrito: true, italico: true, tamanho: 20, cor: 'ff0000', tipoLetra: 'Arial', fundo: '#e2efda' } },
          { valor: 2, estilo: { bordas: { esquerda: true, baixo: true }, formato: FORMATOS.euroContabilidade } },
          { valor: 'z', estilo: { horizontal: 'center', vertical: 'center', quebrarTexto: true } },
        ]],
      },
    ])['xl/styles.xml'];
    expect(estilos).toContain('<font><b/><i/><sz val="20"/><color rgb="FFFF0000"/><name val="Arial"/><family val="2"/></font>');
    expect(estilos).toContain('<fill><patternFill patternType="solid"><fgColor rgb="FFE2EFDA"/><bgColor indexed="64"/></patternFill></fill>');
    expect(estilos).toContain(
      '<border><left style="thin"><color rgb="FF000000"/></left><right/><top/><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>'
    );
    // Formato "Contabilidade" em euros, igual ao do livro do utilizador
    expect(estilos).toContain('formatCode="_-[$€-2]\\ * #,##0.00_-;\\-[$€-2]\\ * #,##0.00_-;_-[$€-2]\\ * &quot;-&quot;??_-;_-@_-"');
    expect(estilos).toMatch(/<xf numFmtId="166" fontId="0" fillId="0" borderId="\d" xfId="0" applyNumberFormat="1" applyBorder="1"\/>/);
    expect(estilos).toContain('<alignment horizontal="center" vertical="center" wrapText="1"/>');
  });

  it('células unidas, larguras das colunas e alturas das linhas', () => {
    const folha = folha1([[], [], ['Título']], { larguras: [8, 20], alturas: { 3: 18, 5: 30 }, unidas: ['A3:B4', 'D3:E3'] });
    expect(folha).toContain('<cols><col min="1" max="1" width="8" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/></cols>');
    expect(folha).toContain('<row r="3" ht="18" customHeight="1">');
    expect(folha).toContain('<row r="5" ht="30" customHeight="1"></row>');
    expect(folha).toContain('<mergeCells count="2"><mergeCell ref="A3:B4"/><mergeCell ref="D3:E3"/></mergeCells>');
    // As células unidas vêm depois dos dados
    expect(folha.indexOf('</sheetData>')).toBeLessThan(folha.indexOf('<mergeCells'));
  });
});

describe('livro', () => {
  it('nomes de folhas válidos e sem repetidos', () => {
    expect(nomesFolhas(['Abril 2026', 'ABRIL 2026', 'Contas: a/b', 'x'.repeat(40), '', 'x'.repeat(40)])).toEqual([
      'Abril 2026',
      'ABRIL 2026 (2)',
      'Contas ab',
      'x'.repeat(31),
      'Folha',
      `${'x'.repeat(27)} (2)`,
    ]);
  });

  it('abre na folha pedida', () => {
    const partes = abrir([{ nome: 'A', linhas: [] }, { nome: 'B', linhas: [] }], 1);
    expect(partes['xl/workbook.xml']).toContain('<workbookView activeTab="1"/>');
    expect(partes['xl/worksheets/sheet1.xml']).toContain('<sheetView workbookViewId="0"/>');
    expect(partes['xl/worksheets/sheet2.xml']).toContain('<sheetView tabSelected="1" workbookViewId="0"/>');
  });

  it('um livro sem folhas ainda tem uma (o Excel não abre livros vazios)', () => {
    const partes = abrir([]);
    expect(partes['xl/workbook.xml']).toContain('<sheet name="Folha1" sheetId="1" r:id="rId1"/>');
    expect(partes['xl/worksheets/sheet1.xml']).toBeDefined();
  });
});
