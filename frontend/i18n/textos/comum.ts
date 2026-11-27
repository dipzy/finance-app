// Dicionário inglês — palavras e frases comuns a vários ecrãs. Cada área tem o seu ficheiro em
// i18n/textos/ (navegacao, painel, despesas, poupancas, importar, definicoes, utilitarios).
//
// A CHAVE é o texto exato em português que fica no código (os ecrãs chamam t('texto')).
// O VALOR é a tradução para inglês. Não se removem chaves: o teste __tests__/i18nDicionario.test.ts
// garante que cada t('...') do código existe aqui e que não há chaves repetidas com traduções
// diferentes entre ficheiros.

export const comum: Record<string, string> = {
  // ---- Navegação e cabeçalho (Header, menu lateral) ----
  'Início': 'Home',
  'Definições': 'Settings',
  'Pesquisar': 'Search',
  'Sair': 'Log out',
  'Abrir menu': 'Open menu',
  'Disponível': 'Available',
  'Meu Plano Financeiro': 'My Financial Plan',

  // ---- Alertas e botões ----
  'Erro': 'Error',
  'Aviso': 'Warning',
  'Confirmar': 'Confirm',
  'Cancelar': 'Cancel',
  'Guardar': 'Save',
  'Continuar': 'Continue',
  'Fechar': 'Close',
  'Apagar': 'Delete',

  // ---- Estado e carregamentos ----
  'a carregar': 'loading',
  'A carregar…': 'Loading…',
  'A guardar…': 'Saving…',
  'Sem ligação à internet.': 'No internet connection.',
  'Sem ligação': 'No connection',

  // ---- Mensagens do cliente da API (services/api.ts) ----
  'A sessão terminou. Faz login outra vez.': 'Your session ended. Please log in again.',
  'A sessão expirou. Faz login outra vez.': 'Your session expired. Please log in again.',
  'Sem permissão para esta operação.': 'You are not allowed to do this.',
  'Não encontrado.': 'Not found.',
  'Os dados mudaram entretanto. Tenta outra vez.': 'The data changed in the meantime. Try again.',
  'Erro no servidor. Tenta novamente daqui a pouco.': 'Server error. Try again in a moment.',
  'Erro inesperado ({estado}).': 'Unexpected error ({estado}).',
  'O servidor demorou demasiado a responder. Tenta outra vez.': 'The server took too long to reply. Try again.',
  'Sem ligação ao servidor. Verifica a internet e tenta outra vez.': 'No connection to the server. Check your internet and try again.',

  // ---- Meses (services/calculos.ts -> nomeMes) ----
  'Janeiro': 'January',
  'Fevereiro': 'February',
  'Março': 'March',
  'Abril': 'April',
  'Maio': 'May',
  'Junho': 'June',
  'Julho': 'July',
  'Agosto': 'August',
  'Setembro': 'September',
  'Outubro': 'October',
  'Novembro': 'November',
  'Dezembro': 'December',

  // ---- Dias da semana (despesas recorrentes, calendário) ----
  'segunda': 'Monday',
  'terça': 'Tuesday',
  'quarta': 'Wednesday',
  'quinta': 'Thursday',
  'sexta': 'Friday',
  'sábado': 'Saturday',
  'domingo': 'Sunday',
  'Segunda-feira': 'Monday',
  'Terça-feira': 'Tuesday',
  'Quarta-feira': 'Wednesday',
  'Quinta-feira': 'Thursday',
  'Sexta-feira': 'Friday',
  'Sábado': 'Saturday',
  'Domingo': 'Sunday',

  // ---- Categorias (utils/categorias.ts -> nomeCategoria) ----
  'Supermercado': 'Groceries',
  'Restauração': 'Restaurants',
  'Transportes': 'Transport',
  'Carro': 'Car',
  'Combustível': 'Fuel',
  'Casa': 'Home',
  'Telecomunicações': 'Phone & internet',
  'Saúde': 'Health',
  'Lazer': 'Leisure',
  'Compras': 'Shopping',
  'Educação': 'Education',
  'Viagens': 'Travel',
  'Presentes': 'Gifts',
  'Outros': 'Other',
};