import { expect, test } from '@playwright/test';
import { entrar } from './ajudas';

test('a folha do mês mostra os blocos Lucro, Despesas e Poupança do mês escolhido', async ({ page }) => {
  await entrar(page);
  await page.goto('/two');
  await expect(page.getByRole('heading', { name: 'Resumo do mês' })).toBeVisible();

  for (const bloco of ['Lucro', 'Despesas', 'Poupança']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${bloco} -?[0-9]`) })).toBeVisible();
  }
  await expect(page.getByText(/Não foi possível carregar/)).toHaveCount(0);

  // Mudar de mês recarrega a folha (o seletor diz sempre em que mês está)
  const mesAtual = await page.getByRole('heading').filter({ hasText: /\d{4}/ }).first().innerText();
  await page.getByRole('button', { name: /^Mês anterior/ }).click();
  await expect(page.getByRole('heading').filter({ hasText: /\d{4}/ }).first()).not.toHaveText(mesAtual);
  await expect(page.getByRole('button', { name: /^Lucro / })).toBeVisible();
});
