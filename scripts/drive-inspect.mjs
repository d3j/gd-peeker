// 本物の Drive で「いま何が起きているか」を見るための調査スクリプト(開発者用)。
// scripts/drive-profile.sh でログイン済みのプロファイルを Playwright から開き、
// 指定 URL を表示 → 任意でファイル名をダブルクリック → URL / title / iframe 一覧 / 拡張の
// [GD-Peeker] ログをダンプする。
//
//   cd <playwright-core を入れた作業ディレクトリ>
//   node ~/Code/gd-peeker/scripts/drive-inspect.mjs "https://drive.google.com/drive/folders/1DkhF-K_7FymE8hWRNh8ehvEnS16rBvhW" [ダブルクリックするファイル名]
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
const [url = 'https://drive.google.com/drive/folders/1DkhF-K_7FymE8hWRNh8ehvEnS16rBvhW', fileName] = process.argv.slice(2);

function findChrome() {
  if (process.env.CHROME_FOR_TESTING) return process.env.CHROME_FOR_TESTING;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const dirs = readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const p = join(cache, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (existsSync(p)) return p;
  }
  throw new Error('Chrome for Testing が見つかりません');
}

if (!existsSync(PROFILE)) {
  console.error(`プロファイルがありません: ${PROFILE}\n先に bash scripts/drive-profile.sh でログインしてください`);
  process.exit(1);
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
  ignoreDefaultArgs: ['--enable-automation'], // keep Playwright's --use-mock-keychain: drive-profile.sh logs in with the same flag so cookies decrypt here
  args: ['--disable-blink-features=AutomationControlled', `--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
});
const sw0 = await freshServiceWorker(ctx);
const logs = [];
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on('console', (m) => { if (m.text().includes('[GD-Peeker]')) logs.push(`[page] ${m.text()}`); });
for (const sw of ctx.serviceWorkers()) sw.on('console', (m) => logs.push(`[sw] ${m.text()}`));
ctx.on('serviceworker', (sw) => sw.on('console', (m) => logs.push(`[sw] ${m.text()}`)));

await page.goto(url);
await page.waitForTimeout(4000);
const dump = async (label) => {
  const info = await page.evaluate(() => ({
    href: location.href,
    title: document.title,
    iframes: [...document.querySelectorAll('iframe')].map((f) => f.src).filter(Boolean),
  }));
  console.log(`\n=== ${label}`);
  console.log(JSON.stringify(info, null, 2));
  console.log('frames (playwright):');
  for (const f of page.frames()) console.log('  ', f.url());
  console.log('pages:', ctx.pages().map((p) => p.url()));
};
await dump('after load');
if (fileName) {
  // Drive の一覧は行に aria-label="<name> <type>" を持つ(テキスト完全一致では掴めない)
  const row = page.locator(`[aria-label^="${fileName} "]`).first();
  await row.waitFor({ timeout: 10000 });
  console.log('row data-id:', await row.evaluate((el) => el.closest('[data-id]')?.getAttribute('data-id') ?? ''));
  await row.dblclick();
  await page.waitForTimeout(4000);
  await dump(`after dblclick ${fileName}`);
}
console.log('\n=== [GD-Peeker] logs');
console.log(logs.join('\n') || '(none)');
await ctx.close();
