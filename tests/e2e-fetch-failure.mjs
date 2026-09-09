// GD-Peeker fetch failure diagnostics E2E.
// Chrome for Testing is required because branded Chrome 137+ rejects --load-extension.

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';

const require = createRequire(join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright-core');

const EXT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension');

function findChrome() {
  if (process.env.CHROME_FOR_TESTING) return process.env.CHROME_FOR_TESTING;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const dirs = readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const p = join(
      cache,
      d,
      'chrome-mac-arm64',
      'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
    );
    if (existsSync(p)) return p;
  }
  throw new Error('Chrome for Testing が見つかりません。CHROME_FOR_TESTING で指定してください');
}

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'gd-peeker-fetch-failure-e2e-')), {
  headless: true,
  executablePath: findChrome(),
  args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  const extId = new URL(sw.url()).host;

  await ctx.route('https://drive.google.com/uc**', async (route) => {
    await route.fulfill({ status: 403, headers: { 'content-type': 'text/plain' }, body: 'forbidden' });
  });
  await ctx.route('https://drive.usercontent.google.com/**', async (route) => {
    await route.fulfill({ status: 500, headers: { 'content-type': 'text/plain' }, body: 'server error' });
  });

  console.log('1. Failed fetch shows direct/direct/content-script diagnostics');
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/viewer.html?id=blocked-file`);
  await page.locator('#diagnostics table tbody tr').nth(2).waitFor({ timeout: 5000 });
  const rows = await page.locator('#diagnostics table tbody tr').evaluateAll((trs) =>
    trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent))
  );
  assert(rows.length === 3, 'three fetch attempts are shown');
  assert(rows[0][0] === 'direct' && rows[0][1] === '403' && rows[0][2] === 'http-403', 'first direct attempt shows 403');
  assert(rows[1][0] === 'direct' && rows[1][1] === '500' && rows[1][2] === 'http-500', 'second direct attempt shows 500');
  assert(rows[2][0] === 'content-script' && rows[2][2] === 'no-drive-tab', 'content-script attempt shows no-drive-tab');
  assert((await page.locator('#status').textContent()).includes('signed in'), 'fetch error mentions sign-in and permissions');
  assert((await page.locator('#diag-drive').count()) === 1 && (await page.locator('#diag-retry').count()) === 1, 'diagnostic actions are present');
} finally {
  await ctx.close();
}

console.log(`\n結果: ${passed}/${passed + failed} パス`);
process.exit(failed ? 1 : 0);
