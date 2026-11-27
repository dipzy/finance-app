// Modo de testes E2E (Playwright, pasta e2e/): a app salta o login do Firebase e fala com a API local
// pelo cabeçalho "X-Utilizador" (backend/src/Financas.Api/Autenticacao/AutenticacaoPorCabecalho.cs,
// que só existe em Development e com Autenticacao:CabecalhoDesenvolvimento=true).
//
// Só liga com EXPO_PUBLIC_E2E=1 E num servidor de desenvolvimento (__DEV__): uma versão publicada
// (expo export / EAS) nunca tem __DEV__, por isso o atalho não pode ficar ligado em produção.

export const MODO_E2E: boolean = process.env.EXPO_PUBLIC_E2E === '1' && __DEV__;

/** O utilizador (e a password) do login nos testes E2E. */
export const E2E_UTILIZADOR = {
  id: 'e2e-utilizador',
  email: 'e2e@exemplo.pt',
  name: 'Utilizador E2E',
  password: 'e2e-password',
};

/** A sessão do modo E2E (localStorage), para as páginas que se recarregam continuarem com login. */
export const CHAVE_SESSAO_E2E = '@financas:e2e-sessao';
