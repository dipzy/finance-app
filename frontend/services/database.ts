import { api, parte } from './api';
import { adicionarGasto, type ResultadoAdicionar } from './filaOffline';
import {
  calcularPoupancaComConfig,
  calcularPPRComConfig,
  centimos,
  mesDe,
} from './calculos';
import {
  CAMPOS_CONTRATO,
  type CartaoAlimentacao,
  type Categoria,
  type ComparacaoMes,
  type ConfigPPRPoupanca,
  type ContaCorrente,
  type ContribuicaoEmAtraso,
  type Despesa,
  type Divida,
  type EstadoOrcamentoMes,
  type ExtratoDivida,
  type ResumoContrato,
  type EvolucaoMes,
  type FinancialData,
  type GastosCategorias,
  type GastosPorCategoria,
  type MeioPagamento,
  type Mes,
  type ObjetivoPoupanca,
  type Orcamento,
  type PagamentoFixa,
  type Poupanca,
  type ProjecaoPoupanca,
  type PrevisaoFimMes,
  type Recebimento,
  type SalarioConfig,
  type SugestaoCategoria,
} from './tipos';

// Camada de dados da app: cada função chama a API (.NET, pasta backend/), que guarda os dados em
// PostgreSQL e aplica as regras de negócio (saldo, salário, débitos automáticos, importação...).
// Os nomes e as assinaturas são os mesmos da versão Firestore, para os ecrãs não mudarem: o
// parâmetro userId continua lá, mas quem diz à API quem é o utilizador é o token do Firebase
// (ver services/api.ts).
//
// As regras de cálculo puras (calculos.ts) continuam também aqui na app: os ecrãs usam-nas para
// mostrar valores (ex.: o que vai entrar no próximo salário).

export type {
  CartaoAlimentacao,
  Categoria,
  ConfigPPRPoupanca,
  ContaCorrente,
  ContribuicaoEmAtraso,
  ComparacaoCategoria,
  ComparacaoMes,
  ComparacaoValor,
  Contribuicao,
  DadosFolhaMes,
  Despesa,
  Divida,
  EstadoFixaFolha,
  EstadoObjetivo,
  EstadoOrcamento,
  EstadoOrcamentoMes,
  EvolucaoMes,
  FinancialData,
  GastoCategoria,
  GastosPorCategoria,
  LinhaFolha,
  MeioPagamento,
  Mes,
  ObjetivoPoupanca,
  Orcamento,
  PagamentoFixa,
  PrevisaoFimMes,
  Poupanca,
  ProjecaoPoupanca,
  Recebimento,
  ResumoMes,
  SalarioConfig,
  SugestaoCategoria,
  UserData,
} from './tipos';
export {
  ativaNoMes,
  calcularDivida,
  calcularPoupancaComConfig,
  calcularPPRComConfig,
  calcularRecebimento,
  contribuicaoDe,
  descricaoConfigurada,
  deveDebitarAutomaticamente,
  diaEfetivo,
  eAnual,
  estadoNoMes,
  mesAnterior,
  mesDaData,
  mesDe,
  mesSeguinte,
  nomeMes,
  podeDebitar,
  totaisFolha,
  valorSalarioBase,
} from './calculos';
export type { EstadoFixa, TotaisFolha } from './calculos';

// Mês no formato "AAAA-MM" (no fuso do dispositivo; a API usa o de Lisboa)
export const mesAtual = (): Mes => mesDe();

// "?mes=2026-10", ou nada (a API usa o mês atual)
const comMes = (mes?: Mes) => (mes ? `?mes=${parte(mes)}` : '');

// Corpo de um PATCH: só os campos com valor mudam. Os campos que vêm a undefined de propósito
// (ex.: o dia de débito apagado no formulário) vão em "limpar", se a API os deixar limpar
function paraPatch(campos: object, podemSerLimpos: string[] = []): Record<string, unknown> {
  const corpo: Record<string, unknown> = {};
  const limpar: string[] = [];
  for (const [chave, valor] of Object.entries(campos)) {
    if (valor !== undefined) corpo[chave] = valor;
    else if (podemSerLimpos.includes(chave)) limpar.push(chave);
  }
  if (limpar.length) corpo.limpar = limpar;
  return corpo;
}

export const PerfilDB = {
  async criar(_userId: string, email: string, name: string): Promise<void> {
    await api.put('/api/perfil', { email, name });
  },
};

// Dados financeiros da primeira versão (salário e percentagens), usados como fallback
export const FinancialDB = {
  async save(_userId: string, data: Omit<FinancialData, 'lastUpdated'>): Promise<void> {
    await api.put('/api/configuracoes/financeiro', data);
  },

  async load(_userId: string): Promise<FinancialData | null> {
    return (await api.get<FinancialData | null>('/api/configuracoes/financeiro')) ?? null;
  },
};

// Operações para Configuração do Salário
export const SalarioDB = {
  async getConfig(_userId: string): Promise<SalarioConfig | null> {
    return (await api.get<SalarioConfig | null>('/api/salario')) ?? null;
  },

  // Não mexe no último recebimento (a API ignora-o): o salário nunca entra duas vezes no mesmo mês
  async saveConfig(_userId: string, config: SalarioConfig): Promise<void> {
    await api.put('/api/salario', {
      valor: config.valor,
      diaRecebimento: config.diaRecebimento,
      cartaoAlimentacao: config.cartaoAlimentacao,
      cartaoPorDiaUtil: config.cartaoPorDiaUtil,
      recebimentoManual: config.recebimentoManual,
    });
  },

  // Recebimento manual: marca o salário deste mês como recebido, já, com o valor que entrou (sem valor, o configurado).
  // Entra como o automático (poupanças automáticas e cartão de alimentação incluídos), uma vez por mês
  async receberManual(_userId: string, valor?: number): Promise<Recebimento> {
    return api.post<Recebimento>('/api/salario/receber-manual', { valor });
  },

  // No dia do salário: entra o salário e saem logo as contribuições das poupanças.
  // Devolve o que foi feito, ou null se hoje não havia salário a receber
  async processarRecebimento(_userId: string): Promise<Recebimento | null> {
    return (await api.post<Recebimento | null>('/api/salario/receber')) ?? null;
  },
};

// Operações para Conta Corrente
export const ContaCorrenteDB = {
  async getSaldo(_userId: string): Promise<number> {
    return centimos((await api.get<ContaCorrente>('/api/conta')).saldo);
  },

  async setSaldo(_userId: string, saldo: number): Promise<void> {
    await api.put('/api/conta/saldo', { saldo });
  },

  async adicionar(_userId: string, valor: number): Promise<void> {
    await api.post('/api/conta/movimentos', { valor });
  },

  async subtrair(_userId: string, valor: number): Promise<void> {
    await api.post('/api/conta/movimentos', { valor: -valor });
  },

  // Cartão de alimentação: saldo à parte (não entra no Saldo Disponível). Carrega no dia do salário
  // com o valor configurado no Salário e paga as despesas extras marcadas com o cartão
  getCartaoAlimentacao(_userId: string): Promise<CartaoAlimentacao> {
    return api.get<CartaoAlimentacao>('/api/conta/cartao-alimentacao');
  },

  // Acertar o saldo do cartão para o valor real (ex.: a primeira vez)
  async setSaldoCartaoAlimentacao(_userId: string, saldo: number): Promise<void> {
    await api.put('/api/conta/cartao-alimentacao', { saldo });
  },
};

export type ResultadoDebito = 'debitada' | 'ja-debitada' | 'saldo-insuficiente';

// O que aconteceu a cada despesa mensal em cada mês
export const PagamentosDB = {
  getDoMes(_userId: string, mes: Mes): Promise<PagamentoFixa[]> {
    return api.get<PagamentoFixa[]>(`/api/pagamentos?mes=${parte(mes)}`);
  },

  // Todos os pagamentos de uma despesa (ex.: as prestações de uma dívida)
  getDaDespesa(_userId: string, fixaId: string): Promise<PagamentoFixa[]> {
    return api.get<PagamentoFixa[]>(`/api/pagamentos?fixaId=${parte(fixaId)}`);
  },

  // Pagamento de um mês passado (ex.: importado do Excel): fica no histórico sem mexer na conta de hoje
  async registarHistorico(_userId: string, fixa: Pick<Despesa, 'id' | 'titulo'>, mes: Mes, valor: number, data?: string) {
    await api.put(`/api/pagamentos/${parte(mes)}/${parte(fixa.id)}`, { titulo: fixa.titulo, valor, data });
  },
};

// Despesas que se repetem todos os meses (ou todos os anos)
export const DespesasFixasDB = {
  // Todas, incluindo as terminadas (para o histórico). Para um mês, filtrar com ativaNoMes
  getAll(_userId: string): Promise<Despesa[]> {
    return api.get<Despesa[]>('/api/despesas-fixas');
  },

  // Começa a contar no mês em que é criada (ou no mês indicado, ex.: ao importar meses passados).
  // Anual: periodicidade 'anual' + mesAnual (1-12).
  // Com divisao (grupo e pessoas), valor é o total: cada pagamento sai todo da conta e fica partilhado no grupo
  async add(
    _userId: string,
    despesa: Pick<Despesa, 'titulo' | 'valor' | 'diaDebito' | 'periodicidade' | 'mesAnual' | 'categoria' | 'divisao' | 'variavel' | 'unidadeConsumo' | 'debitoAutomatico'> & { inicio?: Mes }
  ): Promise<string> {
    return (await api.post<{ id: string }>('/api/despesas-fixas', despesa)).id;
  },

  // Muda o modelo daqui para a frente. Os pagamentos já feitos guardam o valor que foi pago.
  // diaDebito/mesAnual a undefined apagam esse campo (ex.: anual sem dia = pagar à mão).
  // divisao a undefined deixa de dividir; sem a chave "divisao" fica como está. Dividida, valor é o total
  async update(
    _userId: string,
    id: string,
    campos: Partial<Pick<Despesa, 'titulo' | 'valor' | 'diaDebito' | 'periodicidade' | 'mesAnual' | 'inicio' | 'categoria' | 'divisao' | 'variavel' | 'unidadeConsumo' | 'debitoAutomatico'>>
  ): Promise<void> {
    await api.patch(`/api/despesas-fixas/${parte(id)}`, paraPatch(campos, ['diaDebito', 'mesAnual', 'categoria', 'divisao', 'unidadeConsumo']));
  },

  // Deixar de repetir. Se já foi paga este mês, conta até este mês; senão, até ao mês passado.
  // Se nunca teve pagamentos (nem histórico), é apagada de vez
  async terminar(_userId: string, id: string): Promise<void> {
    await api.post(`/api/despesas-fixas/${parte(id)}/terminar`);
  },

  // Compatibilidade: "remover" passou a ser terminar (para não perder o histórico)
  async remove(userId: string, id: string): Promise<void> {
    await DespesasFixasDB.terminar(userId, id);
  },

  async calcularTotal(userId: string, mes?: Mes): Promise<number> {
    return (await calcularDespesasFixasSeparadas(userId, mes)).total;
  },

  // Débito automático das despesas deste mês cujo dia já chegou (também acontece em calcularSaldoDisponivel)
  async processarDebitosAutomaticos(_userId: string): Promise<number> {
    return (await api.post<{ total: number }>('/api/despesas-fixas/debitos-automaticos')).total;
  },

  // O pagamento e o saldo mudam juntos na API; uma despesa nunca é paga duas vezes no mesmo mês
  async debitar(_userId: string, id: string, mes?: Mes): Promise<ResultadoDebito> {
    return (await api.post<{ resultado: ResultadoDebito }>(`/api/despesas-fixas/${parte(id)}/debitar${comMes(mes)}`)).resultado;
  },

  // Paga só parte do valor da despesa, sem a liquidar por completo.
  async debitarParcial(_userId: string, id: string, valor: number, mes?: Mes): Promise<ResultadoDebito> {
    return (await api.post<{ resultado: ResultadoDebito }>(`/api/despesas-fixas/${parte(id)}/debitar-parcial${comMes(mes)}`, { valor })).resultado;
  },

  // Paga com o valor real da fatura (e o consumo, se houver): o que já estava pago em parte conta, só a diferença sai
  // da conta. Numa despesa variável a estimativa passa a ser a média das últimas 3 faturas
  async pagarFatura(_userId: string, id: string, valor: number, consumo?: number, mes?: Mes): Promise<ResultadoDebito> {
    const corpo = consumo === undefined ? { valor } : { valor, consumo };
    return (await api.post<{ resultado: ResultadoDebito }>(`/api/despesas-fixas/${parte(id)}/pagar-fatura${comMes(mes)}`, corpo)).resultado;
  },

  // Desfaz o pagamento do mês: devolve o valor pago à conta e a despesa volta a ficar por pagar.
  // O débito automático não a repete este mês (só pausa: no mês seguinte volta a pagar, se continuar ligado)
  async anularDebito(_userId: string, id: string, mes?: Mes): Promise<boolean> {
    return (await api.post<{ anulado: boolean }>(`/api/despesas-fixas/${parte(id)}/anular${comMes(mes)}`)).anulado;
  },
};

// Despesas variáveis: saem da conta no momento em que são registadas.
// A data é a do dia em que a despesa foi feita (pode ser ontem) e define o mês em que aparece.
// Sem categoria, a API guarda a sugerida pelo título (a mesma de sugerirCategoria)
export const DespesasExtrasDB = {
  getAll(_userId: string): Promise<Despesa[]> {
    return api.get<Despesa[]>('/api/despesas-extras');
  },

  // Do mês indicado, da mais recente para a mais antiga
  getDoMes(_userId: string, mes: Mes): Promise<Despesa[]> {
    return api.get<Despesa[]>(`/api/despesas-extras?mes=${parte(mes)}`);
  },

  // A despesa e o desconto na conta (ou no cartão de alimentação) acontecem juntos (numa transação, na API).
  // Com o cartão sem saldo que chegue, a API responde 409 com a mensagem a mostrar.
  // Sem internet o gasto fica na fila offline (pendente: true) e é enviado quando a ligação voltar
  add(
    userId: string,
    despesa: Pick<Despesa, 'titulo' | 'valor'> & { data?: string; categoria?: Categoria; meioPagamento?: MeioPagamento; litros?: number }
  ): Promise<ResultadoAdicionar> {
    return adicionarGasto(userId, despesa);
  },

  // Despesa de um mês passado (ex.: importada do Excel): fica no histórico sem mexer na conta de hoje
  async addHistorica(_userId: string, despesa: Pick<Despesa, 'titulo' | 'valor'> & { data: string; categoria?: Categoria; meioPagamento?: MeioPagamento }): Promise<void> {
    await api.post('/api/despesas-extras/historicas', {
      titulo: despesa.titulo,
      valor: despesa.valor,
      data: despesa.data,
      categoria: despesa.categoria,
      meioPagamento: despesa.meioPagamento,
    });
  },

  // Editar título, valor, data ou categoria. Se o valor mudar, a conta é acertada pela diferença
  // (só nas despesas que saíram da conta ao registar)
  async update(
    _userId: string,
    id: string,
    campos: Partial<Pick<Despesa, 'titulo' | 'valor' | 'data' | 'categoria' | 'meioPagamento' | 'litros'>>
  ): Promise<void> {
    // litros: 0 apaga os litros registados
    await api.patch(`/api/despesas-extras/${parte(id)}`, paraPatch(campos));
  },

  // A categoria para um título: a última que o utilizador usou nesse título, senão pelas
  // palavras-chave (ex.: "Pingo Doce" → supermercado), senão "outros"
  sugerirCategoria(_userId: string, titulo: string): Promise<SugestaoCategoria> {
    return api.get<SugestaoCategoria>(`/api/despesas-extras/sugerir-categoria?titulo=${parte(titulo.trim())}`);
  },

  // Apagar devolve o valor à conta, mas só às despesas que o descontaram
  async remove(_userId: string, id: string): Promise<void> {
    await api.delete(`/api/despesas-extras/${parte(id)}`);
  },

  // Total do mês (por defeito, o atual)
  async calcularTotal(userId: string, mes: Mes = mesAtual()): Promise<number> {
    const despesas = await DespesasExtrasDB.getDoMes(userId, mes);
    return centimos(despesas.reduce((total, d) => total + (d.valor || 0), 0));
  },
};

// Configuração antiga de PPR e Poupança
export const ConfiguracoesDB = {
  async getPPRPoupanca(_userId: string): Promise<ConfigPPRPoupanca | null> {
    return (await api.get<ConfigPPRPoupanca | null>('/api/configuracoes/ppr-poupanca')) ?? null;
  },

  async savePPRPoupanca(_userId: string, config: ConfigPPRPoupanca): Promise<void> {
    await api.put('/api/configuracoes/ppr-poupanca', config);
  },

  // Calcular valor do PPR baseado na configuração
  async calcularPPR(userId: string, salarioValor: number): Promise<number> {
    const [config, financial] = await Promise.all([ConfiguracoesDB.getPPRPoupanca(userId), FinancialDB.load(userId)]);
    return calcularPPRComConfig(config, financial, salarioValor);
  },

  // Calcular valor da Poupança baseado na configuração
  async calcularPoupanca(userId: string, salarioValor: number): Promise<number> {
    const [config, financial] = await Promise.all([ConfiguracoesDB.getPPRPoupanca(userId), FinancialDB.load(userId)]);
    return calcularPoupancaComConfig(config, financial, salarioValor);
  },
};

// Contas poupança (Revolut/C.A, PPR, Trade Republic...): contribuição mensal + saldo
export const PoupancasDB = {
  getAll(_userId: string): Promise<Poupanca[]> {
    return api.get<Poupanca[]>('/api/poupancas');
  },

  async add(
    _userId: string,
    poupanca: Omit<Poupanca, 'id' | 'ultimaContribuicaoMes' | 'ultimaContribuicaoEm' | 'valorMensal' | 'jurosMes' | 'jurosRecebidos'>
  ): Promise<string> {
    return (await api.post<{ id: string }>('/api/poupancas', poupanca)).id;
  },

  // Nome e contribuição mensal (o saldo muda com ajustarSaldo / definirSaldo)
  async update(
    _userId: string,
    id: string,
    campos: Partial<
      Pick<Poupanca, 'nome' | 'tipo' | 'valor' | 'ordem' | 'contribuicaoAutomatica' | 'diaContribuicao' | 'contarNoPrevisto' | 'taxaAnual' | 'retencao' | 'jurosAutomaticos'>
    >
  ): Promise<void> {
    await api.patch(`/api/poupancas/${parte(id)}`, paraPatch(campos, ['diaContribuicao', 'taxaAnual']));
  },

  // Quanto vale a poupança daqui a N meses (com a taxa dela, ou outra para simular)
  projecao(_userId: string, id: string, meses: number, taxa?: number): Promise<ProjecaoPoupanca> {
    const pedido = taxa === undefined ? '' : `&taxa=${encodeURIComponent(String(taxa))}`;
    return api.get<ProjecaoPoupanca>(`/api/poupancas/${parte(id)}/projecao?meses=${meses}${pedido}`);
  },

  async remove(_userId: string, id: string): Promise<void> {
    await api.delete(`/api/poupancas/${parte(id)}`);
  },

  // Movimento no saldo da poupança (ex.: levantamento). Não mexe na conta corrente
  async ajustarSaldo(_userId: string, id: string, valor: number): Promise<void> {
    await api.post(`/api/poupancas/${parte(id)}/ajustar`, { valor });
  },

  async definirSaldo(_userId: string, id: string, saldo: number): Promise<void> {
    await api.put(`/api/poupancas/${parte(id)}/saldo`, { saldo });
  },

  // Passar dinheiro entre a conta corrente e uma poupança (ex.: reforço fora do dia do salário)
  async transferirDaConta(_userId: string, id: string, valor: number): Promise<void> {
    await api.post(`/api/poupancas/${parte(id)}/transferir`, { valor });
  },

  // Sem mês: a contribuição deste mês. Com mês, regulariza um dos últimos 3 meses que ficou por enviar
  // (o valor sai da conta agora e fica registado nesse mês)
  async contribuirManualmente(_userId: string, id: string, mes?: Mes): Promise<'adicionada' | 'ja-adicionada' | 'saldo-insuficiente'> {
    return (await api.post<{ resultado: 'adicionada' | 'ja-adicionada' | 'saldo-insuficiente' }>(`/api/poupancas/${parte(id)}/contribuir${comMes(mes)}`)).resultado;
  },

  // As contribuições manuais dos últimos 3 meses (sem o atual) que ficaram por enviar
  getEmAtraso(_userId: string): Promise<ContribuicaoEmAtraso[]> {
    return api.get<ContribuicaoEmAtraso[]>('/api/poupancas/em-atraso');
  },
};

export interface DividaComEstado extends Divida {
  emFalta: number; // sem taxa: o que falta pagar; com taxa: o capital em dívida
  pago: number;
  mesesEmFalta: number | null; // null quando não há prestação ligada
  prestacao?: number;
  resumo?: ResumoContrato | null; // só nos créditos com taxa
  extrato?: ExtratoDivida | null; // só depois de importar um extrato do credor
}

// Dívidas (ex.: crédito do carro): o valor em falta desce com os pagamentos da prestação ligada
export const DividasDB = {
  getAll(_userId: string): Promise<Divida[]> {
    return api.get<Divida[]>('/api/dividas');
  },

  // Com o valor em falta calculado a partir dos pagamentos da prestação
  getComEstado(_userId: string): Promise<DividaComEstado[]> {
    return api.get<DividaComEstado[]>('/api/dividas/estado');
  },

  async add(_userId: string, divida: Omit<Divida, 'id'>): Promise<string> {
    return (await api.post<{ id: string }>('/api/dividas', divida)).id;
  },

  // fixaId a undefined desliga a prestação; os campos do contrato a undefined apagam-se
  async update(_userId: string, id: string, campos: Partial<Omit<Divida, 'id'>>): Promise<void> {
    await api.patch(`/api/dividas/${parte(id)}`, paraPatch(campos, ['fixaId', ...CAMPOS_CONTRATO]));
  },

  async remove(_userId: string, id: string): Promise<void> {
    await api.delete(`/api/dividas/${parte(id)}`);
  },
};

// Orçamentos: quanto se pode gastar por mês em cada categoria de despesas extras (um por categoria;
// repetir a categoria dá erro 409 com a mensagem a mostrar)
export const OrcamentosDB = {
  getAll(_userId: string): Promise<Orcamento[]> {
    return api.get<Orcamento[]>('/api/orcamentos');
  },

  // Gasto, percentagem e estado de cada orçamento no mês (por defeito, o atual da API):
  // ok, perto (80% ou mais) ou ultrapassado (100% ou mais)
  getEstado(_userId: string, mes?: Mes): Promise<EstadoOrcamentoMes[]> {
    return api.get<EstadoOrcamentoMes[]>(`/api/orcamentos/estado${comMes(mes)}`);
  },

  async add(_userId: string, orcamento: Omit<Orcamento, 'id'>): Promise<string> {
    return (await api.post<{ id: string }>('/api/orcamentos', orcamento)).id;
  },

  async update(_userId: string, id: string, campos: Partial<Omit<Orcamento, 'id'>>): Promise<void> {
    await api.patch(`/api/orcamentos/${parte(id)}`, paraPatch(campos));
  },

  async remove(_userId: string, id: string): Promise<void> {
    await api.delete(`/api/orcamentos/${parte(id)}`);
  },
};

// Os campos de um objetivo que se escrevem (o resto é calculado pela API)
export type CamposObjetivo = Pick<ObjetivoPoupanca, 'nome' | 'valorAlvo' | 'mesAlvo' | 'poupancaId'> & { valorAtual?: number };

// Objetivos de poupança: o progresso é o saldo da poupança ligada ou um valor escrito à mão.
// A API devolve-os já com o que falta, quanto pôr de lado por mês e o estado
export const ObjetivosDB = {
  getAll(_userId: string): Promise<ObjetivoPoupanca[]> {
    return api.get<ObjetivoPoupanca[]>('/api/objetivos');
  },

  get(_userId: string, id: string): Promise<ObjetivoPoupanca> {
    return api.get<ObjetivoPoupanca>(`/api/objetivos/${parte(id)}`);
  },

  async add(_userId: string, objetivo: CamposObjetivo): Promise<string> {
    return (await api.post<{ id: string }>('/api/objetivos', objetivo)).id;
  },

  // poupancaId a undefined desliga a poupança (o valor atual passa a ser o valorAtual enviado
  // ou, sem ele, o saldo que a poupança tinha)
  async update(_userId: string, id: string, campos: Partial<CamposObjetivo>): Promise<void> {
    await api.patch(`/api/objetivos/${parte(id)}`, paraPatch(campos, ['poupancaId']));
  },

  async remove(_userId: string, id: string): Promise<void> {
    await api.delete(`/api/objetivos/${parte(id)}`);
  },
};

// Números para os gráficos (calculados na API, com as mesmas regras da folha do mês)
export const EstatisticasDB = {
  // As despesas extras do mês (por defeito, o atual) somadas por categoria, mesmo sem orçamento
  gastosPorCategoria(_userId: string, mes?: Mes): Promise<GastosPorCategoria> {
    return api.get<GastosPorCategoria>(`/api/estatisticas/categorias${comMes(mes)}`);
  },

  // O que já se gastou por categoria (conta e cartão à parte): o mês atual e a média dos últimos "meses" completos
  gastosCategorias(_userId: string, meses = 6): Promise<GastosCategorias> {
    return api.get<GastosCategorias>(`/api/estatisticas/gastos-categorias?meses=${meses}`);
  },

  // Os últimos meses até ao atual (ou até "ate"), do mais antigo para o mais recente
  evolucao(_userId: string, meses = 12, ate?: Mes): Promise<EvolucaoMes[]> {
    const fim = ate ? `&ate=${parte(ate)}` : '';
    return api.get<EvolucaoMes[]>(`/api/estatisticas/evolucao?meses=${meses}${fim}`);
  },

  // O mês (por defeito, o atual) comparado com o anterior; no mês atual, só até ao mesmo dia (ateDia)
  comparacao(_userId: string, mes?: Mes): Promise<ComparacaoMes> {
    return api.get<ComparacaoMes>(`/api/estatisticas/comparacao${comMes(mes)}`);
  },

  // A previsão do saldo no fim do mês atual (saldo - fixas por pagar - gastos do dia a dia estimados)
  previsao(_userId: string): Promise<PrevisaoFimMes> {
    return api.get<PrevisaoFimMes>('/api/estatisticas/previsao');
  },
};

// ---- Saldos ----

// Despesas mensais de um mês (por defeito, o atual): pagas, por pagar e total
export function calcularDespesasFixasSeparadas(
  _userId: string,
  mes?: Mes
): Promise<{ debitadas: number; porDebitar: number; total: number }> {
  return api.get(`/api/despesas-fixas/totais${comMes(mes)}`);
}

// Saldo Disponível = conta corrente: o mesmo valor em todos os ecrãs. Antes de o devolver, a API
// converte dados antigos (uma vez), regista o início do mês, recebe o salário se for o dia e faz os
// débitos automáticos que já chegaram ao dia (por esta ordem: o salário pode pagar os débitos)
export async function calcularSaldoDisponivel(_userId: string): Promise<number> {
  return (await api.get<{ saldo: number }>('/api/conta/saldo')).saldo;
}

// Saldo Previsto = Saldo Disponível - despesas mensais ainda por pagar este mês
export async function calcularSaldoPrevisto(_userId: string): Promise<number> {
  return (await api.get<{ previsto: number }>('/api/conta/saldos')).previsto;
}
