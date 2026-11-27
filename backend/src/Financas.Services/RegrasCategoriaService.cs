using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

// Regras de categorização do utilizador. A comparação é sempre sem maiúsculas nem acentos
// (Formatos.NormalizarTitulo), feita em memória como a pesquisa: cada utilizador tem poucas regras.
internal sealed class RegrasCategoriaService(
    IUtilizadoresRepository utilizadores,
    IRegrasCategoriaRepository regras,
    Categorizador categorizador,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IRegrasCategoriaService
{
    public async Task<IReadOnlyList<RegraCategoriaDto>> ListarAsync(string uid, CancellationToken ct = default) =>
        [.. (await regras.ListarAsync(uid, ct)).Select(ParaDto)];

    public IReadOnlyList<RegraPadraoDto> ListarPadrao() =>
        [.. RegrasPadrao.Todas.Select(r => new RegraPadraoDto(r.Texto, r.Categoria))];

    public Task<string> AdicionarAsync(string uid, NovaRegraCategoriaPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var texto = TextoValido(pedido.Texto);
                await GarantirTextoLivreAsync(uid, texto, null, c);
                var regra = new RegraCategoria
                {
                    UtilizadorId = uid,
                    Id = Ids.Novo(),
                    Texto = texto,
                    Categoria = pedido.Categoria,
                    Ativa = pedido.Ativa ?? true,
                    Prioridade = pedido.Prioridade ?? 0,
                    CriadoEm = agora,
                };
                regras.Adicionar(regra);
                return regra.Id;
            },
            ct);

    public Task SubstituirAsync(string uid, string id, NovaRegraCategoriaPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var regra = await regras.ObterAsync(uid, id, c) ?? throw new NaoEncontradoException("Regra não encontrada.");
                var texto = TextoValido(pedido.Texto);
                await GarantirTextoLivreAsync(uid, texto, id, c);
                regra.Texto = texto;
                regra.Categoria = pedido.Categoria;
                regra.Ativa = pedido.Ativa ?? true;
                regra.Prioridade = pedido.Prioridade ?? 0;
            },
            ct);

    public Task RemoverAsync(string uid, string id, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                if (await regras.ObterAsync(uid, id, c) is { } regra)
                {
                    regras.Remover(regra);
                }
            },
            ct);

    public Task<SugestaoCategoria> SugerirAsync(string uid, string? descricao, CancellationToken ct = default) =>
        categorizador.SugerirAsync(uid, descricao, null, ct);

    private async Task GarantirTextoLivreAsync(string uid, string texto, string? ignorarId, CancellationToken ct)
    {
        var normalizado = Formatos.NormalizarTitulo(texto);
        if ((await regras.ListarAsync(uid, ct)).Any(r => r.Id != ignorarId && Formatos.NormalizarTitulo(r.Texto) == normalizado))
        {
            throw new ConflitoException($"Já existe uma regra para {texto}: altera essa.");
        }
    }

    private static string TextoValido(string texto) =>
        Formatos.NormalizarTitulo(texto).Length == 0
            ? throw new PedidoInvalidoException("Escreve o texto da regra.")
            : texto.Trim();

    private static RegraCategoriaDto ParaDto(RegraCategoria r) => new(r.Id, r.Texto, r.Categoria, r.Ativa, r.Prioridade);
}

/// <summary>
/// Escolhe a categoria de uma despesa sem categoria explícita: as regras do utilizador, o histórico, as
/// palavras-chave e as regras padrão (ver <see cref="Categorias.Sugerir(string?, IEnumerable{DespesaExtra}, IReadOnlyList{RegraCategoria}?)"/>).
/// É o que as despesas extras, os gastos recorrentes, as despesas partilhadas e a importação da folha usam.
/// </summary>
internal sealed class Categorizador(IRegrasCategoriaRepository regras, IDespesasExtrasRepository extras)
{
    /// <summary>As regras do utilizador, para as reutilizar em várias sugestões sem as ler outra vez.</summary>
    public async Task<IReadOnlyList<RegraCategoria>> RegrasAsync(string uid, CancellationToken ct) => await regras.ListarAsync(uid, ct);

    /// <summary>Lê as regras e (se não vier em <paramref name="historico"/>) o histórico do utilizador.</summary>
    public async Task<SugestaoCategoria> SugerirAsync(string uid, string? titulo, IEnumerable<DespesaExtra>? historico, CancellationToken ct) =>
        Categorias.Sugerir(titulo, historico ?? await extras.ListarAsync(uid, ct), await regras.ListarAsync(uid, ct));
}
