// O saldo do cartão de alimentação no cabeçalho e no menu (services/saldoCartao.ts): lido uma vez e partilhado,
// refeito quando os dados mudam, e escondido a quem não usa o cartão.
jest.unmock('../services/saldoCartao');
jest.mock('../services/database', () => ({
  ContaCorrenteDB: { getCartaoAlimentacao: jest.fn() },
}));

import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { ContaCorrenteDB } from '../services/database';
import { emitir } from '../services/eventos';
import { __reporSaldoCartao, publicarCartao, useSaldoCartao, useTemCartao } from '../services/saldoCartao';

const ler = ContaCorrenteDB.getCartaoAlimentacao as jest.Mock;

function Mostra({ uid }: { uid?: string }) {
  const saldo = useSaldoCartao(uid);
  return <Text>{saldo === null ? 'sem cartão' : saldo.toFixed(2)}</Text>;
}

async function desenhar(uid: string | undefined) {
  let ecra!: ReturnType<typeof create>;
  await act(async () => {
    ecra = create(<Mostra uid={uid} />);
  });
  return ecra;
}

const texto = (ecra: ReturnType<typeof create>) => ecra.root.findByType(Text).props.children;

beforeEach(() => {
  __reporSaldoCartao();
  ler.mockReset();
});

function MostraTem({ uid }: { uid?: string }) {
  const tem = useTemCartao(uid);
  return <Text>{tem === undefined ? 'não sei' : tem ? 'tem cartão' : 'sem cartão'}</Text>;
}

describe('useTemCartao', () => {
  const desenharTem = async (uid: string | undefined) => {
    let ecra!: ReturnType<typeof create>;
    await act(async () => {
      ecra = create(<MostraTem uid={uid} />);
    });
    return ecra;
  };

  it('com cartão ligado (valor mensal acima de 0) há cartão', async () => {
    ler.mockResolvedValue({ saldo: 98.5, valorMensal: 160 });
    expect(texto(await desenharTem('u1'))).toBe('tem cartão');
  });

  it('sem cartão ligado (valor mensal 0) não há cartão, mesmo com saldo que sobrou', async () => {
    ler.mockResolvedValue({ saldo: 12, valorMensal: 0 });
    expect(texto(await desenharTem('u1'))).toBe('sem cartão');
  });

  it('enquanto não se sabe (ou sem sessão) fica por saber, e não por "sem cartão"', async () => {
    expect(texto(await desenharTem(undefined))).toBe('não sei');
  });

  it('se o cartão for desligado, passa a sem cartão sem nova leitura', async () => {
    ler.mockResolvedValue({ saldo: 98.5, valorMensal: 160 });
    const ecra = await desenharTem('u1');
    expect(texto(ecra)).toBe('tem cartão');

    await act(async () => {
      publicarCartao({ saldo: 98.5, valorMensal: 0, ultimaAtualizacao: '' });
    });

    expect(texto(ecra)).toBe('sem cartão');
  });
});

describe('useSaldoCartao', () => {
  it('lê o cartão à API e mostra o saldo', async () => {
    ler.mockResolvedValue({ saldo: 98.5, valorMensal: 160 });
    const ecra = await desenhar('u1');
    expect(texto(ecra)).toBe('98.50');
    expect(ler).toHaveBeenCalledTimes(1);
  });

  it('sem cartão configurado (valor mensal 0) não há saldo para mostrar', async () => {
    ler.mockResolvedValue({ saldo: 0, valorMensal: 0 });
    const ecra = await desenhar('u1');
    expect(texto(ecra)).toBe('sem cartão');
  });

  it('sem sessão não pede nada', async () => {
    const ecra = await desenhar(undefined);
    expect(ler).not.toHaveBeenCalled();
    expect(texto(ecra)).toBe('sem cartão');
  });

  it('dois sítios a mostrar o saldo fazem um só pedido', async () => {
    ler.mockResolvedValue({ saldo: 40, valorMensal: 160 });
    await desenhar('u1');
    await desenhar('u1');
    expect(ler).toHaveBeenCalledTimes(1);
  });

  it('um ecrã que leu o cartão publica-o e o cabeçalho acompanha, sem novo pedido', async () => {
    ler.mockResolvedValue({ saldo: 40, valorMensal: 160 });
    const ecra = await desenhar('u1');
    await act(async () => publicarCartao({ saldo: 12.3, valorMensal: 160 }));
    expect(texto(ecra)).toBe('12.30');
    expect(ler).toHaveBeenCalledTimes(1);
  });

  it('"dadosMudaram" (gasto novo com o cartão) volta a ler o saldo', async () => {
    ler.mockResolvedValue({ saldo: 40, valorMensal: 160 });
    const ecra = await desenhar('u1');
    ler.mockResolvedValue({ saldo: 25, valorMensal: 160 });
    await act(async () => emitir('dadosMudaram'));
    expect(texto(ecra)).toBe('25.00');
  });

  it('uma falha da API deixa o último saldo conhecido', async () => {
    ler.mockResolvedValue({ saldo: 40, valorMensal: 160 });
    const ecra = await desenhar('u1');
    ler.mockRejectedValue(new Error('sem rede'));
    await act(async () => emitir('dadosMudaram'));
    expect(texto(ecra)).toBe('40.00');
  });

  it('outra conta não herda o saldo da anterior', async () => {
    ler.mockResolvedValue({ saldo: 40, valorMensal: 160 });
    await desenhar('u1');
    ler.mockResolvedValue({ saldo: 0, valorMensal: 0 });
    const outra = await desenhar('u2');
    expect(texto(outra)).toBe('sem cartão');
  });
});
