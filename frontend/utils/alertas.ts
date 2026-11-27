// As partes dos alertas que não precisam da API nem do React (ordem, ecrã de destino, texto): os
// alertas vêm de services/alertas.ts (GET /api/alertas), calculados no servidor.

export type TipoAlerta =
  | 'orcamento-aviso'
  | 'orcamento-excedido'
  | 'orcamento-ritmo'
  | 'despesa-a-vencer'
  | 'despesa-vencida'
  | 'divida-a-vencer'
  | 'divida-vencida'
  | 'objetivo-atrasado'
  | 'categoria-acima-da-media'
  | 'despesa-fixa-subiu'
  | 'gasto-incomum'
  | 'acerto-por-confirmar'
  | 'despesa-partilhada-por-aceitar';

export type SeveridadeAlerta = 'info' | 'aviso' | 'critico';

export interface Alerta {
  tipo: TipoAlerta;
  severidade: SeveridadeAlerta;
  titulo: string; // já no idioma da app (a API usa o Accept-Language)
  mensagem: string;
  referencia?: string | null; // o id do orçamento, despesa, dívida ou objetivo (num acerto por confirmar ou numa despesa por aceitar, o do grupo)
  data: string; // aaaa-mm-dd
}

export const TIPOS_DE_ALERTA: TipoAlerta[] = [
  'orcamento-aviso',
  'orcamento-excedido',
  'orcamento-ritmo',
  'despesa-a-vencer',
  'despesa-vencida',
  'divida-a-vencer',
  'divida-vencida',
  'objetivo-atrasado',
  'categoria-acima-da-media',
  'despesa-fixa-subiu',
  'gasto-incomum',
  'acerto-por-confirmar',
  'despesa-partilhada-por-aceitar',
];

const PESO: Record<SeveridadeAlerta, number> = { critico: 0, aviso: 1, info: 2 };

/** Do mais grave para o menos grave; com a mesma gravidade, o que vence primeiro. */
export function ordenarAlertas(alertas: Alerta[]): Alerta[] {
  return [...alertas].sort(
    (a, b) => (PESO[a.severidade] ?? 3) - (PESO[b.severidade] ?? 3) || a.data.localeCompare(b.data) || a.titulo.localeCompare(b.titulo)
  );
}

/** O ecrã que explica o alerta (rotas de app/(tabs)). */
export function rotaDoAlerta(alerta: Pick<Alerta, 'tipo'> & Partial<Pick<Alerta, 'referencia'>>): string {
  switch (alerta.tipo) {
    case 'orcamento-aviso':
    case 'orcamento-excedido':
    case 'orcamento-ritmo':
      return '/(tabs)/orcamentos';
    case 'despesa-a-vencer':
    case 'despesa-vencida':
    case 'despesa-fixa-subiu':
      return '/(tabs)/despesas-fixas';
    case 'divida-a-vencer':
    case 'divida-vencida':
      return '/(tabs)/dividas';
    case 'objetivo-atrasado':
      return '/(tabs)/objetivos';
    case 'categoria-acima-da-media':
    case 'gasto-incomum':
      return '/(tabs)/despesas-extras';
    case 'acerto-por-confirmar':
    case 'despesa-partilhada-por-aceitar':
      return alerta.referencia ? `/(tabs)/grupo/${alerta.referencia}` : '/(tabs)/poupanca-partilhada';
    default:
      return '/(tabs)/welcome';
  }
}

/** Os que merecem atenção (o número do emblema no menu): só os "info" ficam de fora. */
export const alertasUrgentes = (alertas: Alerta[]) => alertas.filter((a) => a.severidade !== 'info');

/** Identifica um alerta para saber se já foi visto (o mesmo alerta noutro dia ou mês conta como novo). */
export const chaveAlerta = (a: Pick<Alerta, 'tipo' | 'referencia' | 'data'>) => `${a.tipo}|${a.referencia ?? ''}|${a.data}`;

/** O número do emblema do sino: os que pedem atenção e ainda não se viram. */
export const alertasPorVer = (alertas: Alerta[], vistos: ReadonlySet<string>) =>
  alertasUrgentes(alertas).filter((a) => !vistos.has(chaveAlerta(a)));

/**
 * O ecrã a abrir ao tocar numa notificação (local ou push do servidor): o `url` dos dados (uma rota de
 * app/(tabs), com ou sem o grupo "(tabs)") ou, sem url, o ecrã do `tipo` do alerta. Só rotas internas
 * e simples: qualquer outra coisa (outro endereço, caracteres estranhos) é ignorada.
 */
export function rotaDaNotificacao(dados: unknown): string | null {
  const d = (dados && typeof dados === 'object' ? dados : {}) as { url?: unknown; tipo?: unknown; referencia?: unknown };
  if (typeof d.url === 'string') {
    const url = d.url.trim();
    if (/^\/\(tabs\)\/[A-Za-z0-9_\-/[\]]+$/.test(url)) return url;
    if (/^\/[A-Za-z0-9_\-/[\]]+$/.test(url)) return `/(tabs)${url}`;
  }
  if (typeof d.tipo === 'string' && TIPOS_DE_ALERTA.includes(d.tipo as TipoAlerta)) return rotaDoAlerta({ tipo: d.tipo as TipoAlerta, referencia: typeof d.referencia === 'string' ? d.referencia : null });
  return null;
}

export const eAlertaDeOrcamento = (alerta: Pick<Alerta, 'tipo'>) =>
  alerta.tipo === 'orcamento-aviso' || alerta.tipo === 'orcamento-excedido' || alerta.tipo === 'orcamento-ritmo';

/** O texto de uma severidade para o leitor de ecrã ("Crítico: ..."). Recebe o t() do componente. */
export const textoSeveridade = (t: (chave: string) => string, severidade: SeveridadeAlerta) =>
  t(severidade === 'critico' ? 'Crítico' : severidade === 'aviso' ? 'Aviso' : 'Informação');
