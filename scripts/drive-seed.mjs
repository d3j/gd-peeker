// テスト用 Drive アカウントに tests/fixtures/* をアップロードする(開発者用)。
// 前提: scripts/drive-profile.sh でログイン済み。playwright-core を入れた作業ディレクトリから実行する。
//   node ~/Code/gd-peeker/scripts/drive-seed.mjs
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const require = createRequire(join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright-core');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT_DIR = join(ROOT, 'extension');
const FIXTURES = join(ROOT, 'tests', 'fixtures');
const PROFILE = process.env.GD_PEEKER_PROFILE || join(homedir(), '.gd-peeker', 'profile');

function findChrome() {
  if (process.env.CHROME_FOR_TESTING) return process.env.CHROME_FOR_TESTING;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const dirs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const p = join(cache, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (existsSync(p)) return p;
  }
  throw new Error('Chrome for Testing が見つかりません');
}

const files = readdirSync(FIXTURES).filter((n) => n.startsWith('gdp-')).map((n) => join(FIXTURES, n));
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  executablePath: findChrome(),
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--disable-blink-features=AutomationControlled', `--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
});
try {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://drive.google.com/drive/folders/1DkhF-K_7FymE8hWRNh8ehvEnS16rBvhW');
  await page.getByRole('button', { name: /^新規$|^New$/ }).first().click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    page.getByRole('menuitem', { name: /ファイルのアップロード|File upload/ }).first().click(),
  ]);
  await chooser.setFiles(files);
  await page.getByText(/アップロードが完了|uploads? complete/i).first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(2000);
  console.log('uploaded:', files.map((f) => f.split('/').pop()).join(', '));
} finally {
  await ctx.close();
}
