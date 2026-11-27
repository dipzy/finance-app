import { strFromU8, unzipSync } from 'fflate';
import { t } from '../i18n';

// Leitor mínimo de ficheiros .xlsx (Office Open XML), o par de xlsx.ts.
// Sem dependências pesadas nem DOMParser (que não existe no telemóvel): um .xlsx é um zip
// com XML simples e só precisamos dos nomes das folhas e dos valores das células.
// Das fórmulas usa o resultado guardado em cache pelo Excel (<v>), não as recalcula.

export type ValorCelula = string | number | boolean;

export interface CelulaLida {
  ref: string; // "E5"
  linha: number; // 1 = primeira linha (como no Excel)
  coluna: number; // 1 = coluna A
  valor: ValorCelula;
  formula?: string; // texto da fórmula, sem "="
}

export interface Grelha {
  nome: string;
  celulas: CelulaLida[]; // só as que têm valor, por linha e depois por coluna
  ultimaLinha: number;
  ultimaColuna: number;
  celula(linha: number, coluna: number): CelulaLida | undefined;
  valor(linha: number, coluna: number): ValorCelula | undefined;
}

export interface Livro {
  folhas: string[]; // pela ordem dos separadores no Excel
  data1904: boolean; // datas contadas a partir de 1904 (livros antigos do Mac)
  lerFolha(nome: string): Grelha;
}

// "A" -> 1, "Z" -> 26, "AA" -> 27
export function numeroColuna(letras: string): number {
  let n = 0;
  for (const letra of letras.toUpperCase()) {
    n = n * 26 + (letra.charCodeAt(0) - 64);
  }
  return n;
}

// 1 -> "A", 27 -> "AA"
export function letrasColuna(coluna: number): string {
  let letras = '';
  for (let n = coluna; n > 0; n = Math.floor((n - 1) / 26)) {
    letras = String.fromCharCode(65 + ((n - 1) % 26)) + letras;
  }
  return letras;
}

// "E5" -> { linha: 5, coluna: 5 } ("$E$5" também serve)
export function lerRef(ref: string): { linha: number; coluna: number } | null {
  const partes = ref.replace(/\$/g, '').match(/^([A-Za-z]{1,3})(\d+)$/);
  return partes ? { coluna: numeroColuna(partes[1]), linha: Number(partes[2]) } : null;
}

// Número de série do Excel (dias desde 30/12/1899, ou desde 01/01/1904) -> "AAAA-MM-DD"
export function dataDeSerial(serial: number, data1904 = false): string {
  const dias = Math.floor(serial) + (data1904 ? 1462 : 0);
  const data = new Date(Date.UTC(1899, 11, 30) + dias * 86400000);
  return data.toISOString().slice(0, 10);
}

// ---- XML ----

const ENTIDADES: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };

// Entidades XML e os escapes "_x000D_" que o Excel usa para caracteres especiais
function desescapar(texto: string): string {
  return texto
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&(#x[0-9A-Fa-f]+|#\d+|lt|gt|quot|apos|amp);/g, (_, e: string) => {
      if (e[0] === '#') {
        const codigo = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return String.fromCodePoint(codigo);
      }
      return ENTIDADES[e];
    });
}

// Alguns programas escrevem as tags com prefixo (<x:c>, <x:v>): tirar o prefixo simplifica o resto
function semPrefixos(xml: string): string {
  return xml.replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1');
}

function atributos(texto: string): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const m of texto.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    resultado[m[1]] = desescapar(m[2] ?? m[3] ?? '');
  }
  return resultado;
}

// Texto de um <si> ou <is>: junta os pedaços <t> (texto com formatação mista tem vários <r><t>),
// sem a escrita fonética (<rPh>) que o Excel acrescenta em japonês
function textoRico(xml: string): string {
  const semFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let texto = '';
  for (const m of semFonetica.matchAll(/<t(?:\s+[^>]*[^/>])?\s*>([\s\S]*?)<\/t>/g)) {
    texto += m[1];
  }
  return desescapar(texto);
}

// ---- Caminhos dentro do zip ----

function pastaDe(caminho: string): string {
  const i = caminho.lastIndexOf('/');
  return i < 0 ? '' : caminho.slice(0, i);
}

// Alvo de uma relação, relativo à pasta da parte (ou absoluto, se começar por "/")
function resolverCaminho(pasta: string, alvo: string): string {
  const partes = alvo.startsWith('/') ? [] : pasta.split('/').filter(Boolean);
  for (const p of alvo.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') partes.pop();
    else partes.push(p);
  }
  return partes.join('/');
}

function relacoes(ficheiros: Record<string, string>, parte: string) {
  const caminhoRels = `${pastaDe(parte) ? pastaDe(parte) + '/' : ''}_rels/${parte.split('/').pop()}.rels`;
  const xml = ficheiros[caminhoRels] ?? '';
  return [...xml.matchAll(/<Relationship\b([^>]*?)\/?>/g)].map((m) => {
    const a = atributos(m[1]);
    return { id: a.Id ?? '', tipo: a.Type ?? '', alvo: resolverCaminho(pastaDe(parte), a.Target ?? '') };
  });
}

// ---- Livro ----

export function abrirLivro(bytes: Uint8Array): Livro {
  // Os .xls antigos (Excel 97-2003) não são zip: começam pela assinatura D0 CF 11 E0
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new Error(t('Este ficheiro é um .xls antigo. Abre-o no Excel e grava-o como .xlsx.'));
  }

  let ficheiros: Record<string, string>;
  try {
    // Só os XML: imagens e outros anexos não interessam
    const zip = unzipSync(bytes, { filter: (f) => /\.(xml|rels)$/i.test(f.name) });
    ficheiros = Object.fromEntries(Object.entries(zip).map(([nome, conteudo]) => [nome, semPrefixos(strFromU8(conteudo))]));
  } catch {
    throw new Error(t('Não foi possível abrir o ficheiro. Confirma que é um Excel (.xlsx).'));
  }

  // O workbook costuma estar em xl/workbook.xml, mas o caminho certo vem de _rels/.rels
  const principal = relacoes(ficheiros, '').find((r) => r.tipo.endsWith('/officeDocument'));
  const caminhoLivro = principal && ficheiros[principal.alvo] ? principal.alvo : 'xl/workbook.xml';
  const workbook = ficheiros[caminhoLivro];
  if (!workbook) {
    throw new Error(t('Não foi possível abrir o ficheiro. Confirma que é um Excel (.xlsx).'));
  }

  const rels = relacoes(ficheiros, caminhoLivro);
  const caminhoTextos = rels.find((r) => r.tipo.endsWith('/sharedStrings'))?.alvo ?? `${pastaDe(caminhoLivro)}/sharedStrings.xml`;
  const textos = [...(ficheiros[caminhoTextos] ?? '').matchAll(/<si(?:\s+[^>]*[^/>])?\s*>([\s\S]*?)<\/si>|<si\s*\/>/g)].map((m) =>
    textoRico(m[1] ?? '')
  );

  const folhas = [...workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)].map((m) => {
    const a = atributos(m[1]);
    const id = a['r:id'] ?? Object.entries(a).find(([k]) => k.endsWith(':id'))?.[1] ?? '';
    return { nome: a.name ?? '', caminho: rels.find((r) => r.id === id)?.alvo ?? '' };
  });
  const data1904 = /<workbookPr\b[^>]*\bdate1904\s*=\s*["'](1|true)["']/.test(workbook);

  function lerFolha(nome: string): Grelha {
    const folha = folhas.find((f) => f.nome === nome);
    const xml = folha ? ficheiros[folha.caminho] : undefined;
    if (!folha || xml === undefined) {
      throw new Error(
        t('A folha {nomeComAspas} não existe neste ficheiro.', { nomeComAspas: '"' + nome + '"' })
      );
    }
    return lerGrelha(nome, xml, textos);
  }

  return { folhas: folhas.map((f) => f.nome), data1904, lerFolha };
}

function lerGrelha(nome: string, xml: string, textos: string[]): Grelha {
  const dados = xml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/)?.[1] ?? '';
  const celulas: CelulaLida[] = [];

  let linha = 0;
  for (const mLinha of dados.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    // Sem "r" a linha é a seguinte à anterior (o mesmo para as colunas)
    linha = Number(atributos(mLinha[1]).r) || linha + 1;
    let coluna = 0;
    for (const mCelula of (mLinha[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = atributos(mCelula[1]);
      const pos = a.r ? lerRef(a.r) : null;
      coluna = pos?.coluna ?? coluna + 1;
      const corpo = mCelula[2] ?? '';
      // [^/>] antes do ">": uma tag vazia (<f t="shared" si="0"/>) não é o início de uma tag com texto
      const v = corpo.match(/<v(?:\s+[^>]*[^/>])?\s*>([\s\S]*?)<\/v>/)?.[1];
      const f = corpo.match(/<f(?:\s+[^>]*[^/>])?\s*>([\s\S]*?)<\/f>/)?.[1];

      let valor: ValorCelula | undefined;
      switch (a.t) {
        case 's': // texto partilhado (sharedStrings.xml)
          valor = v !== undefined ? textos[Number(v)] : undefined;
          break;
        case 'inlineStr': // texto escrito na própria célula
          valor = textoRico(corpo.match(/<is(?:\s+[^>]*[^/>])?\s*>([\s\S]*?)<\/is>/)?.[1] ?? '');
          break;
        case 'str': // resultado de uma fórmula que dá texto
          valor = v !== undefined ? desescapar(v) : undefined;
          break;
        case 'b':
          valor = v !== undefined ? v.trim() === '1' : undefined;
          break;
        case 'e': // erro (#DIV/0!, #REF!...): fica sem valor
          valor = undefined;
          break;
        case 'd': // data ISO (raro: o Excel guarda datas como números)
          valor = v !== undefined ? desescapar(v) : undefined;
          break;
        default: {
          // número (t="n" ou sem t)
          const numero = v !== undefined && v.trim() !== '' ? Number(v) : NaN;
          valor = Number.isFinite(numero) ? numero : undefined;
        }
      }
      if (valor === undefined) continue;

      const celula: CelulaLida = { ref: `${letrasColuna(coluna)}${linha}`, linha, coluna, valor };
      if (f !== undefined && f.trim()) celula.formula = desescapar(f);
      celulas.push(celula);
    }
  }

  celulas.sort((x, y) => x.linha - y.linha || x.coluna - y.coluna);
  const porPosicao = new Map(celulas.map((c) => [`${c.linha},${c.coluna}`, c]));
  return {
    nome,
    celulas,
    ultimaLinha: celulas.reduce((max, c) => Math.max(max, c.linha), 0),
    ultimaColuna: celulas.reduce((max, c) => Math.max(max, c.coluna), 0),
    celula: (l, c) => porPosicao.get(`${l},${c}`),
    valor: (l, c) => porPosicao.get(`${l},${c}`)?.valor,
  };
}
