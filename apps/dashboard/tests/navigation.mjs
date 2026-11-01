import { expect } from '@playwright/test';

export async function navigateWorkspace(page, label) {
  const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  if (!await navigation.isVisible()) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await navigation.getByRole('button').filter({ has: page.getByText(label, { exact: true }) }).click();
  await expect(page.getByRole('heading', { level: 1, name: label, exact: true })).toBeVisible();
  await expect(navigation).not.toBeVisible();
}
