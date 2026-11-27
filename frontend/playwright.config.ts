import { defineConfig, devices } from '@playwright/test';

// Testes E2E da app na web (pasta e2e/). Arranca sozinho:
//   1. a API .NET em modo desenvolvimento, com SQLite novo e autenticação pelo cabeçalho X-Utilizador
//      (e2e/iniciar-api.mjs);
//   2. o Expo para a web com EXPO_PUBLIC_E2E=1: a app salta o login do Firebase (utils/e2e.ts).
// Correr: npm run e2e   (primeira vez: npx playwright install chromium)
// Sem descarregar o Chromium do Playwright, usar o Chrome ou o Edge do computador:
//   E2E_BROWSER_CHANNEL=chrome npm run e2e   (PowerShell: $env:E2E_BROWSER_CHANNEL='chrome'; npm run e2e)

const PORTA_API = process.env.E2E_API_PORTA ?? '5081';
const PORTA_APP = process.env.E2E_APP_PORTA ?? '8099';
const URL_API = `http://localhost:${PORTA_API}`;
const URL_APP = `http://localhost:${PORTA_APP}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // Os testes partilham a mesma base de dados e o mesmo utilizador: um de cada vez, por ordem
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  // O primeiro pedido à app obriga o Metro a compilar tudo (pode passar de 1 minuto)
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: URL_APP,
    acceptDownloads: true,
    locale: 'pt-PT',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.E2E_BROWSER_CHANNEL || undefined },
    },
  ],
  webServer: [
    {
      command: 'node e2e/iniciar-api.mjs',
      url: `${URL_API}/saude`,
      env: { E2E_API_PORTA: PORTA_API, E2E_APP_URL: URL_APP },
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx expo start --web --port ${PORTA_APP}`,
      url: URL_APP,
      env: {
        EXPO_PUBLIC_E2E: '1',
        EXPO_PUBLIC_API_URL: URL_API,
        EXPO_PUBLIC_SENTRY_DSN: '',
        BROWSER: 'none',
        CI: '1',
        EXPO_NO_TELEMETRY: '1',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
