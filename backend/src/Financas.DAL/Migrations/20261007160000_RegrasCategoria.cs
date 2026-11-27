using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class RegrasCategoria : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RegrasCategoria",
                columns: table => new
                {
                    UtilizadorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Texto = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Categoria = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Ativa = table.Column<bool>(type: "boolean", nullable: false),
                    Prioridade = table.Column<int>(type: "integer", nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RegrasCategoria", x => new { x.UtilizadorId, x.Id });
                    table.ForeignKey(
                        name: "FK_RegrasCategoria_Utilizadores_UtilizadorId",
                        column: x => x.UtilizadorId,
                        principalTable: "Utilizadores",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RegrasCategoria");
        }
    }
}
