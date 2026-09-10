import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createMarkdownRenderer } from '../../extension/lib/mdrender.js';

const require = createRequire(join(process.cwd(), 'scripts', 'noop.js'));
const libs = {
  MarkdownIt: require('markdown-it'),
  markdownItFootnote: require('markdown-it-footnote'),
  markdownItTaskLists: require('markdown-it-task-lists'),
  markdownItAnchor: require('markdown-it-anchor'),
  markdownItFrontMatter: require('markdown-it-front-matter'),
  hljs: require('highlight.js/lib/common'),
  DOMPurify: {
    sanitize(html) {
      return html
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
        .replace(/\son\w+="[^"]*"/gi, '');
    },
  },
};

test('sanitizer removes script HTML', () => {
  const renderer = createMarkdownRenderer(libs);
  const result = renderer.render('# Title\n\n<script>globalThis.x=1</script><p>ok</p>');
  assert.doesNotMatch(result.html, /script/);
  assert.match(result.html, /<p>ok<\/p>/);
});

test('mermaid fence remains a pre.mermaid block', () => {
  const renderer = createMarkdownRenderer(libs);
  const result = renderer.render('```mermaid\ngraph TD\n  A-->B\n```');
  assert.match(result.html, /<pre class="mermaid">graph TD/);
});

test('front matter is rendered as collapsed details', () => {
  const renderer = createMarkdownRenderer(libs);
  const result = renderer.render('---\ntitle: Demo\n---\n\n# Body');
  assert.match(result.html, /<details class="front-matter">/);
  assert.match(result.html, /title: Demo/);
});

test('footnotes and task lists render through configured plugins', () => {
  const renderer = createMarkdownRenderer(libs);
  const result = renderer.render('- [x] done\n\nnote[^1]\n\n[^1]: foot');
  assert.match(result.html, /task-list-item/);
  assert.match(result.html, /footnote/);
});

test('task item keeps inline markup once (labelAfter regression)', () => {
  const renderer = createMarkdownRenderer(libs);
  const result = renderer.render('- [x] keep `code` intact');
  assert.match(result.html, /<code>code<\/code>/);
  assert.equal(result.html.match(/keep/g).length, 1);
  assert.doesNotMatch(result.html, /`code`/);
});

test('headings are collected for TOC', () => {
  const renderer = createMarkdownRenderer(libs, { toc: true });
  const result = renderer.render('# One\n\n## Two');
  assert.deepEqual(result.toc.map((item) => item.text), ['One', 'Two']);
  assert.match(result.html, /id="one"/);
});
