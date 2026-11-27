// O primeiro render carrega o React Native todo: com a cache do jest vazia (ex.: no CI) passa dos 5 s
jest.setTimeout(20_000);

// O pagamento parcial no modal de editar uma despesa fixa: só deixa pagar até ao que falta,
// lê valores com milhares ("1.234,56") e não aparece quando a despesa já está paga.

jest.mock('../utils/helpers', () => ({ ...jest.requireActual('../utils/formatos'), mostrarAlerta: jest.fn() }));
jest.mock('../utils/confirmar', () => ({ confirmar: jest.fn(async () => true) }));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
// O seletor de grupo vai à API (grupos e membros): fica de fora, aqui só interessa o pagamento parcial
jest.mock('../components/partilhado/DivisaoGrupo', () => ({ DivisaoGrupo: () => null }));

import { act, ReactElement } from 'react';
import { Text, TextInput } from 'react-native';
import { EditarDespesaMensalModal } from '../components/EditarDespesaMensalModal';
import type { Despesa } from '../services/tipos';
import { mostrarAlerta } from '../utils/helpers';

interface No {
  props: Record<string, any>;
  parent: No | null;
}
interface ReactTestRenderer {
  root: { findAllByType(tipo: unknown): No[] };
  unmount(): void;
}
const renderer: { create(elemento: ReactElement): ReactTestRenderer } = require('react-test-renderer');

const textoDe = (no: No) => [no.props.children].flat(Infinity).join('');
const textos = (ecra: ReactTestRenderer) => ecra.root.findAllByType(Text).map(textoDe);

async function desenhar(elemento: ReactElement) {
  let ecra!: ReactTestRenderer;
  await act(async () => {
    ecra = renderer.create(elemento);
  });
  return ecra;
}

async function escrever(ecra: ReactTestRenderer, rotulo: string, texto: string) {
  const campo = ecra.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === rotulo);
  if (!campo) throw new Error(`Sem o campo "${rotulo}"`);
  await act(async () => {
    campo.props.onChangeText(texto);
  });
}

async function carregar(ecra: ReactTestRenderer, texto: string) {
  const alvo = ecra.root.findAllByType(Text).find((t) => textoDe(t) === texto);
  if (!alvo) throw new Error(`Sem o texto "${texto}"`);
  let no: No | null = alvo;
  while (no && !no.props.onPress) no = no.parent;
  await act(async () => {
    await no!.props.onPress();
  });
}

const renda = { id: 'f1', titulo: 'Renda', valor: 1500 } as Despesa;

function modal(emFalta: number, onDebitarParcial = jest.fn(async () => undefined)) {
  return (
    <EditarDespesaMensalModal
      despesa={renda}
      pagaEsteMes={emFalta < renda.valor}
      emFalta={emFalta}
      onFechar={jest.fn()}
      onGuardar={jest.fn(async () => undefined)}
      onApagar={jest.fn(async () => undefined)}
      onDebitarParcial={onDebitarParcial}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EditarDespesaMensalModal: pagamento parcial', () => {
  it('lê "1.234,56" como mil duzentos e trinta e quatro euros', async () => {
    const debitar = jest.fn(async () => undefined);
    const ecra = await desenhar(modal(1500, debitar));

    await carregar(ecra, 'Pagar parcialmente');
    await escrever(ecra, 'Valor parcial em euros', '1.234,56');
    await carregar(ecra, 'Confirmar');

    expect(debitar).toHaveBeenCalledWith(renda, 1234.56);
    expect(mostrarAlerta).not.toHaveBeenCalled();
    await act(async () => ecra.unmount());
  });

  it('com parte já paga, recusa pagar mais do que falta e deixa pagar exatamente o resto', async () => {
    const debitar = jest.fn(async () => undefined);
    const ecra = await desenhar(modal(500, debitar));

    await carregar(ecra, 'Pagar parcialmente');
    await escrever(ecra, 'Valor parcial em euros', '600');
    await carregar(ecra, 'Confirmar');
    expect(debitar).not.toHaveBeenCalled();
    expect(mostrarAlerta).toHaveBeenCalledWith('Erro', 'O valor parcial não pode ser maior do que falta pagar (500,00 €).');

    await escrever(ecra, 'Valor parcial em euros', '500');
    await carregar(ecra, 'Confirmar');
    expect(debitar).toHaveBeenCalledWith(renda, 500);
    await act(async () => ecra.unmount());
  });

  it('não mostra "Pagar parcialmente" quando a despesa já está paga', async () => {
    const ecra = await desenhar(modal(0));
    expect(textos(ecra)).not.toContain('Pagar parcialmente');
    await act(async () => ecra.unmount());
  });
});
