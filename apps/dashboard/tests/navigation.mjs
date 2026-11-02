import { expect } from '@playwright/test';

export async function navigateWorkspace(page, label) {
  const primaryNames = { 'Tasks & plans': 'Tasks', Communication: 'Chat', Collaboration: 'Help & teamwork' };
  const direct = page.getByRole('navigation', { name: 'Companion tools', exact: true }).getByRole('button', { name: primaryNames[label] || label, exact: true });
  if (await direct.isVisible()) {
    await direct.click();
    await expect(page.getByRole('heading', { level: 1, name: label, exact: true })).toBeVisible();
    return;
  }
  const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  if (!await navigation.isVisible()) await page.getByRole('button', { name: 'More tools', exact: true }).click();
  await navigation.getByRole('button').filter({ has: page.getByText(label, { exact: true }) }).click();
  await expect(page.getByRole('heading', { level: 1, name: label, exact: true })).toBeVisible();
  await expect(navigation).not.toBeVisible();
}
