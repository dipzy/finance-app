using System;
using Financas.DAL;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(FinancasDbContext))]
    [Migration("20261009120000_ContribuicoesPoupanca")]
    public partial class ContribuicoesPoupanca : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Inicio",
                table: "Poupancas",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ContribuicoesPoupanca",
                columns: table => new
                {
                    UtilizadorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    PoupancaId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Mes = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    Valor = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Data = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContribuicoesPoupanca", x => new { x.UtilizadorId, x.PoupancaId, x.Mes });
                    table.ForeignKey(
                        name: "FK_ContribuicoesPoupanca_Poupancas_UtilizadorId_PoupancaId",
                        columns: x => new { x.UtilizadorId, x.PoupancaId },
                        principalTable: "Poupancas",
                        principalColumns: new[] { "UtilizadorId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            // As poupanças que já existem: contam a partir do último mês em que contribuíram (ou, se nunca,
            // deste mês), por isso não aparecem meses antigos como "por enviar". Esse último mês fica
            // registado (sem valor: só se sabe o mês e o dia)
            migrationBuilder.Sql(
                "UPDATE \"Poupancas\" SET \"Inicio\" = COALESCE(\"UltimaContribuicaoMes\", to_char(now(), 'YYYY-MM'));");
            migrationBuilder.Sql(
                "INSERT INTO \"ContribuicoesPoupanca\" (\"UtilizadorId\", \"PoupancaId\", \"Mes\", \"Valor\", \"Data\") " +
                "SELECT \"UtilizadorId\", \"Id\", \"UltimaContribuicaoMes\", 0, COALESCE(\"UltimaContribuicaoEm\", CURRENT_DATE) " +
                "FROM \"Poupancas\" WHERE \"UltimaContribuicaoMes\" IS NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ContribuicoesPoupanca");

            migrationBuilder.DropColumn(
                name: "Inicio",
                table: "Poupancas");
        }
    }
}
