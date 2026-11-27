// O aviso "A acordar o servidor…" (components/AvisoServidorAcordar.tsx): aparece com um contador
// quando há pedidos lentos e desaparece sozinho quando a API responde.
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 't' } } }));

import { act, ReactElement } from 'react';
import { Text } from 'react-native';
import { AvisoServidorAcordar, segundosDesde } from '../components/AvisoServidorAcordar';
import { __reporServidor, api } from '../services/api';

interface No {
  props: Record<string, any>;
}
interface ReactTestRenderer {
  root: { findAllByType(tipo: unknown): No[] };
  toJSON(): unknown;
  unmount(): void;
}
const renderer: { create(elemento: ReactElement): ReactTestRenderer } = require('react-test-renderer');
const textos = (e: ReactTestRenderer) => e.root.findAllByType(Text).map((n) => [n.props.children].flat(Infinity).join(''));

beforeEach(() => {
  jest.useFakeTimers();
  __reporServidor(true);
});
afterEach(() => jest.useRealTimers());

it('segundosDesde conta segundos inteiros e nunca é negativo', () => {
  expect(segundosDesde(null)).toBe(0);
  expect(segundosDesde(10_000, 14_900)).toBe(4);
  expect(segundosDesde(10_000, 5_000)).toBe(0);
});

it('sem pedidos lentos não mostra nada; com um pedido lento mostra o contador e depois some', async () => {
  let responder!: () => void;
  global.fetch = jest.fn(
    () => new Promise((resolve) => (responder = () => resolve({ ok: true, status: 200, text: async () => '{}' })))
  ) as unknown as typeof fetch;

  let e!: ReactTestRenderer;
  await act(async () => {
    e = renderer.create(<AvisoServidorAcordar />);
  });
  expect(e.toJSON()).toBeNull();

  const pedido = api.get('/api/conta/saldo');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(3_000);
  });
  expect(textos(e)[0]).toBe('A acordar o servidor…');

  await act(async () => {
    await jest.advanceTimersByTimeAsync(4_000);
  });
  expect(textos(e)[1]).toContain('4 s');
  expect(textos(e)[1]).toContain('A app continua a funcionar');

  await act(async () => {
    responder();
    await pedido;
  });
  expect(e.toJSON()).toBeNull();
  await act(async () => e.unmount());
});
