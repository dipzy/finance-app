// Dicionário inglês — utilitários e serviços (AuthContext, mensagens da base de dados e da
// fila offline, alterações, atalhos, migrações, firebaseAuth; nomes de categorias e meses e
// outras frases destes módulos).

export const utilitarios: Record<string, string> = {
  // ---- AuthContext (mensagens mostradas no ecrã de login) ----
  'Email ou password incorretos': 'Incorrect email or password',
  'Email inválido': 'Invalid email',
  'Já existe uma conta com este email': 'An account with this email already exists',
  'A password tem de ter pelo menos 6 caracteres': 'The password must have at least 6 characters',
  'Sem ligação à internet': 'No internet connection',
  'Demasiadas tentativas. Tenta novamente daqui a pouco': 'Too many attempts. Try again in a moment',
  'O login por email/password não está ativo no Firebase (Authentication > Método de login)':
    'Email/password login is not enabled in Firebase (Authentication > Sign-in method)',
  'A criação de contas está desativada no Firebase (Authentication > Configurações > Ações do usuário)':
    'Account creation is disabled in Firebase (Authentication > Settings > User actions)',
  'Ocorreu um erro{codigo}. Tenta novamente.': 'Something went wrong{codigo}. Try again.',
  'Não foi possível preparar os teus dados': 'Your data could not be prepared',
  'Os teus dados ainda não foram copiados para o novo servidor ({mensagem}). Volta a tentar no próximo login.':
    'Your data has not been copied to the new server yet ({mensagem}). Try again on your next login.',

  // ---- Atalhos do ícone da app (services/atalhos.ts) ----
  'Novo gasto': 'New expense',
  'Gastos do dia a dia': 'Day-to-day spending',
  'Resumo do mês': 'Monthly summary',

  // ---- Pesquisa: intervalos rápidos (services/pesquisa.ts) ----
  'Este mês': 'This month',
  '3 meses': '3 months',
  'Este ano': 'This year',
  'Tudo': 'All',

  // ---- Histórico de alterações (services/alteracoes.ts) ----
  'Criaste': 'You created',
  'Alteraste': 'You changed',
  'Apagaste': 'You deleted',
  'Criado': 'Created',
  'Alterado': 'Changed',
  'Apagado': 'Deleted',
  '{acao} automaticamente: {entidade}{titulo}': '{acao} automatically: {entidade}{titulo}',
  '{verbo} {artigo} {entidade}{titulo}': '{verbo} {entidade}{titulo}',
  'despesa fixa': 'fixed expense',
  'gasto': 'expense',
  'pagamento': 'payment',
  'poupança': 'savings',
  'dívida': 'debt',
  'orçamento': 'budget',
  'objetivo': 'goal',
  'gasto que se repete': 'recurring expense',
  'Título': 'Title',
  'Nome': 'Name',
  'Valor': 'Amount',
  'Data': 'Date',
  'Categoria': 'Category',
  'Pago com': 'Paid with',
  'Dia do débito': 'Debit day',
  'Limite': 'Limit',
  'Saldo': 'Balance',
  'Ativo': 'Active',
  'Fim': 'End',
  '{nome}: {valor}': '{nome}: {valor}',
  '{nome}: {de} → {para}': '{nome}: {de} → {para}',
  'sim': 'yes',
  'não': 'no',
  'conta': 'bank account',
  'cartão de alimentação': 'meal card',
};