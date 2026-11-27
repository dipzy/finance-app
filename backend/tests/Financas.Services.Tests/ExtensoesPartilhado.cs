using Financas.Services.Dtos;
using Financas.Services.Interfaces;

namespace Financas.Services.Tests;

public static class ExtensoesPartilhado
{
    /// <summary>Cria a despesa e todos os outros participantes aceitam a sua parte (como se já estivesse tudo combinado).</summary>
    public static async Task<string> CriarAceiteAsync(this IPartilhadoService partilha, string uid, string grupoId, DespesaPartilhadaPedido pedido)
    {
        var id = await partilha.CriarDespesaAsync(uid, grupoId, pedido);
        foreach (var participante in pedido.Participantes.Select(p => p.Uid).Where(u => u != uid))
        {
            await partilha.AceitarDespesaAsync(participante, id);
        }

        return id;
    }
}
