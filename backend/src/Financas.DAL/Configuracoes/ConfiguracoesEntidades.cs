using Financas.DAL.Entidades;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Financas.DAL.Configuracoes;

// Mapeamento de cada entidade para a sua tabela (Fluent API). Todos os dados de um utilizador
// têm chave (UtilizadorId, Id): os ids vindos do Firestore só eram únicos dentro do ramo de cada
// utilizador, e assim cada consulta começa sempre pelo utilizador.

internal static class Tamanhos
{
    public const int Id = 128; // uid do Firebase e ids do Firestore/Guid
    public const int Titulo = 200;
    public const int Mes = 7; // "AAAA-MM"
    public const int Enum = 20;
    public const int TextoCurto = 50; // valores como foram escritos ("1.276,50")
    public const int Categoria = 20; // chave de uma categoria ("supermercado")
    public const int ChaveIdempotencia = 64; // cabeçalho Idempotency-Key (um UUID)
    public const int TextoRegra = 100; // o texto de uma regra de categorização
    public const int TokenPush = 200; // token do Expo (ExponentPushToken[...])
    public const int Idioma = 5; // "pt", "en"
    public const int ChaveAlerta = 200; // "orcamento-excedido:{id}:2026-10"
}

internal sealed class UtilizadorConfiguracao : IEntityTypeConfiguration<Utilizador>
{
    public void Configure(EntityTypeBuilder<Utilizador> b)
    {
        b.ToTable("Utilizadores");
        b.HasKey(u => u.Id);
        b.Property(u => u.Id).HasMaxLength(Tamanhos.Id);
        b.Property(u => u.Email).HasMaxLength(320);
        b.Property(u => u.Nome).HasMaxLength(Tamanhos.Titulo);

        b.Property(u => u.Salario).ComoJson();
        b.Property(u => u.Financeiro).ComoJson();
        b.Property(u => u.ConfigPprPoupanca).ComoJson();

        // Concorrência otimista (ver IVersionado)
        b.Property(u => u.Versao).IsConcurrencyToken();
    }
}

internal sealed class DespesaFixaConfiguracao : IEntityTypeConfiguration<DespesaFixa>
{
    public void Configure(EntityTypeBuilder<DespesaFixa> b)
    {
        b.ToTable("DespesasFixas");
        b.HasKey(d => new { d.UtilizadorId, d.Id });
        b.Property(d => d.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(d => d.Id).HasMaxLength(Tamanhos.Id);
        b.Property(d => d.Titulo).HasMaxLength(Tamanhos.Titulo);
        b.Property(d => d.Categoria).HasMaxLength(Tamanhos.Categoria);
        b.Property(d => d.UnidadeConsumo).HasMaxLength(20);
        b.Property(d => d.Inicio).HasMaxLength(Tamanhos.Mes);
        b.Property(d => d.Fim).HasMaxLength(Tamanhos.Mes);
        b.Property(d => d.Periodicidade).HasConversion<string>().HasMaxLength(Tamanhos.Enum);
        b.Property(d => d.MesDebitado).HasMaxLength(Tamanhos.Mes);
        b.Property(d => d.AnuladoMes).HasMaxLength(Tamanhos.Mes);
        b.Property(d => d.NaoDebitarAutomaticamenteEm).HasMaxLength(Tamanhos.Mes);
        b.Property(d => d.DebitoAutomatico).HasDefaultValue(true);
        b.Property(d => d.Divisao).ComoJson();
        b.Ignore(d => d.EAnual);
        b.Ignore(d => d.TemCamposAntigos);

        b.HasOne<Utilizador>().WithMany().HasForeignKey(d => d.UtilizadorId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class PagamentoFixaConfiguracao : IEntityTypeConfiguration<PagamentoFixa>
{
    public void Configure(EntityTypeBuilder<PagamentoFixa> b)
    {
        b.ToTable("PagamentosFixas");
        b.HasKey(p => new { p.UtilizadorId, p.Id });
        b.Property(p => p.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(p => p.Id).HasMaxLength(Tamanhos.Id + Tamanhos.Mes + 1);
        b.Property(p => p.FixaId).HasMaxLength(Tamanhos.Id);
        b.Property(p => p.Mes).HasMaxLength(Tamanhos.Mes);
        b.Property(p => p.Titulo).HasMaxLength(Tamanhos.Titulo);
        b.Property(p => p.Consumo).HasPrecision(12, 3);
        b.Property(p => p.Estado).HasConversion<string>().HasMaxLength(Tamanhos.Enum);

        // Um pagamento por despesa e por mês, garantido pela própria base de dados
        b.HasIndex(p => new { p.UtilizadorId, p.Mes, p.FixaId }).IsUnique();
        b.HasIndex(p => new { p.UtilizadorId, p.FixaId });

        b.HasOne<Utilizador>().WithMany().HasForeignKey(p => p.UtilizadorId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class DespesaExtraConfiguracao : IEntityTypeConfiguration<DespesaExtra>
{
    public void Configure(EntityTypeBuilder<DespesaExtra> b)
    {
        b.Property(d => d.Litros).HasPrecision(10, 3);
        b.ToTable("DespesasExtras");
        b.HasKey(d => new { d.UtilizadorId, d.Id });
        b.Property(d => d.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(d => d.Id).HasMaxLength(Tamanhos.Id);
        b.Property(d => d.Titulo).HasMaxLength(Tamanhos.Titulo);
        b.Property(d => d.Mes).HasMaxLength(Tamanhos.Mes);
        // Coluna nova e opcional: as despesas que já existiam ficam sem categoria (contam como "outros")
        b.Property(d => d.Categoria).HasMaxLength(Tamanhos.Categoria);
        // Guardado como texto ("Conta", "CartaoAlimentacao"); as que já existiam ficam "Conta" (valor por defeito na migração)
        b.Property(d => d.MeioPagamento).HasConversion<string>().HasMaxLength(Tamanhos.Enum);
        b.Ignore(d => d.PagaComCartao);
        b.HasIndex(d => new { d.UtilizadorId, d.Mes });

        // Gastos recorrentes: cada repetição (gasto, dia) só pode existir uma vez. Sem chave estrangeira
        // (como nos objetivos): apagar o gasto recorrente deixa as despesas que ele gerou
        b.Property(d => d.GastoRecorrenteId).HasMaxLength(Tamanhos.Id);
        b.HasIndex(d => new { d.UtilizadorId, d.GastoRecorrenteId, d.DataOcorrencia }).IsUnique();

        // Idempotency-Key: o mesmo pedido repetido não cria a despesa duas vezes. Os NULL não contam
        // como repetidos (PostgreSQL e SQLite), por isso as despesas sem chave não colidem
        b.Property(d => d.ChaveIdempotencia).HasMaxLength(Tamanhos.ChaveIdempotencia);
        b.HasIndex(d => new { d.UtilizadorId, d.ChaveIdempotencia }).IsUnique();

        // A parte do utilizador numa despesa partilhada (sem chave estrangeira: a despesa partilhada
        // apaga as partes pessoais que criou, de todos os participantes)
        b.Property(d => d.DespesaPartilhadaId).HasMaxLength(Tamanhos.Id);
        b.HasIndex(d => d.DespesaPartilhadaId);

        b.HasOne<Utilizador>().WithMany().HasForeignKey(d => d.UtilizadorId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class GastoRecorrenteConfiguracao : IEntityTypeConfiguration<GastoRecorrente>
{
    public void Configure(EntityTypeBuilder<GastoRecorrente> b)
    {
        b.ToTable("GastosRecorrentes");
        b.HasKey(g => new { g.UtilizadorId, g.Id });
        b.Property(g => g.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(g => g.Id).HasMaxLength(Tamanhos.Id);
        b.Property(g => g.Titulo).HasMaxLength(Tamanhos.Titulo);
        b.Property(g => g.Categoria).HasMaxLength(Tamanhos.Categoria);
        b.Property(g => g.MeioPagamento).HasConversion<string>().HasMaxLength(Tamanhos.Enum);
        b.Property(g => g.Frequencia).HasConversion<string>().HasMaxLength(Tamanhos.Enum);

        b.HasOne<Utilizador>().WithMany().HasForeignKey(g => g.UtilizadorId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class RegistoAlteracaoConfiguracao : IEntityTypeConfiguration<RegistoAlteracao>
{
    public void Configure(EntityTypeBuilder<RegistoAlteracao> b)
    {
        b.ToTable("RegistosAlteracao");
        b.HasKey(r => r.Id);
        b.Property(r => r.Id).HasMaxLength(32);
        b.Property(r => r.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(r => r.Entidade).HasMaxLength(Tamanhos.TextoCurto);
        b.Property(r => r.EntidadeId).HasMaxLength(Tamanhos.Id);
        b.Property(r => r.Descricao).HasMaxLength(Tamanhos.Titulo);
        b.Property(r => r.Acao).HasConversion<string>().HasMaxLength(Tamanhos.Enum);
        b.Property(r => r.Origem).HasMaxLength(Financas.DAL.Auditoria.ContextoAuditoria.TamanhoOrigem);

        // Listar do mais recente para o mais antigo, por utilizador. Sem chave estrangeira: o registo
        // não deve impedir nem acompanhar nada (é só um histórico)
        b.HasIndex(r => new { r.UtilizadorId, r.Quando });
    }
}

internal sealed class ParceiroConviteConfiguracao : IEntityTypeConfiguration<ParceiroConvite>
{
    public void Configure(EntityTypeBuilder<ParceiroConvite> b)
    {
        b.ToTable("ParceirosConvites");
        b.HasKey(c => c.Id);
        b.Property(c => c.Id).HasMaxLength(Tamanhos.Id);
        b.Property(c => c.DeUid).HasMaxLength(Tamanhos.Id);
        b.Property(c => c.Email).HasMaxLength(320);
        b.Property(c => c.Estado).HasConversion<string>().HasMaxLength(Tamanhos.Enum);
        b.HasIndex(c => new { c.Email, c.Estado });
        b.HasIndex(c => new { c.DeUid, c.CriadoEm });
        b.Property(c => c.GrupoId).HasMaxLength(Tamanhos.Id);
        b.HasIndex(c => new { c.GrupoId, c.Estado });
    }
}

internal sealed class PoupancaPartilhadaConfiguracao : IEntityTypeConfiguration<PoupancaPartilhada>
{
    public void Configure(EntityTypeBuilder<PoupancaPartilhada> b)
    {
        b.ToTable("PoupancasPartilhadas");
        b.HasKey(p => p.Id);
        b.Property(p => p.Id).HasMaxLength(Tamanhos.Id);
        b.Property(p => p.GrupoId).HasMaxLength(Tamanhos.Id);
        b.Property(p => p.Nome).HasMaxLength(Tamanhos.Titulo);
        b.Property(p => p.Versao).IsConcurrencyToken();
        b.HasIndex(p => p.GrupoId);
    }
}

internal sealed class GrupoConfiguracao : IEntityTypeConfiguration<Grupo>
{
    public void Configure(EntityTypeBuilder<Grupo> b)
    {
        b.ToTable("Grupos");
        b.HasKey(g => g.Id);
        b.Property(g => g.Id).HasMaxLength(Tamanhos.Id);
        b.Property(g => g.Nome).HasMaxLength(Tamanhos.Titulo);
        b.Property(g => g.CriadoPorUid).HasMaxLength(Tamanhos.Id);
    }
}

internal sealed class GrupoMembroConfiguracao : IEntityTypeConfiguration<GrupoMembro>
{
    public void Configure(EntityTypeBuilder<GrupoMembro> b)
    {
        b.ToTable("GruposMembros");
        b.HasKey(m => m.Id);
        b.Property(m => m.Id).HasMaxLength(Tamanhos.Id);
        b.Property(m => m.GrupoId).HasMaxLength(Tamanhos.Id);
        b.Property(m => m.Uid).HasMaxLength(Tamanhos.Id);
        b.Property(m => m.Versao).IsConcurrencyToken();
        // Uma linha por pessoa e grupo: quem sai fica com SaidaEm e, se voltar, a mesma linha é reativada
        b.HasIndex(m => new { m.GrupoId, m.Uid }).IsUnique();
        b.HasIndex(m => m.Uid);
    }
}

internal sealed class PoupancaPartilhadaMembroConfiguracao : IEntityTypeConfiguration<PoupancaPartilhadaMembro>
{
    public void Configure(EntityTypeBuilder<PoupancaPartilhadaMembro> b)
    {
        b.ToTable("PoupancasPartilhadasMembros");
        b.HasKey(m => m.Id);
        b.Property(m => m.Id).HasMaxLength(Tamanhos.Id);
        b.Property(m => m.PoupancaPartilhadaId).HasMaxLength(Tamanhos.Id);
        b.Property(m => m.MembroUid).HasMaxLength(Tamanhos.Id);
        b.Property(m => m.UltimaContribuicaoMes).HasMaxLength(Tamanhos.Mes);
        b.Property(m => m.Versao).IsConcurrencyToken();
        // Cada membro tem no máximo uma contribuição por mealheiro
        b.HasIndex(m => new { m.PoupancaPartilhadaId, m.MembroUid }).IsUnique();
        b.HasIndex(m => m.MembroUid);
    }
}

internal sealed class MovimentoPoupancaPartilhadaConfiguracao : IEntityTypeConfiguration<MovimentoPoupancaPartilhada>
{
    public void Configure(EntityTypeBuilder<MovimentoPoupancaPartilhada> b)
    {
        b.ToTable("MovimentosPoupancasPartilhadas");
        b.HasKey(m => m.Id);
        b.Property(m => m.Id).HasMaxLength(Tamanhos.Id);
        b.Property(m => m.PoupancaPartilhadaId).HasMaxLength(Tamanhos.Id);
        b.Property(m => m.Uid).HasMaxLength(Tamanhos.Id);
        b.Property(m => m.Mes).HasMaxLength(Tamanhos.Mes);
        b.HasIndex(m => m.PoupancaPartilhadaId);
        b.HasIndex(m => new { m.Uid, m.Mes });
    }
}

internal sealed class DespesaPartilhadaConfiguracao : IEntityTypeConfiguration<DespesaPartilhada>
{
    public void Configure(EntityTypeBuilder<DespesaPartilhada> b)
    {
        b.ToTable("DespesasPartilhadas");
        b.HasKey(d => d.Id);
        b.Property(d => d.Id).HasMaxLength(Tamanhos.Id);
        b.Property(d => d.GrupoId).HasMaxLength(Tamanhos.Id);
        b.Property(d => d.Titulo).HasMaxLength(Tamanhos.Titulo);
        b.Property(d => d.Mes).HasMaxLength(Tamanhos.Mes);
        b.Property(d => d.Categoria).HasMaxLength(Tamanhos.Categoria);
        b.Property(d => d.PagadorUid).HasMaxLength(Tamanhos.Id);
        b.Property(d => d.MeioPagamento).HasConversion<string>().HasMaxLength(Tamanhos.Enum);
        b.Property(d => d.Modo).HasConversion<string>().HasMaxLength(Tamanhos.Enum);
        b.Property(d => d.PagamentoFixaId).HasMaxLength(Tamanhos.Id + Tamanhos.Mes + 1);
        b.Property(d => d.Versao).IsConcurrencyToken();
        b.HasIndex(d => d.GrupoId);
        b.HasIndex(d => d.PagamentoFixaId);
    }
}

internal sealed class ParteDespesaPartilhadaConfiguracao : IEntityTypeConfiguration<ParteDespesaPartilhada>
{
    public void Configure(EntityTypeBuilder<ParteDespesaPartilhada> b)
    {
        b.ToTable("PartesDespesasPartilhadas");
        b.HasKey(p => p.Id);
        b.Property(p => p.Id).HasMaxLength(Tamanhos.Id);
        b.Property(p => p.DespesaPartilhadaId).HasMaxLength(Tamanhos.Id);
        b.Property(p => p.Uid).HasMaxLength(Tamanhos.Id);
        b.Property(p => p.DespesaExtraId).HasMaxLength(Tamanhos.Id);
        b.Property(p => p.Peso).HasPrecision(12, 4);
        b.HasIndex(p => new { p.DespesaPartilhadaId, p.Uid }).IsUnique();
        b.HasIndex(p => p.Uid);
        // Apagar a despesa partilhada apaga as partes
        b.HasOne<DespesaPartilhada>().WithMany().HasForeignKey(p => p.DespesaPartilhadaId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class AcertoPartilhadoConfiguracao : IEntityTypeConfiguration<AcertoPartilhado>
{
    public void Configure(EntityTypeBuilder<AcertoPartilhado> b)
    {
        b.ToTable("AcertosPartilhados");
        b.HasKey(a => a.Id);
        b.Property(a => a.Id).HasMaxLength(Tamanhos.Id);
        b.Property(a => a.GrupoId).HasMaxLength(Tamanhos.Id);
        b.Property(a => a.DeUid).HasMaxLength(Tamanhos.Id);
        b.Property(a => a.ParaUid).HasMaxLength(Tamanhos.Id);
        b.Property(a => a.CriadoPorUid).HasMaxLength(Tamanhos.Id);
        b.HasIndex(a => a.GrupoId);
    }
}

internal sealed class OrcamentoConfiguracao : IEntityTypeConfiguration<Orcamento>
{
    public void Configure(EntityTypeBuilder<Orcamento> b)
    {
        b.ToTable("Orcamentos");
        b.HasKey(o => new { o.UtilizadorId, o.Id });
        b.Property(o => o.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(o => o.Id).HasMaxLength(Tamanhos.Id);
        b.Property(o => o.Categoria).HasMaxLength(Tamanhos.Categoria);

        // Um orçamento por categoria, garantido pela própria base de dados
        b.HasIndex(o => new { o.UtilizadorId, o.Categoria }).IsUnique();

        b.HasOne<Utilizador>().WithMany().HasForeignKey(o => o.UtilizadorId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class ObjetivoPoupancaConfiguracao : IEntityTypeConfiguration<ObjetivoPoupanca>
{
    public void Configure(EntityTypeBuilder<ObjetivoPoupanca> b)
    {
        b.ToTable("ObjetivosPoupanca");
        b.HasKey(o => new { o.UtilizadorId, o.Id });
        b.Property(o => o.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(o => o.Id).HasMaxLength(Tamanhos.Id);
        b.Property(o => o.Nome).HasMaxLength(Tamanhos.Titulo);
        b.Property(o => o.MesAlvo).HasMaxLength(Tamanhos.Mes);
        b.Property(o => o.MesInicio).HasMaxLength(Tamanhos.Mes);
        // Sem chave estrangeira para a poupança: a chave dela é (UtilizadorId, Id) e, ao apagá-la,
        // "SET NULL" também apagaria o UtilizadorId. Quem a apaga desliga os objetivos (PoupancasService)
        b.Property(o => o.PoupancaId).HasMaxLength(Tamanhos.Id);
        b.HasIndex(o => new { o.UtilizadorId, o.PoupancaId });

        b.HasOne<Utilizador>().WithMany().HasForeignKey(o => o.UtilizadorId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class PoupancaConfiguracao : IEntityTypeConfiguration<Poupanca>
{
    public void Configure(EntityTypeBuilder<Poupanca> b)
    {
        b.ToTable("Poupancas");
        b.HasKey(p => new { p.UtilizadorId, p.Id });
        b.Property(p => p.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(p => p.Id).HasMaxLength(Tamanhos.Id);
        b.Property(p => p.Nome).HasMaxLength(Tamanhos.Titulo);
        b.Property(p => p.Tipo).HasConversion<string>().HasMaxLength(Tamanhos.Enum);
        b.Property(p => p.Valor).HasMaxLength(Tamanhos.TextoCurto);
        b.Property(p => p.ContribuicaoAutomatica).HasDefaultValue(true);
        b.Property(p => p.ContarNoPrevisto).HasDefaultValue(true);
        b.Property(p => p.UltimaContribuicaoMes).HasMaxLength(Tamanhos.Mes);
        b.Property(p => p.Inicio).HasMaxLength(Tamanhos.Mes);
        b.Property(p => p.TaxaAnual).HasPrecision(7, 4);
        // Sem valor por omissão no modelo: com ele o EF trataria 0 (sem imposto) como "não escrito" e gravaria 28
        b.Property(p => p.Retencao).HasPrecision(7, 4);
        b.Property(p => p.JurosCreditadosAte).HasMaxLength(Tamanhos.Mes);
        b.Property(p => p.Versao).IsConcurrencyToken();

        b.HasOne<Utilizador>().WithMany().HasForeignKey(p => p.UtilizadorId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class JurosPoupancaConfiguracao : IEntityTypeConfiguration<JurosPoupanca>
{
    public void Configure(EntityTypeBuilder<JurosPoupanca> b)
    {
        b.ToTable("JurosPoupancas");
        // Um por poupança e por mês, garantido pela própria base de dados
        b.HasKey(j => new { j.UtilizadorId, j.PoupancaId, j.Mes });
        b.Property(j => j.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(j => j.PoupancaId).HasMaxLength(Tamanhos.Id);
        b.Property(j => j.Mes).HasMaxLength(Tamanhos.Mes);

        b.HasOne<Poupanca>().WithMany().HasForeignKey(j => new { j.UtilizadorId, j.PoupancaId }).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class ContribuicaoPoupancaConfiguracao : IEntityTypeConfiguration<ContribuicaoPoupanca>
{
    public void Configure(EntityTypeBuilder<ContribuicaoPoupanca> b)
    {
        b.ToTable("ContribuicoesPoupanca");
        // Uma por poupança e por mês, garantido pela própria base de dados
        b.HasKey(c => new { c.UtilizadorId, c.PoupancaId, c.Mes });
        b.Property(c => c.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(c => c.PoupancaId).HasMaxLength(Tamanhos.Id);
        b.Property(c => c.Mes).HasMaxLength(Tamanhos.Mes);

        b.HasOne<Poupanca>().WithMany().HasForeignKey(c => new { c.UtilizadorId, c.PoupancaId }).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class DividaConfiguracao : IEntityTypeConfiguration<Divida>
{
    public void Configure(EntityTypeBuilder<Divida> b)
    {
        b.ToTable("Dividas");
        b.HasKey(d => new { d.UtilizadorId, d.Id });
        b.Property(d => d.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(d => d.Id).HasMaxLength(Tamanhos.Id);
        b.Property(d => d.Titulo).HasMaxLength(Tamanhos.Titulo);
        b.Property(d => d.Desde).HasMaxLength(Tamanhos.Mes);
        b.Property(d => d.FixaId).HasMaxLength(Tamanhos.Id);
        b.Property(d => d.TaxaAnual).HasPrecision(7, 4);
        b.Property(d => d.ComissaoReembolso).HasPrecision(7, 4);
        b.Property(d => d.InicioContrato).HasMaxLength(Tamanhos.Mes);
        b.Property(d => d.NumeroContrato).HasMaxLength(Tamanhos.Id);
        b.Property(d => d.Credor).HasMaxLength(Tamanhos.Titulo);

        b.HasOne<Utilizador>().WithMany().HasForeignKey(d => d.UtilizadorId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class ResumoMesConfiguracao : IEntityTypeConfiguration<ResumoMes>
{
    public void Configure(EntityTypeBuilder<ResumoMes> b)
    {
        b.ToTable("Meses");
        b.HasKey(m => new { m.UtilizadorId, m.Mes });
        b.Property(m => m.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(m => m.Mes).HasMaxLength(Tamanhos.Mes);
        b.Property(m => m.Recebimento).ComoJson();
        b.Property(m => m.Importado).ComoJson();

        b.HasOne<Utilizador>().WithMany().HasForeignKey(m => m.UtilizadorId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class RegraCategoriaConfiguracao : IEntityTypeConfiguration<RegraCategoria>
{
    public void Configure(EntityTypeBuilder<RegraCategoria> b)
    {
        b.ToTable("RegrasCategoria");
        b.HasKey(r => new { r.UtilizadorId, r.Id });
        b.Property(r => r.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(r => r.Id).HasMaxLength(Tamanhos.Id);
        b.Property(r => r.Texto).HasMaxLength(Tamanhos.TextoRegra);
        b.Property(r => r.Categoria).HasMaxLength(Tamanhos.Categoria);

        b.HasOne<Utilizador>().WithMany().HasForeignKey(r => r.UtilizadorId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class DispositivoPushConfiguracao : IEntityTypeConfiguration<DispositivoPush>
{
    public void Configure(EntityTypeBuilder<DispositivoPush> b)
    {
        b.ToTable("DispositivosPush");
        b.HasKey(d => new { d.UtilizadorId, d.Id });
        b.Property(d => d.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(d => d.Id).HasMaxLength(Tamanhos.Id);
        b.Property(d => d.Token).HasMaxLength(Tamanhos.TokenPush);
        b.Property(d => d.Plataforma).HasMaxLength(Tamanhos.Enum);
        b.Property(d => d.Idioma).HasMaxLength(Tamanhos.Idioma);

        // Um token só pertence a um utilizador
        b.HasIndex(d => d.Token).IsUnique();

        b.HasOne<Utilizador>().WithMany().HasForeignKey(d => d.UtilizadorId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class AlertaEnviadoConfiguracao : IEntityTypeConfiguration<AlertaEnviado>
{
    public void Configure(EntityTypeBuilder<AlertaEnviado> b)
    {
        b.ToTable("AlertasEnviados");
        b.HasKey(a => new { a.UtilizadorId, a.Chave });
        b.Property(a => a.UtilizadorId).HasMaxLength(Tamanhos.Id);
        b.Property(a => a.Chave).HasMaxLength(Tamanhos.ChaveAlerta);

        b.HasOne<Utilizador>().WithMany().HasForeignKey(a => a.UtilizadorId).OnDelete(DeleteBehavior.Cascade);
    }
}
