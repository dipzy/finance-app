using Financas.DAL;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(FinancasDbContext))]
    [Migration("20261009100000_PartesAceitarRecusar")]
    public partial class PartesAceitarRecusar : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1 = Aceite: as partes que já existiam foram todas aceites ao serem criadas
            migrationBuilder.AddColumn<int>(
                name: "Estado",
                table: "PartesDespesasPartilhadas",
                type: "integer",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Estado",
                table: "PartesDespesasPartilhadas");
        }
    }
}
