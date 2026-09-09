// 本物の Drive で「いま何が起きているか」を見るための調査スクリプト(開発者用)。
// scripts/drive-profile.sh でログイン済みのプロファイルを Playwright から開き、
// 指定 URL を表示 → 任意でファイル名をダブルクリック → URL / title / iframe 一覧 / 拡張の
// [GD-Peeker] ログをダンプする。
//
//   cd <playwright-core を入れた作業ディレクトリ>
//   node ~/Code/gd-peeker/scripts/drive-inspect.mjs "https://drive.google.com/drive/my-drive" [ダブルクリックするファイル名]
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
const [url = 'https://drive.google.com/drive/my-drive', fileName] = process.argv.slice(2);

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

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  executablePath: findChrome(),
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--disable-blink-features=AutomationControlled', `--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
});
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
  const row = page.getByText(fileName, { exact: true }).first();
  await row.waitFor({ timeout: 10000 });
  await row.dblclick();
  await page.waitForTimeout(4000);
  await dump(`after dblclick ${fileName}`);
}
console.log('\n=== [GD-Peeker] logs');
console.log(logs.join('\n') || '(none)');
await ctx.close();
