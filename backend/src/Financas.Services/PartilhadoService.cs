using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Push;
using Financas.Services.Regras;

namespace Financas.Services;

/// <summary>
/// O que as despesas fixas dividem com o grupo (só para a camada de serviços; os controllers não usam).
/// </summary>
internal interface IPartilhadoDeFixas
{
    /// <summary>
    /// Confere o grupo e as pessoas (membros ativos, com quem paga incluído) e devolve a parte de quem
    /// paga, que é o que conta nas despesas dele.
    /// </summary>
    Task<decimal> ParteDoPagadorAsync(string uid, DivisaoDespesaFixa divisao, decimal total, CancellationToken ct = default);

    /// <summary>Um pagamento de uma despesa fixa dividida: cobra o total a quem paga e cria a despesa no grupo.</summary>
    Task CriarDespesaDaFixaAsync(string uid, DespesaFixa fixa, string pagamentoFixaId, DateOnly data, CancellationToken ct = default);

    /// <summary>Anular esse pagamento: o total volta a quem pagou e a despesa sai do grupo. Falso: não havia despesa no grupo.</summary>
    Task<bool> DesfazerDespesaDaFixaAsync(string pagamentoFixaId, CancellationToken ct = default);
}

// Despesas partilhadas e acertos de contas num grupo.
//
// Dinheiro: o valor total sai da conta de quem pagou (como numa despesa normal); cada participante
// fica com uma despesa pessoal só com a sua parte (que não mexe na conta: é para os gastos do mês,
// as categorias e os orçamentos). Quem pagou fica a receber o que pagou a mais; os outros ficam a
// dever a sua parte. Um acerto tira o dinheiro da conta de quem paga e só o põe na de quem recebe
// quando este confirma que recebeu.
// As contas do grupo (quem deve a quem) estão em Regras/Partilhado.cs.
internal sealed class PartilhadoService(
    IUtilizadoresRepository utilizadores,
    IDespesasExtrasRepository extras,
    Categorizador categorizador,
    IGruposRepository grupos,
    IGrupoMembrosRepository membros,
    IDespesasPartilhadasRepository partilhadas,
    IPoupancasPartilhadasRepository poupancas,
    IParceirosConvitesRepository convites,
    IUnitOfWork unitOfWork,
    NotificadorPartilhado notificador,
    Relogio relogio) : IPartilhadoService, IPartilhadoDeFixas
{
    private const int MaxParticipantes = 50;
    private const int MaxAtividade = 200;

    // ---- Leitura ----

    public async Task<SaldosGrupoDto> SaldosAsync(string uid, string grupoId, CancellationToken ct = default)
    {
        await membros.ExigirMembroAsync(grupoId, uid, ct);
        var dados = await LerGruposAsync([grupoId], ct);
        var mes = relogio.MesAtual;
        var listaMembros = await membros.ListarDoGrupoAsync(grupoId, ct);
        var saldos = dados.SaldosDe(grupoId);
        var nomes = await utilizadores.NomesAsync(listaMembros.Select(m => m.Uid).Concat(saldos.Keys), ct);

        // Os membros ativos e os que já saíram mas ainda têm contas por acertar
        var linhas = listaMembros
            .Where(m => m.SaidaEm is null || saldos.GetValueOrDefault(m.Uid) != 0m)
            .Select(m => new MembroSaldoDto(m.Uid, nomes[m.Uid], saldos.GetValueOrDefault(m.Uid), m.SaidaEm is null, m.Uid == uid))
            .ToList();

        var despesasMes = dados.Despesas.Where(d => d.Mes == mes).ToList();
        var idsMes = despesasMes.Select(d => d.Id).ToHashSet(StringComparer.Ordinal);
        return new SaldosGrupoDto(
            saldos.GetValueOrDefault(uid),
            linhas,
            Transferencias(Partilhado.Simplificar(saldos), nomes),
            mes,
            Calculos.Centimos(despesasMes.Sum(d => d.Valor)),
            Calculos.Centimos(dados.Partes.Where(p => p.Uid == uid && idsMes.Contains(p.DespesaPartilhadaId)).Sum(dados.ParteAceite)));
    }

    public async Task<IReadOnlyList<AtividadeDto>> AtividadeAsync(string uid, string grupoId, int limite, CancellationToken ct = default)
    {
        var eu = await membros.ExigirMembroAsync(grupoId, uid, ct);
        var souAdmin = eu.Role == RoleGrupo.Admin;
        var dados = await LerGruposAsync([grupoId], ct);
        var mealheiros = await poupancas.ListarDoGrupoAsync(grupoId, ct);
        var movimentos = await poupancas.ListarMovimentosDasPoupancasAsync([.. mealheiros.Select(p => p.Id)], ct);
        var nomes = await utilizadores.NomesAsync(
            dados.Despesas.Select(d => d.PagadorUid)
                .Concat(dados.Acertos.SelectMany(a => new[] { a.DeUid, a.ParaUid }))
                .Concat(movimentos.Select(m => m.Uid)),
            ct);
        var partesPorDespesa = dados.Partes.ToLookup(p => p.DespesaPartilhadaId, StringComparer.Ordinal);

        var linhas = new List<AtividadeDto>();
        foreach (var d in dados.Despesas)
        {
            var minhaParte = partesPorDespesa[d.Id].FirstOrDefault(p => p.Uid == uid);
            var efetivas = dados.Efetivas[d.Id];
            // Por aceitar mostra-se o que me caberia; recusada ou não, só conta no saldo o que foi aceite
            decimal? minha = minhaParte is null ? null : minhaParte.Estado == EstadoParte.Aceite ? efetivas.GetValueOrDefault(uid) : minhaParte.Valor;
            var efeito = d.PagadorUid == uid
                ? partesPorDespesa[d.Id].Where(p => p.Estado == EstadoParte.Aceite && p.Uid != uid).Sum(p => efetivas.GetValueOrDefault(p.Uid))
                : minhaParte?.Estado == EstadoParte.Aceite ? -efetivas.GetValueOrDefault(uid) : 0m;
            linhas.Add(new AtividadeDto(
                TipoAtividade.Despesa, d.Id, d.Data, d.CriadoEm, d.Titulo, d.Valor, d.PagadorUid, nomes[d.PagadorUid],
                null, null, minha, Calculos.Centimos(efeito), d.Categoria,
                d.PagamentoFixaId is null && (d.PagadorUid == uid || souAdmin),
                MeuEstado: minhaParte?.Estado,
                PorAceitar: partesPorDespesa[d.Id].Count(p => p.Uid != uid && p.Estado == EstadoParte.Pendente)));
        }

        foreach (var a in dados.Acertos)
        {
            var efeito = a.DeUid == uid ? a.Valor : a.ParaUid == uid ? -a.Valor : 0m;
            linhas.Add(new AtividadeDto(
                TipoAtividade.Acerto, a.Id, a.Data, a.CriadoEm, "", a.Valor, a.DeUid, nomes[a.DeUid],
                a.ParaUid, nomes[a.ParaUid], null, efeito, null, a.CriadoPorUid == uid || souAdmin,
                a.ConfirmadoEm is not null, a.ConfirmadoEm is null && a.ParaUid == uid));
        }

        var nomeMealheiro = mealheiros.ToDictionary(p => p.Id, p => p.Nome, StringComparer.Ordinal);
        foreach (var m in movimentos)
        {
            linhas.Add(new AtividadeDto(
                TipoAtividade.Mealheiro, m.Id, m.Data, m.CriadoEm, nomeMealheiro.GetValueOrDefault(m.PoupancaPartilhadaId, ""),
                m.Valor, m.Uid, nomes[m.Uid], m.PoupancaPartilhadaId, null, null, 0m, null, false));
        }

        return
        [
            .. linhas
                .OrderByDescending(l => l.Data)
                .ThenByDescending(l => l.CriadoEm)
                .Take(Math.Clamp(limite, 1, MaxAtividade)),
        ];
    }

    public async Task<DespesaPartilhadaDto> ObterDespesaAsync(string uid, string id, CancellationToken ct = default)
    {
        var despesa = await partilhadas.ObterAsync(id, ct) ?? throw new NaoEncontradoException("Despesa não encontrada.");
        await ExigirMembroDaDespesaAsync(despesa, uid, ct);
        var partes = await partilhadas.ListarPartesAsync(id, ct);
        var nomes = await utilizadores.NomesAsync(partes.Select(p => p.Uid).Append(despesa.PagadorUid), ct);
        return ParaDto(despesa, partes, nomes);
    }

    public async Task<ResumoPartilhadoDto> ResumoAsync(string uid, string? emailVerificado, string? mes, CancellationToken ct = default)
    {
        var doMes = mes ?? relogio.MesAtual;
        var lista = await grupos.ListarDoUtilizadorAsync(uid, ct);
        var ids = lista.Select(g => g.Id).ToList();
        var dados = await LerGruposAsync(ids, ct);

        var resumos = new List<ResumoGrupoDto>();
        foreach (var g in lista)
        {
            var saldos = dados.SaldosDe(g.Id);
            var meu = saldos.GetValueOrDefault(uid);
            var minhas = Partilhado.Simplificar(saldos).Where(t => t.DeUid == uid || t.ParaUid == uid).ToList();
            var nomes = await utilizadores.NomesAsync(minhas.SelectMany(t => new[] { t.DeUid, t.ParaUid }), ct);
            var ativos = (await membros.ListarDoGrupoAsync(g.Id, ct)).Count(m => m.SaidaEm is null);
            resumos.Add(new ResumoGrupoDto(g.Id, g.Nome, meu, ativos, Transferencias(minhas, nomes)));
        }

        var despesasMes = dados.Despesas.Where(d => d.Mes == doMes).ToList();
        var idsMes = despesasMes.Select(d => d.Id).ToHashSet(StringComparer.Ordinal);
        var minhaParteMes = dados.Partes.Where(p => p.Uid == uid && idsMes.Contains(p.DespesaPartilhadaId)).Sum(dados.ParteAceite);
        var pagoPorMimMes = despesasMes.Where(d => d.PagadorUid == uid).Sum(d => d.Valor);

        var nomesGrupos = lista.ToDictionary(g => g.Id, g => g.Nome, StringComparer.Ordinal);
        var mealheiros = await poupancas.ListarDosGruposAsync(ids, ct);
        var movimentos = await poupancas.ListarMovimentosDasPoupancasAsync([.. mealheiros.Select(p => p.Id)], ct);
        var meusMovimentos = movimentos.Where(m => m.Uid == uid).ToLookup(m => m.PoupancaPartilhadaId, StringComparer.Ordinal);
        var resumoMealheiros = mealheiros
            .Select(p => new ResumoMealheiroDto(
                p.Id, p.GrupoId, nomesGrupos[p.GrupoId], p.Nome, p.Saldo, p.Objetivo, p.DataObjetivo,
                Calculos.Centimos(meusMovimentos[p.Id].Sum(m => m.Valor)),
                Calculos.Centimos(meusMovimentos[p.Id].Where(m => m.Mes == doMes).Sum(m => m.Valor))))
            .ToList();

        var convitesPendentes = 0;
        if (!string.IsNullOrWhiteSpace(emailVerificado))
        {
            convitesPendentes = (await convites.ListarRecebidosPendentesAsync(AcessoGrupos.NormalizarEmail(emailVerificado), ct))
                .Count(c => c.GrupoId is not null && !ids.Contains(c.GrupoId));
        }

        return new ResumoPartilhadoDto(
            doMes,
            Calculos.Centimos(resumos.Where(r => r.MeuSaldo > 0m).Sum(r => r.MeuSaldo)),
            Calculos.Centimos(-resumos.Where(r => r.MeuSaldo < 0m).Sum(r => r.MeuSaldo)),
            Calculos.Centimos(minhaParteMes),
            Calculos.Centimos(pagoPorMimMes),
            convitesPendentes,
            resumos,
            resumoMealheiros);
    }

    // ---- Despesas ----

    public async Task<string> CriarDespesaAsync(string uid, string grupoId, DespesaPartilhadaPedido pedido, CancellationToken ct = default)
    {
        var id = await CriarDespesaGravarAsync(uid, grupoId, pedido, ct);
        await AvisarDespesaAsync(uid, id, nova: true, ct);
        return id;
    }

    private Task<string> CriarDespesaGravarAsync(string uid, string grupoId, DespesaPartilhadaPedido pedido, CancellationToken ct) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                await membros.ExigirMembroAsync(grupoId, uid, c);
                var agora = relogio.Agora;
                var pagador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var divisao = await DividirAsync(grupoId, pedido, c);

                // Uma despesa só minha que passa a ser partilhada: desfaz-se como se fosse apagada
                // (o dinheiro volta) e a partilhada cobra o total outra vez
                var descontada = true;
                if (pedido.DespesaExtraId is { } origemId)
                {
                    var origem = await extras.ObterAsync(uid, origemId, c) ?? throw new NaoEncontradoException("Despesa não encontrada.");
                    if (origem.DespesaPartilhadaId is not null) throw new PedidoInvalidoException("Esta despesa já é partilhada.");
                    descontada = origem.DescontadaDaConta;
                    if (descontada) DespesasExtrasService.Devolver(pagador, origem.MeioPagamento, origem.Valor, agora);
                    extras.Remover(origem);
                }

                var data = pedido.Data ?? relogio.Hoje;
                var despesa = new DespesaPartilhada
                {
                    Id = Ids.Novo(),
                    GrupoId = grupoId,
                    Titulo = pedido.Titulo.Trim(),
                    Mes = Meses.De(data),
                    PagadorUid = uid,
                    DescontadaDaConta = descontada,
                    CriadoEm = agora,
                };
                await PreencherAsync(despesa, pedido, data, c);
                partilhadas.Adicionar(despesa);
                await AplicarAsync(despesa, pagador, pedido, divisao, agora, c);
                return despesa.Id;
            },
            ct);

    public async Task AlterarDespesaAsync(string uid, string id, DespesaPartilhadaPedido pedido, CancellationToken ct = default)
    {
        await AlterarDespesaGravarAsync(uid, id, pedido, ct);
        await AvisarDespesaAsync(uid, id, nova: false, ct);
    }

    private Task AlterarDespesaGravarAsync(string uid, string id, DespesaPartilhadaPedido pedido, CancellationToken ct) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var despesa = await partilhadas.ObterAsync(id, c) ?? throw new NaoEncontradoException("Despesa não encontrada.");
                await ExigirMembroDaDespesaAsync(despesa, uid, c);
                if (despesa.PagadorUid != uid) throw new PedidoInvalidoException("Só quem pagou pode alterar a despesa.");
                ExigirNaoVirDeDespesaFixa(despesa);

                var agora = relogio.Agora;
                var pagador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var divisao = await DividirAsync(despesa.GrupoId, pedido, c);
                // Quem já aceitou e continua com a mesma parte não tem de aceitar outra vez
                var anteriores = (await partilhadas.ListarPartesAsync(despesa.Id, c))
                    .ToDictionary(p => p.Uid, p => (p.Estado, p.Valor), StringComparer.Ordinal);
                await DesfazerAsync(despesa, pagador, agora, c);

                despesa.Titulo = pedido.Titulo.Trim();
                var data = pedido.Data ?? despesa.Data;
                despesa.Mes = Meses.De(data);
                despesa.AtualizadoEm = agora;
                await PreencherAsync(despesa, pedido with { MeioPagamento = pedido.MeioPagamento ?? despesa.MeioPagamento }, data, c);
                await AplicarAsync(despesa, pagador, pedido, divisao, agora, c, anteriores: anteriores);
            },
            ct);

    public async Task RemoverDespesaAsync(string uid, string id, CancellationToken ct = default)
    {
        // Os dados para o aviso têm de ser lidos antes: depois de apagada a despesa já não existe
        var antes = await partilhadas.ObterAsync(id, ct);
        var participantes = antes is null ? [] : (await partilhadas.ListarPartesAsync(id, ct)).Select(p => p.Uid).ToList();
        await RemoverDespesaGravarAsync(uid, id, ct);
        if (antes is null) return;
        var nome = await NomeAsync(uid, ct);
        await notificador.AvisarAsync(
            participantes.Append(antes.PagadorUid).Where(u => u != uid),
            () => (Textos.T("Despesa partilhada apagada"), Textos.T($"{nome} apagou \"{antes.Titulo}\" ({RegrasAlertas.Euros(antes.Valor)}).")),
            EcraDoGrupo(antes.GrupoId),
            ct);
    }

    private Task RemoverDespesaGravarAsync(string uid, string id, CancellationToken ct) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var despesa = await partilhadas.ObterAsync(id, c);
                if (despesa is null) return;
                var eu = await ExigirMembroDaDespesaAsync(despesa, uid, c);
                if (despesa.PagadorUid != uid && eu.Role != RoleGrupo.Admin)
                {
                    throw new PedidoInvalidoException("Só quem pagou (ou um admin do grupo) pode apagar a despesa.");
                }

                ExigirNaoVirDeDespesaFixa(despesa);

                var agora = relogio.Agora;
                var pagador = await utilizadores.ObterOuCriarAsync(despesa.PagadorUid, agora, c);
                await DesfazerAsync(despesa, pagador, agora, c);
                partilhadas.Remover(despesa);
            },
            ct);

    // ---- Aceitar ou recusar a minha parte ----

    public Task AceitarDespesaAsync(string uid, string id, CancellationToken ct = default) => ResponderAsync(uid, id, aceitar: true, ct);

    public Task RecusarDespesaAsync(string uid, string id, CancellationToken ct = default) => ResponderAsync(uid, id, aceitar: false, ct);

    private async Task ResponderAsync(string uid, string id, bool aceitar, CancellationToken ct)
    {
        var mudou = await unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var despesa = await partilhadas.ObterAsync(id, c) ?? throw new NaoEncontradoException("Despesa não encontrada.");
                await ExigirMembroDaDespesaAsync(despesa, uid, c);
                var partes = await partilhadas.ListarPartesAsync(id, c);
                var minha = partes.FirstOrDefault(p => p.Uid == uid) ?? throw new PedidoInvalidoException("Não participas nesta despesa.");
                var novo = aceitar ? EstadoParte.Aceite : EstadoParte.Recusada;
                if (minha.Estado == novo) return false;
                if (minha.Estado != EstadoParte.Pendente)
                {
                    throw new PedidoInvalidoException(minha.Estado == EstadoParte.Aceite
                        ? "Já aceitaste esta despesa: pede a quem pagou para a alterar."
                        : "Já recusaste esta despesa: pede a quem pagou para a alterar.");
                }

                minha.Estado = novo;
                await SincronizarPessoaisAsync(despesa, partes, relogio.Agora, c);
                return true;
            },
            ct);
        if (!mudou) return;

        var despesaAtual = await partilhadas.ObterAsync(id, ct);
        if (despesaAtual is null) return;
        var nome = await NomeAsync(uid, ct);
        if (aceitar)
        {
            await notificador.AvisarAsync(
                [despesaAtual.PagadorUid],
                () => (Textos.T("Despesa aceite"), Textos.T($"{nome} aceitou \"{despesaAtual.Titulo}\".")),
                EcraDoGrupo(despesaAtual.GrupoId),
                ct);
            return;
        }

        // Os outros participantes passam a ter uma parte maior: também são avisados
        var participantes = (await partilhadas.ListarPartesAsync(id, ct)).Where(p => p.Estado != EstadoParte.Recusada).Select(p => p.Uid);
        await notificador.AvisarAsync(
            participantes.Append(despesaAtual.PagadorUid).Where(u => u != uid),
            () => (Textos.T("Despesa recusada"), Textos.T($"{nome} recusou \"{despesaAtual.Titulo}\". A despesa passa a dividir-se pelos restantes.")),
            EcraDoGrupo(despesaAtual.GrupoId),
            ct);
    }

    // ---- Despesas fixas divididas ----

    public async Task<decimal> ParteDoPagadorAsync(string uid, DivisaoDespesaFixa divisao, decimal total, CancellationToken ct = default)
    {
        await membros.ExigirMembroAsync(divisao.GrupoId, uid, ct);
        if (divisao.Participantes.All(p => p.Uid != uid))
        {
            throw new PedidoInvalidoException("Tu tens de estar na divisão: é a tua parte que conta nas tuas despesas.");
        }

        var partes = await DividirAsync(divisao.GrupoId, PedidoDaFixa("Despesa fixa", total, divisao, data: null, categoria: null), ct);
        return partes.First(p => p.Uid == uid).Valor;
    }

    // Cada pagamento de uma despesa fixa dividida: quem paga cobra o total e o grupo fica com a despesa
    public Task CriarDespesaDaFixaAsync(string uid, DespesaFixa fixa, string pagamentoFixaId, DateOnly data, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var divisao = fixa.Divisao ?? throw new PedidoInvalidoException("Esta despesa não está dividida.");
                await membros.ExigirMembroAsync(divisao.GrupoId, uid, c);
                var agora = relogio.Agora;
                var pagador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
                var pedido = PedidoDaFixa(fixa.Titulo, fixa.ValorAPagar, divisao, data, fixa.Categoria);
                var partes = await DividirAsync(divisao.GrupoId, pedido, c);

                var despesa = new DespesaPartilhada
                {
                    Id = Ids.Novo(),
                    GrupoId = divisao.GrupoId,
                    Titulo = fixa.Titulo,
                    Mes = Meses.De(data),
                    PagadorUid = uid,
                    DescontadaDaConta = true,
                    PagamentoFixaId = pagamentoFixaId,
                    CriadoEm = agora,
                };
                await PreencherAsync(despesa, pedido, data, c);
                partilhadas.Adicionar(despesa);
                await AplicarAsync(despesa, pagador, pedido, partes, agora, c, exigirAceitacao: false);
            },
            ct);

    // Anular o pagamento: o total volta a quem pagou e a divisão desaparece do grupo
    public Task<bool> DesfazerDespesaDaFixaAsync(string pagamentoFixaId, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var despesa = await partilhadas.ObterDoPagamentoFixaAsync(pagamentoFixaId, c);
                if (despesa is null) return false;
                var agora = relogio.Agora;
                var pagador = await utilizadores.ObterOuCriarAsync(despesa.PagadorUid, agora, c);
                await DesfazerAsync(despesa, pagador, agora, c);
                partilhadas.Remover(despesa);
                return true;
            },
            ct);

    private static DespesaPartilhadaPedido PedidoDaFixa(string titulo, decimal valor, DivisaoDespesaFixa divisao, DateOnly? data, string? categoria) =>
        new(
            titulo,
            valor,
            [.. divisao.Participantes.Select(p => new ParticipantePedido(p.Uid, p.Peso))],
            divisao.Modo,
            data,
            categoria);

    private static void ExigirNaoVirDeDespesaFixa(DespesaPartilhada despesa)
    {
        if (despesa.PagamentoFixaId is not null)
        {
            throw new PedidoInvalidoException("Esta despesa vem de uma despesa fixa dividida: altera ou anula o pagamento nas despesas fixas.");
        }
    }

    // ---- Acertos ----

    public async Task<string> CriarAcertoAsync(string uid, string grupoId, NovoAcertoPedido pedido, CancellationToken ct = default)
    {
        var id = await CriarAcertoGravarAsync(uid, grupoId, pedido, ct);
        var nome = await NomeAsync(uid, ct);
        var valor = Calculos.Centimos(pedido.Valor);
        await notificador.AvisarAsync(
            [pedido.ParaUid],
            () => (Textos.T("Confirma que recebeste"), Textos.T($"{nome} diz que te pagou {RegrasAlertas.Euros(valor)}. Abre o grupo e confirma que recebeste.")),
            EcraDoGrupo(grupoId),
            ct);
        return id;
    }

    private Task<string> CriarAcertoGravarAsync(string uid, string grupoId, NovoAcertoPedido pedido, CancellationToken ct) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                await membros.ExigirMembroAsync(grupoId, uid, c);
                if (pedido.DeUid == pedido.ParaUid) throw new PedidoInvalidoException("Quem paga e quem recebe têm de ser pessoas diferentes.");
                // Só quem paga regista: o acerto tira dinheiro da conta de quem paga, e ninguém mexe na conta de outro
                if (pedido.DeUid != uid) throw new PedidoInvalidoException("Só podes registar acertos que tu pagaste.");

                // A outra pessoa pode já ter saído do grupo (ficou com contas por acertar)
                var outro = pedido.ParaUid;
                if (await membros.ObterInclusiveSaidosAsync(grupoId, outro, c) is null)
                {
                    throw new PedidoInvalidoException("Essa pessoa não pertence ao grupo.");
                }

                var agora = relogio.Agora;
                var valor = Calculos.Centimos(pedido.Valor);
                var acerto = new AcertoPartilhado
                {
                    Id = Ids.Novo(),
                    GrupoId = grupoId,
                    DeUid = pedido.DeUid,
                    ParaUid = pedido.ParaUid,
                    Valor = valor,
                    Data = pedido.Data ?? relogio.Hoje,
                    CriadoPorUid = uid,
                    CriadoEm = agora,
                };
                partilhadas.AdicionarAcerto(acerto);
                // Sai já da conta de quem paga; quem recebe só ganha o dinheiro ao confirmar
                (await utilizadores.ObterOuCriarAsync(acerto.DeUid, agora, c)).MovimentarSaldo(-valor, agora);
                return acerto.Id;
            },
            ct);

    public async Task ConfirmarAcertoAsync(string uid, string id, CancellationToken ct = default)
    {
        var jaConfirmado = (await partilhadas.ObterAcertoAsync(id, ct))?.ConfirmadoEm is not null;
        await ConfirmarAcertoGravarAsync(uid, id, ct);
        if (jaConfirmado) return;
        var acerto = await partilhadas.ObterAcertoAsync(id, ct);
        if (acerto is null) return;
        var nome = await NomeAsync(uid, ct);
        await notificador.AvisarAsync(
            [acerto.DeUid],
            () => (Textos.T("Pagamento confirmado"), Textos.T($"{nome} confirmou que recebeu {RegrasAlertas.Euros(acerto.Valor)}.")),
            EcraDoGrupo(acerto.GrupoId),
            ct);
    }

    private Task ConfirmarAcertoGravarAsync(string uid, string id, CancellationToken ct) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var acerto = await partilhadas.ObterAcertoAsync(id, c) ?? throw new NaoEncontradoException("Acerto não encontrado.");
                if (acerto.ParaUid != uid) throw new PedidoInvalidoException("Só quem recebeu pode confirmar o acerto.");
                if (acerto.ConfirmadoEm is not null) return;

                var agora = relogio.Agora;
                acerto.ConfirmadoEm = agora;
                (await utilizadores.ObterOuCriarAsync(acerto.ParaUid, agora, c)).MovimentarSaldo(acerto.Valor, agora);
            },
            ct);

    public async Task RemoverAcertoAsync(string uid, string id, CancellationToken ct = default)
    {
        var antes = await partilhadas.ObterAcertoAsync(id, ct);
        await RemoverAcertoGravarAsync(uid, id, ct);
        if (antes is null) return;
        var nome = await NomeAsync(uid, ct);
        await notificador.AvisarAsync(
            new[] { antes.DeUid, antes.ParaUid }.Where(u => u != uid),
            () => (Textos.T("Pagamento apagado"), Textos.T($"{nome} apagou o pagamento de {RegrasAlertas.Euros(antes.Valor)}.")),
            EcraDoGrupo(antes.GrupoId),
            ct);
    }

    private Task RemoverAcertoGravarAsync(string uid, string id, CancellationToken ct) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var acerto = await partilhadas.ObterAcertoAsync(id, c);
                if (acerto is null) return;
                var eu = await membros.ExigirMembroAsync(acerto.GrupoId, uid, c);
                if (acerto.CriadoPorUid != uid && eu.Role != RoleGrupo.Admin)
                {
                    throw new PedidoInvalidoException("Só quem registou o acerto (ou um admin do grupo) o pode apagar.");
                }

                var agora = relogio.Agora;
                (await utilizadores.ObterOuCriarAsync(acerto.DeUid, agora, c)).MovimentarSaldo(acerto.Valor, agora);
                // Só tira a quem recebeu se ele já tinha confirmado (senão o dinheiro nunca entrou)
                if (acerto.ConfirmadoEm is not null)
                {
                    (await utilizadores.ObterOuCriarAsync(acerto.ParaUid, agora, c)).MovimentarSaldo(-acerto.Valor, agora);
                }

                partilhadas.RemoverAcerto(acerto);
            },
            ct);

    // ---- Avisos (push) ----

    private static string EcraDoGrupo(string grupoId) => $"/(tabs)/grupo/{grupoId}";

    private async Task<string> NomeAsync(string uid, CancellationToken ct) =>
        (await utilizadores.NomesAsync([uid], ct)).GetValueOrDefault(uid) ?? "";

    // Avisa quem participa (menos quem fez a ação) de que a despesa foi criada ou alterada; quem ainda tem a
    // parte por aceitar é convidado a aceitar ou recusar
    private async Task AvisarDespesaAsync(string uid, string id, bool nova, CancellationToken ct)
    {
        var despesa = await partilhadas.ObterAsync(id, ct);
        if (despesa is null) return;
        var partes = await partilhadas.ListarPartesAsync(id, ct);
        var nome = await NomeAsync(uid, ct);
        var pendentes = partes.Where(p => p.Estado == EstadoParte.Pendente && p.Uid != uid).Select(p => p.Uid).ToHashSet(StringComparer.Ordinal);
        var outros = partes.Select(p => p.Uid).Append(despesa.PagadorUid).Where(u => u != uid && !pendentes.Contains(u));
        var titulo = nova ? "Nova despesa partilhada" : "Despesa partilhada alterada";
        var verbo = nova ? "adicionou" : "alterou";

        await notificador.AvisarAsync(
            pendentes,
            () => (Textos.T(titulo), Textos.T($"{nome} {verbo} \"{despesa.Titulo}\" ({RegrasAlertas.Euros(despesa.Valor)}). Abre o grupo para aceitar ou recusar.")),
            EcraDoGrupo(despesa.GrupoId),
            ct);
        await notificador.AvisarAsync(
            outros,
            () => (Textos.T(titulo), Textos.T($"{nome} {verbo} \"{despesa.Titulo}\" ({RegrasAlertas.Euros(despesa.Valor)}).")),
            EcraDoGrupo(despesa.GrupoId),
            ct);
    }

    // ---- Auxiliares ----

    private sealed record DadosGrupos(
        List<DespesaPartilhada> Despesas,
        List<ParteDespesaPartilhada> Partes,
        List<AcertoPartilhado> Acertos)
    {
        private Dictionary<string, Dictionary<string, decimal>>? efetivas;

        /// <summary>Por despesa: o que cabe de facto a cada participante (sem as partes recusadas).</summary>
        public Dictionary<string, Dictionary<string, decimal>> Efetivas => efetivas ??= Despesas.ToDictionary(
            d => d.Id,
            d => Partilhado.Efetivas(d.Valor, [.. Partes.Where(p => p.DespesaPartilhadaId == d.Id)]),
            StringComparer.Ordinal);

        /// <summary>O que conta de uma parte: o valor efetivo se estiver aceite, senão zero.</summary>
        public decimal ParteAceite(ParteDespesaPartilhada p) =>
            p.Estado == EstadoParte.Aceite ? Efetivas[p.DespesaPartilhadaId].GetValueOrDefault(p.Uid) : 0m;

        public Dictionary<string, decimal> SaldosDe(string grupoId)
        {
            var despesas = Despesas.Where(d => d.GrupoId == grupoId).ToList();
            var ids = despesas.Select(d => d.Id).ToHashSet(StringComparer.Ordinal);
            return Partilhado.Saldos(
                despesas,
                Partes.Where(p => ids.Contains(p.DespesaPartilhadaId)),
                Acertos.Where(a => a.GrupoId == grupoId));
        }
    }

    private async Task<DadosGrupos> LerGruposAsync(IReadOnlyCollection<string> gruposIds, CancellationToken ct)
    {
        if (gruposIds.Count == 0) return new DadosGrupos([], [], []);
        var despesas = await partilhadas.ListarDosGruposAsync(gruposIds, ct);
        var partes = await partilhadas.ListarPartesDasDespesasAsync([.. despesas.Select(d => d.Id)], ct);
        var acertos = await partilhadas.ListarAcertosDosGruposAsync(gruposIds, ct);
        return new DadosGrupos(despesas, partes, acertos);
    }

    // Quem não é membro do grupo da despesa não fica a saber que ela existe
    private async Task<GrupoMembro> ExigirMembroDaDespesaAsync(DespesaPartilhada despesa, string uid, CancellationToken ct) =>
        await membros.ObterAtivoAsync(despesa.GrupoId, uid, ct) ?? throw new NaoEncontradoException("Despesa não encontrada.");

    // Valida as pessoas (membros ativos do grupo) e calcula a parte de cada uma
    private async Task<IReadOnlyList<(string Uid, decimal Valor)>> DividirAsync(string grupoId, DespesaPartilhadaPedido pedido, CancellationToken ct)
    {
        if (!Enum.IsDefined(pedido.Modo)) throw new PedidoInvalidoException("Modo de divisão desconhecido.");
        if (pedido.Participantes.Count > MaxParticipantes) throw new PedidoInvalidoException("Demasiadas pessoas na divisão.");
        foreach (var p in pedido.Participantes)
        {
            if (await membros.ObterAtivoAsync(grupoId, p.Uid, ct) is null)
            {
                throw new PedidoInvalidoException("Só podes dividir com membros do grupo.");
            }
        }

        return Partilhado.Dividir(
            pedido.Valor,
            pedido.Modo,
            [.. pedido.Participantes.Select(p => new Partilhado.Participante(p.Uid, p.Peso))]);
    }

    private async Task PreencherAsync(DespesaPartilhada despesa, DespesaPartilhadaPedido pedido, DateOnly data, CancellationToken ct)
    {
        despesa.Valor = Calculos.Centimos(pedido.Valor);
        despesa.Data = data;
        despesa.Modo = pedido.Modo;
        if (pedido.MeioPagamento is { } meio && !Enum.IsDefined(meio)) throw new PedidoInvalidoException("Meio de pagamento desconhecido.");
        despesa.MeioPagamento = pedido.MeioPagamento ?? MeioPagamento.Conta;
        despesa.Categoria = pedido.Categoria
            ?? (await categorizador.SugerirAsync(despesa.PagadorUid, despesa.Titulo, null, ct)).Categoria;
    }

    // Cobra o total ao pagador e cria a parte de cada participante. Quem pagou aceita à partida; os outros ficam
    // com a parte por aceitar (não conta nos gastos nem no saldo do grupo até aceitarem), exceto nas despesas
    // fixas divididas, que já estão combinadas, e nos que já tinham aceite a mesma parte antes de uma alteração
    private async Task AplicarAsync(
        DespesaPartilhada despesa,
        Utilizador pagador,
        DespesaPartilhadaPedido pedido,
        IReadOnlyList<(string Uid, decimal Valor)> divisao,
        DateTimeOffset agora,
        CancellationToken ct,
        bool exigirAceitacao = true,
        IReadOnlyDictionary<string, (EstadoParte Estado, decimal Valor)>? anteriores = null)
    {
        despesa.SaldoAntes = despesa.DescontadaDaConta
            ? DespesasExtrasService.Cobrar(pagador, despesa.MeioPagamento, despesa.Valor, agora)
            : null;

        var pesos = pedido.Participantes.ToDictionary(p => p.Uid, p => p.Peso, StringComparer.Ordinal);
        var partes = new List<ParteDespesaPartilhada>();
        foreach (var (participante, valor) in divisao)
        {
            await utilizadores.ObterOuCriarAsync(participante, agora, ct);

            var jaAceite = anteriores is not null
                && anteriores.TryGetValue(participante, out var antes)
                && antes.Estado == EstadoParte.Aceite
                && antes.Valor == valor;
            var parte = new ParteDespesaPartilhada
            {
                Id = Ids.Novo(),
                DespesaPartilhadaId = despesa.Id,
                Uid = participante,
                Valor = valor,
                Peso = despesa.Modo == ModoDivisao.Igual ? null : pesos[participante],
                Estado = !exigirAceitacao || participante == despesa.PagadorUid || jaAceite ? EstadoParte.Aceite : EstadoParte.Pendente,
            };
            partilhadas.AdicionarParte(parte);
            partes.Add(parte);
        }

        await SincronizarPessoaisAsync(despesa, partes, agora, ct);
    }

    // Cada parte aceite tem uma despesa pessoal com o que lhe cabe de facto (ver Partilhado.Efetivas); as que
    // estão por aceitar ou foram recusadas não têm (não contam nos gastos). Chamado ao criar e ao aceitar/recusar:
    // quando alguém recusa, o que cabe aos outros muda e as despesas pessoais deles acompanham.
    // A parte de quem paga uma despesa fixa dividida já conta como despesa fixa dele (o pagamento), por isso
    // não leva despesa pessoal: contava duas vezes
    private async Task SincronizarPessoaisAsync(DespesaPartilhada despesa, IReadOnlyCollection<ParteDespesaPartilhada> partes, DateTimeOffset agora, CancellationToken ct)
    {
        var efetivas = Partilhado.Efetivas(despesa.Valor, partes);
        foreach (var parte in partes)
        {
            var quer = parte.Estado == EstadoParte.Aceite && (parte.Uid != despesa.PagadorUid || despesa.PagamentoFixaId is null);
            var atual = parte.DespesaExtraId is { } existente ? await extras.ObterAsync(parte.Uid, existente, ct) : null;
            if (!quer)
            {
                if (atual is not null) extras.Remover(atual);
                parte.DespesaExtraId = null;
                continue;
            }

            var valor = Calculos.Centimos(efetivas.GetValueOrDefault(parte.Uid));
            if (atual is not null)
            {
                atual.Valor = valor;
                continue;
            }

            var pessoal = DespesasExtrasService.Nova(parte.Uid, despesa.Titulo, valor, despesa.Data, descontada: false, agora, despesa.Categoria);
            pessoal.MeioPagamento = parte.Uid == despesa.PagadorUid ? despesa.MeioPagamento : MeioPagamento.Conta;
            pessoal.DespesaPartilhadaId = despesa.Id;
            if (parte.Uid == despesa.PagadorUid) pessoal.SaldoAntes = despesa.SaldoAntes;
            extras.Adicionar(pessoal);
            parte.DespesaExtraId = pessoal.Id;
        }
    }

    // O contrário de AplicarAsync: devolve o total ao pagador e apaga as partes e as despesas pessoais
    private async Task DesfazerAsync(DespesaPartilhada despesa, Utilizador pagador, DateTimeOffset agora, CancellationToken ct)
    {
        if (despesa.DescontadaDaConta) DespesasExtrasService.Devolver(pagador, despesa.MeioPagamento, despesa.Valor, agora);

        foreach (var parte in await partilhadas.ListarPartesAsync(despesa.Id, ct))
        {
            if (parte.DespesaExtraId is { } pessoalId && await extras.ObterAsync(parte.Uid, pessoalId, ct) is { } pessoal)
            {
                extras.Remover(pessoal);
            }

            partilhadas.RemoverParte(parte);
        }
    }

    private static DespesaPartilhadaDto ParaDto(DespesaPartilhada d, IEnumerable<ParteDespesaPartilhada> partesLidas, IReadOnlyDictionary<string, string> nomes)
    {
        var partes = partesLidas.ToList();
        var efetivas = Partilhado.Efetivas(d.Valor, partes);
        return ParaDtoCom(d, partes, efetivas, nomes);
    }

    private static DespesaPartilhadaDto ParaDtoCom(
        DespesaPartilhada d,
        List<ParteDespesaPartilhada> partes,
        Dictionary<string, decimal> efetivas,
        IReadOnlyDictionary<string, string> nomes) =>
        new(
            d.Id, d.GrupoId, d.Titulo, d.Valor, d.Data, d.Categoria, d.PagadorUid, nomes[d.PagadorUid], d.MeioPagamento, d.Modo,
            [.. partes.OrderByDescending(p => p.Valor).ThenBy(p => p.Uid, StringComparer.Ordinal).Select(p => new ParteDto(p.Uid, nomes[p.Uid], p.Valor, p.Peso, p.Estado, p.Estado == EstadoParte.Recusada ? null : efetivas.GetValueOrDefault(p.Uid)))],
            d.CriadoEm,
            d.PagamentoFixaId is not null,
            d.SaldoAntes);

    private static IReadOnlyList<TransferenciaDto> Transferencias(IEnumerable<Partilhado.Transferencia> lista, IReadOnlyDictionary<string, string> nomes) =>
        [.. lista.Select(t => new TransferenciaDto(t.DeUid, nomes[t.DeUid], t.ParaUid, nomes[t.ParaUid], t.Valor))];
}
