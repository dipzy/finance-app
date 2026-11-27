namespace Financas.DAL.Auditoria;

/// <summary>
/// De onde vem o pedido atual (ex.: "POST /api/despesas-extras"). A DAL não conhece o HTTP: quem
/// implementa isto é a Api (com o <c>IHttpContextAccessor</c>). Sem implementação (testes dos
/// serviços, tarefas fora de um pedido), a origem fica "sistema".
/// </summary>
public interface IOrigemPedido
{
    string? Origem { get; }

    /// <summary>O utilizador que fez o pedido (para as alterações a dados partilhados sem dono, como um mealheiro).</summary>
    string? Utilizador => null;
}

/// <summary>
/// O contexto do registo de alterações dentro de um "scope" (um pedido HTTP): a origem a gravar.
/// <para>
/// As alterações feitas pela app sozinha (ex.: gerar as repetições dos gastos recorrentes enquanto se
/// pede o saldo) não foram pedidas pelo utilizador: o código que as faz marca-as com
/// <c>using (contexto.ComoSistema()) { ... }</c> e ficam com a origem "sistema".
/// </para>
/// </summary>
public sealed class ContextoAuditoria(IOrigemPedido? origemPedido = null)
{
    public const string Sistema = "sistema";
    public const int TamanhoOrigem = 200;

    private int _sistema;
    private int _desligado;

    /// <summary>Quem está a fazer o pedido, se se souber (o uid do token).</summary>
    public string? Utilizador => origemPedido?.Utilizador;

    /// <summary>Dentro de <see cref="SemRegisto"/> não se escrevem linhas de registo.</summary>
    public bool Desligado => _desligado > 0;

    /// <summary>Até ao <c>Dispose</c>, as alterações gravadas não deixam registo (ex.: apagar a conta, que apaga o próprio registo).</summary>
    public IDisposable SemRegisto()
    {
        _desligado++;
        return new FimDesligado(this);
    }

    private sealed class FimDesligado(ContextoAuditoria contexto) : IDisposable
    {
        private bool _feito;

        public void Dispose()
        {
            if (!_feito)
            {
                _feito = true;
                contexto._desligado--;
            }
        }
    }

    /// <summary>A origem a gravar nas alterações feitas agora.</summary>
    public string Origem
    {
        get
        {
            var origem = _sistema > 0 ? Sistema : origemPedido?.Origem ?? Sistema;
            return origem.Length > TamanhoOrigem ? origem[..TamanhoOrigem] : origem;
        }
    }

    /// <summary>Até ao <c>Dispose</c>, as alterações gravadas ficam com a origem "sistema".</summary>
    public IDisposable ComoSistema()
    {
        _sistema++;
        return new Fim(this);
    }

    private sealed class Fim(ContextoAuditoria contexto) : IDisposable
    {
        private bool _feito;

        public void Dispose()
        {
            if (!_feito)
            {
                _feito = true;
                contexto._sistema--;
            }
        }
    }
}
