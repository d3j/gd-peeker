// GD-Peeker HTML viewer E2E.
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

const html = `<!doctype html>
<html>
  <head><title>Fixture HTML</title></head>
  <body>
    <h1 id="headline">Fixture</h1>
    <img id="external" src="https://example.test/pixel.png">
    <script>
      document.body.dataset.scriptRan = 'yes';
      try {
        document.body.dataset.parentChrome = String(Boolean(parent.chrome));
      } catch (err) {
        document.body.dataset.parentChrome = 'blocked';
      }
      const p = document.createElement('p');
      p.id = 'ran';
      p.textContent = 'script ran';
      document.body.append(p);
    </script>
  </body>
</html>`;

const blockedHtml = `<!doctype html><title>Scripts disabled</title><body><h1 id="headline">No script</h1><script>document.body.dataset.scriptRan='yes';</script></body>`;

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'gd-peeker-e2e-')), {
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
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-disposition': `attachment; filename="${id === 'no-script' ? 'no-script.html' : 'test-html.html'}"`,
      },
      body: id === 'no-script' ? blockedHtml : html,
    });
  });
  await ctx.route('https://drive.usercontent.google.com/**', async (route) => {
    await route.fulfill({ status: 500, body: 'unused' });
  });

  console.log('1. HTML renders in nested sandbox and scripts execute by default');
  await sw.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        autoOpen: true,
        autoOpenTypes: ['html', 'md', 'txt', 'xml'],
        html: { allowScripts: true, allowExternal: true },
        md: { preset: 'gfm', plugins: { footnote: true, taskLists: true, anchor: true, frontMatter: true, mermaid: true }, theme: 'github', colorScheme: 'auto', toc: false },
        txt: { wrap: true, fontSize: 14, lineNumbers: false },
        encoding: { default: 'auto' },
        uiLang: 'en',
      },
      htmlNoticeDismissed: true,
    })
  );
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/viewer.html?id=test-html`);
  const user = page.frameLocator('#sandbox').frameLocator('#user');
  await user.locator('#ran').waitFor({ timeout: 5000 });
  assert((await user.locator('#headline').textContent()) === 'Fixture', 'HTML body is visible');
  assert((await user.locator('body').getAttribute('data-script-ran')) === 'yes', 'inline script executed');
  assert((await user.locator('body').getAttribute('data-parent-chrome')) !== 'true', 'inner iframe cannot read parent.chrome');
  await page.waitForFunction(() => document.title === 'Fixture HTML — GD-Peeker', null, { timeout: 5000 });
  assert((await page.title()) === 'Fixture HTML — GD-Peeker', 'title returned from sandbox updates viewer title');

  console.log('2. allowScripts=false removes script execution');
  await sw.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        autoOpen: true,
        autoOpenTypes: ['html'],
        html: { allowScripts: false, allowExternal: true },
        md: { preset: 'gfm', plugins: { footnote: true, taskLists: true, anchor: true, frontMatter: true, mermaid: true }, theme: 'github', colorScheme: 'auto', toc: false },
        txt: { wrap: true, fontSize: 14, lineNumbers: false },
        encoding: { default: 'auto' },
        uiLang: 'en',
      },
      htmlNoticeDismissed: true,
    })
  );
  const noScript = await ctx.newPage();
  await noScript.goto(`chrome-extension://${extId}/viewer.html?id=no-script`);
  const noScriptUser = noScript.frameLocator('#sandbox').frameLocator('#user');
  await noScriptUser.locator('#headline').waitFor({ timeout: 5000 });
  assert((await noScriptUser.locator('body').getAttribute('data-script-ran')) !== 'yes', 'inline script did not run');

  console.log('3. allowExternal=false injects restrictive CSP');
  await sw.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        autoOpen: true,
        autoOpenTypes: ['html'],
        html: { allowScripts: true, allowExternal: false },
        md: { preset: 'gfm', plugins: { footnote: true, taskLists: true, anchor: true, frontMatter: true, mermaid: true }, theme: 'github', colorScheme: 'auto', toc: false },
        txt: { wrap: true, fontSize: 14, lineNumbers: false },
        encoding: { default: 'auto' },
        uiLang: 'en',
      },
      htmlNoticeDismissed: true,
    })
  );
  const noExternal = await ctx.newPage();
  await noExternal.goto(`chrome-extension://${extId}/viewer.html?id=test-html`);
  const noExternalUser = noExternal.frameLocator('#sandbox').frameLocator('#user');
  await noExternalUser.locator('#ran').waitFor({ timeout: 5000 });
  const imageLoaded = await noExternalUser.locator('#external').evaluate((img) => img.complete && img.naturalWidth > 0);
  assert(!imageLoaded, 'external image is blocked');
} finally {
  await ctx.close();
}

console.log(`\n結果: ${passed}/${passed + failed} パス`);
process.exit(failed ? 1 : 0);
