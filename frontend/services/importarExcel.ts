import { lerData, normalizarTitulo, parseValor } from '../utils/formatos';
import { abrirLivro, CelulaLida, dataDeSerial, Grelha, ValorCelula } from '../utils/lerXlsx';
import { t } from '../i18n';
import { centimos, mesDaData } from './calculos';
import type { DadosFolhaMes, LinhaFolha, Mes } from './tipos';

// Leitura de uma folha do livro Excel do utilizador (uma folha por mês) para DadosFolhaMes.
// A gravação na app é feita por importarFolhaMes (services/folhaMes.ts).
//
// Formato da folha (as linhas mudam de folha para folha, por isso tudo é encontrado pelos títulos):
//   - em cima, lado a lado, os blocos "Lucro", "Despesas", "Poupança", "Despesas do Mês" e "Anual":
//     título, total por baixo, uma linha "Categoria | Valor" e as linhas (nome numa coluna, valor
//     na seguinte) até uma linha vazia ou um total ("Sobra", "Total", "Total para extras")
//   - em baixo: "Saldo Conta" (no livro original "Salto Conta") com o valor à direita e as listas
//     "Falta" (título numa coluna, linhas na seguinte, a acabar em "Total" e "Previsão"),
//     "Saldo Poupança" (acaba em "Total") e "Total a pagar"

export type BlocoFolha = 'lucro' | 'despesas' | 'poupanca' | 'despesasMes' | 'anual' | 'falta' | 'saldoPoupanca' | 'totalAPagar';
export type RotuloFolha = BlocoFolha | 'saldoConta';

// Nome de cada bloco como aparece no ecrã
export const NOMES_BLOCOS: Record<RotuloFolha, string> = {
  lucro: 'Lucro',
  despesas: 'Despesas',
  poupanca: 'Poupança',
  despesasMes: 'Despesas do Mês',
  anual: 'Anual',
  saldoConta: 'Saldo Conta',
  falta: 'Falta',
  saldoPoupanca: 'Saldo Poupança',
  totalAPagar: 'Total a pagar',
};

// Títulos aceites para cada bloco (já normalizados: sem acentos nem maiúsculas)
const ROTULOS: Record<RotuloFolha, string[]> = {
  lucro: ['lucro', 'lucros', 'rendimentos', 'receitas'],
  despesas: ['despesas', 'despesas mensais', 'despesas fixas'],
  poupanca: ['poupanca', 'poupancas'],
  despesasMes: ['despesas do mes', 'despesas mes', 'despesas extras', 'extras do mes'],
  anual: ['anual', 'anuais', 'despesas anuais'],
  saldoConta: ['saldo conta', 'salto conta', 'saldo da conta', 'saldo conta corrente'],
  falta: ['falta', 'falta pagar', 'por pagar'],
  saldoPoupanca: ['saldo poupanca', 'saldo poupancas', 'salto poupanca', 'saldo das poupancas'],
  totalAPagar: ['total a pagar', 'total em divida', 'dividas'],
};

const BLOCOS_TABELA: BlocoFolha[] = ['lucro', 'despesas', 'poupanca', 'despesasMes', 'anual'];
const BLOCOS_LISTA: BlocoFolha[] = ['falta', 'saldoPoupanca', 'totalAPagar'];

// Linhas vazias seguidas que terminam um bloco de cima (as listas de baixo têm linhas vazias pelo meio)
const VAZIAS_FIM_TABELA = 2;
const VAZIAS_FIM_LISTA = 8;

export interface LeituraFolha {
  dados: DadosFolhaMes;
  encontrados: RotuloFolha[]; // blocos com título na folha
  avisos: string[]; // linhas que não foi possível ler (ex.: valor sem nome)
}

// "  Despesas do Mês: " -> "despesas do mes"
export function normalizarTexto(texto: string): string {
  return normalizarTitulo(texto).replace(/\s*:$/, '');
}

// Linhas do Lucro que não são dinheiro na conta (o cartão de alimentação)
export function linhaInformativa(titulo: string): boolean {
  const n = normalizarTexto(titulo);
  return n.includes('alimen') || n.includes('cartao') || n.includes('refeic');
}

// Soma do bloco sem as linhas informativas
export function totalLinhas(linhas: LinhaFolha[]): number {
  return centimos(linhas.reduce((total, l) => total + (l.informativo ? 0 : l.valor), 0));
}

const texto = (valor: ValorCelula | undefined): string =>
  typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim() : '';

const vazia = (valor: ValorCelula | undefined) => valor === undefined || (typeof valor === 'string' && !valor.trim());

// Número de uma célula: números e também números escritos como texto ("12,50", "1.500 €")
function numero(valor: ValorCelula | undefined): number | undefined {
  if (typeof valor === 'number') return valor;
  if (typeof valor !== 'string') return undefined;
  const limpo = valor.replace(/[\s€]/g, '');
  return /^[-+]?(\d[\d.,]*|[.,]\d+)$/.test(limpo) ? parseValor(limpo) : undefined;
}

// Fim de bloco: "Total", "Total para extras", "Subtotal", "Sobra", "Previsão"
function linhaDeTotal(titulo: string): boolean {
  const n = normalizarTexto(titulo);
  return /^(sub)?total\b/.test(n) || n === 'sobra' || n === 'previsao';
}

const euros = (valor: number) => `${valor.toFixed(2).replace('.', ',')} €`;

// Data de uma célula -> ISO. Aceita datas do Excel (número de série), "2026-10-05", "05/10/2026"
// e só o dia (1-31), que é desse mês
function dataCelula(valor: ValorCelula | undefined, mes: Mes, data1904: boolean): string | undefined {
  if (typeof valor === 'number') {
    if (Number.isInteger(valor) && valor >= 1 && valor <= 31) {
      const [ano, m] = mes.split('-').map(Number);
      return valor <= new Date(ano, m, 0).getDate() ? `${mes}-${String(valor).padStart(2, '0')}` : undefined;
    }
    return valor > 31 ? dataDeSerial(valor, data1904) : undefined;
  }
  const t = texto(valor);
  const partes = lerData(t);
  if (partes) return `${partes.ano}-${String(partes.mes).padStart(2, '0')}-${String(partes.dia).padStart(2, '0')}`;
  const pt = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!pt) return undefined;
  const ano = pt[3].length === 2 ? 2000 + Number(pt[3]) : Number(pt[3]);
  return `${ano}-${pt[2].padStart(2, '0')}-${pt[1].padStart(2, '0')}`;
}

interface Posicao {
  linha: number;
  coluna: number;
}

// Lê uma folha já aberta (ver abrirLivro em utils/lerXlsx.ts)
export function interpretarFolhaMes(grelha: Grelha, mes: Mes, data1904 = false): LeituraFolha {
  const avisos: string[] = [];

  // Títulos dos blocos: a primeira célula com cada título (de cima para baixo, da esquerda para a direita)
  const posicoes = new Map<RotuloFolha, Posicao>();
  for (const c of grelha.celulas) {
    const n = typeof c.valor === 'string' ? normalizarTexto(c.valor) : '';
    if (!n) continue;
    for (const rotulo of Object.keys(ROTULOS) as RotuloFolha[]) {
      if (!posicoes.has(rotulo) && ROTULOS[rotulo].includes(n)) {
        posicoes.set(rotulo, { linha: c.linha, coluna: c.coluna });
      }
    }
  }
  const eTitulo = (linha: number, coluna: number) =>
    [...posicoes.values()].some((p) => p.linha === linha && p.coluna === coluna);

  // Lê uma linha de um bloco. null = linha vazia
  function lerLinha(bloco: BlocoFolha, linha: number, coluna: number, colunaData?: number): LinhaFolha | 'ignorar' | null {
    const celulaTitulo = grelha.valor(linha, coluna);
    const celulaValor = grelha.valor(linha, coluna + 1);
    if (vazia(celulaTitulo) && vazia(celulaValor)) return null;

    const titulo = texto(celulaTitulo);
    const valor = numero(celulaValor);
    if (!titulo) {
      // Ex.: o total por baixo do título do bloco, ou um valor sem nome
      if (typeof celulaTitulo !== 'number' && valor) {
        avisos.push(
          t('{bloco}: valor de {valor} sem nome na linha {linha} (não foi lido)', {
            bloco: t(NOMES_BLOCOS[bloco]),
            valor: euros(valor),
            linha,
          })
        );
      }
      return 'ignorar';
    }
    // Sem valor ou a zero (ex.: "Falta" com coisas já pagas): não conta
    if (valor === undefined || centimos(valor) === 0) return 'ignorar';

    const resultado: LinhaFolha = { titulo, valor: centimos(valor) };
    if (bloco === 'lucro' && linhaInformativa(titulo)) resultado.informativo = true;
    if (colunaData !== undefined) {
      const data = dataCelula(grelha.valor(linha, colunaData), mes, data1904);
      if (data && mesDaData(data) === mes) {
        resultado.data = data;
      } else if (data) {
        avisos.push(
          t('{bloco}: {tituloComAspas} tem uma data fora do mês escolhido (fica sem data)', {
            bloco: t(NOMES_BLOCOS[bloco]),
            tituloComAspas: '"' + titulo + '"',
          })
        );
      }
    }
    return resultado;
  }

  // Blocos de cima: título, total, "Categoria | Valor" e as linhas até uma linha vazia ou um total
  function lerTabela(bloco: BlocoFolha): LinhaFolha[] {
    const pos = posicoes.get(bloco);
    if (!pos) return [];
    const { coluna } = pos;

    // Linha de cabeçalho "Categoria | Valor" (e, se existir, "Data" a seguir ao valor)
    let inicio = pos.linha + 1;
    let colunaData: number | undefined;
    let comCabecalho = false;
    for (let l = pos.linha + 1; l <= pos.linha + 8; l++) {
      const nome = normalizarTexto(texto(grelha.valor(l, coluna)));
      const valor = normalizarTexto(texto(grelha.valor(l, coluna + 1)));
      if (['categoria', 'descricao', 'nome', 'titulo'].includes(nome) || ['valor', 'montante'].includes(valor)) {
        inicio = l + 1;
        comCabecalho = true;
        if (['data', 'dia'].includes(normalizarTexto(texto(grelha.valor(l, coluna + 2))))) colunaData = coluna + 2;
        break;
      }
    }

    const linhas: LinhaFolha[] = [];
    let vazias = 0;
    let comecou = comCabecalho;
    for (let l = inicio; l <= grelha.ultimaLinha; l++) {
      const titulo = texto(grelha.valor(l, coluna));
      if (eTitulo(l, coluna) || (titulo && linhaDeTotal(titulo))) break;
      const lida = lerLinha(bloco, l, coluna, colunaData);
      if (lida === null) {
        if (comecou && ++vazias >= VAZIAS_FIM_TABELA) break;
        // Sem cabeçalho "Categoria | Valor": as linhas começam no primeiro nome (até 8 linhas abaixo)
        if (!comecou && l > pos.linha + 8) break;
        continue;
      }
      vazias = 0;
      if (titulo) comecou = true;
      if (lida !== 'ignorar') linhas.push(lida);
    }
    return linhas;
  }

  // Listas de baixo: as linhas ficam por baixo do título ("Saldo Poupança", "Total a pagar")
  // ou na coluna à direita, a começar na mesma linha ("Falta"); acabam num total
  function lerLista(bloco: BlocoFolha): LinhaFolha[] {
    const pos = posicoes.get(bloco);
    if (!pos) return [];

    const temNomesPorBaixo = [1, 2, 3].some((d) => {
      const t = texto(grelha.valor(pos.linha + d, pos.coluna));
      return t && !linhaDeTotal(t) && !eTitulo(pos.linha + d, pos.coluna);
    });
    const coluna = temNomesPorBaixo ? pos.coluna : pos.coluna + 1;
    const inicio = temNomesPorBaixo ? pos.linha + 1 : pos.linha;

    const linhas: LinhaFolha[] = [];
    let vazias = 0;
    for (let l = inicio; l <= grelha.ultimaLinha; l++) {
      const titulo = texto(grelha.valor(l, coluna));
      if ((l > pos.linha && eTitulo(l, pos.coluna)) || eTitulo(l, coluna) || (titulo && linhaDeTotal(titulo))) break;
      const lida = lerLinha(bloco, l, coluna);
      if (lida === null) {
        if (++vazias >= VAZIAS_FIM_LISTA) break;
        continue;
      }
      vazias = 0;
      if (lida !== 'ignorar') linhas.push(lida);
    }
    return linhas;
  }

  // "Saldo Conta": o número à direita do título (ou duas colunas à direita, ou por baixo)
  function lerSaldoConta(): number | undefined {
    const pos = posicoes.get('saldoConta');
    if (!pos) return undefined;
    const candidatos: (CelulaLida | undefined)[] = [
      grelha.celula(pos.linha, pos.coluna + 1),
      grelha.celula(pos.linha, pos.coluna + 2),
      grelha.celula(pos.linha + 1, pos.coluna),
    ];
    for (const c of candidatos) {
      const valor = numero(c?.valor);
      if (valor !== undefined) return centimos(valor);
    }
    return undefined;
  }

  const [lucro, despesas, poupanca, despesasMes, anual] = BLOCOS_TABELA.map(lerTabela);
  const [falta, saldoPoupanca, totalAPagar] = BLOCOS_LISTA.map(lerLista);

  return {
    dados: { mes, lucro, despesas, poupanca, despesasMes, anual, saldoConta: lerSaldoConta(), falta, saldoPoupanca, totalAPagar },
    encontrados: (Object.keys(NOMES_BLOCOS) as RotuloFolha[]).filter((r) => posicoes.has(r)),
    avisos,
  };
}

// ---- A partir dos bytes do ficheiro ----

export function listarFolhas(bytes: Uint8Array): string[] {
  return abrirLivro(bytes).folhas;
}

export function analisarFolhaMes(bytes: Uint8Array, nomeFolha: string, mes: Mes): LeituraFolha {
  const livro = abrirLivro(bytes);
  return interpretarFolhaMes(livro.lerFolha(nomeFolha), mes, livro.data1904);
}

export function lerFolhaMes(bytes: Uint8Array, nomeFolha: string, mes: Mes): DadosFolhaMes {
  return analisarFolhaMes(bytes, nomeFolha, mes).dados;
}

// ---- Mês da folha a partir do nome ----

const MESES: [string, string][] = [
  ['janeiro', 'jan'], ['fevereiro', 'fev'], ['marco', 'mar'], ['abril', 'abr'],
  ['maio', 'mai'], ['junho', 'jun'], ['julho', 'jul'], ['agosto', 'ago'],
  ['setembro', 'set'], ['outubro', 'out'], ['novembro', 'nov'], ['dezembro', 'dez'],
];

// "Abril Ana" -> "2026-04"; "Março 2025" -> "2025-03"; "Folha1" -> null.
// Sem ano no nome: o ano de hoje, ou o anterior se esse mês ainda não chegou
export function sugerirMes(nomeFolha: string, hoje: Date = new Date()): Mes | null {
  const n = normalizarTexto(nomeFolha);
  const palavras = n.split(/[^a-z]+/).filter(Boolean);
  let indice = -1;
  for (const p of palavras) {
    indice = MESES.findIndex(([nome, abreviatura]) => p === nome || p === abreviatura);
    if (indice >= 0) break;
  }
  let ano = Number(n.match(/(?:^|\D)((?:19|20)\d{2})(?!\d)/)?.[1]) || undefined;

  // Também "2026-04" ou "04-2026"
  if (indice < 0) {
    const anoMes = n.match(/(?:^|\D)((?:19|20)\d{2})[-_/. ](\d{1,2})(?!\d)/);
    const mesAno = n.match(/(?:^|\D)(\d{1,2})[-_/. ]((?:19|20)\d{2})(?!\d)/);
    const [a, m] = anoMes ? [anoMes[1], anoMes[2]] : mesAno ? [mesAno[2], mesAno[1]] : [];
    if (!a || !m || Number(m) < 1 || Number(m) > 12) return null;
    indice = Number(m) - 1;
    ano = Number(a);
  }

  if (!ano) {
    ano = hoje.getFullYear();
    if (indice > hoje.getMonth()) ano--;
  }
  return `${ano}-${String(indice + 1).padStart(2, '0')}`;
}
