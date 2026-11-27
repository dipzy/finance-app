using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class CategoriasOrcamentosObjetivosCartao : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CartaoAtualizadoEm",
                table: "Utilizadores",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SaldoCartaoAlimentacao",
                table: "Utilizadores",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "Categoria",
                table: "DespesasExtras",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MeioPagamento",
                table: "DespesasExtras",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Conta"); // as despesas que já existiam foram pagas com a conta

            migrationBuilder.CreateTable(
                name: "ObjetivosPoupanca",
                columns: table => new
                {
                    UtilizadorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Nome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ValorAlvo = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    MesAlvo = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    MesInicio = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    PoupancaId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    ValorAtual = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ObjetivosPoupanca", x => new { x.UtilizadorId, x.Id });
                    table.ForeignKey(
                        name: "FK_ObjetivosPoupanca_Utilizadores_UtilizadorId",
                        column: x => x.UtilizadorId,
                        principalTable: "Utilizadores",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Orcamentos",
                columns: table => new
                {
                    UtilizadorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Categoria = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Limite = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Orcamentos", x => new { x.UtilizadorId, x.Id });
                    table.ForeignKey(
                        name: "FK_Orcamentos_Utilizadores_UtilizadorId",
                        column: x => x.UtilizadorId,
                        principalTable: "Utilizadores",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ObjetivosPoupanca_UtilizadorId_PoupancaId",
                table: "ObjetivosPoupanca",
                columns: new[] { "UtilizadorId", "PoupancaId" });

            migrationBuilder.CreateIndex(
                name: "IX_Orcamentos_UtilizadorId_Categoria",
                table: "Orcamentos",
                columns: new[] { "UtilizadorId", "Categoria" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ObjetivosPoupanca");

            migrationBuilder.DropTable(
                name: "Orcamentos");

            migrationBuilder.DropColumn(
                name: "CartaoAtualizadoEm",
                table: "Utilizadores");

            migrationBuilder.DropColumn(
                name: "SaldoCartaoAlimentacao",
                table: "Utilizadores");

            migrationBuilder.DropColumn(
                name: "Categoria",
                table: "DespesasExtras");

            migrationBuilder.DropColumn(
                name: "MeioPagamento",
                table: "DespesasExtras");
        }
    }
}
