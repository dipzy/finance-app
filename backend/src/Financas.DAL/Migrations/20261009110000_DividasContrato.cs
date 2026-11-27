using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class DividasContrato : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "CapitalVencido",
                table: "Dividas",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ComissaoReembolso",
                table: "Dividas",
                type: "numeric(7,4)",
                precision: 7,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Credor",
                table: "Dividas",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "EncargosMensais",
                table: "Dividas",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Entrada",
                table: "Dividas",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "ExtratoEm",
                table: "Dividas",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InicioContrato",
                table: "Dividas",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NumeroContrato",
                table: "Dividas",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PrazoMeses",
                table: "Dividas",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ProximaPrestacaoCapital",
                table: "Dividas",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ProximaPrestacaoJuros",
                table: "Dividas",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ProximaPrestacaoNumero",
                table: "Dividas",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ProximaPrestacaoSeguros",
                table: "Dividas",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ProximaPrestacaoSelo",
                table: "Dividas",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ProximaPrestacaoValor",
                table: "Dividas",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "ProximaPrestacaoVencimento",
                table: "Dividas",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TaxaAnual",
                table: "Dividas",
                type: "numeric(7,4)",
                precision: 7,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ValorFinanciado",
                table: "Dividas",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CapitalVencido",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "ComissaoReembolso",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "Credor",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "EncargosMensais",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "Entrada",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "ExtratoEm",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "InicioContrato",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "NumeroContrato",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "PrazoMeses",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "ProximaPrestacaoCapital",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "ProximaPrestacaoJuros",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "ProximaPrestacaoNumero",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "ProximaPrestacaoSeguros",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "ProximaPrestacaoSelo",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "ProximaPrestacaoValor",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "ProximaPrestacaoVencimento",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "TaxaAnual",
                table: "Dividas");

            migrationBuilder.DropColumn(
                name: "ValorFinanciado",
                table: "Dividas");
        }
    }
}
