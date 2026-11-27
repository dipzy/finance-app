using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class GruposSubstituemParcerias : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "ParceriaId",
                table: "PoupancasPartilhadas",
                newName: "GrupoId");

            migrationBuilder.RenameIndex(
                name: "IX_PoupancasPartilhadas_ParceriaId",
                table: "PoupancasPartilhadas",
                newName: "IX_PoupancasPartilhadas_GrupoId");

            migrationBuilder.RenameColumn(
                name: "ParceriaId",
                table: "DivisoesDespesas",
                newName: "GrupoId");

            migrationBuilder.RenameIndex(
                name: "IX_DivisoesDespesas_ParceriaId_CriadoEm",
                table: "DivisoesDespesas",
                newName: "IX_DivisoesDespesas_GrupoId_CriadoEm");

            migrationBuilder.CreateTable(
                name: "Grupos",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    Nome = table.Column<string>(type: "text", nullable: false),
                    CriadoPorUid = table.Column<string>(type: "text", nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AtualizadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Grupos", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "GruposMembros",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    GrupoId = table.Column<string>(type: "text", nullable: false),
                    Uid = table.Column<string>(type: "text", nullable: false),
                    Role = table.Column<int>(type: "integer", nullable: false),
                    EntradaEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    SaidaEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Versao = table.Column<int>(type: "integer", nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AtualizadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GruposMembros", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Grupos");

            migrationBuilder.DropTable(
                name: "GruposMembros");

            migrationBuilder.RenameColumn(
                name: "GrupoId",
                table: "PoupancasPartilhadas",
                newName: "ParceriaId");

            migrationBuilder.RenameIndex(
                name: "IX_PoupancasPartilhadas_GrupoId",
                table: "PoupancasPartilhadas",
                newName: "IX_PoupancasPartilhadas_ParceriaId");

            migrationBuilder.RenameColumn(
                name: "GrupoId",
                table: "DivisoesDespesas",
                newName: "ParceriaId");

            migrationBuilder.RenameIndex(
                name: "IX_DivisoesDespesas_GrupoId_CriadoEm",
                table: "DivisoesDespesas",
                newName: "IX_DivisoesDespesas_ParceriaId_CriadoEm");
        }
    }
}
