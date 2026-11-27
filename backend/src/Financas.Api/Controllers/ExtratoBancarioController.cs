using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Financas.Api.Controllers;

/// <summary>Importar o extrato da conta bancária (CSV ou OFX lido na app) para despesas extras.</summary>
[Route("api/despesas-extras/extrato")]
public sealed class ExtratoBancarioController(IExtratoBancarioService extrato) : ControladorBase
{
    /// <summary>
    /// Para cada movimento (por ordem): a categoria sugerida (regras do utilizador, histórico, palavras-chave),
    /// se já foi importado e se há uma despesa com a mesma data e valor que parece ser a mesma. Não grava nada.
    /// </summary>
    [HttpPost("previsao")]
    public Task<PrevisaoExtratoDto> Previsualizar(ExtratoBancarioPedido pedido, CancellationToken ct) =>
        extrato.PrevisualizarAsync(Uid, pedido, ct);

    /// <summary>
    /// Cria uma despesa por movimento, no histórico (não mexe nos saldos). Os movimentos já importados ficam de fora,
    /// por isso importar o mesmo extrato duas vezes é seguro.
    /// </summary>
    [HttpPost]
    public Task<ResultadoExtratoDto> Importar(ExtratoBancarioPedido pedido, CancellationToken ct) =>
        extrato.ImportarAsync(Uid, pedido, ct);
}
