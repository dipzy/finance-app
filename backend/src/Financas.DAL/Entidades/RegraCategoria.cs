namespace Financas.DAL.Entidades;

/// <summary>
/// Regra de categorização automática do utilizador: se a descrição de uma despesa <b>contém</b>
/// <see cref="Texto"/> (sem maiúsculas nem acentos), a categoria é <see cref="Categoria"/>.
/// <para>
/// Quando várias regras ativas servem, ganha a de maior <see cref="Prioridade"/>; em empate, a de texto
/// mais comprido (a mais específica) e depois a mais antiga. As regras do utilizador têm sempre
/// prioridade sobre as que vêm de origem com a aplicação (ver <c>Regras/RegrasPadrao.cs</c>).
/// </para>
/// </summary>
public sealed class RegraCategoria : IAuditavel
{
    public required string UtilizadorId { get; init; }
    public required string Id { get; init; }

    /// <summary>O texto a procurar na descrição, como o utilizador o escreveu (compara-se sem maiúsculas nem acentos).</summary>
    public required string Texto { get; set; }

    /// <summary>Chave da categoria (ex.: "supermercado").</summary>
    public required string Categoria { get; set; }

    /// <summary>Uma regra desativada fica guardada mas não é usada.</summary>
    public bool Ativa { get; set; } = true;

    /// <summary>Maior ganha. Por defeito 0.</summary>
    public int Prioridade { get; set; }

    public DateTimeOffset CriadoEm { get; set; }

    string IAuditavel.Descricao => Texto;
}
