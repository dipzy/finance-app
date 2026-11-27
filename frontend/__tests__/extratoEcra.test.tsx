// Sem rede: a API é falsa (test-utils/apiFalsa.ts) e só se verifica o que o ecrã lhe envia e mostra
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);
jest.mock('../services/notificacoes', () => ({ reagendarNotificacoes: jest.fn(async () => null) }));
jest.mock('../services/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token-de-teste' } } }));
jest.mock('../contexts/AuthContext', () => {
  const sessao = { user: { id: 'ecra-extrato', email: 'teste@exemplo.pt', name: 'Teste' }, logout: jest.fn() };
  return { useAuth: () => sessao };
});
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    useFocusEffect: (efeito: () => void) => useEffect(efeito, [efeito]),
    usePathname: () => '/extrato',
  };
});
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
jest.mock('../utils/lerFicheiro', () => ({ lerFicheiro: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { act, ReactElement } from 'react';
import { Text } from 'react-native';
import ExtratoScreen from '../app/(tabs)/extrato';
import { ApiFalsa, instalarApiFalsa, type PedidoFalso } from '../test-utils/apiFalsa';
import { lerFicheiro } from '../utils/lerFicheiro';

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

async function carregar(ecra: ReactTestRenderer, texto: string, indice = 0) {
  const alvos = ecra.root.findAllByType(Text).filter((t) => textoDe(t) === texto);
  const alvo = alvos[indice < 0 ? alvos.length + indice : indice];
  if (!alvo) throw new Error(`Sem o texto "${texto}" no ecrã (há ${alvos.length})`);
  let no: No | null = alvo;
  while (no && !no.props.onPress) no = no.parent;
  if (!no) throw new Error(`"${texto}" não é carregável`);
  await act(async () => {
    await no!.props.onPress();
  });
}

// Carrega na caixa de um movimento (o Pressable com papel de checkbox e o nome do movimento)
async function alternar(ecra: ReactTestRenderer, descricao: string) {
  const [caixa] = ecra.root.findAll((n) => n.props.accessibilityRole === 'checkbox' && String(n.props.accessibilityLabel).startsWith(`${descricao},`));
  if (!caixa) throw new Error(`Sem a caixa de "${descricao}"`);
  await act(async () => {
    await caixa.props.onPress();
  });
}

const CSV = [
  'Extrato Combinado;;;;;',
  'Período;01-09-2026 a 30-09-2026;;;;',
  ';;;;;',
  'Data Mov.;Data Valor;Descrição;Débito;Crédito;Saldo',
  '05-09-2026;05-09-2026;COMPRA 1234 PINGO DOCE LISBOA;45,67;;1.234,56',
  '06-09-2026;06-09-2026;TRF DE JOAO SILVA;;1.500,00;2.734,56',
  '07-09-2026;07-09-2026;COMPRA ****4321 UBER *TRIP;12,30;;2.722,26',
  '08-09-2026;08-09-2026;PAG SERV 21456 EDP COMERCIAL;63,00;;2.659,26',
].join('\r\n');

const bytes = (texto: string) => Uint8Array.from(Buffer.from(texto, 'utf8'));

let api: ApiFalsa;

// A previsão da API: uma categoria por palavra-chave; ajustável por teste
function responderPrevisao(ajustar: (indice: number) => Record<string, unknown> = () => ({})) {
  api.responder('POST', '/api/despesas-extras/extrato/previsao', (p: PedidoFalso) => ({
    movimentos: p.corpo.movimentos.map((m: { descricao: string }, i: number) => ({
      categoria: /pingo/i.test(m.descricao) ? 'supermercado' : /uber/i.test(m.descricao) ? 'transportes' : 'outros',
      origem: 'palavra-chave',
      jaImportado: false,
      ...ajustar(i),
    })),
  }));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  api = instalarApiFalsa();
  api.responder('GET', '/api/conta/saldo', { saldo: 500 });
  responderPrevisao();
  api.responder('POST', '/api/despesas-extras/extrato', { importados: 3, jaImportados: 0, total: 120.97, meses: ['2026-09'] });
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ name: 'setembro.csv', uri: 'file:///cache/setembro.csv', lastModified: 0 }],
  });
  (lerFicheiro as jest.Mock).mockResolvedValue(bytes(CSV));
});

async function abrirComFicheiro(): Promise<ReactTestRenderer> {
  let ecra!: ReactTestRenderer;
  await act(async () => {
    ecra = renderer.create(<ExtratoScreen />);
  });
  await carregar(ecra, 'Escolher ficheiro');
  return ecra;
}

describe('ecrã Importar extrato', () => {
  it('lê o CSV, pede a previsão só das saídas e mostra-as com a categoria sugerida', async () => {
    const ecra = await abrirComFicheiro();

    const [pedido] = api.feitos('POST', '/api/despesas-extras/extrato/previsao');
    expect(pedido.corpo.movimentos).toEqual([
      { data: '2026-09-05', descricao: '1234 Pingo Doce Lisboa', valor: 45.67, ocorrencia: 0 },
      { data: '2026-09-07', descricao: 'Uber *trip', valor: 12.3, ocorrencia: 0 },
      { data: '2026-09-08', descricao: 'Pag Serv Edp Comercial', valor: 63, ocorrencia: 0 },
    ]);
    expect(textos(ecra)).toEqual(
      expect.arrayContaining([
        '3 saídas',
        'setembro.csv · de 05/09/2026 a 08/09/2026 · 1 entradas ignoradas',
        '1234 Pingo Doce Lisboa',
        '45.67 €',
        'Supermercado',
        'Transportes',
        '3 despesas · 120.97 €',
        'Importar 3 despesas',
        'A app reconheceu as colunas. Se os movimentos não estiverem certos, muda-as.',
      ])
    );
  });

  it('importa as saídas com a categoria e diz o que entrou; depois marca-as como já importadas', async () => {
    const ecra = await abrirComFicheiro();
    // Depois de importar, a API passa a dizer que estão importadas
    responderPrevisao(() => ({ jaImportado: true }));
    await carregar(ecra, 'Importar 3 despesas');

    const [importacao] = api.feitos('POST', '/api/despesas-extras/extrato');
    expect(importacao.corpo.movimentos.map((m: any) => [m.descricao, m.valor, m.categoria])).toEqual([
      ['1234 Pingo Doce Lisboa', 45.67, 'supermercado'],
      ['Uber *trip', 12.3, 'transportes'],
      ['Pag Serv Edp Comercial', 63, 'outros'],
    ]);
    expect(textos(ecra)).toEqual(expect.arrayContaining(['Importado', '3 despesas importadas (120.97 €) em Setembro 2026.']));
    expect(api.feitos('POST', '/api/despesas-extras/extrato/previsao')).toHaveLength(2); // a 2.ª atualiza o estado
    expect(textos(ecra).filter((t) => t === 'Já importado')).toHaveLength(3);

    await carregar(ecra, 'Ver as despesas');
    expect(router.push).toHaveBeenCalledWith('/(tabs)/despesas-extras');
  });

  it('desmarcar um movimento tira-o da importação', async () => {
    const ecra = await abrirComFicheiro();
    await alternar(ecra, '1234 Pingo Doce Lisboa');

    expect(textos(ecra)).toContain('Importar 2 despesas');
    await carregar(ecra, 'Importar 2 despesas');
    const [importacao] = api.feitos('POST', '/api/despesas-extras/extrato');
    expect(importacao.corpo.movimentos.map((m: any) => m.descricao)).toEqual(['Uber *trip', 'Pag Serv Edp Comercial']);
    // A ocorrência é contada no extrato inteiro, não só nos escolhidos
    expect(importacao.corpo.movimentos.every((m: any) => m.ocorrencia === 0)).toBe(true);
  });

  it('os que parecem repetir uma despesa já registada vêm desmarcados e com aviso', async () => {
    responderPrevisao((i) => (i === 2 ? { possivelDuplicadoDe: 'Conta da luz' } : {}));
    const ecra = await abrirComFicheiro();

    expect(textos(ecra)).toEqual(
      expect.arrayContaining([
        'Parece repetir «Conta da luz», que já registaste.',
        '1 parecem repetir despesas que já registaste: vêm desmarcadas, vê se são mesmo repetidas.',
        'Importar 2 despesas',
      ])
    );
    // A pessoa pode decidir importá-lo na mesma
    await alternar(ecra, 'Pag Serv Edp Comercial');
    expect(textos(ecra)).toContain('Importar 3 despesas');
  });

  it('os já importados ficam de fora e não se podem marcar', async () => {
    responderPrevisao((i) => (i === 0 ? { jaImportado: true } : {}));
    const ecra = await abrirComFicheiro();

    expect(textos(ecra)).toEqual(expect.arrayContaining(['Já importado', '1 já importadas (ficam de fora)', 'Importar 2 despesas']));
    const [caixa] = ecra.root.findAll((n) => n.props.accessibilityRole === 'checkbox' && String(n.props.accessibilityLabel).startsWith('1234 Pingo Doce Lisboa,'));
    expect(caixa.props.disabled).toBe(true);
  });

  it('mudar a categoria de um movimento muda o que se importa', async () => {
    const ecra = await abrirComFicheiro();

    // Tocar na categoria do Uber e escolher "Lazer"
    await carregar(ecra, 'Transportes');
    await carregar(ecra, 'Lazer', -1);
    expect(textos(ecra)).toContain('Lazer');

    await carregar(ecra, 'Importar 3 despesas');
    const [importacao] = api.feitos('POST', '/api/despesas-extras/extrato');
    expect(importacao.corpo.movimentos.map((m: any) => m.categoria)).toEqual(['supermercado', 'lazer', 'outros']);
  });

  it('lembra as colunas para o mesmo formato de ficheiro', async () => {
    const ecra = await abrirComFicheiro();
    await carregar(ecra, 'Importar 3 despesas');

    const guardados = JSON.parse((await AsyncStorage.getItem('extrato.mapeamentos.v1')) ?? '{}');
    const [mapeamento] = Object.values(guardados);
    expect(mapeamento).toEqual({ data: 0, descricao: 2, debito: 3, credito: 4 });
  });

  it('mudar as colunas lê o ficheiro outra vez e pede nova previsão', async () => {
    const ecra = await abrirComFicheiro();
    await carregar(ecra, 'Mudar as colunas');
    expect(textos(ecra)).toEqual(expect.arrayContaining(['Coluna da data', 'Coluna da descrição', 'O valor vem em', 'Débito e crédito']));

    // A data passa a ser a "Data Valor": os mesmos movimentos (as datas são iguais)
    await carregar(ecra, 'Data Valor', 0);
    expect(api.feitos('POST', '/api/despesas-extras/extrato/previsao')).toHaveLength(2);
  });

  it('um ficheiro que não é um extrato mostra o motivo', async () => {
    (lerFicheiro as jest.Mock).mockResolvedValue(bytes('isto não tem movimentos nenhuns'));
    const ecra = await abrirComFicheiro();
    expect(textos(ecra)).toContain('Não encontrei movimentos neste ficheiro. Confirma que é o extrato da conta em CSV ou OFX.');
    expect(api.feitos('POST', '/api/despesas-extras/extrato/previsao')).toHaveLength(0);
    expect(textos(ecra)).not.toContain('Importar 0 despesas');
  });

  it('cancelar a escolha do ficheiro não faz nada', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    const ecra = await abrirComFicheiro();
    expect(textos(ecra)).not.toContain('Extrato do banco · 0');
    expect(api.feitos('POST', '/api/despesas-extras/extrato/previsao')).toHaveLength(0);
  });

  it('um erro da API ao importar mostra o motivo e deixa tentar outra vez', async () => {
    api.responder('POST', '/api/despesas-extras/extrato', { status: 400, title: 'Pedido inválido', detail: 'x' }, 400);
    const ecra = await abrirComFicheiro();
    await carregar(ecra, 'Importar 3 despesas');
    expect(textos(ecra)).toContain('Não foi possível importar o extrato.');
    expect(textos(ecra)).toContain('Importar 3 despesas'); // o botão continua disponível
  });

  it('lê OFX sem pedir as colunas', async () => {
    const ofx = `<OFX><BANKTRANLIST>
<STMTTRN><DTPOSTED>20261005<TRNAMT>-45.67<NAME>PINGO DOCE</STMTTRN>
<STMTTRN><DTPOSTED>20261006<TRNAMT>1500.00<NAME>SALARIO</STMTTRN>
</BANKTRANLIST></OFX>`;
    (lerFicheiro as jest.Mock).mockResolvedValue(bytes(ofx));
    const ecra = await abrirComFicheiro();

    expect(textos(ecra)).toEqual(expect.arrayContaining(['1 saídas', 'Pingo Doce', '45.67 €']));
    expect(textos(ecra)).not.toContain('Colunas do ficheiro');
    expect(api.feitos('POST', '/api/despesas-extras/extrato/previsao')[0].corpo.movimentos).toEqual([
      { data: '2026-10-05', descricao: 'Pingo Doce', valor: 45.67, ocorrencia: 0 },
    ]);
  });

  it('um extrato só com entradas não tem nada para importar', async () => {
    (lerFicheiro as jest.Mock).mockResolvedValue(bytes('Data;Descrição;Valor\n05-10-2026;Salário;1.500,00\n06-10-2026;Reembolso;20,00'));
    const ecra = await abrirComFicheiro();
    expect(textos(ecra)).toContain('Não há saídas neste ficheiro (só entradas).');
    expect(textos(ecra).some((t) => /^Importar d+ despesas/.test(t))).toBe(false);
  });
});
