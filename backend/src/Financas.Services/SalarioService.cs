using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;
using Microsoft.Extensions.Logging;

namespace Financas.Services;

internal sealed class SalarioService(
    IUtilizadoresRepository utilizadores,
    IPoupancasRepository poupancas,
    IMesesRepository meses,
    IUnitOfWork unitOfWork,
    Relogio relogio,
    ILogger<SalarioService> logger) : ISalarioService
{
    public async Task<SalarioConfigDto?> ObterAsync(string uid, CancellationToken ct = default) =>
        (await utilizadores.ObterAsync(uid, ct))?.Salario?.ParaDto();

    // Guardar a configuração não mexe no último recebimento: senão o salário podia entrar duas vezes no mesmo mês
    public Task GuardarAsync(string uid, GuardarSalarioPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var utilizador = await utilizadores.ObterOuCriarAsync(uid, relogio.Agora, c);
                var atual = utilizador.Salario ?? new ConfiguracaoSalario { Valor = pedido.Valor };
                utilizador.Salario = atual with
                {
                    Valor = pedido.Valor.Trim(),
                    DiaRecebimento = pedido.DiaRecebimento,
                    CartaoAlimentacao = pedido.CartaoAlimentacao ?? atual.CartaoAlimentacao,
                    // Vazio desliga o modo "por dia útil"; sem o campo no pedido, fica o que estava
                    CartaoPorDiaUtil = pedido.CartaoPorDiaUtil ?? atual.CartaoPorDiaUtil,
                    // Sem o campo no pedido, fica o que estava
                    RecebimentoManual = pedido.RecebimentoManual ?? atual.RecebimentoManual,
                };
            },
            ct);

    public async Task<RecebimentoDto?> ProcessarRecebimentoAsync(string uid, CancellationToken ct = default)
    {
        // Leitura simples primeiro: a transação só corre no dia em que há mesmo salário a receber
        var configuracao = (await utilizadores.ObterAsync(uid, ct))?.Salario;
        if (!Calculos.DeveReceberSalario(configuracao, relogio.Hoje, relogio.Fuso))
        {
            return null;
        }

        // Transação + versão do utilizador: com a app aberta em dois dispositivos o salário só entra uma vez
        return await unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var utilizador = await utilizadores.ObterAsync(uid, c);
                if (utilizador?.Salario is not { } salario || !Calculos.DeveReceberSalario(salario, relogio.Hoje, relogio.Fuso))
                {
                    return null;
                }

                return await RegistarRecebimentoAsync(uid, utilizador, salario, Formatos.ParseValor(salario.Valor), c);
            },
            ct);
    }

    public Task<RecebimentoDto> ReceberManualAsync(string uid, decimal? valor, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var utilizador = await utilizadores.ObterAsync(uid, c);
                if (utilizador?.Salario is not { } salario)
                {
                    throw new PedidoInvalidoException("Configura o salário primeiro.");
                }

                if (!salario.RecebimentoManual)
                {
                    throw new ConflitoException("O recebimento manual do salário não está ligado.");
                }

                if (Calculos.SalarioRecebidoNoMes(salario, relogio.Hoje, relogio.Fuso))
                {
                    throw new ConflitoException("O salário deste mês já foi recebido.");
                }

                var valorSalario = valor ?? Formatos.ParseValor(salario.Valor);
                if (valorSalario <= 0m)
                {
                    throw new PedidoInvalidoException("Escreve o valor do salário.");
                }

                return await RegistarRecebimentoAsync(uid, utilizador, salario, Calculos.Centimos(valorSalario), c);
            },
            ct);

    // O que acontece quando o salário entra (sozinho no dia, ou marcado à mão): o líquido vai para a conta, as
    // contribuições automáticas para as poupanças e o cartão de alimentação carrega, tudo na mesma transação
    private async Task<RecebimentoDto> RegistarRecebimentoAsync(
        string uid,
        Utilizador utilizador,
        ConfiguracaoSalario salario,
        decimal valorSalario,
        CancellationToken c)
    {
        var hoje = relogio.Hoje;
        var agora = relogio.Agora;
        var lista = Ordenacao.Poupancas(await poupancas.ListarAsync(uid, c));
        var recebimento = Calculos.CalcularRecebimento(
            valorSalario,
            utilizador.ConfigPprPoupanca,
            utilizador.Financeiro,
            lista) with { Data = agora };

        // O cartão de alimentação (se configurado) carrega no mesmo dia, na mesma transação:
        // como o salário, só uma vez por mês (RecebidoEm), e fica registado no recebimento
        var cartao = Calculos.CartaoDoMes(salario, hoje);
        if (cartao > 0)
        {
            recebimento = recebimento with { CartaoAlimentacao = cartao };
            utilizador.MovimentarCartaoAlimentacao(cartao, agora);
        }

        utilizador.Salario = salario with { RecebidoEm = agora, UltimoRecebimento = recebimento };
        utilizador.MovimentarSaldo(recebimento.Liquido, agora);

        // Cada contribuição soma-se ao saldo da sua poupança (que também tem versão)
        foreach (var contribuicao in recebimento.Contribuicoes)
        {
            var poupanca = lista.FirstOrDefault(p => p.Id == contribuicao.PoupancaId);
            if (poupanca is not null && contribuicao.Valor != 0)
            {
                poupanca.Saldo = Calculos.Centimos(poupanca.Saldo + contribuicao.Valor);
                poupanca.UltimaContribuicaoMes = Meses.De(hoje);
                poupanca.UltimaContribuicaoEm = hoje;
            }
        }

        // E fica no histórico do mês
        var resumo = await meses.ObterOuCriarAsync(uid, Meses.De(hoje), c);
        resumo.Recebimento = recebimento;

        logger.LogInformation("Salário recebido ({Uid}): entraram {Liquido} € na conta", uid, recebimento.Liquido);
        return recebimento.ParaDto();
    }
}
