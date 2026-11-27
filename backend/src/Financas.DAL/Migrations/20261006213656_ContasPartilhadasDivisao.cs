using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class ContasPartilhadasDivisao : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DivisoesDespesas",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    DespesaExtraId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    PagadorUid = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    DevedorUid = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ParceriaId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ValorTotal = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    ValorParte = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Estado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AtualizadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    JaPagueiEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RecebiEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Observacao = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DivisoesDespesas", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ParceirosConvites",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    DeUid = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    Estado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AtualizadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    AceiteEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RecusadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ParceirosConvites", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Parcerias",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    UidA = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    UidB = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Parcerias", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PoupancasPartilhadas",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ParceriaId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Nome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Saldo = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Versao = table.Column<int>(type: "integer", nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AtualizadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PoupancasPartilhadas", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DivisoesDespesas_DespesaExtraId",
                table: "DivisoesDespesas",
                column: "DespesaExtraId");

            migrationBuilder.CreateIndex(
                name: "IX_DivisoesDespesas_DevedorUid_Estado",
                table: "DivisoesDespesas",
                columns: new[] { "DevedorUid", "Estado" });

            migrationBuilder.CreateIndex(
                name: "IX_DivisoesDespesas_PagadorUid_Estado",
                table: "DivisoesDespesas",
                columns: new[] { "PagadorUid", "Estado" });

            migrationBuilder.CreateIndex(
                name: "IX_DivisoesDespesas_ParceriaId_CriadoEm",
                table: "DivisoesDespesas",
                columns: new[] { "ParceriaId", "CriadoEm" });

            migrationBuilder.CreateIndex(
                name: "IX_ParceirosConvites_DeUid_CriadoEm",
                table: "ParceirosConvites",
                columns: new[] { "DeUid", "CriadoEm" });

            migrationBuilder.CreateIndex(
                name: "IX_ParceirosConvites_Email_Estado",
                table: "ParceirosConvites",
                columns: new[] { "Email", "Estado" });

            migrationBuilder.CreateIndex(
                name: "IX_Parcerias_UidA_UidB",
                table: "Parcerias",
                columns: new[] { "UidA", "UidB" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Parcerias_UidB_UidA",
                table: "Parcerias",
                columns: new[] { "UidB", "UidA" });

            migrationBuilder.CreateIndex(
                name: "IX_PoupancasPartilhadas_ParceriaId",
                table: "PoupancasPartilhadas",
                column: "ParceriaId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DivisoesDespesas");

            migrationBuilder.DropTable(
                name: "ParceirosConvites");

            migrationBuilder.DropTable(
                name: "Parcerias");

            migrationBuilder.DropTable(
                name: "PoupancasPartilhadas");
        }
    }
}
