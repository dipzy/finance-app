using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <summary>
    /// Deixa de haver pagamentos "anulados": desfazer um pagamento apaga o registo. Os registos anulados
    /// que já existiam passam a ser só a marca "não debitar automaticamente nesse mês" na despesa e são apagados.
    /// </summary>
    public partial class SemPagamentosAnulados : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NaoDebitarAutomaticamenteEm",
                table: "DespesasFixas",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);

            // SQL simples, igual em PostgreSQL e SQLite
            migrationBuilder.Sql("""
                UPDATE "DespesasFixas" SET "NaoDebitarAutomaticamenteEm" = (
                    SELECT MAX(p."Mes") FROM "PagamentosFixas" p
                    WHERE p."UtilizadorId" = "DespesasFixas"."UtilizadorId" AND p."FixaId" = "DespesasFixas"."Id" AND p."Estado" = 'Anulado')
                WHERE EXISTS (
                    SELECT 1 FROM "PagamentosFixas" p
                    WHERE p."UtilizadorId" = "DespesasFixas"."UtilizadorId" AND p."FixaId" = "DespesasFixas"."Id" AND p."Estado" = 'Anulado');
                """);
            migrationBuilder.Sql("""DELETE FROM "PagamentosFixas" WHERE "Estado" = 'Anulado';""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NaoDebitarAutomaticamenteEm",
                table: "DespesasFixas");
        }
    }
}
