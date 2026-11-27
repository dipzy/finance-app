using Financas.DAL;
using Financas.Services.Regras;
using Npgsql;

namespace Financas.Services.Tests;

// Porte dos casos de parseValor/lerData de __tests__/formatos.test.ts
public class FormatosTests
{
    [Theory]
    [InlineData("1500", "1500")]
    [InlineData("1500,50", "1500.5")]
    [InlineData("1.500", "1500")]
    [InlineData("1.500,50", "1500.5")]
    [InlineData("1.234.567", "1234567")]
    [InlineData("12,50", "12.5")]
    [InlineData("12.50", "12.5")]
    [InlineData("1.5", "1.5")]
    [InlineData("45.1", "45.1")]
    [InlineData("1 000,00 €", "1000")]
    [InlineData("0", "0")]
    [InlineData("", "0")]
    [InlineData(null, "0")]
    [InlineData("abc", "0")]
    public void ParseValor_le_o_formato_portugues(string? texto, string esperado) =>
        Assert.Equal(decimal.Parse(esperado, System.Globalization.CultureInfo.InvariantCulture), Formatos.ParseValor(texto));

    [Fact]
    public void LerData_aceita_o_formato_atual_e_o_antigo()
    {
        Assert.Equal(new DateOnly(2026, 10, 2), Formatos.LerData("2026-10-02"));
        Assert.Equal(new DateOnly(2026, 10, 2), Formatos.LerData("02/10/2026"));
        Assert.Null(Formatos.LerData("ontem"));
        Assert.Null(Formatos.LerData("31/02/2026")); // não existe
    }

    [Fact]
    public void NormalizarTitulo_sem_maiusculas_acentos_nem_espacos_a_mais() =>
        Assert.Equal("ginasio carro", Formatos.NormalizarTitulo("  Ginásio   Carro "));
}

// A ligação à base de dados aceita o formato do Npgsql e o URI que a Neon mostra
public class LigacaoBaseDeDadosTests
{
    [Fact]
    public void Converte_o_URI_da_Neon_para_o_formato_do_Npgsql()
    {
        var convertida = LigacaoBaseDeDados.ParaNpgsql(
            "postgresql://financas_owner:p%40ss%3Aw0rd@ep-cool-name-123456.eu-central-1.aws.neon.tech/financas?sslmode=require&channel_binding=require");

        var b = new NpgsqlConnectionStringBuilder(convertida);
        Assert.Equal("ep-cool-name-123456.eu-central-1.aws.neon.tech", b.Host);
        Assert.Equal(5432, b.Port);
        Assert.Equal("financas", b.Database);
        Assert.Equal("financas_owner", b.Username);
        Assert.Equal("p@ss:w0rd", b.Password); // %40 = @, %3A = :
        Assert.Equal(SslMode.Require, b.SslMode);
        Assert.Equal(ChannelBinding.Require, b.ChannelBinding);
    }

    [Fact]
    public void Porta_do_URI_e_SSL_obrigatorio_mesmo_sem_sslmode()
    {
        var b = new NpgsqlConnectionStringBuilder(LigacaoBaseDeDados.ParaNpgsql("postgres://eu:segredo@localhost:6543/teste"));
        Assert.Equal(("localhost", 6543, "teste", "eu", "segredo"), (b.Host, b.Port, b.Database, b.Username, b.Password));
        Assert.Equal(SslMode.Require, b.SslMode);
    }

    [Fact]
    public void Parametros_do_libpq_que_o_Npgsql_conhece_passam_e_os_outros_sao_ignorados()
    {
        var b = new NpgsqlConnectionStringBuilder(LigacaoBaseDeDados.ParaNpgsql(
            "postgresql://eu:segredo@ep-x.neon.tech/financas?sslmode=verify-full&connect_timeout=30&application_name=financas-api&target_session_attrs=any"));
        Assert.Equal((SslMode.VerifyFull, 30, "financas-api"), (b.SslMode, b.Timeout, b.ApplicationName));
    }

    [Fact]
    public void O_formato_chave_valor_fica_como_esta()
    {
        const string ligacao = "Host=ep-x.neon.tech;Database=financas;Username=eu;Password=segredo;SSL Mode=Require";
        Assert.Equal(ligacao, LigacaoBaseDeDados.ParaNpgsql(ligacao));
        Assert.False(LigacaoBaseDeDados.ESqlite(ligacao));
    }

    [Fact]
    public void Data_Source_e_SQLite()
    {
        Assert.True(LigacaoBaseDeDados.ESqlite("Data Source=financas-dev.db"));
        Assert.False(LigacaoBaseDeDados.ESqlite("postgresql://eu@localhost/financas"));
    }
}
