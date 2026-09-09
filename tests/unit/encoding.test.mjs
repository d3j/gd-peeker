import test from 'node:test';
import assert from 'node:assert/strict';
import { decode } from '../../extension/lib/encoding.js';

test('decodes strict UTF-8', () => {
  const result = decode(new TextEncoder().encode('hello 日本語'));
  assert.equal(result.text, 'hello 日本語');
  assert.equal(result.encoding, 'utf-8');
  assert.equal(result.confidence, 'strict');
});

test('decodes UTF-8 BOM', () => {
  const result = decode(bytes('ef bb bf 41 42 43'));
  assert.equal(result.text, 'ABC');
  assert.equal(result.encoding, 'utf-8');
  assert.equal(result.confidence, 'bom');
  assert.equal(result.hadBom, true);
});

test('decodes UTF-16LE BOM', () => {
  const result = decode(bytes('ff fe 53 30 93 30 6b 30 61 30 6f 30'));
  assert.equal(result.text, 'こんにちは');
  assert.equal(result.encoding, 'utf-16le');
});

test('decodes UTF-16BE BOM', () => {
  const result = decode(bytes('fe ff 30 53 30 93 30 6b 30 61 30 6f'));
  assert.equal(result.text, 'こんにちは');
  assert.equal(result.encoding, 'utf-16be');
});

test('detects Shift_JIS by heuristic', () => {
  const result = decode(bytes('82 b1 82 f1 82 c9 82 bf 82 cd 93 fa 96 7b 8c ea'));
  assert.equal(result.text, 'こんにちは日本語');
  assert.equal(result.encoding, 'shift_jis');
  assert.equal(result.confidence, 'heuristic');
});

test('detects EUC-JP by heuristic', () => {
  const result = decode(bytes('a4 b3 a4 f3 a4 cb a4 c1 a4 cf c6 fc cb dc b8 ec'));
  assert.equal(result.text, 'こんにちは日本語');
  assert.equal(result.encoding, 'euc-jp');
  assert.equal(result.confidence, 'heuristic');
});

test('manual override wins', () => {
  const result = decode(bytes('82 b1 82 f1'), 'utf-8');
  assert.equal(result.encoding, 'utf-8');
  assert.match(result.text, /\uFFFD/);
});

function bytes(hex) {
  return Uint8Array.from(hex.split(/\s+/).map((part) => Number.parseInt(part, 16)));
}
