using Financas.DAL.Entidades;
using Financas.Services.Dtos;
using Financas.Services.Regras;

namespace Financas.Services;

/// <summary>
/// Conversão entidade ↔ DTO, num só sítio. As entidades nunca saem da camada de serviços:
/// os controllers só veem DTOs.
/// </summary>
internal static class Mapeamentos
{
    public static DespesaFixaDto ParaDto(this DespesaFixa d) =>
        new(d.Id, d.Titulo, d.Valor, d.DiaDebito, d.Inicio, d.Fim, d.Periodicidade, d.MesAnual, d.Debitado, d.MesDebitado, d.AnuladoMes, d.Categoria,
            d.ValorTotal,
            d.Divisao is { } divisao
                ? new DivisaoFixaDto(divisao.GrupoId, divisao.Modo, [.. divisao.Participantes.Select(p => new ParticipantePedido(p.Uid, p.Peso))])
                : null,
            d.Variavel, d.UnidadeConsumo, d.DebitoAutomatico);

    public static DespesaExtraDto ParaDto(this DespesaExtra d) =>
        new(d.Id, d.Titulo, d.Valor, d.Data, d.Mes, d.DescontadaDaConta, d.Categoria, d.MeioPagamento, d.GastoRecorrenteId, d.DespesaPartilhadaId, d.SaldoAntes, d.Litros);

    public static GastoRecorrenteDto ParaDto(this GastoRecorrente g) =>
        new(g.Id, g.Titulo, g.Valor, g.Categoria, g.MeioPagamento, g.Frequencia, g.DiaSemana, g.DiaMes, g.Inicio, g.Fim, g.Ativo, g.UltimaGeracao);

    public static PagamentoFixaDto ParaDto(this PagamentoFixa p) =>
        new(p.Id, p.FixaId, p.Mes, p.Titulo, p.Valor, p.Data, p.Estado, p.Parcial, p.Consumo);

    public static PoupancaDto ParaDto(this Poupanca p, decimal valorMensal = 0m, decimal jurosRecebidos = 0m) =>
        new(p.Id, p.Nome, p.Tipo, p.Valor, Calculos.Centimos(p.Saldo), p.Ordem, p.ContribuicaoAutomatica, p.DiaContribuicao, p.UltimaContribuicaoMes,
            p.ContarNoPrevisto, p.UltimaContribuicaoEm, Calculos.Centimos(valorMensal), p.TaxaAnual, p.Retencao, p.JurosAutomaticos,
            p.TaxaAnual is { } taxa ? RegrasPoupancas.JurosDoMes(p.Saldo, taxa, p.Retencao).Liquido : 0m,
            Calculos.Centimos(jurosRecebidos));

    public static DividaDto ParaDto(this Divida d) =>
        new(d.Id, d.Titulo, d.ValorInicial, d.Desde, d.FixaId, d.TaxaAnual, d.ValorFinanciado, d.Entrada, d.PrazoMeses, d.InicioContrato,
            d.ComissaoReembolso, d.EncargosMensais, d.NumeroContrato, d.Credor);

    public static OrcamentoDto ParaDto(this Orcamento o) => new(o.Id, o.Categoria, o.Limite);

    public static ContribuicaoDto ParaDto(this Contribuicao c) => new(c.PoupancaId, c.Nome, c.Valor);

    public static RecebimentoDto ParaDto(this Recebimento r) =>
        new(r.Salario, r.Ppr, r.Poupanca, r.Liquido, [.. r.Contribuicoes.Select(ParaDto)], r.Data, r.CartaoAlimentacao);

    public static SalarioConfigDto ParaDto(this ConfiguracaoSalario s) =>
        new(s.Valor, s.DiaRecebimento, s.RecebidoEm, s.UltimoRecebimento?.ParaDto(), s.CartaoAlimentacao, s.CartaoPorDiaUtil, s.RecebimentoManual);

    public static FinancialDataDto ParaDto(this DadosFinanceirosAntigos f) =>
        new(f.Salario ?? "", f.PprPercentagem ?? "", f.PoupancaPercentagem ?? "", f.AtualizadoEm ?? "");

    public static ConfigPprPoupancaDto ParaDto(this ConfiguracaoPprPoupanca c) =>
        new(c.PprTipo, c.PprValor, c.PoupancaTipo, c.PoupancaValor);

    public static LinhaFolhaDto ParaDto(this LinhaFolha l) => new(l.Titulo, l.Valor, l.Data, l.Informativo);

    public static LinhaFolha ParaEntidade(this LinhaFolhaDto l) =>
        new((l.Titulo ?? "").Trim(), Calculos.Centimos(l.Valor), l.Data, l.Informativo);

    public static BlocosImportadosDto ParaDto(this BlocosImportados b) =>
        new(Lista(b.Lucro), Lista(b.Poupanca), b.SaldoConta, Lista(b.SaldoPoupanca), Lista(b.TotalAPagar));

    public static BlocosImportados ParaEntidade(this BlocosImportadosDto b) => new()
    {
        Lucro = Entidades(b.Lucro),
        Poupanca = Entidades(b.Poupanca),
        SaldoConta = b.SaldoConta is { } saldo ? Calculos.Centimos(saldo) : null,
        SaldoPoupanca = Entidades(b.SaldoPoupanca),
        TotalAPagar = Entidades(b.TotalAPagar),
    };

    public static ResumoMesDto ParaDto(this ResumoMes m) =>
        new(m.Mes, m.SaldoInicial, m.SaldoFinal, m.Recebimento?.ParaDto(), m.Importado?.ParaDto());

    private static IReadOnlyList<LinhaFolhaDto>? Lista(IReadOnlyList<LinhaFolha>? linhas) =>
        linhas is null ? null : [.. linhas.Select(ParaDto)];

    private static IReadOnlyList<LinhaFolha>? Entidades(IReadOnlyList<LinhaFolhaDto>? linhas) =>
        linhas is null ? null : [.. linhas.Select(ParaEntidade)];
}
