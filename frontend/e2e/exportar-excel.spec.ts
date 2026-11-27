import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { entrar } from './ajudas';

test('exportar para Excel descarrega um ficheiro .xlsx válido', async ({ page }) => {
  await entrar(page);
  await page.goto('/two');
  await expect(page.getByRole('heading', { name: 'Resumo do mês' })).toBeVisible();

  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descarregar Excel' }).click(),
  ]);

  expect(descarga.suggestedFilename()).toMatch(/^financas-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const caminho = await descarga.path();
  const bytes = await readFile(caminho);
  expect(bytes.length).toBeGreaterThan(1000);
  // Um .xlsx é um zip: começa por "PK"
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
});
