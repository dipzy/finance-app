using Financas.Services.Regras;
using Microsoft.Extensions.Options;

namespace Financas.Services;

/// <summary>Opções do relógio (secção "Relogio" do appsettings.json).</summary>
public sealed class OpcoesRelogio
{
    public const string Seccao = "Relogio";

    /// <summary>Fuso horário (IANA) em que se conta o "hoje" da app.</summary>
    public string FusoHorario { get; set; } = "Europe/Lisbon";
}

/// <summary>
/// O "agora" e o "hoje" da app.
/// <para>
/// O servidor corre em UTC (no Render), mas o dia do salário e dos débitos é o dia em Portugal:
/// às 23:30 UTC de 30 de setembro já é 1 de outubro em Lisboa (no verão). Por isso o "hoje" é
/// sempre calculado no fuso <see cref="OpcoesRelogio.FusoHorario"/>.
/// </para>
/// <para>
/// O tempo vem de um <see cref="TimeProvider"/> injetado: em produção é o relógio do sistema,
/// nos testes é um <c>FakeTimeProvider</c> que se põe no dia que se quiser.
/// </para>
/// </summary>
public sealed class Relogio
{
    private readonly TimeProvider _tempo;

    public Relogio(TimeProvider tempo, IOptions<OpcoesRelogio> opcoes)
    {
        _tempo = tempo;
        try
        {
            Fuso = TimeZoneInfo.FindSystemTimeZoneById(opcoes.Value.FusoHorario);
        }
        catch (TimeZoneNotFoundException erro)
        {
            // Falhar logo no arranque: com o fuso errado o salário e os débitos podiam mudar de dia
            throw new InvalidOperationException(
                $"Fuso horário '{opcoes.Value.FusoHorario}' não encontrado (falta o pacote tzdata?).", erro);
        }
    }

    public TimeZoneInfo Fuso { get; }

    /// <summary>O instante atual, em UTC (para guardar).</summary>
    public DateTimeOffset Agora => _tempo.GetUtcNow();

    /// <summary>O dia de hoje em Portugal.</summary>
    public DateOnly Hoje => DataLocal(Agora);

    /// <summary>O mês atual em Portugal ("AAAA-MM").</summary>
    public string MesAtual => Meses.De(Hoje);

    public DateOnly DataLocal(DateTimeOffset instante) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instante, Fuso).DateTime);
}
