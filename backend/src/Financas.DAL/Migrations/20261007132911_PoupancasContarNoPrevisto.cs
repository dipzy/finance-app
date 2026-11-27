using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class PoupancasContarNoPrevisto : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ContarNoPrevisto",
                table: "Poupancas",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "UltimaContribuicaoEm",
                table: "Poupancas",
                type: "date",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContarNoPrevisto",
                table: "Poupancas");

            migrationBuilder.DropColumn(
                name: "UltimaContribuicaoEm",
                table: "Poupancas");
        }
    }
}
