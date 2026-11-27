using Financas.DAL.Entidades;
using Microsoft.EntityFrameworkCore;

namespace Financas.DAL;

/// <summary>
/// A sessão com a base de dados (EF Core). É <c>internal</c>: fora da DAL ninguém a vê, só os
/// repositórios e a <see cref="UnitOfWork"/> (assim os controllers e os serviços não conseguem
/// "saltar" a camada de acesso a dados).
/// <para>
/// O modelo é o mesmo para PostgreSQL (produção) e SQLite (testes e desenvolvimento local), por isso
/// evita o que o SQLite não sabe fazer em SQL: ordenar/somar <c>decimal</c> e <c>DateTimeOffset</c>.
/// Essas contas são feitas em memória (cada utilizador tem poucos dados).
/// </para>
/// </summary>
internal sealed class FinancasDbContext(DbContextOptions<FinancasDbContext> opcoes) : DbContext(opcoes)
{
    public DbSet<Utilizador> Utilizadores => Set<Utilizador>();
    public DbSet<DespesaFixa> DespesasFixas => Set<DespesaFixa>();
    public DbSet<PagamentoFixa> PagamentosFixas => Set<PagamentoFixa>();
    public DbSet<DespesaExtra> DespesasExtras => Set<DespesaExtra>();
    public DbSet<Poupanca> Poupancas => Set<Poupanca>();
    public DbSet<ContribuicaoPoupanca> ContribuicoesPoupanca => Set<ContribuicaoPoupanca>();
    public DbSet<JurosPoupanca> JurosPoupancas => Set<JurosPoupanca>();
    public DbSet<Divida> Dividas => Set<Divida>();
    public DbSet<ResumoMes> Meses => Set<ResumoMes>();
    public DbSet<Orcamento> Orcamentos => Set<Orcamento>();
    public DbSet<ObjetivoPoupanca> Objetivos => Set<ObjetivoPoupanca>();
    public DbSet<GastoRecorrente> GastosRecorrentes => Set<GastoRecorrente>();
    public DbSet<RegraCategoria> RegrasCategoria => Set<RegraCategoria>();
    public DbSet<DispositivoPush> DispositivosPush => Set<DispositivoPush>();
    public DbSet<AlertaEnviado> AlertasEnviados => Set<AlertaEnviado>();
    public DbSet<RegistoAlteracao> RegistosAlteracao => Set<RegistoAlteracao>();
    public DbSet<ParceiroConvite> ParceirosConvites => Set<ParceiroConvite>();
    public DbSet<Grupo> Grupos => Set<Grupo>();
    public DbSet<GrupoMembro> GruposMembros => Set<GrupoMembro>();
    public DbSet<PoupancaPartilhada> PoupancasPartilhadas => Set<PoupancaPartilhada>();
    public DbSet<PoupancaPartilhadaMembro> PoupancasPartilhadasMembros => Set<PoupancaPartilhadaMembro>();
    public DbSet<MovimentoPoupancaPartilhada> MovimentosPoupancasPartilhadas => Set<MovimentoPoupancaPartilhada>();
    public DbSet<DespesaPartilhada> DespesasPartilhadas => Set<DespesaPartilhada>();
    public DbSet<ParteDespesaPartilhada> PartesDespesasPartilhadas => Set<ParteDespesaPartilhada>();
    public DbSet<AcertoPartilhado> AcertosPartilhados => Set<AcertoPartilhado>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Uma classe IEntityTypeConfiguration<T> por entidade, na pasta Configuracoes
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(FinancasDbContext).Assembly);
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configuracao)
    {
        // Dinheiro: numeric(12,2) no PostgreSQL (até 9 999 999 999,99 €), sempre ao cêntimo
        configuracao.Properties<decimal>().HavePrecision(12, 2);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        AvancarVersoes();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        AvancarVersoes();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    // Cada linha versionada que muda passa à versão seguinte. O EF continua a usar o valor
    // original (o que foi lido) no WHERE do UPDATE: é isso que deteta alterações concorrentes.
    private void AvancarVersoes()
    {
        foreach (var entrada in ChangeTracker.Entries<IVersionado>())
        {
            if (entrada.State == EntityState.Modified)
            {
                entrada.Entity.Versao++;
            }
        }
    }
}
