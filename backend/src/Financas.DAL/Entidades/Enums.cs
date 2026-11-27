namespace Financas.DAL.Entidades;

// Guardados na base de dados como texto ("Anual", "Pago"...), para as tabelas se lerem sem tradução.

/// <summary>Despesas que se repetem: todos os meses ou só num mês de cada ano (ex.: seguro do carro).</summary>
public enum Periodicidade
{
    Mensal,
    Anual,
}

/// <summary>Como se calcula a contribuição de uma poupança: percentagem do salário ou valor fixo.</summary>
public enum TipoContribuicao
{
    Percentagem,
    Valor,
}

/// <summary>
/// O que aconteceu a uma despesa mensal num mês. Sem registo = ainda por pagar. Desfazer um pagamento
/// apaga o registo (não há estado "anulado").
/// </summary>
public enum EstadoPagamento
{
    /// <summary>O valor saiu da conta.</summary>
    Pago,
}

/// <summary>Com que dinheiro foi paga uma despesa extra.</summary>
public enum MeioPagamento
{
    /// <summary>A conta corrente (o Saldo Disponível). As despesas de antes de haver esta opção são todas da conta.</summary>
    Conta,

    /// <summary>O cartão de alimentação: sai do saldo do cartão, não da conta.</summary>
    CartaoAlimentacao,
}

/// <summary>De quanto em quanto tempo se repete um gasto recorrente.</summary>
public enum Frequencia
{
    /// <summary>Todos os dias.</summary>
    Diaria,

    /// <summary>Uma vez por semana, no <see cref="GastoRecorrente.DiaSemana"/>.</summary>
    Semanal,

    /// <summary>Uma vez por mês, no <see cref="GastoRecorrente.DiaMes"/> (ou no último dia, nos meses mais curtos).</summary>
    Mensal,
}

/// <summary>O que aconteceu a um registo (ver <see cref="RegistoAlteracao"/>).</summary>
public enum AcaoAlteracao
{
    Criada,
    Alterada,
    Apagada,
}

/// <summary>Estado de um convite para parceria entre utilizadores.</summary>
public enum EstadoConvite
{
    Pendente,
    Aceite,
    Recusado,
}

