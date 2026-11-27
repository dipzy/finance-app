// O primeiro render carrega o React Native todo: com a cache do jest vazia (ex.: no CI) passa dos 5 s
jest.setTimeout(20_000);

// Sem rede: a API é falsa (test-utils/apiFalsa.ts) e só se verifica o que o ecrã lhe envia
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);
jest.mock('../services/notificacoes', () => ({ reagendarNotificacoes: jest.fn(async () => null) }));
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));
jest.mock('../contexts/AuthContext', () => {
  const sessao = { user: { id: 'ecra-importar', email: 'teste@exemplo.pt', name: 'Teste' }, logout: jest.fn() };
  return { useAuth: () => sessao };
});
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    useFocusEffect: (efeito: () => void) => useEffect(efeito, [efeito]),
    // O menu lateral destaca o ecrã atual
    usePathname: () => '/importar',
  };
});
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
// Os ícones carregam a fonte depois de aparecerem (avisos de act fora do teste); aqui não interessam
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
jest.mock('../utils/lerFicheiro', () => ({ lerFicheiro: jest.fn() }));

import * as DocumentPicker from 'expo-document-picker';
import { act, ReactElement } from 'react';
import { Text } from 'react-native';
import ImportarScreen from '../app/(tabs)/importar';
import { ApiFalsa, instalarApiFalsa } from '../test-utils/apiFalsa';
import { livroDeTeste } from '../test-utils/livroExcel';
import { reagendarNotificacoes } from '../services/notificacoes';
import { lerFicheiro } from '../utils/lerFicheiro';

// O ecrã de ponta a ponta: escolher o ficheiro, a folha e o mês, ver a pré-visualização e importar

// O react-test-renderer não tem tipos instalados: só o que este teste usa
interface No {
  props: Record<string, any>;
  parent: No | null;
}
interface ReactTestRenderer {
  root: { findAllByType(tipo: unknown): No[]; findAll(teste: (n: No) => boolean): No[] };
}
const renderer: { create(elemento: ReactElement): ReactTestRenderer } = require('react-test-renderer');

const textoDe = (no: No) => [no.props.children].flat(Infinity).join('');
const textos = (ecra: ReactTestRenderer) => ecra.root.findAllByType(Text).map(textoDe);

// Carrega no botão (ou chip) que tem este texto
async function carregar(ecra: ReactTestRenderer, texto: string) {
  const alvo = ecra.root.findAllByType(Text).find((t) => textoDe(t) === texto);
  if (!alvo) throw new Error(`Sem o texto "${texto}" no ecrã`);
  let no: No | null = alvo;
  while (no && !no.props.onPress) no = no.parent;
  await act(async () => {
    await no!.props.onPress();
  });
}

// Carrega no botão que só tem um ícone, pelo nome que o leitor de ecrã anuncia
async function carregarIcone(ecra: ReactTestRenderer, rotulo: string) {
  const [alvo] = ecra.root.findAll((n) => n.props.accessibilityLabel === rotulo && !!n.props.onPress);
  if (!alvo) throw new Error(`Sem o botão "${rotulo}" no ecrã`);
  await act(async () => {
    await alvo.props.onPress();
  });
}

let api: ApiFalsa;

// O que a API responde depois de gravar a folha "Março Ana" (a gravação é testada na API:
// backend/tests/Financas.Services.Tests/FolhaMesTests.cs)
const resumoMarco = {
  mes: '2026-03',
  despesasCriadas: ['Renda', 'Internet', 'Luz'],
  pagamentosRegistados: 3,
  extrasRegistadas: 4,
  anuaisCriadas: ['Seguro carro', 'IUC'],
  historico: ['Lucro', 'Poupança', 'Saldo Poupança', 'Total a pagar', 'Saldo Conta'],
  poupancasAtualizadas: [],
  dividasAtualizadas: [],
  porPagar: [],
  ignoradas: [],
};

beforeEach(() => {
  api = instalarApiFalsa();
  api.responder('GET', '/api/conta/saldo', { saldo: 500 });
  api.responder('POST', '/api/folha/2026-03/importar', resumoMarco);
  // Só a data é falsa: o React e as animações precisam dos temporizadores verdadeiros
  jest.useFakeTimers({
    now: new Date(2026, 9, 5, 12),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ name: 'financas.xlsx', uri: 'file:///cache/financas.xlsx', lastModified: 0 }],
  });
  (lerFicheiro as jest.Mock).mockResolvedValue(livroDeTeste());
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ecrã Importar Excel', () => {
  it('escolhe o ficheiro, a folha e o mês, mostra o que vai ser importado e importa', async () => {
    let ecra!: ReactTestRenderer;
    await act(async () => {
      ecra = renderer.create(<ImportarScreen />);
    });

    await carregar(ecra, 'Escolher ficheiro');
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ copyToCacheDirectory: true }));
    expect(textos(ecra)).toEqual(expect.arrayContaining(['financas.xlsx · 3 folhas', 'Março Ana', 'Abril Ana', 'Notas']));

    // O mês vem do nome da folha
    await carregar(ecra, 'Abril Ana');
    expect(textos(ecra)).toEqual(expect.arrayContaining(['Abril 2026', 'Sugerido pelo nome da folha']));
    await carregarIcone(ecra, 'Mês anterior');
    expect(textos(ecra)).toEqual(expect.arrayContaining(['Março 2026', 'Usar Abril 2026 (pelo nome da folha)']));

    const ecraTexto = textos(ecra);
    expect(ecraTexto).toEqual(
      expect.arrayContaining([
        'Ao importar Março 2026:',
        '• 3 despesas fixas com o pagamento desse mês',
        '• 4 gastos do dia a dia desse mês',
        'Renda',
        'Alimentação (à parte, não conta)',
        '950.40 €', // Saldo Conta
        'Importar Março 2026',
      ])
    );
    expect(ecraTexto).not.toContain('1650.00 €'); // o total do Lucro não conta o cartão de alimentação

    await carregar(ecra, 'Importar Março 2026');
    expect(textos(ecra)).toEqual(expect.arrayContaining(['Março 2026 importado', 'Renda, Internet, Luz']));

    // A folha lida do Excel foi enviada para a API, com o mês escolhido
    const [pedido] = api.feitos('POST', '/api/folha/2026-03/importar');
    expect(pedido.corpo.dados.mes).toBe('2026-03');
    expect(pedido.corpo.dados.despesas.map((d: { titulo: string }) => d.titulo)).toEqual(['Renda', 'Internet', 'Luz']);
    expect(pedido.corpo.dados.despesasMes.reduce((s: number, d: { valor: number }) => s + d.valor, 0)).toBeCloseTo(163.45);
    expect(pedido.corpo.dados.saldoConta).toBe(950.4);
    // Os lembretes são agendados outra vez com as despesas importadas
    expect(reagendarNotificacoes).toHaveBeenCalled();
  });

  it('uma folha sem os blocos não deixa importar', async () => {
    let ecra!: ReactTestRenderer;
    await act(async () => {
      ecra = renderer.create(<ImportarScreen />);
    });
    await carregar(ecra, 'Escolher ficheiro');
    await carregar(ecra, 'Notas');
    expect(textos(ecra).some((t) => t.startsWith('Esta folha não tem os blocos do livro'))).toBe(true);
    // Só fica o título do ecrã ("Importar Excel"), sem o botão "Importar <mês>"
    expect(textos(ecra).filter((t) => t.startsWith('Importar'))).toEqual(['Importar Excel']);
    expect(api.feitos('POST', '/api/folha/2026-03/importar')).toHaveLength(0);
  });
});
