using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class PoupancaPartilhadaMembro : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PoupancasPartilhadasMembros",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    PoupancaPartilhadaId = table.Column<string>(type: "text", nullable: false),
                    MembroUid = table.Column<string>(type: "text", nullable: false),
                    Valor = table.Column<long>(type: "bigint", nullable: false),
                    Tipo = table.Column<int>(type: "integer", nullable: false),
                    DiaDoSalario = table.Column<bool>(type: "boolean", nullable: false),
                    DiaFixo = table.Column<int>(type: "integer", nullable: true),
                    UltimaContribuicaoMes = table.Column<string>(type: "text", nullable: true),
                    Versao = table.Column<int>(type: "integer", nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AtualizadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PoupancasPartilhadasMembros", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PoupancasPartilhadasMembros");
        }
    }
}
