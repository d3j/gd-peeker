// ストア掲載用のスクリーンショットとプロモ画像を生成する。
// 使い方: cd <playwright-core を入れた作業ディレクトリ> && node ~/Code/gd-peeker/scripts/store-assets.mjs
// 出力: dist/store/*.png(スクショ 1280x800 x5、小タイル 440x280、マーキー 1400x560)
// 実機 Drive には触らない。E2E と同じく drive.google.com/uc* を route で差し替える。

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, homedir } from 'node:os';

const require = createRequire(join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright-core');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT_DIR = join(root, 'extension');
const OUT = join(root, 'dist', 'store');
mkdirSync(OUT, { recursive: true });

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
  throw new Error('Chrome for Testing が見つかりません。CHROME_FOR_TESTING で指定してください');
}

const sjis = (text) => execFileSync('iconv', ['-f', 'UTF-8', '-t', 'SHIFT_JIS'], { input: Buffer.from(text, 'utf8'), maxBuffer: 1 << 20 });

const htmlDoc = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Q3 Release Notes</title>
<style>
  body{font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;color:#202124;background:#fff}
  header{background:linear-gradient(135deg,#1a73e8,#174ea6);color:#fff;padding:40px 56px}
  header h1{margin:0 0 6px;font-size:32px}
  header p{margin:0;opacity:.85}
  main{padding:32px 56px;max-width:900px}
  table{border-collapse:collapse;width:100%;margin:18px 0}
  th,td{border:1px solid #dadce0;padding:8px 12px;text-align:left}
  th{background:#f1f3f4}
  .chart{display:flex;align-items:flex-end;gap:14px;height:150px;margin:20px 0}
  .chart div{width:56px;background:#1a73e8;border-radius:4px 4px 0 0;color:#fff;font-size:12px;text-align:center;padding-top:6px}
  code{background:#f1f3f4;padding:2px 5px;border-radius:4px}
</style></head>
<body>
<header><h1>Q3 Release Notes</h1><p>Generated report — stored on Google Drive as a plain .html file</p></header>
<main>
  <p>This page is a regular HTML file in a Drive folder. Drive's own preview shows it as source text; GD-Peeker renders it, and its scripts still run inside an isolated sandbox.</p>
  <div class="chart" id="chart"></div>
  <table><thead><tr><th>Module</th><th>Status</th><th>Owner</th></tr></thead>
  <tbody><tr><td>Viewer</td><td>Shipped</td><td>Platform</td></tr>
  <tr><td>Encoding detection</td><td>Shipped</td><td>Platform</td></tr>
  <tr><td>Settings</td><td>In review</td><td>UX</td></tr></tbody></table>
  <p>Rendered by <code>document.write</code>-free inline script:</p>
</main>
<script>
  const bars=[['Jul',70],['Aug',96],['Sep',132],['Oct',118]];
  const el=document.getElementById('chart');
  for(const [m,v] of bars){const d=document.createElement('div');d.style.height=v+'px';d.textContent=m;el.append(d);}
</script>
</body></html>`;

const mdDoc = `---
title: GD-Peeker design notes
author: Platform team
---

# Design notes

GD-Peeker renders Drive files **locally**. No server, no OAuth, no upload.

## Pipeline

\`\`\`mermaid
graph LR
  A[Drive preview] --> B[background: header sniff]
  B --> C[viewer tab]
  C --> D[sandbox iframe]
\`\`\`

## Supported formats

| Format | Rendering | Notes |
|---|---|---|
| \`.html\` | sandboxed iframe | scripts run, isolated |
| \`.md\` | markdown-it + DOMPurify | GFM, footnotes, mermaid |
| \`.txt\` | plain text | UTF-8 / Shift_JIS / EUC-JP |
| \`.xml\` | formatted tree | foldable nodes |

## Checklist

- [x] Sandbox has no \`allow-same-origin\`
- [x] Markdown output is sanitized
- [ ] CSV table view

## Code

\`\`\`js
const kind = detectFileType(fileName, contentType);
if (kind === 'md') render(await decode(bytes));
\`\`\`

Footnote support is on[^1].

[^1]: Rendered by markdown-it-footnote.
`;

const txtDoc = `GD-Peeker — Shift_JIS のテキストも読める

Google ドライブの標準プレビューは、Shift_JIS で保存された日本語のテキストファイルを
文字化けしたまま表示することがあります。GD-Peeker は BOM、UTF-8 の厳格デコード、
Shift_JIS と EUC-JP のスコアリングの順に判定し、判定結果と根拠をツールバーに出します。

判定が外れたときは、ツールバーのプルダウンから手動で文字コードを選び直せます。
選び直すとその場で再デコードされ、元のファイルには一切書き戻しません。

  ・対応形式:   .html / .md / .txt / .xml / .json などのコード系
  ・文字コード: UTF-8、UTF-16(BOM 付き)、Shift_JIS、EUC-JP
  ・判定の順序: BOM → UTF-8 の厳格デコード → Shift_JIS / EUC-JP のスコアリング
  ・折り返しと文字サイズは設定画面から変更できます

── 使い方 ──────────────────────────────────────

  1. Google ドライブでファイルをダブルクリックする
  2. 別タブが開き、GD-Peeker が中身を描画する
  3. 開かなかったときは、ツールバーの拡張アイコンを押す

ファイル本文はサーバに送られません。OAuth のログイン画面も出ません。
すでにログインしているブラウザの Drive セッションでファイルを取得し、
Chrome の中だけで描画します。設定だけがローカルに保存されます。
`;

const xmlDoc = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Drive に置いた設定ファイルの例 -->
<catalog xmlns="https://example.test/catalog" updated="2026-09-10">
  <product id="gd-peeker" type="extension"><name>GD-Peeker</name><version>0.1.0</version>
  <formats><format ext="html" renderer="sandbox"/><format ext="md" renderer="markdown-it"/>
  <format ext="txt" renderer="text"/><format ext="xml" renderer="tree"/></formats>
  <privacy><collects>none</collects><transmits>none</transmits></privacy></product>
  <product id="example" type="sample"><name>Sample entry</name><version>1.2.3</version>
  <description><![CDATA[Formatted and foldable, straight from Drive.]]></description></product>
</catalog>`;

const FIXTURES = {
  'shot-html': { name: 'q3-release-notes.html', type: 'text/html; charset=utf-8', body: htmlDoc },
  'shot-md': { name: 'design-notes.md', type: 'text/markdown; charset=utf-8', body: mdDoc },
  'shot-txt': { name: 'shift_jis-memo.txt', type: 'text/plain', body: sjis(txtDoc) },
  'shot-xml': { name: 'catalog.xml', type: 'application/xml; charset=utf-8', body: xmlDoc },
};

const SETTINGS = {
  autoOpen: true,
  autoOpenTypes: ['html', 'md', 'txt', 'xml'],
  html: { allowScripts: true, allowExternal: false },
  md: { preset: 'gfm', plugins: { footnote: true, taskLists: true, anchor: true, frontMatter: true, mermaid: true }, theme: 'github', colorScheme: 'light', toc: true, fullWidth: true },
  txt: { wrap: true, fontSize: 15, lineNumbers: false },
  encoding: { default: 'auto' },
  uiLang: 'en',
};

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'gd-peeker-shots-')), {
  headless: true,
  executablePath: findChrome(),
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  const extId = new URL(sw.url()).host;

  await ctx.route('https://drive.google.com/uc**', async (route) => {
    const id = new URL(route.request().url()).searchParams.get('id');
    const f = FIXTURES[id];
    if (!f) return route.fulfill({ status: 404, body: 'not a fixture' });
    await route.fulfill({
      status: 200,
      headers: { 'content-type': f.type, 'content-disposition': `attachment; filename="${f.name}"` },
      body: f.body,
    });
  });
  await ctx.route('https://drive.usercontent.google.com/**', (route) => route.fulfill({ status: 500, body: 'unused' }));

  const setSettings = (settings, extra = {}) =>
    sw.evaluate(([s, e]) => chrome.storage.local.set({ settings: s, ...e }), [settings, extra]);

  const shoot = async (file, url, ready, extra = {}) => {
    const page = await ctx.newPage();
    await page.goto(url);
    await ready(page);
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, file), ...extra });
    await page.close();
    console.log(`wrote dist/store/${file}`);
  };

  // 1. HTML(安全性の通知バーを出したまま)
  await setSettings(SETTINGS, { htmlNoticeDismissed: false });
  await shoot('screenshot-1-html.png', `chrome-extension://${extId}/viewer.html?id=shot-html`, (p) =>
    p.frameLocator('#sandbox').frameLocator('#user').locator('#chart div').first().waitFor({ timeout: 10000 })
  );

  // 2. Markdown(TOC・表・タスク・ハイライト・mermaid)
  await setSettings(SETTINGS, { htmlNoticeDismissed: true });
  await shoot('screenshot-2-markdown.png', `chrome-extension://${extId}/viewer.html?id=shot-md`, async (p) => {
    await p.frameLocator('#sandbox').locator('.md-root svg').first().waitFor({ timeout: 30000 });
  });

  // 3. Shift_JIS のテキスト(ツールバーに判定結果)
  await shoot('screenshot-3-shift-jis.png', `chrome-extension://${extId}/viewer.html?id=shot-txt`, (p) =>
    p.frameLocator('#sandbox').locator('.text-pre').waitFor({ timeout: 10000 })
  );

  // 4. XML(整形 + 折りたたみ)
  await shoot('screenshot-4-xml.png', `chrome-extension://${extId}/viewer.html?id=shot-xml`, (p) =>
    p.frameLocator('#sandbox').locator('.xml-view').waitFor({ timeout: 10000 })
  );

  // 5. 設定画面
  await shoot('screenshot-5-settings.png', `chrome-extension://${extId}/options.html`, (p) =>
    p.locator('#autoOpen').waitFor({ timeout: 10000 })
  );

  // プロモ画像(小タイル / マーキー)
  const iconSvg = readFileSync(join(EXT_DIR, 'icons', 'icon.svg'), 'utf8');
  const promo = (w, h, iconSize, titleSize, subSize, gap) => `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0}
  body{width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;gap:${gap}px;
    background:linear-gradient(135deg,#0b1020 0%,#174ea6 60%,#1a73e8 100%);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#fff;overflow:hidden}
  .icon{width:${iconSize}px;height:${iconSize}px;flex:none;filter:drop-shadow(0 6px 18px rgba(0,0,0,.35))}
  .icon svg{width:100%;height:100%;display:block}
  h1{margin:0;font-size:${titleSize}px;font-weight:700;letter-spacing:-.5px}
  p{margin:${Math.round(subSize * 0.5)}px 0 0;font-size:${subSize}px;line-height:1.45;opacity:.92;font-weight:500}
</style>
<div class="icon">${iconSvg}</div>
<div><h1>GD-Peeker</h1><p>HTML · Markdown · XML · Text<br>rendered from Google Drive™</p></div>`;

  for (const [file, w, h, icon, title, sub, gap] of [
    ['promo-small-440x280.png', 440, 280, 96, 38, 14, 20],
    ['promo-marquee-1400x560.png', 1400, 560, 240, 104, 34, 56],
  ]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(promo(w, h, icon, title, sub, gap));
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, file), clip: { x: 0, y: 0, width: w, height: h } });
    await page.close();
    console.log(`wrote dist/store/${file}`);
  }
} finally {
  await ctx.close();
}
