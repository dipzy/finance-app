// Tipos dos dados guardados no Firestore (ver estrutura em database.ts)

import type { DivisaoFixa } from './partilhado';

export interface FinancialData {
  salario: string;
  pprPercentagem: string;
  poupancaPercentagem: string;
  lastUpdated: string;
}

export interface UserData {
  id: string;
  email: string;
  name: string;
}

// Meses no formato "AAAA-MM" (ex.: "2026-10")
export type Mes = string;

// Categorias das despesas extras: chaves estáveis (as mesmas da API). Nome, ícone e cor em utils/categorias.ts
// Com que dinheiro foi paga uma despesa extra: a conta (Saldo Disponível) ou o cartão de alimentação
export type MeioPagamento = 'conta' | 'cartaoAlimentacao';

// O estado de uma despesa mensal na folha de um mês
export type EstadoFixaFolha = 'pago' | 'parcial' | 'por-pagar';

export type Categoria =
  | 'supermercado'
  | 'restauracao'
  | 'transportes'
  | 'carro'
  | 'combustivel'
  | 'casa'
  | 'telecomunicacoes'
  | 'saude'
  | 'lazer'
  | 'compras'
  | 'educacao'
  | 'viagens'
  | 'presentes'
  | 'outros';

export interface Despesa {
  id: string;
  titulo: string;
  valor: number;
  // Despesas extras e fixas
  data?: string; // Data ISO (AAAA-MM-DD) em que a despesa foi feita
  mes?: Mes; // Mês dessa data (para listar por mês)
  descontadaDaConta?: boolean; // O valor saiu da conta ao registar (as de versões anteriores não saíram)
  categoria?: Categoria; // Opcional em despesas fixas; as extras antigas sem categoria contam como "outros"
  meioPagamento?: MeioPagamento; // Com que dinheiro foi paga (sem isto: a conta)
  gastoRecorrenteId?: string; // Gerada por um gasto que se repete (services/gastosRecorrentes.ts)
  saldoAntes?: number; // O saldo da conta (ou do cartão) logo antes de esta despesa o debitar
  despesaPartilhadaId?: string; // A minha parte de uma despesa partilhada num grupo (muda-se no grupo)
  litros?: number; // Combustível: os litros abastecidos (para ver o preço por litro)
  // Despesas mensais (o modelo que se repete; o que foi pago em cada mês está em PagamentoFixa)
  diaDebito?: number; // Dia do mês em que é debitado (1-31)
  // Com dia de débito, paga-se sozinha nesse dia. false = só à mão (o dia é um lembrete); sem o campo = ligado
  debitoAutomatico?: boolean;
  inicio?: Mes; // Primeiro mês em que conta
  fim?: Mes; // Último mês em que conta (depois de terminada)
  // Despesas anuais (ex.: seguro do carro): só contam no mês mesAnual (1-12) de cada ano.
  // Sem mesAnual ainda não estão marcadas para nenhum mês
  periodicidade?: 'mensal' | 'anual';
  mesAnual?: number;
  // Dividida com um grupo: valor passa a ser só a minha parte (o que conta nos totais); valorTotal é o que
  // sai da conta em cada pagamento
  valorTotal?: number;
  divisao?: DivisaoFixa;
  // Valor variável (água, luz, gás): valor é só uma estimativa (a média das últimas faturas) e paga-se com a fatura
  variavel?: boolean;
  unidadeConsumo?: string; // "kWh", "m³"...: com ela pede-se o consumo de cada fatura
  // Campos da versão anterior, convertidos em PagamentoFixa na primeira utilização
  debitado?: boolean;
  mesDebitado?: Mes;
  anuladoMes?: Mes; // pagamento desfeito nesse mês: só serve para não o debitar outra vez automaticamente
}

// O pagamento de uma despesa mensal num mês ('pago': o valor saiu da conta).
// Sem registo = ainda por pagar (desfazer um pagamento apaga o registo)
export interface PagamentoFixa {
  id: string; // `${mes}_${fixaId}`: um por despesa e por mês
  fixaId: string;
  mes: Mes;
  titulo: string;
  valor: number; // valor pago (pode ser diferente do valor atual da despesa)
  data: string; // ISO
  estado: 'pago';
  parcial?: boolean; // se este pagamento cobriu só parte da despesa e ainda resta por pagar
  consumo?: number; // o consumo da fatura (kWh, m³...), se se registou
}

// ---- Folha mensal, com os mesmos blocos do livro Excel do utilizador ----
// A exportação (services/exportarExcel.ts) gera o Excel a partir disto e a importação
// (services/importarExcel.ts) lê uma folha do Excel para isto.

export interface LinhaFolha {
  titulo: string;
  valor: number;
  data?: string; // ISO, só em algumas linhas (ex.: despesas do mês)
  // Linhas que aparecem mas não entram nas contas (ex.: "Alimen." no Lucro: o cartão de alimentação)
  informativo?: boolean;
  // Só nas Despesas (mensais) vindas da API: paga (data = dia do pagamento) ou por pagar (mês atual).
  // Nos meses passados, sem registo nesse mês fica sem estado
  estado?: EstadoFixaFolha;
  cartaoAlimentacao?: boolean; // Despesas do Mês pagas com o cartão de alimentação (contam como gasto, não saíram da conta)
  valorEmFalta?: number; // Só no estado "parcial": o que falta pagar (o valor da linha é o que já foi pago)
}

export interface DadosFolhaMes {
  mes: Mes;
  lucro: LinhaFolha[]; // Ordenado, Alimentação (informativo)...
  despesas: LinhaFolha[]; // Despesas mensais / débitos diretos (Carro, Dentista, Ginásio...)
  poupanca: LinhaFolha[]; // Para onde vai a poupança do mês (Revolut/C.A, PPR...)
  despesasMes: LinhaFolha[]; // Despesas extras do mês
  anual: LinhaFolha[]; // Despesas anuais (Seguro carro, Via Verde...)
  saldoConta?: number; // "Saldo Conta"
  falta: LinhaFolha[]; // O que ainda falta pagar este mês
  saldoPoupanca: LinhaFolha[]; // Saldo de cada conta poupança (Revolut, Certificados, PPR...)
  totalAPagar: LinhaFolha[]; // Dívidas: quanto falta pagar (Carro, Dentista...)
}

// Uma conta poupança (Revolut/C.A, PPR, Trade Republic, Certificados de Aforro...):
// no dia do salário recebe a contribuição mensal (percentagem do salário ou valor fixo),
// que sai da conta corrente e se soma ao saldo dela
export interface Poupanca {
  id: string;
  nome: string;
  tipo: 'percentagem' | 'valor';
  valor: string; // contribuição mensal, como foi escrita ("10" = 10% ou 10 €, conforme o tipo)
  saldo: number; // quanto já lá está
  ordem?: number;
  contribuicaoAutomatica?: boolean; // antigas ficam automáticas, como antes
  diaContribuicao?: number; // sem dia: mesmo dia do salário
  ultimaContribuicaoMes?: Mes;
  ultimaContribuicaoEm?: string; // o dia da última contribuição (AAAA-MM-DD): "Enviada 05/10"
  contarNoPrevisto?: boolean; // manual: enquanto a deste mês não for enviada, sai do previsto (por defeito sim)
  valorMensal?: number; // a contribuição do mês em euros (as percentagens são do salário de agora)
  taxaAnual?: number; // juro anual bruto em %: com ela a app estima o rendimento (num PPR é só uma simulação)
  retencao?: number; // imposto retido sobre os juros em % (28 por defeito)
  jurosAutomaticos?: boolean; // a app soma os juros ao saldo no fim de cada mês
  jurosMes?: number; // o que rende por mês ao saldo de agora, já sem imposto
  jurosRecebidos?: number; // o que a app já somou ao saldo em juros (sem imposto)
}

// Quanto vale uma poupança daqui a N meses à taxa dada (GET /api/poupancas/{id}/projecao)
export interface ProjecaoPoupanca {
  meses: number;
  taxaAnual: number;
  retencao: number;
  saldoInicial: number;
  contribuicaoMensal: number;
  saldoFinal: number;
  contribuicoes: number; // o que se vai entregar nesse tempo
  jurosBrutos: number;
  jurosLiquidos: number;
  pontos: { mes: number; saldo: number }[]; // o mês 0 é o saldo de hoje
}

// A parte de uma poupança no dia do salário
export interface Contribuicao {
  poupancaId?: string; // sem id: configuração antiga (PPR/Poupança) ainda sem lista de poupanças
  nome: string;
  valor: number;
}

// O que aconteceu no dia do salário (para mostrar e para o histórico)
export interface Recebimento {
  salario: number;
  ppr: number; // contribuições das poupanças chamadas "PPR"
  poupanca: number; // contribuições de todas as outras poupanças
  liquido: number; // o que entrou de facto na conta: salário - todas as contribuições
  contribuicoes?: Contribuicao[];
  cartaoAlimentacao?: number; // o que carregou no cartão de alimentação nesse dia
}

// Uma dívida (ex.: crédito do carro): quanto faltava pagar no mês "desde"; cada pagamento
// da despesa mensal ligada (a prestação) a partir desse mês desconta ao valor em falta.
// Com taxaAnual (TAN) é um crédito: valorInicial passa a ser o capital em dívida (sem os juros futuros)
// e cada prestação amortiza só o que sobra depois dos juros, do selo e dos seguros.
// Os campos do contrato são todos opcionais.
export interface Divida {
  id: string;
  titulo: string;
  valorInicial: number;
  desde: Mes;
  fixaId?: string;
  taxaAnual?: number; // TAN em % (ex.: 3.3)
  valorFinanciado?: number; // o capital emprestado no início (sem a entrada)
  entrada?: number;
  prazoMeses?: number;
  inicioContrato?: Mes; // mês da primeira prestação
  comissaoReembolso?: number; // % do capital amortizado
  encargosMensais?: number; // seguros e outros encargos fixos que vêm dentro da prestação
  numeroContrato?: string;
  credor?: string;
}

// Os campos do contrato que se podem apagar numa dívida
export const CAMPOS_CONTRATO = [
  'taxaAnual',
  'valorFinanciado',
  'entrada',
  'prazoMeses',
  'inicioContrato',
  'comissaoReembolso',
  'encargosMensais',
] as const;

// As contas de um crédito com taxa (só existem se a dívida tiver taxaAnual).
// A API não envia os campos vazios: o que está marcado como "?" pode vir sem a chave (undefined) ou a null
export interface ResumoContrato {
  prestacaoSemEncargos: number; // capital + juros (o que o credor debita menos seguros e selo)
  jurosProximaPrestacao: number;
  primeiroMes: Mes; // o mês da próxima prestação
  mesesRestantes?: number | null; // vazio se a prestação não chega para os juros
  fim?: Mes | null;
  jurosRestantes: number;
  totalRestante: number; // até ao fim: capital + juros + selo + seguros
  viavel: boolean;
  precoTotal?: number | null; // financiado + entrada
  capitalAmortizado?: number | null;
  jurosContrato?: number | null; // estimativa
  custoTotalContrato?: number | null; // estimativa
  pagoEmJurosEEncargos: number;
}

// O que o último extrato do credor dizia
export interface ExtratoDivida {
  emitidoEm: string; // "AAAA-MM-DD"
  proximaPrestacaoNumero?: number | null;
  prestacaoTotal?: number | null;
  vencimento?: string | null;
  prestacaoValor?: number | null;
  prestacaoCapital?: number | null;
  prestacaoJuros?: number | null;
  prestacaoSelo?: number | null;
  prestacaoSeguros?: number | null;
  capitalVencido?: number | null;
  emAtraso: boolean;
}

// Um cenário do simulador (ver backend Regras/Amortizacao.cs)
export interface CenarioDivida {
  prestacao: number; // capital + juros
  prestacaoTotal: number; // o que o credor debita: com selo e seguros
  meses: number; // prestações que faltam depois (0 = paga)
  fim?: Mes | null; // vazio quando já não há prestações
  juros: number;
  comissao: number;
  amortizadoAgora: number;
  totalAPagar: number; // amortização + comissão + prestações até ao fim
  poupancaJuros: number;
  poupancaLiquida: number;
  mesesPoupados: number;
  viavel: boolean;
}

export interface SimulacaoDivida {
  capitalEmFalta: number;
  taxaAnual: number;
  comissaoReembolso: number;
  encargosMensais: number;
  primeiroMes: Mes;
  atual: CenarioDivida;
  manterPrestacao?: CenarioDivida | null;
  reduzirPrestacao?: CenarioDivida | null;
  amortizacaoTotal: CenarioDivida;
  extraMensal?: CenarioDivida | null;
}

export interface ResultadoEstrategia {
  meses: number;
  juros: number;
  viavel: boolean;
  ordem: { id: string; titulo: string; mes: number }[];
}

export interface ComparacaoEstrategias {
  extraMensal: number;
  dividas: { id: string; titulo: string; capital: number; taxaAnual: number; prestacao: number }[];
  soPrestacoes: ResultadoEstrategia;
  bolaDeNeve: ResultadoEstrategia;
  avalanche: ResultadoEstrategia;
  ignoradas: string[];
}

// O que se leu no PDF de um extrato de crédito (sem dados pessoais)
export interface ExtratoCredito {
  credor: string;
  numeroContrato: string;
  categoria?: string | null;
  dataContrato?: string | null;
  emitidoEm: string;
  taxaAnual: number;
  capitalInicial: number;
  capitalAmortizado: number;
  capitalVencido: number;
  capitalVincendo: number;
  prestacaoNumero: number;
  prestacaoTotal: number;
  vencimento: string;
  prestacaoValor: number;
  prestacaoCapital: number;
  prestacaoJuros: number;
  prestacaoSelo: number;
  prestacaoSeguros: number;
  avisos: string[];
}

export interface ExtratoLido {
  extrato: ExtratoCredito;
  dividaId?: string | null; // a dívida com o mesmo contrato, se existir
  dividaTitulo?: string | null;
}

// Histórico de um mês (users/{uid}/meses/{mes})
export interface ResumoMes {
  mes: Mes;
  saldoInicial?: number; // saldo da conta quando o mês começou (na primeira abertura da app nesse mês)
  saldoFinal?: number; // saldo da conta quando o mês acabou (ao começar o mês seguinte)
  recebimento?: Recebimento & { data: string };
  // Blocos importados do Excel que não têm outro sítio na app (só histórico)
  importado?: Partial<Pick<DadosFolhaMes, 'lucro' | 'poupanca' | 'saldoConta' | 'saldoPoupanca' | 'totalAPagar'>>;
}

// Interface para configuração do salário
export interface SalarioConfig {
  valor: string;
  diaRecebimento: number; // Dia do mês (1-31)
  lastReceived?: string; // ISO date do último recebimento processado
  ultimoRecebimento?: Recebimento & { data: string };
  cartaoAlimentacao?: string; // Valor mensal do cartão de alimentação: carrega o saldo do cartão no dia do salário (fora do Saldo Disponível)
  cartaoPorDiaUtil?: string; // Alternativa ao valor mensal fixo: valor por dia útil (seg-sex) vezes os dias úteis de cada mês
  recebimentoManual?: boolean; // O salário não entra sozinho no dia: marca-se "Já recebi" (com o valor que entrou de facto)
}

// Cartão de alimentação: um saldo à parte do Saldo Disponível, que carrega no dia do salário
export interface CartaoAlimentacao {
  saldo: number;
  ultimaAtualizacao?: string;
  valorMensal: number; // o configurado no Salário (0 = sem cartão)
}

// Interface para conta corrente
export interface ContaCorrente {
  saldo: number;
  ultimaAtualizacao: string;
}

// Interface para configuração de PPR e Poupança
export interface ConfigPPRPoupanca {
  pprTipo: 'percentagem' | 'valor';
  pprValor: string;
  poupancaTipo: 'percentagem' | 'valor';
  poupancaValor: string;
}

// ---- Categorias, orçamentos, objetivos e estatísticas (calculados na API) ----

// A categoria sugerida para o título de uma despesa: a última usada nesse título (historico),
// uma palavra do título (palavra-chave, ex.: "Continente" → supermercado) ou "outros" (por-defeito)
// Com as regras de categorização (services/regras.ts): "regra" (do utilizador) e "regra-padrao" (das
// que vêm com a app) ganham ao histórico; nesses casos "regra" diz qual foi
export type OrigemSugestao = 'regra' | 'historico' | 'palavra-chave' | 'regra-padrao' | 'por-defeito';

export interface SugestaoCategoria {
  categoria: Categoria;
  origem: OrigemSugestao;
  // A regra que decidiu: o texto, ou um objeto com o texto (a API pode mandar qualquer um)
  regra?: string | { id?: string; texto?: string } | null;
}

// Limite mensal de gastos numa categoria (um por categoria)
export interface Orcamento {
  id: string;
  categoria: Categoria;
  limite: number;
}

// ok · perto (80% ou mais do limite) · ultrapassado (100% ou mais)
export type EstadoOrcamento = 'ok' | 'perto' | 'ultrapassado';

// Um orçamento num mês: o gasto são as despesas extras desse mês na categoria
export interface EstadoOrcamentoMes extends Orcamento {
  mes: Mes;
  gasto: number;
  restante: number; // quanto ainda se pode gastar (nunca negativo)
  percentagem: number; // gasto / limite em %, com uma casa decimal (pode passar de 100)
  estado: EstadoOrcamento;
  // Só no mês atual: quanto se terá gasto no fim do mês ao ritmo de agora (o gasto do dia a dia estica,
  // as despesas mensais já pagas ficam como estão)
  previsto?: number | null;
}

export type EstadoObjetivo = 'no-bom-caminho' | 'atrasado' | 'atingido';

// Um objetivo de poupança, com os números do mês atual
export interface ObjetivoPoupanca {
  id: string;
  nome: string;
  valorAlvo: number;
  mesAlvo: Mes; // até quando (inclusive)
  mesInicio: Mes; // quando foi criado: o ritmo esperado conta a partir daqui
  poupancaId?: string; // ligado a uma poupança: o progresso é o saldo dela
  poupancaNome?: string;
  valorAtual: number; // o saldo da poupança ligada, ou o valor escrito à mão
  percentagem: number; // 0-100
  emFalta: number;
  mesesRestantes: number; // do mês atual ao mês alvo, os dois incluídos (0 = já passou)
  valorPorMes: number; // quanto pôr de lado por mês para lá chegar
  estado: EstadoObjetivo;
  // O ritmo a que se poupa de facto (só com poupança ligada e o objetivo por atingir)
  contribuicaoMensal?: number | null; // o que a poupança ligada recebe por mês
  diferenca?: number | null; // contribuição - valorPorMes (negativo: falta isto por mês)
  mesPrevisto?: Mes | null; // o mês em que se chega ao alvo a este ritmo (null: nunca)
}

export interface GastoCategoria {
  categoria: Categoria;
  total: number;
  quantidade: number;
  percentagem: number; // parte do total do mês, em %
}

// As despesas extras de um mês por categoria, da que tem mais gastos para a que tem menos
export interface GastosPorCategoria {
  mes: Mes;
  total: number;
  categorias: GastoCategoria[];
}

// Um mês da evolução: os mesmos números da folha desse mês (Resumo do mês)
export interface EvolucaoMes {
  mes: Mes;
  entrou: number; // Lucro (sem o cartão de alimentação)
  gasto: number; // Despesas mensais + extras
  poupado: number; // Poupança
  saldoFinal: number | null; // saldo da conta no fim do mês (no mês atual, o de agora); null = não se sabe
  despesasMensais: number; // a parte do gasto que são despesas mensais
  despesasExtras: number; // a parte do gasto que são despesas extras
  livre: number; // o que sobra (Entrou - Gasto - Poupado), nunca abaixo de 0
  cartaoCarregado?: number; // o que o cartão de alimentação carrega nesse mês (fica fora de "entrou"); sem cartão, 0
  cartaoGasto?: number; // o que se gastou com o cartão nesse mês (fica fora de "gasto")
}

// Um número do mês comparado com o do mês anterior
export interface ComparacaoValor {
  atual: number;
  anterior: number;
  diferenca: number; // atual - anterior, em euros
  variacao: number | null; // em %, uma casa decimal; null quando o anterior é 0 ("novo")
}

export interface ComparacaoCategoria extends ComparacaoValor {
  categoria: Categoria;
}

// Um mês comparado com o anterior (GET /api/estatisticas/comparacao)
export interface ComparacaoMes {
  mes: Mes;
  mesAnterior: Mes;
  ateDia: number | null; // no mês atual: os gastos do mês anterior só contam até este dia; null = meses completos
  gastosDiaADia: ComparacaoValor; // Gastos do Dia a Dia (despesas extras)
  despesasFixas: ComparacaoValor;
  poupado: ComparacaoValor;
  entrou: ComparacaoValor;
  categorias: ComparacaoCategoria[]; // da maior diferença (a subir ou a descer) para a menor
}

// A previsão do saldo no fim do mês atual (GET /api/estatisticas/previsao)
export interface PrevisaoFimMes {
  mes: Mes;
  saldoAtual: number;
  porPagarFixas: number; // despesas fixas ainda por pagar
  estimativaGastos: number; // gastos do dia a dia até ao fim do mês (média × dias restantes + recorrentes)
  gastosRecorrentes: number; // a parte da estimativa que são gastos que se repetem
  previsaoFinal: number; // saldo atual - por pagar - estimativa
  mediaDiaria: number;
  diasRestantes: number;
  base: string; // "3 meses", "2 meses", "1 mês" ou "este mês"
  mesesBase: number;
  poupancasPorEnviar?: number; // contribuições manuais deste mês ainda por enviar (as que contam no previsto)
  // A estimativa de gastos repartida por categoria (a maior primeiro): o simulador usa-a para saber quanto se pode cortar
  categorias?: PrevisaoCategoria[];
  // O que se gasta num mês inteiro normal em cada categoria (média dos meses anteriores × dias do mês + recorrentes): base do simulador mensal
  categoriasMes?: PrevisaoCategoria[];
  // O cartão de alimentação à parte da conta (null/ausente: sem cartão)
  cartao?: PrevisaoCartao | null;
}

// O cartão de alimentação até ao fim do mês: os gastos pagos com ele não saem da conta nem entram na previsão dela
export interface PrevisaoCartao {
  saldo: number; // o que tem agora
  cargaPorReceber: number; // o que ainda vai carregar este mês (no dia do salário, se ainda não chegou)
  mediaDiaria: number; // quanto se gasta por dia com o cartão
  gastosRecorrentes: number; // a parte da estimativa que são gastos que se repetem
  estimativaGastos: number; // o que se prevê gastar com o cartão até ao fim do mês
  previsaoFinal: number; // saldo + carga - estimativa (negativo: não chega)
  falta: number; // o que teria de sair da conta se o cartão não chegar
}

export interface PrevisaoCategoria {
  categoria: Categoria;
  estimativa: number; // quanto ainda se prevê gastar nela até ao fim do mês
}

// Um valor em euros numa categoria (o que foi gasto, de qualquer tipo de despesa)
export interface ValorCategoria {
  categoria: Categoria;
  valor: number;
  fixas?: number; // a parte que é de despesas mensais
}

// Os gastos de um meio de pagamento (conta ou cartão) por categoria: o mês atual até hoje e a média por mês
export interface GastosDoMeio {
  mesAtual: ValorCategoria[];
  media: ValorCategoria[]; // vazia se ainda não há meses completos
}

// O que já se gastou no dia a dia por categoria, conta e cartão separados (GET /api/estatisticas/gastos-categorias).
// Só valores reais: nenhuma previsão
export interface GastosCategorias {
  mes: Mes;
  mesesBase: number; // os meses completos que deram a média (0: ainda sem histórico)
  conta: GastosDoMeio;
  cartao: GastosDoMeio | null; // null: sem cartão de alimentação
  cartaoMensal: number; // o que o cartão carrega por mês
}

// Uma contribuição manual de um mês passado (dos últimos 3) que ficou por enviar.
// valor: o que se envia agora (a contribuição configurada hoje)
export interface ContribuicaoEmAtraso {
  poupancaId: string;
  nome: string;
  mes: Mes;
  valor: number;
}
