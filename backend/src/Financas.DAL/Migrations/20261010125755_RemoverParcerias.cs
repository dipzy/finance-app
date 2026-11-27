using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class RemoverParcerias : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Parcerias");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Parcerias",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UidA = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    UidB = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Parcerias", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Parcerias_UidA_UidB",
                table: "Parcerias",
                columns: new[] { "UidA", "UidB" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Parcerias_UidB_UidA",
                table: "Parcerias",
                columns: new[] { "UidB", "UidA" });
        }
    }
}
