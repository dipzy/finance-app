using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Financas.Services.Relatorios;

namespace Financas.Services;

// O relatório mensal em PDF. Não tem regras próprias: junta o que os outros serviços já calculam
// (os mesmos números do Resumo do mês, das estatísticas e dos ecrãs) e o DocumentoRelatorioMes desenha-o.
internal sealed class RelatorioPdfService(
    IFolhaMesService folha,
    IEstatisticasService estatisticas,
    IOrcamentosService orcamentos,
    IObjetivosService objetivos,
    IPoupancasService poupancas,
    IDividasService dividas,
    IDespesasFixasService fixas,
    IDespesasExtrasService extras,
    IContaService conta,
    IPerfilService perfil,
    Relogio relogio) : IRelatorioPdfService
{
    /// <summary>Quantos meses mostra o gráfico da evolução.</summary>
    public const int MesesEvolucao = 12;

    public async Task<DadosRelatorioMes> ObterDadosAsync(string uid, string mes, CancellationToken ct = default)
    {
        if (!Meses.EValido(mes))
        {
            throw new PedidoInvalidoException("Mês inválido (usa AAAA-MM).");
        }

        var atual = relogio.MesAtual;
        if (Meses.Antes(atual, mes))
        {
            throw new PedidoInvalidoException("Ainda não há relatório para um mês futuro.");
        }

        var eAtual = mes == atual;

        // Os serviços partilham o DbContext do pedido: um de cada vez
        var dadosFolha = await folha.ObterDadosAsync(uid, mes, ct);
        var evolucao = await estatisticas.EvolucaoAsync(uid, MesesEvolucao, mes, ct);
        var categorias = await estatisticas.GastosPorCategoriaAsync(uid, mes, ct);
        var estadoOrcamentos = await orcamentos.EstadoAsync(uid, mes, ct);
        var listaObjetivos = await objetivos.ListarAsync(uid, ct);
        var listaPoupancas = await poupancas.ListarAsync(uid, ct);
        var listaDividas = await dividas.ListarComEstadoAsync(uid, ct);
        var listaFixas = await fixas.ListarAsync(uid, ct);
        var extrasDoMes = await extras.ListarAsync(uid, mes, ct);
        var cartao = await conta.ObterCartaoAlimentacaoAsync(uid, ct);
        var dadosPerfil = await perfil.ObterAsync(uid, ct);

        // Os números do mês são os da evolução (Calculos.TotaisFolha), como no Resumo do mês
        var numeros = evolucao[^1];
        var totais = Calculos.TotaisFolha(dadosFolha);

        return new DadosRelatorioMes(
            mes,
            eAtual,
            NomeDe(dadosPerfil),
            TimeZoneInfo.ConvertTime(relogio.Agora, relogio.Fuso).DateTime,
            numeros,
            dadosFolha.SaldoConta,
            eAtual ? totais.Previsao : null,
            cartao.Saldo,
            Distribuicao(numeros),
            evolucao,
            categorias,
            DespesasMensais(dadosFolha, listaFixas),
            DespesasExtras(dadosFolha, extrasDoMes),
            estadoOrcamentos,
            listaObjetivos,
            listaPoupancas,
            [.. listaDividas.Where(d => d.EmFalta > 0)]);
    }

    public async Task<RelatorioPdf> GerarMesAsync(string uid, string mes, CancellationToken ct = default)
    {
        var dados = await ObterDadosAsync(uid, mes, ct);
        return new RelatorioPdf($"financas-{mes}.pdf", DocumentoRelatorioMes.Gerar(dados));
    }

    private static string NomeDe(PerfilDto? perfil) =>
        !string.IsNullOrWhiteSpace(perfil?.Name) ? perfil.Name.Trim()
        : !string.IsNullOrWhiteSpace(perfil?.Email) ? perfil.Email.Trim()
        : "";

    // As fatias do gráfico da distribuição do salário na app (utils/painel.ts): Livre só se sobrar.
    // Os nomes são para mostrar: seguem a linguagem do pedido (ver Textos.T)
    private static IReadOnlyList<FatiaRelatorio> Distribuicao(EvolucaoMesDto n) =>
    [
        new("poupancas", Textos.T("Poupanças"), n.Poupado),
        new("despesas", Textos.T("Despesas mensais"), n.DespesasMensais),
        new("extras", Textos.T("Despesas extras"), n.DespesasExtras),
        .. n.Livre > 0 ? [new FatiaRelatorio("livre", Textos.T("Livre"), n.Livre)] : Array.Empty<FatiaRelatorio>(),
    ];

    // As linhas do bloco Despesas da folha, com o dia do débito da despesa mensal com o mesmo título
    private static IReadOnlyList<LinhaDespesaMensalRelatorio> DespesasMensais(DadosFolhaMesDto f, IReadOnlyList<DespesaFixaDto> listaFixas) =>
    [
        .. f.Despesas.Select(l => new LinhaDespesaMensalRelatorio(
            l.Titulo,
            listaFixas.Where(x => x.Titulo == l.Titulo).OrderBy(x => x.Fim is null ? 0 : 1).FirstOrDefault()?.DiaDebito,
            l.Valor,
            l.Estado,
            l.Estado == EstadoLinha.Pago ? l.Data : null)),
    ];

    // As extras do mês (com categoria e meio de pagamento), da mais antiga para a mais recente.
    // Um mês importado do Excel sem extras guardadas usa as linhas da folha
    private static IReadOnlyList<LinhaExtraRelatorio> DespesasExtras(DadosFolhaMesDto f, IReadOnlyList<DespesaExtraDto> extrasDoMes)
    {
        if (extrasDoMes.Count == 0)
        {
            return [.. f.DespesasMes.Select(l => new LinhaExtraRelatorio(l.Data, l.Titulo, Categorias.Nome(null), l.CartaoAlimentacao == true, l.Valor))];
        }

        return
        [
            .. extrasDoMes
                .OrderBy(e => e.Data ?? DateOnly.MaxValue)
                .Select(e => new LinhaExtraRelatorio(
                    e.Data,
                    e.Titulo,
                    Categorias.Nome(e.Categoria),
                    e.MeioPagamento == MeioPagamento.CartaoAlimentacao,
                    e.Valor)),
        ];
    }
}
