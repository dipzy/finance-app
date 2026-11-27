// O ecrã Definições e o ecrã de bloqueio, com as notificações e a impressão digital substituídas

jest.setTimeout(20_000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);
jest.mock('../services/notificacoes', () => ({
  notificacoesDisponiveis: true,
  estadoPermissao: jest.fn(async () => 'por-pedir'),
  pedirPermissao: jest.fn(async () => true),
  reagendarNotificacoes: jest.fn(async () => []),
  testarNotificacao: jest.fn(async () => true),
}));
jest.mock('../services/bloqueio', () => ({
  ...jest.requireActual('../services/bloqueio'),
  bloqueioDisponivel: true,
  verificarSuporte: jest.fn(async () => ({ pode: true, biometria: true })),
  autenticar: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../services/tema', () => ({ mudarTema: jest.fn(async () => false) }));
jest.mock('../utils/confirmar', () => ({ confirmar: jest.fn(async () => true) }));
jest.mock('../utils/helpers', () => ({ mostrarAlerta: jest.fn() }));
jest.mock('../contexts/AuthContext', () => {
  const sessao = {
    user: { id: 'u1', email: 'ana@exemplo.pt', name: 'Ana Silva' },
    isAuthenticated: true,
    isLoading: false,
    logout: jest.fn(async () => undefined),
    apagarConta: jest.fn(),
  };
  return { useAuth: () => sessao };
});
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
    useFocusEffect: (efeito: () => void) => useEffect(efeito, [efeito]),
    usePathname: () => '/definicoes',
  };
});
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { act, ReactElement } from 'react';
import { AppState, Switch, Text, TextInput } from 'react-native';
import DefinicoesScreen from '../app/(tabs)/definicoes';
import { BloqueioApp } from '../components/BloqueioApp';
import { useAuth } from '../contexts/AuthContext';
import { autenticar, verificarSuporte } from '../services/bloqueio';
import { __reporDefinicoes, DEFINICOES_PADRAO, guardarDefinicoes, obterDefinicoes } from '../services/definicoes';
import { pedirPermissao, reagendarNotificacoes } from '../services/notificacoes';
import { mudarTema } from '../services/tema';
import { confirmar } from '../utils/confirmar';
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

const interruptor = (ecra: ReactTestRenderer, titulo: string) => {
  const s = ecra.root.findAllByType(Switch).find((n) => n.props.accessibilityLabel === titulo);
  if (!s) throw new Error(`Sem o interruptor "${titulo}"`);
  return s;
};

async function mudar(ecra: ReactTestRenderer, titulo: string, valor: boolean) {
  await act(async () => {
    await interruptor(ecra, titulo).props.onValueChange(valor);
  });
}

async function fechar(ecra: ReactTestRenderer) {
  await act(async () => {
    ecra.unmount();
  });
}

async function carregar(ecra: ReactTestRenderer, texto: string) {
  const alvo = ecra.root.findAllByType(Text).find((t) => textoDe(t) === texto);
  if (!alvo) throw new Error(`Sem o texto "${texto}" no ecrã`);
  let no: No | null = alvo;
  while (no && !no.props.onPress) no = no.parent;
  await act(async () => {
    await no!.props.onPress();
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  __reporDefinicoes();
  await AsyncStorage.clear();
});

describe('Ecrã Definições', () => {
  it('mostra os lembretes e o bloqueio, tudo desligado por defeito', async () => {
    const ecra = await desenhar(<DefinicoesScreen />);
    const t = textos(ecra);
    expect(t).toEqual(expect.arrayContaining(['Lembretes', 'Lembrar pagamentos', 'Também no próprio dia', 'Segurança', 'Bloquear a app']));
    expect(interruptor(ecra, 'Lembrar pagamentos').props.value).toBe(false);
    expect(interruptor(ecra, 'Também no próprio dia').props.disabled).toBe(true);
    expect(interruptor(ecra, 'Bloquear a app').props.value).toBe(false);
    // O tempo do bloqueio só aparece com o bloqueio ligado
    expect(t).not.toContain('Imediatamente');
    await fechar(ecra);
  });

  it('tem a Aparência (Sistema / Claro / Escuro), com a escolha atual marcada', async () => {
    const ecra = await desenhar(<DefinicoesScreen />);
    expect(textos(ecra)).toEqual(expect.arrayContaining(['Aparência', 'Sistema', 'Claro', 'Escuro']));
    const opcao = (nome: string) => (ecra.root as any).findAll((n: No) => n.props.accessibilityLabel === `Aparência: ${nome}` && n.props.onPress)[0] as No;
    expect(opcao('Sistema').props.ativo).toBe(true);
    expect(opcao('Claro').props.ativo).toBe(false);

    await act(async () => {
      await opcao('Claro').props.onPress();
    });
    expect(mudarTema).toHaveBeenCalledWith('claro');
    await fechar(ecra);
  });

  it('ligar os lembretes explica, pede a permissão e agenda', async () => {
    const ecra = await desenhar(<DefinicoesScreen />);
    await mudar(ecra, 'Lembrar pagamentos', true);
    expect(confirmar).toHaveBeenCalledWith('Lembretes de pagamentos', expect.stringContaining('às 9h'), 'Continuar');
    expect(pedirPermissao).toHaveBeenCalled();
    expect((await obterDefinicoes()).notificacoes).toBe(true);
    expect(reagendarNotificacoes).toHaveBeenCalled();
    expect(interruptor(ecra, 'Lembrar pagamentos').props.value).toBe(true);
    expect(interruptor(ecra, 'Também no próprio dia').props.disabled).toBe(false);
    expect(textos(ecra)).toContain('Sem lembretes agendados para já.');
    await fechar(ecra);
  });

  it('sem autorização do Android os lembretes ficam desligados', async () => {
    (pedirPermissao as jest.Mock).mockResolvedValueOnce(false);
    const ecra = await desenhar(<DefinicoesScreen />);
    await mudar(ecra, 'Lembrar pagamentos', true);
    expect(mostrarAlerta).toHaveBeenCalledWith('Sem autorização para notificações', expect.any(String));
    expect((await obterDefinicoes()).notificacoes).toBe(false);
    await fechar(ecra);
  });

  it('ligar o bloqueio confirma com a impressão digital e mostra o tempo', async () => {
    const ecra = await desenhar(<DefinicoesScreen />);
    await mudar(ecra, 'Bloquear a app', true);
    expect(autenticar).toHaveBeenCalled();
    expect((await obterDefinicoes()).bloqueio).toBe(true);
    expect(textos(ecra)).toEqual(expect.arrayContaining(['Imediatamente', '1 minuto', '5 minutos']));

    await carregar(ecra, '5 minutos');
    expect((await obterDefinicoes()).bloqueioMinutos).toBe(5);
    await fechar(ecra);
  });

  it('sem impressão digital nem PIN no telemóvel não deixa ligar o bloqueio', async () => {
    (verificarSuporte as jest.Mock).mockResolvedValue({ pode: false, motivo: 'Este telemóvel não tem bloqueio do ecrã.' });
    const ecra = await desenhar(<DefinicoesScreen />);
    expect(textos(ecra)).toContain('Este telemóvel não tem bloqueio do ecrã.');
    expect(interruptor(ecra, 'Bloquear a app').props.disabled).toBe(true);
    await mudar(ecra, 'Bloquear a app', true);
    expect(autenticar).not.toHaveBeenCalled();
    expect((await obterDefinicoes()).bloqueio).toBe(false);
    (verificarSuporte as jest.Mock).mockResolvedValue({ pode: true, biometria: true });
    await fechar(ecra);
  });
});

const botao = (ecra: ReactTestRenderer, titulo: string) => {
  const alvo = ecra.root.findAllByType(Text).filter((t) => textoDe(t) === titulo).pop();
  if (!alvo) throw new Error(`Sem o botão "${titulo}"`);
  let no: No | null = alvo;
  while (no && !no.props.onPress) no = no.parent;
  return no!;
};

async function escreverApagar(ecra: ReactTestRenderer, texto: string) {
  const campo = ecra.root.findAllByType(TextInput).find((c) => c.props.accessibilityLabel === 'Escreve APAGAR para confirmar') as unknown as No;
  await act(async () => {
    campo.props.onChangeText(texto);
  });
}

describe('Avisos do servidor (push)', () => {
  it('ligar explica, pede a permissão e só então guarda a opção', async () => {
    const ecra = await desenhar(<DefinicoesScreen />);
    expect(interruptor(ecra, 'Avisos do servidor').props.value).toBe(false);

    await mudar(ecra, 'Avisos do servidor', true);
    expect(confirmar).toHaveBeenCalledWith('Avisos do servidor', expect.stringContaining('identificador deste telemóvel'), 'Continuar');
    expect(pedirPermissao).toHaveBeenCalled();
    expect((await obterDefinicoes()).alertasServidor).toBe(true);
    expect(interruptor(ecra, 'Avisos do servidor').props.value).toBe(true);

    await mudar(ecra, 'Avisos do servidor', false);
    expect((await obterDefinicoes()).alertasServidor).toBe(false);
    await fechar(ecra);
  });

  it('sem autorização do sistema a opção fica desligada e explica o que fazer', async () => {
    (pedirPermissao as jest.Mock).mockResolvedValueOnce(false);
    const ecra = await desenhar(<DefinicoesScreen />);
    await mudar(ecra, 'Avisos do servidor', true);
    expect(mostrarAlerta).toHaveBeenCalledWith('Sem autorização para notificações', expect.any(String));
    expect((await obterDefinicoes()).alertasServidor).toBe(false);
    await fechar(ecra);
  });
});

describe('Regras e alertas nas Definições', () => {
  it('têm cartões que abrem os ecrãs das regras e dos alertas', async () => {
    const ecra = await desenhar(<DefinicoesScreen />);
    expect(textos(ecra)).toEqual(expect.arrayContaining(['Regras de categorização', 'Alertas']));
    await carregar(ecra, 'Ver regras');
    expect(router.push).toHaveBeenCalledWith('/(tabs)/regras-categoria');
    await carregar(ecra, 'Ver alertas');
    expect(router.push).toHaveBeenCalledWith('/(tabs)/alertas');
    await fechar(ecra);
  });
});

describe('Zona de perigo: apagar todos os dados e a conta', () => {
  const apagarConta = () => (useAuth() as unknown as { apagarConta: jest.Mock }).apagarConta;

  beforeEach(() => {
    apagarConta().mockReset();
    (useAuth() as any).logout.mockClear();
  });

  async function abrirModal() {
    const ecra = await desenhar(<DefinicoesScreen />);
    expect(textos(ecra)).toContain('Zona de perigo');
    await carregar(ecra, 'Apagar todos os dados e a conta');
    return ecra;
  }

  it('o modal explica o que se perde e o botão só liga ao escrever APAGAR', async () => {
    const ecra = await abrirModal();
    expect(textos(ecra)).toEqual(expect.arrayContaining(['Isto não se pode desfazer. Vais perder para sempre:', 'Escreve APAGAR para confirmar']));
    expect(botao(ecra, 'Apagar tudo').props.disabled).toBe(true);

    await escreverApagar(ecra, 'apagar');
    expect(botao(ecra, 'Apagar tudo').props.disabled).toBe(true);
    await escreverApagar(ecra, 'APAGAR');
    expect(botao(ecra, 'Apagar tudo').props.disabled).toBe(false);
    await fechar(ecra);
  });

  it('cancelar a segunda confirmação não apaga nada', async () => {
    (confirmar as jest.Mock).mockResolvedValueOnce(false);
    const ecra = await abrirModal();
    await escreverApagar(ecra, 'APAGAR');
    await carregar(ecra, 'Apagar tudo');
    expect(confirmar).toHaveBeenCalledWith('Última confirmação', expect.any(String), 'Apagar tudo');
    expect(apagarConta()).not.toHaveBeenCalled();
    await fechar(ecra);
  });

  it('confirmação dupla → apaga e volta ao login', async () => {
    apagarConta().mockResolvedValue({ estado: 'apagada' });
    const ecra = await abrirModal();
    await escreverApagar(ecra, 'APAGAR');
    await carregar(ecra, 'Apagar tudo');

    expect(apagarConta()).toHaveBeenCalledTimes(1);
    expect(mostrarAlerta).toHaveBeenCalledWith('Conta apagada', expect.any(String));
    expect(router.replace).toHaveBeenCalledWith('/login');
    await fechar(ecra);
  });

  it('a API recusou: nada foi apagado, o modal fica aberto e diz-se', async () => {
    apagarConta().mockResolvedValue({ estado: 'erro-servidor', mensagem: 'Erro no servidor.' });
    const ecra = await abrirModal();
    await escreverApagar(ecra, 'APAGAR');
    await carregar(ecra, 'Apagar tudo');

    expect(mostrarAlerta).toHaveBeenCalledWith('Erro', expect.stringContaining('Não foi apagado nada'));
    expect(router.replace).not.toHaveBeenCalled();
    expect(textos(ecra)).toContain('Escreve APAGAR para confirmar');
    await fechar(ecra);
  });

  it('o Firebase pediu novo login depois de a API apagar: diz o que fazer e volta ao login', async () => {
    apagarConta().mockResolvedValue({ estado: 'acesso-por-apagar', motivo: 'novo-login' });
    const ecra = await abrirModal();
    await escreverApagar(ecra, 'APAGAR');
    await carregar(ecra, 'Apagar tudo');

    expect(mostrarAlerta).toHaveBeenCalledWith('Dados apagados', expect.stringContaining('Entra outra vez com a tua password'));
    expect(router.replace).toHaveBeenCalledWith('/login');
    await fechar(ecra);
  });

  it('sessão antiga: nada foi apagado e oferece sair para entrar outra vez', async () => {
    apagarConta().mockResolvedValue({ estado: 'sessao-antiga' });
    const ecra = await abrirModal();
    await escreverApagar(ecra, 'APAGAR');
    await carregar(ecra, 'Apagar tudo');

    expect(confirmar).toHaveBeenCalledWith('Entra outra vez primeiro', expect.stringContaining('Ainda não foi apagado nada'), 'Sair agora');
    expect((useAuth() as any).logout).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/login');
    await fechar(ecra);
  });
});

describe('Ecrã de bloqueio', () => {
  // No mock do React Native o AppState não tem estado: a app está à frente
  beforeAll(() => {
    (AppState as { currentState: unknown }).currentState = 'active';
  });

  const Conteudo = () => <Text>Saldo secreto</Text>;

  it('com o bloqueio desligado mostra a app', async () => {
    await guardarDefinicoes(DEFINICOES_PADRAO);
    const ecra = await desenhar(
      <BloqueioApp>
        <Conteudo />
      </BloqueioApp>
    );
    expect(textos(ecra)).toContain('Saldo secreto');
    expect(textos(ecra)).not.toContain('App bloqueada');
    await fechar(ecra);
  });

  it('com a sessão restaurada fica bloqueada até confirmar a impressão digital', async () => {
    jest.useFakeTimers();
    await guardarDefinicoes({ bloqueio: true });
    (autenticar as jest.Mock).mockResolvedValueOnce({ ok: false, cancelado: true, semBloqueio: false, mensagem: '' });
    const ecra = await desenhar(
      <BloqueioApp>
        <Conteudo />
      </BloqueioApp>
    );
    expect(textos(ecra)).toContain('App bloqueada');

    // Pede logo a impressão digital; cancelada, fica bloqueada
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(autenticar).toHaveBeenCalledTimes(1);
    expect(textos(ecra)).toContain('App bloqueada');

    await carregar(ecra, 'Desbloquear');
    expect(textos(ecra)).not.toContain('App bloqueada');
    await fechar(ecra);
    jest.useRealTimers();
  });

  it('dá para sair da conta no ecrã de bloqueio', async () => {
    await guardarDefinicoes({ bloqueio: true });
    (autenticar as jest.Mock).mockResolvedValue({ ok: false, cancelado: true, semBloqueio: false, mensagem: '' });
    const ecra = await desenhar(
      <BloqueioApp>
        <Conteudo />
      </BloqueioApp>
    );
    await carregar(ecra, 'Sair da conta');
    expect(useAuth().logout).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/login');
    (autenticar as jest.Mock).mockResolvedValue({ ok: true });
    await fechar(ecra);
  });
});
