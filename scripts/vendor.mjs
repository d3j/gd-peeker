import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pkg from './package.json' with { type: 'json' };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'extension', 'vendor');
const TMP = join(ROOT, 'scripts', '.vendor-entry');
const deps = pkg.devDependencies;
const require = createRequire(import.meta.url);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await mkdir(TMP, { recursive: true });

await writeFile(
  join(TMP, 'md-runtime.js'),
  `
import MarkdownIt from 'markdown-it';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItTaskLists from 'markdown-it-task-lists';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItFrontMatter from 'markdown-it-front-matter';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
globalThis.GDP = { MarkdownIt, markdownItFootnote, markdownItTaskLists, markdownItAnchor, markdownItFrontMatter, DOMPurify, hljs };
`
);

await writeFile(
  join(TMP, 'mermaid.js'),
  `
import mermaid from 'mermaid';
globalThis.mermaid = mermaid;
`
);

await writeFile(
  join(TMP, 'sandbox-runtime.js'),
  `
import { createMarkdownRenderer, normalizeMdOptions } from '../../extension/lib/mdrender.js';
import { formatXml, jsonPretty } from '../../extension/lib/xmlformat.js';
globalThis.GDPSandbox = { createMarkdownRenderer, normalizeMdOptions, formatXml, jsonPretty };
`
);

await build({
  entryPoints: [join(TMP, 'md-runtime.js')],
  outfile: join(OUT, 'md-runtime.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'chrome120',
  legalComments: 'none',
  logLevel: 'info',
});

await build({
  entryPoints: [join(TMP, 'mermaid.js')],
  outfile: join(OUT, 'mermaid.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'chrome120',
  legalComments: 'none',
  logLevel: 'info',
});

await build({
  entryPoints: [join(TMP, 'sandbox-runtime.js')],
  outfile: join(OUT, 'sandbox-runtime.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'chrome120',
  legalComments: 'none',
  logLevel: 'info',
});

await copyPackageFile('highlight.js', 'styles/github.css', 'hljs-theme-light.css');
await copyPackageFile('highlight.js', 'styles/github-dark.css', 'hljs-theme-dark.css');

await writeFile(join(OUT, 'md-theme-github.css'), mdThemeGithub());
await writeFile(join(OUT, 'md-theme-plain.css'), mdThemePlain());
await writeFile(join(OUT, 'md-theme-serif.css'), mdThemeSerif());
await writeFile(join(OUT, 'VERSIONS.md'), await versions());
await writeFile(join(OUT, 'LICENSES.txt'), await licenses());
await rm(TMP, { recursive: true, force: true });

async function copyPackageFile(name, rel, outName) {
  const pkgPath = await packageDir(name);
  await writeFile(join(OUT, outName), await readFile(join(pkgPath, rel), 'utf8'));
}

async function versions() {
  const rows = [['Library', 'Version', 'License'], ['---', '---', '---']];
  for (const [name, version] of Object.entries(deps)) {
    rows.push([name, version, await packageLicense(name)]);
  }
  return `# Vendored Libraries

Generated: ${new Date().toISOString()}

${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}
`;
}

async function licenses() {
  const blocks = [];
  for (const [name, version] of Object.entries(deps)) {
    const pkgDir = await packageDir(name);
    const text = await firstReadable(
      ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'COPYING'].map((file) => join(pkgDir, file))
    );
    blocks.push(`===== ${name} ${version} (${await packageLicense(name)}) =====\n\n${text || 'No license file found in package.'}`);
  }
  return `${blocks.join('\n\n')}\n`;
}

async function packageLicense(name) {
  const p = await readFile(join(await packageDir(name), 'package.json'), 'utf8');
  return JSON.parse(p).license || 'UNKNOWN';
}

async function packageDir(name) {
  let dir = dirname(require.resolve(name));
  while (dir !== dirname(dir)) {
    try {
      await readFile(join(dir, 'package.json'), 'utf8');
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error(`package.json not found for ${name}`);
}

async function firstReadable(paths) {
  for (const path of paths) {
    try {
      return await readFile(path, 'utf8');
    } catch {}
  }
  return '';
}

function mdThemeGithub() {
  return `
.md-root{max-width:980px;margin:0 auto;padding:24px 32px;font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#24292f;background:#fff}
.md-root h1,.md-root h2{padding-bottom:.3em;border-bottom:1px solid #d0d7de}
.md-root h1{font-size:2em}.md-root h2{font-size:1.5em}.md-root h3{font-size:1.25em}
.md-root a{color:#0969da}.md-root table{border-collapse:collapse;display:block;overflow:auto}.md-root th,.md-root td{padding:6px 13px;border:1px solid #d0d7de}.md-root tr:nth-child(2n){background:#f6f8fa}
.md-root blockquote{margin:0;padding:0 1em;color:#57606a;border-left:.25em solid #d0d7de}.md-root code{padding:.2em .4em;border-radius:4px;background:#afb8c133}.md-root pre{padding:16px;overflow:auto;border-radius:6px;background:#f6f8fa}.md-root pre code{padding:0;background:transparent}
.md-root img{max-width:100%}.md-root .task-list-item{list-style-type:none}.md-root .front-matter{margin:0 0 16px;border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa}.md-root .front-matter summary{padding:8px 12px;cursor:pointer}.md-root .front-matter pre{margin:0;border-radius:0}
@media (prefers-color-scheme:dark){body.scheme-auto .md-root{color:#c9d1d9;background:#0d1117}body.scheme-auto .md-root h1,body.scheme-auto .md-root h2,body.scheme-auto .md-root th,body.scheme-auto .md-root td,body.scheme-auto .md-root .front-matter{border-color:#30363d}body.scheme-auto .md-root a{color:#58a6ff}body.scheme-auto .md-root tr:nth-child(2n),body.scheme-auto .md-root pre,body.scheme-auto .md-root .front-matter{background:#161b22}body.scheme-auto .md-root code{background:#6e768166}body.scheme-auto .md-root blockquote{color:#8b949e;border-left-color:#30363d}}
body.scheme-dark .md-root{color:#c9d1d9;background:#0d1117}body.scheme-dark .md-root h1,body.scheme-dark .md-root h2,body.scheme-dark .md-root th,body.scheme-dark .md-root td,body.scheme-dark .md-root .front-matter{border-color:#30363d}body.scheme-dark .md-root a{color:#58a6ff}body.scheme-dark .md-root tr:nth-child(2n),body.scheme-dark .md-root pre,body.scheme-dark .md-root .front-matter{background:#161b22}body.scheme-dark .md-root code{background:#6e768166}body.scheme-dark .md-root blockquote{color:#8b949e;border-left-color:#30363d}
`;
}

function mdThemePlain() {
  return `
.md-root{max-width:920px;margin:0 auto;padding:24px 32px;font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1f2328;background:#fff}
.md-root pre{padding:14px;overflow:auto;background:#f5f5f5}.md-root code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.md-root img{max-width:100%}.md-root table{border-collapse:collapse}.md-root th,.md-root td{padding:6px 10px;border:1px solid #d0d7de}.md-root .front-matter{border:1px solid #d0d7de;padding:0 10px}
body.scheme-dark .md-root{color:#e6edf3;background:#0f1115}body.scheme-dark .md-root pre{background:#1a1d24}body.scheme-dark .md-root th,body.scheme-dark .md-root td,body.scheme-dark .md-root .front-matter{border-color:#3a3f4b}
`;
}

function mdThemeSerif() {
  return `
.md-root{max-width:780px;margin:0 auto;padding:28px 36px;font:18px/1.75 Georgia,"Times New Roman",serif;color:#202124;background:#fff}
.md-root code,.md-root pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}.md-root pre{padding:16px;overflow:auto;background:#f6f6f2}.md-root img{max-width:100%}.md-root table{border-collapse:collapse}.md-root th,.md-root td{padding:6px 10px;border:1px solid #d2d0c8}.md-root .front-matter{border:1px solid #d2d0c8;padding:0 10px;background:#faf9f4}
body.scheme-dark .md-root{color:#ece6d9;background:#111}body.scheme-dark .md-root pre,body.scheme-dark .md-root .front-matter{background:#1b1b18}body.scheme-dark .md-root th,body.scheme-dark .md-root td,body.scheme-dark .md-root .front-matter{border-color:#444039}
`;
}
