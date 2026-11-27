import { expect, test } from '@playwright/test';
import { EMAIL, entrar } from './ajudas';

test.describe('login', () => {
  test('sem sessão, qualquer ecrã leva ao login', async ({ page }) => {
    await page.goto('/despesas-extras');
    await expect(page).toHaveURL(/login/);
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('password errada mostra o erro e fica no login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill('errada');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Email ou password incorretos')).toBeVisible();
    await expect(page).toHaveURL(/login/);
  });

  test('campos vazios pedem email e password', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Por favor preenche email e password')).toBeVisible();
  });

  test('entrar leva ao início e sair volta ao login', async ({ page }) => {
    await entrar(page);
    await expect(page.getByText(/^Olá, /)).toBeVisible();

    await page.getByRole('button', { name: 'Sair' }).first().click();
    await expect(page).toHaveURL(/login/);

    // A sessão terminou: um ecrã interno volta a pedir login
    await page.goto('/two');
    await expect(page).toHaveURL(/login/);
  });
});
