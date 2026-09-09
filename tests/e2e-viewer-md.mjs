// GD-Peeker Markdown viewer E2E.
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

const markdown = `---
title: Fixture
---

# Fixture MD

| A | B |
|---|---|
| 1 | 2 |

- [x] done

footnote[^1]

[^1]: note body

<script>document.body.dataset.bad='yes'</script>

\`\`\`js
const answer = 42;
\`\`\`

\`\`\`mermaid
graph TD
  A-->B
\`\`\`
`;

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'gd-peeker-md-e2e-')), {
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
        'content-disposition': 'attachment; filename="test.md"',
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
          toc: true,
        },
        txt: { wrap: true, fontSize: 14, lineNumbers: false },
        encoding: { default: 'auto' },
        uiLang: 'en',
      },
      htmlNoticeDismissed: true,
    })
  );

  console.log('1. Markdown renders GFM, plugins, sanitizer, mermaid, and hljs');
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/viewer.html?id=test-md`);
  const sandbox = page.frameLocator('#sandbox');
  await sandbox.locator('.md-root h1#fixture-md').waitFor({ timeout: 5000 });
  assert((await sandbox.locator('.md-root table td').nth(1).textContent()) === '2', 'GFM table rendered');
  assert((await sandbox.locator('.task-list-item input[checked]').count()) === 1, 'task list rendered');
  assert((await sandbox.locator('.footnotes').count()) === 1, 'footnote rendered');
  assert((await sandbox.locator('.md-root script').count()) === 0, 'inline script stripped from rendered markdown');
  assert((await sandbox.locator('body').getAttribute('data-bad')) !== 'yes', 'inline script did not run');
  assert((await sandbox.locator('.front-matter').count()) === 1, 'front matter details rendered');
  assert((await sandbox.locator('code.language-js .hljs-keyword').count()) > 0, 'highlight.js classes applied');
  await sandbox.locator('.mermaid-rendered svg').waitFor({ timeout: 10000 });
  assert((await sandbox.locator('.mermaid-rendered svg').count()) === 1, 'mermaid rendered to SVG');
  assert((await sandbox.locator('.md-toc a').first().textContent()) === 'Fixture MD', 'TOC rendered');
} finally {
  await ctx.close();
}

console.log(`\n結果: ${passed}/${passed + failed} パス`);
process.exit(failed ? 1 : 0);
