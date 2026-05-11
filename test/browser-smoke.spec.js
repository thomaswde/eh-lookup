const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const rootDir = path.resolve(__dirname, '..');

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function createStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const normalized = path.normalize(pathname === '/' ? '/index.html' : pathname);
      const filePath = path.join(rootDir, normalized);

      if (!filePath.startsWith(rootDir + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': contentType(filePath) });
      res.end(body);
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500);
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseURL: `http://127.0.0.1:${port}`,
        close: () => new Promise(done => server.close(done)),
      });
    });
  });
}

let staticServer;

test.beforeAll(async () => {
  staticServer = await createStaticServer();
});

test.afterAll(async () => {
  await staticServer?.close();
});

async function loadApp(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(staticServer.baseURL);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#result-count')).not.toHaveText('0');
  expect(errors, 'page should not throw while loading').toEqual([]);
}

test('catalog, stack, details, and export preview smoke flow', async ({ page }) => {
  await loadApp(page);

  const resultCount = page.locator('#result-count');
  const initialCount = Number(await resultCount.textContent());
  expect(initialCount).toBeGreaterThan(0);
  await expect(page.locator('#catalog-grid .card')).toHaveCount(initialCount);

  await page.locator('#search').fill('EDA10300');
  await expect(resultCount).toHaveText('1');
  await expect(page.locator('#catalog-grid .card')).toHaveCount(1);
  await expect(page.locator('#catalog-grid .card[data-id="EDA10300"]')).toBeVisible();

  await page.locator('#catalog-grid .card[data-id="EDA10300"] [data-add]').click();
  await page.locator('#stack-fab').click();
  await expect(page.locator('body')).toHaveClass(/stack-builder-open/);
  await expect(page.locator('#stack-body .stack-node-name')).toContainText(['EDA10300']);
  await expect(page.locator('#stack-totals-grid')).toContainText('Throughput');
  await expect(page.locator('#stack-totals-grid')).toContainText('100');
  await expect(page.locator('#stack-totals-grid')).toContainText('Sensors');
  await expect(page.locator('#stack-totals-grid')).toContainText('1');

  await page.locator('#search').fill('ETA9350');
  await expect(resultCount).not.toHaveText(String(initialCount));
  expect(Number(await resultCount.textContent())).toBeGreaterThan(0);
  await page.locator('#catalog-grid .card[data-id="ETA9350"] .view-link').click();
  await expect(page.locator('#modal-backdrop')).toHaveClass(/open/);
  await expect(page.locator('#modal-header')).toContainText('ETA9350');
  await page.locator('#modal-add-btn').click();
  await expect(page.locator('#modal-backdrop')).not.toHaveClass(/open/);
  await expect(page.locator('#stack-body .stack-node-name')).toContainText(['EDA10300', 'ETA9350']);

  await page.locator('#export-stack').click();
  await expect(page.locator('#export-backdrop')).toHaveClass(/open/);
  const topology = page.locator('#export-content svg.diagram-svg');
  await expect(topology).toBeVisible();
  await expect(topology.locator('text')).toContainText(['EDA10300', 'ETA9350']);

  const beforeToggle = await page.locator('#export-content').innerHTML();
  await page.locator('#export-show-connections').check();
  await expect(page.locator('#export-show-connections')).toBeChecked();
  const afterToggle = await page.locator('#export-content').innerHTML();
  expect(afterToggle).not.toBe(beforeToggle);
  await expect(page.locator('#export-content')).toContainText('CONNECTION PORTS');
});
