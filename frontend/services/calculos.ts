import { t } from '../i18n';
import { lerData, parseValor } from '../utils/formatos';
import type {
  ConfigPPRPoupanca,
  Contribuicao,
  DadosFolhaMes,
  Despesa,
  Divida,
  FinancialData,
  Mes,
  PagamentoFixa,
  Poupanca,
  Recebimento,
  SalarioConfig,
} from './tipos';

// Regras de cálculo da app, sem Firebase: são as mesmas para todos os ecrãs, para o Excel
// e para os testes (__tests__/calculos.test.ts). O "hoje" é parâmetro para poder ser testado.
//
//   Saldo Disponível = conta corrente. Tudo o que sai ou entra mexe na conta:
//     - dia do salário: entra o salário e saem logo o PPR e a Poupança
//     - despesas mensais: saem quando são debitadas (fica um PagamentoFixa por mês)
//     - despesas extras: saem quando são registadas (e voltam se forem apagadas)
//   Saldo Previsto = Saldo Disponível - despesas mensais ainda por pagar este mês
//   Cartão de alimentação: só informativo, fora dos saldos

// Somas repetidas de decimais acumulam erro (ex.: 45.99999999): comparar sempre ao cêntimo.
// "|| 0" evita o -0 (que aparecia como "-0.00 €") e trata NaN como 0
export const centimos = (valor: number) => Math.round(valor * 100) / 100 || 0;

// ---- Meses ("AAAA-MM") ----

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function mesDe(data: Date = new Date()): Mes {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

// Mês de uma data guardada ("2026-10-02" ou, das versões antigas, "02/10/2026")
export function mesDaData(data: string | undefined): Mes | null {
  const partes = data ? lerData(data) : null;
  return partes ? `${partes.ano}-${String(partes.mes).padStart(2, '0')}` : null;
}

export function somarMeses(mes: Mes, n: number): Mes {
  const [ano, m] = mes.split('-').map(Number);
  return mesDe(new Date(ano, m - 1 + n, 1));
}

export const mesSeguinte = (mes: Mes) => somarMeses(mes, 1);
export const mesAnterior = (mes: Mes) => somarMeses(mes, -1);

// "2026-10" -> "Outubro 2026" (o nome do mês é traduzido no idioma atual)
export function nomeMes(mes: Mes): string {
  const [ano, m] = mes.split('-').map(Number);
  return `${t(NOMES_MESES[m - 1])} ${ano}`;
}

// Dia 29-31 em meses mais curtos passa para o último dia do mês (senão nunca chegava)
export function diaEfetivo(dia: number, hoje: Date = new Date()): number {
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  return Math.min(dia, ultimoDia);
}

// ---- Despesas mensais ----

// Uma despesa mensal conta nos meses entre o início e o fim (as antigas, sem início, contam sempre).
// As anuais só contam no seu mês (mesAnual) de cada ano; sem mês escolhido não contam em nenhum
export function ativaNoMes(fixa: Despesa, mes: Mes): boolean {
  if (fixa.periodicidade === 'anual' && Number(mes.slice(5, 7)) !== fixa.mesAnual) return false;
  return (!fixa.inicio || fixa.inicio <= mes) && (!fixa.fim || mes <= fixa.fim);
}

export const eAnual = (fixa: Despesa) => fixa.periodicidade === 'anual';

// Um registo por despesa e por mês: o id fixo impede pagar a mesma despesa duas vezes no mesmo mês
export const idPagamento = (mes: Mes, fixaId: string) => `${mes}_${fixaId}`;

// Ou está paga, parcialmente paga ou por pagar: desfazer um pagamento apaga o registo.
// Um pagamento parcial continua a contar como pago, mas o que falta pagar continua em previsão.
export type EstadoFixa = 'pago' | 'parcial' | 'por-pagar';

// O registo da despesa nesse mês. Inclui o que a versão anterior guardava na própria despesa
// (debitado/mesDebitado), para nunca pagar duas vezes antes de esses dados serem convertidos
export function pagamentoNoMes(
  fixa: Despesa,
  pagamentosDoMes: PagamentoFixa[],
  mes: Mes
): { estado: EstadoFixa; valor: number } | undefined {
  const registo = pagamentosDoMes.find((p) => p.fixaId === fixa.id && p.mes === mes);
  if (registo) {
    const estado: EstadoFixa = registo.parcial ? 'parcial' : 'pago';
    return { estado, valor: registo.valor };
  }
  if (fixa.debitado && fixa.mesDebitado === mes) return { estado: 'pago', valor: fixa.valor };
  return undefined;
}

export function estadoNoMes(fixa: Despesa, pagamentosDoMes: PagamentoFixa[], mes: Mes): EstadoFixa {
  return pagamentoNoMes(fixa, pagamentosDoMes, mes)?.estado ?? 'por-pagar';
}

// Débito à mão: a partir do dia de débito. Sem dia definido (despesas antigas), a qualquer altura
export function podeDebitar(diaDebito: number | undefined, hoje: Date = new Date()): boolean {
  if (!diaDebito) return true;
  return hoje.getDate() >= diaEfetivo(diaDebito, hoje);
}

// Débito automático: só despesas com dia definido, a contar este mês, já no dia, por pagar e cujo
// pagamento não foi desfeito à mão este mês (a API guarda essa marca na despesa; aqui só a da versão anterior)
export function deveDebitarAutomaticamente(
  fixa: Despesa,
  pagamentosDoMes: PagamentoFixa[],
  hoje: Date = new Date()
): boolean {
  const mes = mesDe(hoje);
  return (
    !!fixa.diaDebito &&
    ativaNoMes(fixa, mes) &&
    !pagamentoNoMes(fixa, pagamentosDoMes, mes) &&
    fixa.anuladoMes !== mes &&
    podeDebitar(fixa.diaDebito, hoje)
  );
}

// Valor do PPR ou da Poupança: percentagem do salário ou valor fixo.
// Sem configuração usa as percentagens antigas (FinancialData) e por fim os valores por defeito
function calcularValorConfigurado(
  tipo: 'percentagem' | 'valor' | undefined,
  valor: string | undefined,
  percentagemAntiga: string | undefined,
  percentagemDefeito: number,
  salarioValor: number
): number {
  if (tipo === 'valor') return parseValor(valor);
  // Campo vazio (ex.: a meio de escrever) usa o valor por defeito, mas "0" é mesmo 0%
  const texto = tipo ? valor : percentagemAntiga;
  const percentagem = texto?.trim() ? parseValor(texto) : percentagemDefeito;
  return salarioValor * (percentagem / 100);
}

// Texto para mostrar ao lado do PPR/Poupança: a percentagem configurada ou "valor fixo"
export function descricaoConfigurada(
  tipo: 'percentagem' | 'valor' | undefined,
  valor: string | undefined,
  percentagemAntiga: string | undefined,
  percentagemDefeito: number
): string {
  if (tipo === 'valor') return 'valor fixo';
  const texto = tipo ? valor : percentagemAntiga;
  return `${texto?.trim() ? parseValor(texto) : percentagemDefeito}%`;
}

export function calcularPPRComConfig(
  config: ConfigPPRPoupanca | null | undefined,
  financial: FinancialData | null | undefined,
  salarioValor: number
): number {
  return calcularValorConfigurado(config?.pprTipo, config?.pprValor, financial?.pprPercentagem, 10, salarioValor);
}

export function calcularPoupancaComConfig(
  config: ConfigPPRPoupanca | null | undefined,
  financial: FinancialData | null | undefined,
  salarioValor: number
): number {
  return calcularValorConfigurado(
    config?.poupancaTipo,
    config?.poupancaValor,
    financial?.poupancaPercentagem,
    15,
    salarioValor
  );
}

// Salário configurado na tab Salário ou, se ainda não houver, o da versão anterior
export function valorSalarioBase(
  salarioConfig: SalarioConfig | null | undefined,
  financial: FinancialData | null | undefined
): number {
  return parseValor(salarioConfig?.valor || financial?.salario);
}

// Dias de segunda a sexta do mês de `data` (o mesmo cálculo do backend, para a previsão no ecrã do Salário)
export function diasUteisDoMes(data: Date = new Date()): number {
  const ultimoDia = new Date(data.getFullYear(), data.getMonth() + 1, 0).getDate();
  let total = 0;
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const semana = new Date(data.getFullYear(), data.getMonth(), dia).getDay();
    if (semana !== 0 && semana !== 6) total++;
  }
  return total;
}

// Contribuição mensal de uma poupança: percentagem do salário ou valor fixo
export function contribuicaoDe(poupanca: Pick<Poupanca, 'tipo' | 'valor'>, salarioValor: number): number {
  const valor = parseValor(poupanca.valor);
  return centimos(poupanca.tipo === 'valor' ? valor : salarioValor * (valor / 100));
}

const ePPR = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() === 'ppr';

// No dia do salário entra o salário e saem logo as contribuições das poupanças, como transferências.
// Com a lista de poupanças (mesmo vazia = nenhuma contribuição) usa a lista; sem lista
// (dados ainda não convertidos), a configuração antiga (PPR + Poupança)
export function calcularRecebimento(
  salario: SalarioConfig,
  configPPR: ConfigPPRPoupanca | null | undefined,
  financial: FinancialData | null | undefined,
  poupancas?: Poupanca[] | null
): Recebimento {
  const valor = parseValor(salario.valor);
  const contribuicoes: Contribuicao[] = poupancas
    ? poupancas
        .filter((p) => (p.contribuicaoAutomatica ?? true) && p.diaContribuicao == null)
        .map((p) => ({ poupancaId: p.id, nome: p.nome, valor: contribuicaoDe(p, valor) }))
    : [
        { nome: 'PPR', valor: centimos(calcularPPRComConfig(configPPR, financial, valor)) },
        { nome: 'Poupança', valor: centimos(calcularPoupancaComConfig(configPPR, financial, valor)) },
      ];
  const ppr = centimos(contribuicoes.filter((c) => ePPR(c.nome)).reduce((s, c) => s + c.valor, 0));
  const total = centimos(contribuicoes.reduce((s, c) => s + c.valor, 0));
  return { salario: valor, ppr, poupanca: centimos(total - ppr), liquido: centimos(valor - total), contribuicoes };
}

// ---- Dívidas ----

// Quanto falta pagar: o valor em falta no mês "desde" menos as prestações pagas desde então
export function calcularDivida(
  divida: Divida,
  pagamentosDaPrestacao: PagamentoFixa[],
  prestacao?: number
): { emFalta: number; pago: number; mesesEmFalta: number | null } {
  const pago = centimos(
    pagamentosDaPrestacao
      .filter((p) => p.fixaId === divida.fixaId && p.estado === 'pago' && p.mes >= divida.desde)
      .reduce((s, p) => s + p.valor, 0)
  );
  const emFalta = Math.max(0, centimos(divida.valorInicial - pago));
  const mesesEmFalta = prestacao && prestacao > 0 ? Math.ceil(centimos(emFalta / prestacao)) : null;
  return { emFalta, pago, mesesEmFalta };
}

// Despesas mensais de um mês: o que já foi pago (valor pago) e o que falta pagar (valor atual da despesa).
// Os pagamentos de despesas entretanto terminadas também contam: são histórico desse mês
export function separarDespesasFixas(
  fixas: Despesa[],
  pagamentosDoMes: PagamentoFixa[],
  mes: Mes
): { debitadas: number; porDebitar: number; total: number } {
  const pagosRegistados = pagamentosDoMes.filter((p) => p.mes === mes && p.estado === 'pago');
  // Pagos na versão anterior (marcados na própria despesa, ainda sem registo)
  const pagosAntigos = fixas.filter(
    (f) => !pagamentosDoMes.some((p) => p.fixaId === f.id && p.mes === mes) && f.debitado && f.mesDebitado === mes
  );
  const debitadas = [...pagosRegistados, ...pagosAntigos].reduce((s, p) => s + p.valor, 0);
  const porDebitar = fixas
    .filter((f) => ativaNoMes(f, mes))
    .reduce((s, f) => {
      const pagamento = pagamentoNoMes(f, pagamentosDoMes, mes);
      if (pagamento?.estado === 'parcial') return s + Math.max(0, centimos(f.valor - pagamento.valor));
      if (pagamento?.estado === 'pago') return s;
      return s + f.valor;
    }, 0);
  return { debitadas: centimos(debitadas), porDebitar: centimos(porDebitar), total: centimos(debitadas + porDebitar) };
}

// ---- Totais da folha do mês (os mesmos do livro Excel) ----
//   Sobra             = Lucro (sem as linhas informativas, como o cartão de alimentação) - Despesas
//   Total para extras = Sobra - Poupança
//   Total             = Total para extras - Despesas do Mês
//   Previsão          = Saldo Conta - Falta (o que ainda falta pagar)
// O bloco Anual é informativo (as anuais entram nas Despesas/Falta do mês em que se pagam)
export interface TotaisFolha {
  lucro: number;
  despesas: number;
  poupanca: number;
  despesasMes: number;
  anual: number;
  sobra: number;
  totalParaExtras: number;
  total: number;
  falta: number;
  previsao: number | null; // sem Saldo Conta não há previsão
  saldoPoupanca: number;
  totalAPagar: number;
}

const somaLinhas = (linhas: { valor: number; informativo?: boolean }[]) =>
  centimos(linhas.filter((l) => !l.informativo).reduce((s, l) => s + l.valor, 0));

export function totaisFolha(dados: DadosFolhaMes): TotaisFolha {
  const lucro = somaLinhas(dados.lucro);
  const despesas = somaLinhas(dados.despesas);
  const poupanca = somaLinhas(dados.poupanca);
  // Os gastos pagos com o cartão de alimentação não contam: o dinheiro do cartão é à parte do salário e da conta
  const despesasMes = somaLinhas(dados.despesasMes.filter((l) => !l.cartaoAlimentacao));
  const sobra = centimos(lucro - despesas);
  const totalParaExtras = centimos(sobra - poupanca);
  const falta = somaLinhas(dados.falta);
  return {
    lucro,
    despesas,
    poupanca,
    despesasMes,
    anual: somaLinhas(dados.anual),
    sobra,
    totalParaExtras,
    total: centimos(totalParaExtras - despesasMes),
    falta,
    previsao: dados.saldoConta === undefined ? null : centimos(dados.saldoConta - falta),
    saldoPoupanca: somaLinhas(dados.saldoPoupanca),
    totalAPagar: somaLinhas(dados.totalAPagar),
  };
}
