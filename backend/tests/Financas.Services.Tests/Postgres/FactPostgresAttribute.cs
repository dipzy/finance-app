namespace Financas.Services.Tests.Postgres;

/// <summary>
/// Um <c>[Fact]</c> que só corre quando há PostgreSQL para testar. Sem Docker (como no PC de
/// desenvolvimento), o teste aparece como ignorado ("Skipped") com o motivo, em vez de falhar:
/// o <c>dotnet test</c> local continua verde e rápido.
/// <para>
/// O xUnit 2 decide o <see cref="FactAttribute.Skip"/> quando descobre os testes, por isso a
/// verificação tem de ser barata e sem esperar pelo Docker (ver <see cref="ConfiguracaoPostgres"/>).
/// </para>
/// </summary>
public sealed class FactPostgresAttribute : FactAttribute
{
    public FactPostgresAttribute()
    {
        if (ConfiguracaoPostgres.MotivoParaIgnorar is { } motivo)
        {
            Skip = motivo;
        }
    }
}

/// <summary>
/// Onde e se os testes com PostgreSQL correm, a partir de variáveis de ambiente:
/// <list type="bullet">
///   <item><c>FINANCAS_TESTES_POSTGRES=obrigatorio</c>: correm sempre e, se não houver Docker,
///   <b>falham</b> (é o que o GitHub Actions usa, para um CI sem Docker não passar a verde sem os
///   ter corrido);</item>
///   <item><c>FINANCAS_TESTES_POSTGRES=nao</c>: nunca correm;</item>
///   <item>sem valor: correm se o Docker parecer estar disponível nesta máquina.</item>
/// </list>
/// <c>FINANCAS_TESTES_POSTGRES_LIGACAO</c> usa um servidor PostgreSQL que já existe (por exemplo um
/// PostgreSQL instalado no PC) em vez de um contentor; cada teste cria lá a sua base de dados e
/// apaga-a no fim. <c>FINANCAS_TESTES_POSTGRES_IMAGEM</c> muda a imagem Docker (por defeito
/// <see cref="ImagemPorDefeito"/>; deve ser a versão que a Neon usa).
/// </summary>
public static class ConfiguracaoPostgres
{
    public const string ImagemPorDefeito = "postgres:18-alpine"; // a mesma versão do Neon (18.x)

    public static string Modo => Environment.GetEnvironmentVariable("FINANCAS_TESTES_POSTGRES")?.Trim().ToLowerInvariant() ?? "";

    public static bool Obrigatorio => Modo == "obrigatorio";

    /// <summary>Ligação a um servidor PostgreSQL existente (opcional): com ela não é preciso Docker.</summary>
    public static string? LigacaoExterna => Vazio(Environment.GetEnvironmentVariable("FINANCAS_TESTES_POSTGRES_LIGACAO"));

    public static string Imagem => Vazio(Environment.GetEnvironmentVariable("FINANCAS_TESTES_POSTGRES_IMAGEM")) ?? ImagemPorDefeito;

    /// <summary>Se os testes devem correr nesta execução.</summary>
    public static bool Correr => MotivoParaIgnorar is null;

    /// <summary><c>null</c> = correr; senão, o motivo que aparece no resultado do teste ignorado.</summary>
    public static string? MotivoParaIgnorar { get; } = CalcularMotivo();

    private static string? CalcularMotivo()
    {
        if (Modo is "nao" or "não" or "0" or "false")
        {
            return "Testes com PostgreSQL desligados (FINANCAS_TESTES_POSTGRES=nao).";
        }

        if (Obrigatorio || LigacaoExterna is not null || DockerPareceDisponivel())
        {
            return null;
        }

        return "Sem Docker nesta máquina: os testes com PostgreSQL só correm no GitHub Actions " +
            "(ou com FINANCAS_TESTES_POSTGRES_LIGACAO a apontar para um PostgreSQL).";
    }

    /// <summary>
    /// Uma verificação rápida, sem falar com o Docker: existe o "socket" (Linux/macOS) ou o
    /// "named pipe" (Windows) por onde o Testcontainers fala com ele, ou o DOCKER_HOST está definido?
    /// Se o Docker estiver instalado mas parado, o pipe/socket normalmente não existe.
    /// </summary>
    private static bool DockerPareceDisponivel()
    {
        if (Vazio(Environment.GetEnvironmentVariable("DOCKER_HOST")) is not null)
        {
            return true;
        }

        try
        {
            if (OperatingSystem.IsWindows())
            {
                return Directory.GetFiles(@"\\.\pipe\")
                    .Any(p => p.EndsWith(@"\docker_engine", StringComparison.OrdinalIgnoreCase));
            }

            var casa = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            var runtime = Environment.GetEnvironmentVariable("XDG_RUNTIME_DIR");
            string?[] sockets =
            [
                "/var/run/docker.sock",
                Path.Combine(casa, ".docker", "run", "docker.sock"), // Docker Desktop no macOS
                runtime is null ? null : Path.Combine(runtime, "docker.sock"), // Docker "rootless"
            ];
            return sockets.Any(s => s is not null && File.Exists(s));
        }
        catch (Exception erro) when (erro is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    private static string? Vazio(string? texto) => string.IsNullOrWhiteSpace(texto) ? null : texto.Trim();
}
