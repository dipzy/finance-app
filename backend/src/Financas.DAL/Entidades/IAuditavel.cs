namespace Financas.DAL.Entidades;

/// <summary>
/// Dados do utilizador cujas alterações ficam no registo de alterações (<see cref="RegistoAlteracao"/>).
/// <para>
/// Quem escreve o registo é o <see cref="Auditoria.InterceptorAuditoria"/>: as entidades não fazem
/// nada, só dizem de quem são e como se chamam. A <see cref="Descricao"/> é implementada de forma
/// explícita (<c>string IAuditavel.Descricao => Titulo;</c>), por isso o EF Core não a vê como coluna.
/// </para>
/// </summary>
public interface IAuditavel
{
    string UtilizadorId { get; }
    string Id { get; }

    /// <summary>O nome a mostrar no histórico (ex.: o título da despesa).</summary>
    string Descricao { get; }
}
