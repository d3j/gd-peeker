import test from 'node:test';
import assert from 'node:assert/strict';
import { findConfirmUrl, isGoogleDriveHtmlPage, parseContentDisposition, sniffDriveFile } from '../../extension/lib/drivefetch.js';

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

test('sniffDriveFile returns file metadata from Content-Disposition', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://drive.google.com/uc?export=download&id=file-1');
    assert.equal(init.credentials, 'include');
    return responseWithUrl('body not read', {
      url,
      status: 200,
      headers: {
        'content-type': 'text/markdown',
        'content-disposition': 'attachment; filename="note.md"',
      },
    });
  });

  assert.deepEqual(await sniffDriveFile('file-1'), {
    ok: true,
    fileName: 'note.md',
    contentType: 'text/markdown',
    status: 200,
    finalUrl: 'https://drive.google.com/uc?export=download&id=file-1',
    confirmUrl: null,
    error: null,
  });
});

test('sniffDriveFile follows the virus-scan confirm form once', async (t) => {
  const warning = '<html><head><title>Google ドライブ - ウイルス スキャンに関する警告</title></head><body>' +
    '<form id="download-form" action="https://drive.usercontent.google.com/download" method="get">' +
    '<input type="hidden" name="id" value="file-5"><input type="hidden" name="export" value="download">' +
    '<input type="hidden" name="confirm" value="t"><input type="hidden" name="uuid" value="u-1"></form></body></html>';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    if (calls.length === 1) {
      return responseWithUrl(warning, {
        url: 'https://drive.usercontent.google.com/download?id=file-5&export=download',
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    return responseWithUrl('body not read', {
      url,
      status: 200,
      headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="data.xml"' },
    });
  });

  const result = await sniffDriveFile('file-5');
  assert.equal(calls.length, 2);
  assert.match(calls[1], /^https:\/\/drive\.usercontent\.google\.com\/download\?id=file-5&export=download&confirm=t&uuid=u-1$/);
  assert.equal(result.ok, true);
  assert.equal(result.fileName, 'data.xml');
  assert.equal(result.retryOf, 'https://drive.google.com/uc?export=download&id=file-5');
});

test('sniffDriveFile fails when Content-Disposition has no filename', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) =>
    responseWithUrl('', {
      url,
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })
  );

  const result = await sniffDriveFile('file-2');
  assert.equal(result.ok, false);
  assert.equal(result.fileName, '');
  assert.equal(result.error, 'no-filename');
});

test('sniffDriveFile treats Google Drive HTML as a failed sniff', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) =>
    responseWithUrl('<title>Google Drive</title>', {
      url,
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  );

  const result = await sniffDriveFile('file-3');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'google-drive-html');
});

test('sniffDriveFile reports HTTP failures', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) =>
    responseWithUrl('forbidden', {
      url,
      status: 403,
      headers: { 'content-type': 'text/plain' },
    })
  );

  const result = await sniffDriveFile('file-4');
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.error, 'http-403');
});

function responseWithUrl(body, { url, status, headers }) {
  const response = new Response(body, { status, headers });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}
