using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Financas.DAL.Migrations
{
    /// <inheritdoc />
    public partial class PartilhadoDespesasAcertosMealheiros : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "UltimaContribuicaoMes",
                table: "PoupancasPartilhadasMembros",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "PoupancaPartilhadaId",
                table: "PoupancasPartilhadasMembros",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "MembroUid",
                table: "PoupancasPartilhadasMembros",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Id",
                table: "PoupancasPartilhadasMembros",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<DateOnly>(
                name: "DataObjetivo",
                table: "PoupancasPartilhadas",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Objetivo",
                table: "PoupancasPartilhadas",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GrupoId",
                table: "ParceirosConvites",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Uid",
                table: "GruposMembros",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "GrupoId",
                table: "GruposMembros",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Id",
                table: "GruposMembros",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Nome",
                table: "Grupos",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "CriadoPorUid",
                table: "Grupos",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Id",
                table: "Grupos",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<string>(
                name: "DespesaPartilhadaId",
                table: "DespesasExtras",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AcertosPartilhados",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    GrupoId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    DeUid = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ParaUid = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Valor = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Data = table.Column<DateOnly>(type: "date", nullable: false),
                    CriadoPorUid = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AcertosPartilhados", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DespesasPartilhadas",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    GrupoId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Titulo = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Valor = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Data = table.Column<DateOnly>(type: "date", nullable: false),
                    Mes = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    Categoria = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    PagadorUid = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    MeioPagamento = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    DescontadaDaConta = table.Column<bool>(type: "boolean", nullable: false),
                    Modo = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Versao = table.Column<int>(type: "integer", nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AtualizadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DespesasPartilhadas", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MovimentosPoupancasPartilhadas",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    PoupancaPartilhadaId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Uid = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Valor = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Automatico = table.Column<bool>(type: "boolean", nullable: false),
                    Data = table.Column<DateOnly>(type: "date", nullable: false),
                    Mes = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MovimentosPoupancasPartilhadas", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PartesDespesasPartilhadas",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    DespesaPartilhadaId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Uid = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Valor = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Peso = table.Column<decimal>(type: "numeric(12,4)", precision: 12, scale: 4, nullable: true),
                    DespesaExtraId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PartesDespesasPartilhadas", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PartesDespesasPartilhadas_DespesasPartilhadas_DespesaPartil~",
                        column: x => x.DespesaPartilhadaId,
                        principalTable: "DespesasPartilhadas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // ---- Dados: antes dos índices únicos e de apagar as divisões ----

            // Os convites de grupo guardavam o id do grupo em DeUid: passa para a coluna nova
            migrationBuilder.Sql("""
                UPDATE "ParceirosConvites" c SET "GrupoId" = c."DeUid"
                WHERE c."GrupoId" IS NULL AND EXISTS (SELECT 1 FROM "Grupos" g WHERE g."Id" = c."DeUid");
                """);

            // Uma linha por pessoa e grupo (antes do índice único): fica a mais antiga
            migrationBuilder.Sql("""
                DELETE FROM "GruposMembros" m USING "GruposMembros" o
                WHERE m."GrupoId" = o."GrupoId" AND m."Uid" = o."Uid"
                  AND (m."EntradaEm" > o."EntradaEm" OR (m."EntradaEm" = o."EntradaEm" AND m."Id" > o."Id"));
                """);

            // Uma contribuição por pessoa e mealheiro: fica a mais recente
            migrationBuilder.Sql("""
                DELETE FROM "PoupancasPartilhadasMembros" m USING "PoupancasPartilhadasMembros" o
                WHERE m."PoupancaPartilhadaId" = o."PoupancaPartilhadaId" AND m."MembroUid" = o."MembroUid"
                  AND (m."CriadoEm" < o."CriadoEm" OR (m."CriadoEm" = o."CriadoEm" AND m."Id" < o."Id"));
                """);

            // As divisões ainda por pagar (ou à espera de confirmação) passam a despesas partilhadas com o
            // valor da parte, paga pelo pagador e toda do devedor: o saldo do grupo fica igual ao que
            // estava em dívida. Não mexem na conta de ninguém (DescontadaDaConta = false, sem despesas
            // pessoais). As já pagas ficaram acertadas na versão anterior e não passam.
            migrationBuilder.Sql("""
                INSERT INTO "DespesasPartilhadas"
                    ("Id", "GrupoId", "Titulo", "Valor", "Data", "Mes", "Categoria", "PagadorUid", "MeioPagamento",
                     "DescontadaDaConta", "Modo", "Versao", "CriadoEm", "AtualizadoEm")
                SELECT d."Id", d."GrupoId", COALESCE(e."Titulo", 'Despesa dividida'), d."ValorParte",
                       COALESCE(e."Data", CAST(d."CriadoEm" AS date)),
                       to_char(COALESCE(e."Data", CAST(d."CriadoEm" AS date)), 'YYYY-MM'),
                       e."Categoria", d."PagadorUid", 'Conta', FALSE, 'Igual', 0, d."CriadoEm", NULL
                FROM "DivisoesDespesas" d
                LEFT JOIN "DespesasExtras" e ON e."UtilizadorId" = d."PagadorUid" AND e."Id" = d."DespesaExtraId"
                WHERE d."Estado" <> 'Paga' AND d."ValorParte" > 0;

                INSERT INTO "PartesDespesasPartilhadas" ("Id", "DespesaPartilhadaId", "Uid", "Valor", "Peso", "DespesaExtraId")
                SELECT d."Id" || '-p', d."Id", d."DevedorUid", d."ValorParte", NULL, NULL
                FROM "DivisoesDespesas" d
                WHERE d."Estado" <> 'Paga' AND d."ValorParte" > 0;
                """);

            migrationBuilder.DropTable(
                name: "DivisoesDespesas");

            migrationBuilder.CreateIndex(
                name: "IX_PoupancasPartilhadasMembros_MembroUid",
                table: "PoupancasPartilhadasMembros",
                column: "MembroUid");

            migrationBuilder.CreateIndex(
                name: "IX_PoupancasPartilhadasMembros_PoupancaPartilhadaId_MembroUid",
                table: "PoupancasPartilhadasMembros",
                columns: new[] { "PoupancaPartilhadaId", "MembroUid" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ParceirosConvites_GrupoId_Estado",
                table: "ParceirosConvites",
                columns: new[] { "GrupoId", "Estado" });

            migrationBuilder.CreateIndex(
                name: "IX_GruposMembros_GrupoId_Uid",
                table: "GruposMembros",
                columns: new[] { "GrupoId", "Uid" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GruposMembros_Uid",
                table: "GruposMembros",
                column: "Uid");

            migrationBuilder.CreateIndex(
                name: "IX_DespesasExtras_DespesaPartilhadaId",
                table: "DespesasExtras",
                column: "DespesaPartilhadaId");

            migrationBuilder.CreateIndex(
                name: "IX_AcertosPartilhados_GrupoId",
                table: "AcertosPartilhados",
                column: "GrupoId");

            migrationBuilder.CreateIndex(
                name: "IX_DespesasPartilhadas_GrupoId",
                table: "DespesasPartilhadas",
                column: "GrupoId");

            migrationBuilder.CreateIndex(
                name: "IX_MovimentosPoupancasPartilhadas_PoupancaPartilhadaId",
                table: "MovimentosPoupancasPartilhadas",
                column: "PoupancaPartilhadaId");

            migrationBuilder.CreateIndex(
                name: "IX_MovimentosPoupancasPartilhadas_Uid_Mes",
                table: "MovimentosPoupancasPartilhadas",
                columns: new[] { "Uid", "Mes" });

            migrationBuilder.CreateIndex(
                name: "IX_PartesDespesasPartilhadas_DespesaPartilhadaId_Uid",
                table: "PartesDespesasPartilhadas",
                columns: new[] { "DespesaPartilhadaId", "Uid" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PartesDespesasPartilhadas_Uid",
                table: "PartesDespesasPartilhadas",
                column: "Uid");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AcertosPartilhados");

            migrationBuilder.DropTable(
                name: "MovimentosPoupancasPartilhadas");

            migrationBuilder.DropTable(
                name: "PartesDespesasPartilhadas");

            migrationBuilder.DropTable(
                name: "DespesasPartilhadas");

            migrationBuilder.DropIndex(
                name: "IX_PoupancasPartilhadasMembros_MembroUid",
                table: "PoupancasPartilhadasMembros");

            migrationBuilder.DropIndex(
                name: "IX_PoupancasPartilhadasMembros_PoupancaPartilhadaId_MembroUid",
                table: "PoupancasPartilhadasMembros");

            migrationBuilder.DropIndex(
                name: "IX_ParceirosConvites_GrupoId_Estado",
                table: "ParceirosConvites");

            migrationBuilder.DropIndex(
                name: "IX_GruposMembros_GrupoId_Uid",
                table: "GruposMembros");

            migrationBuilder.DropIndex(
                name: "IX_GruposMembros_Uid",
                table: "GruposMembros");

            migrationBuilder.DropIndex(
                name: "IX_DespesasExtras_DespesaPartilhadaId",
                table: "DespesasExtras");

            migrationBuilder.DropColumn(
                name: "DataObjetivo",
                table: "PoupancasPartilhadas");

            migrationBuilder.DropColumn(
                name: "Objetivo",
                table: "PoupancasPartilhadas");

            migrationBuilder.DropColumn(
                name: "GrupoId",
                table: "ParceirosConvites");

            migrationBuilder.DropColumn(
                name: "DespesaPartilhadaId",
                table: "DespesasExtras");

            migrationBuilder.AlterColumn<string>(
                name: "UltimaContribuicaoMes",
                table: "PoupancasPartilhadasMembros",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(7)",
                oldMaxLength: 7,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "PoupancaPartilhadaId",
                table: "PoupancasPartilhadasMembros",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128);

            migrationBuilder.AlterColumn<string>(
                name: "MembroUid",
                table: "PoupancasPartilhadasMembros",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128);

            migrationBuilder.AlterColumn<string>(
                name: "Id",
                table: "PoupancasPartilhadasMembros",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128);

            migrationBuilder.AlterColumn<string>(
                name: "Uid",
                table: "GruposMembros",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128);

            migrationBuilder.AlterColumn<string>(
                name: "GrupoId",
                table: "GruposMembros",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128);

            migrationBuilder.AlterColumn<string>(
                name: "Id",
                table: "GruposMembros",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128);

            migrationBuilder.AlterColumn<string>(
                name: "Nome",
                table: "Grupos",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "CriadoPorUid",
                table: "Grupos",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128);

            migrationBuilder.AlterColumn<string>(
                name: "Id",
                table: "Grupos",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128);

            migrationBuilder.CreateTable(
                name: "DivisoesDespesas",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    AtualizadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CriadoEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DespesaExtraId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    DevedorUid = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Estado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    GrupoId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    JaPagueiEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Observacao = table.Column<string>(type: "text", nullable: true),
                    PagadorUid = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    RecebiEm = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ValorParte = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    ValorTotal = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DivisoesDespesas", x => x.Id);
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
                name: "IX_DivisoesDespesas_GrupoId_CriadoEm",
                table: "DivisoesDespesas",
                columns: new[] { "GrupoId", "CriadoEm" });

            migrationBuilder.CreateIndex(
                name: "IX_DivisoesDespesas_PagadorUid_Estado",
                table: "DivisoesDespesas",
                columns: new[] { "PagadorUid", "Estado" });
        }
    }
}
