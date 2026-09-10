// ストア提出用 zip を作る。extension/ をそのまま固める前に SPEC §11 の機械確認を通す。
// 使い方: cd scripts && npm run pack   (出力 dist/gd-peeker-<version>.zip、dist/ は .gitignore 済み)

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extDir = join(root, 'extension');
const distDir = join(root, 'dist');

const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));
const problems = [];

// SPEC §11: 権限は storage / webRequest のみ、host_permissions は 3 つのみ
const perms = [...manifest.permissions].sort();
if (perms.join(',') !== 'storage,webRequest') problems.push(`permissions が ${perms.join(',')}`);
const hosts = [...manifest.host_permissions].sort();
const wantHosts = [
  'https://*.googleusercontent.com/*',
  'https://drive.google.com/*',
  'https://drive.usercontent.google.com/*',
];
if (hosts.join(',') !== wantHosts.join(',')) problems.push(`host_permissions が ${hosts.join(',')}`);
for (const key of ['identity', 'declarativeNetRequest', 'webRequestBlocking', '<all_urls>']) {
  if (JSON.stringify(manifest).includes(key)) problems.push(`manifest に ${key} が入っている`);
}

// ストアの文字数上限(超えると manifest が受理されない)
if ([...manifest.name].length > 75) problems.push(`name が ${[...manifest.name].length} 文字(上限 75)`);
if ([...manifest.short_name].length > 12) problems.push(`short_name が ${[...manifest.short_name].length} 文字(上限 12)`);
if ([...manifest.description].length > 132) {
  problems.push(`description が ${[...manifest.description].length} 文字(上限 132)`);
}

// SPEC §11: extension/ 配下に外部のスクリプト/スタイル参照が無いこと(vendor と Drive のホストは対象外)
const grep = spawnGrep();
if (grep.length) problems.push(`外部参照が残っている:\n    ${grep.join('\n    ')}`);

// CLAUDE.md: mdrender / xmlformat を変えたら vendor を再生成する
const bundle = join(extDir, 'vendor', 'sandbox-runtime.js');
for (const src of ['mdrender.js', 'xmlformat.js']) {
  const p = join(extDir, 'lib', src);
  if (statSync(p).mtimeMs > statSync(bundle).mtimeMs) {
    problems.push(`lib/${src} が vendor/sandbox-runtime.js より新しい(cd scripts && npm run vendor)`);
  }
}

if (problems.length) {
  console.error('❌ 提出前チェックに失敗:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });
const zipPath = join(distDir, `gd-peeker-${manifest.version}.zip`);
rmSync(zipPath, { force: true });
// -X: macOS の拡張属性を入れない(審査で不要なファイルを増やさない)
execFileSync('zip', ['-r', '-X', '-q', zipPath, '.', '-x', '.DS_Store', '*/.DS_Store', 'icons/icon.svg'], {
  cwd: extDir,
});

const list = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).trim().split('\n');
if (!list.includes('manifest.json')) {
  console.error('❌ zip の直下に manifest.json が無い');
  process.exit(1);
}
console.log(`✅ ${zipPath}`);
console.log(`   ${list.length} entries / ${(statSync(zipPath).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`   name: ${manifest.name}`);
console.log(`   version: ${manifest.version}`);

function spawnGrep() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSyncSafe(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (p === join(extDir, 'vendor')) continue;
        walk(p);
        continue;
      }
      if (!/\.(html|js|css)$/.test(entry)) continue;
      const text = readFileSync(p, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (!line.includes('https://')) return;
        if (/drive\.google\.com|drive\.usercontent|googleusercontent|accounts\.google/.test(line)) return;
        out.push(`${p.slice(root.length + 1)}:${i + 1}: ${line.trim()}`);
      });
    }
  };
  walk(extDir);
  return out;
}

function readdirSyncSafe(dir) {
  return existsSync(dir) ? readdirSync(dir) : [];
}
