// O modo E2E (utils/e2e.ts) só liga com EXPO_PUBLIC_E2E=1 e num servidor de desenvolvimento.
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: null } }));

const original = process.env.EXPO_PUBLIC_E2E;
const originalDev = (globalThis as { __DEV__?: boolean }).__DEV__;

afterEach(() => {
  if (original === undefined) delete process.env.EXPO_PUBLIC_E2E;
  else process.env.EXPO_PUBLIC_E2E = original;
  (globalThis as { __DEV__?: boolean }).__DEV__ = originalDev;
  jest.resetModules();
});

function carregar(e2e: string | undefined, dev: boolean) {
  if (e2e === undefined) delete process.env.EXPO_PUBLIC_E2E;
  else process.env.EXPO_PUBLIC_E2E = e2e;
  (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
  jest.resetModules();
  return require('../utils/e2e') as typeof import('../utils/e2e');
}

describe('MODO_E2E', () => {
  it('desligado por defeito', () => {
    expect(carregar(undefined, true).MODO_E2E).toBe(false);
    expect(carregar('0', true).MODO_E2E).toBe(false);
  });

  it('liga com EXPO_PUBLIC_E2E=1 em desenvolvimento', () => {
    expect(carregar('1', true).MODO_E2E).toBe(true);
  });

  it('nunca liga numa versão publicada (sem __DEV__), mesmo com a variável definida', () => {
    expect(carregar('1', false).MODO_E2E).toBe(false);
  });
});

describe('pedidos da API no modo E2E', () => {
  it('levam X-Utilizador em vez do token do Firebase', async () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    jest.resetModules();
    const fetchFalso = jest.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }));
    global.fetch = fetchFalso as unknown as typeof fetch;
    const { api } = require('../services/api') as typeof import('../services/api');
    await api.get('/api/conta');
    const [, init] = fetchFalso.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(init.headers['X-Utilizador']).toBe('e2e-utilizador');
    expect(init.headers.Authorization).toBeUndefined();
  });
});
