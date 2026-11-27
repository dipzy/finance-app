namespace Financas.DAL.Entidades;

/// <summary>
/// Entidades protegidas contra alterações concorrentes (concorrência otimista).
/// <para>
/// <see cref="Versao"/> é um "concurrency token": o EF Core inclui-o no WHERE de cada UPDATE/DELETE
/// (<c>UPDATE ... WHERE "Id" = @id AND "Versao" = @versaoLida</c>) e o <see cref="FinancasDbContext"/>
/// soma-lhe 1 sempre que a linha muda. Se outro pedido mudou a linha entretanto, o UPDATE não encontra
/// a versão lida, afeta 0 linhas e o EF lança <c>DbUpdateConcurrencyException</c>; a
/// <see cref="UnitOfWork"/> desfaz a transação e repete a operação com os dados novos.
/// </para>
/// </summary>
public interface IVersionado
{
    int Versao { get; set; }
}
