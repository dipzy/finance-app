import { lerData } from '../utils/formatos';
import { api, parte } from './api';
import type { DadosFolhaMes, LinhaFolha, Mes } from './tipos';

// A "folha do mês" com os blocos do livro Excel do utilizador (Lucro, Despesas, Poupança,
// Despesas do Mês, Anual, Saldo Conta, Falta, Saldo Poupança, Total a pagar).
// Os dados de cada mês e a gravação de uma folha importada são feitos pela API (pasta backend/:
// FolhaMesService); a leitura e a escrita do ficheiro .xlsx continuam na app
// (services/importarExcel.ts e services/exportarExcel.ts).

export { normalizarTitulo } from '../utils/formatos';

// Meses com dados (despesas mensais ativas, pagamentos ou extras), do mais antigo até ao atual
export function mesesComDados(_userId: string): Promise<Mes[]> {
  return api.get<Mes[]>('/api/folha/meses');
}

// Os dados de um mês, organizados como uma folha do livro Excel.
// O mês atual vem dos dados vivos (conta, poupanças, dívidas); os meses passados vêm do histórico
// guardado (salário recebido, saldo no fim do mês, blocos importados do Excel)
export function obterDadosFolhaMes(_userId: string, mes: Mes): Promise<DadosFolhaMes> {
  return api.get<DadosFolhaMes>(`/api/folha/${parte(mes)}`);
}

export interface OpcoesImportacao {
  // "Saldo Poupança" da folha -> saldo das poupanças com o mesmo nome (cria as que faltam, sem contribuição)
  atualizarSaldosPoupancas?: boolean;
  // "Total a pagar" da folha -> dívidas com o mesmo nome (cria as que faltam, ligadas à despesa
  // mensal com o mesmo nome, a descontar as prestações a partir do mês seguinte)
  atualizarDividas?: boolean;
}

export interface ResumoImportacao {
  mes: Mes;
  despesasCriadas: string[]; // despesas mensais novas (não havia nenhuma com o mesmo nome)
  pagamentosRegistados: number;
  extrasRegistadas: number;
  anuaisCriadas: string[]; // despesas anuais novas (o mês de pagamento fica por escolher)
  historico: string[]; // blocos guardados como histórico do mês (Lucro, Poupança, Saldo Conta...)
  poupancasAtualizadas: string[];
  dividasAtualizadas: string[];
  // Mês atual: despesas que estão na "Falta" da folha e por isso ficam por pagar
  porPagar: string[];
  // Linhas que já existiam (importar o mesmo mês duas vezes não duplica nada)
  ignoradas: string[];
}

// Só datas que existem mesmo (uma célula "31/02" do Excel não pode estragar a importação toda)
function dataValida(data: string | undefined): string | undefined {
  const partes = data ? lerData(data) : null;
  if (!partes) return undefined;
  const d = new Date(partes.ano, partes.mes - 1, partes.dia);
  return d.getFullYear() === partes.ano && d.getMonth() === partes.mes - 1 && d.getDate() === partes.dia ? data : undefined;
}

const limparLinhas = (linhas: LinhaFolha[]): LinhaFolha[] => linhas.map((l) => ({ ...l, data: dataValida(l.data) }));

// Grava uma folha lida do Excel nos dados da app, como histórico desse mês (numa só transação, na API):
//   - "Despesas": despesa mensal com o mesmo nome (ou nova, a começar nesse mês) + pagamento desse mês
//   - "Despesas do Mês": despesas extras desse mês
//   - "Anual": despesas anuais com o mesmo nome (ou novas, com o mês de pagamento por escolher)
//   - "Lucro", "Poupança", "Saldo Conta", "Saldo Poupança", "Total a pagar": histórico do mês
//     (e, se pedido, saldos das poupanças e dívidas atuais — ver OpcoesImportacao)
// Nada disto mexe na conta de hoje. Importar o mesmo mês outra vez não duplica: o que já existe é ignorado.
export function importarFolhaMes(
  _userId: string,
  dados: DadosFolhaMes,
  opcoes: OpcoesImportacao = {}
): Promise<ResumoImportacao> {
  const limpos: DadosFolhaMes = {
    ...dados,
    lucro: limparLinhas(dados.lucro),
    despesas: limparLinhas(dados.despesas),
    poupanca: limparLinhas(dados.poupanca),
    despesasMes: limparLinhas(dados.despesasMes),
    anual: limparLinhas(dados.anual),
    falta: limparLinhas(dados.falta),
    saldoPoupanca: limparLinhas(dados.saldoPoupanca),
    totalAPagar: limparLinhas(dados.totalAPagar),
  };
  return api.post<ResumoImportacao>(`/api/folha/${parte(dados.mes)}/importar`, { dados: limpos, opcoes });
}
