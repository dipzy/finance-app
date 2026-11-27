import { t } from '../i18n';

// Leitor de extratos de contas bancárias (CSV e OFX), sem rede nem React: recebe o ficheiro e devolve os
// movimentos. A API é que categoriza e grava (services/extratoApi.ts).
//
// Cada banco exporta o seu CSV à sua maneira (separador, vírgula ou ponto nos decimais, linhas de cabeçalho antes
// da tabela, uma coluna de valor com sinal ou duas de débito e crédito...). Por isso o CSV é lido por
// "mapeamento de colunas": a app adivinha quais são a data, a descrição e o valor, e a pessoa corrige se for preciso.

export interface MovimentoLido {
  linha: number; // a linha do ficheiro (1 = a primeira), para ajudar a perceber de onde veio
  data: string; // AAAA-MM-DD
  descricao: string; // limpa, para ser o título da despesa
  original: string; // tal como veio no ficheiro
  valor: number; // negativo = saiu da conta, positivo = entrou
}

export interface Tabela {
  delimitador: string;
  cabecalhos: string[]; // os da linha de cabeçalho (vazios onde faltarem)
  linhas: string[][]; // só as linhas de dados
  primeiraLinha: number; // a linha do ficheiro (1 = a primeira) da primeira linha de dados
}

// Que coluna é cada coisa (índices na linha). Ou "valor" (uma coluna com sinal) ou "debito" e "credito"
export interface Mapeamento {
  data: number;
  descricao: number;
  valor?: number;
  debito?: number;
  credito?: number;
}

export interface LeituraCsv {
  formato: 'csv';
  tabela: Tabela;
  sugestao: Mapeamento | null; // null: não deu para adivinhar
}

export interface LeituraOfx {
  formato: 'ofx';
  movimentos: MovimentoLido[];
  avisos: string[];
}

export interface ResultadoMapeamento {
  movimentos: MovimentoLido[];
  avisos: string[];
}

// ---------------------------------------------------------------------------------------------------------------
// Texto do ficheiro

// UTF-8 estrito (null se os bytes não forem UTF-8 válido), sem TextDecoder (nem todos os motores o têm com 'fatal')
function utf8(bytes: Uint8Array): string | null {
  let texto = '';
  let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let ponto: number;
    let extra: number;
    if (b < 0x80) {
      ponto = b;
      extra = 0;
    } else if (b >= 0xc2 && b < 0xe0) {
      ponto = b & 0x1f;
      extra = 1;
    } else if (b >= 0xe0 && b < 0xf0) {
      ponto = b & 0x0f;
      extra = 2;
    } else if (b >= 0xf0 && b < 0xf5) {
      ponto = b & 0x07;
      extra = 3;
    } else {
      return null;
    }
    for (let k = 1; k <= extra; k++) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return null;
      ponto = (ponto << 6) | (c & 0x3f);
    }
    texto += String.fromCodePoint(ponto);
    i += extra + 1;
  }
  return texto;
}

// Windows-1252 (o que os bancos portugueses usam quando não é UTF-8): igual a Latin-1 exceto 0x80-0x9F
const CP1252: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

export function decodificarTexto(bytes: Uint8Array): string {
  const emUtf8 = utf8(bytes);
  if (emUtf8 !== null) return emUtf8;
  let texto = '';
  for (let i = 0; i < bytes.length; i++) texto += CP1252[bytes[i]] ?? String.fromCharCode(bytes[i]);
  return texto;
}

// ---------------------------------------------------------------------------------------------------------------
// Números e datas

// "1.234,56", "1,234.56", "-12,50", "12,50-", "(12,50)", "€ 12.5", "−3,00" → número (NaN se não for um número)
export function lerNumero(texto: string): number {
  let t = texto.trim().replace(/[€\s ]|EUR/gi, '').replace(/[−–—]/g, '-');
  if (t === '') return NaN;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) {
    negativo = true;
    t = t.slice(1, -1);
  }
  if (t.endsWith('-')) {
    negativo = true;
    t = t.slice(0, -1);
  }
  if (t.startsWith('-')) {
    negativo = !negativo;
    t = t.slice(1);
  } else if (t.startsWith('+')) {
    t = t.slice(1);
  }
  if (!/^\d[\d.,]*$/.test(t)) return NaN;

  const ultimoPonto = t.lastIndexOf('.');
  const ultimaVirgula = t.lastIndexOf(',');
  let decimal: '.' | ',' | null = null;
  if (ultimoPonto >= 0 && ultimaVirgula >= 0) {
    decimal = ultimoPonto > ultimaVirgula ? '.' : ',';
  } else if (ultimaVirgula >= 0) {
    // Só vírgulas: uma vírgula com 1 ou 2 dígitos a seguir é decimal; "1,234" ou "1,234,567" são milhares
    decimal = t.split(',').length === 2 && t.length - ultimaVirgula - 1 <= 2 ? ',' : null;
  } else if (ultimoPonto >= 0) {
    decimal = t.split('.').length === 2 && t.length - ultimoPonto - 1 <= 2 ? '.' : null;
  }
  let limpo: string;
  if (decimal === null) limpo = t.replace(/[.,]/g, '');
  else {
    const milhares = decimal === '.' ? /,/g : /\./g;
    limpo = t.replace(milhares, '').replace(decimal, '.');
  }
  const valor = Number(limpo);
  if (Number.isNaN(valor)) return NaN;
  return negativo ? -valor : valor;
}

const dataValida = (ano: number, mes: number, dia: number): boolean => {
  if (ano < 1990 || ano > 2100 || mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= new Date(ano, mes, 0).getDate();
};

const iso = (ano: number, mes: number, dia: number) => `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

// "05-10-2026", "05/10/2026", "05.10.2026", "2026-10-05", "2026/10/05", "05-10-26", "20261005",
// "2026-10-05 13:45:00", "20261005120000[0:GMT]" → "2026-10-05" (null se não for uma data)
export function lerData(texto: string): string | null {
  const t = texto.trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D.*)?$/);
  if (m && dataValida(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\D.*)?$/);
  if (m && dataValida(+m[3], +m[2], +m[1])) return iso(+m[3], +m[2], +m[1]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m && dataValida(2000 + +m[3], +m[2], +m[1])) return iso(2000 + +m[3], +m[2], +m[1]);
  m = t.match(/^(\d{4})(\d{2})(\d{2})(?:\d{0,6}.*)?$/);
  if (m && dataValida(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Descrição

const PREFIXOS = /^(pagamento compra|compra tpa|compra cart[aã]o|compras?)\s+/i;

// Para o título da despesa: sem espaços a mais, sem números de referência nem máscaras de cartão, sem o
// prefixo "COMPRA", e em minúsculas com maiúscula inicial se o banco a escreveu toda em maiúsculas
export function limparDescricao(texto: string): string {
  let t = texto.replace(/\s+/g, ' ').trim();
  t = t.replace(PREFIXOS, '');
  t = t.replace(/(?:^|\s)[x*]{2,}\d*(?=\s|$)/gi, ' '); // **** 1234, xxxx1234
  t = t.replace(/(?:^|\s)\d{5,}(?=\s|$)/g, ' '); // referências longas
  t = t.replace(/\s+/g, ' ').trim();
  if (t === '') return texto.replace(/\s+/g, ' ').trim().slice(0, 200);
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, '').length;
  if (letras.length >= 4 && maiusculas / letras.length > 0.7) {
    t = t
      .toLowerCase()
      .replace(/(^|[\s\-/('])([a-zà-ÿ])/g, (_, antes: string, letra: string) => antes + letra.toUpperCase());
  }
  return t.slice(0, 200);
}

// ---------------------------------------------------------------------------------------------------------------
// CSV

// O separador mais frequente nas primeiras linhas (fora das aspas): ; , tab ou |
export function detetarDelimitador(texto: string): string {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 30);
  let melhor = ';';
  let melhorTotal = -1;
  for (const candidato of [';', '\t', '|', ',']) {
    // Conta só as linhas com este separador, para uma linha de título sem separadores não estragar
    const contagens = linhas.map((l) => dividirLinha(l, candidato).length - 1).filter((n) => n > 0);
    if (contagens.length === 0) continue;
    // O mais comum entre as contagens, multiplicado por quantas linhas o têm
    const frequencias = new Map<number, number>();
    for (const n of contagens) frequencias.set(n, (frequencias.get(n) ?? 0) + 1);
    const [colunas, vezes] = [...frequencias.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const total = colunas * vezes;
    if (total > melhorTotal) {
      melhorTotal = total;
      melhor = candidato;
    }
  }
  return melhor;
}

// Divide uma linha em células respeitando as aspas ("a;b";c → ["a;b", "c"]; "" dentro de aspas é uma aspa)
export function dividirLinha(linha: string, delimitador: string): string[] {
  const celulas: string[] = [];
  let atual = '';
  let emAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (emAspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') emAspas = false;
      else atual += c;
    } else if (c === '"') emAspas = true;
    else if (c === delimitador) {
      celulas.push(atual.trim());
      atual = '';
    } else atual += c;
  }
  celulas.push(atual.trim());
  return celulas;
}

const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// A linha de cabeçalho é a última antes da primeira sequência de linhas com data: acima dela pode haver títulos
// do banco, o IBAN, o período... Devolve a tabela (cabeçalhos + linhas de dados)
export function lerTabela(texto: string, delimitador = detetarDelimitador(texto)): Tabela | null {
  const todas = texto
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l, i) => ({ numero: i + 1, celulas: dividirLinha(l, delimitador) }))
    .filter((l) => l.celulas.some((c) => c !== ''));

  // Uma célula que é só uma data (e talvez uma hora): "05-10-2026" sim, "01-09-2026 a 30-09-2026" não
  const dataPura = (c: string) => lerData(c) !== null && !/[A-Za-zÀ-ÿ]/.test(c);
  const temData = (celulas: string[]) => celulas.some(dataPura);
  const temValor = (celulas: string[]) => celulas.some((c) => !Number.isNaN(lerNumero(c)) && /[.,]\d{1,2}$/.test(c.trim().replace(/-$/, '')));
  // Uma linha de movimento tem pelo menos 3 células, uma data e um valor com cêntimos; a tabela começa na
  // primeira que tenha outra igual nas 3 linhas seguintes (assim uma linha solta de título ou de totais não a estraga)
  const eMovimento = (celulas: string[]) => celulas.length >= 3 && temData(celulas) && temValor(celulas);
  const primeiraDeDados = todas.findIndex(
    (l, i) => eMovimento(l.celulas) && (i >= todas.length - 3 || todas.slice(i + 1, i + 4).some((o) => eMovimento(o.celulas)))
  );
  if (primeiraDeDados < 0) return null;

  // O cabeçalho é a linha imediatamente acima, se não tiver datas
  const candidata = primeiraDeDados > 0 ? todas[primeiraDeDados - 1] : null;
  const cabecalhos = candidata && !temData(candidata.celulas) && candidata.celulas.length >= 3 ? candidata.celulas : [];
  const dados = todas.slice(primeiraDeDados).filter((l) => temData(l.celulas) && l.celulas.length >= 3);
  const colunas = Math.max(...dados.map((l) => l.celulas.length), cabecalhos.length);
  return {
    delimitador,
    cabecalhos: Array.from({ length: colunas }, (_, i) => cabecalhos[i] ?? ''),
    linhas: dados.map((l) => Array.from({ length: colunas }, (_, i) => l.celulas[i] ?? '')),
    primeiraLinha: dados[0].numero,
  };
}

const DATA_CAB = /^(data|date|dt)\b|data mov|data oper|data lanc|data contab|data valor/;
const DESCR_CAB = /descri|movimento|detalhe|detail|memo|texto|narrativa|beneficiari|operacao|referencia|description|name/;
const VALOR_CAB = /^(valor|montante|amount|quantia|importe)|^valor\b/;
const DEBITO_CAB = /d[eé]bito|debit|saida|retirada|levantamento/;
const CREDITO_CAB = /cr[eé]dito|credit|entrada|deposito/;
const SALDO_CAB = /saldo|balance/;

const fracao = (valores: string[], teste: (v: string) => boolean) => (valores.length === 0 ? 0 : valores.filter(teste).length / valores.length);

// Adivinha o mapeamento pelos nomes dos cabeçalhos e, onde faltarem, pelo conteúdo das colunas
export function sugerirMapeamento(tabela: Tabela): Mapeamento | null {
  const n = tabela.cabecalhos.length;
  const colunas = Array.from({ length: n }, (_, c) => tabela.linhas.map((l) => l[c] ?? '').filter((v) => v !== ''));
  const nomes = tabela.cabecalhos.map(normalizar);

  const acharPeloNome = (regex: RegExp, excluir: number[] = []) => nomes.findIndex((nome, i) => nome !== '' && !excluir.includes(i) && regex.test(nome));

  // Data: pelo nome, senão a primeira coluna onde (quase) tudo são datas
  let data = acharPeloNome(DATA_CAB);
  if (data < 0 || fracao(colunas[data], (v) => lerData(v) !== null) < 0.8) {
    data = colunas.findIndex((valores) => valores.length > 0 && fracao(valores, (v) => lerData(v) !== null) >= 0.8);
  }
  if (data < 0) return null;

  const eNumero = (v: string) => !Number.isNaN(lerNumero(v));
  const numericas = colunas.map((valores, i) => (i !== data && valores.length > 0 && fracao(valores, eNumero) >= 0.8 ? i : -1)).filter((i) => i >= 0);
  const eSaldo = (i: number) => SALDO_CAB.test(nomes[i]);

  const debito = acharPeloNome(DEBITO_CAB, [data]);
  const credito = acharPeloNome(CREDITO_CAB, [data, debito]);
  let valor = acharPeloNome(VALOR_CAB, [data, debito, credito]);
  if (valor >= 0 && !numericas.includes(valor)) valor = -1;

  let descricao = acharPeloNome(DESCR_CAB, [data, debito, credito, valor]);
  if (descricao < 0 || fracao(colunas[descricao] ?? [], eNumero) > 0.5) {
    // A coluna de texto mais comprida (que não seja a data nem números)
    const textos = colunas
      .map((valores, i) => ({ i, comprimento: valores.reduce((s, v) => s + v.length, 0) / Math.max(1, valores.length), numero: fracao(valores, eNumero), data: fracao(valores, (v) => lerData(v) !== null) }))
      .filter((c) => c.i !== data && c.numero < 0.5 && c.data < 0.5)
      .sort((a, b) => b.comprimento - a.comprimento);
    descricao = textos[0]?.i ?? -1;
  }
  if (descricao < 0) return null;

  if (debito >= 0 && credito >= 0) return { data, descricao, debito, credito };
  if (valor >= 0) return { data, descricao, valor };
  // Sem nomes úteis: a primeira coluna numérica que não seja de saldo
  const candidatas = numericas.filter((i) => !eSaldo(i));
  if (candidatas.length === 1 || (candidatas.length >= 1 && nomes.every((nm) => nm === ''))) return { data, descricao, valor: candidatas[0] };
  // Duas colunas numéricas e a seguir um saldo: débito e crédito
  if (candidatas.length >= 2) return { data, descricao, debito: candidatas[0], credito: candidatas[1] };
  return null;
}

// Aplica o mapeamento à tabela. Linhas sem data válida ou sem valor ficam de fora e contam nos avisos
export function aplicarMapeamento(tabela: Tabela, mapeamento: Mapeamento): ResultadoMapeamento {
  const movimentos: MovimentoLido[] = [];
  let semData = 0;
  let semValor = 0;
  tabela.linhas.forEach((celulas, indice) => {
    const data = lerData(celulas[mapeamento.data] ?? '');
    if (!data) {
      semData++;
      return;
    }
    let valor = NaN;
    if (mapeamento.valor !== undefined) {
      valor = lerNumero(celulas[mapeamento.valor] ?? '');
    } else if (mapeamento.debito !== undefined || mapeamento.credito !== undefined) {
      const debito = lerNumero(celulas[mapeamento.debito ?? -1] ?? '');
      const credito = lerNumero(celulas[mapeamento.credito ?? -1] ?? '');
      // O débito pode vir com ou sem sinal: conta sempre como saída
      if (!Number.isNaN(debito) && debito !== 0) valor = -Math.abs(debito);
      else if (!Number.isNaN(credito) && credito !== 0) valor = Math.abs(credito);
      else if (!Number.isNaN(debito) || !Number.isNaN(credito)) valor = 0;
    }
    if (Number.isNaN(valor) || valor === 0) {
      semValor++;
      return;
    }
    const original = (celulas[mapeamento.descricao] ?? '').trim();
    movimentos.push({
      linha: tabela.primeiraLinha + indice,
      data,
      descricao: limparDescricao(original) || t0(original),
      original,
      valor: Math.round(valor * 100) / 100,
    });
  });
  const avisos: string[] = [];
  if (semData > 0) avisos.push(t('{n} linha(s) sem data válida ficaram de fora.', { n: semData }));
  if (semValor > 0) avisos.push(t('{n} linha(s) sem valor (ou com valor 0) ficaram de fora.', { n: semValor }));
  return { movimentos, avisos };
}

const t0 = (texto: string) => texto || t('Movimento');

// ---------------------------------------------------------------------------------------------------------------
// OFX / QFX (SGML ou XML)

function campoOfx(bloco: string, etiqueta: string): string | null {
  const m = bloco.match(new RegExp(`<${etiqueta}>([^<\\r\\n]*)`, 'i'));
  return m ? m[1].trim() : null;
}

export function lerOfx(texto: string): LeituraOfx {
  const movimentos: MovimentoLido[] = [];
  const avisos: string[] = [];
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTTRNRS>|$)/gi) ?? [];
  let ignorados = 0;
  blocos.forEach((bloco, indice) => {
    const data = lerData(campoOfx(bloco, 'DTPOSTED') ?? '');
    const valor = lerNumero((campoOfx(bloco, 'TRNAMT') ?? '').replace(',', '.'));
    if (!data || Number.isNaN(valor) || valor === 0) {
      ignorados++;
      return;
    }
    const nome = campoOfx(bloco, 'NAME') ?? '';
    const memo = campoOfx(bloco, 'MEMO') ?? '';
    const original = [nome, memo].filter((p, i, todos) => p !== '' && todos.indexOf(p) === i).join(' ').trim();
    movimentos.push({
      linha: indice + 1,
      data,
      descricao: limparDescricao(original) || t0(original),
      original,
      valor: Math.round(valor * 100) / 100,
    });
  });
  if (blocos.length === 0) avisos.push(t('Não encontrei movimentos neste ficheiro OFX.'));
  if (ignorados > 0) avisos.push(t('{n} movimento(s) sem data ou valor ficaram de fora.', { n: ignorados }));
  return { formato: 'ofx', movimentos, avisos };
}

// ---------------------------------------------------------------------------------------------------------------
// Entrada principal

export function eOfx(texto: string): boolean {
  return /<OFX[\s>]/i.test(texto) || /^OFXHEADER:/m.test(texto) || /<STMTTRN>/i.test(texto);
}

export class ErroExtrato extends Error {}

// Lê o ficheiro: OFX dá logo os movimentos; CSV dá a tabela e a sugestão de colunas
export function lerExtrato(bytes: Uint8Array): LeituraCsv | LeituraOfx {
  const texto = decodificarTexto(bytes);
  if (eOfx(texto)) return lerOfx(texto);
  const tabela = lerTabela(texto);
  if (!tabela) throw new ErroExtrato(t('Não encontrei movimentos neste ficheiro. Confirma que é o extrato da conta em CSV ou OFX.'));
  return { formato: 'csv', tabela, sugestao: sugerirMapeamento(tabela) };
}

// Para lembrar o mapeamento de um banco: os nomes das colunas (sem acentos nem maiúsculas) identificam o formato
export function assinaturaDaTabela(tabela: Tabela): string {
  return `${tabela.delimitador}|${tabela.cabecalhos.map(normalizar).join('|')}`;
}

// Só as saídas (despesas), da mais antiga para a mais recente; e quantas entradas ficaram de fora
export function separarSaidas(movimentos: MovimentoLido[]): { saidas: MovimentoLido[]; entradas: number } {
  return {
    saidas: movimentos.filter((m) => m.valor < 0).sort((a, b) => a.data.localeCompare(b.data) || a.linha - b.linha),
    entradas: movimentos.filter((m) => m.valor > 0).length,
  };
}
