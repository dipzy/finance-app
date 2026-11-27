import { guardarFicheiro, OpcoesPartilha } from '../utils/guardarFicheiro';
import { hojeISO } from '../utils/formatos';
import { Celula, CelulaFormatada, Estilo, Folha, FORMATOS, gerarXlsx, letraColuna, nomesFolhas } from '../utils/xlsx';
import { t } from '../i18n';
import { centimos } from './calculos';
import { calcularSaldoDisponivel } from './database';
import { mesesComDados, obterDadosFolhaMes } from './folhaMes';
import type { DadosFolhaMes, LinhaFolha, Mes } from './tipos';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Cada mês é uma folha com o mesmo aspeto do livro Excel do utilizador:
//
//   B3:C4     nome do mês
//   linha 5   Lucro (E:F) | Despesas (H:I) | Poupança (K:L) | Despesas do Mês (N:O) | Anual (Q:R)
//   linha 6   total de cada bloco
//   linha 9   Categoria | Valor, e as linhas de cada bloco a partir da 10
//   2 linhas abaixo do bloco mais comprido:
//             Sobra = Lucro - Despesas
//             Total para extras = Sobra - Poupança
//             Total = Total para extras - Despesas do Mês
//   em baixo  Saldo Conta; Falta (com Total e Previsão = Saldo Conta - Total); Saldo Poupança; Total a pagar
//
// Os totais são fórmulas que somam exatamente as linhas escritas, sem as informativas (ex.: "Alimen."),
// e levam o resultado já calculado para aparecerem certos mesmo onde as fórmulas não são recalculadas.

// Colunas (0 = A)
const COL = { B: 1, C: 2, D: 3, E: 4, F: 5, H: 7, I: 8, K: 10, L: 11, N: 13, O: 14, Q: 16, R: 17 } as const;

// Linhas fixas da parte de cima
export const LINHAS = { titulo: 3, cabecalho: 5, total: 6, colunas: 9, primeiroItem: 10 } as const;

// Linhas entre a Sobra e o Saldo Conta
const ESPACO_SALDO = 3;

// Larguras das colunas A a R (parecidas com as do livro do utilizador, com espaço para valores de milhares)
const LARGURAS = [8.6, 13, 13, 10, 18, 13, 8.6, 20, 13, 8.6, 18, 13, 8.6, 24, 13, 8.6, 16, 13];

// Cores do livro do utilizador: as do tema Office ("Destaque n, x% mais claro"), em RGB
export const CORES = {
  titulo: 'E2EFDA', // Verde (Destaque 6), 80% mais claro
  lucro: '8EA9DB', // Azul (Destaque 1), 40% mais claro
  despesas: 'F4B084', // Laranja (Destaque 2), 40% mais claro
  poupanca: 'FFD966', // Dourado (Destaque 4), 40% mais claro
  despesasMes: 'ED8585',
  anual: 'A9D08E', // Verde (Destaque 6), 40% mais claro
  resultado: 'FCE4D6', // Sobra, Total para extras e Total: Laranja (Destaque 2), 80% mais claro
  saldo: 'DDEBF7', // Saldo Conta e Saldo Poupança: Azul (Destaque 5), 80% mais claro
  totalLista: 'E2EFDA', // Totais das listas de baixo: Verde (Destaque 6), 80% mais claro
  aPagar: 'D6DCE4', // Total a pagar: Azul-acinzentado (Texto 2), 80% mais claro
  falta: 'FF0000', // Texto "Falta"
  informativo: '808080', // Linhas que não entram nas contas
} as const;

type CampoBloco = 'lucro' | 'despesas' | 'poupanca' | 'despesasMes' | 'anual';

// Blocos de cima: título na coluna indicada e valor na seguinte
const BLOCOS: { campo: CampoBloco; nome: string; coluna: number; fundo: string }[] = [
  { campo: 'lucro', nome: 'Lucro', coluna: COL.E, fundo: CORES.lucro },
  { campo: 'despesas', nome: 'Despesas', coluna: COL.H, fundo: CORES.despesas },
  { campo: 'poupanca', nome: 'Poupança', coluna: COL.K, fundo: CORES.poupanca },
  { campo: 'despesasMes', nome: 'Despesas do Mês', coluna: COL.N, fundo: CORES.despesasMes },
  { campo: 'anual', nome: 'Anual', coluna: COL.Q, fundo: CORES.anual },
];

// ---- Estilos (tudo em Arial, como no livro do utilizador) ----

const EURO = FORMATOS.euroContabilidade;
const arial = (e: Estilo = {}): Estilo => ({ tipoLetra: 'Arial', ...e });

const ESTILO = {
  titulo: arial({ tamanho: 20, fundo: CORES.titulo, horizontal: 'center', vertical: 'center' }),
  cabecalho: (fundo: string) => arial({ tamanho: 14, fundo, bordas: true, horizontal: 'center' }),
  totalBloco: arial({ tamanho: 12, bordas: true, formato: EURO, horizontal: 'center', vertical: 'center' }),
  colunas: (fundo: string) => arial({ fundo, bordas: true }),
  texto: arial({ bordas: true }),
  valor: arial({ bordas: true, formato: EURO }),
  textoInformativo: arial({ bordas: true, italico: true, cor: CORES.informativo }),
  valorInformativo: arial({ bordas: true, formato: EURO, italico: true, cor: CORES.informativo }),
  resultado: arial({ tamanho: 12, fundo: CORES.resultado, horizontal: 'center' }),
  valorResultado: arial({ tamanho: 12, fundo: CORES.resultado, formato: EURO }),
  saldo: arial({ negrito: true, fundo: CORES.saldo }),
  valorSaldo: arial({ negrito: true, fundo: CORES.saldo, formato: EURO }),
  falta: arial({ negrito: true, tamanho: 14, cor: CORES.falta }),
  totalLista: arial({ fundo: CORES.totalLista, bordas: true }),
  valorTotalLista: arial({ fundo: CORES.totalLista, bordas: true, formato: EURO }),
  aPagar: arial({ fundo: CORES.aPagar, bordas: true }),
  normal: arial(),
  valorNormal: arial({ formato: EURO }),
};

// ---- Construção da folha ----

const ref = (coluna: number, linha: number) => `${letraColuna(coluna)}${linha}`;

// Folha em construção: cada célula é posta na sua posição, como no Excel
class Grelha {
  readonly linhas: Celula[][] = [];
  readonly unidas: string[] = [];

  por(coluna: number, linha: number, valor: CelulaFormatada['valor'], estilo: Estilo, formula?: string) {
    const celulas = this.linhas[linha - 1] ?? (this.linhas[linha - 1] = []);
    celulas[coluna] = formula ? { valor, estilo, formula } : { valor, estilo };
  }

  // Une as células de (coluna, linha) até (ateColuna, ateLinha). Todas levam o estilo:
  // as bordas de um grupo unido são as de cada uma das suas células.
  unir(coluna: number, linha: number, ateColuna: number, ateLinha: number, valor: CelulaFormatada['valor'], estilo: Estilo, formula?: string) {
    for (let r = linha; r <= ateLinha; r++) {
      for (let c = coluna; c <= ateColuna; c++) {
        const primeira = r === linha && c === coluna;
        this.por(c, r, primeira ? valor : null, estilo, primeira ? formula : undefined);
      }
    }
    this.unidas.push(`${ref(coluna, linha)}:${ref(ateColuna, ateLinha)}`);
  }
}

interface Soma {
  formula?: string; // sem linhas que contem não há fórmula (o total é 0)
  valor: number;
}

// "SUM(F10:F12,F14)": as linhas indicadas, juntando as seguidas em intervalos
export function formulaSoma(coluna: string, linhas: number[]): string | undefined {
  if (!linhas.length) return undefined;
  const partes: string[] = [];
  let inicio = linhas[0];
  let fim = linhas[0];
  for (const r of [...linhas.slice(1), NaN]) {
    if (r === fim + 1) {
      fim = r;
      continue;
    }
    partes.push(inicio === fim ? `${coluna}${inicio}` : `${coluna}${inicio}:${coluna}${fim}`);
    inicio = fim = r;
  }
  return `SUM(${partes.join(',')})`;
}

// Escreve uma lista (título | valor) a partir da linha `primeira` e devolve a soma das linhas que contam
function escreverLista(g: Grelha, coluna: number, primeira: number, linhas: LinhaFolha[]): Soma {
  const contadas: number[] = [];
  let total = 0;
  linhas.forEach((l, i) => {
    const r = primeira + i;
    g.por(coluna, r, l.titulo, l.informativo ? ESTILO.textoInformativo : ESTILO.texto);
    g.por(coluna + 1, r, centimos(l.valor), l.informativo ? ESTILO.valorInformativo : ESTILO.valor);
    if (!l.informativo) {
      contadas.push(r);
      total += centimos(l.valor);
    }
  });
  return { formula: formulaSoma(letraColuna(coluna + 1), contadas), valor: centimos(total) };
}

// Linha "Total" no fim de uma lista de baixo
function escreverTotal(g: Grelha, coluna: number, linha: number, soma: Soma) {
  g.por(coluna, linha, 'Total', ESTILO.totalLista);
  g.por(coluna + 1, linha, soma.valor, ESTILO.valorTotalLista, soma.formula);
}

// Nome do mês SEMPRE em português: vai para dentro do ficheiro Excel (título da folha e nome do
// separador). nomeMes() traduziria para o idioma atual do ecrã, e o importador espera meses em PT.
const NOMES_MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const nomeMesPt = (mes: Mes): string => {
  const [ano, m] = mes.split('-').map(Number);
  return `${NOMES_MESES_PT[m - 1]} ${ano}`;
};

export function criarFolhaMes(dados: DadosFolhaMes): Folha {
  const g = new Grelha();
  const titulo = nomeMesPt(dados.mes);
  g.unir(COL.B, LINHAS.titulo, COL.C, LINHAS.titulo + 1, titulo, ESTILO.titulo);

  // Blocos de cima: cabeçalho, total, "Categoria | Valor" e as linhas
  const somas = {} as Record<CampoBloco, Soma>;
  for (const bloco of BLOCOS) {
    const c = bloco.coluna;
    const soma = escreverLista(g, c, LINHAS.primeiroItem, dados[bloco.campo]);
    g.unir(c, LINHAS.cabecalho, c + 1, LINHAS.cabecalho, bloco.nome, ESTILO.cabecalho(bloco.fundo));
    g.unir(c, LINHAS.total, c + 1, LINHAS.total, soma.valor, ESTILO.totalBloco, soma.formula);
    g.por(c, LINHAS.colunas, 'Categoria', ESTILO.colunas(bloco.fundo));
    g.por(c + 1, LINHAS.colunas, 'Valor', ESTILO.colunas(bloco.fundo));
    somas[bloco.campo] = soma;
  }

  // Resultados do mês, 2 linhas abaixo do bloco mais comprido (as fórmulas usam os totais da linha 6)
  const maisComprido = Math.max(...BLOCOS.map((b) => dados[b.campo].length));
  const linhaSobra = LINHAS.primeiroItem + maisComprido + 1;
  const total = (coluna: number) => ref(coluna, LINHAS.total);
  const sobra = centimos(somas.lucro.valor - somas.despesas.valor);
  const paraExtras = centimos(sobra - somas.poupanca.valor);
  const restante = centimos(paraExtras - somas.despesasMes.valor);
  g.por(COL.H, linhaSobra, 'Sobra', ESTILO.resultado);
  g.por(COL.I, linhaSobra, sobra, ESTILO.valorResultado, `${total(COL.E)}-${total(COL.H)}`);
  g.por(COL.K, linhaSobra, 'Total para extras', ESTILO.resultado);
  g.por(COL.L, linhaSobra, paraExtras, ESTILO.valorResultado, `${ref(COL.I, linhaSobra)}-${total(COL.K)}`);
  g.por(COL.N, linhaSobra, 'Total', ESTILO.resultado);
  g.por(COL.O, linhaSobra, restante, ESTILO.valorResultado, `${ref(COL.L, linhaSobra)}-${total(COL.N)}`);

  const linhaSaldo = linhaSobra + ESPACO_SALDO;
  const linhaListas = linhaSaldo + 2;

  // Saldo Conta, o que ainda falta pagar e a previsão (o saldo só é conhecido no mês atual)
  const saldo = dados.saldoConta === undefined ? null : centimos(dados.saldoConta);
  g.por(COL.E, linhaSaldo, 'Saldo Conta', ESTILO.saldo);
  g.por(COL.F, linhaSaldo, saldo, ESTILO.valorSaldo);
  g.por(COL.D, linhaListas, 'Falta', ESTILO.falta);
  const falta = escreverLista(g, COL.E, linhaListas, dados.falta);
  const linhaTotalFalta = linhaListas + dados.falta.length;
  escreverTotal(g, COL.E, linhaTotalFalta, falta);
  g.por(COL.E, linhaTotalFalta + 1, 'Previsão', ESTILO.normal);
  if (saldo === null) {
    g.por(COL.F, linhaTotalFalta + 1, null, ESTILO.valorNormal);
  } else {
    g.por(COL.F, linhaTotalFalta + 1, centimos(saldo - falta.valor), ESTILO.valorNormal, `${ref(COL.F, linhaSaldo)}-${ref(COL.F, linhaTotalFalta)}`);
  }

  // Saldo de cada conta poupança
  g.por(COL.H, linhaSaldo, 'Saldo Poupança', ESTILO.saldo);
  g.por(COL.I, linhaSaldo, null, ESTILO.saldo);
  const poupancas = escreverLista(g, COL.H, linhaListas, dados.saldoPoupanca);
  escreverTotal(g, COL.H, linhaListas + dados.saldoPoupanca.length, poupancas);

  // Dívidas: quanto falta pagar de cada uma
  g.por(COL.K, linhaListas, 'Total a pagar', ESTILO.aPagar);
  g.por(COL.L, linhaListas, null, ESTILO.aPagar);
  const dividas = escreverLista(g, COL.K, linhaListas + 1, dados.totalAPagar);
  escreverTotal(g, COL.K, linhaListas + 1 + dados.totalAPagar.length, dividas);

  return {
    nome: titulo,
    larguras: LARGURAS,
    alturas: { [LINHAS.cabecalho]: 18 },
    unidas: g.unidas,
    linhas: g.linhas,
  };
}

// Uma folha por mês, por ordem cronológica, com o nome do mês (sem nomes repetidos)
export function criarLivroExcel(folhas: DadosFolhaMes[]): Folha[] {
  const livro = [...folhas].sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0)).map(criarFolhaMes);
  const nomes = nomesFolhas(livro.map((f) => f.nome));
  return livro.map((f, i) => ({ ...f, nome: nomes[i] }));
}

// Exporta os meses pedidos (por defeito, do primeiro mês com dados até ao atual), um por folha
export async function exportarParaExcel(
  userId: string,
  meses?: Mes[],
  modo: OpcoesPartilha['modo'] = 'descarregar'
): Promise<string | void> {
  // Primeiro o saldo: processa o recebimento do salário e os débitos, que mudam a conta
  await calcularSaldoDisponivel(userId);

  const lista = meses?.length ? meses : await mesesComDados(userId);
  const folhas = await Promise.all(lista.map((mes) => obterDadosFolhaMes(userId, mes)));
  const livro = criarLivroExcel(folhas);

  // Abre no mês mais recente
  const bytes = gerarXlsx(livro, { folhaAtiva: livro.length - 1 });
  return guardarFicheiro(bytes, `financas-${hojeISO()}.xlsx`, MIME_XLSX, {
    modo,
    titulo: t('Exportar para Excel'),
    uti: 'org.openxmlformats.spreadsheetml.sheet',
  });
}
