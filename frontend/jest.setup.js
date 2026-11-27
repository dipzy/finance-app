// Módulos nativos sem versão para os testes: as versões falsas que os próprios pacotes trazem
import React from 'react';
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);

// Sentry: módulo nativo, não existe nos testes (o services/erros.ts fica desligado sem DSN)
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setUser: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  withScope: jest.fn((fn) => fn({ setContext: jest.fn(), setTag: jest.fn(), setFingerprint: jest.fn() })),
  wrap: jest.fn((componente) => componente),
}));

// Mock do GruposContext para testes (o SideMenu usa useGrupos)
jest.mock('./contexts/ParceriasContext', () => ({
  useGrupos: () => ({
    grupos: [],
    poupancasPartilhadas: [],
    temGrupoOuPoupanca: false,
    resumo: null,
    convitesPendentes: 0,
    recarregar: jest.fn(async () => {}),
    isLoading: false,
  }),
  GruposProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Os ecrãs não fazem pedidos de grupos nos testes: os objetos ...DB respondem vazio e os helpers
// (eAdmin, mensagemDaApi) são uma cópia simples (o módulo verdadeiro carrega o Firebase). As rotas
// e os corpos dos pedidos são testados à parte em __tests__/servicosPartilhado.test.ts (jest.unmock)
jest.mock('./services/grupos', () => ({
  eAdmin: (role) => role?.toLowerCase() === 'admin',
  mensagemDaApi: (_erro, porDefeito) => porDefeito,
  GruposDB: {
    listar: jest.fn().mockResolvedValue([]),
    obter: jest.fn(),
    listarConvitesDoGrupo: jest.fn().mockResolvedValue([]),
    listarConvitesRecebidos: jest.fn().mockResolvedValue({ emailConfirmado: true, convites: [] }),
    convidar: jest.fn().mockResolvedValue({ id: '1' }),
    aceitarConvite: jest.fn().mockResolvedValue(undefined),
    recusarConvite: jest.fn().mockResolvedValue(undefined),
    cancelarConvite: jest.fn().mockResolvedValue(undefined),
    listarMembros: jest.fn().mockResolvedValue([]),
    removerMembro: jest.fn().mockResolvedValue(undefined),
    alterarRole: jest.fn().mockResolvedValue(undefined),
    criar: jest.fn().mockResolvedValue({ id: '1' }),
    alterar: jest.fn().mockResolvedValue(undefined),
    remover: jest.fn().mockResolvedValue(undefined),
    sair: jest.fn().mockResolvedValue(undefined),
  },
}));

// Os alertas (GET /api/alertas): os ecrãs não os pedem nos testes (os do serviço têm jest.unmock)
jest.mock('./services/alertas', () => ({
  AlertasDB: { listar: jest.fn().mockResolvedValue([]) },
  useAlertas: () => ({ alertas: [], erro: false, aCarregar: false, recarregar: jest.fn(async () => {}) }),
  atualizarAlertas: jest.fn(async () => {}),
  atualizarAlertasSeNecessario: jest.fn(async () => {}),
  limparAlertas: jest.fn(),
}));

// O saldo do cartão de alimentação do cabeçalho e do menu: nos testes dos ecrãs não há cartão (o do serviço tem jest.unmock)
// useTemCartao (esconde o que é do cartão a quem não o tem) é true por defeito; os testes do "sem cartão" mudam-no
jest.mock('./services/saldoCartao', () => ({
  useSaldoCartao: () => null,
  useTemCartao: jest.fn(() => true),
  publicarCartao: jest.fn(),
}));

jest.mock('./services/poupancasPartilhadas', () => ({
  PoupancasPartilhadasDB: {
    listarDoGrupo: jest.fn().mockResolvedValue([]),
    contribuicoes: jest.fn().mockResolvedValue([]),
    minhasContribuicoes: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('./services/partilhado', () => ({
  PartilhadoDB: {
    resumo: jest.fn().mockResolvedValue({
      mes: '2026-10', aReceber: 0, aPagar: 0, minhaParteMes: 0, pagoPorMimMes: 0, convitesPendentes: 0, grupos: [], mealheiros: [],
    }),
    saldos: jest.fn(),
    atividade: jest.fn().mockResolvedValue([]),
    aceitarDespesa: jest.fn().mockResolvedValue(undefined),
    aceitarEPagar: jest.fn().mockResolvedValue(undefined),
    criarAcerto: jest.fn().mockResolvedValue({ id: 'a1' }),
  },
}));

// Mock do Firebase para evitar erros de importação de ES modules
jest.mock('firebase/app', () => ({
  getApp: jest.fn(),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  Firestore: jest.fn(),
  getFirestore: jest.fn(),
  initializeFirestore: jest.fn(),
}));
// Os testes correm sempre com o tema escuro (o esquema do sistema não deve mudar as cores deles)
require('react-native').Appearance.getColorScheme = () => 'dark';
