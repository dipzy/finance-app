// Dicionário inglês — importar Excel, folhas e ficheiros (ecrã importar, BlocoFolha, o texto que o
// utilizador vê em utils/lerXlsx, services/importarExcel, services/exportarExcel,
// services/relatorioPdf e utils/lerFicheiro/guardarFicheiro).
// NOTA: o conteúdo dos ficheiros Excel (cabeçalhos, folhas) fica sempre em português,
// para o importador continuar a reconhecer o que a própria app exporta.

export const importar: Record<string, string> = {
  // ---- Nomes dos blocos do livro (o "Falta" e o "Saldo Conta" não estão noutras fatias) ----
  'Saldo Conta': 'Account balance',
  'Falta': 'Unpaid',

  // ---- Ecrã Importar (app/(tabs)/importar.tsx) ----
  'Carrega um mês do teu livro Excel (uma folha) para o histórico da app':
    'Load a month from your Excel workbook (one sheet) into the app\'s history',
  '1. Ficheiro': '1. File',
  'A abrir...': 'Opening…',
  'Escolher ficheiro': 'Choose file',
  'folha': 'sheet',
  'folhas': 'sheets',
  'Um ficheiro .xlsx com uma folha por mês': 'An .xlsx file with one sheet per month',
  '2. Folha': '2. Sheet',
  '3. Mês desta folha': '3. Month of this sheet',
  'Sugerido pelo nome da folha': 'Suggested by the sheet name',
  'Usar {mes} (pelo nome da folha)': 'Use {mes} (from the sheet name)',
  'É o mês atual: as despesas que a folha tem na Falta ficam por pagar; as outras ficam pagas este mês sem sair da conta. Confirma que o saldo da conta na app é o que tens no banco.':
    'This is the current month: the expenses the sheet lists in "Unpaid" stay unpaid; the others are paid this month without leaving the account. Check that the account balance in the app is what you have in the bank.',
  '4. O que está na folha': '4. What is on the sheet',
  'Esta folha não tem os blocos do livro (Lucro, Despesas, Poupança, Despesas do Mês...). Escolhe outra folha.':
    'This sheet does not have the workbook\'s blocks (Income, Expenses, Savings, Monthly expenses...). Choose another sheet.',
  'Ao importar {mes}:': 'When importing {mes}:',
  '• {n} despesas fixas com o pagamento desse mês': '• {n} fixed expenses paid that month',
  '• {n} despesas fixas por pagar (estão na Falta)': '• {n} fixed expenses still unpaid (they are in "Unpaid")',
  '• {n} gastos do dia a dia desse mês': '• {n} day-to-day expenses that month',
  'O saldo da conta de hoje não muda: o dinheiro desses meses já saiu da conta na altura. Importar o mesmo mês outra vez não duplica nada.':
    'Today\'s account balance does not change: the money from those months already left the account back then. Importing the same month again does not duplicate anything.',
  'Só para conferir: este bloco ainda não é importado': 'Just to check: this block is not imported yet',
  ' (à parte, não conta)': ' (apart, does not count)',
  ' (não é importada)': ' (not imported)',
  'Sem linhas com valor': 'No lines with a value',
  'Não encontrado nesta folha': 'Not found in this sheet',
  'Também atualizar (só para o mês mais recente)': 'Also update (latest month only)',
  'O saldo das poupanças passa a ser o do {blocoSaldoPoupanca} desta folha (as que não existem são criadas)':
    'The savings balances become those in the {blocoSaldoPoupanca} block of this sheet (new ones are created)',
  'O que falta pagar nas dívidas passa a ser o do {blocoTotalAPagar} desta folha (as que não existem são criadas e ligadas à despesa fixa com o mesmo nome)':
    'What is left to pay on debts becomes the {blocoTotalAPagar} block of this sheet (new ones are created and linked to the fixed expense with the same name)',
  'Linhas que não foram lidas': 'Lines that could not be read',
  'A importar...': 'Importing…',
  'Importar {mes}': 'Import {mes}',
  '{mes} importado': '{mes} imported',
  'Despesas fixas criadas': 'Fixed expenses created',
  'Pagamentos registados': 'Payments recorded',
  'Gastos do dia a dia registadas': 'Day-to-day expenses recorded',
  'Ficaram por pagar (estão na Falta)': 'Left unpaid (they are in the "Unpaid" block)',
  'Despesas anuais criadas': 'Annual expenses created',
  '{lista} · escolhe o mês de cada uma em Despesas Anuais': '{lista} · choose the month of each one in Annual Expenses',
  'Histórico do mês: {lista}': 'Month history: {lista}',
  'Poupanças atualizadas: {lista}': 'Savings updated: {lista}',
  'Dívidas atualizadas: {lista}': 'Debts updated: {lista}',
  'Ignoradas': 'Ignored',
  'Não foi possível ler esta folha.': 'Could not read this sheet.',
  'O ficheiro não tem folhas.': 'The file has no sheets.',
  'Não foi possível ler o ficheiro.': 'Could not read the file.',
  'Não foi possível importar a folha. Tenta outra vez.': 'Could not import the sheet. Try again.',
  'É o mês atual: as despesas fixas que estão aqui ficam por pagar':
    'It is the current month: the fixed expenses here stay unpaid',
  'Fica no histórico de {mes}': 'Stays in the history of {mes}',
  'Fica no histórico de {mes}: o saldo da conta de hoje não muda':
    'Stays in the history of {mes}: today\'s account balance does not change',
  'Vão para as despesas fixas (as que ainda não existem são criadas) com o pagamento de {mes}':
    'Go to the fixed expenses (the ones that do not exist yet are created) with the payment of {mes}',
  'Vão para as gastos do dia a dia de {mes}': 'Go to the day-to-day expenses of {mes}',
  'Vão para as despesas anuais (as que ainda não existem são criadas; escolhe depois o mês em que se pagam)':
    'Go to the annual expenses (the ones that do not exist yet are created; choose the payment month afterwards)',

  // ---- BlocoFolha (components/BlocoFolha.tsx) ----
  'Nada registado': 'Nothing recorded',
  '  (à parte)': '  (apart)',
  'Paga com o cartão de alimentação': 'Paid with the meal card',

  // ---- Leitura do Excel (utils/lerXlsx.ts) ----
  'Este ficheiro é um .xls antigo. Abre-o no Excel e grava-o como .xlsx.':
    'This file is an old .xls. Open it in Excel and save it as .xlsx.',
  'Não foi possível abrir o ficheiro. Confirma que é um Excel (.xlsx).':
    'Could not open the file. Check that it is an Excel file (.xlsx).',
  'A folha {nomeComAspas} não existe neste ficheiro.': 'The sheet {nomeComAspas} does not exist in this file.',

  // ---- Guardar/partilhar ficheiros (utils/guardarFicheiro*) ----
  'Transferências': 'Downloads',
  'Partilha de ficheiros não disponível neste dispositivo': 'File sharing is not available on this device',
  'Partilhar ficheiro': 'Share file',
  'a pasta escolhida': 'the chosen folder',

  // ---- Avisos da leitura da folha (services/importarExcel.ts) ----
  '{bloco}: valor de {valor} sem nome na linha {linha} (não foi lido)':
    '{bloco}: value of {valor} without a name on line {linha} (not read)',
  '{bloco}: {tituloComAspas} tem uma data fora do mês escolhido (fica sem data)':
    '{bloco}: {tituloComAspas} has a date outside the chosen month (kept without a date)',

  // ---- Exportar Excel e PDF (services/exportarExcel.ts, services/relatorioPdf.ts) ----
  'Exportar para Excel': 'Export to Excel',
  'Exportar PDF': 'Export PDF',
  'Não foi possível exportar o PDF.': 'Could not export the PDF.',
};