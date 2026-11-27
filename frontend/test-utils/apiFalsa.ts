// API falsa para os testes da app: substitui o fetch global e responde às rotas registadas como a
// API (.NET, pasta backend/) responderia. Guarda os pedidos feitos, para os testes verificarem o
// que a app enviou (método, caminho, corpo e cabeçalhos).
//
//   const api = instalarApiFalsa();
//   api.responder('GET', '/api/conta/saldo', { saldo: 400 });
//   api.responder('POST', '/api/folha/2026-03/importar', (pedido) => ({ mes: pedido.corpo.dados.mes, ... }));
//   ...
//   expect(api.pedidos.map((p) => p.caminho)).toEqual([...]);
//
// As regras de negócio não estão aqui: estão (e são testadas) na API.
// Os testes têm também de simular o login no Firebase:
//   jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));

export interface PedidoFalso {
  metodo: string;
  caminho: string; // sem o endereço da API, com a query (ex.: "/api/pagamentos?mes=2026-10")
  corpo: any;
  cabecalhos: Record<string, string>;
}

type Gerador = (pedido: PedidoFalso) => unknown;

interface Rota {
  metodo: string;
  caminho: string;
  estado: number;
  corpo: unknown | Gerador;
}

// O suficiente de um Response para services/api.ts (ok, status, text)
function resposta(estado: number, corpo: unknown) {
  const texto = corpo === undefined ? '' : JSON.stringify(corpo);
  return { ok: estado >= 200 && estado < 300, status: estado, text: async () => texto } as unknown as Response;
}

export function instalarApiFalsa(base = 'http://localhost:5080') {
  const rotas: Rota[] = [];
  const pedidos: PedidoFalso[] = [];

  const fetchFalso = jest.fn(async (url: string, init: RequestInit = {}) => {
    const caminho = url.startsWith(base) ? url.slice(base.length) : url;
    const pedido: PedidoFalso = {
      metodo: init.method ?? 'GET',
      caminho,
      corpo: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      cabecalhos: (init.headers ?? {}) as Record<string, string>,
    };
    pedidos.push(pedido);

    // A última rota registada para o mesmo pedido ganha (permite mudar a resposta a meio de um teste)
    const rota = [...rotas].reverse().find((r) => r.metodo === pedido.metodo && r.caminho === caminho);
    if (!rota) {
      return resposta(404, { status: 404, title: 'Não encontrado', detail: `Rota não definida na API falsa: ${pedido.metodo} ${caminho}` });
    }
    const corpo = typeof rota.corpo === 'function' ? (rota.corpo as Gerador)(pedido) : rota.corpo;
    return resposta(rota.estado, corpo);
  });
  global.fetch = fetchFalso as unknown as typeof fetch;

  return {
    pedidos,
    fetch: fetchFalso,
    /** Responde a METODO caminho com este corpo (ou com o que a função devolver) e este estado (200 por defeito). */
    responder(metodo: string, caminho: string, corpo?: unknown | Gerador, estado = corpo === undefined ? 204 : 200) {
      rotas.push({ metodo, caminho, estado, corpo });
    },
    /** Os pedidos feitos a este método + caminho. */
    feitos(metodo: string, caminho: string) {
      return pedidos.filter((p) => p.metodo === metodo && p.caminho === caminho);
    },
  };
}

export type ApiFalsa = ReturnType<typeof instalarApiFalsa>;
