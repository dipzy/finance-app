// Monitorização de erros (services/erros.ts): desligada sem DSN, sem dados pessoais com DSN.
import * as Sentry from '@sentry/react-native';
import {
  __reporErros,
  caminhoSemDados,
  definirUtilizador,
  envolverApp,
  erroAtivo,
  iniciarErros,
  limparEvento,
  registarErro,
  registarErroApi,
} from '../services/erros';

const sentry = Sentry as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  __reporErros();
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
});

describe('sem EXPO_PUBLIC_SENTRY_DSN', () => {
  it('fica desligado e nada chega ao Sentry', () => {
    expect(iniciarErros()).toBe(false);
    expect(erroAtivo()).toBe(false);
    definirUtilizador('uid-1');
    registarErro(new Error('x'));
    registarErroApi('servidor', { metodo: 'GET', caminho: '/api/x', estado: 500 });
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.setUser).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    const Raiz = () => null;
    expect(envolverApp(Raiz)).toBe(Raiz);
  });
});

describe('com DSN', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = ' https://chave@o0.ingest.sentry.io/1 ';
  });

  it('inicia sem dados pessoais por defeito', () => {
    expect(iniciarErros()).toBe(true);
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://chave@o0.ingest.sentry.io/1', sendDefaultPii: false, beforeSend: limparEvento })
    );
  });

  it('se o módulo nativo faltar (APK antigo), a app continua sem monitorização', () => {
    sentry.init.mockImplementationOnce(() => {
      throw new Error('native module');
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(iniciarErros()).toBe(false);
  });

  it('o utilizador é só o id', () => {
    iniciarErros();
    definirUtilizador('uid-1');
    expect(sentry.setUser).toHaveBeenCalledWith({ id: 'uid-1' });
    definirUtilizador(null);
    expect(sentry.setUser).toHaveBeenLastCalledWith(null);
  });

  it('limparEvento tira email, nome, IP e dados do pedido', () => {
    const evento = {
      user: { id: 'u1', email: 'a@b.pt', username: 'ana', ip_address: '1.2.3.4' },
      request: { url: 'https://api.exemplo.pt/api/despesas/12345?mes=2026-10', data: '{"nome":"x"}', cookies: { a: 'b' } },
    } as unknown as Sentry.ErrorEvent;
    const limpo = limparEvento(evento);
    expect(limpo.user).toEqual({ id: 'u1' });
    expect(limpo.request).toEqual({ url: '/api/despesas/:id' });
  });

  it('caminhoSemDados troca ids e tira a pesquisa', () => {
    expect(caminhoSemDados('/api/despesas-extras/42?mes=2026-10')).toBe('/api/despesas-extras/:id');
    expect(caminhoSemDados('/api/grupos/3f2a1b4c-0000-4000-8000-123456789abc/membros')).toBe('/api/grupos/:id/membros');
    expect(caminhoSemDados('/api/conta/saldo')).toBe('/api/conta/saldo');
  });

  it('erros da API: contexto sem ids e um aviso por minuto para o mesmo problema', () => {
    iniciarErros();
    const info = { metodo: 'GET', caminho: '/api/despesas-extras/42?mes=2026-10', estado: 502 };
    registarErroApi('servidor', info, 1_000);
    registarErroApi('servidor', info, 5_000);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith('API servidor: GET /api/despesas-extras/:id (502)', 'error');
    registarErroApi('servidor', info, 70_000);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
  });

  it('registarErro envia a exceção (e embrulha o que não for Error)', () => {
    iniciarErros();
    registarErro('texto solto', { origem: 'teste' });
    expect(sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });
});
