using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class JurosPoupancas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "JurosAutomaticos",
                table: "Poupancas",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "JurosCreditadosAte",
                table: "Poupancas",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "JurosDesde",
                table: "Poupancas",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Retencao",
                table: "Poupancas",
                type: "numeric(7,4)",
                precision: 7,
                scale: 4,
                nullable: false,
                defaultValue: 28m);

            migrationBuilder.AddColumn<decimal>(
                name: "TaxaAnual",
                table: "Poupancas",
                type: "numeric(7,4)",
                precision: 7,
                scale: 4,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "JurosPoupancas",
                columns: table => new
                {
                    UtilizadorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    PoupancaId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Mes = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    Bruto = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Liquido = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Data = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JurosPoupancas", x => new { x.UtilizadorId, x.PoupancaId, x.Mes });
                    table.ForeignKey(
                        name: "FK_JurosPoupancas_Poupancas_UtilizadorId_PoupancaId",
                        columns: x => new { x.UtilizadorId, x.PoupancaId },
                        principalTable: "Poupancas",
                        principalColumns: new[] { "UtilizadorId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "JurosPoupancas");

            migrationBuilder.DropColumn(
                name: "JurosAutomaticos",
                table: "Poupancas");

            migrationBuilder.DropColumn(
                name: "JurosCreditadosAte",
                table: "Poupancas");

            migrationBuilder.DropColumn(
                name: "JurosDesde",
                table: "Poupancas");

            migrationBuilder.DropColumn(
                name: "Retencao",
                table: "Poupancas");

            migrationBuilder.DropColumn(
                name: "TaxaAnual",
                table: "Poupancas");
        }
    }
}
