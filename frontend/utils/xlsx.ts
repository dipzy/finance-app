import { strToU8, zipSync } from 'fflate';

// Gerador mínimo de ficheiros .xlsx (Office Open XML).
// Escrito à mão para funcionar igual na web e no telemóvel sem dependências pesadas:
// um .xlsx é só um zip com alguns ficheiros XML.
//
// Formatação: cada célula pode ter um Estilo (tipo de letra, preenchimento, bordas, formato de número,
// alinhamento). Os estilos repetidos são guardados uma só vez em styles.xml, como faz o Excel.

// Formatos de número
export const FORMATOS = {
  euro: '#,##0.00 "€"',
  // "Contabilidade" em euros, igual ao do livro Excel do utilizador:
  // símbolo à esquerda, valores alinhados à direita e "-" no lugar do zero
  euroContabilidade: '_-[$€-2]\\ * #,##0.00_-;\\-[$€-2]\\ * #,##0.00_-;_-[$€-2]\\ * "-"??_-;_-@_-',
  data: 'dd/mm/yyyy',
} as const;

// Linhas finas pretas em cada lado
export interface Bordas {
  esquerda?: boolean;
  direita?: boolean;
  cima?: boolean;
  baixo?: boolean;
}

export interface Estilo {
  negrito?: boolean;
  italico?: boolean;
  tamanho?: number; // pontos (por defeito 11)
  cor?: string; // cor do texto em RGB ("FF0000")
  tipoLetra?: string; // por defeito Calibri
  fundo?: string; // preenchimento sólido em RGB ("E2EFDA")
  bordas?: boolean | Bordas; // true = os quatro lados
  formato?: string; // formato de número (ver FORMATOS)
  horizontal?: 'left' | 'center' | 'right';
  vertical?: 'top' | 'center' | 'bottom';
  quebrarTexto?: boolean;
}

// Estilos com nome (os das primeiras versões, continuam a funcionar)
export type EstiloCelula = 'negrito' | 'euro' | 'euroNegrito' | 'data';

export const ESTILOS: Record<EstiloCelula, Estilo> = {
  negrito: { negrito: true },
  euro: { formato: FORMATOS.euro },
  euroNegrito: { negrito: true, formato: FORMATOS.euro },
  data: { formato: FORMATOS.data },
};

export interface CelulaFormatada {
  // null: célula vazia só com o estilo (ex.: bordas e fundo das outras células de um grupo unido)
  valor: string | number | Date | null;
  estilo?: EstiloCelula | Estilo;
  // Fórmula Excel sem "=" (ex.: "SUM(B2:B5)"); `valor` fica como resultado em cache
  formula?: string;
}

export type Celula = string | number | null | CelulaFormatada;

export interface Folha {
  nome: string;
  larguras?: number[]; // largura de cada coluna, a partir da A (em caracteres)
  alturas?: Record<number, number>; // altura em pontos por n.º de linha (1 = primeira)
  unidas?: string[]; // grupos de células unidas, ex.: "B3:C4"
  linhas: Celula[][];
}

export interface OpcoesLivro {
  folhaAtiva?: number; // índice da folha que aparece ao abrir (por defeito a primeira)
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

function escaparXml(texto: string): string {
  return texto
    // Caracteres de controlo não são permitidos em XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 0 -> A, 25 -> Z, 26 -> AA
export function letraColuna(indice: number): string {
  let letra = '';
  for (let n = indice + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letra = String.fromCharCode(65 + ((n - 1) % 26)) + letra;
  }
  return letra;
}

// O Excel guarda datas como número de dias desde 30/12/1899
function serialData(data: Date): number {
  return (Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;
}

// "e2efda" / "#E2EFDA" -> "FFE2EFDA" (o Excel guarda as cores com a opacidade à frente)
function corArgb(cor: string): string {
  const hex = cor.replace(/^#/, '').toUpperCase();
  return hex.length === 6 ? `FF${hex}` : hex;
}

// ---- styles.xml ----

// Lista sem repetidos: o mesmo XML devolve sempre a mesma posição
class Registo {
  private posicoes = new Map<string, number>();
  readonly itens: string[] = [];

  constructor(iniciais: string[] = []) {
    iniciais.forEach((xml) => this.posicao(xml));
  }

  posicao(xml: string): number {
    let i = this.posicoes.get(xml);
    if (i === undefined) {
      i = this.itens.push(xml) - 1;
      this.posicoes.set(xml, i);
    }
    return i;
  }

  xml(etiqueta: string): string {
    return `<${etiqueta} count="${this.itens.length}">${this.itens.join('')}</${etiqueta}>`;
  }
}

const FONTE_PADRAO: Required<Pick<Estilo, 'tamanho' | 'tipoLetra'>> = { tamanho: 11, tipoLetra: 'Calibri' };

function fonteXml(e: Estilo): string {
  return (
    '<font>' +
    (e.negrito ? '<b/>' : '') +
    (e.italico ? '<i/>' : '') +
    `<sz val="${e.tamanho ?? FONTE_PADRAO.tamanho}"/>` +
    (e.cor ? `<color rgb="${corArgb(e.cor)}"/>` : '') +
    `<name val="${escaparXml(e.tipoLetra ?? FONTE_PADRAO.tipoLetra)}"/><family val="2"/>` +
    '</font>'
  );
}

function fundoXml(fundo: string | undefined): string {
  return fundo
    ? `<fill><patternFill patternType="solid"><fgColor rgb="${corArgb(fundo)}"/><bgColor indexed="64"/></patternFill></fill>`
    : '<fill><patternFill patternType="none"/></fill>';
}

function bordasXml(bordas: Estilo['bordas']): string {
  const b: Bordas = bordas === true ? { esquerda: true, direita: true, cima: true, baixo: true } : bordas || {};
  const lado = (etiqueta: string, ativo?: boolean) =>
    ativo ? `<${etiqueta} style="thin"><color rgb="FF000000"/></${etiqueta}>` : `<${etiqueta}/>`;
  // A ordem dos lados é obrigatória no XML
  return `<border>${lado('left', b.esquerda)}${lado('right', b.direita)}${lado('top', b.cima)}${lado('bottom', b.baixo)}<diagonal/></border>`;
}

class Estilos {
  private fontes = new Registo([fonteXml({})]);
  // As duas primeiras são obrigatórias (e reservadas pelo Excel)
  private fundos = new Registo([fundoXml(undefined), '<fill><patternFill patternType="gray125"/></fill>']);
  private bordas = new Registo([bordasXml(undefined)]);
  private formatos = new Map<string, number>();
  private xfs = new Registo(['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']);

  constructor() {
    // Os estilos com nome ficam sempre nas posições 1 a 4 (negrito, euro, euroNegrito, data)
    (Object.keys(ESTILOS) as EstiloCelula[]).forEach((nome) => this.posicao(ESTILOS[nome]));
  }

  private formato(codigo: string | undefined): number {
    if (!codigo || codigo === 'General') return 0;
    let id = this.formatos.get(codigo);
    if (id === undefined) {
      // Os formatos próprios começam no 164 (os anteriores são do Excel)
      id = 164 + this.formatos.size;
      this.formatos.set(codigo, id);
    }
    return id;
  }

  posicao(estilo: EstiloCelula | Estilo | undefined): number {
    if (!estilo) return 0;
    const e = typeof estilo === 'string' ? ESTILOS[estilo] : estilo;
    const numFmtId = this.formato(e.formato);
    const fontId = this.fontes.posicao(fonteXml(e));
    const fillId = this.fundos.posicao(fundoXml(e.fundo));
    const borderId = this.bordas.posicao(bordasXml(e.bordas));
    const alinhamento =
      e.horizontal || e.vertical || e.quebrarTexto
        ? '<alignment' +
          (e.horizontal ? ` horizontal="${e.horizontal}"` : '') +
          (e.vertical ? ` vertical="${e.vertical}"` : '') +
          (e.quebrarTexto ? ' wrapText="1"' : '') +
          '/>'
        : '';
    const aplicar =
      (numFmtId ? ' applyNumberFormat="1"' : '') +
      (fontId ? ' applyFont="1"' : '') +
      (fillId ? ' applyFill="1"' : '') +
      (borderId ? ' applyBorder="1"' : '') +
      (alinhamento ? ' applyAlignment="1"' : '');
    const atributos = `numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${aplicar}`;
    return this.xfs.posicao(alinhamento ? `<xf ${atributos}>${alinhamento}</xf>` : `<xf ${atributos}/>`);
  }

  xml(): string {
    const numFmts = [...this.formatos]
      .map(([codigo, id]) => `<numFmt numFmtId="${id}" formatCode="${escaparXml(codigo)}"/>`)
      .join('');
    return (
      `${XML_HEADER}<styleSheet xmlns="${NS_MAIN}">` +
      (numFmts ? `<numFmts count="${this.formatos.size}">${numFmts}</numFmts>` : '') +
      this.fontes.xml('fonts') +
      this.fundos.xml('fills') +
      this.bordas.xml('borders') +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      this.xfs.xml('cellXfs') +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

// ---- Folhas ----

function celulaXml(celula: Celula, ref: string, estilos: Estilos): string {
  if (celula === null || celula === '') return '';
  const c: CelulaFormatada = typeof celula === 'object' ? celula : { valor: celula };
  if ((c.valor === null || c.valor === '') && !c.estilo && !c.formula) return '';
  const s = estilos.posicao(c.estilo);
  const estilo = s ? ` s="${s}"` : '';
  const formula = c.formula ? `<f>${escaparXml(c.formula)}</f>` : '';

  if (c.valor instanceof Date) {
    return `<c r="${ref}"${estilo}>${formula}<v>${serialData(c.valor)}</v></c>`;
  }
  if (typeof c.valor === 'number') {
    return `<c r="${ref}"${estilo}>${formula}<v>${Number.isFinite(c.valor) ? c.valor : 0}</v></c>`;
  }
  if (c.valor === null || c.valor === '') {
    return formula ? `<c r="${ref}"${estilo}>${formula}</c>` : `<c r="${ref}"${estilo}/>`;
  }
  if (formula) {
    // Fórmula com resultado em texto
    return `<c r="${ref}"${estilo} t="str">${formula}<v>${escaparXml(c.valor)}</v></c>`;
  }
  return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${escaparXml(c.valor)}</t></is></c>`;
}

function folhaXml(folha: Folha, estilos: Estilos, ativa: boolean): string {
  const vista = `<sheetViews><sheetView${ativa ? ' tabSelected="1"' : ''} workbookViewId="0"/></sheetViews>`;
  const colunas = folha.larguras?.length
    ? '<cols>' +
      folha.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') +
      '</cols>'
    : '';
  const alturas = folha.alturas ?? {};
  const nLinhas = Math.max(folha.linhas.length, ...Object.keys(alturas).map(Number));
  let linhas = '';
  for (let i = 0; i < nLinhas; i++) {
    const r = i + 1;
    // Array.from também percorre as posições vazias de listas esparsas
    const celulas = Array.from(folha.linhas[i] ?? [], (c, j) => celulaXml(c ?? null, `${letraColuna(j)}${r}`, estilos)).join('');
    const altura = alturas[r];
    if (!celulas && !altura) continue;
    linhas += `<row r="${r}"${altura ? ` ht="${altura}" customHeight="1"` : ''}>${celulas}</row>`;
  }
  const unidas = folha.unidas?.length
    ? `<mergeCells count="${folha.unidas.length}">${folha.unidas.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
    : '';
  return `${XML_HEADER}<worksheet xmlns="${NS_MAIN}">${vista}${colunas}<sheetData>${linhas}</sheetData>${unidas}</worksheet>`;
}

// Nomes de folha válidos: máximo 31 caracteres, sem []:*?/\ e sem repetidos
// (o Excel não distingue maiúsculas: "Abril" e "ABRIL" são o mesmo nome)
export function nomesFolhas(nomes: string[]): string[] {
  const usados = new Set<string>();
  return nomes.map((original) => {
    const base = original.replace(/[[\]:*?/\\]/g, '').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Folha';
    let nome = base;
    for (let n = 2; usados.has(nome.toLowerCase()); n++) {
      const sufixo = ` (${n})`;
      nome = base.slice(0, 31 - sufixo.length) + sufixo;
    }
    usados.add(nome.toLowerCase());
    return nome;
  });
}

export function gerarXlsx(folhasPedidas: Folha[], opcoes: OpcoesLivro = {}): Uint8Array {
  // Um livro sem folhas não abre no Excel
  const folhas = folhasPedidas.length ? folhasPedidas : [{ nome: 'Folha1', linhas: [] }];
  const n = folhas.length;
  const ativa = Math.min(Math.max(opcoes.folhaAtiva ?? 0, 0), n - 1);
  const nomes = nomesFolhas(folhas.map((f) => f.nome));
  const estilos = new Estilos();
  // As folhas primeiro: os estilos ficam registados à medida que são usados
  const folhasXml = folhas.map((f, i) => folhaXml(f, estilos, i === ativa));

  const contentTypes =
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    folhas
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('') +
    '</Types>';

  const rels =
    `${XML_HEADER}<Relationships xmlns="${NS_PKG_REL}">` +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    '</Relationships>';

  const workbook =
    `${XML_HEADER}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<bookViews><workbookView activeTab="${ativa}"/></bookViews><sheets>` +
    nomes.map((nome, i) => `<sheet name="${escaparXml(nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    // Recalcular as fórmulas ao abrir
    '</sheets><calcPr fullCalcOnLoad="1"/></workbook>';

  const workbookRels =
    `${XML_HEADER}<Relationships xmlns="${NS_PKG_REL}">` +
    folhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${n + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
    '</Relationships>';

  const ficheiros: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/styles.xml': strToU8(estilos.xml()),
  };
  folhasXml.forEach((xml, i) => {
    ficheiros[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml);
  });

  return zipSync(ficheiros, { level: 6 });
}
