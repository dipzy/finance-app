import { expect, type Page } from '@playwright/test';

// O utilizador de teste do modo E2E (utils/e2e.ts)
export const EMAIL = 'e2e@exemplo.pt';
export const PASSWORD = 'e2e-password';

/** Entra pelo ecrã de login (a app, no modo E2E, não usa o Firebase). */
export async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/welcome/);
}
