using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

// Orçamentos: quanto se pode gastar por mês em cada categoria de despesas extras.
// O gasto de um mês é a soma das despesas extras desse mês na categoria (as sem categoria contam como "outros")
// mais o que foi pago, nesse mês, das despesas mensais dessa categoria (mesmo só em parte)
internal sealed class OrcamentosService(
    IUtilizadoresRepository utilizadores,
    IOrcamentosRepository orcamentos,
    IDespesasExtrasRepository extras,
    IDespesasFixasRepository fixas,
    IPagamentosRepository pagamentos,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IOrcamentosService
{
    public async Task<IReadOnlyList<OrcamentoDto>> ListarAsync(string uid, CancellationToken ct = default) =>
        [.. Ordenar(await orcamentos.ListarAsync(uid, ct)).Select(o => o.ParaDto())];

    // Um por categoria: a base de dados também o garante (índice único). Se dois pedidos o criarem ao
    // mesmo tempo, o segundo falha com chave repetida, a UnitOfWork repete-o e aí já dá 409
    public Task<string> AdicionarAsync(string uid, NovoOrcamentoPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                await utilizadores.ObterOuCriarAsync(uid, agora, c);
                await GarantirCategoriaLivreAsync(uid, pedido.Categoria, c);
                var orcamento = new Orcamento
                {
                    UtilizadorId = uid,
                    Id = Ids.Novo(),
                    Categoria = pedido.Categoria,
                    Limite = Calculos.Centimos(pedido.Limite),
                    CriadoEm = agora,
                };
                orcamentos.Adicionar(orcamento);
                return orcamento.Id;
            },
            ct);

    public Task AlterarAsync(string uid, string id, AlterarOrcamentoPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var orcamento = await orcamentos.ObterAsync(uid, id, c) ?? throw new NaoEncontradoException("Orçamento não encontrado.");
                if (pedido.Categoria is { } categoria && categoria != orcamento.Categoria)
                {
                    await GarantirCategoriaLivreAsync(uid, categoria, c);
                    orcamento.Categoria = categoria;
                }

                if (pedido.Limite is { } limite) orcamento.Limite = Calculos.Centimos(limite);
            },
            ct);

    public Task RemoverAsync(string uid, string id, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                if (await orcamentos.ObterAsync(uid, id, c) is { } orcamento)
                {
                    orcamentos.Remover(orcamento);
                }
            },
            ct);

    public async Task<IReadOnlyList<EstadoOrcamentoDto>> EstadoAsync(string uid, string? mes, CancellationToken ct = default)
    {
        mes ??= relogio.MesAtual;
        var lista = Ordenar(await orcamentos.ListarAsync(uid, ct));
        if (lista.Count == 0)
        {
            return [];
        }

        var extrasDoMes = await extras.ListarDoMesAsync(uid, mes, ct);
        var gastos = Calculos.GastosPorCategoria(
            extrasDoMes,
            await pagamentos.ListarDoMesAsync(uid, mes, ct),
            await fixas.ListarAsync(uid, ct)).ToDictionary(g => g.Categoria, g => g.Total);

        // O ritmo só existe no mês atual: o gasto do dia a dia estica até ao fim do mês, o das despesas mensais já pagas não
        var hoje = relogio.Hoje;
        var diaADia = mes == relogio.MesAtual
            ? Calculos.GastosPorCategoria(extrasDoMes).ToDictionary(g => g.Categoria, g => g.Total)
            : null;
        return
        [
            .. lista.Select(o =>
            {
                var situacao = Calculos.CalcularOrcamento(gastos.GetValueOrDefault(o.Categoria), o.Limite);
                var previsto = diaADia is null
                    ? (decimal?)null
                    : RitmoOrcamento.Prever(
                        diaADia.GetValueOrDefault(o.Categoria),
                        Math.Max(0m, situacao.Gasto - diaADia.GetValueOrDefault(o.Categoria)),
                        hoje);
                return new EstadoOrcamentoDto(
                    o.Id,
                    o.Categoria,
                    mes,
                    situacao.Limite,
                    situacao.Gasto,
                    situacao.Restante,
                    situacao.Percentagem,
                    situacao.Estado,
                    previsto);
            }),
        ];
    }

    private async Task GarantirCategoriaLivreAsync(string uid, string categoria, CancellationToken ct)
    {
        if (await orcamentos.ObterDaCategoriaAsync(uid, categoria, ct) is not null)
        {
            throw new ConflitoException($"Já existe um orçamento para {Categorias.Nome(categoria)}: altera esse.");
        }
    }

    // Pela ordem das categorias na app
    private static List<Orcamento> Ordenar(IEnumerable<Orcamento> lista) => [.. lista.OrderBy(o => Categorias.Ordem(o.Categoria))];
}
