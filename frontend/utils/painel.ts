import { t } from '../i18n';
import { centimos, diaEfetivo, eAnual, mesDe, somarMeses, totaisFolha } from '../services/calculos';
import type { DadosFolhaMes, Despesa, Mes, PagamentoFixa } from '../services/tipos';
import { resumoDespesasMensais } from './ecrasDespesas';
import { lerData } from './formatos';

// Lógica do painel (Início) e dos números do Resumo do mês, sem React Native nem Firebase,
// para poder ser testada diretamente (__tests__/painel.test.ts).
// As regras de dinheiro continuam em services/calculos.ts: aqui só se escolhe e arruma o que mostrar

// ---- "Este mês": os números principais da folha do mês ----

export interface NumerosMes {
  entrou: number; // Lucro, sem as linhas informativas (o cartão de alimentação fica à parte)
  gasto: number; // Despesas (mensais) + Despesas do Mês (extras)
  poupado: number; // Poupança
  total: number; // o Total da folha: Entrou - Gasto - Poupado
}

// Os mesmos totais da folha (totaisFolha), só agrupados: o painel e o Resumo do mês dão sempre o mesmo
export function numerosDoMes(folha: DadosFolhaMes): NumerosMes {
  const totais = totaisFolha(folha);
  return { entrou: totais.lucro, gasto: centimos(totais.despesas + totais.despesasMes), poupado: totais.poupanca, total: totais.total };
}

// ---- Distribuição do salário (gráfico do Resumo do mês) ----

export type ChaveFatia = 'poupancas' | 'despesas' | 'extras' | 'cartao' | 'livre';

export interface FatiaSalario {
  chave: ChaveFatia;
  nome: string;
  valor: number;
}

export interface DistribuicaoSalario {
  salario: number; // Lucro do mês (sem as linhas informativas)
  entraNaConta: number; // o que fica do salário depois das poupanças
  fatias: FatiaSalario[]; // "Livre" só aparece quando sobra alguma coisa
}

// Para onde vai o salário de um mês, com os blocos da folha desse mês (o "Livre" é o Total da folha)
export function distribuicaoSalario(folha: DadosFolhaMes): DistribuicaoSalario {
  const totais = totaisFolha(folha);
  const fatias: FatiaSalario[] = [
    { chave: 'poupancas', nome: t('Poupanças'), valor: totais.poupanca },
    { chave: 'despesas', nome: t('Despesas fixas'), valor: totais.despesas },
    { chave: 'extras', nome: t('Gastos do dia a dia'), valor: totais.despesasMes },
  ];
  if (totais.total > 0) fatias.push({ chave: 'livre', nome: t('Livre'), valor: totais.total });
  return { salario: totais.lucro, entraNaConta: centimos(totais.lucro - totais.poupanca), fatias };
}

// O cartão de alimentação de um mês: o que carrega (a linha informativa "Alimen." do Lucro) e o que se gastou com ele
// (as despesas do mês pagas com o cartão). É à parte da conta: não entra nos totais da folha
export function cartaoDaFolha(folha: DadosFolhaMes): { carregado: number; gasto: number } {
  return {
    carregado: centimos(folha.lucro.filter((l) => l.informativo).reduce((soma, l) => soma + l.valor, 0)),
    gasto: centimos(folha.despesasMes.filter((l) => l.cartaoAlimentacao).reduce((soma, l) => soma + l.valor, 0)),
  };
}

// Para onde vai o que o cartão carrega num mês: o que se gastou e o que sobra. Usa a mesma forma da distribuição do
// salário: "salario" é o que o cartão carrega e "entraNaConta" é o que sobra (carregou - gastos; negativo se gastou mais)
export function distribuicaoCartao(folha: DadosFolhaMes): DistribuicaoSalario {
  const { carregado, gasto } = cartaoDaFolha(folha);
  const sobra = centimos(carregado - gasto);
  const fatias: FatiaSalario[] = [];
  if (gasto > 0) fatias.push({ chave: 'cartao', nome: t('Gasto no cartão'), valor: gasto });
  if (sobra > 0) fatias.push({ chave: 'livre', nome: t('Livre'), valor: sobra });
  return { salario: carregado, entraNaConta: sobra, fatias };
}

// Percentagem de uma fatia no salário, entre 0 e 100 (sem salário, 0)
export function percentagemDe(valor: number, salario: number): number {
  if (!(salario > 0)) return 0;
  return Math.min(100, Math.max(0, (valor / salario) * 100));
}

// ---- Próximos pagamentos: despesas fixas (e anuais deste mês) ainda por pagar ----

// atrasado: o dia de débito já passou e continua por pagar (o débito automático não conseguiu)
export type QuandoPagamento = 'atrasado' | 'hoje' | 'proximo';

export interface ProximoPagamento {
  chave: string;
  titulo: string;
  valor: number;
  // Dia em que é debitada nesse mês (29-31 passa para o último dia nos meses mais curtos).
  // As despesas antigas, sem dia de débito, não têm
  dia?: number;
  anual: boolean;
  quando: QuandoPagamento;
  emDias?: number; // só no mês atual: quantos dias faltam (0 = hoje, negativo = já passou)
}

export interface ResumoProximos {
  pagamentos: ProximoPagamento[]; // todos, pela ordem em que vão ser debitados
  total: number;
}

// As linhas 'por-pagar' do ecrã Despesas Fixas (resumoDespesasMensais), ordenadas pelo dia efetivo
// de débito; as que não têm dia ficam no fim. As pagas não entram
export function proximosPagamentos(
  fixas: Despesa[],
  pagamentosDoMes: PagamentoFixa[],
  mes: Mes,
  hoje: Date = new Date()
): ResumoProximos {
  const [ano, m] = mes.split('-').map(Number);
  const inicioDoMes = new Date(ano, m - 1, 1);
  const mesDeHoje = mesDe(hoje);

  const pagamentos = resumoDespesasMensais(fixas, pagamentosDoMes, mes)
    .linhas.filter((l) => l.estado !== 'pago' && l.fixa !== null)
    .map((l): ProximoPagamento => {
      const dia = l.diaDebito ? diaEfetivo(l.diaDebito, inicioDoMes) : undefined;
      const emDias = dia !== undefined && mes === mesDeHoje ? dia - hoje.getDate() : undefined;
      const quando: QuandoPagamento =
        mes < mesDeHoje || (emDias !== undefined && emDias < 0) ? 'atrasado' : emDias === 0 ? 'hoje' : 'proximo';
      const valor = l.estado === 'parcial' ? (l.valorRestante ?? l.valor) : l.valor;
      return { chave: l.chave, titulo: l.titulo, valor, dia, anual: !!l.fixa && eAnual(l.fixa), quando, emDias };
    })
    .sort((a, b) => (a.dia ?? 99) - (b.dia ?? 99) || a.titulo.localeCompare(b.titulo));

  return { pagamentos, total: centimos(pagamentos.reduce((s, p) => s + p.valor, 0)) };
}

// ---- Em atraso: despesas fixas de meses anteriores que ficaram por pagar ----

// Quantos meses para trás se avisa (mais antigo do que isto já não é um esquecimento recente)
export const MESES_EM_ATRASO = 3;

export interface PagamentoEmAtraso extends ProximoPagamento {
  mes: Mes; // o mês a que a despesa pertence (não o de hoje)
  fixaId: string;
}

export interface ResumoEmAtraso {
  pagamentos: PagamentoEmAtraso[]; // do mês mais antigo para o mais recente, e em cada mês pelo dia de débito
  total: number;
}

export const SEM_ATRASO: ResumoEmAtraso = { pagamentos: [], total: 0 };

// Os meses a verificar, do mais antigo para o último mês fechado (o mês de hoje não conta: ainda vai a tempo)
export function mesesEmAtraso(hoje: Date = new Date(), quantos = MESES_EM_ATRASO): Mes[] {
  const atual = mesDe(hoje);
  return Array.from({ length: quantos }, (_, i) => somarMeses(atual, i - quantos));
}

// O que ficou por pagar nos últimos meses. Cada mês fica como estava: nada passa para o seguinte nem entra
// nos totais do mês de hoje, é só um aviso (e a hipótese de pagar agora).
// Um pagamento parcial não é atraso: se pus 100 € de combustível e gastei 70, os 30 que sobram não são devidos
// (a despesa volta por inteiro no mês seguinte, sem somar o que faltou).
// As despesas antigas, sem mês de início, não entram: não se sabe desde quando contam
export function pagamentosEmAtraso(
  fixas: Despesa[],
  pagamentosPorMes: Partial<Record<Mes, PagamentoFixa[]>>,
  hoje: Date = new Date(),
  quantos = MESES_EM_ATRASO
): ResumoEmAtraso {
  const comInicio = fixas.filter((f) => !!f.inicio);
  const pagamentos = mesesEmAtraso(hoje, quantos).flatMap((mes) => {
    const doMes = pagamentosPorMes[mes] ?? [];
    return proximosPagamentos(comInicio, doMes, mes, hoje)
      .pagamentos.filter((p) => !doMes.some((reg) => reg.fixaId === p.chave && reg.parcial))
      .map((p): PagamentoEmAtraso => ({ ...p, mes, fixaId: p.chave }));
  });
  return { pagamentos, total: centimos(pagamentos.reduce((s, p) => s + p.valor, 0)) };
}

// "Em atraso", "Hoje", "Amanhã", "Daqui a 5 dias", "Dia 20" (noutro mês) ou "Sem dia de débito"
export function textoQuando(p: Pick<ProximoPagamento, 'dia' | 'quando' | 'emDias'>): string {
  if (p.dia === undefined) return t('Sem dia de débito');
  if (p.quando === 'atrasado') return t('Em atraso');
  if (p.quando === 'hoje') return t('Hoje');
  if (p.emDias === 1) return t('Amanhã');
  if (p.emDias !== undefined) return t('Daqui a {n} dias', { n: p.emDias });
  return t('Dia {dia}', { dia: p.dia });
}

// ---- Últimos gastos ----

// Data guardada -> "AAAA-MM-DD" para ordenar (as versões antigas guardavam "dd/mm/aaaa")
function chaveData(data: string | undefined): string {
  const partes = data ? lerData(data) : null;
  return partes ? `${partes.ano}-${String(partes.mes).padStart(2, '0')}-${String(partes.dia).padStart(2, '0')}` : '';
}

// As mais recentes primeiro. No mesmo dia fica a ordem em que chegaram (getDoMes já põe a última registada primeiro)
export function ultimasDespesas(extras: Despesa[], quantas = 3): Despesa[] {
  return [...extras].sort((a, b) => chaveData(b.data).localeCompare(chaveData(a.data))).slice(0, quantas);
}
