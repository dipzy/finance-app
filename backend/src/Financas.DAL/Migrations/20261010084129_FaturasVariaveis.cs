using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class FaturasVariaveis : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "Consumo",
                table: "PagamentosFixas",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UnidadeConsumo",
                table: "DespesasFixas",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Variavel",
                table: "DespesasFixas",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Consumo",
                table: "PagamentosFixas");

            migrationBuilder.DropColumn(
                name: "UnidadeConsumo",
                table: "DespesasFixas");

            migrationBuilder.DropColumn(
                name: "Variavel",
                table: "DespesasFixas");
        }
    }
}
