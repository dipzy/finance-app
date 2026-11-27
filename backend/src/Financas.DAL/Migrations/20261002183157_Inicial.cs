using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class Inicial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Utilizadores",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    Nome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Saldo = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    SaldoAtualizadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Salario = table.Column<string>(type: "text", nullable: true),
                    Financeiro = table.Column<string>(type: "text", nullable: true),
                    ConfigPprPoupanca = table.Column<string>(type: "text", nullable: true),
                    PagamentosPorMesConvertidos = table.Column<bool>(type: "boolean", nullable: false),
                    PoupancasListaConvertidas = table.Column<bool>(type: "boolean", nullable: false),
                    ImportadoDoFirestoreEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Versao = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Utilizadores", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DespesasExtras",
                columns: table => new
                {
                    UtilizadorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Titulo = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Valor = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Data = table.Column<DateOnly>(type: "date", nullable: true),
                    Mes = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    DescontadaDaConta = table.Column<bool>(type: "boolean", nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DespesasExtras", x => new { x.UtilizadorId, x.Id });
                    table.ForeignKey(
                        name: "FK_DespesasExtras_Utilizadores_UtilizadorId",
                        column: x => x.UtilizadorId,
                        principalTable: "Utilizadores",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DespesasFixas",
                columns: table => new
                {
                    UtilizadorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Titulo = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Valor = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    DiaDebito = table.Column<int>(type: "integer", nullable: true),
                    Inicio = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    Fim = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    Periodicidade = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    MesAnual = table.Column<int>(type: "integer", nullable: true),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Debitado = table.Column<bool>(type: "boolean", nullable: true),
                    MesDebitado = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    AnuladoMes = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DespesasFixas", x => new { x.UtilizadorId, x.Id });
                    table.ForeignKey(
                        name: "FK_DespesasFixas_Utilizadores_UtilizadorId",
                        column: x => x.UtilizadorId,
                        principalTable: "Utilizadores",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Dividas",
                columns: table => new
                {
                    UtilizadorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Titulo = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ValorInicial = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Desde = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    FixaId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Dividas", x => new { x.UtilizadorId, x.Id });
                    table.ForeignKey(
                        name: "FK_Dividas_Utilizadores_UtilizadorId",
                        column: x => x.UtilizadorId,
                        principalTable: "Utilizadores",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Meses",
                columns: table => new
                {
                    UtilizadorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Mes = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    SaldoInicial = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    SaldoFinal = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    AbertoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Recebimento = table.Column<string>(type: "text", nullable: true),
                    Importado = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Meses", x => new { x.UtilizadorId, x.Mes });
                    table.ForeignKey(
                        name: "FK_Meses_Utilizadores_UtilizadorId",
                        column: x => x.UtilizadorId,
                        principalTable: "Utilizadores",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PagamentosFixas",
                columns: table => new
                {
                    UtilizadorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Id = table.Column<string>(type: "character varying(136)", maxLength: 136, nullable: false),
                    FixaId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Mes = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    Titulo = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Valor = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Data = table.Column<DateOnly>(type: "date", nullable: false),
                    Estado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PagamentosFixas", x => new { x.UtilizadorId, x.Id });
                    table.ForeignKey(
                        name: "FK_PagamentosFixas_Utilizadores_UtilizadorId",
                        column: x => x.UtilizadorId,
                        principalTable: "Utilizadores",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Poupancas",
                columns: table => new
                {
                    UtilizadorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Nome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Tipo = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Valor = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Saldo = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Ordem = table.Column<long>(type: "bigint", nullable: true),
                    Versao = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Poupancas", x => new { x.UtilizadorId, x.Id });
                    table.ForeignKey(
                        name: "FK_Poupancas_Utilizadores_UtilizadorId",
                        column: x => x.UtilizadorId,
                        principalTable: "Utilizadores",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DespesasExtras_UtilizadorId_Mes",
                table: "DespesasExtras",
                columns: new[] { "UtilizadorId", "Mes" });

            migrationBuilder.CreateIndex(
                name: "IX_PagamentosFixas_UtilizadorId_FixaId",
                table: "PagamentosFixas",
                columns: new[] { "UtilizadorId", "FixaId" });

            migrationBuilder.CreateIndex(
                name: "IX_PagamentosFixas_UtilizadorId_Mes_FixaId",
                table: "PagamentosFixas",
                columns: new[] { "UtilizadorId", "Mes", "FixaId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DespesasExtras");

            migrationBuilder.DropTable(
                name: "DespesasFixas");

            migrationBuilder.DropTable(
                name: "Dividas");

            migrationBuilder.DropTable(
                name: "Meses");

            migrationBuilder.DropTable(
                name: "PagamentosFixas");

            migrationBuilder.DropTable(
                name: "Poupancas");

            migrationBuilder.DropTable(
                name: "Utilizadores");
        }
    }
}
