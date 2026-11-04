import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDesignFixture, DESIGN_SCENARIOS, DESIGN_TIME, WORKSPACE_PAGES, WEBSITE_PAGES } from '../../scripts/design-fixtures.mjs';
import { navigateWorkspace } from '../../apps/dashboard/tests/navigation.mjs';
import { servePublicWebsite } from './static-server.mjs';

let fixture, website;
const slug = value => value.toLowerCase().replaceAll('&', 'and').replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
const pageScenario = { Session: 'gathering', 'My companion': 'hangout', 'Current mission': 'mission', 'Tasks & plans': 'mission', Inventory: 'inventory', Resources: 'collaboration', Collaboration: 'collaboration', Activity: 'gathering', Communication: 'hangout', 'Build studio': 'building', 'Diagnostics & logs': 'blocked' };

test.beforeAll(async () => { fixture = await createDesignFixture(); website = await servePublicWebsite(); });
test.afterAll(async () => { await website?.close(); await fixture?.close(); });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(epoch => {
    const OriginalDate = Date;
    window.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [epoch])); } static now() { return epoch; } };
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Visual tests never capture microphone audio.', 'NotAllowedError'); };
  }, DESIGN_TIME);
});

async function checkScreen(page, name, info, { synthetic = false } = {}) {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('h1').waitFor({ state: 'visible' });
  // Review the actual lazy-loaded workbench, not its transient loading shell.
  await page.locator('.preview-loading').waitFor({ state: 'hidden' });
  await page.evaluate(() => Promise.all([...document.images].map(image => image.complete ? undefined : new Promise(resolve => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); }))));
  if (synthetic) await page.evaluate(() => {
    if (document.getElementById('visual-fixture-label')) return;
    const label = document.createElement('div'); label.id = 'visual-fixture-label';
    label.textContent = 'DESIGN FIXTURE · simulated game observations';
    Object.assign(label.style, { position: 'fixed', bottom: '0', left: '0', zIndex: '10000', padding: '3px 8px', background: '#080b10', color: '#edf2f8', borderTop: '1px solid #a1afc1', font: '10px monospace', pointerEvents: 'none', maxWidth: '100%' });
    (document.querySelector('dialog[open]') || document.body).append(label);
  });
  expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal page overflow`).toBe(true);
  const evidence = join('.git/design-after', info.project.name);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true, animations: 'disabled' });
  await expect.soft(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  await writeFile(join(evidence, `${name}.axe.json`), JSON.stringify({ checkedAt: new Date().toISOString(), name, synthetic, violations: result.violations.map(({ id, impact, description, helpUrl, nodes }) => ({ id, impact, description, helpUrl, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) })) }, null, 2));
  expect.soft(serious, `${name}: serious/critical accessibility violations, including contrast`).toEqual([]);
}

for (const route of WEBSITE_PAGES) test(`website ${route || 'home'}`, async ({ page }, info) => {
  const errors = [], privateCalls = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/api\/(?:state|events|settings)/.test(request.url())) privateCalls.push(request.url()); });
  const response = await page.goto(website.base + route);
  expect(response.status()).toBe(200);
  await expect(page.locator('h1')).toHaveCount(1);
  await checkScreen(page, `website-${route ? slug(route) : 'home'}`, info);
  expect(errors).toEqual([]); expect(privateCalls).toEqual([]);
});

for (const label of WORKSPACE_PAGES) test(`workspace ${label}`, async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const scenario = pageScenario[label] || 'disconnected';
  fixture.setFixture(scenario);
  await page.goto(fixture.base);
  await page.getByText('Connected to local runtime', { exact: true }).waitFor();
  await navigateWorkspace(page, label);
  await checkScreen(page, `workspace-${slug(label)}`, info, { synthetic: true });
  expect(errors).toEqual([]);
});

for (const scenario of DESIGN_SCENARIOS.filter(value => value !== 'disconnected')) test(`session context ${scenario}`, async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  fixture.setFixture(scenario);
  await page.goto(fixture.base);
  await page.getByText('Connected to local runtime', { exact: true }).waitFor();
  await checkScreen(page, `context-${scenario}`, info, { synthetic: true });
  expect(errors).toEqual([]);
});

for (const section of ['Game account', 'AI & usage', 'Voice & devices', 'Data & diagnostics']) test(`settings section ${section}`, async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  fixture.setFixture('disconnected');
  await page.goto(fixture.base);
  await page.getByText('Connected to local runtime', { exact: true }).waitFor();
  await navigateWorkspace(page, 'Settings');
  const button = page.getByRole('button', { name: section, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.settings-area-switch button[aria-pressed="true"]')).toHaveCount(1);
  const heading = { 'Game account': 'Minecraft account', 'AI & usage': 'AI models & reasoning', 'Voice & devices': 'Voice & audio', 'Data & diagnostics': 'Diagnostics' }[section];
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await checkScreen(page, `settings-${slug(section)}`, info, { synthetic: true });
  expect(errors).toEqual([]);
});

test('navigation dialog supports keyboard dismissal and complete destinations', async ({ page }, info) => {
  fixture.setFixture('disconnected'); await page.goto(fixture.base);
  const trigger = page.getByRole('button', { name: 'More tools', exact: true });
  await trigger.focus(); await page.keyboard.press('Enter');
  const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  await expect(navigation).toBeVisible();
  for (const label of WORKSPACE_PAGES) await expect(navigation.getByRole('button').filter({ has: page.getByText(label, { exact: true }) })).toBeVisible();
  await checkScreen(page, 'navigation-dialog', info, { synthetic: true });
  await page.keyboard.press('Escape'); await expect(navigation).not.toBeVisible(); await expect(trigger).toBeFocused();
});

test('conversation dialog keeps a failed message visible and recoverable', async ({ page }, info) => {
  fixture.setFixture('hangout');
  await page.goto(fixture.base);
  await page.getByText('Connected to local runtime', { exact: true }).waitFor();
  await page.route('**/api/conversation', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture provider is temporarily unavailable. Try again.' }) }));
  await page.getByRole('button', { name: 'Open conversation panel', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Companion conversation', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Message your companion', exact: true }).fill('Can we make a plan?');
  await dialog.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Fixture provider is temporarily unavailable');
  await checkScreen(page, 'conversation-failed-message', info, { synthetic: true });
  await dialog.getByRole('button', { name: 'Dismiss conversation error', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('session exposes everyday tools and an inline composer without opening the menu', async ({ page }) => {
  fixture.setFixture('gathering');
  await page.addInitScript(() => sessionStorage.setItem('player-two-page', 'overview'));
  await page.goto(fixture.base);
  await expect(page.getByRole('heading', { level: 1, name: 'Session', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message your companion', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Current action progress' })).toHaveAttribute('aria-valuenow', '42');
  const tools = page.getByRole('navigation', { name: 'Companion tools', exact: true });
  for (const [label, title] of [['Tasks', 'Tasks & plans'], ['Inventory', 'Inventory'], ['Resources', 'Resources'], ['Build studio', 'Build studio'], ['Chat', 'Communication'], ['My companion', 'My companion'], ['Help & teamwork', 'Collaboration'], ['Session', 'Session']]) {
    const button = tools.getByRole('button', { name: label, exact: true });
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).not.toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Session', exact: true })).toBeVisible();
});

test('disconnected session separates supplies and keeps long conversation usable', async ({ page }, info) => {
  fixture.setFixture('disconnected');
  for (let index = 0; index < 40; index++) {
    fixture.store.put('conversation', {
      id: `layout-history-${index}`,
      role: index % 2 ? 'companion' : 'user',
      text: index % 2
        ? 'The wood is ready. I can check the supply chest before the next task. We still need glass for the windows, so that part is waiting.'
        : 'What should we work on next?',
      at: new Date(DESIGN_TIME + index * 60000).toISOString(),
    });
  }
  fixture.runtime.emit('change');
  await page.goto(fixture.base);
  await page.getByText('Connected to local runtime', { exact: true }).waitFor();
  const chat = page.locator('.console-session-chat');
  await expect(chat.locator('.ws-chat-message')).toHaveCount(40);
  const layout = await page.locator('.console-session').evaluate(session => {
    const activity = session.querySelector('.session-stage').getBoundingClientRect();
    const supplies = session.querySelector('.session-pocket').getBoundingClientRect();
    const conversation = session.querySelector('.ws-chat').getBoundingClientRect();
    const history = session.querySelector('.ws-chat-messages');
    const composer = session.querySelector('.ws-chat-composer').getBoundingClientRect();
    return {
      suppliesGap: supplies.top - activity.bottom,
      conversationWidth: conversation.width,
      historyScrolls: history.scrollHeight > history.clientHeight,
      composerInside: composer.bottom <= conversation.bottom && composer.top >= history.getBoundingClientRect().bottom,
      messageRadius: getComputedStyle(history.querySelector('article')).borderRadius,
    };
  });
  expect(layout.suppliesGap).toBeGreaterThanOrEqual(24);
  if (page.viewportSize().width >= 1200) expect(layout.conversationWidth).toBeGreaterThanOrEqual(400);
  expect(layout.historyScrolls).toBe(true);
  expect(layout.composerInside).toBe(true);
  expect(layout.messageRadius).toBe('0px');
  await checkScreen(page, 'session-offline-history', info, { synthetic: true });
  const remember = chat.getByRole('button', { name: /Remember this message from/ }).last();
  await remember.focus();
  await page.keyboard.press('Enter');
  await expect(chat.getByRole('status')).toHaveText('Moment saved to My companion.');
  expect(fixture.store.get('adventureMoments').some(moment => moment.sourceId === 'layout-history-39')).toBe(true);
});
