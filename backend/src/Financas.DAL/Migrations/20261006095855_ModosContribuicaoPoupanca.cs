using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class ModosContribuicaoPoupanca : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ContribuicaoAutomatica",
                table: "Poupancas",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "DiaContribuicao",
                table: "Poupancas",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UltimaContribuicaoMes",
                table: "Poupancas",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContribuicaoAutomatica",
                table: "Poupancas");

            migrationBuilder.DropColumn(
                name: "DiaContribuicao",
                table: "Poupancas");

            migrationBuilder.DropColumn(
                name: "UltimaContribuicaoMes",
                table: "Poupancas");
        }
    }
}
