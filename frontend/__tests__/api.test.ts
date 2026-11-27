// O cliente HTTP da API (services/api.ts): endereço, token do Firebase, JSON, erros em português,
// tempo limite e aviso de "servidor a acordar". O fetch é falso: nada sai para a rede.
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: null } }));

import {
  __reporServidor,
  acordarServidor,
  aoAcordarServidor,
  api,
  ESPERAS_ACORDAR_MS,
  ErroApi,
  esperarAntesDosPedidos,
  pedir,
  servidorJaAcordou,
  urlApi,
} from '../services/api';
import { registarErroApi } from '../services/erros';

jest.mock('../services/erros', () => ({ registarErroApi: jest.fn() }));
import { auth } from '../services/firebase';

const sessao = auth as unknown as { currentUser: { getIdToken: jest.Mock } | null };

function resposta(estado: number, corpo?: unknown) {
  const texto = corpo === undefined ? '' : JSON.stringify(corpo);
  return { ok: estado >= 200 && estado < 300, status: estado, text: async () => texto };
}

let fetchFalso: jest.Mock;

beforeEach(() => {
  // Por defeito a API já acordou (uma falha é uma falha); os testes do arranque põem false
  __reporServidor(true);
  (registarErroApi as jest.Mock).mockClear();
  delete process.env.EXPO_PUBLIC_API_URL;
  sessao.currentUser = { getIdToken: jest.fn(async (forcar?: boolean) => (forcar ? 'token-novo' : 'token-de-teste')) };
  fetchFalso = jest.fn(async () => resposta(200, { ok: true }));
  global.fetch = fetchFalso as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('endereço da API', () => {
  it('vem de EXPO_PUBLIC_API_URL (sem / no fim) e, sem ele, é a API local', async () => {
    expect(urlApi()).toBe('http://localhost:5080');

    process.env.EXPO_PUBLIC_API_URL = 'https://financas-api.onrender.com/';
    expect(urlApi()).toBe('https://financas-api.onrender.com');
    await api.get('/api/conta');
    expect(fetchFalso).toHaveBeenCalledWith('https://financas-api.onrender.com/api/conta', expect.anything());
  });
});

describe('pedidos', () => {
  it('levam o ID token do Firebase e o corpo em JSON', async () => {
    await api.post('/api/conta/movimentos', { valor: -120 });

    const [, init] = fetchFalso.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token-de-teste', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ valor: -120 });
  });

  it('devolvem o JSON da resposta, ou null quando não há corpo (204)', async () => {
    fetchFalso.mockResolvedValueOnce(resposta(200, { saldo: 954.5 }));
    expect(await api.get('/api/conta/saldo')).toEqual({ saldo: 954.5 });

    fetchFalso.mockResolvedValueOnce(resposta(204));
    expect(await api.get('/api/salario')).toBeNull();
  });

  it('sem sessão iniciada não saem (e dizem para fazer login)', async () => {
    sessao.currentUser = null;
    await expect(api.get('/api/conta')).rejects.toMatchObject({ estado: 401, message: 'A sessão terminou. Faz login outra vez.' });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('com o token expirado pedem um novo ao Firebase e tentam mais uma vez', async () => {
    fetchFalso.mockResolvedValueOnce(resposta(401)).mockResolvedValueOnce(resposta(200, { saldo: 1 }));
    expect(await api.get('/api/conta/saldo')).toEqual({ saldo: 1 });
    expect(fetchFalso.mock.calls[1][1].headers.Authorization).toBe('Bearer token-novo');
  });

  it('esperam pela tarefa inicial (a cópia do Firestore), exceto os que dizem para não esperar', async () => {
    let terminar!: () => void;
    esperarAntesDosPedidos(new Promise<void>((resolve) => (terminar = resolve)));

    const normal = api.get('/api/conta');
    await pedir('/api/migracao/estado', { esperar: false });
    expect(fetchFalso.mock.calls.map(([url]) => url)).toEqual(['http://localhost:5080/api/migracao/estado']);

    terminar();
    await normal;
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });
});

describe('erros', () => {
  it('a mensagem vem do ProblemDetails da API', async () => {
    fetchFalso.mockResolvedValueOnce(resposta(404, { status: 404, title: 'Não encontrado', detail: 'Despesa não encontrada.' }));
    const erro = await api.patch('/api/despesas-fixas/x', { titulo: 'a' }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ estado: 404, message: 'Despesa não encontrada.' });
  });

  it('dados inválidos: o primeiro erro de campo', async () => {
    fetchFalso.mockResolvedValueOnce(
      resposta(400, { status: 400, title: 'Dados inválidos', errors: { mes: ['mes: o mês tem de estar no formato AAAA-MM (ex.: 2026-10).'] } })
    );
    await expect(api.get('/api/conta/saldos?mes=2026-13')).rejects.toMatchObject({
      estado: 400,
      message: 'mes: o mês tem de estar no formato AAAA-MM (ex.: 2026-10).',
    });
  });

  it('erros sem detalhe têm uma mensagem por estado', async () => {
    fetchFalso.mockResolvedValue(resposta(500));
    await expect(api.get('/api/conta')).rejects.toMatchObject({ estado: 500, message: 'Erro no servidor. Tenta novamente daqui a pouco.' });
    fetchFalso.mockResolvedValue(resposta(401));
    await expect(api.get('/api/conta')).rejects.toMatchObject({ estado: 401, message: 'A sessão expirou. Faz login outra vez.' });
    fetchFalso.mockResolvedValue(resposta(409));
    await expect(api.get('/api/conta')).rejects.toMatchObject({ estado: 409, message: 'Os dados mudaram entretanto. Tenta outra vez.' });
  });

  it('sem rede', async () => {
    fetchFalso.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(api.get('/api/conta')).rejects.toMatchObject({
      estado: 0,
      message: 'Sem ligação ao servidor. Verifica a internet e tenta outra vez.',
    });
  });
});

describe('servidor a acordar (Render gratuito)', () => {
  // Um fetch que só responde quando o teste quiser, e que desiste se o pedido for cancelado
  function fetchPendente() {
    let responder!: () => void;
    fetchFalso.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((resolve, reject) => {
          responder = () => resolve(resposta(200, { saldo: 1 }));
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
        })
    );
    return () => responder();
  }

  // O pedido só chega ao fetch depois de obter o token (promessas): esperar por isso
  async function ateHaverPedido() {
    for (let i = 0; i < 50 && !fetchFalso.mock.calls.length; i++) await Promise.resolve();
  }

  it('avisa quando um pedido demora mais de 3 segundos e quando acaba', async () => {
    jest.useFakeTimers();
    const avisos: boolean[] = [];
    const deixarDeOuvir = aoAcordarServidor((aAcordar) => avisos.push(aAcordar));
    const responder = fetchPendente();

    const pedido = api.get('/api/conta/saldo');
    await ateHaverPedido();
    jest.advanceTimersByTime(3000);
    expect(avisos).toEqual([true]);

    responder();
    await pedido;
    expect(avisos).toEqual([true, false]);
    deixarDeOuvir();
  });

  it('desiste ao fim de 90 segundos', async () => {
    jest.useFakeTimers();
    fetchPendente();
    const pedido = api.get('/api/conta/saldo').catch((e) => e);
    await ateHaverPedido();
    jest.advanceTimersByTime(90_000);
    expect(await pedido).toMatchObject({ estado: 0, message: 'O servidor demorou demasiado a responder. Tenta outra vez.' });
  });

  it('acordarServidor pede /saude sem token e nunca lança erros', async () => {
    sessao.currentUser = null;
    expect(await acordarServidor()).toBe(true);
    expect(fetchFalso).toHaveBeenCalledWith('http://localhost:5080/saude', expect.objectContaining({ method: 'GET' }));
    expect(fetchFalso.mock.calls[0][1].headers.Authorization).toBeUndefined();

    fetchFalso.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await acordarServidor()).toBe(false);
  });
});

describe('arranque do servidor (Render grátis)', () => {
  beforeEach(() => {
    __reporServidor(false);
    jest.useFakeTimers();
  });

  // Deixa correr as promessas pendentes e avança o relógio, uma espera de cada vez
  async function passar(ms: number) {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await jest.advanceTimersByTimeAsync(ms);
  }

  it('um GET que falha por rede repete com espera crescente até a API responder', async () => {
    const avisos: boolean[] = [];
    const parar = aoAcordarServidor((a) => avisos.push(a));
    fetchFalso
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(resposta(503))
      .mockResolvedValueOnce(resposta(200, { saldo: 5 }));

    const pedido = api.get('/api/conta/saldo');
    await passar(ESPERAS_ACORDAR_MS[0]);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    await passar(ESPERAS_ACORDAR_MS[1]);
    expect(await pedido).toEqual({ saldo: 5 });
    expect(fetchFalso).toHaveBeenCalledTimes(3);
    expect(servidorJaAcordou()).toBe(true);
    // O aviso liga logo à primeira falha e fica ligado até acabar (não pisca entre tentativas)
    expect(avisos).toEqual([true, false]);
    expect(registarErroApi).not.toHaveBeenCalled();
    parar();
  });

  it('desiste depois de todas as esperas e regista a falha de rede no Sentry', async () => {
    fetchFalso.mockRejectedValue(new TypeError('Network request failed'));
    const pedido = api.get('/api/conta/saldo').catch((e) => e);
    for (const espera of ESPERAS_ACORDAR_MS) await passar(espera);
    expect(await pedido).toMatchObject({ estado: 0 });
    expect(fetchFalso).toHaveBeenCalledTimes(ESPERAS_ACORDAR_MS.length + 1);
    expect(registarErroApi).toHaveBeenCalledWith('rede', { metodo: 'GET', caminho: '/api/conta/saldo' });
  });

  it('os pedidos que escrevem (POST) não repetem: a fila offline trata deles', async () => {
    fetchFalso.mockRejectedValue(new TypeError('Network request failed'));
    await expect(api.post('/api/despesas-extras', { valor: 1 })).rejects.toMatchObject({ estado: 0 });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('depois de a API responder uma vez, as falhas deixam de repetir', async () => {
    await api.get('/api/conta');
    fetchFalso.mockRejectedValue(new TypeError('Network request failed'));
    await expect(api.get('/api/conta')).rejects.toMatchObject({ estado: 0 });
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('erros 5xx (que não são de arranque) vão para o Sentry', async () => {
    __reporServidor(true);
    fetchFalso.mockResolvedValue(resposta(500, { title: 'x' }));
    await expect(api.get('/api/despesas-extras/123456?mes=2026-10')).rejects.toBeInstanceOf(ErroApi);
    expect(registarErroApi).toHaveBeenCalledWith('servidor', {
      metodo: 'GET',
      caminho: '/api/despesas-extras/123456?mes=2026-10',
      estado: 500,
    });
  });

  it('erros 4xx não vão para o Sentry', async () => {
    __reporServidor(true);
    fetchFalso.mockResolvedValue(resposta(404));
    await expect(api.get('/api/x')).rejects.toMatchObject({ estado: 404 });
    expect(registarErroApi).not.toHaveBeenCalled();
  });
});
