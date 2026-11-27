namespace Financas.DAL;

/// <summary>
/// Liga o Microsoft.Data.Sqlite à biblioteca nativa do SQLite (e_sqlite3).
/// <para>
/// Normalmente isto é feito sozinho pelo pacote <c>SQLitePCLRaw.batteries_v2</c>, mas essa DLL não
/// tem assinatura digital e o "Smart App Control" do Windows 11 bloqueia-a ("Uma política de Controlo
/// de Aplicações bloqueou este ficheiro"). Por isso a DAL usa <c>Microsoft.EntityFrameworkCore.Sqlite.Core</c>
/// (sem baterias) e escolhe o provider aqui, uma vez, antes da primeira ligação SQLite.
/// Em PostgreSQL (produção) isto nunca corre. É público para os testes poderem abrir uma ligação
/// SQLite antes de a API arrancar.
/// </para>
/// </summary>
public static class SqliteNativo
{
    private static readonly Lazy<bool> Iniciado = new(() =>
    {
        SQLitePCL.raw.SetProvider(new SQLitePCL.SQLite3Provider_e_sqlite3());
        return true;
    });

    public static void Garantir() => _ = Iniciado.Value;
}
