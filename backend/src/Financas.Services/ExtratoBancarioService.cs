using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

// Importar o extrato da conta bancária. As despesas ficam no histórico, como as do Excel: não mexem no saldo
// da conta (o banco já o contou) nem no do cartão. Cada uma leva uma chave (data, valor, descrição e qual das
// iguais) na Idempotency-Key da despesa: o índice único dessa chave é que garante que o mesmo movimento nunca
// entra duas vezes, mesmo com dois dispositivos ao mesmo tempo.
internal sealed class ExtratoBancarioService(
    IUtilizadoresRepository utilizadores,
    IDespesasExtrasRepository extras,
    Categorizador categorizador,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IExtratoBancarioService
{
    /// <summary>Quantos movimentos cabem num pedido.</summary>
    public const int MaximoMovimentos = 1000;

    private const string PrefixoDaChave = "ext:";

    public async Task<PrevisaoExtratoDto> PrevisualizarAsync(string uid, ExtratoBancarioPedido pedido, CancellationToken ct = default)
    {
        var movimentos = Validar(pedido);
        var existentes = await ExistentesAsync(uid, movimentos, ct);
        var sugestoes = await SugestoesAsync(uid, movimentos, ct);

        // Cada despesa feita à mão só pode ser "o mesmo movimento" de um dos movimentos do extrato
        var porReclamar = existentes
            .Where(e => e.ChaveIdempotencia is null || !e.ChaveIdempotencia.StartsWith(PrefixoDaChave, StringComparison.Ordinal))
            .GroupBy(e => (e.Data, e.Valor))
            .ToDictionary(g => g.Key, g => new Queue<string>(g.Select(e => e.Titulo)));
        var chavesExistentes = existentes.Where(e => e.ChaveIdempotencia is not null).Select(e => e.ChaveIdempotencia!).ToHashSet(StringComparer.Ordinal);

        var resultado = new List<MovimentoPrevistoDto>(movimentos.Count);
        foreach (var m in movimentos)
        {
            var sugestao = m.Categoria is { } escolhida
                ? new SugestaoCategoria(escolhida, OrigemSugestao.Regra)
                : sugestoes[Formatos.NormalizarTitulo(m.Descricao)];
            var jaImportado = chavesExistentes.Contains(ChaveDo(m));
            string? duplicado = null;
            if (!jaImportado && porReclamar.TryGetValue((m.Data, m.Valor), out var titulos) && titulos.Count > 0)
            {
                duplicado = titulos.Dequeue();
            }

            resultado.Add(new MovimentoPrevistoDto(sugestao.Categoria, sugestao.Origem, sugestao.Regra, jaImportado, duplicado));
        }

        return new PrevisaoExtratoDto(resultado);
    }

    public Task<ResultadoExtratoDto> ImportarAsync(string uid, ExtratoBancarioPedido pedido, CancellationToken ct = default)
    {
        var movimentos = Validar(pedido);
        return unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var chavesExistentes = (await ExistentesAsync(uid, movimentos, c))
                    .Where(e => e.ChaveIdempotencia is not null)
                    .Select(e => e.ChaveIdempotencia!)
                    .ToHashSet(StringComparer.Ordinal);
                var sugestoes = await SugestoesAsync(uid, movimentos.Where(m => m.Categoria is null).ToList(), c);

                var criadas = new List<DespesaExtra>();
                var jaImportados = 0;
                foreach (var m in movimentos)
                {
                    var chave = ChaveDo(m);
                    if (!chavesExistentes.Add(chave))
                    {
                        jaImportados++;
                        continue;
                    }

                    var categoria = m.Categoria ?? sugestoes[Formatos.NormalizarTitulo(m.Descricao)].Categoria;
                    var despesa = DespesasExtrasService.Nova(uid, m.Descricao, m.Valor, m.Data, descontada: false, agora, categoria);
                    despesa.MeioPagamento = MeioPagamento.Conta;
                    despesa.ChaveIdempotencia = chave;
                    extras.Adicionar(despesa);
                    criadas.Add(despesa);
                }

                return new ResultadoExtratoDto(
                    criadas.Count,
                    jaImportados,
                    Calculos.Centimos(criadas.Sum(d => d.Valor)),
                    [.. criadas.Select(d => d.Mes!).Distinct().Order(StringComparer.Ordinal)]);
            },
            ct);
    }

    /// <summary>Um movimento com tudo preenchido (a validação dos atributos já garantiu os campos).</summary>
    private sealed record Movimento(DateOnly Data, string Descricao, decimal Valor, int Ocorrencia, string? Categoria);

    private static List<Movimento> Validar(ExtratoBancarioPedido pedido)
    {
        if (pedido.Movimentos.Count == 0)
        {
            throw new PedidoInvalidoException("Não há movimentos para importar.");
        }

        if (pedido.Movimentos.Count > MaximoMovimentos)
        {
            throw new PedidoInvalidoException($"Importa no máximo {MaximoMovimentos} movimentos de cada vez: divide o extrato por períodos.");
        }

        return
        [
            .. pedido.Movimentos.Select(m => new Movimento(
                m.Data ?? throw new PedidoInvalidoException("Falta a data de um movimento."),
                m.Descricao.Trim(),
                Calculos.Centimos(m.Valor),
                m.Ocorrencia,
                string.IsNullOrWhiteSpace(m.Categoria) ? null : m.Categoria)),
        ];
    }

    // As despesas que já existem nas datas do extrato (para ver o que já foi importado e o que parece repetido)
    private async Task<List<DespesaExtra>> ExistentesAsync(string uid, IReadOnlyList<Movimento> movimentos, CancellationToken ct) =>
        await extras.ListarEntreAsync(uid, movimentos.Min(m => m.Data), movimentos.Max(m => m.Data), ct);

    // A categoria sugerida de cada descrição (uma vez por descrição diferente: um extrato repete muito os comércios)
    private async Task<Dictionary<string, SugestaoCategoria>> SugestoesAsync(string uid, IReadOnlyList<Movimento> movimentos, CancellationToken ct)
    {
        var sugestoes = new Dictionary<string, SugestaoCategoria>(StringComparer.Ordinal);
        if (movimentos.Count == 0)
        {
            return sugestoes;
        }

        var historico = await extras.ListarAsync(uid, ct);
        var regras = await categorizador.RegrasAsync(uid, ct);
        foreach (var m in movimentos)
        {
            var chave = Formatos.NormalizarTitulo(m.Descricao);
            if (!sugestoes.ContainsKey(chave))
            {
                sugestoes[chave] = Categorias.Sugerir(m.Descricao, historico, regras);
            }
        }

        return sugestoes;
    }

    /// <summary>A chave de um movimento: "ext:" e o início do SHA-256 de data, valor, descrição e ocorrência.</summary>
    internal static string ChaveDo(DateOnly data, decimal valor, string descricao, int ocorrencia)
    {
        var valorTexto = Calculos.Centimos(valor).ToString("0.00", CultureInfo.InvariantCulture);
        var texto = $"{data:yyyy-MM-dd}|{valorTexto}|{Formatos.NormalizarTitulo(descricao)}|{ocorrencia}";
        return PrefixoDaChave + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(texto)))[..40].ToLowerInvariant();
    }

    private static string ChaveDo(Movimento m) => ChaveDo(m.Data, m.Valor, m.Descricao, m.Ocorrencia);
}
