import test from 'node:test';
import assert from 'node:assert/strict';
import { formatXml, jsonPretty } from '../../extension/lib/xmlformat.js';

test('formats XML with two-space indentation in Node fallback', () => {
  const result = formatXml('<root><item id="1">text</item><empty/></root>');
  assert.equal(result.ok, true);
  assert.match(result.text, /<root>\n  <item id="1">\n    text\n  <\/item>\n  <empty\/>\n<\/root>/);
});

test('keeps declaration, comments, CDATA, and processing instruction', () => {
  const result = formatXml('<?xml version="1.0"?><root><?pi ok?><!--note--><![CDATA[<x>]]></root>');
  assert.equal(result.ok, true);
  assert.match(result.text, /<\?xml version="1.0"\?>/);
  assert.match(result.text, /<\?pi ok\?>/);
  assert.match(result.text, /<!--note-->/);
  assert.match(result.text, /<!\[CDATA\[<x>\]\]>/);
});

test('reports malformed XML', () => {
  const result = formatXml('<root><item></root>');
  assert.equal(result.ok, false);
  assert.match(result.error, /XML parse error/);
});

test('pretty prints JSON when valid and leaves invalid JSON alone', () => {
  assert.equal(jsonPretty('{"a":1,"b":[2]}'), '{\n  "a": 1,\n  "b": [\n    2\n  ]\n}');
  assert.equal(jsonPretty('{"a":'), '{"a":');
});
