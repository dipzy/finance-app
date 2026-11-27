// Alertas: a ordem e o destino de cada um (utils/alertas.ts), o pedido à API e o estado partilhado
// (services/alertas.ts) e o ecrã para onde leva tocar numa notificação.
jest.unmock('../services/alertas');
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));

import { __reporAlertas, atualizarAlertas, atualizarAlertasSeNecessario, AlertasDB } from '../services/alertas';
import {
  Alerta,
  alertasUrgentes,
  eAlertaDeOrcamento,
  ordenarAlertas,
  rotaDaNotificacao,
  rotaDoAlerta,
  TIPOS_DE_ALERTA,
} from '../utils/alertas';
import { ApiFalsa, instalarApiFalsa } from '../test-utils/apiFalsa';

const alerta = (extra: Partial<Alerta> = {}): Alerta => ({
  tipo: 'despesa-a-vencer',
  severidade: 'aviso',
  titulo: 'Renda sai em 2 dias',
  mensagem: '550,00 €',
  referencia: 'd1',
  data: '2026-10-10',
  ...extra,
});

describe('ordem e destino', () => {
  it('do mais grave para o menos grave; com a mesma gravidade, o que vence primeiro', () => {
    const ordenados = ordenarAlertas([
      alerta({ titulo: 'info', severidade: 'info', data: '2026-10-01' }),
      alerta({ titulo: 'aviso tarde', severidade: 'aviso', data: '2026-10-20' }),
      alerta({ titulo: 'crítico', severidade: 'critico', data: '2026-10-30' }),
      alerta({ titulo: 'aviso cedo', severidade: 'aviso', data: '2026-10-05' }),
    ]);
    expect(ordenados.map((a) => a.titulo)).toEqual(['crítico', 'aviso cedo', 'aviso tarde', 'info']);
  });

  it('cada tipo leva ao ecrã certo', () => {
    expect(rotaDoAlerta({ tipo: 'orcamento-aviso' })).toBe('/(tabs)/orcamentos');
    expect(rotaDoAlerta({ tipo: 'orcamento-excedido' })).toBe('/(tabs)/orcamentos');
    expect(rotaDoAlerta({ tipo: 'orcamento-ritmo' })).toBe('/(tabs)/orcamentos');
    expect(rotaDoAlerta({ tipo: 'despesa-a-vencer' })).toBe('/(tabs)/despesas-fixas');
    expect(rotaDoAlerta({ tipo: 'despesa-vencida' })).toBe('/(tabs)/despesas-fixas');
    expect(rotaDoAlerta({ tipo: 'divida-a-vencer' })).toBe('/(tabs)/dividas');
    expect(rotaDoAlerta({ tipo: 'divida-vencida' })).toBe('/(tabs)/dividas');
    expect(rotaDoAlerta({ tipo: 'objetivo-atrasado' })).toBe('/(tabs)/objetivos');
    // Gastos fora do normal
    expect(rotaDoAlerta({ tipo: 'despesa-fixa-subiu' })).toBe('/(tabs)/despesas-fixas');
    expect(rotaDoAlerta({ tipo: 'categoria-acima-da-media' })).toBe('/(tabs)/despesas-extras');
    expect(rotaDoAlerta({ tipo: 'gasto-incomum' })).toBe('/(tabs)/despesas-extras');
    // Acerto de contas por confirmar: abre o grupo (a referência é o id do grupo)
    expect(rotaDoAlerta({ tipo: 'acerto-por-confirmar', referencia: 'g1' })).toBe('/(tabs)/grupo/g1');
    // Despesa do grupo por aceitar: também abre o grupo
    expect(rotaDoAlerta({ tipo: 'despesa-partilhada-por-aceitar', referencia: 'g1' })).toBe('/(tabs)/grupo/g1');
    expect(TIPOS_DE_ALERTA).toHaveLength(13);
  });

  it('o emblema do menu conta os que não são só informação', () => {
    const lista = [alerta({ severidade: 'info' }), alerta({ severidade: 'aviso' }), alerta({ severidade: 'critico' })];
    expect(alertasUrgentes(lista)).toHaveLength(2);
    expect(eAlertaDeOrcamento(alerta({ tipo: 'orcamento-excedido' }))).toBe(true);
    expect(eAlertaDeOrcamento(alerta({ tipo: 'orcamento-ritmo' }))).toBe(true);
    expect(eAlertaDeOrcamento(alerta())).toBe(false);
  });
});

describe('tocar numa notificação de gastos fora do normal', () => {
  it.each([
    ['categoria-acima-da-media', '/(tabs)/despesas-extras'],
    ['despesa-fixa-subiu', '/(tabs)/despesas-fixas'],
    ['gasto-incomum', '/(tabs)/despesas-extras'],
  ])('%s sem url abre %s', (tipo, rota) => {
    expect(rotaDaNotificacao({ tipo })).toBe(rota);
  });
});

describe('tocar numa notificação', () => {
  it('abre o url dos dados (com ou sem o grupo "(tabs)")', () => {
    expect(rotaDaNotificacao({ url: '/(tabs)/despesas-fixas' })).toBe('/(tabs)/despesas-fixas');
    expect(rotaDaNotificacao({ url: '/orcamentos' })).toBe('/(tabs)/orcamentos');
    expect(rotaDaNotificacao({ url: '/(tabs)/grupo/abc123' })).toBe('/(tabs)/grupo/abc123');
  });

  it('sem url usa o tipo do alerta; senão não abre nada', () => {
    expect(rotaDaNotificacao({ tipo: 'divida-vencida', referencia: 'x' })).toBe('/(tabs)/dividas');
    expect(rotaDaNotificacao({ tipo: 'teste' })).toBeNull();
    expect(rotaDaNotificacao({})).toBeNull();
    expect(rotaDaNotificacao(undefined)).toBeNull();
  });

  it('ignora endereços que não são rotas simples da app', () => {
    expect(rotaDaNotificacao({ url: 'https://exemplo.pt/x' })).toBeNull();
    expect(rotaDaNotificacao({ url: '//exemplo.pt/x' })).toBeNull();
    expect(rotaDaNotificacao({ url: '/(tabs)/../login' })).toBeNull();
    expect(rotaDaNotificacao({ url: 42 })).toBeNull();
  });
});

describe('services/alertas', () => {
  let api: ApiFalsa;
  beforeEach(() => {
    __reporAlertas();
    api = instalarApiFalsa();
  });

  it('GET /api/alertas, já ordenados por gravidade, com o idioma da app no pedido', async () => {
    api.responder('GET', '/api/alertas', [alerta({ severidade: 'info', titulo: 'b' }), alerta({ severidade: 'critico', titulo: 'a' })]);
    const alertas = await AlertasDB.listar();
    expect(alertas.map((a) => a.titulo)).toEqual(['a', 'b']);
    expect(api.feitos('GET', '/api/alertas')[0].cabecalhos['Accept-Language']).toMatch(/^(pt|en)/);
  });

  it('um pedido novo só sai se o último tiver mais de um minuto', async () => {
    api.responder('GET', '/api/alertas', [alerta()]);
    await atualizarAlertas();
    await atualizarAlertasSeNecessario();
    await atualizarAlertasSeNecessario();
    expect(api.feitos('GET', '/api/alertas')).toHaveLength(1);
    await atualizarAlertas();
    expect(api.feitos('GET', '/api/alertas')).toHaveLength(2);
  });

  it('pedidos ao mesmo tempo partilham o mesmo pedido; uma falha não lança erro e volta a tentar-se', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    api.responder('GET', '/api/alertas', { status: 500, title: 'x' }, 500);
    await Promise.all([atualizarAlertas(), atualizarAlertas()]);
    expect(api.feitos('GET', '/api/alertas')).toHaveLength(1);

    api.responder('GET', '/api/alertas', [alerta()]);
    await atualizarAlertasSeNecessario(); // a falha deixou o estado "desatualizado"
    expect(api.feitos('GET', '/api/alertas')).toHaveLength(2);
  });
});
