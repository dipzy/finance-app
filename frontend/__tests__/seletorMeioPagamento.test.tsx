// "Pagar com": só aparece a quem tem cartão de alimentação ligado no Salário
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { act, ReactElement } from 'react';
import { Text } from 'react-native';
import { SeletorMeioPagamento } from '../components/SeletorMeioPagamento';
import { useTemCartao } from '../services/saldoCartao';
import type { MeioPagamento } from '../services/tipos';

const tem = useTemCartao as unknown as jest.Mock;

interface No {
  props: Record<string, any>;
}
const renderer: { create(elemento: ReactElement): { root: { findAllByType(tipo: unknown): No[] }; unmount(): void } } = require('react-test-renderer');

async function desenhar(valor: MeioPagamento, onChange = jest.fn()) {
  let ecra!: ReturnType<typeof renderer.create>;
  await act(async () => {
    ecra = renderer.create(<SeletorMeioPagamento valor={valor} onChange={onChange} saldoConta={100} saldoCartao={50} />);
  });
  return { ecra, textos: () => ecra.root.findAllByType(Text).map((t) => [t.props.children].flat(Infinity).join('')), onChange };
}

afterEach(() => tem.mockReturnValue(true));

describe('SeletorMeioPagamento', () => {
  it('com cartão mostra a conta e o cartão, cada um com o seu saldo', async () => {
    tem.mockReturnValue(true);
    const { textos } = await desenhar('conta');
    expect(textos()).toEqual(expect.arrayContaining(['Pagar com', 'Conta · 100.00 €', 'Cartão de alimentação · 50.00 €']));
  });

  it('sem cartão não aparece nada (só há a conta)', async () => {
    tem.mockReturnValue(false);
    const { textos } = await desenhar('conta');
    expect(textos()).toEqual([]);
  });

  it('enquanto não se sabe se há cartão também não aparece', async () => {
    tem.mockReturnValue(undefined);
    const { textos } = await desenhar('conta');
    expect(textos()).toEqual([]);
  });

  it('um gasto já pago com o cartão continua a mostrá-lo, mesmo depois de o cartão ser desligado', async () => {
    tem.mockReturnValue(false);
    const { textos } = await desenhar('cartaoAlimentacao');
    expect(textos()).toContain('Cartão de alimentação · 50.00 €');
  });

  it('se o cartão foi desligado depois de o escolher, volta à conta', async () => {
    tem.mockReturnValue(false);
    const { onChange } = await desenhar('cartaoAlimentacao');
    expect(onChange).toHaveBeenCalledWith('conta');
  });

  it('com cartão, ou sem saber, não troca o meio escolhido', async () => {
    tem.mockReturnValue(true);
    const com = await desenhar('cartaoAlimentacao');
    expect(com.onChange).not.toHaveBeenCalled();
    tem.mockReturnValue(undefined);
    const semSaber = await desenhar('cartaoAlimentacao');
    expect(semSaber.onChange).not.toHaveBeenCalled();
  });
});
