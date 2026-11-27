using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class GastosRecorrentesPesquisaAuditoria : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ChaveIdempotencia",
                table: "DespesasExtras",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "DataOcorrencia",
                table: "DespesasExtras",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GastoRecorrenteId",
                table: "DespesasExtras",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GastosRecorrentes",
                columns: table => new
                {
                    UtilizadorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Titulo = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Valor = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Categoria = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    MeioPagamento = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Frequencia = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    DiaSemana = table.Column<int>(type: "integer", nullable: true),
                    DiaMes = table.Column<int>(type: "integer", nullable: true),
                    Inicio = table.Column<DateOnly>(type: "date", nullable: false),
                    Fim = table.Column<DateOnly>(type: "date", nullable: true),
                    Ativo = table.Column<bool>(type: "boolean", nullable: false),
                    UltimaGeracao = table.Column<DateOnly>(type: "date", nullable: true),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GastosRecorrentes", x => new { x.UtilizadorId, x.Id });
                    table.ForeignKey(
                        name: "FK_GastosRecorrentes_Utilizadores_UtilizadorId",
                        column: x => x.UtilizadorId,
                        principalTable: "Utilizadores",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RegistosAlteracao",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    UtilizadorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Entidade = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    EntidadeId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Descricao = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Acao = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Quando = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Alteracoes = table.Column<string>(type: "text", nullable: true),
                    Origem = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RegistosAlteracao", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DespesasExtras_UtilizadorId_ChaveIdempotencia",
                table: "DespesasExtras",
                columns: new[] { "UtilizadorId", "ChaveIdempotencia" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DespesasExtras_UtilizadorId_GastoRecorrenteId_DataOcorrencia",
                table: "DespesasExtras",
                columns: new[] { "UtilizadorId", "GastoRecorrenteId", "DataOcorrencia" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RegistosAlteracao_UtilizadorId_Quando",
                table: "RegistosAlteracao",
                columns: new[] { "UtilizadorId", "Quando" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GastosRecorrentes");

            migrationBuilder.DropTable(
                name: "RegistosAlteracao");

            migrationBuilder.DropIndex(
                name: "IX_DespesasExtras_UtilizadorId_ChaveIdempotencia",
                table: "DespesasExtras");

            migrationBuilder.DropIndex(
                name: "IX_DespesasExtras_UtilizadorId_GastoRecorrenteId_DataOcorrencia",
                table: "DespesasExtras");

            migrationBuilder.DropColumn(
                name: "ChaveIdempotencia",
                table: "DespesasExtras");

            migrationBuilder.DropColumn(
                name: "DataOcorrencia",
                table: "DespesasExtras");

            migrationBuilder.DropColumn(
                name: "GastoRecorrenteId",
                table: "DespesasExtras");
        }
    }
}
