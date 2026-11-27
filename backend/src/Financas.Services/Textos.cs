using System.Text.RegularExpressions;

namespace Financas.Services;

/// <summary>
/// Linguagem dos textos devolvidos pela API e dentro do PDF (por omissão português — "pt").
/// O middleware de HTTP da API põe o valor a partir do cabeçalho <c>Accept-Language</c> do pedido;
/// nos testes (sem cabeçalho) fica "pt" e <see cref="T"/> devolve o texto tal como está.
/// <para>
/// <see cref="T"/> traduz a frase final (em português) para inglês: primeiro procura a frase exata no
/// dicionário; depois tenta os padrões com {0}/{1} (as frases compostas no serviço, por exemplo
/// "Já existe um orçamento para {categoria}: altera esse.") e por fim os padrões das mensagens de
/// validação de campos ("campo: obrigatório.").
/// </para>
/// </summary>
public static class Textos
{
    private static readonly AsyncLocal<string?> IdiomaLocal = new();

    /// <summary>A linguagem atual: "pt" (padrão) ou "en".</summary>
    public static string Linguagem
    {
        get => IdiomaLocal.Value ?? "pt";
        set => IdiomaLocal.Value = value;
    }

    /// <summary>Traduz uma frase em português para a linguagem atual; em "pt" devolve-a sem mudar nada.</summary>
    public static string T(string textoPortugues)
    {
        if (Linguagem != "en" || string.IsNullOrEmpty(textoPortugues))
        {
            return textoPortugues;
        }

        return En.TryGetValue(textoPortugues, out var en)
            ? en
            : AplicarPadrao(Padroes, textoPortugues) ?? AplicarPadrao(Validacao, textoPortugues) ?? textoPortugues;
    }

    // As frases exatas (chave em português → tradução em inglês), organizadas por origem.
    private static readonly Dictionary<string, string> En = new()
    {
        // ---- Títulos dos erros HTTP e frases da API ----
        ["Pedido inválido"] = "Invalid request",
        ["Sessão inválida ou expirada"] = "Invalid or expired session",
        ["Sem permissão"] = "Forbidden",
        ["Não encontrado"] = "Not found",
        ["Operação não permitida"] = "Operation not allowed",
        ["Conflito"] = "Conflict",
        ["Formato não suportado"] = "Unsupported format",
        ["Demasiados pedidos"] = "Too many requests",
        ["Erro no servidor"] = "Server error",
        ["Dados inválidos"] = "Invalid data",
        ["O pedido não é válido (formato ou tamanho)."] = "The request is invalid (format or size).",
        ["Ocorreu um erro inesperado no servidor. Tenta novamente."] = "An unexpected error occurred on the server. Try again.",
        ["Indica o mês (?mes=AAAA-MM) ou a despesa (?fixaId=...)."] = "Provide the month (?mes=YYYY-MM) or the expense (?fixaId=...).",

        // ---- Mensagens das exceções de negócio (Financas.Services + DAL) ----
        ["Os dados foram alterados por outro pedido ao mesmo tempo. Tenta outra vez."] =
            "The data was changed by another request at the same time. Try again.",
        ["O fim não pode ser antes do início."] = "The end cannot be before the start.",
        ["O teu perfil tem de ter um email para aceitar o convite."] = "Your profile needs an email to accept the invite.",
        ["O teu perfil tem de ter um email para recusar o convite."] = "Your profile needs an email to decline the invite.",
        ["Convite não encontrado."] = "Invite not found.",
        ["Este convite já foi processado."] = "This invite has already been processed.",
        ["Este convite não é para o teu email."] = "This invite is not for your email.",
        ["Não podes aceitar um convite que enviaste."] = "You cannot accept an invite you sent.",
        ["Orçamento não encontrado."] = "Budget not found.",
        ["Regra não encontrada."] = "Rule not found.",
        ["O token de notificações não é válido."] = "The notification token is not valid.",
        ["Plataforma desconhecida (usa android, ios ou web)."] = "Unknown platform (use android, ios or web).",
        ["hoje"] = "today",
        ["amanhã"] = "tomorrow",
        ["Escreve o texto da regra."] = "Enter the rule text.",
        ["O mês alvo já passou: escolhe este mês ou um dos próximos."] =
            "The target month has passed: pick this month or one of the next ones.",
        ["Configura o salário primeiro."] = "Set up your salary first.",
        ["O recebimento manual do salário não está ligado."] = "Manual salary receipt is not turned on.",
        ["O salário deste mês já foi recebido."] = "This month's salary has already been received.",
        ["Escreve o valor do salário."] = "Enter the salary amount.",
        ["Objetivo não encontrado."] = "Goal not found.",
        ["Poupança não encontrada."] = "Savings not found.",
        ["Este objetivo segue o saldo de uma poupança: desliga a poupança para escrever o valor à mão."] =
            "This goal follows the balance of a savings account: disconnect the savings to enter the amount by hand.",
        ["A data inicial não pode ser depois da final."] = "The start date cannot be after the end date.",
        ["O valor mínimo não pode ser maior que o máximo."] = "The minimum amount cannot be greater than the maximum.",
        ["Despesa não encontrada."] = "Expense not found.",
        ["Ainda não há relatório para um mês futuro."] = "There is no report for a future month yet.",
        ["Esse mês ainda não começou."] = "That month has not started yet.",
        ["Mês inválido (usa AAAA-MM)."] = "Invalid month (use YYYY-MM).",
        ["Não tens acesso a esta parceria."] = "You do not have access to this partnership.",
        ["Poupança partilhada não encontrada."] = "Shared savings not found.",
        ["Dívida não encontrada."] = "Debt not found.",
        ["Este utilizador já tem dados no servidor: a cópia do Firestore só é feita uma vez."] =
            "This user already has data on the server: the Firestore copy is only done once.",
        ["Esta poupança está configurada para contribuição automática."] =
            "This savings account is set to automatic contributions.",
        ["A contribuição mensal tem de ser maior que zero."] = "The monthly contribution must be greater than zero.",
        ["O valor da parte tem de ser maior que zero."] = "The share must be greater than zero.",
        ["A parte não pode ser maior que o valor total da despesa."] =
            "The share cannot be greater than the total expense amount.",
        ["Divisão não encontrada."] = "Split not found.",
        ["Só o devedor pode marcar como já pagou."] = "Only the debtor can mark it as paid.",
        ["Esta divisão já não está em estado 'A Pagar'."] = "This split is no longer in 'To pay' state.",
        ["Só o pagador pode confirmar o recebimento."] = "Only the payer can confirm the receipt.",
        ["Esta divisão tem de estar em 'À espera de confirmação'."] = "This split must be in 'Awaiting confirmation'.",

        // ---- Nomes das categorias (Regras.Categorias, mostrados no PDF e nas mensagens) ----
        ["Supermercado"] = "Groceries",
        ["Restauração"] = "Dining out",
        ["Transportes"] = "Transport",
        ["Carro"] = "Car",
        ["Combustível"] = "Fuel",
        ["Casa"] = "Home",
        ["Telecomunicações"] = "Phone & internet",
        ["Saúde"] = "Health",
        ["Lazer"] = "Leisure",
        ["Compras"] = "Shopping",
        ["Educação"] = "Education",
        ["Viagens"] = "Travel",
        ["Presentes"] = "Gifts",
        ["Outros"] = "Other",

        // ---- Rótulos do relatório PDF ----
        ["Relatório mensal"] = "Monthly report",
        ["Entrou"] = "Incoming",
        ["Despesas fixas"] = "Fixed expenses",
        ["Gastos do dia a dia"] = "Day-to-day spending",
        ["Poupado"] = "Saved",
        ["Livre"] = "Free",
        ["Saldo da conta"] = "Account balance",
        ["Saldo final da conta"] = "Final account balance",
        ["Previsão no fim do mês"] = "Forecast at the end of the month",
        ["Cartão de alimentação"] = "Meal card",
        ["Cartão de alimentação (hoje)"] = "Meal card (today)",
        ["Distribuição do mês"] = "Month breakdown",
        ["Gastos por categoria"] = "Spending by category",
        ["Sem gastos neste mês."] = "No spending this month.",
        ["Poupanças"] = "Savings",
        ["Despesas mensais"] = "Monthly expenses",
        ["Despesas extras"] = "Extra expenses",
        ["Sem despesas fixas."] = "No fixed expenses.",
        ["Despesa"] = "Expense",
        ["Dia"] = "Day",
        ["Valor"] = "Amount",
        ["Estado"] = "Status",
        ["Pago"] = "Paid",
        ["Parcial"] = "Partial",
        ["Por pagar"] = "To pay",
        ["Data"] = "Date",
        ["Categoria"] = "Category",
        ["Pago com"] = "Paid with",
        ["Cartão"] = "Card",
        ["Conta"] = "Account",
        ["Orçamentos"] = "Budgets",
        ["Sem orçamentos."] = "No budgets.",
        ["Limite"] = "Limit",
        ["Gasto"] = "Spent",
        ["Objetivos de poupança"] = "Savings goals",
        ["Sem objetivos."] = "No goals.",
        ["Objetivo"] = "Goal",
        ["Até"] = "Until",
        ["Atual / alvo"] = "Current / target",
        ["Atingido"] = "Reached",
        ["Atrasado"] = "Behind",
        ["No bom caminho"] = "On track",
        ["Sem poupanças."] = "No savings.",
        ["Poupança"] = "Savings",
        ["Saldo"] = "Balance",
        ["Dívidas"] = "Debts",
        ["Sem dívidas por pagar."] = "No unpaid debts.",
        ["Dívida"] = "Debt",
        ["Em falta"] = "Missing",
        ["Total"] = "Total",
        ["Página "] = "Page ",
        [" de "] = " of ",

        // ---- Grupos, despesas partilhadas, acertos e mealheiros ----
        ["Membro"] = "Member",
        ["Grupo não encontrado."] = "Group not found.",
        ["Membro não encontrado."] = "Member not found.",
        ["Mealheiro não encontrado."] = "Savings pot not found.",
        ["Escreve o nome do grupo."] = "Enter the group name.",
        ["Escreve o nome do mealheiro."] = "Enter the savings pot name.",
        ["Escreve um email válido."] = "Enter a valid email.",
        ["Só o admin pode alterar o grupo."] = "Only the admin can edit the group.",
        ["Só o admin pode apagar o grupo."] = "Only the admin can delete the group.",
        ["Só o admin pode remover membros."] = "Only the admin can remove members.",
        ["Só o admin pode alterar os papéis."] = "Only the admin can change roles.",
        ["Papel desconhecido."] = "Unknown role.",
        ["Não podes alterar o teu próprio papel."] = "You cannot change your own role.",
        ["Não podes remover outro admin. Tira-lhe primeiro o admin."] = "You cannot remove another admin. Remove their admin role first.",
        ["Para saíres do grupo usa \"Sair do grupo\"."] = "To leave the group use \"Leave group\".",
        ["És a única pessoa no grupo: apaga o grupo em vez de sair."] = "You are the only person in the group: delete the group instead of leaving.",
        ["És o único admin: torna outra pessoa admin antes de saíres."] = "You are the only admin: make someone else admin before leaving.",
        ["Não te podes convidar a ti próprio."] = "You cannot invite yourself.",
        ["Esta pessoa já é membro do grupo."] = "This person is already a member of the group.",
        ["Já existe um convite pendente para este email."] = "There is already a pending invite for this email.",
        ["Confirma o teu email (no link que o Firebase te enviou) para aceitares convites."] =
            "Confirm your email (with the link we sent you) to accept invites.",
        ["Só quem enviou o convite (ou um admin) o pode cancelar."] = "Only whoever sent the invite (or an admin) can cancel it.",
        ["Ainda há contas por acertar no grupo: acertem as contas antes de o apagar."] =
            "There are still unsettled balances in the group: settle up before deleting it.",
        ["Os mealheiros do grupo ainda têm dinheiro: levanta-o antes de apagar o grupo."] =
            "The group's savings pots still have money: withdraw it before deleting the group.",
        ["O valor tem de ser maior que zero."] = "The amount must be greater than zero.",
        ["Escolhe pelo menos uma pessoa para dividir a despesa."] = "Choose at least one person to split the expense with.",
        ["A mesma pessoa aparece mais do que uma vez na divisão."] = "The same person appears more than once in the split.",
        ["Cada pessoa da divisão tem de ter um valor maior que zero."] = "Each person in the split must have a value greater than zero.",
        ["Modo de divisão desconhecido."] = "Unknown split mode.",
        ["Demasiadas pessoas na divisão."] = "Too many people in the split.",
        ["Só podes dividir com membros do grupo."] = "You can only split with group members.",
        ["Esta despesa já é partilhada."] = "This expense is already shared.",
        ["Só quem pagou pode alterar a despesa."] = "Only whoever paid can edit the expense.",
        ["Só quem pagou (ou um admin do grupo) pode apagar a despesa."] = "Only whoever paid (or a group admin) can delete the expense.",
        ["Esta despesa é a tua parte de uma despesa partilhada: altera-a ou apaga-a no grupo."] =
            "This expense is your share of a shared expense: edit or delete it in the group.",
        ["Quem paga e quem recebe têm de ser pessoas diferentes."] = "The payer and the receiver must be different people.",
        ["Só podes registar acertos que tu pagaste."] = "You can only record payments you made.",
        ["Só um admin do grupo pode levantar dinheiro do mealheiro."] = "Only a group admin can withdraw money from the savings pot.",
        ["Meio de pagamento desconhecido."] = "Unknown payment method.",
        ["Essa pessoa não pertence ao grupo."] = "That person is not in the group.",
        ["Só quem registou o acerto (ou um admin do grupo) o pode apagar."] = "Only whoever recorded the payment (or a group admin) can delete it.",
        ["O mealheiro ainda tem dinheiro: levanta-o antes de o apagar."] = "The savings pot still has money: withdraw it before deleting it.",
        ["O mealheiro não tem tanto dinheiro."] = "The savings pot does not have that much money.",
        ["O valor da contribuição tem de ser maior que zero."] = "The contribution amount must be greater than zero.",
        ["Tens de indicar o dia fixo para contribuição automática em dia fixo."] = "Enter the day of the month for an automatic contribution on a fixed day.",
        ["Tipo de contribuição desconhecido."] = "Unknown contribution type.",

        // ---- Notificações das despesas partilhadas e dos acertos ----
        ["Nova despesa partilhada"] = "New shared expense",
        ["Despesa partilhada alterada"] = "Shared expense changed",
        ["Despesa partilhada apagada"] = "Shared expense deleted",
        ["Confirma que recebeste"] = "Confirm you received it",
        ["Pagamento confirmado"] = "Payment confirmed",
        ["Pagamento apagado"] = "Payment deleted",
        ["Despesa aceite"] = "Expense accepted",
        ["Despesa recusada"] = "Expense declined",
    };

    // Frases compostas no serviço com partes variáveis ({0}/{1}): procura-se a frase final tal como está.
    private static readonly (string Pt, string En)[] Padroes =
    [
        ("Escolhe entre 1 e {0} meses.", "Choose between 1 and {0} months."),
        ("Já existe um orçamento para {0}: altera esse.", "A budget for {0} already exists: edit it instead."),
        ("Fizeste demasiados pedidos seguidos. Espera {0} segundos e tenta outra vez.",
            "You made too many requests in a row. Wait {0} seconds and try again."),
        ("Sem histórico de {0}.", "No history for {0}."),
        ("Já existe uma regra para {0}: altera essa.", "A rule for {0} already exists: edit it instead."),
        ("Para apagar a conta e os dados escreve {0}.", "To delete the account and data type {0}."),
        // Notificações das despesas partilhadas e dos acertos (PartilhadoService)
        ("{0} adicionou \"{1}\" ({2}).", "{0} added \"{1}\" ({2})."),
        ("{0} alterou \"{1}\" ({2}).", "{0} changed \"{1}\" ({2})."),
        ("{0} apagou \"{1}\" ({2}).", "{0} deleted \"{1}\" ({2})."),
        ("{0} adicionou \"{1}\" ({2}). Abre o grupo para aceitar ou recusar.", "{0} added \"{1}\" ({2}). Open the group to accept or decline."),
        ("{0} alterou \"{1}\" ({2}). Abre o grupo para aceitar ou recusar.", "{0} changed \"{1}\" ({2}). Open the group to accept or decline."),
        ("{0} aceitou \"{1}\".", "{0} accepted \"{1}\"."),
        ("{0} recusou \"{1}\". A despesa passa a dividir-se pelos restantes.", "{0} declined \"{1}\". The expense is now split among the others."),
        ("{0} diz que te pagou {1}. Abre o grupo e confirma que recebeste.", "{0} says they paid you {1}. Open the group and confirm you received it."),
        ("Confirma que recebeste {0}", "Confirm you received {0}"),
        ("{0} diz que te pagou {1}. Confirma no grupo que recebeste para o valor entrar na tua conta.", "{0} says they paid you {1}. Confirm in the group that you received it so the amount goes into your account."),
        ("Nova despesa no grupo: deves {0}", "New group expense: you owe {0}"),
        ("{0} adicionou \"{1}\" ao grupo e a tua parte é {2}. Abre o grupo para aceitar ou recusar.", "{0} added \"{1}\" to the group and your share is {2}. Open the group to accept or decline."),
        ("{0} confirmou que recebeu {1}.", "{0} confirmed they received {1}."),
        ("{0} apagou o pagamento de {1}.", "{0} deleted the payment of {1}."),
        // Alertas (AlertasService)
        ("Orçamento de {0} ultrapassado", "{0} budget exceeded"),
        ("Orçamento de {0} a {1}%", "{0} budget at {1}%"),
        ("Gastaste {0} de {1} em {2}: limite ultrapassado.", "You spent {0} of {1} on {2}: limit exceeded."),
        ("Já gastaste {0} de {1} em {2} este mês.", "You have spent {0} of {1} on {2} this month."),
        ("{0} a gastar depressa: {1}% do orçamento", "{0}: spending fast, {1}% of the budget"),
        ("Já gastaste {0} de {1} em {2} ({3}%) e o mês só vai a {4}%. A este ritmo chegas a {5} no fim do mês.",
            "You have spent {0} of {1} on {2} ({3}%) and the month is only {4}% through. At this pace you will reach {5} by the end of the month."),
        ("{0} sai {1} — {2}", "{0} due {1} — {2}"),
        ("A despesa {0} ({1}) vence no dia {2}.", "The expense {0} ({1}) is due on day {2}."),
        ("{0} por pagar desde o dia {1}", "{0} unpaid since day {1}"),
        ("A despesa {0} ({1}) devia ter sido paga no dia {2}.", "The expense {0} ({1}) should have been paid on day {2}."),
        ("Prestação da dívida {0} vence {1}", "Debt installment {0} due {1}"),
        ("A prestação de {0} vence no dia {1}. Em falta: {2}.", "The {0} installment is due on day {1}. Remaining: {2}."),
        ("Prestação da dívida {0} em atraso desde o dia {1}", "Debt installment {0} overdue since day {1}"),
        ("A prestação de {0} devia ter sido paga no dia {1}. Em falta: {2}.", "The {0} installment should have been paid on day {1}. Remaining: {2}."),
        ("Objetivo {0} atrasado", "Goal {0} behind"),
        ("{0} acima do habitual: +{1}%", "{0} above usual: +{1}%"),
        ("Este mês já gastaste {0} em {1}. Nos últimos meses a média foi {2}.", "This month you have already spent {0} on {1}. Over the last months the average was {2}."),
        ("{0} subiu {1}%", "{0} went up {1}%"),
        ("Este mês pagaste {0} em {1}. A média dos últimos meses foi {2}.", "This month you paid {0} for {1}. The average over the last months was {2}."),
        ("Gasto fora do normal: {0}", "Unusual expense: {0}"),
        ("Gastaste {0} em {1} ({2}). O habitual nesta categoria são cerca de {3}.", "You spent {0} on {1} ({2}). The usual amount in this category is around {3}."),
        ("Já tens {0} de {1}: faltam {2} para o objetivo.", "You have {0} of {1}: {2} to go."),
        ("dia {0}", "day {0}"),
        ("O cartão de alimentação só tem {0}: não chega para {1}. Paga com a conta, ou acerta primeiro o saldo do cartão.",
            "The meal card only has {0}: not enough for {1}. Pay from your account instead, or top up the card first."),
        ("Não é possível limpar: {0}. Campos que se podem limpar: {1}.",
            "Cannot clear: {0}. Fields you can clear: {1}."),
        ("Gerado em {0}, {1}", "Generated on {0} at {1}"),
        ("Evolução dos últimos {0} meses", "Last {0} months"),
        ("+ {0} categorias", "+ {0} categories"),
        ("Pago {0}", "Paid {0}"),
        ("{0} ({1} mês)", "{0} ({1} month)"),
        ("{0} ({1} meses)", "{0} ({1} months)"),
        ("A soma das partes ({0}) tem de dar o total ({1}).", "The shares add up to {0} but must equal the total ({1})."),
        ("As percentagens têm de somar 100 (somam {0}).", "Percentages must add up to 100 (they add up to {0})."),
    ];

    // Mensagens de validação dos campos (Financas.Services.Dtos.Validacao), já compostas ("campo: obrigatório.").
    private static readonly (string Pt, string En)[] Validacao =
    [
        ("{0}: obrigatório.", "{0}: required."),
        ("{0}: no máximo {1} caracteres.", "{0}: at most {1} characters."),
        ("{0}: tem de ser entre {1} e {2}.", "{0}: must be between {1} and {2}."),
        ("{0}: o mês tem de estar no formato AAAA-MM (ex.: 2026-10).",
            "{0}: month must be in YYYY-MM format (e.g., 2026-10)."),
        ("{0}: valor fora dos limites.", "{0}: value out of range."),
        ("{0}: o valor não pode ser negativo (máximo 9 999 999 999,99).",
            "{0}: value cannot be negative (max 9 999 999 999.99)."),
        ("{0}: tem de ser maior que zero (máximo 9 999 999 999,99).",
            "{0}: must be greater than zero (max 9 999 999 999.99)."),
        ("{0}: categoria desconhecida (usa uma destas: {1}).",
            "{0}: unknown category (use one of: {1})."),
    ];

    private static string? AplicarPadrao((string Pt, string En)[] padroes, string frase)
    {
        foreach (var (pt, en) in padroes)
        {
            var nomes = new[] { "p0", "p1", "p2", "p3", "p4", "p5" };
            var expressao = "^" + Regex.Escape(pt);
            for (var i = 0; i < nomes.Length; i++)
            {
                // O Regex.Escape só escapa a chaveta de abrir ("{0}" -> "\{0}"); a de fechar fica literal
                expressao = expressao.Replace(@"\{" + i + "}", $"(?<{nomes[i]}>.*)");
            }

            var corresponde = Regex.Match(frase, expressao + "$", RegexOptions.CultureInvariant);
            if (!corresponde.Success)
            {
                continue;
            }

            var resultado = en;
            for (var i = 0; i < nomes.Length; i++)
            {
                if (pt.Contains("{" + i + "}", StringComparison.Ordinal) && corresponde.Groups[nomes[i]].Success)
                {
                    resultado = resultado.Replace("{" + i + "}", corresponde.Groups[nomes[i]].Value, StringComparison.Ordinal);
                }
            }

            return resultado;
        }

        return null;
    }
}