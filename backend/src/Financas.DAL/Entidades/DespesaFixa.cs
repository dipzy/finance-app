namespace Financas.DAL.Entidades;

/// <summary>
/// Despesa que se repete (mensal ou anual): é o "modelo". O que foi pago em cada mês fica em
/// <see cref="PagamentoFixa"/>, por isso mudar o valor só vale daqui para a frente.
/// </summary>
public sealed class DespesaFixa : IAuditavel
{
    public required string UtilizadorId { get; init; }
    public required string Id { get; init; }

    public required string Titulo { get; set; }
    public decimal Valor { get; set; }

    /// <summary>
    /// O valor muda todos os meses (água, luz, gás...): <see cref="Valor"/> é só uma estimativa (a média das últimas
    /// faturas), não há débito automático e paga-se com o valor real da fatura.
    /// </summary>
    public bool Variavel { get; set; }

    /// <summary>A unidade do contador ("kWh", "m³"), para registar o consumo de cada fatura. Sem unidade: não se regista.</summary>
    public string? UnidadeConsumo { get; set; }

    public string? Categoria { get; set; }

    /// <summary>Dia do mês em que é debitada (1-31). Sem dia: só se paga à mão.</summary>
    public int? DiaDebito { get; set; }

    /// <summary>
    /// Com dia de débito, a despesa é paga sozinha nesse dia (ligado por omissão). Desligado: só se paga à mão, mesmo
    /// com dia (serve de lembrete). Desfazer um pagamento não o desliga: só pausa esse mês (<see cref="NaoDebitarAutomaticamenteEm"/>).
    /// </summary>
    public bool DebitoAutomatico { get; set; } = true;

    /// <summary>Primeiro mês em que conta ("AAAA-MM"). Sem início (despesas antigas): conta sempre.</summary>
    public string? Inicio { get; set; }

    /// <summary>Último mês em que conta (depois de terminada).</summary>
    public string? Fim { get; set; }

    /// <summary>Anual: só conta no mês <see cref="MesAnual"/> de cada ano.</summary>
    public Periodicidade? Periodicidade { get; set; }

    /// <summary>Mês (1-12) em que se paga uma despesa anual. Sem mês: ainda não conta em nenhum.</summary>
    public int? MesAnual { get; set; }

    /// <summary>
    /// Dividida com um grupo: quem a paga (o dono) paga <see cref="ValorTotal"/> de cada vez e fica com
    /// uma despesa partilhada; <see cref="Valor"/> passa a ser só a parte dele (é o que conta nos totais).
    /// Sem divisão: <c>null</c>.
    /// </summary>
    public DivisaoDespesaFixa? Divisao { get; set; }

    /// <summary>O que o dono paga de cada vez quando há <see cref="Divisao"/> (a conta toda, não só a parte dele).</summary>
    public decimal? ValorTotal { get; set; }

    public DateTimeOffset CriadoEm { get; set; }

    /// <summary>
    /// Mês ("AAAA-MM") em que o pagamento foi desfeito à mão: nesse mês o débito automático não a volta
    /// a pagar (fica "por pagar" e só se paga à mão). Não aparece na app.
    /// </summary>
    public string? NaoDebitarAutomaticamenteEm { get; set; }

    // ---- Campos da versão anterior (convertidos em PagamentoFixa na primeira utilização) ----

    public bool? Debitado { get; set; }
    public string? MesDebitado { get; set; }
    public string? AnuladoMes { get; set; }

    public bool EAnual => Periodicidade == Entidades.Periodicidade.Anual;

    /// <summary>Dividida com um grupo (cada pagamento passa a ser uma despesa partilhada).</summary>
    public bool EPartilhada => Divisao is not null;

    /// <summary>O que sai da conta em cada pagamento: o total se for partilhada, senão o valor.</summary>
    public decimal ValorAPagar => ValorTotal ?? Valor;

    public bool TemCamposAntigos => Debitado is not null || MesDebitado is not null || AnuladoMes is not null;

    public void LimparCamposAntigos()
    {
        Debitado = null;
        MesDebitado = null;
        AnuladoMes = null;
    }

    string IAuditavel.Descricao => Titulo;
}

/// <summary>Com quem e como se divide uma <see cref="DespesaFixa"/> (guardado como JSON na própria despesa).</summary>
public sealed class DivisaoDespesaFixa
{
    public required string GrupoId { get; init; }
    public ModoDivisao Modo { get; init; } = ModoDivisao.Igual;
    public required IReadOnlyList<ParticipanteDivisao> Participantes { get; init; }
}

/// <summary>Uma pessoa da divisão. O peso é o valor, a percentagem ou o nº de partes (null em partes iguais).</summary>
public sealed record ParticipanteDivisao(string Uid, decimal? Peso);
