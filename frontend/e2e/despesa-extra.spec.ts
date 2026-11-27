import { expect, test } from '@playwright/test';
import { entrar } from './ajudas';

test('nova despesa extra aparece na lista e no total do mês', async ({ page }) => {
  const titulo = `Jantar E2E ${Date.now()}`;
  await entrar(page);
  await page.goto('/despesas-extras');
  await expect(page.getByRole('heading', { name: 'Gastos do Dia a Dia' })).toBeVisible();

  await page.getByLabel('Título', { exact: true }).fill(titulo);
  await page.getByLabel('Valor em euros').fill('12,50');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();

  // O gasto fica na lista do mês (com o valor) e o formulário volta a ficar vazio
  await expect(page.getByText(titulo)).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`${titulo}.*12[.,]5`) })).toBeVisible();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('');

  // Continua lá depois de recarregar (vem da API, não só do estado do ecrã)
  await page.reload();
  await expect(page.getByText(titulo)).toBeVisible();
});

test('sem título ou valor mostra o aviso e não cria nada', async ({ page }) => {
  await entrar(page);
  await page.goto('/despesas-extras');
  const avisos: string[] = [];
  page.on('dialog', async (d) => {
    avisos.push(d.message());
    await d.dismiss();
  });
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect.poll(() => avisos.join(' ')).toContain('Preenche o título e o valor');
});
