import { ativaNoMes, centimos, pagamentoNoMes, separarDespesasFixas } from '../services/calculos';
import type { EstadoFixa } from '../services/calculos';
import type { Categoria, Despesa, MeioPagamento, Mes, PagamentoFixa } from '../services/tipos';
import { t } from '../i18n';
import { formatarData, hojeISO, lerData, lerDataEscrita, parseValor } from './formatos';

// Lógica dos ecrãs Gastos do Dia a Dia e Despesas Fixas (validar os formulários e montar as linhas
// de cada mês), sem React Native nem Firebase, para poder ser testada diretamente
// (__tests__/ecrasDespesas.test.ts). As regras de dinheiro continuam em services/calculos.ts.

// ---- Textos ----

// Valor guardado -> texto para editar, no formato português ("12,50"), que o parseValor volta a ler
export const textoValor = (valor: number) => centimos(valor).toFixed(2).replace('.', ',');

// Datas dos atalhos "Hoje" e "Ontem", como aparecem no campo de data (dd/mm/aaaa)
export const textoHoje = (hoje: Date = new Date()) => formatarData(hojeISO(hoje));
export const textoOntem = (hoje: Date = new Date()) =>
  formatarData(hojeISO(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1)));

// Texto inicial do campo de data ao editar (datas de versões anteriores aparecem tal como estão)
export const textoDataGuardada = (data: string | undefined) => (data ? formatarData(data) : '');

// "2026-10-05" -> "05/10" (para "Pago em 05/10")
export function diaEMes(data: string | undefined): string {
  const partes = data ? lerData(data) : null;
  return partes ? `${String(partes.dia).padStart(2, '0')}/${String(partes.mes).padStart(2, '0')}` : '';
}

// Soma ao cêntimo (ex.: total das gastos do dia a dia do mês)
export const somarValores = (despesas: Pick<Despesa, 'valor'>[]) =>
  centimos(despesas.reduce((total, d) => total + (d.valor || 0), 0));

// Os gastos que a folha "Novo gasto" oferece para repetir com dois toques (chips): os títulos
// distintos, na ordem em que vierem (getDoMes devolve da mais recente para a mais antiga), sem
// repetir o mesmo título e sem os gerados por um gasto que se repete (esses já saem sozinhos,
// repeti-los duplicava o gasto). No máximo `limite`.
export function gastosRepetiveis(despesas: Despesa[], limite = 6): Despesa[] {
  const vistos = new Set<string>();
  const repetiveis: Despesa[] = [];
  for (const despesa of despesas) {
    const titulo = despesa.titulo.trim();
    if (!titulo || vistos.has(titulo) || despesa.gastoRecorrenteId) continue;
    vistos.add(titulo);
    repetiveis.push(despesa);
    if (repetiveis.length >= limite) break;
  }
  return repetiveis;
}

// ---- Validação dos formulários ----
// Devolvem { erro } com a mensagem a mostrar, ou os valores já lidos

function lerTituloEValor(titulo: string, valor: string): { erro: string } | { titulo: string; valor: number } {
  if (!titulo.trim() || !valor.trim()) return { erro: t('Preenche o título e o valor') };
  const numero = centimos(parseValor(valor));
  if (!(numero > 0)) return { erro: t('Valor inválido') };
  return { titulo: titulo.trim(), valor: numero };
}

// Dia de débito escrito à mão: só números de 1 a 31 (parseInt aceitava "5a" como 5)
function lerDia(texto: string): number | null {
  const limpo = texto.trim();
  if (!/^\d{1,2}$/.test(limpo)) return null;
  const dia = Number(limpo);
  return dia >= 1 && dia <= 31 ? dia : null;
}

export interface FormularioExtra {
  titulo: string;
  valor: string;
  data: string; // como foi escrita (dd/mm/aaaa)
  categoria?: Categoria; // a escolhida no formulário (sem ela, a categoria fica como está)
  meioPagamento?: MeioPagamento; // conta ou cartão de alimentação (sem ele, fica como está)
  litros?: string; // combustível: só se o formulário o mostra (sem ele, os litros ficam como estão)
}

export interface DespesaExtraValida {
  titulo: string;
  valor: number;
  data: string; // ISO
  litros?: number;
}

// 0 apaga os litros (ver DespesasExtrasDB.update)
export type CamposExtra = Partial<Pick<Despesa, 'titulo' | 'valor' | 'data' | 'categoria' | 'meioPagamento' | 'litros'>>;

// Litros escritos à mão: vazio = sem litros; senão um número maior que zero
function lerLitros(texto: string | undefined): { erro: string } | { litros: number | undefined } {
  if (!texto?.trim()) return { litros: undefined };
  const litros = parseValor(texto);
  return Number.isFinite(litros) && litros > 0 ? { litros } : { erro: t('Indica os litros (um número maior que zero)') };
}

export function validarDespesaExtra(
  form: FormularioExtra,
  hoje: Date = new Date()
): { erro: string } | { despesa: DespesaExtraValida } {
  const base = lerTituloEValor(form.titulo, form.valor);
  if ('erro' in base) return base;
  const data = lerDataEscrita(form.data, hoje);
  if ('erro' in data) return data;
  const litros = lerLitros(form.litros);
  if ('erro' in litros) return litros;
  return { despesa: { ...base, data: data.iso, ...(litros.litros !== undefined ? { litros: litros.litros } : {}) } };
}

// Edição: devolve só o que mudou (vazio = nada a guardar). A data só é validada se tiver sido
// mudada, para não obrigar a corrigir datas guardadas por versões anteriores (ou que faltam)
export function validarEdicaoExtra(
  original: Despesa,
  form: FormularioExtra,
  hoje: Date = new Date()
): { erro: string } | { campos: CamposExtra } {
  const base = lerTituloEValor(form.titulo, form.valor);
  if ('erro' in base) return base;

  const campos: CamposExtra = {};
  if (base.titulo !== original.titulo) campos.titulo = base.titulo;
  if (base.valor !== centimos(original.valor)) campos.valor = base.valor;
  // As antigas, sem categoria, contam como "outros": deixá-las em "outros" não é uma mudança
  if (form.categoria && form.categoria !== (original.categoria ?? 'outros')) campos.categoria = form.categoria;
  // As de antes desta opção foram pagas com a conta
  if (form.meioPagamento && form.meioPagamento !== (original.meioPagamento ?? 'conta')) campos.meioPagamento = form.meioPagamento;
  if (form.litros !== undefined) {
    const litros = lerLitros(form.litros);
    if ('erro' in litros) return litros;
    if (litros.litros !== original.litros) campos.litros = litros.litros ?? 0;
  }
  if (form.data.trim() !== textoDataGuardada(original.data)) {
    const data = lerDataEscrita(form.data, hoje);
    if ('erro' in data) return data;
    if (data.iso !== original.data) campos.data = data.iso;
  }
  return { campos };
}

export interface FormularioMensal {
  titulo: string;
  valor: string;
  diaDebito: string;
  categoria?: Categoria;
}

export interface DespesaMensalValida {
  titulo: string;
  valor: number;
  diaDebito?: number;
  categoria?: Categoria;
}

// divisao: a chave presente com undefined = deixar de dividir (ver DespesasFixasDB.update)
// unidadeConsumo: igual (a chave com undefined apaga a unidade)
export type CamposMensal = Partial<Pick<Despesa, 'titulo' | 'valor' | 'diaDebito' | 'categoria' | 'divisao' | 'variavel' | 'unidadeConsumo' | 'debitoAutomatico'>>;

// Paga-se sozinha no dia de débito: tem dia, valor fixo e o débito automático não foi desligado
export const temDebitoAutomatico = (d: Pick<Despesa, 'diaDebito' | 'variavel' | 'debitoAutomatico'>) =>
  !!d.diaDebito && !d.variavel && d.debitoAutomatico !== false;

export function validarDespesaMensal(form: FormularioMensal): { erro: string } | { despesa: DespesaMensalValida } {
  const base = lerTituloEValor(form.titulo, form.valor);
  if ('erro' in base) return base;
  const diaTexto = form.diaDebito.trim();
  let diaDebito: number | undefined;
  if (diaTexto) {
    const lido = lerDia(diaTexto);
    if (lido === null) return { erro: t('Dia de débito deve ser entre 1 e 31') };
    diaDebito = lido;
  }
  return {
    despesa: {
      ...base,
      ...(diaDebito !== undefined ? { diaDebito } : {}),
      ...(form.categoria ? { categoria: form.categoria } : {}),
    },
  };
}

// Edição: só o que mudou (vazio = nada a guardar)
export function validarEdicaoMensal(original: Despesa, form: FormularioMensal): { erro: string } | { campos: CamposMensal } {
  const lido = validarDespesaMensal(form);
  if ('erro' in lido) return lido;
  const { titulo, valor, diaDebito, categoria } = lido.despesa;
  const campos: CamposMensal = {};
  if (titulo !== original.titulo) campos.titulo = titulo;
  // Dividida: o que se escreve é o total (original.valor é só a parte de quem paga)
  if (valor !== centimos(original.valorTotal ?? original.valor)) campos.valor = valor;
  if (diaDebito !== original.diaDebito) campos.diaDebito = diaDebito;
  if (categoria !== original.categoria) campos.categoria = categoria;
  return { campos };
}

// ---- Despesas fixas de um mês ----

export interface LinhaMensal {
  chave: string;
  // A despesa (para debitar/editar), ou null num pagamento de uma despesa que já não conta
  // neste mês (terminada ou apagada): fica só como histórico
  fixa: Despesa | null;
  titulo: string;
  valor: number; // paga: o valor que foi pago; senão o valor atual da despesa
  valorPago?: number;
  valorRestante?: number;
  estado: EstadoFixa;
  categoria?: Categoria;
  diaDebito?: number;
  dataPagamento?: string; // ISO, só nas pagas
  // Já não se repete: o histórico de uma despesa terminada, ou este é o último mês em que conta
  terminada: boolean;
}

export interface ResumoMensal {
  linhas: LinhaMensal[];
  totais: { debitadas: number; porDebitar: number; total: number };
}

// As linhas do ecrã para um mês: as despesas que contam nesse mês, com o que lhes aconteceu,
// e depois os pagamentos desse mês de despesas que entretanto deixaram de contar.
// Os totais são os de calculos.ts (separarDespesasFixas): a soma das linhas dá o mesmo
export function resumoDespesasMensais(fixas: Despesa[], pagamentosDoMes: PagamentoFixa[], mes: Mes): ResumoMensal {
  const doMes = pagamentosDoMes.filter((p) => p.mes === mes);
  const ativas = fixas.filter((f) => ativaNoMes(f, mes));

  const linhas: LinhaMensal[] = ativas.map((fixa) => {
    const pagamento = pagamentoNoMes(fixa, doMes, mes);
    const estado: EstadoFixa = pagamento?.estado ?? 'por-pagar';
    const valorPago = estado === 'pago' || estado === 'parcial' ? pagamento!.valor : undefined;
    const valorRestante = estado === 'parcial' ? centimos(fixa.valor - (pagamento?.valor ?? 0)) : undefined;
    return {
      chave: fixa.id,
      fixa,
      titulo: fixa.titulo,
      valor: estado === 'pago' ? pagamento!.valor : estado === 'parcial' ? pagamento!.valor : fixa.valor,
      valorPago,
      valorRestante,
      estado,
      categoria: fixa.categoria,
      diaDebito: fixa.diaDebito,
      // Os pagamentos marcados na própria despesa (versão anterior) não têm data
      dataPagamento: estado === 'pago' || estado === 'parcial' ? doMes.find((p) => p.fixaId === fixa.id)?.data : undefined,
      terminada: !!fixa.fim && fixa.fim <= mes,
    };
  });

  for (const p of doMes) {
    if (p.estado === 'pago' && !ativas.some((f) => f.id === p.fixaId)) {
      linhas.push({
        chave: p.id,
        fixa: null,
        titulo: p.titulo,
        valor: p.valor,
        estado: 'pago',
        dataPagamento: p.data,
        terminada: true,
      });
    }
  }

  return { linhas, totais: separarDespesasFixas(fixas, pagamentosDoMes, mes) };
}

// Confirmação de apagar uma despesa fixa (DespesasFixasDB.terminar). Paga este mês: ainda aparece
// este mês (o dinheiro já saiu); por pagar: desaparece já
export function mensagemApagarMensal(titulo: string, pagaEsteMes: boolean): string {
  return pagaEsteMes
    ? t('"{titulo}" já foi paga este mês: fica neste mês como paga e deixa de aparecer a partir do próximo. Os meses passados não mudam.', { titulo })
    : t('"{titulo}" deixa de aparecer a partir deste mês. Os meses passados em que foi paga não mudam.', { titulo });
}

// Confirmação de desfazer um pagamento: o dinheiro volta e a despesa fica por pagar (sem outro estado)
// Com débito automático avisa-se logo que ele não a volta a pagar este mês (só pausa; no mês seguinte continua)
export function mensagemDesfazerPagamento(titulo: string, valor: number, comDebitoAutomatico = false): string {
  const base = t('{valor} € voltam para a conta e "{titulo}" fica por pagar.', {
    titulo,
    valor: valor.toFixed(2).replace('.', ','),
  });
  return comDebitoAutomatico
    ? `${base} ${t('O débito automático não a volta a pagar este mês (só no mês seguinte); se a quiseres pagar, fá-lo à mão.')}`
    : base;
}

// "✓ Pago em 05/10" ou "Por pagar · dia 20"
export function textoEstado(linha: Pick<LinhaMensal, 'estado' | 'dataPagamento' | 'diaDebito' | 'valorPago' | 'valorRestante'>): string {
  switch (linha.estado) {
    case 'pago': {
      const dia = diaEMes(linha.dataPagamento);
      return dia ? t('✓ Pago em {dia}', { dia }) : t('✓ Pago');
    }
    case 'parcial': {
      const pago = centimos(linha.valorPago ?? 0).toFixed(2).replace('.', ',');
      const falta = centimos(linha.valorRestante ?? 0).toFixed(2).replace('.', ',');
      return t('Parcial · {pago} € pagos · faltam {falta} €', { pago, falta });
    }
    default:
      return linha.diaDebito ? t('Por pagar · dia {dia}', { dia: linha.diaDebito }) : t('Por pagar');
  }
}
