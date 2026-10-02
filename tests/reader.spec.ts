import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('overview exposes a complete book and chapter navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('DSM-5-TR');
  await expect(page.locator('.book-cover')).toBeVisible();
  await page.getByLabel('Filter chapters').fill('Bipolar');
  await page.locator('.chapter-links a', { hasText: 'Bipolar' }).click();
  await expect(page.locator('#source-page-254')).toBeVisible();
  await expect(page.locator('.reader-heading h1')).toHaveText('Bipolar and Related Disorders');
});

test('full-book search finds native text and reviewed image-only instructions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search book', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Search the entire book' });
  await input.fill('F90.2');
  await expect(page.locator('.search-result').first()).toBeVisible();
  await expect(page.locator('.search-result mark').first()).toHaveText('F90.2');
  await page.locator('.search-result').first().click();
  await expect(page.locator('.search-context')).toContainText('F90.2');
  await expect(page.locator('.reading-text mark').first()).toBeVisible();
  await page.keyboard.press('Control+k');
  await input.fill('clinicians for use with their own patients');
  await expect(page.locator('.search-result', { hasText: 'Source 1123' })).toBeVisible();
  await page.locator('.search-result', { hasText: 'Source 1123' }).click();
  await expect(page.locator('#source-page-1123 .transcript-text')).toContainText('requires written permission from WHO');
  await expect(page.locator('#source-page-1123 .source-figure img')).toBeVisible();
});

test('search supports no results, clearing, and keyboard dismissal', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search the entire book').fill('zzznomatchingwords[.*+');
  await expect(page.getByRole('heading', { name: 'No matching pages' })).toBeVisible();
  await page.getByLabel('Clear search').click();
  await expect(page.getByRole('heading', { name: 'Find your place in the manual.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('next page crosses a PDF boundary and original view renders the correct file', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/#/read/201');
  await expect(page.locator('#source-page-201')).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('#source-page-202')).toBeVisible();
  await page.getByRole('button', { name: 'Original page', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('Rendering the original page…')).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'Open source PDF' })).toHaveAttribute('href', /202-302\.pdf#page=1/);
  const ink = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 180 && data[i + 3] > 0) dark++;
    return dark;
  });
  expect(ink).toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(page.locator('#source-page-202 .native-content')).toContainText('Environmental. Early in brain development');
  expect(errors).toEqual([]);
});

test('printed markers, roman numerals and invalid page input are handled', async ({ page }) => {
  await page.goto('/#/read/100');
  await page.getByLabel('Page number', { exact: true }).fill('2000');
  await page.getByRole('button', { name: 'Go to page', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('1 to 1377');
  await page.getByLabel('Page numbering').selectOption('printed');
  await page.getByLabel('Page number', { exact: true }).fill('857');
  await page.getByRole('button', { name: 'Go to page', exact: true }).click();
  await expect(page.locator('#source-page-1122')).toBeVisible();
  await page.getByLabel('Page numbering').selectOption('printed');
  await page.getByLabel('Page number', { exact: true }).fill('xxvii');
  await page.getByRole('button', { name: 'Go to page', exact: true }).click();
  await expect(page.locator('#source-page-41')).toBeVisible();
});

test('settings persist and the selected reading position can be resumed', async ({ page }) => {
  await page.goto('/#/read/405');
  await expect(page.locator('#source-page-405')).toBeVisible();
  await page.getByRole('button', { name: 'Reading settings', exact: true }).click();
  await page.getByLabel('Text size').focus();
  await page.getByLabel('Text size').press('Home');
  for (let i = 0; i < 7; i++) await page.getByLabel('Text size').press('ArrowRight');
  await page.getByRole('button', { name: 'Spacious' }).click();
  await page.getByRole('button', { name: 'Evening' }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.reader-main')).toHaveClass(/wide-reader/);
  await expect(page.locator('.reader-main')).toHaveCSS('--reading-size', '22px');
  await page.locator('#source-page-406').scrollIntoViewIfNeeded();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('dsm-position') || '{}').page)).toBe(406);
  await page.goto('/');
  await page.locator('.resume-card').click();
  await expect(page.locator('#source-page-406')).toBeAttached();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.reader-main')).toHaveCSS('--reading-size', '22px');
});

test('continuous reading loads more pages and updates the current source page', async ({ page }) => {
  await page.goto('/#/read/99');
  await expect(page.locator('#source-page-101')).toBeAttached();
  await page.locator('#source-page-101').scrollIntoViewIfNeeded();
  await page.locator('.load-more').scrollIntoViewIfNeeded();
  await expect(page.locator('#source-page-102')).toBeAttached();
  await page.locator('#source-page-102').scrollIntoViewIfNeeded();
  await expect.poll(() => page.url()).toContain('/read/102');
});

test('text load failure is recoverable', async ({ page }) => {
  let fail = true;
  await page.route('**/book/pages/607.json', route => fail ? route.fulfill({ status: 503, body: 'unavailable' }) : route.continue());
  await page.goto('/#/read/607');
  await expect(page.getByRole('alert')).toContainText('could not be loaded');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#source-page-607 .native-content')).toBeVisible();
});

test('browser history and section permalinks open the correct content', async ({ page }) => {
  const data = JSON.parse(fs.readFileSync(path.join('public/book/pages/202.json'), 'utf8'));
  const heading = data.blocks.find((b: { kind: string }) => b.kind === 'heading');
  await page.goto(`/#/read/202?block=${heading.id}`);
  await expect(page.locator(`#page-202-${heading.id}`)).toBeInViewport();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('#source-page-203')).toBeAttached();
  await page.goBack();
  await expect(page.locator('#source-page-202')).toBeAttached();
});

test('mobile navigation, text, settings and images fit a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByLabel('Filter chapters').fill('Assessment Measures');
  await page.locator('.chapter-links a', { hasText: 'Assessment Measures' }).click();
  await expect(page.locator('.sidebar')).not.toHaveClass(/is-open/);
  await expect(page.locator('#source-page-1107')).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/#/read/1122');
  await expect(page.locator('#source-page-1122 .source-figure img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Reading settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('first and final pages have correct navigation limits', async ({ page }) => {
  await page.goto('/#/read/1');
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  await page.goto('/#/read/1377');
  await expect(page.locator('#source-page-1377 .native-content')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'You’ve reached the end of the book.' })).toBeAttached();
});

test('rendered native text retains every source span on representative pages from all twelve parts', async ({ page }) => {
  test.setTimeout(90000);
  for (const number of [6, 41, 100, 101, 135, 202, 303, 405, 506, 607, 708, 809, 905, 910, 1011, 1112, 1122, 1123, 1198, 1307, 1377]) {
    const source = JSON.parse(fs.readFileSync(`public/book/pages/${number}.json`, 'utf8'));
    const expected = source.blocks.flatMap((b: { spans: { id?: number; t: string }[] }) => b.spans.filter(s => s.id !== undefined).map(s => ({ id: s.id, text: s.t }))).sort((a: { id: number }, b: { id: number }) => a.id - b.id);
    await page.goto(`/#/read/${number}`);
    await page.locator(`#source-page-${number} .native-content`).waitFor();
    const actual = await page.locator(`#source-page-${number} .native-content [data-span]`).evaluateAll(nodes => nodes.map(n => ({ id: Number(n.getAttribute('data-span')), text: n.textContent })).sort((a, b) => a.id - b.id));
    expect(actual, `source page ${number}`).toEqual(expected);
  }
});
