import { t } from '../i18n';
import { centimos } from '../services/calculos';
import type { Categoria, Poupanca, PrevisaoCartao, ValorCategoria } from '../services/tipos';
import { projetarTotal } from './rendimento';

// O simulador "e se…", sem React Native, para os testes (__tests__/simulacao.test.ts).
// Parte do que JÁ foi gasto (o mês atual, ou a média dos últimos meses completos), por categoria, e mexe nisso com
// contas simples: nada é guardado nem enviado, por isso o resultado muda a cada tecla. Não há previsões, a não ser
// a do cartão de alimentação (se chega até ao fim do mês).

const valorValido = (valor: number | undefined) => (Number.isFinite(valor) && (valor as number) > 0 ? centimos(valor as number) : 0);

// Um valor novo só conta se for um número não negativo; senão fica o de agora
const novoOu = (novo: number | undefined, atual: number) => (novo !== undefined && Number.isFinite(novo) && novo >= 0 ? centimos(novo) : centimos(atual));

// ---- Gastos por categoria: e se gastasse X em vez de Y? ----
//
// Em cada categoria escreve-se o valor novo (em vez de "cortar"): mais baixo poupa, mais alto gasta mais, e passar
// dinheiro de uma categoria para outra dá zero. Só mudam as categorias com um valor novo válido (≥ 0).

export interface GastosSimulados {
  gastos: number; // o total, já com as mudanças
  gastosAtuais: number; // o total sem mudanças
  poupado: number; // gastosAtuais - gastos (positivo: poupa-se; negativo: gasta-se mais)
  novosAplicados: Partial<Record<Categoria, number>>; // o valor novo de cada categoria que mesmo mudou
  mexeu: boolean;
}

export function simularGastos(base: ValorCategoria[], novos: Partial<Record<Categoria, number | undefined>>): GastosSimulados {
  const atualDe = (categoria: Categoria) => base.find((c) => c.categoria === categoria)?.valor ?? 0;
  const gastosAtuais = centimos(base.reduce((soma, c) => soma + c.valor, 0));
  const novosAplicados: Partial<Record<Categoria, number>> = {};
  let gastos = gastosAtuais;
  for (const [categoria, escrito] of Object.entries(novos) as [Categoria, number | undefined][]) {
    if (escrito === undefined || !Number.isFinite(escrito) || escrito < 0) continue;
    const novo = centimos(escrito);
    const atual = centimos(atualDe(categoria));
    if (novo === atual) continue;
    novosAplicados[categoria] = novo;
    gastos = centimos(gastos + novo - atual);
  }
  return { gastos, gastosAtuais, poupado: centimos(gastosAtuais - gastos), novosAplicados, mexeu: Object.keys(novosAplicados).length > 0 };
}

/** A frase por baixo do número grande: o que muda em relação a não mexer em nada. */
export function textoVersus(diferenca: number, original: number, mexeu: boolean): string {
  if (!mexeu) return t('Sem mudanças');
  const antes = `${original.toFixed(2)} €`;
  if (diferenca === 0) return t('Fica igual ({original})', { original: antes });
  const valor = `${Math.abs(diferenca).toFixed(2)} €`;
  return diferenca > 0
    ? t('Com as mudanças sobram mais {valor} (eram {original})', { valor, original: antes })
    : t('Com as mudanças sobram menos {valor} (eram {original})', { valor, original: antes });
}

// ---- A conta: partir do que se recebe por mês ----
//
//   livre antes de gastar = o que recebo - o que ponho de lado nas poupanças
//   sobra                 = livre antes de gastar - tudo o que se gastou com a conta (despesas mensais e do dia a dia)
//                           - as despesas mensais que ainda faltam pagar este mês (só no mês atual)
//
// "Gastos" é o que realmente se gastou, por categoria (este mês até hoje, ou a média por mês dos meses completos).
// As que ainda faltam pagar são valores conhecidos (o previsto das despesas mensais), não uma estimativa de gastos.
// Não usa o saldo.

export interface PlanoMes {
  receita: number; // o que se recebe por mês (o salário)
  poupancas: number; // o que se põe de lado por mês, somadas todas as poupanças
  gastos: ValorCategoria[]; // o que se gastou em cada categoria, pago com a conta
  porPagar?: number; // as despesas mensais que ainda faltam pagar este mês (0 na média: já contam nos gastos)
}

export interface AjustesMes {
  receita?: number; // um valor novo (vazio = o de agora)
  poupancas?: number; // o total novo por mês (vem de simularPoupancas)
  novos: Partial<Record<Categoria, number | undefined>>; // o valor novo em cada categoria
}

export const SEM_AJUSTES_MES: AjustesMes = { novos: {} };

export interface ResultadoMes {
  receita: number;
  poupancas: number;
  gastos: number; // o que se gasta, já com as mudanças
  porPagar: number; // as despesas mensais que ainda faltam pagar este mês
  antesDeGastar: number; // receita - poupanças: o que fica livre
  sobra: number; // antesDeGastar - gastos - porPagar (negativo: gasta-se mais do que se recebe)
  poupado: number; // o que as mudanças nas categorias poupam (negativo: gasta-se mais)
  novosAplicados: Partial<Record<Categoria, number>>;
  diferenca: number; // sobra - a sobra do plano sem mudanças
  mexeu: boolean;
}

export function simularMes(plano: PlanoMes, ajustes: AjustesMes): ResultadoMes {
  const gastosSim = simularGastos(plano.gastos, ajustes.novos);
  const antesNormal = centimos(plano.receita - plano.poupancas);
  const porPagar = centimos(Math.max(0, plano.porPagar ?? 0));
  const sobraNormal = centimos(antesNormal - gastosSim.gastosAtuais - porPagar);

  const receita = novoOu(ajustes.receita, plano.receita);
  const poupancas = novoOu(ajustes.poupancas, plano.poupancas);
  const antesDeGastar = centimos(receita - poupancas);
  const sobra = centimos(antesDeGastar - gastosSim.gastos - porPagar);
  return {
    receita,
    poupancas,
    gastos: gastosSim.gastos,
    porPagar,
    antesDeGastar,
    sobra,
    poupado: gastosSim.poupado,
    novosAplicados: gastosSim.novosAplicados,
    diferenca: centimos(sobra - sobraNormal),
    mexeu: gastosSim.mexeu || sobra !== sobraNormal || antesDeGastar !== antesNormal,
  };
}

// ---- O cartão de alimentação por mês: o que carrega menos o que se gasta com ele ----

export interface ResultadoCartaoMes {
  carga: number; // o que o cartão carrega por mês
  gastos: number; // o que se gasta com o cartão, já com as mudanças
  sobra: number; // carga - gastos (negativo: o cartão não chega e o resto sai da conta)
  poupado: number; // o que as mudanças poupam (negativo: gasta-se mais); é também a diferença na sobra
  novosAplicados: Partial<Record<Categoria, number>>;
  mexeu: boolean;
}

export function simularCartaoMes(cargaMensal: number, gastos: ValorCategoria[], novos: Partial<Record<Categoria, number | undefined>>): ResultadoCartaoMes {
  const sim = simularGastos(gastos, novos);
  const carga = centimos(cargaMensal);
  return { carga, gastos: sim.gastos, sobra: centimos(carga - sim.gastos), poupado: sim.poupado, novosAplicados: sim.novosAplicados, mexeu: sim.mexeu };
}

// ---- Poupanças: e se pusesse mais (ou menos) de lado por mês? ----
//
// A contribuição de cada poupança é a de agora (valorMensal, já em euros). A nova é o que se escreve: quanto
// vale tudo daqui a 6 meses e a 1 ano (com os juros de cada uma, como no ecrã das Poupanças) e quanto sobra
// por mês. Vale a partir do próximo salário: a previsão deste mês não muda (o que ainda falta enviar este
// mês conta-se na parte "outras mudanças").

export interface ResumoPoupancas {
  mensal: number; // o que se põe de lado por mês, somadas todas
  em6Meses: number; // o que valem todas daqui a 6 meses
  emUmAno: number; // e daqui a 1 ano
}

export interface SimulacaoPoupancas {
  atual: ResumoPoupancas;
  simulado: ResumoPoupancas;
  diferencaMensal: number; // simulado - atual (positivo: poupa-se mais por mês, sobra menos na conta)
  diferenca6Meses: number;
  diferencaUmAno: number;
  mexeu: boolean; // alguma contribuição mudou mesmo?
}

/** `novas`: a contribuição mensal escrita para cada poupança (id); sem valor, vazio ou negativo fica como está. */
export function simularPoupancas(poupancas: Poupanca[], novas: Record<string, number | undefined>): SimulacaoPoupancas {
  const atualDe = (p: Poupanca) => Math.max(0, p.valorMensal ?? 0);
  const novaDe = (p: Poupanca) => {
    const escrito = novas[p.id];
    return escrito !== undefined && Number.isFinite(escrito) && escrito >= 0 ? centimos(escrito) : atualDe(p);
  };
  const resumo = (contribuicaoDe: (p: Poupanca) => number): ResumoPoupancas => ({
    mensal: centimos(poupancas.reduce((soma, p) => soma + contribuicaoDe(p), 0)),
    em6Meses: projetarTotal(poupancas, contribuicaoDe, 6).saldoFinal,
    emUmAno: projetarTotal(poupancas, contribuicaoDe, 12).saldoFinal,
  });
  const atual = resumo(atualDe);
  const simulado = resumo(novaDe);
  return {
    atual,
    simulado,
    diferencaMensal: centimos(simulado.mensal - atual.mensal),
    diferenca6Meses: centimos(simulado.em6Meses - atual.em6Meses),
    diferencaUmAno: centimos(simulado.emUmAno - atual.emUmAno),
    mexeu: poupancas.some((p) => novaDe(p) !== centimos(atualDe(p))),
  };
}

/** "+50.00 €" / "-12.50 €" / "0.00 €": a diferença com o sinal à frente. */
export const textoDiferenca = (diferenca: number): string =>
  `${diferenca > 0 ? '+' : diferenca < 0 ? '-' : ''}${Math.abs(centimos(diferenca)).toFixed(2)} €`;

// ---- Cartão de alimentação: chega até ao fim do mês? (a única previsão) ----
//
// Os gastos pagos com o cartão não saem da conta nem entram na previsão dela. O cartão tem o seu saldo, carrega no
// dia do salário e não fica negativo: o que ele não chegar para pagar sai da conta.
//
//   previsão do cartão = saldo + o que ainda carrega - o que se gasta até ao fim do mês
//   o que falta        = o que passa do saldo (sai da conta)
//   conta no fim       = previsão da conta - o que falta do cartão

export interface AjustesCartao {
  gastoPorDia?: number; // quanto se passava a gastar por dia com o cartão (vazio = a média de agora)
  carga?: number; // quanto o cartão ainda carregava este mês (vazio = o de agora)
  gastoExtra: number; // um gasto com o cartão que ainda não estava previsto
}

export const SEM_AJUSTES_CARTAO: AjustesCartao = { gastoExtra: 0 };

export interface SimulacaoCartao {
  carga: number;
  estimativaGastos: number; // o que se gasta com o cartão até ao fim do mês, com as mudanças
  previsaoFinal: number; // o saldo do cartão no fim do mês (negativo: não chega)
  falta: number; // o que sairia da conta
  contaFinal: number; // a previsão da conta no fim do mês, já sem o que o cartão não chegou a pagar
  diferencaConta: number; // contaFinal simulada - contaFinal sem mudanças
  diasQueDura: number | null; // dias que o saldo de agora dá ao ritmo de gasto (null: dura até ao fim do mês ou sem gastos)
  mexeu: boolean;
}

export function simularCartao(
  cartao: PrevisaoCartao,
  previsaoConta: number,
  diasRestantes: number,
  ajustes: AjustesCartao
): SimulacaoCartao {
  const normal = (carga: number, estimativa: number) => {
    const final = centimos(cartao.saldo + carga - estimativa);
    const falta = Math.max(0, -final);
    return { final, falta, conta: centimos(previsaoConta - falta) };
  };
  const base = normal(cartao.cargaPorReceber, cartao.estimativaGastos);

  const gastoPorDia = novoOu(ajustes.gastoPorDia, cartao.mediaDiaria);
  const carga = novoOu(ajustes.carga, cartao.cargaPorReceber);
  const gastoExtra = valorValido(ajustes.gastoExtra);
  // A média por dia só vale para os dias que faltam; os recorrentes e o gasto extra somam-se
  const estimativaGastos = centimos(gastoPorDia * diasRestantes + cartao.gastosRecorrentes + gastoExtra);
  const sim = normal(carga, estimativaGastos);
  const porDia = gastoPorDia + (diasRestantes > 0 ? (cartao.gastosRecorrentes + gastoExtra) / diasRestantes : 0);
  const dura = porDia > 0 ? Math.floor(cartao.saldo / porDia) : null;
  return {
    carga,
    estimativaGastos,
    previsaoFinal: sim.final,
    falta: sim.falta,
    contaFinal: sim.conta,
    diferencaConta: centimos(sim.conta - base.conta),
    diasQueDura: dura !== null && dura < diasRestantes ? dura : null,
    mexeu: estimativaGastos !== centimos(cartao.estimativaGastos) || carga !== centimos(cartao.cargaPorReceber),
  };
}
