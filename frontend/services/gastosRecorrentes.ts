import { api, parte } from './api';
import { t } from '../i18n';
import type { Categoria, MeioPagamento } from './tipos';

// Gastos do dia a dia que se repetem (o café todos os dias, o combustível todas as semanas).
// A API guarda a regra e gera ela própria as despesas nos dias certos quando se pede o saldo:
// a app só cria, lista, pausa/retoma, muda o valor e apaga a regra.

export type Frequencia = 'diaria' | 'semanal' | 'mensal';

/** O seletor "Repetir" do formulário: 'nao' = um gasto só. */
export type Repeticao = 'nao' | Frequencia;

export interface GastoRecorrente {
  id: string;
  titulo: string;
  valor: number;
  categoria?: Categoria;
  meioPagamento: MeioPagamento;
  frequencia: Frequencia;
  diaSemana?: number; // 1 = segunda ... 7 = domingo
  diaMes?: number; // 1-31 (nos meses mais curtos, o último dia)
  inicio: string; // AAAA-MM-DD
  fim?: string;
  ativo: boolean;
  ultimaGeracao?: string;
}

export interface NovoGastoRecorrente {
  titulo: string;
  valor: number;
  frequencia: Frequencia;
  diaSemana?: number;
  diaMes?: number;
  inicio?: string;
  fim?: string;
  categoria?: Categoria;
  meioPagamento?: MeioPagamento;
}

export const OPCOES_REPETICAO: { valor: Repeticao; rotulo: string }[] = [
  { valor: 'nao', rotulo: 'Não' },
  { valor: 'diaria', rotulo: 'Todos os dias' },
  { valor: 'semanal', rotulo: 'Todas as semanas' },
  { valor: 'mensal', rotulo: 'Todos os meses' },
];

const DIAS_SEMANA = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** O dia da semana ISO (1 = segunda ... 7 = domingo) de uma data AAAA-MM-DD, sem fusos horários. */
export function diaSemanaIso(dataIso: string): number {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const domingo0 = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return ((domingo0 + 6) % 7) + 1;
}

/** O dia seguinte a uma data AAAA-MM-DD. */
export function diaSeguinte(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + 1)).toISOString().slice(0, 10);
}

/**
 * A regra a criar depois de registar um gasto com "Repetir": o gasto desse dia já foi registado
 * (pela via normal, que também funciona sem rede), por isso a regra começa no dia seguinte, no
 * mesmo dia da semana / do mês. Se a data for de dias passados, a API gera os que faltam até hoje.
 */
export function regraDaRepeticao(
  gasto: { titulo: string; valor: number; data: string; categoria?: Categoria; meioPagamento?: MeioPagamento },
  repeticao: Frequencia
): NovoGastoRecorrente {
  const [, , dia] = gasto.data.split('-').map(Number);
  return {
    titulo: gasto.titulo,
    valor: gasto.valor,
    frequencia: repeticao,
    diaSemana: repeticao === 'semanal' ? diaSemanaIso(gasto.data) : undefined,
    diaMes: repeticao === 'mensal' ? dia : undefined,
    inicio: diaSeguinte(gasto.data),
    categoria: gasto.categoria,
    meioPagamento: gasto.meioPagamento,
  };
}

/** "Todos os dias", "Todas as semanas (sexta)", "Todos os meses (dia 31)". */
export function descreverFrequencia(gasto: Pick<GastoRecorrente, 'frequencia' | 'diaSemana' | 'diaMes'>): string {
  switch (gasto.frequencia) {
    case 'diaria':
      return t('Todos os dias');
    case 'semanal':
      return gasto.diaSemana
        ? t('Todas as semanas ({dia})', { dia: t(DIAS_SEMANA[gasto.diaSemana - 1]) })
        : t('Todas as semanas');
    case 'mensal':
      return gasto.diaMes ? t('Todos os meses (dia {dia})', { dia: gasto.diaMes }) : t('Todos os meses');
  }
}

export const GastosRecorrentesDB = {
  getAll(): Promise<GastoRecorrente[]> {
    return api.get<GastoRecorrente[]>('/api/gastos-recorrentes');
  },

  /** Cria a regra; a API gera logo as repetições até hoje. Devolve o id. */
  async add(gasto: NovoGastoRecorrente): Promise<string> {
    return (await api.post<{ id: string }>('/api/gastos-recorrentes', gasto)).id;
  },

  async update(id: string, campos: Partial<Pick<GastoRecorrente, 'titulo' | 'valor' | 'categoria' | 'meioPagamento' | 'fim'>>): Promise<void> {
    await api.patch(`/api/gastos-recorrentes/${parte(id)}`, campos);
  },

  /** Em pausa não gera nada; ao retomar, os dias da pausa não são gerados. */
  async definirAtivo(id: string, ativo: boolean): Promise<void> {
    await api.patch(`/api/gastos-recorrentes/${parte(id)}`, { ativo });
  },

  /** Apaga a regra; os gastos já gerados ficam. */
  async remove(id: string): Promise<void> {
    await api.delete(`/api/gastos-recorrentes/${parte(id)}`);
  },
};
