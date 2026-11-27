jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));

import { strToU8, zipSync } from 'fflate';
import { importarFolhaMes } from '../services/folhaMes';
import {
  analisarFolhaMes,
  linhaInformativa,
  lerFolhaMes,
  listarFolhas,
  sugerirMes,
  totalLinhas,
} from '../services/importarExcel';
import { instalarApiFalsa } from '../test-utils/apiFalsa';
import { celulasMes, ESPERADO, folha, livroDeTeste } from '../test-utils/livroExcel';
import { gerarXlsx } from '../utils/xlsx';

const livro = livroDeTeste();

describe('ler uma folha do mês', () => {
  it('lista as folhas do livro', () => {
    expect(listarFolhas(livro)).toEqual(['Março Ana', 'Abril Ana', 'Notas']);
  });

  it('lê todos os blocos pelos títulos, com fórmulas, números em texto e células vazias', () => {
    const leitura = analisarFolhaMes(livro, 'Março Ana', '2026-03');
    expect(leitura.dados).toEqual({ mes: '2026-03', ...ESPERADO });
    expect(leitura.encontrados).toHaveLength(9);
    expect(leitura.avisos).toEqual(['Despesas do Mês: valor de 7,00 € sem nome na linha 15 (não foi lido)']);
  });

  it('encontra os blocos quando as linhas mudam de sítio', () => {
    expect(lerFolhaMes(livro, 'Abril Ana', '2026-04')).toEqual({ mes: '2026-04', ...ESPERADO });
  });

  it('aceita títulos sem acentos, em maiúsculas e "Saldo Conta" bem escrito', () => {
    const bytes = gerarXlsx([
      folha(
        'Maio',
        celulasMes(1, { lucro: 'LUCRO', poupanca: 'Poupanca', despesasMes: 'Despesas do mes', anual: 'anual ', saldoConta: 'Saldo Conta:' })
      ),
    ]);
    expect(lerFolhaMes(bytes, 'Maio', '2026-05')).toEqual({ mes: '2026-05', ...ESPERADO });
  });

  it('uma folha sem os blocos fica vazia e diz o que não encontrou', () => {
    const leitura = analisarFolhaMes(livro, 'Notas', '2026-03');
    expect(leitura.encontrados).toEqual([]);
    expect(leitura.dados).toEqual({
      mes: '2026-03', lucro: [], despesas: [], poupanca: [], despesasMes: [], anual: [],
      saldoConta: undefined, falta: [], saldoPoupanca: [], totalAPagar: [],
    });
  });

  it('bloco vazio, bloco sem cabeçalho "Categoria | Valor" e coluna de datas', () => {
    const bytes = gerarXlsx([
      folha('Junho', {
        E5: 'Lucro', H5: 'Despesas', N5: 'Despesas do Mês',
        E6: 1000, H6: 50, N6: 0,
        // Despesas sem cabeçalho: as linhas começam no primeiro nome
        H8: 'Ginásio', I8: 30, H9: 'Telemóvel', I9: '20',
        // Lucro sem linhas e "Total" logo a seguir
        E9: 'Categoria', F9: 'Valor', E11: 'Total', F11: 0,
        N9: 'Categoria', O9: 'Valor', P9: 'Data',
        N10: 'Farmácia', O10: 9.9, P10: { valor: new Date(2026, 5, 12), estilo: 'data' },
        N11: 'Café', O11: 1.2, P11: '03/06/2026',
        N12: 'Livro', O12: 15, P12: 20, // só o dia
        N13: 'Bilhete', O13: 4, P13: { valor: new Date(2026, 4, 30), estilo: 'data' }, // de outro mês
        N16: 'Total', O16: 30.1,
        E20: 'Saldo da conta', E21: '1.234,56', // valor por baixo do título
      }),
    ]);
    const leitura = analisarFolhaMes(bytes, 'Junho', '2026-06');
    expect(leitura.dados.lucro).toEqual([]);
    expect(leitura.dados.despesas).toEqual([{ titulo: 'Ginásio', valor: 30 }, { titulo: 'Telemóvel', valor: 20 }]);
    expect(leitura.dados.despesasMes).toEqual([
      { titulo: 'Farmácia', valor: 9.9, data: '2026-06-12' },
      { titulo: 'Café', valor: 1.2, data: '2026-06-03' },
      { titulo: 'Livro', valor: 15, data: '2026-06-20' },
      { titulo: 'Bilhete', valor: 4 },
    ]);
    expect(leitura.avisos).toEqual(['Despesas do Mês: "Bilhete" tem uma data fora do mês escolhido (fica sem data)']);
    expect(leitura.dados.saldoConta).toBe(1234.56);
    expect(leitura.encontrados).toEqual(['lucro', 'despesas', 'despesasMes', 'saldoConta']);
  });

  it('lê um livro gravado pelo Excel, com textos partilhados e formatação mista', () => {
    const textos = [
      '<si><t>Lucro</t></si>', // 0
      // "Despesas do Mês" com a palavra "Mês" a negrito
      '<si><r><t xml:space="preserve">Despesas do </t></r><r><rPr><b/><sz val="11"/></rPr><t>Mês</t></r></si>', // 1
      '<si><t>Categoria</t></si>', // 2
      '<si><t>Valor</t></si>', // 3
      '<si><t>Ordenado</t></si>', // 4
      '<si><r><t>Alimen</t></r><r><rPr><i/></rPr><t>.</t></r></si>', // 5
      '<si><t>Luz &amp; Gás</t></si>', // 6
      '<si><t xml:space="preserve">Salto Conta </t></si>', // 7
      '<si><t>Total</t></si>', // 8
      '<si><t xml:space="preserve"> 18,75 </t></si>', // 9
    ];
    const s = (r: string, i: number) => `<c r="${r}" t="s"><v>${i}</v></c>`;
    const n = (r: string, v: number, f?: string) => `<c r="${r}">${f ? `<f>${f}</f>` : ''}<v>${v}</v></c>`;
    const linhas = [
      `<row r="5">${s('E5', 0)}${s('N5', 1)}</row>`,
      `<row r="6">${n('E6', 1700, 'SUM(F10,F11)')}${n('N6', 31.25, 'SUM(O10:O12)')}</row>`,
      `<row r="9">${s('E9', 2)}${s('F9', 3)}${s('N9', 2)}${s('O9', 3)}</row>`,
      `<row r="10">${s('E10', 4)}${n('F10', 1500)}${s('N10', 6)}${s('O10', 9)}</row>`,
      `<row r="11">${s('E11', 5)}${n('F11', 200)}<c r="N11" t="inlineStr"><is><t>Táxi</t></is></c><c r="O11" t="str"><f>TEXT(12.5,"0.00")</f><v>12.50</v></c></row>`,
      `<row r="12"><c r="N12" t="inlineStr"><is><t>Erro</t></is></c><c r="O12" t="e"><f>1/0</f><v>#DIV/0!</v></c></row>`,
      `<row r="14">${s('N14', 8)}${n('O14', 31.25, 'SUM(O10:O12)')}</row>`,
      `<row r="20">${s('E20', 7)}${n('F20', 640.5, 'F10-500+140.5')}</row>`,
    ];
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const bytes = zipSync(
      Object.fromEntries(
        Object.entries({
          '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
          '_rels/.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
          'xl/workbook.xml': `<workbook ${ns} xmlns:r="${rel}"><sheets><sheet name="Fevereiro Rui" sheetId="4" r:id="rId2"/></sheets></workbook>`,
          'xl/_rels/workbook.xml.rels':
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            `<Relationship Id="rId1" Type="${rel}/sharedStrings" Target="sharedStrings.xml"/>` +
            `<Relationship Id="rId2" Type="${rel}/worksheet" Target="worksheets/sheet4.xml"/></Relationships>`,
          'xl/sharedStrings.xml': `<sst ${ns} count="${textos.length}" uniqueCount="${textos.length}">${textos.join('')}</sst>`,
          'xl/worksheets/sheet4.xml': `<worksheet ${ns}><sheetData>${linhas.join('')}</sheetData></worksheet>`,
        }).map(([nome, xml]) => [nome, strToU8(xml)])
      )
    );

    expect(listarFolhas(bytes)).toEqual(['Fevereiro Rui']);
    const dados = lerFolhaMes(bytes, 'Fevereiro Rui', '2025-02');
    expect(dados.lucro).toEqual([{ titulo: 'Ordenado', valor: 1500 }, { titulo: 'Alimen.', valor: 200, informativo: true }]);
    expect(dados.despesasMes).toEqual([{ titulo: 'Luz & Gás', valor: 18.75 }, { titulo: 'Táxi', valor: 12.5 }]);
    expect(dados.saldoConta).toBe(640.5);
  });
});

describe('totais e linhas informativas', () => {
  it('o cartão de alimentação aparece mas não conta', () => {
    expect(['Alimen.', 'Alimentação', 'Cartão refeição', 'Sub. alimentação'].every(linhaInformativa)).toBe(true);
    expect(linhaInformativa('Ordenado')).toBe(false);
    expect(totalLinhas(ESPERADO.lucro)).toBe(1500);
    expect(totalLinhas(ESPERADO.despesasMes)).toBe(163.45);
  });
});

describe('sugerir o mês pelo nome da folha', () => {
  const hoje = new Date(2026, 9, 2); // 2 de outubro de 2026

  it('nomes dos meses com e sem acentos, sem ano: este ano ou o anterior se ainda não chegou', () => {
    expect(sugerirMes('Abril Ana', hoje)).toBe('2026-04');
    expect(sugerirMes('Outubro Ana', hoje)).toBe('2026-10');
    expect(sugerirMes('Março', hoje)).toBe('2026-03');
    expect(sugerirMes('MARCO', hoje)).toBe('2026-03');
    expect(sugerirMes('Novembro Ana', hoje)).toBe('2025-11');
    expect(sugerirMes('  dezembro ', hoje)).toBe('2025-12');
  });

  it('usa o ano do nome quando existe', () => {
    expect(sugerirMes('Fevereiro 2025', hoje)).toBe('2025-02');
    expect(sugerirMes('Dezembro2027 Ana', hoje)).toBe('2027-12');
    expect(sugerirMes('Set. 2024', hoje)).toBe('2024-09');
  });

  it('abreviaturas e datas em números', () => {
    expect(sugerirMes('Jan', hoje)).toBe('2026-01');
    expect(sugerirMes('out-25', hoje)).toBe('2026-10');
    expect(sugerirMes('2024-07', hoje)).toBe('2024-07');
    expect(sugerirMes('03_2025', hoje)).toBe('2025-03');
  });

  it('sem mês no nome não sugere nada', () => {
    expect(sugerirMes('Folha1', hoje)).toBeNull();
    expect(sugerirMes('Resumo 2026', hoje)).toBeNull();
    expect(sugerirMes('Mariana', hoje)).toBeNull();
    expect(sugerirMes('2026-13', hoje)).toBeNull();
  });
});

// A gravação (despesas criadas, pagamentos, não duplicar ao importar outra vez) é feita e testada
// na API: backend/tests/Financas.Services.Tests/FolhaMesTests.cs, com estes mesmos dados (ESPERADO).
// Aqui confirma-se que a folha lida do Excel vai inteira para a API.
describe('importar a folha lida', () => {
  it('envia para a API os blocos lidos da folha, no mês escolhido', async () => {
    const api = instalarApiFalsa();
    const resumo = { mes: '2026-03', despesasCriadas: ['Renda', 'Internet', 'Luz'], pagamentosRegistados: 3, extrasRegistadas: 4 };
    api.responder('POST', '/api/folha/2026-03/importar', resumo);

    expect(await importarFolhaMes('importar-excel', lerFolhaMes(livro, 'Março Ana', '2026-03'))).toEqual(resumo);

    const { corpo } = api.feitos('POST', '/api/folha/2026-03/importar')[0];
    expect(corpo.opcoes).toEqual({});
    expect(corpo.dados).toEqual({ ...ESPERADO, mes: '2026-03' });
  });
});
