import { strToU8, zipSync } from 'fflate';
import { abrirLivro, dataDeSerial, letrasColuna, lerRef, numeroColuna } from '../utils/lerXlsx';
import { gerarXlsx } from '../utils/xlsx';

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const NS_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// Um livro feito à mão, como o Excel os grava: textos partilhados (com formatação mista e
// escrita fonética), ids das folhas fora de ordem, caminhos absolutos e tags com prefixo
function livroFeitoAMao(): Uint8Array {
  const textos = [
    '<si><t>Despesas</t></si>', // 0
    '<si><r><rPr><b/></rPr><t xml:space="preserve">Luz </t></r><r><rPr><i/></rPr><t>&amp; Gás</t></r></si>', // 1
    '<si><t>Renda</t><rPh sb="0" eb="1"><t>れんだ</t></rPh></si>', // 2
    '<si><t xml:space="preserve">  Água  </t></si>', // 3
    '<si/>', // 4
    '<si><t>linha_x000D_dois</t></si>', // 5
    '<si><t>12,50</t></si>', // 6
  ];
  const ficheiros: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="xl/livro.xml" Type="${REL}/officeDocument" Id="rId1"/></Relationships>`,
    'xl/livro.xml':
      `<?xml version="1.0"?><workbook ${NS} ${NS_R}><workbookPr date1904="1"/><sheets>` +
      '<sheet name="Notas &amp; contas" sheetId="7" r:id="rId9"/>' +
      '<sheet r:id="rId3" sheetId="2" name="Fevereiro"/>' +
      '<sheet name="Prefixos" sheetId="3" r:id="rId4"/>' +
      '</sheets></workbook>',
    'xl/_rels/livro.xml.rels':
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId3" Type="${REL}/worksheet" Target="/xl/worksheets/folhaA.xml"/>` +
      `<Relationship Id="rId9" Type="${REL}/worksheet" Target="worksheets/../worksheets/sheet9.xml"/>` +
      `<Relationship Id="rId4" Type="${REL}/worksheet" Target="worksheets/x.xml"/>` +
      `<Relationship Id="rId5" Type="${REL}/sharedStrings" Target="textos.xml"/>` +
      '</Relationships>',
    'xl/textos.xml': `<?xml version="1.0"?><sst ${NS} count="${textos.length}">${textos.join('')}</sst>`,
    'xl/worksheets/folhaA.xml':
      `<?xml version="1.0"?><worksheet ${NS}><cols><col min="1" max="2" width="10"/></cols><sheetData>` +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="1"/></row>' +
      '<row r="3" spans="1:4"><c r="A3" t="s"><v>1</v></c><c r="B3"><f>SUM(B4:B5)</f><v>45.1</v></c></row>' +
      // Células sem "r": a seguir à anterior
      '<row><c t="s"><v>2</v></c><c><v>600</v></c></row>' +
      '<row r="6"><c r="A6" t="s"><v>3</v></c><c r="B6" t="e"><f>1/0</f><v>#DIV/0!</v></c><c r="C6" t="b"><v>1</v></c></row>' +
      '<row r="7"><c r="A7" t="s"><v>4</v></c><c r="B7" t="str"><f>"1"&amp;"2"</f><v>12</v></c><c r="C7"><f t="shared" ref="C7:C8" si="0"/><v>3</v></c></row>' +
      '<row r="8"><c r="A8" t="inlineStr"><is><r><t>Ginás</t></r><r><rPr><b/></rPr><t>io</t></r></is></c><c r="B8" t="s"><v>6</v></c><c r="AA8" t="s"><v>5</v></c></row>' +
      '<row r="9"/>' +
      '</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>',
    'xl/worksheets/sheet9.xml': `<?xml version="1.0"?><worksheet ${NS}><sheetData><row r="2"><c r="C2"><v>1.5</v></c></row></sheetData></worksheet>`,
    'xl/worksheets/x.xml':
      '<?xml version="1.0"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>' +
      '<x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1"><x:v>7</x:v></x:c></x:row>' +
      '</x:sheetData></x:worksheet>',
  };
  return zipSync(Object.fromEntries(Object.entries(ficheiros).map(([nome, xml]) => [nome, strToU8(xml)])));
}

describe('leitor de .xlsx', () => {
  it('converte referências de células', () => {
    expect([numeroColuna('A'), numeroColuna('Z'), numeroColuna('AA'), numeroColuna('ab')]).toEqual([1, 26, 27, 28]);
    expect([letrasColuna(1), letrasColuna(26), letrasColuna(27), letrasColuna(703)]).toEqual(['A', 'Z', 'AA', 'AAA']);
    expect(lerRef('$E$26')).toEqual({ linha: 26, coluna: 5 });
    expect(lerRef('E')).toBeNull();
  });

  it('converte datas do Excel', () => {
    expect(dataDeSerial(46297)).toBe('2026-10-02');
    expect(dataDeSerial(46297.75)).toBe('2026-10-02'); // com horas
    expect(dataDeSerial(44835, true)).toBe('2026-10-02'); // livros com datas a partir de 1904
  });

  it('lê as folhas pela ordem dos separadores, seguindo as relações do livro', () => {
    const livro = abrirLivro(livroFeitoAMao());
    expect(livro.folhas).toEqual(['Notas & contas', 'Fevereiro', 'Prefixos']);
    expect(livro.data1904).toBe(true);
    expect(livro.lerFolha('Notas & contas').valor(2, 3)).toBe(1.5);
  });

  it('lê textos partilhados, texto com formatação mista, fórmulas, booleanos e erros', () => {
    const g = abrirLivro(livroFeitoAMao()).lerFolha('Fevereiro');
    expect(g.valor(1, 1)).toBe('Despesas');
    expect(g.celula(1, 2)).toBeUndefined(); // só formatação, sem valor
    expect(g.valor(3, 1)).toBe('Luz & Gás');
    expect(g.celula(3, 2)).toMatchObject({ ref: 'B3', valor: 45.1, formula: 'SUM(B4:B5)' });
    // Linha e células sem "r"
    expect(g.valor(4, 1)).toBe('Renda'); // sem a escrita fonética
    expect(g.valor(4, 2)).toBe(600);
    expect(g.valor(6, 1)).toBe('  Água  ');
    expect(g.celula(6, 2)).toBeUndefined(); // #DIV/0!
    expect(g.valor(6, 3)).toBe(true);
    expect(g.valor(7, 1)).toBe('');
    expect(g.celula(7, 2)).toMatchObject({ valor: '12', formula: '"1"&"2"' });
    expect(g.celula(7, 3)).toEqual({ ref: 'C7', linha: 7, coluna: 3, valor: 3 }); // fórmula partilhada sem texto
    expect(g.valor(8, 1)).toBe('Ginásio');
    expect(g.valor(8, 2)).toBe('12,50');
    expect(g.valor(8, 27)).toBe('linha\rdois');
    expect([g.ultimaLinha, g.ultimaColuna]).toEqual([8, 27]);
    expect(g.celulas.map((c) => c.ref).slice(0, 4)).toEqual(['A1', 'A3', 'B3', 'A4']);
  });

  it('aceita tags com prefixo de namespace', () => {
    const g = abrirLivro(livroFeitoAMao()).lerFolha('Prefixos');
    expect([g.valor(1, 1), g.valor(1, 2)]).toEqual(['Despesas', 7]);
  });

  it('lê o que o gerador da app escreve (texto na célula, fórmulas e datas)', () => {
    const bytes = gerarXlsx([
      { nome: 'Uma', linhas: [['Título', 'Valor'], ['Luz & Gás <casa>', { valor: 45.1, formula: 'SUM(B3:B4)' }], [{ valor: new Date(2026, 9, 2), estilo: 'data' }]] },
      { nome: 'Duas', linhas: [] },
    ]);
    const livro = abrirLivro(bytes);
    expect(livro.folhas).toEqual(['Uma', 'Duas']);
    const g = livro.lerFolha('Uma');
    expect(g.valor(2, 1)).toBe('Luz & Gás <casa>');
    expect(g.celula(2, 2)).toMatchObject({ valor: 45.1, formula: 'SUM(B3:B4)' });
    expect(dataDeSerial(g.valor(3, 1) as number)).toBe('2026-10-02');
    expect(livro.lerFolha('Duas').celulas).toEqual([]);
  });

  it('dá erros claros para ficheiros que não são .xlsx e folhas que não existem', () => {
    expect(() => abrirLivro(strToU8('isto não é um excel'))).toThrow('Confirma que é um Excel (.xlsx)');
    expect(() => abrirLivro(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toThrow('.xls antigo');
    expect(() => abrirLivro(zipSync({ 'outro.txt': strToU8('x') }))).toThrow('Confirma que é um Excel (.xlsx)');
    expect(() => abrirLivro(livroFeitoAMao()).lerFolha('Março')).toThrow('A folha "Março" não existe');
  });
});
