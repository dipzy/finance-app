using Financas.DAL.Auditoria;

namespace Financas.Services.Tests;

/// <summary>A origem do pedido nos testes: sem origem (fica "sistema"), com o utilizador que o teste disser.</summary>
public sealed class OrigemTeste : IOrigemPedido
{
    public string? Origem { get; set; }

    public string? Utilizador { get; set; }
}
