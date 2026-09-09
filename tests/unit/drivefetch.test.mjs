import test from 'node:test';
import assert from 'node:assert/strict';
import { findConfirmUrl, isGoogleDriveHtmlPage, parseContentDisposition } from '../../extension/lib/drivefetch.js';

test('parseContentDisposition prefers RFC 5987 filename*', () => {
  assert.equal(
    parseContentDisposition('attachment; filename="fallback.html"; filename*=UTF-8\'\'%E3%83%86%E3%82%B9%E3%83%88.html'),
    'テスト.html'
  );
});

test('parseContentDisposition handles quoted filename fallback', () => {
  assert.equal(parseContentDisposition('attachment; filename="report \\"final\\".txt"'), 'report "final".txt');
});

test('findConfirmUrl builds retry URL from Google Drive confirm form', () => {
  const html = `
    <html><body>
      <form action="/uc?export=download">
        <input type="hidden" name="id" value="abc123">
        <input type="hidden" name="confirm" value="t">
        <input type="hidden" name="uuid" value="u1">
      </form>
    </body></html>`;
  assert.equal(
    findConfirmUrl(html, 'https://drive.google.com/uc?export=download&id=abc123'),
    'https://drive.google.com/uc?export=download&id=abc123&confirm=t&uuid=u1'
  );
});

test('isGoogleDriveHtmlPage detects login or Drive shell pages', () => {
  assert.equal(
    isGoogleDriveHtmlPage({ url: 'https://drive.google.com/', contentType: 'text/html', text: '<title>Google Drive</title>' }),
    true
  );
  assert.equal(
    isGoogleDriveHtmlPage({ url: 'https://accounts.google.com/signin', contentType: 'text/html', text: '' }),
    true
  );
  assert.equal(
    isGoogleDriveHtmlPage({ url: 'https://drive.google.com/uc', contentType: 'text/html', text: '<title>User file</title>' }),
    false
  );
});
