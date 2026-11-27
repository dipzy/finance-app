import { t } from '../i18n';
import { diaEfetivo, mesDe, mesSeguinte } from '../services/calculos';
import type { Despesa, Mes, PagamentoFixa, SalarioConfig } from '../services/tipos';
import { textoValor } from './ecrasDespesas';
import { parseValor } from './formatos';
import { proximosPagamentos } from './painel';

// O que agendar como notificação local (lembretes de pagamentos e do salário), sem React Native
// nem expo-notifications, para poder ser testado diretamente (__tests__/lembretes.test.ts).
// Quem agenda de facto é services/notificacoes.ts.
//
//   - despesas fixas (e anuais do seu mês) ainda por pagar, com dia de débito: na véspera às 9h
//     e, se o utilizador quiser, também no próprio dia às 9h. Várias no mesmo dia = uma só notificação
//   - salário: no dia de recebimento às 9h, se ainda não tiver entrado nesse mês
// Para o mês atual e o seguinte; o que já passou fica de fora.

export const PREFIXO_LEMBRETE = 'financas-lembrete';
export const HORA_LEMBRETE = 9;

export type TipoLembrete = 'vespera' | 'dia' | 'salario';

export interface Lembrete {
  id: string; // fixo para o mesmo lembrete: voltar a agendar substitui em vez de duplicar
  tipo: TipoLembrete;
  data: Date;
  titulo: string;
  corpo: string;
}

export interface OpcoesLembretes {
  noProprioDia: boolean;
  salario: boolean;
}

export interface DadosLembretes {
  fixas: Despesa[];
  // Os pagamentos de cada mês (os meses que faltarem contam como sem pagamentos)
  pagamentos: Partial<Record<Mes, PagamentoFixa[]>>;
  salario: SalarioConfig | null;
}

// Os meses para que se agenda: o atual e o seguinte
export const mesesALembrar = (agora: Date): Mes[] => [mesDe(agora), mesSeguinte(mesDe(agora))];

const euros = (valor: number) => `${textoValor(valor)} €`;

// "Renda, Internet e Ginásio"
function juntarNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('');
  return t('{lista} e {ultimo}', {
    lista: nomes.slice(0, -1).join(', '),
    ultimo: nomes[nomes.length - 1],
  });
}

interface PagamentoDoDia {
  titulo: string;
  valor: number;
  anual: boolean;
}

function textoDespesas(tipo: 'vespera' | 'dia', lista: PagamentoDoDia[]): Pick<Lembrete, 'titulo' | 'corpo'> {
  const quando = t(tipo === 'vespera' ? 'amanhã' : 'hoje');
  if (lista.length === 1) {
    const [p] = lista;
    return {
      titulo: t('{titulo} sai {quando} — {valor}', { titulo: p.titulo, quando, valor: euros(p.valor) }),
      corpo: t(
        p.anual
          ? 'Despesa anual ainda por pagar. Confirma que tens saldo na conta.'
          : 'Despesa mensal ainda por pagar. Confirma que tens saldo na conta.'
      ),
    };
  }
  const total = lista.reduce((s, p) => s + p.valor, 0);
  return {
    titulo: t('{n} despesas saem {quando} — {total}', { n: lista.length, quando, total: euros(total) }),
    corpo: `${juntarNomes(lista.map((p) => `${p.titulo} (${euros(p.valor)})`))}.`,
  };
}

function jaRecebeuNoMes(salario: SalarioConfig, mes: Mes): boolean {
  if (!salario.lastReceived) return false;
  const ultimo = new Date(salario.lastReceived);
  return !Number.isNaN(ultimo.getTime()) && mesDe(ultimo) === mes;
}

export function calcularLembretes(dados: DadosLembretes, opcoes: OpcoesLembretes, agora: Date = new Date()): Lembrete[] {
  const lembretes: Lembrete[] = [];

  for (const mes of mesesALembrar(agora)) {
    const [ano, m] = mes.split('-').map(Number);

    // Por pagar nesse mês, agrupadas pelo dia efetivo de débito (31 em novembro = dia 30)
    const porDia = new Map<number, PagamentoDoDia[]>();
    for (const p of proximosPagamentos(dados.fixas, dados.pagamentos[mes] ?? [], mes, agora).pagamentos) {
      if (p.dia === undefined) continue; // sem dia de débito não há data para lembrar
      porDia.set(p.dia, [...(porDia.get(p.dia) ?? []), { titulo: p.titulo, valor: p.valor, anual: p.anual }]);
    }

    for (const [dia, lista] of porDia) {
      const tipos: ('vespera' | 'dia')[] = opcoes.noProprioDia ? ['vespera', 'dia'] : ['vespera'];
      for (const tipo of tipos) {
        // A véspera do dia 1 é o último dia do mês anterior (o Date trata do dia 0)
        const data = new Date(ano, m - 1, tipo === 'vespera' ? dia - 1 : dia, HORA_LEMBRETE, 0, 0, 0);
        lembretes.push({
          id: `${PREFIXO_LEMBRETE}-${tipo}-${ano}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
          tipo,
          data,
          ...textoDespesas(tipo, lista),
        });
      }
    }

    const salario = dados.salario;
    if (opcoes.salario && salario?.diaRecebimento && !jaRecebeuNoMes(salario, mes)) {
      const dia = diaEfetivo(salario.diaRecebimento, new Date(ano, m - 1, 1));
      const valor = parseValor(salario.valor);
      lembretes.push({
        id: `${PREFIXO_LEMBRETE}-salario-${mes}`,
        tipo: 'salario',
        data: new Date(ano, m - 1, dia, HORA_LEMBRETE, 0, 0, 0),
        titulo: t('Hoje é dia de salário'),
        corpo:
          valor > 0
            ? t('O salário ({valor}) entra na conta quando abrires a app.', { valor: euros(valor) })
            : t('O salário entra na conta quando abrires a app.'),
      });
    }
  }

  return lembretes
    .filter((l) => l.data.getTime() > agora.getTime())
    .sort((a, b) => a.data.getTime() - b.data.getTime() || a.id.localeCompare(b.id));
}

// Para mostrar no ecrã Definições: "5 lembretes agendados · o próximo a 05/10 às 09:00"
export function descreverProximo(lembretes: Lembrete[]): string {
  if (!lembretes.length) return t('Sem lembretes agendados para já.');
  const [proximo] = lembretes;
  const d = proximo.data;
  const quando = t('{dia}/{mes} às {hora}', {
    dia: String(d.getDate()).padStart(2, '0'),
    mes: String(d.getMonth() + 1).padStart(2, '0'),
    hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  });
  const n = lembretes.length;
  return n === 1
    ? t('1 lembrete agendado · o próximo a {quando}.', { quando })
    : t('{n} lembretes agendados · o próximo a {quando}.', { n, quando });
}
