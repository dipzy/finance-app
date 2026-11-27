// Dicionário inglês — importar o extrato da conta bancária (ecrã extrato, components/extrato/* e
// services/extratoBancario).

export const extrato: Record<string, string> = {
  // ---- Ecrã ----
  'Importar extrato': 'Import statement',
  'Importar extrato do banco': 'Import bank statement',
  'Traz os movimentos da tua conta (CSV ou OFX) como despesas, já com categoria.': 'Brings your account transactions (CSV or OFX) in as expenses, already categorised.',
  'Extrato do banco': 'Bank statement',
  'Escolhe o extrato da tua conta em CSV ou OFX (no homebanking: Movimentos → Exportar). As saídas passam a despesas, já com categoria, sem mexer no saldo da app.':
    "Choose your account statement as CSV or OFX (in online banking: Transactions → Export). Outgoing payments become expenses, already categorised, without changing the app's balance.",
  'Escolher ficheiro': 'Choose file',
  'Escolher outro ficheiro': 'Choose another file',
  'A ler…': 'Reading…',
  'Colunas do ficheiro': 'File columns',
  'A app reconheceu as colunas. Se os movimentos não estiverem certos, muda-as.': "The app recognised the columns. If the transactions aren't right, change them.",
  'Mudar as colunas': 'Change columns',
  'Não consegui adivinhar as colunas: escolhe abaixo qual é a data, a descrição e o valor.':
    "I couldn't work out the columns: choose below which one is the date, the description and the amount.",
  '{n} saídas': '{n} outgoing payments',
  'Não há saídas neste ficheiro (só entradas).': 'There are no outgoing payments in this file (only incoming).',
  '{ficheiro} · de {de} a {ate}': '{ficheiro} · from {de} to {ate}',
  '{n} entradas ignoradas': '{n} incoming ignored',
  '{n} já importadas (ficam de fora)': '{n} already imported (left out)',
  '{n} parecem repetir despesas que já registaste: vêm desmarcadas, vê se são mesmo repetidas.':
    '{n} look like expenses you already recorded: they come unticked, check whether they are really repeats.',
  'Marcar todas': 'Select all',
  'Desmarcar todas': 'Deselect all',
  'Mostrar mais ({n})': 'Show more ({n})',
  '{n} despesas · {total}': '{n} expenses · {total}',
  'Importar {n} despesas': 'Import {n} expenses',
  'A importar…': 'Importing…',
  'Importado': 'Imported',
  'Não entrou nada de novo: estes movimentos já estavam importados.': 'Nothing new came in: these transactions were already imported.',
  '{n} despesas importadas ({total}) em {meses}.': '{n} expenses imported ({total}) in {meses}.',
  '{n} já existiam e ficaram de fora.': '{n} already existed and were left out.',
  'Ver as despesas': 'View the expenses',
  'Não foi possível importar o extrato.': 'Could not import the statement.',

  // ---- Linha de um movimento ----
  'Já importado': 'Already imported',
  'Parece repetir «{titulo}», que já registaste.': 'Looks like a repeat of "{titulo}", which you already recorded.',
  'Mudar a categoria: {nome}': 'Change category: {nome}',

  // ---- Mapeamento de colunas ----
  'Coluna {n}': 'Column {n}',
  'Coluna da data': 'Date column',
  'Coluna da descrição': 'Description column',
  'O valor vem em': 'The amount comes in',
  'Uma coluna (com sinal)': 'One column (signed)',
  'Débito e crédito': 'Debit and credit',
  'Coluna do débito (o que saiu)': 'Debit column (money out)',
  'Coluna do crédito (o que entrou)': 'Credit column (money in)',
  'Coluna do valor': 'Amount column',
  'Primeira linha: {data} · {descricao} · {valor}': 'First row: {data} · {descricao} · {valor}',

  // ---- Leitura do ficheiro ----
  'Movimento': 'Transaction',
  'Não encontrei movimentos neste ficheiro. Confirma que é o extrato da conta em CSV ou OFX.':
    "I didn't find any transactions in this file. Check that it is the account statement as CSV or OFX.",
  'Não encontrei movimentos neste ficheiro OFX.': "I didn't find any transactions in this OFX file.",
  '{n} linha(s) sem data válida ficaram de fora.': '{n} row(s) without a valid date were left out.',
  '{n} linha(s) sem valor (ou com valor 0) ficaram de fora.': '{n} row(s) without an amount (or with amount 0) were left out.',
  '{n} movimento(s) sem data ou valor ficaram de fora.': '{n} transaction(s) without a date or amount were left out.',
};
