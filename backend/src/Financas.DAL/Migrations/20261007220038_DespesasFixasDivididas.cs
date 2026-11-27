using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class DespesasFixasDivididas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PagamentoFixaId",
                table: "DespesasPartilhadas",
                type: "character varying(136)",
                maxLength: 136,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Divisao",
                table: "DespesasFixas",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ValorTotal",
                table: "DespesasFixas",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_DespesasPartilhadas_PagamentoFixaId",
                table: "DespesasPartilhadas",
                column: "PagamentoFixaId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_DespesasPartilhadas_PagamentoFixaId",
                table: "DespesasPartilhadas");

            migrationBuilder.DropColumn(
                name: "PagamentoFixaId",
                table: "DespesasPartilhadas");

            migrationBuilder.DropColumn(
                name: "Divisao",
                table: "DespesasFixas");

            migrationBuilder.DropColumn(
                name: "ValorTotal",
                table: "DespesasFixas");
        }
    }
}
