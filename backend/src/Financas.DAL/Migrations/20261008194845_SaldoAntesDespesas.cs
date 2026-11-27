using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class SaldoAntesDespesas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "SaldoAntes",
                table: "DespesasPartilhadas",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SaldoAntes",
                table: "DespesasExtras",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SaldoAntes",
                table: "DespesasPartilhadas");

            migrationBuilder.DropColumn(
                name: "SaldoAntes",
                table: "DespesasExtras");
        }
    }
}
