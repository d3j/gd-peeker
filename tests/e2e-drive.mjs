// GD-Peeker real Drive E2E.
// Uses the dedicated profile prepared by scripts/drive-profile.sh and only reads
// the GD-Peeker-dev folder.

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const require = createRequire(join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright-core');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT_DIR = join(ROOT, 'extension');
const PROFILE = process.env.GD_PEEKER_PROFILE || join(homedir(), '.gd-peeker', 'profile');
const FOLDER_URL = 'https://drive.google.com/drive/folders/1DkhF-K_7FymE8hWRNh8ehvEnS16rBvhW';

const CASES = [
  {
    name: 'gdp-test.html',
    label: 'HTML fixture renders',
    check: async (viewer) => {
      const user = viewer.frameLocator('#sandbox').frameLocator('#user');
      await user.locator('#ok').waitFor({ timeout: 10000 });
      return (await user.locator('#ok').textContent())?.includes('GD-Peeker HTML fixture');
    },
  },
  {
    name: 'gdp-test.md',
    label: 'Markdown fixture renders',
    check: async (viewer) => {
      const sandbox = viewer.frameLocator('#sandbox');
      await sandbox.locator('.md-root h1').waitFor({ timeout: 10000 });
      return (await sandbox.locator('.md-root h1').textContent())?.includes('GD-Peeker MD fixture');
    },
  },
  {
    name: 'gdp-test-sjis.txt',
    label: 'Shift_JIS text fixture renders',
    check: async (viewer) => {
      const sandbox = viewer.frameLocator('#sandbox');
      await sandbox.locator('.text-pre').waitFor({ timeout: 10000 });
      return (await sandbox.locator('.text-pre').textContent())?.includes('日本語のテキスト');
    },
  },
  {
    name: 'gdp-test.xml',
    label: 'XML fixture renders',
    check: async (viewer) => {
      const sandbox = viewer.frameLocator('#sandbox');
      await sandbox.locator('.xml-tree').waitFor({ timeout: 10000 });
      return (await sandbox.locator('.xml-tree').textContent())?.includes('GD-Peeker XML fixture');
    },
  },
];

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

if (!existsSync(PROFILE)) {
  throw new Error(`プロファイルがありません: ${PROFILE}\n先に bash scripts/drive-profile.sh でログインしてください`);
}

// 永続プロファイルでは Chrome が拡張の service worker スクリプトをキャッシュし、ディスク上の
// background.js が更新されていても古いものが動き続ける(2026-09-10 に実機で確認)。起動直後に
// 拡張をリロードして、いまのコードで service worker を起動し直す。
async function freshServiceWorker(ctx) {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  const next = ctx.waitForEvent('serviceworker', { timeout: 15000 });
  await sw.evaluate(() => chrome.runtime.reload()).catch(() => {});
  sw = await next;
  await new Promise((r) => setTimeout(r, 1000));
  return sw;
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  executablePath: findChrome(),
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--disable-blink-features=AutomationControlled', `--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
});

try {
  let sw = await freshServiceWorker(ctx);
  const extId = new URL(sw.url()).host;
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

  const drive = ctx.pages()[0] ?? (await ctx.newPage());
  await drive.goto(FOLDER_URL);
  await drive.waitForLoadState('domcontentloaded');
  await drive.waitForTimeout(4000);
  assert(drive.url().startsWith(FOLDER_URL), 'opened only the GD-Peeker-dev folder');

  for (const spec of CASES) {
    console.log(`\n${spec.name}`);
    const row = drive.locator(`[aria-label^="${spec.name} "]`).first();
    await row.waitFor({ timeout: 15000 });
    const fileId = await row.evaluate((el) => el.closest('[data-id]')?.getAttribute('data-id') ?? '');
    assert(Boolean(fileId), `${spec.name} row has data-id`);

    const pagePromise = ctx.waitForEvent('page', { timeout: 15000 });
    await row.dblclick();
    const viewer = await pagePromise;
    // 新しいタブは about:blank で現れてから遷移するので、URL が決まるまで待ってから判定する
    await viewer.waitForURL((url) => url.href !== 'about:blank', { timeout: 10000 }).catch(() => {});
    if (!viewer.url().startsWith('chrome-extension://')) {
      // Drive で拡張子に既定アプリ(例: .md → StackEdit)が設定されていると、プレビューではなく
      // そのアプリが開く。GD-Peeker が起動しないのは正しい挙動なので失敗にはしない
      console.log(`  ⚠️ ${spec.name}: Drive opened the default app instead of the preview (${new URL(viewer.url()).host}) — falling back to the /file/d/<id>/view route`);
      await viewer.close();
      await drive.bringToFront();
      await drive.keyboard.press('Escape');
      await drive.waitForTimeout(1000);
      // 「新しいタブで開く」経路: content.js が URL を検知 → background が sniff → viewer
      const viewTab = await ctx.newPage();
      const viaUrl = ctx.waitForEvent('page', { timeout: 15000 });
      await viewTab.goto(`https://drive.google.com/file/d/${fileId}/view`);
      const viewer2 = await viaUrl;
      await viewer2.waitForURL((url) => url.href.startsWith(`chrome-extension://${extId}/viewer.html`) && url.searchParams.get('id') === fileId, { timeout: 10000 });
      assert(viewer2.url().includes(`id=${encodeURIComponent(fileId)}`), `${spec.name} viewer opened from /file/d/<id>/view`);
      assert(await spec.check(viewer2), spec.label);
      await viewer2.close();
      await viewTab.close();
      await drive.bringToFront();
      continue;
    }
    await viewer.waitForURL((url) => url.href.startsWith(`chrome-extension://${extId}/viewer.html`) && url.searchParams.get('id') === fileId, {
      timeout: 10000,
    });
    assert(viewer.url().includes(`id=${encodeURIComponent(fileId)}`), `${spec.name} viewer opened with row file id`);
    assert(await spec.check(viewer), spec.label);

    const previewByTab = await sw.evaluate(() => chrome.storage.session.get('previewByTab').then((r) => r.previewByTab || {}));
    const matchingPreview = Object.values(previewByTab).find((entry) => entry?.fileId === fileId && entry?.fileName === spec.name);
    assert(Boolean(matchingPreview), `${spec.name} previewByTab stored`);

    await viewer.close();
    await drive.bringToFront();
    await drive.keyboard.press('Escape');
    await drive.waitForTimeout(1000);
  }
} finally {
  await ctx.close();
}

console.log(`\n結果: ${passed}/${passed + failed} パス`);
process.exit(failed ? 1 : 0);
