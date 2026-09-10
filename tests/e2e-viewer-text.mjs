// GD-Peeker text/XML/code viewer E2E.
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

const SJIS_TEXT = Buffer.from('82 b1 82 f1 82 c9 82 bf 82 cd 93 fa 96 7b 8c ea'.split(' ').map((h) => Number.parseInt(h, 16)));
const xml = '<?xml version="1.0"?><root><item id="1">text</item><item id="2"><child>ok</child></item></root>';
const badXml = '<root><item></root>';
const json = '{"z":1,"items":[{"a":2}]}';

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'gd-peeker-text-e2e-')), {
  headless: true,
  executablePath: findChrome(),
  args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  const extId = new URL(sw.url()).host;

  await ctx.route('https://drive.google.com/uc**', async (route) => {
    const id = new URL(route.request().url()).searchParams.get('id');
    const fixtures = {
      'sjis-txt': { name: 'sjis.txt', type: 'text/plain', body: SJIS_TEXT },
      'test-xml': { name: 'test.xml', type: 'application/xml', body: xml },
      'bad-xml': { name: 'bad.xml', type: 'application/xml', body: badXml },
      'test-json': { name: 'test.json', type: 'application/json', body: json },
    };
    const f = fixtures[id] || fixtures['sjis-txt'];
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': f.type,
        'content-disposition': `attachment; filename="${f.name}"`,
      },
      body: f.body,
    });
  });
  await ctx.route('https://drive.usercontent.google.com/**', async (route) => {
    await route.fulfill({ status: 500, body: 'unused' });
  });

  await sw.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        autoOpen: true,
        autoOpenTypes: ['html', 'md', 'txt', 'xml'],
        html: { allowScripts: true, allowExternal: true },
        md: { preset: 'gfm', plugins: { footnote: true, taskLists: true, anchor: true, frontMatter: true, mermaid: true }, theme: 'github', colorScheme: 'auto', toc: false },
        txt: { wrap: true, fontSize: 14, lineNumbers: true },
        encoding: { default: 'auto' },
        uiLang: 'en',
      },
      htmlNoticeDismissed: true,
    })
  );

  console.log('1. Shift_JIS text decodes automatically and can be overridden');
  const txtPage = await ctx.newPage();
  await txtPage.goto(`chrome-extension://${extId}/viewer.html?id=sjis-txt`);
  const txtSandbox = txtPage.frameLocator('#sandbox');
  await txtSandbox.locator('.text-pre').waitFor({ timeout: 5000 });
  assert((await txtSandbox.locator('.text-pre').textContent()).includes('こんにちは日本語'), 'Shift_JIS text is readable');
  assert((await txtPage.locator('#encoding option:checked').textContent()) === 'Shift_JIS (auto)', 'toolbar shows Shift_JIS (auto)');
  const txtLayout = await txtSandbox.locator('.text-pre').evaluate((pre) => ({
    pre: pre.getBoundingClientRect().height,
    innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  assert(Math.abs(txtLayout.pre - txtLayout.innerHeight) <= 2 && txtLayout.scrollHeight <= txtLayout.innerHeight, `short text fills the sandbox without overflowing it (${txtLayout.pre}/${txtLayout.innerHeight}/${txtLayout.scrollHeight})`);
  await txtPage.locator('#encoding').selectOption('utf-8');
  await txtPage.waitForTimeout(500);
  assert((await txtSandbox.locator('.text-pre').textContent()).includes('�'), 'manual UTF-8 override changes decoding');

  console.log('2. XML formats and folds');
  const xmlPage = await ctx.newPage();
  await xmlPage.goto(`chrome-extension://${extId}/viewer.html?id=test-xml`);
  const xmlSandbox = xmlPage.frameLocator('#sandbox');
  await xmlSandbox.locator('.xml-tree').waitFor({ timeout: 5000 });
  assert((await xmlSandbox.locator('.xml-line code', { hasText: '<item id="1">text</item>' }).count()) === 1, 'XML is formatted');
  await xmlSandbox.locator('.xml-toggle').first().click();
  assert((await xmlSandbox.locator('.xml-line[hidden]').count()) > 0, 'XML children collapse');

  console.log('3. Invalid XML falls back to code display');
  const badPage = await ctx.newPage();
  await badPage.goto(`chrome-extension://${extId}/viewer.html?id=bad-xml`);
  const badSandbox = badPage.frameLocator('#sandbox');
  await badSandbox.locator('.notice').waitFor({ timeout: 5000 });
  assert((await badSandbox.locator('.notice').textContent()).includes('Could not format XML'), 'parse error is shown');
  assert((await badSandbox.locator('code.language-xml').count()) === 1, 'invalid XML source remains as code');

  console.log('4. JSON is pretty-printed as code');
  const jsonPage = await ctx.newPage();
  await jsonPage.goto(`chrome-extension://${extId}/viewer.html?id=test-json`);
  const jsonSandbox = jsonPage.frameLocator('#sandbox');
  await jsonSandbox.locator('code.language-json').waitFor({ timeout: 5000 });
  assert((await jsonSandbox.locator('code.language-json').textContent()).includes('\n  "items": ['), 'JSON is pretty printed');
} finally {
  await ctx.close();
}

console.log(`\n結果: ${passed}/${passed + failed} パス`);
process.exit(failed ? 1 : 0);
