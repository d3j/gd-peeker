import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFileType, extensionFromName, isAutoOpenKind } from '../../extension/lib/filetype.js';

test('extensionFromName extracts lowercase extension and excludes svg', () => {
  assert.equal(extensionFromName('Report.HTML'), 'html');
  assert.equal(extensionFromName('archive.tar.gz?x=1'), 'gz');
  assert.equal(extensionFromName('vector.svg'), '');
  assert.equal(extensionFromName('README'), '');
});

test('detectFileType maps supported document extensions', () => {
  assert.deepEqual(detectFileType({ name: 'index.xhtml' }), { kind: 'html', ext: 'xhtml', language: null });
  assert.deepEqual(detectFileType({ name: 'notes.markdown' }), { kind: 'md', ext: 'markdown', language: null });
  assert.deepEqual(detectFileType({ name: 'feed.atom' }), { kind: 'xml', ext: 'atom', language: null });
  assert.deepEqual(detectFileType({ name: 'debug.log' }), { kind: 'txt', ext: 'log', language: null });
});

test('detectFileType maps code extensions and languages', () => {
  assert.deepEqual(detectFileType({ name: 'app.mjs' }), { kind: 'code', ext: 'mjs', language: 'javascript' });
  assert.deepEqual(detectFileType({ name: 'config.yaml' }), { kind: 'code', ext: 'yaml', language: 'yaml' });
});

test('detectFileType falls back to MIME where useful', () => {
  assert.equal(detectFileType({ name: 'download', mime: 'text/html; charset=utf-8' }).kind, 'txt');
  assert.equal(detectFileType({ name: 'download.bin', mime: 'application/rss+xml' }).kind, 'xml');
});

test('isAutoOpenKind follows settings list', () => {
  assert.equal(isAutoOpenKind('html', { autoOpenTypes: ['html'] }), true);
  assert.equal(isAutoOpenKind('code', { autoOpenTypes: ['html'] }), false);
});
