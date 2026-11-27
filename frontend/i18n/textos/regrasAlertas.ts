// Dicionário inglês — regras de categorização, alertas e push do servidor, apagar a conta e o histórico
// de alterações dos grupos (ecrãs regras-categoria e alertas, componentes de alertas, ApagarContaModal,
// services/regras, services/alteracoes, services/conta, utils/alertas e as novas zonas das Definições).

export const regrasAlertas: Record<string, string> = {
  // ---- Regras de categorização ----
  'Regras de categorização': 'Categorisation rules',
  'Quando o título de um gasto contém o texto de uma regra (sem maiúsculas nem acentos), a categoria é a da regra. Vale também ao importar do Excel.':
    'When an expense title contains a rule\'s text (ignoring case and accents), the category is the rule\'s. It also applies when importing from Excel.',
  'As minhas regras': 'My rules',
  'Não foi possível carregar as regras.': 'Could not load the rules.',
  'Ainda não tens regras. Cria uma ou copia das regras padrão.': 'You have no rules yet. Create one or copy from the default rules.',
  'Nova regra': 'New rule',
  'Editar regra': 'Edit rule',
  'Editar a regra {texto}': 'Edit the rule {texto}',
  'Apagar a regra {texto}': 'Delete the rule {texto}',
  'Regra {texto} ativa': 'Rule {texto} active',
  'Regra ativa': 'Rule active',
  'Apagar regra': 'Delete rule',
  'Apagar a regra "{texto}"? Os gastos já registados não mudam de categoria.': 'Delete the rule "{texto}"? Expenses already recorded keep their category.',
  '· prioridade {n}': '· priority {n}',
  'Experimentar': 'Try it',
  'Título de um gasto': 'Expense title',
  'Ex: Continente Matosinhos': 'E.g. Continente Matosinhos',
  'Ver categoria': 'See category',
  'Não foi possível experimentar agora.': 'Could not try it right now.',
  'Categoria: {categoria}': 'Category: {categoria}',
  'Pelo histórico deste título': 'From the history of this title',
  'Por uma palavra-chave': 'From a keyword',
  'Sem regra: fica em Outros': 'No rule: it stays in Other',
  'Regras padrão ({n})': 'Default rules ({n})',
  'Vêm com a app e não se alteram. As tuas regras ganham-lhes. Copia uma para a poderes mudar.':
    'They come with the app and cannot be changed. Your rules win over them. Copy one to be able to change it.',
  'Copiar para as minhas': 'Copy to mine',
  'Copiar a regra {texto} para as minhas': 'Copy the rule {texto} to mine',
  'Já tens': 'You have it',
  'Sem regras padrão para mostrar.': 'No default rules to show.',
  'Se o título contiver': 'If the title contains',
  'Ex: Continente': 'E.g. Continente',
  'Prioridade (opcional)': 'Priority (optional)',
  'Se duas regras servirem, ganha a de número maior': 'If two rules match, the higher number wins',
  'Se duas regras servirem, ganha a de prioridade maior (de -1000 a 1000).': 'If two rules match, the higher priority wins (from -1000 to 1000).',
  'Escreve o texto a procurar (ex.: Continente).': 'Type the text to look for (e.g. Continente).',
  'Escolhe a categoria da regra.': 'Choose the rule\'s category.',
  'A prioridade é um número inteiro entre -1000 e 1000.': 'The priority is a whole number between -1000 and 1000.',
  'Já tens uma regra com este texto.': 'You already have a rule with this text.',
  'Não foi possível guardar a regra.': 'Could not save the rule.',
  'Regra: {texto}': 'Rule: {texto}',
  'Escolhe a categoria dos gastos pelo título (ex.: Continente → Supermercado). Também vale ao importar.':
    'Pick the expense category from the title (e.g. Continente → Groceries). Also applies when importing.',
  'Ver regras': 'See rules',

  // ---- Alertas ----
  'Alertas': 'Alerts',
  'Ver todos ({n})': 'See all ({n})',
  'Ver alertas': 'See alerts',
  '{n} alertas por ver': '{n} alerts to see',
  'Abre o ecrã deste alerta': 'Opens this alert\'s screen',
  'Crítico': 'Critical',
  'Informação': 'Information',
  'Orçamentos perto do limite, pagamentos a vencer ou em atraso e objetivos atrasados. Toca num alerta para o resolver.':
    'Budgets near the limit, payments due or overdue and goals behind schedule. Tap an alert to deal with it.',
  'Não foi possível atualizar os alertas.': 'Could not update the alerts.',
  'Sem alertas por agora. Está tudo em ordem.': 'No alerts for now. Everything is in order.',
  'O que pede atenção: orçamentos, pagamentos a vencer ou em atraso e objetivos atrasados.':
    'What needs attention: budgets, payments due or overdue and goals behind schedule.',

  // ---- Avisos (push) do servidor ----
  'Avisos do servidor': 'Server notifications',
  'Orçamentos perto do limite, pagamentos a vencer ou em atraso e objetivos atrasados. Substituem os lembretes das despesas deste telemóvel.':
    'Budgets near the limit, payments due or overdue and goals behind schedule. They replace this phone\'s expense reminders.',
  'O servidor das Finanças pode avisar-te de orçamentos perto do limite, pagamentos a vencer ou em atraso e objetivos atrasados. Para isso a app envia ao servidor um identificador deste telemóvel (não envia dados pessoais). Podes desligar quando quiseres.':
    'The Finanças server can notify you about budgets near the limit, payments due or overdue and goals behind schedule. For that, the app sends the server an identifier of this phone (no personal data). You can turn it off whenever you like.',

  // ---- Apagar a conta ----
  'Zona de perigo': 'Danger zone',
  'Apaga para sempre todos os teus dados e a tua conta. Não se pode desfazer.': 'Permanently deletes all your data and your account. This cannot be undone.',
  'Apagar todos os dados e a conta': 'Delete all data and the account',
  'Isto não se pode desfazer. Vais perder para sempre:': 'This cannot be undone. You will permanently lose:',
  'Todos os gastos, despesas fixas e anuais, dívidas, poupanças, orçamentos e objetivos':
    'All expenses, fixed and annual bills, debts, savings, budgets and goals',
  'O saldo, o salário, o cartão de alimentação e o histórico de alterações': 'The balance, salary, meal card and change history',
  'As regras de categorização e os dispositivos que recebem avisos': 'The categorisation rules and the devices that receive notifications',
  'A tua conta de acesso (email e password)': 'Your sign-in account (email and password)',
  'Nos grupos com mais pessoas, o que já foi partilhado com elas fica (a tua parte passa a "Utilizador removido"). Se não queres perder os teus dados, exporta-os para Excel antes.':
    'In groups with more people, what was already shared with them stays (your part becomes "Removed user"). If you do not want to lose your data, export it to Excel first.',
  'Escreve {palavra} para confirmar': 'Type {palavra} to confirm',
  'Apagar tudo': 'Delete everything',
  'A apagar…': 'Deleting…',
  'Última confirmação': 'Final confirmation',
  'Vais apagar para sempre todos os teus dados e a tua conta. Isto não se pode desfazer.':
    'You are about to permanently delete all your data and your account. This cannot be undone.',
  'Não foi possível apagar os dados.': 'Could not delete the data.',
  'Não foi apagado nada. Tenta outra vez.': 'Nothing was deleted. Try again.',
  'Entra outra vez primeiro': 'Sign in again first',
  'Por segurança, só se apaga a conta logo depois de entrar. Ainda não foi apagado nada: sai, entra outra vez com a tua password e repete "Apagar todos os dados e a conta".':
    'For security, the account can only be deleted right after signing in. Nothing has been deleted yet: sign out, sign in again with your password and repeat "Delete all data and the account".',
  'Sair agora': 'Sign out now',
  'Dados apagados': 'Data deleted',
  'Os teus dados foram apagados, mas o Firebase pediu um login mais recente para apagar o acesso.':
    'Your data was deleted, but Firebase asked for a more recent sign-in to delete the access.',
  'Os teus dados foram apagados, mas não foi possível apagar o acesso (email e password).':
    'Your data was deleted, but the access (email and password) could not be deleted.',
  'Entra outra vez com a tua password e escolhe "Apagar todos os dados e a conta" para remover o acesso de vez.':
    'Sign in again with your password and choose "Delete all data and the account" to remove the access for good.',
  'Conta apagada': 'Account deleted',
  'Os teus dados e a tua conta foram apagados. Obrigado por teres usado as Finanças.':
    'Your data and your account were deleted. Thank you for using Finanças.',

  // ---- Histórico de alterações (grupos e partilha) ----
  'Filtrar: {tipo}': 'Filter: {tipo}',
  'Ainda não há alterações deste tipo.': 'No changes of this type yet.',
  'Gastos': 'Expenses',
  'Despesas partilhadas': 'Shared expenses',
  'Utilizador removido': 'Removed user',
  'Outro utilizador': 'Another user',
  'administrador': 'admin',
  'membro': 'member',
  'grupo': 'group',
  'participação num grupo': 'group membership',
  'despesa partilhada': 'shared expense',
  'acerto': 'settlement',
  'poupança partilhada': 'shared savings',
  'contribuição na poupança partilhada': 'contribution to shared savings',
  'movimento da poupança partilhada': 'shared savings movement',
  'regra de categorização': 'categorisation rule',
  'Texto': 'Text',
  'Prioridade': 'Priority',
  'Ativa': 'Active',
  'Data do objetivo': 'Goal date',
  'Papel': 'Role',
  'Entrada em': 'Joined on',
  'Saída em': 'Left on',
  'Divisão': 'Split',
  'Automático': 'Automatic',
  'Quem': 'Who',
  'Pago por': 'Paid by',
  'De': 'From',
  'Para': 'To',
  'Criado por': 'Created by',
};
