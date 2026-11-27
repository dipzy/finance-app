using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class DebitoAutomaticoPorDespesa : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "DebitoAutomatico",
                table: "DespesasFixas",
                type: "boolean",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DebitoAutomatico",
                table: "DespesasFixas");
        }
    }
}
