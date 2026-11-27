using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Financas.DAL;

/// <summary>
/// Escolhe a base de dados a partir de <c>ConnectionStrings:Financas</c>:
/// <list type="bullet">
///   <item><c>Data Source=financas.db</c> → SQLite (desenvolvimento local e testes);</item>
///   <item><c>Host=...;Database=...;Username=...</c> → PostgreSQL (formato do Npgsql);</item>
///   <item><c>postgresql://utilizador:password@host/base?sslmode=require</c> → PostgreSQL
///   (o formato URI que a Neon mostra por defeito), convertido para o formato do Npgsql.</item>
/// </list>
/// </summary>
public static class LigacaoBaseDeDados
{
    public static bool ESqlite(string ligacao)
    {
        var texto = ligacao.TrimStart();
        return texto.StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase)
            || texto.StartsWith("DataSource=", StringComparison.OrdinalIgnoreCase)
            || texto.StartsWith("Filename=", StringComparison.OrdinalIgnoreCase);
    }

    public static bool EUri(string ligacao)
    {
        var texto = ligacao.TrimStart();
        return texto.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase)
            || texto.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Converte uma ligação em formato URI (<c>postgresql://user:password@host:porta/base?sslmode=require</c>)
    /// para o formato chave=valor do Npgsql. Uma ligação que já esteja nesse formato é devolvida tal como está.
    /// </summary>
    public static string ParaNpgsql(string ligacao)
    {
        if (!EUri(ligacao))
        {
            return ligacao;
        }

        var uri = new Uri(ligacao.Trim());
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            // Sem sslmode no URI: a ligação é sempre cifrada (a Neon exige-o)
            SslMode = SslMode.Require,
        };

        // "utilizador:password", com caracteres especiais codificados (%40 = @)
        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            var partes = uri.UserInfo.Split(':', 2);
            builder.Username = Uri.UnescapeDataString(partes[0]);
            if (partes.Length == 2)
            {
                builder.Password = Uri.UnescapeDataString(partes[1]);
            }
        }

        foreach (var (chave, valor) in LerParametros(uri.Query))
        {
            switch (chave.ToLowerInvariant())
            {
                case "sslmode":
                    builder.SslMode = valor.ToLowerInvariant() switch
                    {
                        "disable" => SslMode.Disable,
                        "allow" => SslMode.Allow,
                        "prefer" => SslMode.Prefer,
                        "verify-ca" => SslMode.VerifyCA,
                        "verify-full" => SslMode.VerifyFull,
                        _ => SslMode.Require,
                    };
                    break;
                case "channel_binding":
                    builder.ChannelBinding = valor.ToLowerInvariant() switch
                    {
                        "disable" => ChannelBinding.Disable,
                        "require" => ChannelBinding.Require,
                        _ => ChannelBinding.Prefer,
                    };
                    break;
                case "options":
                    builder.Options = valor;
                    break;
                case "application_name":
                    builder.ApplicationName = valor;
                    break;
                case "connect_timeout" when int.TryParse(valor, out var segundos):
                    builder.Timeout = segundos;
                    break;
                // Outros parâmetros do libpq que o Npgsql não conhece são ignorados
            }
        }

        return builder.ConnectionString;
    }

    internal static void Configurar(DbContextOptionsBuilder opcoes, string ligacao)
    {
        if (ESqlite(ligacao))
        {
            SqliteNativo.Garantir();
            opcoes.UseSqlite(ligacao);
        }
        else
        {
            // Desativar a estratégia de repetição do EF Core (NpgsqlExecutionStrategy)
            // porque a UnitOfWork já tem a sua própria lógica de repetição para conflitos
            // de concorrência (versão, chaves únicas, deadlock, falha de serialização).
            // Passar maxRetryCount = 0 desativa as repetições.
            opcoes.UseNpgsql(ParaNpgsql(ligacao), npgsql => npgsql.EnableRetryOnFailure(0));
        }
    }

    private static IEnumerable<(string Chave, string Valor)> LerParametros(string query)
    {
        foreach (var par in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var partes = par.Split('=', 2);
            yield return (Uri.UnescapeDataString(partes[0]), partes.Length == 2 ? Uri.UnescapeDataString(partes[1]) : "");
        }
    }
}
