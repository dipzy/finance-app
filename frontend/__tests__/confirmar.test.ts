import { Alert, AlertButton, Platform } from 'react-native';
import { confirmar } from '../utils/confirmar';

// Simula a escolha de um botão no Alert do telemóvel
function escolherNoAlert(texto: string) {
  return jest.spyOn(Alert, 'alert').mockImplementation((_titulo, _mensagem, botoes?: AlertButton[]) => {
    botoes?.find((b) => b.text === texto)?.onPress?.();
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('confirmar no telemóvel (Alert)', () => {
  it('mostra Cancelar e o botão de confirmar com o texto pedido', async () => {
    const alerta = escolherNoAlert('Apagar');
    expect(await confirmar('Apagar despesa', 'O valor volta para a conta.', 'Apagar')).toBe(true);
    expect(alerta).toHaveBeenCalledWith(
      'Apagar despesa',
      'O valor volta para a conta.',
      [expect.objectContaining({ text: 'Cancelar' }), expect.objectContaining({ text: 'Apagar' })],
      expect.objectContaining({ cancelable: true })
    );
  });

  it('Cancelar devolve false', async () => {
    escolherNoAlert('Cancelar');
    expect(await confirmar('Terminar despesa', '...')).toBe(false);
  });

  it('fechar o alerta sem escolher (Android) também devolve false', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, _b, opcoes) => opcoes?.onDismiss?.());
    expect(await confirmar('Terminar despesa', '...')).toBe(false);
  });
});

describe('confirmar na web (window.confirm)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web');
  });

  it.each([true, false])('devolve a resposta do window.confirm (%s)', async (resposta) => {
    const confirm = jest.fn(() => resposta);
    (globalThis as any).window.confirm = confirm;
    expect(await confirmar('Apagar despesa', 'O valor volta para a conta.')).toBe(resposta);
    expect(confirm).toHaveBeenCalledWith('Apagar despesa\n\nO valor volta para a conta.');
  });
});
