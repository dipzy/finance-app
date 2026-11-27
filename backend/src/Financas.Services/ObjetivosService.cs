using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

// Objetivos de poupança: o progresso é o saldo da poupança ligada ou um valor escrito à mão.
// Os números (em falta, por mês, estado) são calculados em cada leitura para o mês atual (Calculos.CalcularObjetivo)
internal sealed class ObjetivosService(
    IUtilizadoresRepository utilizadores,
    IObjetivosRepository objetivos,
    IPoupancasRepository poupancas,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IObjetivosService
{
    private static readonly string[] CamposQueSePodemLimpar = ["poupancaId"];

    public async Task<IReadOnlyList<ObjetivoDto>> ListarAsync(string uid, CancellationToken ct = default)
    {
        var lista = await objetivos.ListarAsync(uid, ct);
        if (lista.Count == 0)
        {
            return [];
        }

        var porId = (await poupancas.ListarAsync(uid, ct)).ToDictionary(p => p.Id);
        var salario = await SalarioAsync(uid, ct);
        return
        [
            .. lista
                .Select(o => ParaDto(o, o.PoupancaId is null ? null : porId.GetValueOrDefault(o.PoupancaId), salario))
                // Os por atingir primeiro, do mês alvo mais próximo para o mais distante
                .OrderBy(o => o.Estado == EstadoObjetivo.Atingido)
                .ThenBy(o => o.MesAlvo, StringComparer.Ordinal),
        ];
    }

    public async Task<ObjetivoDto> ObterAsync(string uid, string id, CancellationToken ct = default)
    {
        var objetivo = await ObterEntidadeAsync(uid, id, ct);
        return ParaDto(objetivo, objetivo.PoupancaId is null ? null : await poupancas.ObterAsync(uid, objetivo.PoupancaId, ct), await SalarioAsync(uid, ct));
    }

    public Task<string> AdicionarAsync(string uid, NovoObjetivoPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                await utilizadores.ObterOuCriarAsync(uid, agora, c);
                ValidarMesAlvo(pedido.MesAlvo);
                var poupanca = string.IsNullOrWhiteSpace(pedido.PoupancaId) ? null : await ObterPoupancaAsync(uid, pedido.PoupancaId, c);
                var objetivo = new ObjetivoPoupanca
                {
                    UtilizadorId = uid,
                    Id = Ids.Novo(),
                    Nome = pedido.Nome.Trim(),
                    ValorAlvo = Calculos.Centimos(pedido.ValorAlvo),
                    MesAlvo = pedido.MesAlvo,
                    MesInicio = relogio.MesAtual,
                    PoupancaId = poupanca?.Id,
                    // Ligado a uma poupança, o progresso é o saldo dela: o valor à mão não conta
                    ValorAtual = poupanca is null ? Calculos.Centimos(pedido.ValorAtual ?? 0m) : null,
                    CriadoEm = agora,
                };
                objetivos.Adicionar(objetivo);
                return objetivo.Id;
            },
            ct);

    public Task AlterarAsync(string uid, string id, AlterarObjetivoPedido pedido, CancellationToken ct = default)
    {
        var limpar = DespesasFixasService.ValidarLimpar(pedido.Limpar, CamposQueSePodemLimpar);
        return unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var objetivo = await ObterEntidadeAsync(uid, id, c);
                if (pedido.Nome is { } nome) objetivo.Nome = nome.Trim();
                if (pedido.ValorAlvo is { } alvo) objetivo.ValorAlvo = Calculos.Centimos(alvo);
                if (pedido.MesAlvo is { } mesAlvo && mesAlvo != objetivo.MesAlvo)
                {
                    ValidarMesAlvo(mesAlvo);
                    objetivo.MesAlvo = mesAlvo;
                }

                if (!string.IsNullOrWhiteSpace(pedido.PoupancaId))
                {
                    var poupanca = await ObterPoupancaAsync(uid, pedido.PoupancaId, c);
                    objetivo.PoupancaId = poupanca.Id;
                    objetivo.ValorAtual = null;
                }
                else if (limpar.Contains("poupancaId"))
                {
                    if (objetivo.PoupancaId is { } ligada)
                    {
                        // O progresso não cai para zero: fica o saldo que a poupança tinha (ou o valor enviado)
                        var saldo = (await poupancas.ObterAsync(uid, ligada, c))?.Saldo;
                        objetivo.PoupancaId = null;
                        objetivo.ValorAtual = Calculos.Centimos(pedido.ValorAtual ?? saldo ?? objetivo.ValorAtual ?? 0m);
                    }
                    else if (pedido.ValorAtual is { } valor)
                    {
                        objetivo.ValorAtual = Calculos.Centimos(valor);
                    }
                }
                else if (pedido.ValorAtual is { } valor)
                {
                    if (objetivo.PoupancaId is not null)
                    {
                        throw new PedidoInvalidoException(
                            "Este objetivo segue o saldo de uma poupança: desliga a poupança para escrever o valor à mão.");
                    }

                    objetivo.ValorAtual = Calculos.Centimos(valor);
                }
            },
            ct);
    }

    public Task RemoverAsync(string uid, string id, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                if (await objetivos.ObterAsync(uid, id, c) is { } objetivo)
                {
                    objetivos.Remover(objetivo);
                }
            },
            ct);

    // O salário de agora: as contribuições em percentagem são do salário (Calculos.ContribuicaoDe)
    private async Task<decimal> SalarioAsync(string uid, CancellationToken ct)
    {
        var utilizador = await utilizadores.ObterAsync(uid, ct);
        return Calculos.ValorSalarioBase(utilizador?.Salario, utilizador?.Financeiro);
    }

    // Com uma poupança ligada há ritmo: o que ela recebe por mês, contra o que o objetivo pede por mês.
    // Sem poupança (valor escrito à mão) não se sabe a que ritmo se junta, por isso fica sem ritmo
    private ObjetivoDto ParaDto(ObjetivoPoupanca objetivo, Poupanca? poupanca, decimal salario)
    {
        var atual = poupanca?.Saldo ?? objetivo.ValorAtual ?? 0m;
        var s = Calculos.CalcularObjetivo(objetivo.ValorAlvo, atual, objetivo.MesInicio, objetivo.MesAlvo, relogio.MesAtual);
        var ritmo = poupanca is null || s.Estado == EstadoObjetivo.Atingido
            ? null
            : RitmoObjetivos.Comparar(s.EmFalta, s.ValorPorMes, Calculos.ContribuicaoDe(poupanca.Tipo, poupanca.Valor, salario), relogio.MesAtual);
        return new ObjetivoDto(
            objetivo.Id,
            objetivo.Nome,
            objetivo.ValorAlvo,
            objetivo.MesAlvo,
            objetivo.MesInicio,
            poupanca?.Id,
            poupanca?.Nome,
            s.ValorAtual,
            s.Percentagem,
            s.EmFalta,
            s.MesesRestantes,
            s.ValorPorMes,
            s.Estado,
            ritmo?.ContribuicaoMensal,
            ritmo?.Diferenca,
            ritmo?.MesPrevisto);
    }

    private void ValidarMesAlvo(string mesAlvo)
    {
        if (Meses.Antes(mesAlvo, relogio.MesAtual))
        {
            throw new PedidoInvalidoException("O mês alvo já passou: escolhe este mês ou um dos próximos.");
        }
    }

    private async Task<ObjetivoPoupanca> ObterEntidadeAsync(string uid, string id, CancellationToken ct) =>
        await objetivos.ObterAsync(uid, id, ct) ?? throw new NaoEncontradoException("Objetivo não encontrado.");

    private async Task<Poupanca> ObterPoupancaAsync(string uid, string id, CancellationToken ct) =>
        await poupancas.ObterAsync(uid, id, ct) ?? throw new NaoEncontradoException("Poupança não encontrada.");
}
