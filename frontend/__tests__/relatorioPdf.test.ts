// O relatório mensal em PDF: o pedido dos bytes à API (pedirBytes) e o ficheiro guardado.
// O fetch é falso: nada sai para a rede.
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('../utils/guardarFicheiro', () => ({ guardarFicheiro: jest.fn(async () => undefined) }));

import { ErroApi, pedirBytes } from '../services/api';
import { auth } from '../services/firebase';
import { exportarRelatorioPdf, mensagemErroPdf, nomeRelatorioPdf } from '../services/relatorioPdf';
import { guardarFicheiro } from '../utils/guardarFicheiro';

const sessao = auth as unknown as { currentUser: { getIdToken: jest.Mock } | null };
const BYTES_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function respostaPdf() {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array(BYTES_PDF).buffer,
    text: async () => '',
  };
}

function respostaErro(estado: number, corpo?: unknown) {
  return { ok: false, status: estado, text: async () => (corpo === undefined ? '' : JSON.stringify(corpo)) };
}

let fetchFalso: jest.Mock;

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_API_URL;
  sessao.currentUser = { getIdToken: jest.fn(async (forcar?: boolean) => (forcar ? 'token-novo' : 'token-de-teste')) };
  fetchFalso = jest.fn(async () => respostaPdf());
  global.fetch = fetchFalso as unknown as typeof fetch;
  (guardarFicheiro as jest.Mock).mockClear();
});

describe('pedirBytes', () => {
  it('pede o ficheiro com o token e o tipo pedido e devolve os bytes', async () => {
    const bytes = await pedirBytes('/api/relatorios/mes/2026-10.pdf', 'application/pdf');

    expect(Array.from(bytes)).toEqual(BYTES_PDF);
    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe('http://localhost:5080/api/relatorios/mes/2026-10.pdf');
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ Accept: 'application/pdf', Authorization: 'Bearer token-de-teste' });
    expect(init.signal).toBeDefined(); // o mesmo tempo limite dos outros pedidos
  });

  it('com o token expirado (401) tenta outra vez com um token novo', async () => {
    fetchFalso.mockResolvedValueOnce(respostaErro(401));

    await pedirBytes('/api/relatorios/mes/2026-10.pdf', 'application/pdf');

    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(fetchFalso.mock.calls[1][1].headers.Authorization).toBe('Bearer token-novo');
  });

  it('os erros da API passam a ErroApi com a mensagem em português', async () => {
    fetchFalso.mockResolvedValueOnce(respostaErro(400, { status: 400, detail: 'Ainda não há relatório para um mês futuro.' }));

    const erro = await pedirBytes('/api/relatorios/mes/2027-01.pdf', 'application/pdf').catch((e) => e);

    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ estado: 400, message: 'Ainda não há relatório para um mês futuro.' });
  });

  it('sem ligação ao servidor dá uma mensagem clara', async () => {
    fetchFalso.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(pedirBytes('/api/relatorios/mes/2026-10.pdf', 'application/pdf')).rejects.toMatchObject({
      estado: 0,
      message: 'Sem ligação ao servidor. Verifica a internet e tenta outra vez.',
    });
  });
});

describe('exportarRelatorioPdf', () => {
  it('guarda o PDF do mês com o nome financas-AAAA-MM.pdf', async () => {
    await exportarRelatorioPdf('2026-10');

    expect(fetchFalso.mock.calls[0][0]).toBe('http://localhost:5080/api/relatorios/mes/2026-10.pdf');
    expect(guardarFicheiro).toHaveBeenCalledWith(expect.any(Uint8Array), 'financas-2026-10.pdf', 'application/pdf', {
      modo: 'descarregar',
      titulo: 'Exportar PDF',
      uti: 'com.adobe.pdf',
    });
    expect(nomeRelatorioPdf('2025-01')).toBe('financas-2025-01.pdf');
  });

  it('se a API falhar, não guarda nada', async () => {
    fetchFalso.mockResolvedValueOnce(respostaErro(500));

    await expect(exportarRelatorioPdf('2026-10')).rejects.toBeInstanceOf(ErroApi);
    expect(guardarFicheiro).not.toHaveBeenCalled();
  });

  it('a mensagem de erro inclui o motivo da API', () => {
    expect(mensagemErroPdf(new ErroApi('Sem ligação ao servidor.', 0))).toBe('Não foi possível exportar o PDF. Sem ligação ao servidor.');
    expect(mensagemErroPdf(new Error('boom'))).toBe('Não foi possível exportar o PDF.');
  });
});
