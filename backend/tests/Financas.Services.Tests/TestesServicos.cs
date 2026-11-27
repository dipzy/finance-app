using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services.Tests;

/// <summary>
/// Base dos testes de cenário: uma base de dados nova por teste (o xUnit cria uma instância da
/// classe por teste) e atalhos com os nomes das funções da app (services/database.ts), para os
/// testes portados de TypeScript se lerem quase igual ao original.
/// </summary>
public abstract class TestesServicos : IAsyncLifetime
{
    protected const string Uid = "utilizador-1";

    protected Ambiente A { get; private set; } = null!;

    protected IContaService Conta => A.Servico<IContaService>();
    protected ISalarioService Salario => A.Servico<ISalarioService>();
    protected IConfiguracoesService Configuracoes => A.Servico<IConfiguracoesService>();
    protected IDespesasFixasService Fixas => A.Servico<IDespesasFixasService>();
    protected IDespesasExtrasService Extras => A.Servico<IDespesasExtrasService>();
    protected IPoupancasService Poupancas => A.Servico<IPoupancasService>();
    protected IDividasService Dividas => A.Servico<IDividasService>();
    protected IMesesService Meses => A.Servico<IMesesService>();
    protected IFolhaMesService Folha => A.Servico<IFolhaMesService>();
    protected IMigracaoService Migracao => A.Servico<IMigracaoService>();
    protected IPreparacaoDadosService Preparacao => A.Servico<IPreparacaoDadosService>();

    protected void HojeE(int ano, int mes, int dia) => A.DefinirHoje(ano, mes, dia);

    // ---- Os nomes da app ----

    protected Task<decimal> CalcularSaldoDisponivel() => Conta.CalcularSaldoDisponivelAsync(Uid);

    protected async Task<decimal> CalcularSaldoPrevisto() => (await Conta.CalcularSaldosAsync(Uid, null)).Previsto;

    protected Task Adicionar(decimal valor) => Conta.MovimentarAsync(Uid, valor);

    protected Task Subtrair(decimal valor) => Conta.MovimentarAsync(Uid, -valor);

    protected async Task<decimal> GetSaldo() => (await Conta.ObterAsync(Uid)).Saldo;

    protected Task GuardarSalario(string valor, int dia, string? cartao = null) =>
        Salario.GuardarAsync(Uid, new GuardarSalarioPedido(valor, dia, cartao));

    protected Task GuardarPprPoupanca(TipoContribuicao pprTipo, string pprValor, TipoContribuicao poupancaTipo, string poupancaValor) =>
        Configuracoes.GuardarPprPoupancaAsync(Uid, new ConfigPprPoupancaDto(pprTipo, pprValor, poupancaTipo, poupancaValor));

    protected Task<string> AdicionarFixa(
        string titulo,
        decimal valor,
        int? diaDebito = null,
        string? inicio = null,
        Periodicidade? periodicidade = null,
        int? mesAnual = null) =>
        Fixas.AdicionarAsync(Uid, new NovaDespesaFixaPedido(titulo, valor, diaDebito, periodicidade, mesAnual, inicio));

    protected Task<IReadOnlyList<DespesaFixaDto>> ListarFixas() => Fixas.ListarAsync(Uid);

    protected Task<IReadOnlyList<PagamentoFixaDto>> PagamentosDoMes(string mes) => Fixas.ListarPagamentosDoMesAsync(Uid, mes);

    protected Task<string> AdicionarExtra(string titulo, decimal valor, DateOnly? data = null) =>
        Extras.AdicionarAsync(Uid, new NovaDespesaExtraPedido(titulo, valor, data));

    protected Task<IReadOnlyList<DespesaExtraDto>> ExtrasDoMes(string mes) => Extras.ListarAsync(Uid, mes);

    // DespesasExtrasDB.calcularTotal: a soma das despesas do mês, ao cêntimo
    protected async Task<decimal> TotalExtras(string mes) => Calculos.Centimos((await ExtrasDoMes(mes)).Sum(e => e.Valor));

    protected Task<string> AdicionarPoupanca(string nome, TipoContribuicao tipo, string valor, decimal saldo) =>
        Poupancas.AdicionarAsync(Uid, new NovaPoupancaPedido(nome, tipo, valor, saldo, null));

    protected static DateOnly Dia(int ano, int mes, int dia) => new(ano, mes, dia);

    public async Task InitializeAsync()
    {
        A = await CriarAmbienteAsync();
        await PrepararAsync();
    }

    /// <summary>
    /// A base de dados de cada teste: SQLite em memória. Os testes de Postgres/ trocam-na por uma
    /// base de dados PostgreSQL nova (ver <c>TestesServicosPostgres</c>) e reutilizam estes atalhos.
    /// </summary>
    protected virtual Task<Ambiente> CriarAmbienteAsync() => Ambiente.CriarAsync();

    /// <summary>Preparação comum a todos os testes de uma classe (o beforeEach do jest).</summary>
    protected virtual Task PrepararAsync() => Task.CompletedTask;

    public async Task DisposeAsync() => await A.DisposeAsync();
}
