using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Regras;

namespace Financas.Services.Interfaces;

// O contrato da camada de negócio, num só ficheiro: é isto que os controllers usam.
// Todos os métodos recebem o uid do utilizador autenticado e só veem os dados dele.
// Recebem e devolvem DTOs (nunca entidades). Os erros são exceções de Financas.Services
// (NaoEncontradoException, PedidoInvalidoException, ConflitoException).

/// <summary>Conta corrente e os saldos da app.</summary>
public interface IContaService
{
    /// <summary>O saldo guardado, sem processar nada.</summary>
    Task<ContaCorrenteDto> ObterAsync(string uid, CancellationToken ct = default);

    /// <summary>
    /// Saldo Disponível = conta corrente, o mesmo valor em todos os ecrãs. Antes de o ler:
    /// converte dados antigos (uma vez), regista o início do mês (saldo inicial), recebe o salário
    /// se for o dia e faz os débitos automáticos que já chegaram ao dia (por esta ordem: o salário
    /// pode pagar os débitos).
    /// </summary>
    Task<decimal> CalcularSaldoDisponivelAsync(string uid, CancellationToken ct = default);

    /// <summary>Disponível, Previsto (= Disponível - despesas mensais por pagar no mês) e Por pagar.</summary>
    Task<Saldos> CalcularSaldosAsync(string uid, string? mes, CancellationToken ct = default);

    Task DefinirSaldoAsync(string uid, decimal saldo, CancellationToken ct = default);

    /// <summary>Entrada (positivo) ou saída (negativo) de dinheiro.</summary>
    Task MovimentarAsync(string uid, decimal valor, CancellationToken ct = default);

    /// <summary>O saldo do cartão de alimentação (à parte do Saldo Disponível) e o valor que carrega por mês.</summary>
    Task<CartaoAlimentacaoDto> ObterCartaoAlimentacaoAsync(string uid, CancellationToken ct = default);

    /// <summary>Acertar o saldo do cartão de alimentação para o valor real (ex.: a primeira vez).</summary>
    Task DefinirCartaoAlimentacaoAsync(string uid, decimal saldo, CancellationToken ct = default);
}

public interface IPerfilService
{
    Task<PerfilDto?> ObterAsync(string uid, CancellationToken ct = default);
    Task GuardarAsync(string uid, GuardarPerfilPedido pedido, CancellationToken ct = default);
}

/// <summary>Configurações das versões anteriores (ainda usadas como recurso nos cálculos).</summary>
public interface IConfiguracoesService
{
    Task<FinancialDataDto?> ObterFinanceiroAsync(string uid, CancellationToken ct = default);
    Task GuardarFinanceiroAsync(string uid, GuardarFinanceiroPedido pedido, CancellationToken ct = default);
    Task<ConfigPprPoupancaDto?> ObterPprPoupancaAsync(string uid, CancellationToken ct = default);
    Task GuardarPprPoupancaAsync(string uid, ConfigPprPoupancaDto pedido, CancellationToken ct = default);
}

public interface ISalarioService
{
    Task<SalarioConfigDto?> ObterAsync(string uid, CancellationToken ct = default);
    Task GuardarAsync(string uid, GuardarSalarioPedido pedido, CancellationToken ct = default);

    /// <summary>
    /// No dia do salário: entra o salário e saem logo as contribuições das poupanças, que se somam
    /// ao saldo de cada uma. Uma vez por mês. Devolve o que foi feito, ou null se hoje não havia salário.
    /// </summary>
    Task<RecebimentoDto?> ProcessarRecebimentoAsync(string uid, CancellationToken ct = default);

    /// <summary>
    /// Recebimento manual: marca o salário deste mês como recebido, já, com o valor que entrou de facto (por defeito, o
    /// configurado). Entra como o automático (poupanças automáticas e cartão de alimentação incluídos). Só com o
    /// recebimento manual ligado e uma vez por mês.
    /// </summary>
    Task<RecebimentoDto> ReceberManualAsync(string uid, decimal? valor, CancellationToken ct = default);
}

/// <summary>Despesas mensais/anuais e os pagamentos de cada mês.</summary>
public interface IDespesasFixasService
{
    /// <summary>Todas, incluindo as terminadas (para o histórico), pela ordem de criação.</summary>
    Task<IReadOnlyList<DespesaFixaDto>> ListarAsync(string uid, CancellationToken ct = default);

    Task<string> AdicionarAsync(string uid, NovaDespesaFixaPedido pedido, CancellationToken ct = default);

    /// <summary>Muda o modelo daqui para a frente: os pagamentos já feitos guardam o valor pago.</summary>
    Task AlterarAsync(string uid, string id, AlterarDespesaFixaPedido pedido, CancellationToken ct = default);

    /// <summary>
    /// Deixar de repetir. Se já foi paga este mês, conta até este mês; senão, até ao mês passado.
    /// Se nunca teve pagamentos, é apagada de vez.
    /// </summary>
    Task TerminarAsync(string uid, string id, CancellationToken ct = default);

    /// <summary>Paga a despesa no mês (por defeito, o atual): o pagamento e o saldo mudam na mesma transação.</summary>
    Task<ResultadoDebito> DebitarAsync(string uid, string id, string? mes = null, CancellationToken ct = default);

    /// <summary>Paga só uma parte do valor da despesa no mês (por defeito, o atual).</summary>
    Task<ResultadoDebito> DebitarParcialAsync(string uid, string id, decimal valor, string? mes = null, CancellationToken ct = default);

    /// <summary>
    /// Paga a despesa do mês com o valor real da fatura (e o consumo, se houver), fechando-a: o que já estava pago em
    /// parte conta, e só a diferença sai da conta. Numa despesa variável a estimativa passa a ser a média das últimas 3 faturas.
    /// </summary>
    Task<ResultadoDebito> PagarFaturaAsync(string uid, string id, PagarFaturaPedido pedido, string? mes = null, CancellationToken ct = default);

    /// <summary>Desfaz o pagamento do mês: devolve o valor pago e a despesa volta a ficar por pagar (o débito automático não a repete nesse mês).</summary>
    Task<bool> AnularDebitoAsync(string uid, string id, string? mes = null, CancellationToken ct = default);

    /// <summary>Débito automático das despesas deste mês cujo dia já chegou (se houver saldo). Devolve o total.</summary>
    Task<decimal> ProcessarDebitosAutomaticosAsync(string uid, CancellationToken ct = default);

    Task<TotaisFixas> CalcularTotaisAsync(string uid, string? mes, CancellationToken ct = default);

    Task<IReadOnlyList<PagamentoFixaDto>> ListarPagamentosDoMesAsync(string uid, string mes, CancellationToken ct = default);

    /// <summary>Todos os pagamentos de uma despesa (ex.: as prestações de uma dívida).</summary>
    Task<IReadOnlyList<PagamentoFixaDto>> ListarPagamentosDaDespesaAsync(string uid, string fixaId, CancellationToken ct = default);

    /// <summary>Pagamento de um mês passado (ex.: importado do Excel): fica no histórico sem mexer na conta.</summary>
    Task RegistarPagamentoHistoricoAsync(string uid, string mes, string fixaId, RegistarPagamentoPedido pedido, CancellationToken ct = default);
}

/// <summary>Despesas variáveis: saem da conta no momento em que são registadas.</summary>
public interface IDespesasExtrasService
{
    /// <summary>Todas (pela ordem de criação) ou só as de um mês (da mais recente para a mais antiga).</summary>
    Task<IReadOnlyList<DespesaExtraDto>> ListarAsync(string uid, string? mes, CancellationToken ct = default);

    Task<string> AdicionarAsync(string uid, NovaDespesaExtraPedido pedido, CancellationToken ct = default);

    /// <summary>
    /// Como <see cref="AdicionarAsync(string, NovaDespesaExtraPedido, CancellationToken)"/>, com a chave
    /// do cabeçalho <c>Idempotency-Key</c>: se já houver uma despesa criada com esta chave, devolve-a
    /// (<c>Criado = false</c>) sem criar nem cobrar outra vez. Seguro com pedidos ao mesmo tempo (índice único).
    /// </summary>
    Task<ResultadoCriacao> AdicionarAsync(string uid, NovaDespesaExtraPedido pedido, string? chaveIdempotencia, CancellationToken ct = default);

    /// <summary>
    /// Pesquisa em todos os meses: texto no título (sem acentos nem maiúsculas), categoria, meio de
    /// pagamento, valores e datas. Da mais recente para a mais antiga, por páginas, com o total e a soma.
    /// </summary>
    Task<PesquisaDespesasDto> PesquisarAsync(string uid, FiltroPesquisaDespesas filtro, CancellationToken ct = default);

    Task<string> AdicionarHistoricaAsync(string uid, DespesaHistoricaPedido pedido, CancellationToken ct = default);
    Task AlterarAsync(string uid, string id, AlterarDespesaExtraPedido pedido, CancellationToken ct = default);

    /// <summary>Apagar devolve o valor à conta, mas só às despesas que o descontaram.</summary>
    Task RemoverAsync(string uid, string id, CancellationToken ct = default);

    /// <summary>
    /// A categoria para uma despesa com este título: a última usada pelo utilizador no mesmo título,
    /// senão pelas palavras-chave, senão "outros" (ver <see cref="Categorias.Sugerir"/>).
    /// </summary>
    Task<SugestaoCategoria> SugerirCategoriaAsync(string uid, string? titulo, CancellationToken ct = default);
}

/// <summary>Gastos do dia a dia que se repetem (todos os dias, todas as semanas, todos os meses).</summary>
public interface IGastosRecorrentesService
{
    Task<IReadOnlyList<GastoRecorrenteDto>> ListarAsync(string uid, CancellationToken ct = default);
    Task<GastoRecorrenteDto> ObterAsync(string uid, string id, CancellationToken ct = default);

    /// <summary>Cria o gasto recorrente e gera logo as repetições até hoje (incluindo a de hoje).</summary>
    Task<string> AdicionarAsync(string uid, NovoGastoRecorrentePedido pedido, CancellationToken ct = default);

    Task AlterarAsync(string uid, string id, AlterarGastoRecorrentePedido pedido, CancellationToken ct = default);

    /// <summary>Apaga a regra. As despesas já geradas ficam (são gastos que aconteceram).</summary>
    Task RemoverAsync(string uid, string id, CancellationToken ct = default);

    /// <summary>
    /// Gera as repetições em falta até hoje, como despesas extras (corre em GET /api/conta/saldo).
    /// Devolve quantas foram geradas.
    /// </summary>
    Task<int> GerarEmFaltaAsync(string uid, CancellationToken ct = default);
}

/// <summary>O histórico das alterações aos dados do utilizador.</summary>
public interface IAlteracoesService
{
    /// <summary>
    /// Uma página do histórico, da mais recente para a mais antiga. <paramref name="de"/>: só a partir
    /// desse dia (em Portugal). Apaga primeiro as linhas com mais de um ano (retenção).
    /// </summary>
    Task<PaginaAlteracoesDto> ListarAsync(string uid, string? entidade, DateOnly? de, int pagina, int tamanho, CancellationToken ct = default);
}

/// <summary>Limites mensais de gastos por categoria de despesas extras.</summary>
public interface IOrcamentosService
{
    /// <summary>Pela ordem das categorias na app.</summary>
    Task<IReadOnlyList<OrcamentoDto>> ListarAsync(string uid, CancellationToken ct = default);

    /// <summary>Um orçamento por categoria: se já houver um para a categoria, ConflitoException (409).</summary>
    Task<string> AdicionarAsync(string uid, NovoOrcamentoPedido pedido, CancellationToken ct = default);

    Task AlterarAsync(string uid, string id, AlterarOrcamentoPedido pedido, CancellationToken ct = default);
    Task RemoverAsync(string uid, string id, CancellationToken ct = default);

    /// <summary>
    /// Cada orçamento no mês (por defeito, o atual): o gasto (as despesas extras desse mês na
    /// categoria), a percentagem do limite e o estado (ok, perto a partir de 80%, ultrapassado a partir de 100%).
    /// </summary>
    Task<IReadOnlyList<EstadoOrcamentoDto>> EstadoAsync(string uid, string? mes, CancellationToken ct = default);
}

/// <summary>Objetivos de poupança (ex.: 1500 € para férias até junho).</summary>
public interface IObjetivosService
{
    /// <summary>Com os números do mês atual; os por atingir primeiro, pelo mês alvo mais próximo.</summary>
    Task<IReadOnlyList<ObjetivoDto>> ListarAsync(string uid, CancellationToken ct = default);

    Task<ObjetivoDto> ObterAsync(string uid, string id, CancellationToken ct = default);
    Task<string> AdicionarAsync(string uid, NovoObjetivoPedido pedido, CancellationToken ct = default);
    Task AlterarAsync(string uid, string id, AlterarObjetivoPedido pedido, CancellationToken ct = default);
    Task RemoverAsync(string uid, string id, CancellationToken ct = default);
}

/// <summary>
/// Números agregados de vários dados: gastos por categoria e a evolução mês a mês. Também para
/// quem gera relatórios (ex.: o relatório mensal em PDF).
/// </summary>
public interface IEstatisticasService
{
    /// <summary>As despesas extras do mês (por defeito, o atual) somadas por categoria; as sem categoria contam como "outros".</summary>
    Task<GastosPorCategoriaDto> GastosPorCategoriaAsync(string uid, string? mes, CancellationToken ct = default);

    /// <summary>
    /// Os últimos <paramref name="meses"/> meses até <paramref name="ate"/> (por defeito, o atual),
    /// do mais antigo para o mais recente, com os números da folha de cada mês (os mesmos do Resumo do mês).
    /// </summary>
    Task<IReadOnlyList<EvolucaoMesDto>> EvolucaoAsync(string uid, int meses = 12, string? ate = null, CancellationToken ct = default);

    /// <summary>
    /// O mês (por defeito, o atual) comparado com o anterior: gastos do dia a dia (no mês atual, só até ao
    /// mesmo dia do mês anterior), despesas fixas, poupado, entrou e os gastos por categoria. Só leituras.
    /// </summary>
    Task<ComparacaoMesDto> ComparacaoAsync(string uid, string? mes, CancellationToken ct = default);

    /// <summary>
    /// A previsão do saldo no fim do mês atual: saldo - despesas fixas por pagar - estimativa dos gastos
    /// do dia a dia até ao fim do mês. Como o <c>GET /api/conta/saldos</c>, primeiro recebe o salário e faz
    /// os débitos e os gastos recorrentes de hoje.
    /// </summary>
    Task<PrevisaoFimMesDto> PrevisaoAsync(string uid, CancellationToken ct = default);

    /// <summary>
    /// O que já se gastou no dia a dia por categoria, separado entre a conta e o cartão de alimentação: o mês atual até
    /// hoje e a média por mês dos últimos <paramref name="meses"/> meses completos (sem o atual). Só valores reais.
    /// </summary>
    Task<GastosCategoriasDto> GastosCategoriasAsync(string uid, int meses = Calculos.MesesMediaGastos, CancellationToken ct = default);
}

public interface IPoupancasService
{
    Task<IReadOnlyList<PoupancaDto>> ListarAsync(string uid, CancellationToken ct = default);
    Task<string> AdicionarAsync(string uid, NovaPoupancaPedido pedido, CancellationToken ct = default);
    Task AlterarAsync(string uid, string id, AlterarPoupancaPedido pedido, CancellationToken ct = default);
    Task RemoverAsync(string uid, string id, CancellationToken ct = default);

    /// <summary>Movimento no saldo da poupança (ex.: levantamento). Não mexe na conta corrente.</summary>
    Task AjustarSaldoAsync(string uid, string id, decimal valor, CancellationToken ct = default);

    Task DefinirSaldoAsync(string uid, string id, decimal saldo, CancellationToken ct = default);

    /// <summary>Passar dinheiro da conta corrente para a poupança (negativo: da poupança para a conta).</summary>
    Task TransferirDaContaAsync(string uid, string id, decimal valor, CancellationToken ct = default);

    /// <summary>
    /// Envia a contribuição manual do mês atual ou, com <paramref name="mes"/>, de um dos últimos 3 meses que
    /// ficou por enviar (sai da conta agora e fica registada nesse mês).
    /// </summary>
    Task<ResultadoContribuicaoPoupanca> ContribuirManualmenteAsync(string uid, string id, string? mes = null, CancellationToken ct = default);

    /// <summary>As contribuições manuais dos últimos 3 meses (sem contar o atual) que ficaram por enviar.</summary>
    Task<IReadOnlyList<ContribuicaoEmAtrasoDto>> ContribuicoesEmAtrasoAsync(string uid, CancellationToken ct = default);

    Task<decimal> ProcessarContribuicoesAutomaticasAsync(string uid, CancellationToken ct = default);

    /// <summary>
    /// Soma ao saldo os juros dos meses já fechados das poupanças com juros automáticos (uma vez por mês, ao
    /// abrir a app). Devolve o total somado.
    /// </summary>
    Task<decimal> ProcessarJurosAsync(string uid, CancellationToken ct = default);

    /// <summary>Quanto vale a poupança daqui a <paramref name="meses"/> meses (taxa da poupança, ou <paramref name="taxa"/> para simular outra).</summary>
    Task<ProjecaoPoupancaDto> ProjetarAsync(string uid, string id, int meses, decimal? taxa = null, bool comContribuicoes = true, CancellationToken ct = default);
}

public interface IDividasService
{
    Task<IReadOnlyList<DividaDto>> ListarAsync(string uid, CancellationToken ct = default);

    /// <summary>Com o valor em falta calculado a partir dos pagamentos da prestação ligada.</summary>
    Task<IReadOnlyList<DividaComEstadoDto>> ListarComEstadoAsync(string uid, CancellationToken ct = default);

    Task<string> AdicionarAsync(string uid, NovaDividaPedido pedido, CancellationToken ct = default);
    Task AlterarAsync(string uid, string id, AlterarDividaPedido pedido, CancellationToken ct = default);
    Task RemoverAsync(string uid, string id, CancellationToken ct = default);

    /// <summary>O que acontece se amortizar (de uma vez ou aos poucos) esta dívida: ver <see cref="SimulacaoDividaDto"/>.</summary>
    Task<SimulacaoDividaDto> SimularAsync(string uid, string id, SimularDividaPedido pedido, CancellationToken ct = default);

    /// <summary>Bola de neve e avalanche para todas as dívidas com prestação.</summary>
    Task<ComparacaoEstrategiasDto> CompararEstrategiasAsync(string uid, CompararEstrategiasPedido pedido, CancellationToken ct = default);

    /// <summary>Lê o PDF de um extrato de crédito (não grava nada) e diz a que dívida parece pertencer.</summary>
    Task<ExtratoLidoDto> LerExtratoAsync(string uid, string pdfBase64, CancellationToken ct = default);

    /// <summary>Atualiza (ou cria) a dívida com o que diz o extrato lido. Devolve o id da dívida.</summary>
    Task<string> AplicarExtratoAsync(string uid, AplicarExtratoPedido pedido, CancellationToken ct = default);
}

/// <summary>Histórico de cada mês.</summary>
public interface IMesesService
{
    Task<ResumoMesDto?> ObterAsync(string uid, string mes, CancellationToken ct = default);
    Task GuardarImportadoAsync(string uid, string mes, BlocosImportadosDto importado, CancellationToken ct = default);

    /// <summary>
    /// Na primeira abertura da app num mês novo: o saldo da conta nesse momento é o saldo final
    /// do mês anterior e o saldo inicial deste (antes do salário e dos débitos deste mês).
    /// </summary>
    Task RegistarAberturaAsync(string uid, CancellationToken ct = default);
}

/// <summary>Conversão dos dados de versões anteriores da app (corre uma vez por utilizador).</summary>
public interface IPreparacaoDadosService
{
    Task PrepararAsync(string uid, CancellationToken ct = default);
}

/// <summary>A "folha do mês", com os blocos do livro Excel do utilizador.</summary>
public interface IFolhaMesService
{
    /// <summary>Meses com dados (despesas mensais, pagamentos ou extras), do mais antigo até ao atual.</summary>
    Task<IReadOnlyList<string>> MesesComDadosAsync(string uid, CancellationToken ct = default);

    /// <summary>O mês atual vem dos dados vivos; os meses passados vêm do histórico guardado.</summary>
    Task<DadosFolhaMesDto> ObterDadosAsync(string uid, string mes, CancellationToken ct = default);

    /// <summary>As folhas de vários meses (pela ordem pedida), montadas como em <see cref="ObterDadosAsync"/> mas lendo os dados uma só vez.</summary>
    Task<IReadOnlyList<DadosFolhaMesDto>> ObterVariosAsync(string uid, IReadOnlyList<string> meses, CancellationToken ct = default);

    /// <summary>Grava uma folha lida do Excel como histórico desse mês, numa só transação.</summary>
    Task<ResumoImportacaoDto> ImportarAsync(string uid, string mes, DadosFolhaMesDto dados, OpcoesImportacaoDto? opcoes, CancellationToken ct = default);
}

/// <summary>
/// O relatório mensal em PDF (A4), montado a partir dos outros serviços: folha do mês, evolução e
/// categorias (estatísticas), orçamentos, objetivos, poupanças, dívidas e saldos.
/// </summary>
public interface IRelatorioPdfService
{
    /// <summary>
    /// Os dados do relatório de um mês (até ao atual: um mês futuro dá PedidoInvalidoException).
    /// Só leituras: não recebe o salário nem faz débitos.
    /// </summary>
    Task<DadosRelatorioMes> ObterDadosAsync(string uid, string mes, CancellationToken ct = default);

    /// <summary>O PDF do mês e o nome do ficheiro (financas-AAAA-MM.pdf).</summary>
    Task<RelatorioPdf> GerarMesAsync(string uid, string mes, CancellationToken ct = default);
}

/// <summary>Cópia única dos dados do Firestore (e dos dados locais da versão antiga) para esta API.</summary>
public interface IMigracaoService
{
    Task<EstadoMigracaoDto> ObterEstadoAsync(string uid, CancellationToken ct = default);

    /// <summary>Copia os dados mantendo os ids. Só se o servidor ainda não tiver dados deste utilizador.</summary>
    Task<ResumoMigracaoDto> ImportarFirestoreAsync(string uid, DadosFirestoreDto dados, CancellationToken ct = default);

    /// <summary>Junta os dados que a versão muito antiga guardava só no dispositivo.</summary>
    Task<ResumoMigracaoDto> ImportarDadosLocaisAsync(string uid, DadosLocaisDto dados, CancellationToken ct = default);
}

public interface IGruposService
{
    Task<IReadOnlyList<GrupoDto>> ListarAsync(string uid, CancellationToken ct = default);
    Task<GrupoDto?> ObterAsync(string uid, string id, CancellationToken ct = default);
    Task<string> CriarAsync(string uid, string nome, CancellationToken ct = default);
    Task AlterarAsync(string uid, string id, AlterarGrupoPedido pedido, CancellationToken ct = default);

    /// <summary>Só o admin, e só com as contas acertadas e os mealheiros vazios (senão o dinheiro desaparecia).</summary>
    Task RemoverAsync(string uid, string id, CancellationToken ct = default);

    Task<IReadOnlyList<GrupoMembroDto>> ListarMembrosAsync(string uid, string grupoId, CancellationToken ct = default);
    Task<string> ConvidarAsync(string uid, string grupoId, string email, CancellationToken ct = default);
    Task<IReadOnlyList<ConviteGrupoDto>> ListarConvitesEnviadosAsync(string uid, string grupoId, CancellationToken ct = default);

    /// <summary>
    /// Os convites para o email da sessão. <paramref name="emailVerificado"/> vem do token do Firebase
    /// (só quando o Firebase confirmou o email): o email do perfil pode ser mudado por quem quiser.
    /// </summary>
    Task<ConvitesRecebidosDto> ListarConvitesRecebidosAsync(string uid, string? emailVerificado, CancellationToken ct = default);

    Task AceitarAsync(string uid, string? emailVerificado, string conviteId, CancellationToken ct = default);
    Task RecusarAsync(string uid, string? emailVerificado, string conviteId, CancellationToken ct = default);
    Task CancelarConviteAsync(string uid, string conviteId, CancellationToken ct = default);
    Task RemoverMembroAsync(string uid, string grupoId, string membroUid, CancellationToken ct = default);

    /// <summary>Sair do grupo (o último admin tem de passar o admin a outro primeiro).</summary>
    Task SairAsync(string uid, string grupoId, CancellationToken ct = default);

    Task AlterarRoleAsync(string uid, string grupoId, string membroUid, RoleGrupo role, CancellationToken ct = default);
}

/// <summary>Despesas partilhadas, acertos de contas, saldos e o resumo da parte partilhada.</summary>
public interface IPartilhadoService
{
    Task<SaldosGrupoDto> SaldosAsync(string uid, string grupoId, CancellationToken ct = default);
    Task<IReadOnlyList<AtividadeDto>> AtividadeAsync(string uid, string grupoId, int limite, CancellationToken ct = default);

    Task<DespesaPartilhadaDto> ObterDespesaAsync(string uid, string id, CancellationToken ct = default);
    Task<string> CriarDespesaAsync(string uid, string grupoId, DespesaPartilhadaPedido pedido, CancellationToken ct = default);

    /// <summary>Só quem pagou. Desfaz a despesa antiga (dinheiro e partes) e aplica a nova.</summary>
    Task AlterarDespesaAsync(string uid, string id, DespesaPartilhadaPedido pedido, CancellationToken ct = default);

    /// <summary>Quem pagou ou um admin do grupo. O dinheiro volta para o pagador e as partes pessoais desaparecem.</summary>
    Task RemoverDespesaAsync(string uid, string id, CancellationToken ct = default);

    Task<string> CriarAcertoAsync(string uid, string grupoId, NovoAcertoPedido pedido, CancellationToken ct = default);
    Task RemoverAcertoAsync(string uid, string id, CancellationToken ct = default);

    /// <summary>Aceitar a minha parte de uma despesa partilhada: só então conta nos meus gastos e no saldo do grupo.</summary>
    Task AceitarDespesaAsync(string uid, string id, CancellationToken ct = default);

    /// <summary>Recusar a minha parte: o valor dela reparte-se pelos restantes participantes (e por quem pagou, se ficar só ele).</summary>
    Task RecusarDespesaAsync(string uid, string id, CancellationToken ct = default);

    /// <summary>Quem recebeu confirma que o dinheiro chegou: só então entra na conta dele.</summary>
    Task ConfirmarAcertoAsync(string uid, string id, CancellationToken ct = default);

    Task<ResumoPartilhadoDto> ResumoAsync(string uid, string? emailVerificado, string? mes, CancellationToken ct = default);
}

/// <summary>Os mealheiros do grupo (poupanças partilhadas).</summary>
public interface IPoupancasPartilhadasService
{
    Task<IReadOnlyList<PoupancaPartilhadaDto>> ListarDoGrupoAsync(string uid, string grupoId, CancellationToken ct = default);
    Task<PoupancaPartilhadaDto> ObterAsync(string uid, string id, CancellationToken ct = default);
    Task<string> CriarAsync(string uid, string grupoId, NovaPoupancaPartilhadaPedido pedido, CancellationToken ct = default);
    Task AlterarAsync(string uid, string id, AlterarPoupancaPartilhadaPedido pedido, CancellationToken ct = default);

    /// <summary>Só vazio (levanta-se primeiro o que lá está).</summary>
    Task RemoverAsync(string uid, string id, CancellationToken ct = default);

    /// <summary>Põe dinheiro no mealheiro: sai da conta do utilizador.</summary>
    Task ContribuirAsync(string uid, string id, decimal valor, CancellationToken ct = default);

    /// <summary>Tira dinheiro do mealheiro: entra na conta do utilizador.</summary>
    Task LevantarAsync(string uid, string id, decimal valor, CancellationToken ct = default);

    Task<IReadOnlyList<MovimentoPoupancaPartilhadaDto>> ListarMovimentosAsync(string uid, string id, CancellationToken ct = default);
}

/// <summary>A contribuição automática (ou só lembrada) de cada membro para um mealheiro.</summary>
public interface IPoupancasPartilhadasMembrosService
{
    Task<IReadOnlyList<PoupancaPartilhadaMembroDto>> ListarDaPoupancaAsync(string uid, string poupancaPartilhadaId, CancellationToken ct = default);
    Task<IReadOnlyList<PoupancaPartilhadaMembroDto>> ListarDoMembroAsync(string uid, CancellationToken ct = default);

    /// <summary>Cria ou substitui a contribuição do utilizador para este mealheiro.</summary>
    Task<string> GuardarAsync(string uid, string poupancaPartilhadaId, NovaPoupancaPartilhadaMembroPedido pedido, CancellationToken ct = default);

    Task RemoverAsync(string uid, string poupancaPartilhadaId, CancellationToken ct = default);

    /// <summary>
    /// Marca (ou desmarca) que a contribuição manual deste mês já foi feita, sem mexer no dinheiro (ex.: já pus o
    /// valor à mão, ou fiz a transferência fora da app). As automáticas fazem-se sozinhas e não se marcam.
    /// </summary>
    Task MarcarFeitaAsync(string uid, string poupancaPartilhadaId, bool feita, CancellationToken ct = default);

    /// <summary>
    /// Quanto o utilizador ainda tem de pôr nos mealheiros este mês (as contribuições mensais que ainda não foram
    /// feitas, automáticas por chegar ao dia ou manuais por pôr): entra na previsão do fim do mês.
    /// </summary>
    Task<decimal> ValorPorEnviarNoMesAsync(string uid, CancellationToken ct = default);

    /// <summary>
    /// As contribuições automáticas do utilizador que já chegaram ao dia este mês (no dia do salário
    /// ou no dia fixo) e ainda não foram feitas. Corre com o cálculo do saldo disponível, depois do
    /// salário. Só contribui se a conta tiver dinheiro. Devolve o total posto nos mealheiros.
    /// </summary>
    Task<decimal> ProcessarContribuicoesAutomaticasAsync(string uid, CancellationToken ct = default);
}

/// <summary>
/// Regras de categorização automática: o utilizador diz que descrições vão para que categoria. Servem
/// também ao registar despesas sem categoria (ver <see cref="Categorias.Sugerir(string?, IEnumerable{DespesaExtra}, IReadOnlyList{RegraCategoria}?)"/>).
/// </summary>
public interface IRegrasCategoriaService
{
    /// <summary>As regras do utilizador (ativas ou não), pela ordem em que foram criadas.</summary>
    Task<IReadOnlyList<RegraCategoriaDto>> ListarAsync(string uid, CancellationToken ct = default);

    /// <summary>As regras que vêm com a aplicação.</summary>
    IReadOnlyList<RegraPadraoDto> ListarPadrao();

    /// <summary>Duas regras com o mesmo texto (sem maiúsculas nem acentos) dão 409.</summary>
    Task<string> AdicionarAsync(string uid, NovaRegraCategoriaPedido pedido, CancellationToken ct = default);

    /// <summary>Substitui a regra toda (sem <c>ativa</c> fica ativa; sem <c>prioridade</c> fica 0).</summary>
    Task SubstituirAsync(string uid, string id, NovaRegraCategoriaPedido pedido, CancellationToken ct = default);

    Task RemoverAsync(string uid, string id, CancellationToken ct = default);

    /// <summary>A categoria para uma descrição: regras do utilizador, histórico, palavras-chave, regras padrão, "outros".</summary>
    Task<SugestaoCategoria> SugerirAsync(string uid, string? descricao, CancellationToken ct = default);
}

/// <summary>Apagar a conta e todos os dados do utilizador (RGPD).</summary>
public interface IApagarContaService
{
    /// <summary>
    /// Apaga TUDO o que é do utilizador: despesas, pagamentos, poupanças, dívidas, orçamentos, objetivos,
    /// regras, dispositivos, parcerias antigas, convites e o registo de alterações, e por fim o utilizador.
    /// <para>
    /// Grupos: se o utilizador é a única pessoa ativa, o grupo desaparece todo; se há mais gente, o grupo e os
    /// dados dos outros ficam: o utilizador sai (o admin passa ao membro mais antigo se ele era o único) e o
    /// que as contas do grupo registam em nome dele (despesas pagas, partes, acertos, movimentos dos
    /// mealheiros) passa a um identificador anónimo, para os saldos dos outros continuarem certos.
    /// </para>
    /// Exige <paramref name="confirmacao"/> = "APAGAR". Não apaga o utilizador no Firebase (é a app que o faz).
    /// </summary>
    Task ApagarAsync(string uid, string? emailVerificado, string? confirmacao, CancellationToken ct = default);
}

/// <summary>Alertas proativos calculados no servidor (orçamentos, despesas e dívidas a vencer, objetivos atrasados).</summary>
public interface IAlertasService
{
    /// <summary>
    /// Os alertas de agora, os mais graves primeiro. Só lê (não recebe o salário nem faz débitos). Os textos
    /// vêm na língua do pedido (<see cref="Textos"/>).
    /// </summary>
    Task<IReadOnlyList<AlertaDto>> ListarAsync(string uid, CancellationToken ct = default);
}

/// <summary>Os dispositivos registados para receber notificações push.</summary>
public interface IDispositivosService
{
    Task<IReadOnlyList<DispositivoDto>> ListarAsync(string uid, CancellationToken ct = default);

    /// <summary>
    /// Regista (ou renova) o dispositivo. O mesmo token só existe uma vez: se era de outra conta, passa para
    /// esta. No máximo 10 por utilizador (saem os mais antigos).
    /// </summary>
    Task<DispositivoDto> RegistarAsync(string uid, RegistarDispositivoPedido pedido, CancellationToken ct = default);

    /// <summary>Deixa de receber push neste dispositivo (só se o token for do utilizador).</summary>
    Task RemoverAsync(string uid, string token, CancellationToken ct = default);
}

/// <summary>Envia os alertas por push (chamado pelo cron através de <c>POST /api/interno/alertas/enviar</c>).</summary>
public interface IAlertasEnvioService
{
    /// <summary>
    /// Para cada utilizador com dispositivos, envia os alertas que ainda não enviou (nunca o mesmo alerta
    /// duas vezes) e devolve o que fez.
    /// </summary>
    Task<ResultadoEnvioAlertasDto> EnviarAsync(CancellationToken ct = default);
}

/// <summary>Importar o extrato da conta bancária (lido na app) para despesas extras.</summary>
public interface IExtratoBancarioService
{
    /// <summary>A categoria sugerida de cada movimento e o que já foi importado ou parece repetido. Não grava nada.</summary>
    Task<PrevisaoExtratoDto> PrevisualizarAsync(string uid, ExtratoBancarioPedido pedido, CancellationToken ct = default);

    /// <summary>Cria uma despesa por movimento (no histórico: sem mexer nos saldos) e salta os já importados.</summary>
    Task<ResultadoExtratoDto> ImportarAsync(string uid, ExtratoBancarioPedido pedido, CancellationToken ct = default);
}
