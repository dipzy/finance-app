// Escreve no resumo do run (GITHUB_STEP_SUMMARY) a cobertura do jest. Só para consulta.
const fs = require('fs');
const ficheiro = 'coverage/coverage-summary.json';
if (!fs.existsSync(ficheiro)) process.exit(0);
const total = JSON.parse(fs.readFileSync(ficheiro, 'utf8')).total;
const linhas = ['## Cobertura da app (jest)', '', '| Métrica | Cobertura | Cobertos / total |', '|---|---|---|'];
for (const [nome, k] of [['Linhas', 'lines'], ['Instruções', 'statements'], ['Funções', 'functions'], ['Ramos', 'branches']]) {
  linhas.push(`| ${nome} | ${total[k].pct}% | ${total[k].covered} / ${total[k].total} |`);
}
const saida = process.env.GITHUB_STEP_SUMMARY;
const texto = linhas.join('\n') + '\n';
if (saida) fs.appendFileSync(saida, texto);
else console.log(texto);
