using System.Text.Json.Serialization;
using Financas.DAL.Entidades;
using Financas.Services.Regras;

namespace Financas.Services.Dtos;

// DTOs: o que entra e sai da API, em JSON camelCase. Têm os mesmos nomes e formas dos tipos da app
// (services/tipos.ts), para os ecrãs continuarem a funcionar sem mudanças. Os campos null não são
// enviados (ficam "undefined" no TypeScript), exceto onde está [JsonIgnore(Condition = Never)].
//
// Convenção: "...Dto" = um recurso devolvido pela API; "...Pedido" = o corpo de um pedido.

/// <summary>Resposta a uma criação: o id do que foi criado.</summary>
public sealed record CriadoDto(string Id);

// ---- Perfil e configurações ----

public sealed record PerfilDto(string? Email, string? Name);

public sealed record GuardarPerfilPedido([Maximo(320)] string? Email, [Maximo(200)] string? Name);

/// <summary>Dados da primeira versão (FinancialData na app).</summary>
public sealed record FinancialDataDto(string Salario, string PprPercentagem, string PoupancaPercentagem, string LastUpdated);

public sealed record GuardarFinanceiroPedido(
    [Maximo(50)] string? Salario,
    [Maximo(50)] string? PprPercentagem,
    [Maximo(50)] string? PoupancaPercentagem);

/// <summary>Configuração antiga de PPR e Poupança (ConfigPPRPoupanca na app).</summary>
public sealed record ConfigPprPoupancaDto(
    TipoContribuicao PprTipo,
    [Maximo(50)] string PprValor,
    TipoContribuicao PoupancaTipo,
    [Maximo(50)] string PoupancaValor);

// ---- Conta e salário ----

public sealed record ContaCorrenteDto(decimal Saldo, DateTimeOffset? UltimaAtualizacao);

public sealed record SaldoDto(decimal Saldo);

/// <summary>O cartão de alimentação: o saldo (fora do Saldo Disponível) e quanto carrega no dia do salário.</summary>
public sealed record CartaoAlimentacaoDto(decimal Saldo, DateTimeOffset? UltimaAtualizacao, decimal ValorMensal);

public sealed record DefinirSaldoPedido([Dinheiro] decimal Saldo);

/// <summary>Um movimento de dinheiro: positivo entra, negativo sai.</summary>
public sealed record ValorPedido([Dinheiro] decimal Valor);

public sealed record ContribuicaoDto(string? PoupancaId, string Nome, decimal Valor);

/// <summary>O que aconteceu (ou vai acontecer) no dia do salário.</summary>
public sealed record RecebimentoDto(
    decimal Salario,
    decimal Ppr,
    decimal Poupanca,
    decimal Liquido,
    IReadOnlyList<ContribuicaoDto> Contribuicoes,
    DateTimeOffset? Data,
    decimal? CartaoAlimentacao = null);

/// <summary>Configuração do salário (SalarioConfig na app).</summary>
public sealed record SalarioConfigDto(
    string Valor,
    int DiaRecebimento,
    DateTimeOffset? LastReceived,
    RecebimentoDto? UltimoRecebimento,
    string? CartaoAlimentacao,
    string? CartaoPorDiaUtil = null,
    bool RecebimentoManual = false);

/// <summary>
/// Guardar a configuração do salário. Não mexe no último recebimento (senão o salário podia entrar
/// duas vezes no mesmo mês). Sem cartão de alimentação, fica o que já estava.
/// </summary>
public sealed record GuardarSalarioPedido(
    [Obrigatorio, Maximo(50)] string Valor,
    [Entre(1, 31)] int DiaRecebimento,
    [Maximo(50)] string? CartaoAlimentacao,
    [Maximo(50)] string? CartaoPorDiaUtil = null,
    bool? RecebimentoManual = null);

/// <summary>Marcar o salário deste mês como recebido (recebimento manual). Sem valor, entra o configurado.</summary>
public sealed record ReceberSalarioPedido([DinheiroMaiorQueZero] decimal? Valor = null);

// ---- Despesas mensais e anuais ----

public sealed record DespesaFixaDto(
    string Id,
    string Titulo,
    decimal Valor,
    int? DiaDebito,
    string? Inicio,
    string? Fim,
    Periodicidade? Periodicidade,
    int? MesAnual,
    bool? Debitado,
    string? MesDebitado,
    string? AnuladoMes,
    string? Categoria = null,
    decimal? ValorTotal = null,
    DivisaoFixaDto? Divisao = null,
    bool Variavel = false,
    string? UnidadeConsumo = null,
    bool DebitoAutomatico = true);

/// <summary>Com quem uma despesa fixa se divide. Com divisão, o valor da despesa é só a parte de quem a paga.</summary>
public sealed record DivisaoFixaDto(
    string GrupoId,
    ModoDivisao Modo,
    IReadOnlyList<ParticipantePedido> Participantes);

/// <summary>Dividir uma despesa fixa com um grupo: o valor da despesa passa a ser o total e cada pagamento fica partilhado.</summary>
public sealed record DivisaoFixaPedido(
    [Obrigatorio, Maximo(128)] string GrupoId,
    IReadOnlyList<ParticipantePedido> Participantes,
    ModoDivisao Modo = ModoDivisao.Igual);

/// <summary>Nova despesa mensal (ou anual). Começa a contar no mês indicado ou, sem mês, no atual.</summary>
public sealed record NovaDespesaFixaPedido(
    [Obrigatorio, Maximo(200)] string Titulo,
    [DinheiroPositivo] decimal Valor,
    [Entre(1, 31)] int? DiaDebito,
    Periodicidade? Periodicidade,
    [Entre(1, 12)] int? MesAnual,
    [Mes] string? Inicio,
    [Categoria] string? Categoria = null,
    DivisaoFixaPedido? Divisao = null,
    bool Variavel = false,
    [Maximo(20)] string? UnidadeConsumo = null,
    bool DebitoAutomatico = true);

/// <summary>
/// Alterar uma despesa: só os campos enviados mudam. Para apagar um campo opcional (ex.: deixar
/// de ter dia de débito) põe-se o nome dele em <see cref="Limpar"/> ("diaDebito", "mesAnual", "divisao").
/// Numa despesa dividida, <see cref="Valor"/> é o total.
/// </summary>
public sealed record AlterarDespesaFixaPedido(
    [Maximo(200)] string? Titulo,
    [DinheiroPositivo] decimal? Valor,
    [Entre(1, 31)] int? DiaDebito,
    Periodicidade? Periodicidade,
    [Entre(1, 12)] int? MesAnual,
    [Mes] string? Inicio,
    IReadOnlyList<string>? Limpar,
    [Categoria] string? Categoria = null,
    DivisaoFixaPedido? Divisao = null,
    bool? Variavel = null,
    [Maximo(20)] string? UnidadeConsumo = null,
    bool? DebitoAutomatico = null);

public enum ResultadoDebito
{
    [JsonStringEnumMemberName("debitada")]
    Debitada,

    [JsonStringEnumMemberName("ja-debitada")]
    JaDebitada,

    [JsonStringEnumMemberName("saldo-insuficiente")]
    SaldoInsuficiente,
}

public sealed record ResultadoDebitoDto(ResultadoDebito Resultado);

public sealed record AnulacaoDto(bool Anulado);

public sealed record TotalDto(decimal Total);

// ---- Grupos (contas partilhadas) ----

/// <summary>Um grupo do utilizador, com o saldo dele no grupo (positivo = tem a receber; negativo = deve).</summary>
public sealed record GrupoDto(
    string Id,
    string Nome,
    string CriadoPorUid,
    DateTimeOffset CriadoEm,
    RoleGrupo MinhaRole,
    int TotalMembros,
    decimal MeuSaldo);

public sealed record GrupoMembroDto(
    string Id,
    string GrupoId,
    string Uid,
    string Nome,
    string? Email,
    RoleGrupo Role,
    DateTimeOffset EntradaEm,
    bool SouEu);

public sealed record NovoGrupoPedido(
    [Obrigatorio, Maximo(200)] string Nome);

public sealed record AlterarGrupoPedido(
    [Maximo(200)] string? Nome);

public sealed record ConvidarMembroPedido(
    [Obrigatorio, Maximo(320)] string Email);

public sealed record AlterarRoleMembroPedido(
    [Obrigatorio] RoleGrupo Role);

/// <summary>Um convite para um grupo (recebido ou enviado), com o nome do grupo e de quem convidou.</summary>
public sealed record ConviteGrupoDto(
    string Id,
    string GrupoId,
    string GrupoNome,
    string Email,
    string? ConvidadoPorNome,
    EstadoConvite Estado,
    DateTimeOffset CriadoEm);

/// <summary>Os convites recebidos e se o email da sessão está confirmado (sem isso não se veem convites).</summary>
public sealed record ConvitesRecebidosDto(
    bool EmailConfirmado,
    IReadOnlyList<ConviteGrupoDto> Convites);

// ---- Despesas partilhadas, acertos e saldos ----

/// <summary>Uma pessoa na divisão: o peso é o valor (modo valores), a % (percentagem) ou o nº de partes; null em partes iguais.</summary>
public sealed record ParticipantePedido(
    [Obrigatorio, Maximo(128)] string Uid,
    decimal? Peso = null);

/// <summary>
/// Uma despesa paga por quem a regista e dividida no grupo. Com <see cref="DespesaExtraId"/>, uma
/// despesa pessoal já registada passa a ser partilhada (deixa de existir como despesa só dele).
/// </summary>
public sealed record DespesaPartilhadaPedido(
    [Obrigatorio, Maximo(200)] string Titulo,
    [DinheiroMaiorQueZero] decimal Valor,
    IReadOnlyList<ParticipantePedido> Participantes,
    ModoDivisao Modo = ModoDivisao.Igual,
    DateOnly? Data = null,
    [Categoria] string? Categoria = null,
    MeioPagamento? MeioPagamento = null,
    [Maximo(128)] string? DespesaExtraId = null);

public sealed record ParteDto(
    string Uid,
    string Nome,
    decimal Valor,
    decimal? Peso,
    // Aceite / por aceitar / recusada; e o que lhe cabe de facto (sem as partes recusadas dos outros)
    EstadoParte Estado,
    decimal? ValorEfetivo);

public sealed record DespesaPartilhadaDto(
    string Id,
    string GrupoId,
    string Titulo,
    decimal Valor,
    DateOnly Data,
    string? Categoria,
    string PagadorUid,
    string PagadorNome,
    MeioPagamento MeioPagamento,
    ModoDivisao Modo,
    IReadOnlyList<ParteDto> Partes,
    DateTimeOffset CriadoEm,
    // Veio do pagamento de uma despesa fixa dividida: só se altera ou anula nas despesas fixas
    bool DaDespesaFixa = false,
    // O saldo do meio de pagamento de quem pagou, logo antes de a despesa o debitar
    decimal? SaldoAntes = null);

public sealed record NovoAcertoPedido(
    [Obrigatorio, Maximo(128)] string DeUid,
    [Obrigatorio, Maximo(128)] string ParaUid,
    [DinheiroMaiorQueZero] decimal Valor,
    DateOnly? Data = null);

/// <summary>O saldo de uma pessoa no grupo (positivo = tem a receber; negativo = deve).</summary>
public sealed record MembroSaldoDto(
    string Uid,
    string Nome,
    decimal Saldo,
    bool Ativo,
    bool SouEu);

/// <summary>Um pagamento sugerido para acertar contas.</summary>
public sealed record TransferenciaDto(
    string DeUid,
    string DeNome,
    string ParaUid,
    string ParaNome,
    decimal Valor);

/// <summary>
/// Quem deve a quem no grupo: o meu saldo, o de cada membro e os pagamentos (já simplificados) que
/// põem tudo a zero. Também o total gasto pelo grupo no mês e quanto disso é a minha parte.
/// </summary>
public sealed record SaldosGrupoDto(
    decimal MeuSaldo,
    IReadOnlyList<MembroSaldoDto> Membros,
    IReadOnlyList<TransferenciaDto> Transferencias,
    string Mes,
    decimal TotalGastoMes,
    decimal MinhaParteMes);

public enum TipoAtividade
{
    Despesa,
    Acerto,
    Mealheiro,
}

/// <summary>
/// Uma linha do feed do grupo. <see cref="Efeito"/> é o que muda no meu saldo do grupo (positivo =
/// fico a receber mais; negativo = fico a dever mais); nos mealheiros é zero.
/// </summary>
public sealed record AtividadeDto(
    TipoAtividade Tipo,
    string Id,
    DateOnly Data,
    DateTimeOffset CriadoEm,
    string Titulo,
    decimal Valor,
    string Uid,
    string Nome,
    string? OutroUid,
    string? OutroNome,
    decimal? MinhaParte,
    decimal Efeito,
    string? Categoria,
    bool PodeApagar,
    // Só nos acertos: quem recebeu já confirmou? E posso ser eu a confirmar (sou quem recebe e falta confirmar)?
    bool Confirmado = true,
    bool PodeConfirmar = false,
    // Nas despesas: o estado da minha parte (por aceitar, recusada...); nulo se não participo
    EstadoParte? MeuEstado = null,
    // Nas despesas: quantas das outras pessoas ainda não aceitaram a parte (quem lançou vê "à espera de N")
    int PorAceitar = 0);

public sealed record ResumoGrupoDto(
    string GrupoId,
    string Nome,
    decimal MeuSaldo,
    int TotalMembros,
    IReadOnlyList<TransferenciaDto> MinhasTransferencias);

public sealed record ResumoMealheiroDto(
    string Id,
    string GrupoId,
    string GrupoNome,
    string Nome,
    decimal Saldo,
    decimal? Objetivo,
    DateOnly? DataObjetivo,
    decimal MeuTotal,
    decimal MeuMes);

/// <summary>
/// A parte partilhada para o Início e o Resumo do mês: quanto tenho a receber e a pagar em todos os
/// grupos, quanto gastei este mês em despesas partilhadas (só a minha parte) e os mealheiros.
/// </summary>
public sealed record ResumoPartilhadoDto(
    string Mes,
    decimal AReceber,
    decimal APagar,
    decimal MinhaParteMes,
    decimal PagoPorMimMes,
    int ConvitesPendentes,
    IReadOnlyList<ResumoGrupoDto> Grupos,
    IReadOnlyList<ResumoMealheiroDto> Mealheiros);

// ---- Mealheiros (poupanças partilhadas) ----

public sealed record ContribuidorDto(
    string Uid,
    string Nome,
    decimal Total);

public sealed record PoupancaPartilhadaDto(
    string Id,
    string GrupoId,
    string Nome,
    decimal Saldo,
    decimal? Objetivo,
    DateOnly? DataObjetivo,
    int Versao,
    DateTimeOffset CriadoEm,
    IReadOnlyList<ContribuidorDto> Contribuidores);

public sealed record NovaPoupancaPartilhadaPedido(
    [Obrigatorio, Maximo(200)] string Nome,
    [DinheiroMaiorQueZero] decimal? Objetivo = null,
    DateOnly? DataObjetivo = null);

public sealed record AlterarPoupancaPartilhadaPedido(
    [Maximo(200)] string? Nome = null,
    [DinheiroMaiorQueZero] decimal? Objetivo = null,
    DateOnly? DataObjetivo = null,
    IReadOnlyList<string>? Limpar = null);

/// <summary>Pôr dinheiro no mealheiro (sai da conta) ou levantar (entra na conta).</summary>
public sealed record MovimentarPoupancaPartilhadaPedido(
    [DinheiroMaiorQueZero] decimal Valor);

public sealed record MovimentoPoupancaPartilhadaDto(
    string Id,
    string Uid,
    string Nome,
    decimal Valor,
    bool Automatico,
    DateOnly Data);

public sealed record PagamentoFixaDto(
    string Id,
    string FixaId,
    string Mes,
    string Titulo,
    decimal Valor,
    DateOnly Data,
    EstadoPagamento Estado,
    bool Parcial = false,
    decimal? Consumo = null);

/// <summary>Pagar a fatura de uma despesa variável: o valor que veio na fatura e, se quiser, o consumo (kWh, m³...).</summary>
public sealed record PagarFaturaPedido(
    [DinheiroMaiorQueZero] decimal Valor,
    [DinheiroPositivo] decimal? Consumo = null);

public sealed record DebitarParcialPedido(
    [DinheiroPositivo] decimal Valor);

/// <summary>Pagamento de um mês passado (ex.: importado do Excel): fica no histórico sem mexer na conta.</summary>
public sealed record RegistarPagamentoPedido(
    [Obrigatorio, Maximo(200)] string Titulo,
    [DinheiroPositivo] decimal Valor,
    DateOnly? Data);

// ---- Despesas extras ----

/// <param name="Categoria">Sem categoria (despesas antigas): a app mostra-as como "outros".</param>
public sealed record DespesaExtraDto(
    string Id,
    string Titulo,
    decimal Valor,
    DateOnly? Data,
    string? Mes,
    bool DescontadaDaConta,
    string? Categoria = null,
    MeioPagamento MeioPagamento = MeioPagamento.Conta,
    string? GastoRecorrenteId = null,
    string? DespesaPartilhadaId = null,
    // O saldo do meio de pagamento (conta ou cartão) logo antes de esta despesa o debitar
    decimal? SaldoAntes = null,
    decimal? Litros = null);

/// <summary>Nova despesa extra: sai logo da conta. Sem data, é de hoje; sem categoria, fica a sugerida pelo título.</summary>
public sealed record NovaDespesaExtraPedido(
    [Obrigatorio, Maximo(200)] string Titulo,
    [DinheiroPositivo] decimal Valor,
    DateOnly? Data,
    [Categoria] string? Categoria = null,
    MeioPagamento? MeioPagamento = null,
    [DinheiroPositivo] decimal? Litros = null);

/// <summary>Despesa de um mês passado (ex.: importada do Excel): fica no histórico sem mexer na conta.</summary>
public sealed record DespesaHistoricaPedido(
    [Obrigatorio, Maximo(200)] string Titulo,
    [DinheiroPositivo] decimal Valor,
    [Obrigatorio] DateOnly? Data,
    [Categoria] string? Categoria = null,
    MeioPagamento? MeioPagamento = null);

/// <summary>Alterar uma despesa extra: só os campos enviados mudam. Mudar o valor acerta a conta pela diferença.</summary>
public sealed record AlterarDespesaExtraPedido(
    [Maximo(200)] string? Titulo,
    [DinheiroPositivo] decimal? Valor,
    DateOnly? Data,
    [Categoria] string? Categoria = null,
    MeioPagamento? MeioPagamento = null,
    [DinheiroPositivo] decimal? Litros = null);

/// <summary>
/// O resultado de um POST com <c>Idempotency-Key</c>: <see cref="Criado"/> = false quando a chave já tinha
/// sido usada (devolve o id da despesa criada da primeira vez, sem a criar nem cobrar outra vez).
/// </summary>
public sealed record ResultadoCriacao(string Id, bool Criado);

/// <summary>Os filtros da pesquisa de despesas extras (todos opcionais).</summary>
public sealed record FiltroPesquisaDespesas(
    string? Texto = null,
    string? Categoria = null,
    MeioPagamento? MeioPagamento = null,
    decimal? ValorMin = null,
    decimal? ValorMax = null,
    DateOnly? De = null,
    DateOnly? Ate = null,
    int Pagina = 1,
    int Tamanho = 50);

/// <summary>Uma página de resultados da pesquisa, com o número e a soma de <b>todos</b> os resultados.</summary>
public sealed record PesquisaDespesasDto(int Total, decimal Soma, int Pagina, int Tamanho, IReadOnlyList<DespesaExtraDto> Itens);

// ---- Gastos recorrentes (gastos do dia a dia que se repetem) ----

public sealed record GastoRecorrenteDto(
    string Id,
    string Titulo,
    decimal Valor,
    string? Categoria,
    MeioPagamento MeioPagamento,
    Frequencia Frequencia,
    int? DiaSemana,
    int? DiaMes,
    DateOnly Inicio,
    DateOnly? Fim,
    bool Ativo,
    DateOnly? UltimaGeracao);

/// <summary>
/// Novo gasto recorrente. Sem início, começa hoje. Semanal sem dia da semana: o dia da semana do início;
/// mensal sem dia do mês: o dia do início. As repetições até hoje (incluindo a de hoje) são geradas logo.
/// </summary>
public sealed record NovoGastoRecorrentePedido(
    [Obrigatorio, Maximo(200)] string Titulo,
    [DinheiroMaiorQueZero] decimal Valor,
    [Obrigatorio] Frequencia? Frequencia,
    [Entre(1, 7)] int? DiaSemana = null,
    [Entre(1, 31)] int? DiaMes = null,
    DateOnly? Inicio = null,
    DateOnly? Fim = null,
    [Categoria] string? Categoria = null,
    MeioPagamento? MeioPagamento = null);

/// <summary>Alterar um gasto recorrente (só o que vier). <c>ativo: false</c> põe em pausa; <c>true</c> retoma.</summary>
public sealed record AlterarGastoRecorrentePedido(
    [Maximo(200)] string? Titulo = null,
    [DinheiroMaiorQueZero] decimal? Valor = null,
    [Categoria] string? Categoria = null,
    MeioPagamento? MeioPagamento = null,
    bool? Ativo = null,
    DateOnly? Fim = null);

// ---- Registo de alterações ----

/// <summary>
/// Uma alteração. <see cref="Alteracoes"/>: os campos que mudaram, <c>{"Valor":{"de":20,"para":25}}</c>
/// (ao criar só "para", ao apagar só "de").
/// </summary>
public sealed record RegistoAlteracaoDto(
    string Id,
    string Entidade,
    string EntidadeId,
    string? Descricao,
    AcaoAlteracao Acao,
    DateTimeOffset Quando,
    System.Text.Json.JsonElement? Alteracoes,
    string? Origem);

public sealed record PaginaAlteracoesDto(int Total, int Pagina, int Tamanho, IReadOnlyList<RegistoAlteracaoDto> Itens);

// ---- Orçamentos (limite mensal por categoria) ----

public sealed record OrcamentoDto(string Id, string Categoria, decimal Limite);

/// <summary>Novo orçamento: um por categoria (repetir a categoria responde 409).</summary>
public sealed record NovoOrcamentoPedido(
    [Obrigatorio, Categoria] string Categoria,
    [DinheiroMaiorQueZero] decimal Limite);

/// <summary>Alterar um orçamento: só os campos enviados mudam.</summary>
public sealed record AlterarOrcamentoPedido(
    [Categoria] string? Categoria,
    [DinheiroMaiorQueZero] decimal? Limite);

/// <summary>Um orçamento num mês: gasto (as despesas extras desse mês na categoria), limite, percentagem e estado.</summary>
/// <param name="Previsto">
/// Só no mês atual: quanto se terá gasto no fim do mês ao ritmo de agora (o gasto do dia a dia estica, as despesas
/// mensais já pagas ficam como estão; ver <see cref="Regras.RitmoOrcamento"/>). <c>null</c> noutros meses.
/// </param>
public sealed record EstadoOrcamentoDto(
    string Id,
    string Categoria,
    string Mes,
    decimal Limite,
    decimal Gasto,
    decimal Restante,
    decimal Percentagem,
    EstadoOrcamento Estado,
    decimal? Previsto = null);

// ---- Objetivos de poupança ----

/// <summary>Um objetivo com os números calculados para o mês atual.</summary>
/// <param name="ValorAtual">O saldo da poupança ligada, ou o valor escrito à mão.</param>
/// <param name="PoupancaNome">Nome da poupança ligada (só quando existe).</param>
/// <param name="ContribuicaoMensal">
/// O que a poupança ligada recebe por mês (o ritmo a que se poupa de facto). <c>null</c> sem poupança ligada:
/// sem poupança não há ritmo conhecido.
/// </param>
/// <param name="Diferenca">Contribuição mensal − <c>ValorPorMes</c>: positivo, vai à frente; negativo, falta isto por mês.</param>
/// <param name="MesPrevisto">O mês em que o objetivo é atingido ao ritmo da contribuição (<c>null</c> se não chega ou já está atingido).</param>
public sealed record ObjetivoDto(
    string Id,
    string Nome,
    decimal ValorAlvo,
    string MesAlvo,
    string MesInicio,
    string? PoupancaId,
    string? PoupancaNome,
    decimal ValorAtual,
    decimal Percentagem,
    decimal EmFalta,
    int MesesRestantes,
    decimal ValorPorMes,
    EstadoObjetivo Estado,
    decimal? ContribuicaoMensal = null,
    decimal? Diferenca = null,
    string? MesPrevisto = null);

/// <summary>
/// Novo objetivo. Com <see cref="PoupancaId"/>, o progresso é o saldo dessa poupança; sem ela, é o
/// <see cref="ValorAtual"/> (0 se não for enviado). O mês alvo não pode já ter passado.
/// </summary>
public sealed record NovoObjetivoPedido(
    [Obrigatorio, Maximo(200)] string Nome,
    [DinheiroMaiorQueZero] decimal ValorAlvo,
    [Obrigatorio, Mes] string MesAlvo,
    [Maximo(128)] string? PoupancaId,
    [DinheiroPositivo] decimal? ValorAtual);

/// <summary>
/// Alterar um objetivo: só os campos enviados mudam. "poupancaId" em <see cref="Limpar"/> desliga a
/// poupança: o valor atual passa a ser o <see cref="ValorAtual"/> enviado ou, sem ele, o saldo que a
/// poupança tinha (o progresso não cai para zero).
/// </summary>
public sealed record AlterarObjetivoPedido(
    [Maximo(200)] string? Nome,
    [DinheiroMaiorQueZero] decimal? ValorAlvo,
    [Mes] string? MesAlvo,
    [Maximo(128)] string? PoupancaId,
    [DinheiroPositivo] decimal? ValorAtual,
    IReadOnlyList<string>? Limpar);

// ---- Estatísticas ----

/// <param name="Percentagem">Parte do total do mês, em %, com uma casa decimal.</param>
public sealed record GastoCategoriaDto(string Categoria, decimal Total, int Quantidade, decimal Percentagem);

/// <summary>As despesas extras de um mês somadas por categoria (da que tem mais gastos para a que tem menos).</summary>
public sealed record GastosPorCategoriaDto(string Mes, decimal Total, IReadOnlyList<GastoCategoriaDto> Categorias);

/// <summary>Um mês da evolução: os mesmos números da folha do mês (Resumo do mês na app).</summary>
/// <param name="Entrou">Lucro (sem o cartão de alimentação).</param>
/// <param name="Gasto">Despesas (mensais) + Despesas do Mês (extras).</param>
/// <param name="Poupado">Poupança (as contribuições do dia do salário).</param>
/// <param name="SaldoFinal">Saldo da conta no fim do mês (no mês atual, o saldo de agora); null quando não se sabe.</param>
/// <param name="DespesasMensais">A parte do Gasto que são despesas mensais.</param>
/// <param name="DespesasExtras">A parte do Gasto que são despesas extras (Despesas do Mês).</param>
/// <param name="Livre">O que sobra: Entrou - Gasto - Poupado (o Total da folha), nunca abaixo de 0.</param>
/// <param name="CartaoCarregado">O que o cartão de alimentação carrega nesse mês (0 sem cartão). Fica fora de Entrou.</param>
/// <param name="CartaoGasto">O que se gastou com o cartão de alimentação nesse mês. Fica fora de Gasto.</param>
public sealed record EvolucaoMesDto(
    string Mes,
    decimal Entrou,
    decimal Gasto,
    decimal Poupado,
    // A app distingue null ("não se sabe") de 0: é sempre enviado
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] decimal? SaldoFinal,
    decimal DespesasMensais,
    decimal DespesasExtras,
    decimal Livre,
    decimal CartaoCarregado = 0m,
    decimal CartaoGasto = 0m);

/// <summary>Um número do mês comparado com o do mês anterior.</summary>
/// <param name="Diferenca">Atual - anterior, em euros.</param>
/// <param name="Variacao">A diferença em % do anterior (uma casa decimal); null quando o anterior é 0 ("novo").</param>
public sealed record ComparacaoValorDto(
    decimal Atual,
    decimal Anterior,
    decimal Diferenca,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] decimal? Variacao);

/// <summary>Os gastos do dia a dia de uma categoria comparados com os do mês anterior.</summary>
public sealed record ComparacaoCategoriaDto(
    string Categoria,
    decimal Atual,
    decimal Anterior,
    decimal Diferenca,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] decimal? Variacao);

/// <summary>Um mês comparado com o anterior (Análise).</summary>
/// <param name="AteDia">No mês atual, os gastos do dia a dia comparam-se com os do mês anterior só até este dia
/// (ex.: 1-15 out. com 1-15 set.); null nos meses passados (meses completos).</param>
/// <param name="GastosDiaADia">As despesas extras (até <paramref name="AteDia"/> no mês anterior, quando há).</param>
/// <param name="DespesasFixas">As despesas mensais da folha (meses completos).</param>
/// <param name="Categorias">Os gastos do dia a dia por categoria, da maior diferença (para cima ou para baixo) para a menor.</param>
public sealed record ComparacaoMesDto(
    string Mes,
    string MesAnterior,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] int? AteDia,
    ComparacaoValorDto GastosDiaADia,
    ComparacaoValorDto DespesasFixas,
    ComparacaoValorDto Poupado,
    ComparacaoValorDto Entrou,
    IReadOnlyList<ComparacaoCategoriaDto> Categorias);

/// <summary>A previsão do saldo da conta no fim do mês atual.</summary>
/// <param name="SaldoAtual">O Saldo Disponível (a conta, já com o salário e os débitos de hoje).</param>
/// <param name="PorPagarFixas">As despesas mensais ainda por pagar este mês.</param>
/// <param name="EstimativaGastos">Os gastos do dia a dia que ainda devem sair da conta (média × dias restantes + recorrentes).</param>
/// <param name="GastosRecorrentes">A parte da estimativa que são as próximas repetições dos gastos recorrentes ativos.</param>
/// <param name="PrevisaoFinal">Saldo atual - por pagar - poupanças por enviar - estimativa.</param>
/// <param name="MediaDiaria">Média por dia dos gastos do dia a dia pagos com a conta (sem os recorrentes ativos).</param>
/// <param name="DiasRestantes">Os dias depois de hoje até ao fim do mês.</param>
/// <param name="Base">De onde vem a média: "3 meses", "2 meses", "1 mês" ou "este mês".</param>
/// <param name="MesesBase">Quantos meses completos deram a média (0 = "este mês").</param>
/// <param name="PoupancasPorEnviar">As contribuições manuais deste mês ainda por enviar (das poupanças com "Contar no previsto").</param>
/// <param name="Categorias">
/// A <c>EstimativaGastos</c> repartida por categoria (a maior primeiro): o simulador "e se…" da app usa-a para
/// saber quanto se pode mesmo cortar em cada uma. Soma a estimativa (±1 cêntimo, por arredondamentos).
/// </param>
/// <param name="CategoriasMes">
/// Quanto se gasta num mês inteiro normal em cada categoria (média dos meses anteriores × dias do mês + os recorrentes do
/// mês todo), da maior para a menor: a base do simulador mensal ("o que recebo por mês") da app.
/// </param>
public sealed record PrevisaoFimMesDto(
    string Mes,
    decimal SaldoAtual,
    decimal PorPagarFixas,
    decimal EstimativaGastos,
    decimal GastosRecorrentes,
    decimal PrevisaoFinal,
    decimal MediaDiaria,
    int DiasRestantes,
    string Base,
    int MesesBase,
    decimal PoupancasPorEnviar = 0m,
    IReadOnlyList<PrevisaoCategoriaDto>? Categorias = null,
    IReadOnlyList<PrevisaoCategoriaDto>? CategoriasMes = null,
    PrevisaoCartaoDto? Cartao = null);

/// <summary>
/// O cartão de alimentação até ao fim do mês, à parte da conta (tem saldo próprio e os gastos pagos com ele não saem
/// da conta). <c>PrevisaoFinal</c> = saldo + o que ainda carrega − os gastos previstos com o cartão; se der negativo,
/// <c>Falta</c> é o que teria de sair da conta (o cartão não fica negativo: paga-se com a conta).
/// </summary>
public sealed record PrevisaoCartaoDto(
    decimal Saldo,
    decimal CargaPorReceber,
    decimal MediaDiaria,
    decimal GastosRecorrentes,
    decimal EstimativaGastos,
    decimal PrevisaoFinal,
    decimal Falta);

/// <summary>Um valor em euros numa categoria; <c>Fixas</c> é a parte que é de despesas mensais.</summary>
public sealed record ValorCategoriaDto(string Categoria, decimal Valor, decimal Fixas = 0m);

/// <summary>Os gastos de um meio de pagamento por categoria: o do mês atual até hoje e a média por mês dos meses completos anteriores.</summary>
public sealed record GastosDoMeioDto(IReadOnlyList<ValorCategoriaDto> MesAtual, IReadOnlyList<ValorCategoriaDto> Media);

/// <summary>
/// O que já se gastou por categoria (despesas extras e despesas mensais pagas) e separado entre a conta e o cartão de
/// alimentação. Só valores reais, sem previsões. As despesas mensais pagas contam na conta. <c>MesesBase</c> são os meses completos que deram a média (0 = ainda sem histórico;
/// a média vem vazia). Sem cartão de alimentação configurado, <c>Cartao</c> é null e <c>CartaoMensal</c> 0.
/// </summary>
/// <param name="Mes">O mês atual (AAAA-MM).</param>
/// <param name="MesesBase">Quantos meses completos deram a média (no máximo o pedido).</param>
/// <param name="Conta">Os gastos pagos com a conta.</param>
/// <param name="Cartao">Os gastos pagos com o cartão de alimentação (null: sem cartão).</param>
/// <param name="CartaoMensal">O que o cartão carrega por mês (valor mensal, ou por dia útil × dias úteis do mês atual).</param>
public sealed record GastosCategoriasDto(
    string Mes,
    int MesesBase,
    GastosDoMeioDto Conta,
    GastosDoMeioDto? Cartao,
    decimal CartaoMensal);

/// <summary>Quanto ainda se prevê gastar, até ao fim do mês, numa categoria (média dos meses anteriores × dias que faltam + recorrentes).</summary>
public sealed record PrevisaoCategoriaDto(string Categoria, decimal Estimativa);

// ---- Poupanças ----

public sealed record PoupancaDto(
    string Id,
    string Nome,
    TipoContribuicao Tipo,
    string Valor,
    decimal Saldo,
    long? Ordem,
    bool ContribuicaoAutomatica = true,
    int? DiaContribuicao = null,
    string? UltimaContribuicaoMes = null,
    bool ContarNoPrevisto = true,
    DateOnly? UltimaContribuicaoEm = null,
    decimal ValorMensal = 0m,
    decimal? TaxaAnual = null,
    decimal Retencao = 28m,
    bool JurosAutomaticos = false,
    decimal JurosMes = 0m,
    decimal JurosRecebidos = 0m);

public sealed record PontoProjecao(int Mes, decimal Saldo);

/// <summary>Quanto vale uma poupança daqui a N meses (ver <c>RegrasPoupancas.Projetar</c>).</summary>
public sealed record ResultadoProjecao(
    decimal SaldoFinal,
    decimal Contribuicoes,
    decimal JurosBrutos,
    decimal JurosLiquidos,
    IReadOnlyList<PontoProjecao> Pontos);

/// <summary>A projeção de uma poupança: o que se ganha em <paramref name="Meses"/> meses à taxa dada.</summary>
public sealed record ProjecaoPoupancaDto(
    int Meses,
    decimal TaxaAnual,
    decimal Retencao,
    decimal SaldoInicial,
    decimal ContribuicaoMensal,
    decimal SaldoFinal,
    decimal Contribuicoes,
    decimal JurosBrutos,
    decimal JurosLiquidos,
    IReadOnlyList<PontoProjecao> Pontos);

public sealed record NovaPoupancaPedido(
    [Obrigatorio, Maximo(200)] string Nome,
    TipoContribuicao Tipo,
    [Obrigatorio(AllowEmptyStrings = true), Maximo(50)] string Valor,
    [Dinheiro] decimal Saldo,
    long? Ordem,
    bool ContribuicaoAutomatica = true,
    [Entre(1, 31)] int? DiaContribuicao = null,
    bool ContarNoPrevisto = true,
    [Percentagem] decimal? TaxaAnual = null,
    [Percentagem] decimal? Retencao = null,
    bool JurosAutomaticos = false);

/// <summary>Nome e contribuição mensal (o saldo muda com ajustar/definir/transferir).</summary>
public sealed record AlterarPoupancaPedido(
    [Maximo(200)] string? Nome,
    TipoContribuicao? Tipo,
    [Maximo(50)] string? Valor,
    long? Ordem,
    bool? ContribuicaoAutomatica = null,
    [Entre(1, 31)] int? DiaContribuicao = null,
    IReadOnlyList<string>? Limpar = null,
    bool? ContarNoPrevisto = null,
    [Percentagem] decimal? TaxaAnual = null,
    [Percentagem] decimal? Retencao = null,
    bool? JurosAutomaticos = null);

public enum ResultadoContribuicaoPoupanca
{
    [JsonStringEnumMemberName("adicionada")]
    Adicionada,

    [JsonStringEnumMemberName("ja-adicionada")]
    JaAdicionada,

    [JsonStringEnumMemberName("saldo-insuficiente")]
    SaldoInsuficiente,
}

public sealed record ResultadoContribuicaoPoupancaDto(ResultadoContribuicaoPoupanca Resultado);

/// <summary>
/// Uma contribuição manual de um mês passado (dos últimos 3) que ficou por enviar. <paramref name="Valor"/> é o que
/// se envia agora (a contribuição configurada hoje); regulariza-se com <c>POST /api/poupancas/{id}/contribuir?mes=</c>.
/// </summary>
public sealed record ContribuicaoEmAtrasoDto(string PoupancaId, string Nome, string Mes, decimal Valor);

// ---- Dívidas ----

/// <summary>
/// Uma dívida. Os campos do contrato (taxa, financiado, entrada, prazo...) são todos opcionais: sem
/// <see cref="TaxaAnual"/> a dívida é só "quanto falta pagar"; com ela, <see cref="ValorInicial"/> é o capital em dívida.
/// </summary>
public sealed record DividaDto(
    string Id,
    string Titulo,
    decimal ValorInicial,
    string Desde,
    string? FixaId,
    decimal? TaxaAnual = null,
    decimal? ValorFinanciado = null,
    decimal? Entrada = null,
    int? PrazoMeses = null,
    string? InicioContrato = null,
    decimal? ComissaoReembolso = null,
    decimal? EncargosMensais = null,
    string? NumeroContrato = null,
    string? Credor = null);

/// <summary>
/// As contas de um crédito com taxa. Os valores "do contrato" só existem se houver o que é preciso para os calcular.
/// </summary>
/// <param name="PrestacaoSemEncargos">A prestação de capital + juros (o que o credor debita menos os seguros e o selo).</param>
/// <param name="JurosProximaPrestacao">Os juros que vão na próxima prestação (capital em dívida × taxa mensal).</param>
/// <param name="PrimeiroMes">O mês da próxima prestação a pagar.</param>
/// <param name="MesesRestantes">Quantas prestações faltam, a esta prestação (null se não chega para os juros).</param>
/// <param name="Fim">O mês da última prestação.</param>
/// <param name="JurosRestantes">Os juros que ainda vai pagar.</param>
/// <param name="TotalRestante">O que ainda vai sair do bolso até ao fim: capital + juros + selo + seguros.</param>
/// <param name="PrecoTotal">O valor do bem: o financiado mais a entrada.</param>
/// <param name="CapitalAmortizado">Quanto do financiado já foi pago (financiado menos o capital em dívida).</param>
/// <param name="JurosContrato">Os juros do contrato inteiro, se se pagar sempre a prestação do contrato (estimativa).</param>
/// <param name="CustoTotalContrato">O que o contrato custa ao todo: entrada + financiado + juros + selo + seguros (estimativa).</param>
/// <param name="PagoEmJurosEEncargos">O que já pagaste desde que registaste a dívida e não foi capital (juros, selo e seguros).</param>
public sealed record ResumoContratoDto(
    decimal PrestacaoSemEncargos,
    decimal JurosProximaPrestacao,
    string PrimeiroMes,
    int? MesesRestantes,
    string? Fim,
    decimal JurosRestantes,
    decimal TotalRestante,
    bool Viavel,
    decimal? PrecoTotal,
    decimal? CapitalAmortizado,
    decimal? JurosContrato,
    decimal? CustoTotalContrato,
    decimal PagoEmJurosEEncargos);

/// <summary>O que o último extrato do credor dizia: a próxima prestação e o estado do contrato.</summary>
/// <param name="CapitalVencido">Capital em atraso; 0 = em dia.</param>
public sealed record ExtratoDividaDto(
    DateOnly EmitidoEm,
    int? ProximaPrestacaoNumero,
    int? PrestacaoTotal,
    DateOnly? Vencimento,
    decimal? PrestacaoValor,
    decimal? PrestacaoCapital,
    decimal? PrestacaoJuros,
    decimal? PrestacaoSelo,
    decimal? PrestacaoSeguros,
    decimal? CapitalVencido,
    bool EmAtraso);

public sealed record DividaComEstadoDto(
    string Id,
    string Titulo,
    decimal ValorInicial,
    string Desde,
    string? FixaId,
    decimal EmFalta,
    decimal Pago,
    // A app distingue null ("sem prestação ligada") de um número: é sempre enviado
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] int? MesesEmFalta,
    decimal? Prestacao,
    decimal? TaxaAnual = null,
    decimal? ValorFinanciado = null,
    decimal? Entrada = null,
    int? PrazoMeses = null,
    string? InicioContrato = null,
    decimal? ComissaoReembolso = null,
    decimal? EncargosMensais = null,
    string? NumeroContrato = null,
    string? Credor = null,
    ResumoContratoDto? Resumo = null,
    ExtratoDividaDto? Extrato = null)
{
    /// <summary>
    /// O que ainda falta pagar, como a pessoa o conta: nas dívidas sem taxa é o valor em falta; num crédito
    /// com taxa é tudo o que ainda vai sair (capital, juros, selo e seguros), e não só o capital.
    /// </summary>
    public decimal TotalAPagar() => Resumo is { Viavel: true, MesesRestantes: not null } r ? r.TotalRestante : EmFalta;
}

public sealed record NovaDividaPedido(
    [Obrigatorio, Maximo(200)] string Titulo,
    [DinheiroPositivo] decimal ValorInicial,
    [Obrigatorio, Mes] string Desde,
    [Maximo(128)] string? FixaId,
    [Percentagem] decimal? TaxaAnual = null,
    [DinheiroPositivo] decimal? ValorFinanciado = null,
    [DinheiroPositivo] decimal? Entrada = null,
    [Entre(1, 1200)] int? PrazoMeses = null,
    [Mes] string? InicioContrato = null,
    [Percentagem] decimal? ComissaoReembolso = null,
    [DinheiroPositivo] decimal? EncargosMensais = null,
    [Maximo(64)] string? NumeroContrato = null,
    [Maximo(100)] string? Credor = null);

/// <summary>
/// Alterar uma dívida: só os campos enviados mudam; os nomes em <see cref="Limpar"/> voltam a ficar vazios
/// ("fixaId" desliga a prestação; "taxaAnual", "valorFinanciado", "entrada", "prazoMeses", "inicioContrato",
/// "comissaoReembolso" e "encargosMensais" apagam esse campo do contrato).
/// </summary>
public sealed record AlterarDividaPedido(
    [Maximo(200)] string? Titulo,
    [DinheiroPositivo] decimal? ValorInicial,
    [Mes] string? Desde,
    [Maximo(128)] string? FixaId,
    IReadOnlyList<string>? Limpar,
    [Percentagem] decimal? TaxaAnual = null,
    [DinheiroPositivo] decimal? ValorFinanciado = null,
    [DinheiroPositivo] decimal? Entrada = null,
    [Entre(1, 1200)] int? PrazoMeses = null,
    [Mes] string? InicioContrato = null,
    [Percentagem] decimal? ComissaoReembolso = null,
    [DinheiroPositivo] decimal? EncargosMensais = null,
    [Maximo(64)] string? NumeroContrato = null,
    [Maximo(100)] string? Credor = null);

// ---- Simulador de dívidas ----

/// <summary>O que simular: uma amortização de uma vez e/ou pagar mais todos os meses. A amortização total vem sempre.</summary>
public sealed record SimularDividaPedido(
    [DinheiroPositivo] decimal? Amortizacao,
    [DinheiroPositivo] decimal? ExtraMensal);

/// <summary>O resultado do simulador de uma dívida (ver <see cref="CenarioDivida"/>).</summary>
/// <param name="PrimeiroMes">O mês da próxima prestação (a partir dele contam os meses dos cenários).</param>
/// <param name="Atual">Sem fazer nada.</param>
/// <param name="ManterPrestacao">Amortizar X e manter a prestação: a dívida acaba mais cedo.</param>
/// <param name="ReduzirPrestacao">Amortizar X e reduzir a prestação: a dívida acaba no mesmo mês.</param>
/// <param name="AmortizacaoTotal">Pagar tudo já.</param>
/// <param name="ExtraMensal">Pagar mais em cada prestação.</param>
public sealed record SimulacaoDividaDto(
    decimal CapitalEmFalta,
    decimal TaxaAnual,
    decimal ComissaoReembolso,
    decimal EncargosMensais,
    string PrimeiroMes,
    CenarioDivida Atual,
    CenarioDivida? ManterPrestacao,
    CenarioDivida? ReduzirPrestacao,
    CenarioDivida AmortizacaoTotal,
    CenarioDivida? ExtraMensal);

public sealed record CompararEstrategiasPedido([DinheiroPositivo] decimal ExtraMensal);

/// <summary>Bola de neve e avalanche lado a lado, para todas as dívidas com prestação ligada.</summary>
/// <param name="Ignoradas">Os títulos das dívidas que ficaram de fora (sem prestação ligada ou já pagas).</param>
public sealed record ComparacaoEstrategiasDto(
    decimal ExtraMensal,
    IReadOnlyList<Amortizacao.DividaEstrategia> Dividas,
    Amortizacao.ResultadoEstrategia SoPrestacoes,
    Amortizacao.ResultadoEstrategia BolaDeNeve,
    Amortizacao.ResultadoEstrategia Avalanche,
    IReadOnlyList<string> Ignoradas);

// ---- Extrato de um crédito (PDF do credor) ----

/// <summary>O PDF do extrato em base64 (só é lido: não fica guardado).</summary>
public sealed record LerExtratoPedido([Obrigatorio, Maximo(14_000_000)] string PdfBase64);

/// <summary>
/// O que se leu num extrato de crédito. Não leva dados pessoais (morada, NIF, IBAN): só o contrato e a próxima prestação.
/// </summary>
public sealed record ExtratoCreditoDto(
    [Obrigatorio, Maximo(100)] string Credor,
    [Obrigatorio, Maximo(64)] string NumeroContrato,
    [Maximo(200)] string? Categoria,
    DateOnly? DataContrato,
    DateOnly EmitidoEm,
    [Percentagem] decimal TaxaAnual,
    [DinheiroPositivo] decimal CapitalInicial,
    [DinheiroPositivo] decimal CapitalAmortizado,
    [DinheiroPositivo] decimal CapitalVencido,
    [DinheiroPositivo] decimal CapitalVincendo,
    [Entre(1, 1200)] int PrestacaoNumero,
    [Entre(1, 1200)] int PrestacaoTotal,
    DateOnly Vencimento,
    [DinheiroPositivo] decimal PrestacaoValor,
    [DinheiroPositivo] decimal PrestacaoCapital,
    [DinheiroPositivo] decimal PrestacaoJuros,
    [DinheiroPositivo] decimal PrestacaoSelo,
    [DinheiroPositivo] decimal PrestacaoSeguros,
    IReadOnlyList<string> Avisos);

/// <summary>A leitura de um extrato e a dívida a que parece pertencer (pelo número do contrato).</summary>
public sealed record ExtratoLidoDto(ExtratoCreditoDto Extrato, string? DividaId, string? DividaTitulo);

/// <summary>
/// Aplicar um extrato: atualiza a dívida <see cref="DividaId"/> ou, sem ela, cria uma nova com o
/// <see cref="Titulo"/>. A prestação (despesa fixa) pode ligar-se aqui.
/// </summary>
public sealed record AplicarExtratoPedido(
    [Obrigatorio] ExtratoCreditoDto Extrato,
    [Maximo(128)] string? DividaId,
    [Maximo(200)] string? Titulo,
    [Maximo(128)] string? FixaId);

// ---- Folha do mês e histórico ----

/// <summary>Uma linha de um bloco da folha.</summary>
/// <param name="Data">Despesas do Mês: o dia da despesa. Despesas (mensais): o dia em que foi paga.</param>
/// <param name="Estado">Só nas Despesas (mensais) que a API devolve: paga ou por pagar (no mês atual). Nos meses
/// passados, uma despesa sem registo nesse mês fica sem estado (ex.: meses importados do Excel).</param>
/// <param name="CartaoAlimentacao">Despesas do Mês: paga com o cartão de alimentação (não conta nos totais: o cartão é à parte da conta).</param>
/// <param name="ValorEmFalta">Só nas despesas com pagamento parcial: o que falta pagar (o Valor é o que já foi pago).</param>
public sealed record LinhaFolhaDto(
    string Titulo,
    decimal Valor,
    DateOnly? Data = null,
    bool? Informativo = null,
    EstadoLinha? Estado = null,
    bool? CartaoAlimentacao = null,
    decimal? ValorEmFalta = null);

/// <summary>O estado de uma despesa mensal na folha de um mês.</summary>
public enum EstadoLinha
{
    [JsonStringEnumMemberName("pago")]
    Pago,

    [JsonStringEnumMemberName("parcial")]
    Parcial,

    [JsonStringEnumMemberName("por-pagar")]
    PorPagar,
}

/// <summary>Os dados de um mês com os blocos do livro Excel do utilizador (DadosFolhaMes na app).</summary>
public sealed record DadosFolhaMesDto(
    [Mes] string Mes,
    [Obrigatorio] IReadOnlyList<LinhaFolhaDto> Lucro,
    [Obrigatorio] IReadOnlyList<LinhaFolhaDto> Despesas,
    [Obrigatorio] IReadOnlyList<LinhaFolhaDto> Poupanca,
    [Obrigatorio] IReadOnlyList<LinhaFolhaDto> DespesasMes,
    [Obrigatorio] IReadOnlyList<LinhaFolhaDto> Anual,
    decimal? SaldoConta,
    [Obrigatorio] IReadOnlyList<LinhaFolhaDto> Falta,
    [Obrigatorio] IReadOnlyList<LinhaFolhaDto> SaldoPoupanca,
    [Obrigatorio] IReadOnlyList<LinhaFolhaDto> TotalAPagar);

public sealed record BlocosImportadosDto(
    IReadOnlyList<LinhaFolhaDto>? Lucro,
    IReadOnlyList<LinhaFolhaDto>? Poupanca,
    decimal? SaldoConta,
    IReadOnlyList<LinhaFolhaDto>? SaldoPoupanca,
    IReadOnlyList<LinhaFolhaDto>? TotalAPagar);

public sealed record ResumoMesDto(
    string Mes,
    decimal? SaldoInicial,
    decimal? SaldoFinal,
    RecebimentoDto? Recebimento,
    BlocosImportadosDto? Importado);

public sealed record OpcoesImportacaoDto(bool AtualizarSaldosPoupancas = false, bool AtualizarDividas = false);

public sealed record ImportarFolhaPedido([Obrigatorio] DadosFolhaMesDto Dados, OpcoesImportacaoDto? Opcoes);

/// <summary>O que a importação de uma folha fez (ResumoImportacao na app).</summary>
public sealed record ResumoImportacaoDto(
    string Mes,
    IReadOnlyList<string> DespesasCriadas,
    int PagamentosRegistados,
    int ExtrasRegistadas,
    IReadOnlyList<string> AnuaisCriadas,
    IReadOnlyList<string> Historico,
    IReadOnlyList<string> PoupancasAtualizadas,
    IReadOnlyList<string> DividasAtualizadas,
    IReadOnlyList<string> PorPagar,
    IReadOnlyList<string> Ignoradas);

// ---- Poupanças Partilhadas Membros (contribuições dos membros para a poupança do grupo) ----

public sealed record PoupancaPartilhadaMembroDto(
    string Id,
    string PoupancaPartilhadaId,
    string MembroUid,
    string MembroNome,
    decimal Valor,
    TipoContribuicaoPartilhada Tipo,
    bool DiaDoSalario,
    int? DiaFixo,
    string? UltimaContribuicaoMes,
    int Versao,
    DateTimeOffset CriadoEm,
    // A contribuição deste mês já foi feita (automática processada, marcada à mão, ou dinheiro posto no mealheiro que chega)
    bool FeitaEsteMes = false);

/// <summary>Marcar (ou desmarcar) à mão que a contribuição manual deste mês já foi feita.</summary>
public sealed record MarcarContribuicaoFeitaPedido(bool Feita);

public sealed record NovaPoupancaPartilhadaMembroPedido(
    [Obrigatorio, DinheiroMaiorQueZero] decimal Valor,
    TipoContribuicaoPartilhada Tipo = TipoContribuicaoPartilhada.Manual,
    bool DiaDoSalario = true,
    [Entre(1, 28)] int? DiaFixo = null);
