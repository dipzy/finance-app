using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class AcertosConfirmacao : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ConfirmadoEm",
                table: "AcertosPartilhados",
                type: "timestamp with time zone",
                nullable: true);

            // Os acertos que já existiam entraram na conta de quem recebeu ao serem registados: ficam confirmados
            migrationBuilder.Sql("UPDATE \"AcertosPartilhados\" SET \"ConfirmadoEm\" = \"CriadoEm\" WHERE \"ConfirmadoEm\" IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ConfirmadoEm",
                table: "AcertosPartilhados");
        }
    }
}
