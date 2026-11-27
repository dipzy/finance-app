namespace Financas.DAL.Entidades;

/// <summary>
/// Um utilizador (identificado pelo uid do Firebase Auth) e os dados "de topo" que no Firestore
/// estavam no documento <c>users/{uid}</c>: perfil, conta corrente, salário e configurações.
/// <para>
/// É também o "cadeado" de cada utilizador: o saldo da conta vive aqui e a linha tem uma
/// <see cref="Versao"/> (ver <see cref="IVersionado"/>), por isso duas operações que mexem
/// no dinheiro ao mesmo tempo nunca apagam o movimento uma da outra.
/// </para>
/// </summary>
public sealed class Utilizador : IVersionado
{
    /// <summary>uid do Firebase Auth (claim <c>user_id</c>/<c>sub</c> do token).</summary>
    public required string Id { get; init; }

    public string? Email { get; set; }
    public string? Nome { get; set; }
    public DateTimeOffset CriadoEm { get; set; }

    // ---- Conta corrente: o "Saldo Disponível" ----

    public decimal Saldo { get; private set; }
    public DateTimeOffset? SaldoAtualizadoEm { get; private set; }

    // ---- Cartão de alimentação: um saldo à parte (fora do Saldo Disponível) ----
    // Recebe o valor configurado no dia do salário e paga as despesas extras marcadas com o cartão.
    // Vive na mesma linha que o saldo da conta, por isso tem a mesma proteção (Versao)

    public decimal SaldoCartaoAlimentacao { get; private set; }
    public DateTimeOffset? CartaoAtualizadoEm { get; private set; }

    // ---- Configurações (guardadas como JSON: são sempre lidas e escritas inteiras) ----

    /// <summary>Configuração do salário (tab Salário). <c>null</c> = ainda não configurado.</summary>
    public ConfiguracaoSalario? Salario { get; set; }

    /// <summary>Dados da primeira versão da app (salário e percentagens), usados como recurso.</summary>
    public DadosFinanceirosAntigos? Financeiro { get; set; }

    /// <summary>Configuração antiga de PPR/Poupança, convertida em lista de poupanças na 1.ª utilização.</summary>
    public ConfiguracaoPprPoupanca? ConfigPprPoupanca { get; set; }

    // ---- Conversões de dados antigos já feitas (cada uma corre uma vez) ----

    /// <summary>Os pagamentos guardados na própria despesa já passaram a registos por mês.</summary>
    public bool PagamentosPorMesConvertidos { get; set; }

    /// <summary>A configuração antiga de PPR/Poupança já passou a lista de poupanças.</summary>
    public bool PoupancasListaConvertidas { get; set; }

    /// <summary>Quando os dados do Firestore foram copiados para aqui (migração única).</summary>
    public DateTimeOffset? ImportadoDoFirestoreEm { get; set; }

    public int Versao { get; set; }

    /// <summary>
    /// Entrada (valor positivo) ou saída (negativo) de dinheiro na conta, arredondada ao cêntimo:
    /// somas de decimais nunca deixam "lixo" como 45.99999999.
    /// </summary>
    public void MovimentarSaldo(decimal valor, DateTimeOffset agora)
    {
        Saldo = Arredondar(Saldo + valor);
        SaldoAtualizadoEm = agora;
    }

    public void DefinirSaldo(decimal saldo, DateTimeOffset agora)
    {
        Saldo = Arredondar(saldo);
        SaldoAtualizadoEm = agora;
    }

    /// <summary>Entrada (positivo) ou saída (negativo) no saldo do cartão de alimentação.</summary>
    public void MovimentarCartaoAlimentacao(decimal valor, DateTimeOffset agora)
    {
        SaldoCartaoAlimentacao = Arredondar(SaldoCartaoAlimentacao + valor);
        CartaoAtualizadoEm = agora;
    }

    public void DefinirCartaoAlimentacao(decimal saldo, DateTimeOffset agora)
    {
        SaldoCartaoAlimentacao = Arredondar(saldo);
        CartaoAtualizadoEm = agora;
    }

    // O mesmo arredondamento de Calculos.Centimos (a DAL não depende da camada de serviços)
    private static decimal Arredondar(decimal valor)
    {
        var arredondado = Math.Round(valor, 2, MidpointRounding.AwayFromZero);
        return arredondado == 0 ? 0m : arredondado;
    }
}
