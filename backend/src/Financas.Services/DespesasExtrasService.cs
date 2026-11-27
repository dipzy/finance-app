using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

// A data é a do dia em que a despesa foi feita (pode ser ontem) e define o mês em que aparece.
// A categoria é a escolhida ou, sem ela, a sugerida pelo título: as regras do utilizador, o histórico e as
// palavras-chave (ver Regras/Categorias.cs e Categorizador)
internal sealed class DespesasExtrasService(
    IUtilizadoresRepository utilizadores,
    IDespesasExtrasRepository extras,
    Categorizador categorizador,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IDespesasExtrasService
{
    public async Task<IReadOnlyList<DespesaExtraDto>> ListarAsync(string uid, string? mes, CancellationToken ct = default)
    {
        var lista = mes is null ? await extras.ListarAsync(uid, ct) : await extras.ListarDoMesAsync(uid, mes, ct);
        return [.. lista.Select(e => e.ParaDto())];
    }

    public Task<SugestaoCategoria> SugerirCategoriaAsync(string uid, string? titulo, CancellationToken ct = default) =>
        categorizador.SugerirAsync(uid, titulo, null, ct);

    // A despesa e o desconto na conta (ou no cartão de alimentação) acontecem na mesma transação: ou os dois ou nenhum
    public async Task<string> AdicionarAsync(string uid, NovaDespesaExtraPedido pedido, CancellationToken ct = default) =>
        (await AdicionarAsync(uid, pedido, null, ct)).Id;

    // Com Idempotency-Key: a mesma chave devolve a despesa que já existe, sem a criar nem cobrar outra vez.
    // Dois pedidos com a mesma chave ao mesmo tempo: o segundo choca no índice único (ou na Versao do
    // utilizador), a UnitOfWork repete a operação e a repetição já encontra a despesa do primeiro
    public Task<ResultadoCriacao> AdicionarAsync(
        string uid,
        NovaDespesaExtraPedido pedido,
        string? chaveIdempotencia,
        CancellationToken ct = default)
    {
        var chave = string.IsNullOrWhiteSpace(chaveIdempotencia) ? null : chaveIdempotencia.Trim();
        return unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                if (chave is not null && await extras.ObterPorChaveIdempotenciaAsync(uid, chave, c) is { } existente)
                {
                    return new ResultadoCriacao(existente.Id, Criado: false);
                }

                var agora = relogio.Agora;
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var categoria = pedido.Categoria ?? (await categorizador.SugerirAsync(uid, pedido.Titulo, null, c)).Categoria;
                var despesa = Nova(uid, pedido.Titulo, pedido.Valor, pedido.Data ?? relogio.Hoje, descontada: true, agora, categoria);
                despesa.MeioPagamento = pedido.MeioPagamento ?? MeioPagamento.Conta;
                despesa.ChaveIdempotencia = chave;
                despesa.Litros = LitrosValidos(pedido.Litros);
                despesa.SaldoAntes = Cobrar(utilizador, despesa.MeioPagamento, despesa.Valor, agora);
                extras.Adicionar(despesa);
                return new ResultadoCriacao(despesa.Id, Criado: true);
            },
            ct);
    }

    // Pesquisa: a base de dados filtra pelo utilizador e pelas datas; o resto (texto sem acentos nem
    // maiúsculas, categoria, meio, valores) é feito em memória. Cada utilizador tem poucas despesas e
    // assim o texto compara-se da mesma maneira em PostgreSQL e em SQLite (sem unaccent nem collations)
    public async Task<PesquisaDespesasDto> PesquisarAsync(string uid, FiltroPesquisaDespesas filtro, CancellationToken ct = default)
    {
        if (filtro.De is { } de && filtro.Ate is { } ate && de > ate)
        {
            throw new PedidoInvalidoException("A data inicial não pode ser depois da final.");
        }

        if (filtro.ValorMin is { } minimo && filtro.ValorMax is { } maximo && minimo > maximo)
        {
            throw new PedidoInvalidoException("O valor mínimo não pode ser maior que o máximo.");
        }

        IEnumerable<DespesaExtra> resultado = await extras.ListarEntreAsync(uid, filtro.De, filtro.Ate, ct);
        var texto = Formatos.NormalizarTitulo(filtro.Texto);
        if (texto.Length > 0)
        {
            resultado = resultado.Where(e => Formatos.NormalizarTitulo(e.Titulo).Contains(texto, StringComparison.Ordinal));
        }

        if (!string.IsNullOrEmpty(filtro.Categoria))
        {
            // As despesas sem categoria contam como "outros", como nas estatísticas
            resultado = resultado.Where(e => Categorias.DaDespesa(e.Categoria) == filtro.Categoria);
        }

        if (filtro.MeioPagamento is { } meio) resultado = resultado.Where(e => e.MeioPagamento == meio);
        if (filtro.ValorMin is { } valorMin) resultado = resultado.Where(e => e.Valor >= valorMin);
        if (filtro.ValorMax is { } valorMax) resultado = resultado.Where(e => e.Valor <= valorMax);

        var lista = resultado
            .OrderByDescending(e => e.Data ?? DateOnly.MinValue)
            .ThenByDescending(e => e.CriadoEm)
            .ThenBy(e => e.Id, StringComparer.Ordinal)
            .ToList();
        var pagina = lista.Skip((filtro.Pagina - 1) * filtro.Tamanho).Take(filtro.Tamanho).Select(e => e.ParaDto()).ToList();
        return new PesquisaDespesasDto(lista.Count, Calculos.Centimos(lista.Sum(e => e.Valor)), filtro.Pagina, filtro.Tamanho, pagina);
    }

    // Despesa de um mês passado (ex.: importada do Excel): fica no histórico sem mexer na conta de hoje
    public Task<string> AdicionarHistoricaAsync(string uid, DespesaHistoricaPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var categoria = pedido.Categoria ?? (await categorizador.SugerirAsync(uid, pedido.Titulo, null, c)).Categoria;
                var despesa = Nova(uid, pedido.Titulo, pedido.Valor, pedido.Data ?? relogio.Hoje, descontada: false, agora, categoria);
                despesa.MeioPagamento = pedido.MeioPagamento ?? MeioPagamento.Conta;
                extras.Adicionar(despesa);
                return despesa.Id;
            },
            ct);

    // Mudar o valor ou o meio de pagamento acerta os saldos: o valor antigo volta para onde saiu
    // (conta ou cartão) e o novo sai do meio escolhido. Só nas despesas que saíram da conta ao registar
    public Task AlterarAsync(string uid, string id, AlterarDespesaExtraPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var despesa = await extras.ObterAsync(uid, id, c) ?? throw new NaoEncontradoException("Despesa não encontrada.");
                // A parte de uma despesa partilhada: aqui só se muda o título e a categoria (é pessoal);
                // o valor, a data e o meio vêm da despesa do grupo
                if (despesa.DespesaPartilhadaId is not null
                    && ((pedido.Valor is { } v && Calculos.Centimos(v) != despesa.Valor)
                        || (pedido.Data is { } d && d != despesa.Data)
                        || (pedido.MeioPagamento is { } m && m != despesa.MeioPagamento)))
                {
                    throw new PedidoInvalidoException(MensagemPartilhada);
                }

                if (pedido.Titulo is { } titulo) despesa.Titulo = titulo.Trim();
                if (pedido.Categoria is { } categoria) despesa.Categoria = categoria;
                if (pedido.Litros is { } litros) despesa.Litros = LitrosValidos(litros); // 0 apaga os litros
                if (pedido.Data is { } data)
                {
                    despesa.Data = data;
                    despesa.Mes = Meses.De(data);
                }

                var valorNovo = pedido.Valor is { } valor ? Calculos.Centimos(valor) : despesa.Valor;
                var meioNovo = pedido.MeioPagamento ?? despesa.MeioPagamento;
                if (despesa.DescontadaDaConta && (valorNovo != despesa.Valor || meioNovo != despesa.MeioPagamento))
                {
                    var agora = relogio.Agora;
                    var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                    Devolver(utilizador, despesa.MeioPagamento, despesa.Valor, agora);
                    despesa.SaldoAntes = Cobrar(utilizador, meioNovo, valorNovo, agora);
                }

                despesa.Valor = valorNovo;
                despesa.MeioPagamento = meioNovo;
            },
            ct);

    // Apagar devolve o valor para onde saiu (conta ou cartão). As registadas em versões anteriores
    // nunca saíram da conta, por isso não devolvem nada
    public Task RemoverAsync(string uid, string id, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var despesa = await extras.ObterAsync(uid, id, c);
                if (despesa is null)
                {
                    return;
                }

                if (despesa.DespesaPartilhadaId is not null) throw new PedidoInvalidoException(MensagemPartilhada);

                extras.Remover(despesa);
                if (despesa.DescontadaDaConta)
                {
                    var utilizador = await utilizadores.ObterOuCriarAsync(uid, relogio.Agora, c);
                    Devolver(utilizador, despesa.MeioPagamento, despesa.Valor, relogio.Agora);
                }
            },
            ct);

    // Zero (ou nada) = sem litros registados
    private static decimal? LitrosValidos(decimal? litros) =>
        litros is > 0m ? Math.Round(litros.Value, 3, MidpointRounding.AwayFromZero) : null;

    private const string MensagemPartilhada =
        "Esta despesa é a tua parte de uma despesa partilhada: altera-a ou apaga-a no grupo.";

    // A conta pode ficar negativa (como sempre); o cartão de alimentação não: é dinheiro que o cartão
    // não tem, e a despesa tem de ser paga com a conta (ou acertado primeiro o saldo do cartão)
    // Devolve o saldo desse meio antes de cobrar (fica guardado na despesa, para conferir os movimentos)
    internal static decimal Cobrar(Utilizador utilizador, MeioPagamento meio, decimal valor, DateTimeOffset agora)
    {
        if (meio != MeioPagamento.CartaoAlimentacao)
        {
            var antes = utilizador.Saldo;
            utilizador.MovimentarSaldo(-valor, agora);
            return antes;
        }

        if (utilizador.SaldoCartaoAlimentacao < valor)
        {
            throw new ConflitoException(
                $"O cartão de alimentação só tem {Euros(utilizador.SaldoCartaoAlimentacao)}: não chega para {Euros(valor)}. " +
                "Paga com a conta, ou acerta primeiro o saldo do cartão.");
        }

        var cartaoAntes = utilizador.SaldoCartaoAlimentacao;
        utilizador.MovimentarCartaoAlimentacao(-valor, agora);
        return cartaoAntes;
    }

    internal static void Devolver(Utilizador utilizador, MeioPagamento meio, decimal valor, DateTimeOffset agora)
    {
        if (meio == MeioPagamento.CartaoAlimentacao)
        {
            utilizador.MovimentarCartaoAlimentacao(valor, agora);
        }
        else
        {
            utilizador.MovimentarSaldo(valor, agora);
        }
    }

    private static string Euros(decimal valor) =>
        $"{Calculos.Centimos(valor).ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)} €";

    internal static DespesaExtra Nova(
        string uid,
        string titulo,
        decimal valor,
        DateOnly data,
        bool descontada,
        DateTimeOffset criadoEm,
        string? categoria = null) => new()
    {
        UtilizadorId = uid,
        Id = Ids.Novo(),
        Titulo = titulo.Trim(),
        Valor = Calculos.Centimos(valor),
        Data = data,
        Mes = Meses.De(data),
        DescontadaDaConta = descontada,
        Categoria = categoria,
        CriadoEm = criadoEm,
    };
}
