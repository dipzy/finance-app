using Financas.DAL.Entidades;

namespace Financas.DAL.Repositorios;

// Um repositório por agregado. Todos os métodos recebem o uid do utilizador: não há maneira
// de ler ou mudar dados de outro utilizador.
//
// As entidades devolvidas ficam ligadas ao DbContext do pedido: quem as muda só tem de chamar
// IUnitOfWork.SaveChangesAsync (ou fazer a mudança dentro de ExecuteInTransactionAsync).
// "Adicionar"/"Remover" também só ficam gravados nesse momento.

public interface IUtilizadoresRepository
{
    Task<Utilizador?> ObterAsync(string utilizadorId, CancellationToken ct = default);

    /// <summary>O utilizador, criado (sem dados) se ainda não existir.</summary>
    Task<Utilizador> ObterOuCriarAsync(string utilizadorId, DateTimeOffset agora, CancellationToken ct = default);

    /// <summary>
    /// Para operações que mudam muitos dados sem mexer no saldo (ex.: importar uma folha): marca o
    /// utilizador como alterado, e assim a operação fica "em série" com as outras do mesmo utilizador.
    /// Ao gravar, a <see cref="Utilizador.Versao"/> é verificada e incrementada; se outra operação
    /// mexeu no utilizador entretanto, há conflito e a operação é repetida (ver <see cref="IUnitOfWork"/>).
    /// </summary>
    void ReservarParaAlteracao(Utilizador utilizador);
}

public interface IDespesasFixasRepository
{
    /// <summary>Todas (incluindo as terminadas), pela ordem em que foram criadas.</summary>
    Task<List<DespesaFixa>> ListarAsync(string utilizadorId, CancellationToken ct = default);

    Task<DespesaFixa?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default);
    Task<bool> ExistemAsync(string utilizadorId, CancellationToken ct = default);
    void Adicionar(DespesaFixa despesa);
    void Remover(DespesaFixa despesa);
}

public interface IPagamentosRepository
{
    Task<List<PagamentoFixa>> ListarDoMesAsync(string utilizadorId, string mes, CancellationToken ct = default);
    Task<List<PagamentoFixa>> ListarDaDespesaAsync(string utilizadorId, string fixaId, CancellationToken ct = default);
    Task<List<PagamentoFixa>> ListarAsync(string utilizadorId, CancellationToken ct = default);
    Task<PagamentoFixa?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default);
    Task<bool> ExisteDaDespesaAsync(string utilizadorId, string fixaId, CancellationToken ct = default);
    Task<bool> ExistemAsync(string utilizadorId, CancellationToken ct = default);
    void Adicionar(PagamentoFixa pagamento);
    void Remover(PagamentoFixa pagamento);
}

public interface IDespesasExtrasRepository
{
    /// <summary>Todas, pela ordem em que foram criadas.</summary>
    Task<List<DespesaExtra>> ListarAsync(string utilizadorId, CancellationToken ct = default);

    /// <summary>As do mês, da mais recente para a mais antiga (data e depois hora de registo).</summary>
    Task<List<DespesaExtra>> ListarDoMesAsync(string utilizadorId, string mes, CancellationToken ct = default);

    Task<DespesaExtra?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default);
    Task<bool> ExistemAsync(string utilizadorId, CancellationToken ct = default);

    /// <summary>A despesa criada com esta <c>Idempotency-Key</c>, se já existir.</summary>
    Task<DespesaExtra?> ObterPorChaveIdempotenciaAsync(string utilizadorId, string chave, CancellationToken ct = default);

    /// <summary>
    /// Para a pesquisa: as despesas com data entre <paramref name="de"/> e <paramref name="ate"/>
    /// (inclusive; null = sem limite). Sem nenhum limite, também as antigas sem data.
    /// </summary>
    Task<List<DespesaExtra>> ListarEntreAsync(string utilizadorId, DateOnly? de, DateOnly? ate, CancellationToken ct = default);

    /// <summary>Os dias já gerados de um gasto recorrente, a partir de <paramref name="desde"/>.</summary>
    Task<HashSet<DateOnly>> DiasGeradosAsync(string utilizadorId, string gastoRecorrenteId, DateOnly desde, CancellationToken ct = default);

    void Adicionar(DespesaExtra despesa);
    void Remover(DespesaExtra despesa);
}

public interface IGastosRecorrentesRepository
{
    /// <summary>Todos, pela ordem em que foram criados.</summary>
    Task<List<GastoRecorrente>> ListarAsync(string utilizadorId, CancellationToken ct = default);

    Task<GastoRecorrente?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default);
    void Adicionar(GastoRecorrente gasto);
    void Remover(GastoRecorrente gasto);
}

/// <summary>O registo de alterações (só leitura: as linhas são escritas pelo InterceptorAuditoria).</summary>
public interface IRegistosAlteracaoRepository
{
    /// <summary>
    /// Uma página do registo, do mais recente para o mais antigo. <paramref name="desdeUtc"/>: só as
    /// alterações a partir desse instante (UTC). Devolve também o total (para a paginação).
    /// </summary>
    Task<(List<RegistoAlteracao> Itens, int Total)> ListarAsync(
        string utilizadorId,
        string? entidade,
        DateTime? desdeUtc,
        int pagina,
        int tamanho,
        CancellationToken ct = default);

    /// <summary>Apaga as linhas anteriores a <paramref name="limiteUtc"/> (direto na base de dados). Devolve quantas.</summary>
    Task<int> ApagarAnterioresAsync(string utilizadorId, DateTime limiteUtc, CancellationToken ct = default);
}

/// <summary>As contribuições manuais já enviadas, por poupança e mês (uma de cada).</summary>
public interface IContribuicoesPoupancaRepository
{
    /// <summary>As contribuições do utilizador de <paramref name="mesInicial"/> em diante (inclusive).</summary>
    Task<List<ContribuicaoPoupanca>> ListarDesdeAsync(string utilizadorId, string mesInicial, CancellationToken ct = default);

    Task<bool> ExisteAsync(string utilizadorId, string poupancaId, string mes, CancellationToken ct = default);
    void Adicionar(ContribuicaoPoupanca contribuicao);
}

/// <summary>Os juros que a app já somou ao saldo de cada poupança, por mês.</summary>
public interface IJurosPoupancaRepository
{
    /// <summary>Quanto se somou (líquido) a cada poupança desde sempre: poupança → total.</summary>
    Task<Dictionary<string, decimal>> TotaisPorPoupancaAsync(string utilizadorId, CancellationToken ct = default);

    void Adicionar(JurosPoupanca juros);
}

public interface IPoupancasRepository
{
    Task<List<Poupanca>> ListarAsync(string utilizadorId, CancellationToken ct = default);
    Task<Poupanca?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default);
    Task<bool> ExistemAsync(string utilizadorId, CancellationToken ct = default);
    void Adicionar(Poupanca poupanca);
    void Remover(Poupanca poupanca);
}

public interface IDividasRepository
{
    Task<List<Divida>> ListarAsync(string utilizadorId, CancellationToken ct = default);
    Task<Divida?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default);
    Task<bool> ExistemAsync(string utilizadorId, CancellationToken ct = default);
    void Adicionar(Divida divida);
    void Remover(Divida divida);
}

public interface IMesesRepository
{
    Task<ResumoMes?> ObterAsync(string utilizadorId, string mes, CancellationToken ct = default);
    Task<List<ResumoMes>> ListarAsync(string utilizadorId, CancellationToken ct = default);

    /// <summary>O resumo do mês, criado (vazio) se ainda não existir.</summary>
    Task<ResumoMes> ObterOuCriarAsync(string utilizadorId, string mes, CancellationToken ct = default);

    void Remover(ResumoMes resumo);
}

public interface IOrcamentosRepository
{
    Task<List<Orcamento>> ListarAsync(string utilizadorId, CancellationToken ct = default);
    Task<Orcamento?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default);
    Task<Orcamento?> ObterDaCategoriaAsync(string utilizadorId, string categoria, CancellationToken ct = default);
    void Adicionar(Orcamento orcamento);
    void Remover(Orcamento orcamento);
}

public interface IObjetivosRepository
{
    /// <summary>Todos, pela ordem em que foram criados.</summary>
    Task<List<ObjetivoPoupanca>> ListarAsync(string utilizadorId, CancellationToken ct = default);

    Task<ObjetivoPoupanca?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default);

    /// <summary>Os objetivos ligados a uma poupança (ex.: para os desligar quando ela é apagada).</summary>
    Task<List<ObjetivoPoupanca>> ListarDaPoupancaAsync(string utilizadorId, string poupancaId, CancellationToken ct = default);

    void Adicionar(ObjetivoPoupanca objetivo);
    void Remover(ObjetivoPoupanca objetivo);
}

public interface IParceirosConvitesRepository
{
    Task<ParceiroConvite?> ObterAsync(string id, CancellationToken ct = default);
    Task<List<ParceiroConvite>> ListarPendentesDoEmailAsync(string emailNormalizado, CancellationToken ct = default);
    Task<List<ParceiroConvite>> ListarRecebidosPendentesAsync(string emailNormalizado, CancellationToken ct = default);

    /// <summary>Todos os convites de um grupo (pendentes ou não), para os apagar com o grupo.</summary>
    Task<List<ParceiroConvite>> ListarDoGrupoAsync(string grupoId, CancellationToken ct = default);
    void Adicionar(ParceiroConvite convite);
    void Remover(ParceiroConvite convite);
}

public interface IGruposRepository
{
    Task<Grupo?> ObterAsync(string id, CancellationToken ct = default);

    /// <summary>Os grupos de que o utilizador é membro (sem os que já deixou).</summary>
    Task<List<Grupo>> ListarDoUtilizadorAsync(string uid, CancellationToken ct = default);

    void Adicionar(Grupo grupo);
    void Remover(Grupo grupo);
}

public interface IGrupoMembrosRepository
{
    /// <summary>O membro, só se ainda estiver no grupo (quem saiu ou foi removido não conta).</summary>
    Task<GrupoMembro?> ObterAtivoAsync(string grupoId, string uid, CancellationToken ct = default);

    /// <summary>A linha do utilizador no grupo, mesmo que já tenha saído (para o reativar se voltar).</summary>
    Task<GrupoMembro?> ObterInclusiveSaidosAsync(string grupoId, string uid, CancellationToken ct = default);

    /// <summary>Todos os que já passaram pelo grupo, incluindo os que saíram, por ordem de entrada.</summary>
    Task<List<GrupoMembro>> ListarDoGrupoAsync(string grupoId, CancellationToken ct = default);

    void Adicionar(GrupoMembro membro);
    void Remover(GrupoMembro membro);
}

public interface IPoupancasPartilhadasRepository
{
    Task<PoupancaPartilhada?> ObterAsync(string id, CancellationToken ct = default);
    Task<List<PoupancaPartilhada>> ListarDoGrupoAsync(string grupoId, CancellationToken ct = default);
    Task<List<PoupancaPartilhada>> ListarDosGruposAsync(IReadOnlyCollection<string> gruposIds, CancellationToken ct = default);
    void Adicionar(PoupancaPartilhada poupanca);
    void Remover(PoupancaPartilhada poupanca);

    /// <summary>Os movimentos de um mealheiro, do mais recente para o mais antigo.</summary>
    Task<List<MovimentoPoupancaPartilhada>> ListarMovimentosAsync(string poupancaPartilhadaId, CancellationToken ct = default);

    /// <summary>Os movimentos dos mealheiros destes grupos (para o feed e o resumo).</summary>
    Task<List<MovimentoPoupancaPartilhada>> ListarMovimentosDasPoupancasAsync(IReadOnlyCollection<string> poupancasIds, CancellationToken ct = default);

    void AdicionarMovimento(MovimentoPoupancaPartilhada movimento);
    void RemoverMovimento(MovimentoPoupancaPartilhada movimento);
}

public interface IPoupancasPartilhadasMembrosRepository
{
    Task<PoupancaPartilhadaMembro?> ObterAsync(string id, CancellationToken ct = default);
    Task<PoupancaPartilhadaMembro?> ObterDoMembroAsync(string poupancaPartilhadaId, string membroUid, CancellationToken ct = default);
    Task<List<PoupancaPartilhadaMembro>> ListarDaPoupancaAsync(string poupancaPartilhadaId, CancellationToken ct = default);
    Task<List<PoupancaPartilhadaMembro>> ListarDoMembroAsync(string membroUid, CancellationToken ct = default);
    void Adicionar(PoupancaPartilhadaMembro contribuicao);
    void Remover(PoupancaPartilhadaMembro contribuicao);
}

public interface IDespesasPartilhadasRepository
{
    Task<DespesaPartilhada?> ObterAsync(string id, CancellationToken ct = default);

    /// <summary>A despesa partilhada criada por um pagamento de uma despesa fixa dividida (se houver).</summary>
    Task<DespesaPartilhada?> ObterDoPagamentoFixaAsync(string pagamentoFixaId, CancellationToken ct = default);

    /// <summary>As despesas do grupo, da mais recente para a mais antiga.</summary>
    Task<List<DespesaPartilhada>> ListarDoGrupoAsync(string grupoId, CancellationToken ct = default);

    Task<List<DespesaPartilhada>> ListarDosGruposAsync(IReadOnlyCollection<string> gruposIds, CancellationToken ct = default);

    Task<List<ParteDespesaPartilhada>> ListarPartesAsync(string despesaPartilhadaId, CancellationToken ct = default);

    Task<List<ParteDespesaPartilhada>> ListarPartesDasDespesasAsync(IReadOnlyCollection<string> despesasIds, CancellationToken ct = default);

    /// <summary>As despesas que outros registaram e em que a minha parte ainda está por aceitar, da mais recente para a mais antiga.</summary>
    Task<List<(DespesaPartilhada Despesa, ParteDespesaPartilhada Parte)>> ListarPartesPorAceitarAsync(string uid, CancellationToken ct = default);

    void Adicionar(DespesaPartilhada despesa);
    void Remover(DespesaPartilhada despesa);
    void AdicionarParte(ParteDespesaPartilhada parte);
    void RemoverParte(ParteDespesaPartilhada parte);

    Task<AcertoPartilhado?> ObterAcertoAsync(string id, CancellationToken ct = default);
    Task<List<AcertoPartilhado>> ListarAcertosDosGruposAsync(IReadOnlyCollection<string> gruposIds, CancellationToken ct = default);

    /// <summary>Os acertos que outros me registaram e eu ainda não confirmei (o dinheiro ainda não entrou na minha conta).</summary>
    Task<List<AcertoPartilhado>> ListarAcertosPorConfirmarAsync(string paraUid, CancellationToken ct = default);
    void AdicionarAcerto(AcertoPartilhado acerto);
    void RemoverAcerto(AcertoPartilhado acerto);
}

public interface IRegrasCategoriaRepository
{
    /// <summary>Todas (ativas ou não), pela ordem em que foram criadas.</summary>
    Task<List<RegraCategoria>> ListarAsync(string utilizadorId, CancellationToken ct = default);

    Task<RegraCategoria?> ObterAsync(string utilizadorId, string id, CancellationToken ct = default);
    void Adicionar(RegraCategoria regra);
    void Remover(RegraCategoria regra);
}

public interface IDispositivosPushRepository
{
    /// <summary>Os dispositivos do utilizador, do mais antigo para o mais recente.</summary>
    Task<List<DispositivoPush>> ListarAsync(string utilizadorId, CancellationToken ct = default);

    /// <summary>O dispositivo com este token, seja de quem for (o token é único).</summary>
    Task<DispositivoPush?> ObterPorTokenAsync(string token, CancellationToken ct = default);

    /// <summary>Os utilizadores com pelo menos um dispositivo registado, por ordem do uid.</summary>
    Task<List<string>> ListarUtilizadoresComDispositivosAsync(CancellationToken ct = default);

    void Adicionar(DispositivoPush dispositivo);
    void Remover(DispositivoPush dispositivo);
}

public interface IAlertasEnviadosRepository
{
    /// <summary>As chaves dos alertas já enviados ao utilizador (das <paramref name="chaves"/> pedidas).</summary>
    Task<HashSet<string>> ListarEnviadosAsync(string utilizadorId, IReadOnlyCollection<string> chaves, CancellationToken ct = default);

    void Adicionar(AlertaEnviado enviado);

    /// <summary>Apaga os registos de envio anteriores a <paramref name="antesDe"/>. Devolve quantos.</summary>
    Task<int> ApagarAnterioresAsync(DateOnly antesDe, CancellationToken ct = default);
}
