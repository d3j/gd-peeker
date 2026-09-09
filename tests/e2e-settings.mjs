// GD-Peeker options/settings E2E.
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

const markdown = '# Live Settings\n\n## Second\n\nText';

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'gd-peeker-settings-e2e-')), {
  headless: true,
  executablePath: findChrome(),
  args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  const extId = new URL(sw.url()).host;

  await ctx.route('https://drive.google.com/uc**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': 'attachment; filename="live.md"',
      },
      body: markdown,
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
        md: {
          preset: 'gfm',
          plugins: { footnote: true, taskLists: true, anchor: true, frontMatter: true, mermaid: true },
          theme: 'github',
          colorScheme: 'auto',
          toc: false,
        },
        txt: { wrap: true, fontSize: 14, lineNumbers: false },
        encoding: { default: 'auto' },
        uiLang: 'en',
      },
      htmlNoticeDismissed: true,
    })
  );

  console.log('1. Options changes are saved immediately to storage.local');
  const options = await ctx.newPage();
  await options.goto(`chrome-extension://${extId}/options.html`);
  await options.locator('#autoOpen').uncheck();
  await options.locator('input[name="autoOpenTypes"][value="code"]').check();
  await options.locator('#allowScripts').uncheck();
  await options.locator('#mdTheme').selectOption('serif');
  await options.locator('#mdColorScheme').selectOption('dark');
  await options.locator('#mdToc').check();
  await options.locator('#lineNumbers').check();
  await options.locator('#fontSize').fill('18');
  await options.locator('#fontSize').dispatchEvent('change');
  await options.locator('#encoding').selectOption('shift_jis');
  await options.waitForFunction(
    async () => {
      const data = await chrome.storage.local.get('settings');
      return data.settings?.md?.theme === 'serif' && data.settings?.txt?.fontSize === 18;
    },
    null,
    { timeout: 5000 }
  );
  const saved = await sw.evaluate(() => chrome.storage.local.get('settings'));
  assert(saved.settings.autoOpen === false, 'autoOpen saved');
  assert(saved.settings.autoOpenTypes.includes('code'), 'autoOpenTypes saved');
  assert(saved.settings.html.allowScripts === false, 'HTML setting saved');
  assert(saved.settings.md.theme === 'serif' && saved.settings.md.colorScheme === 'dark', 'Markdown theme settings saved');
  assert(saved.settings.md.toc === true, 'Markdown TOC setting saved');
  assert(saved.settings.txt.lineNumbers === true && saved.settings.txt.fontSize === 18, 'Text settings saved');
  assert(saved.settings.encoding.default === 'shift_jis', 'Default encoding saved');

  console.log('2. Open viewer re-renders when settings change');
  const viewer = await ctx.newPage();
  await viewer.goto(`chrome-extension://${extId}/viewer.html?id=live-md`);
  const sandbox = viewer.frameLocator('#sandbox');
  await sandbox.locator('.md-root h1#live-settings').waitFor({ timeout: 5000 });
  assert((await sandbox.locator('#app.theme-serif').count()) === 1, 'viewer uses saved markdown theme');
  assert((await sandbox.locator('body.scheme-dark').count()) === 1, 'viewer uses saved color scheme');
  assert((await sandbox.locator('.md-toc a').first().textContent()) === 'Live Settings', 'viewer uses saved TOC setting');
  await options.locator('#mdTheme').selectOption('plain');
  await options.locator('#mdColorScheme').selectOption('light');
  await sandbox.locator('#app.theme-plain').waitFor({ timeout: 5000 });
  await sandbox.locator('body.scheme-light').waitFor({ timeout: 5000 });
  assert((await sandbox.locator('#app.theme-plain').count()) === 1, 'viewer re-rendered after theme change');
  assert((await sandbox.locator('body.scheme-light').count()) === 1, 'viewer re-rendered after color scheme change');

  console.log('3. uiLang=ja switches options and viewer UI to Japanese');
  await options.locator('#uiLang').selectOption('ja');
  await options.locator('h1', { hasText: 'パーサの設定' }).waitFor({ timeout: 5000 });
  assert((await options.locator('h1').textContent()) === 'パーサの設定', 'options title is Japanese');
  await viewer.locator('button#drive', { hasText: 'Drive で開く' }).waitFor({ timeout: 5000 });
  assert((await viewer.locator('[data-i18n="fileType"]').textContent()) === '表示形式', 'viewer toolbar is Japanese');
} finally {
  await ctx.close();
}

console.log(`\n結果: ${passed}/${passed + failed} パス`);
process.exit(failed ? 1 : 0);
