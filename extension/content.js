let lastHref = '';
let lastSentFileId = '';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'drive:fetch') {
    fetchDriveFile(message.fileId).then(sendResponse);
    return true;
  }
  return false;
});

function parseDrivePreviewUrl(url) {
  const fileMatch = /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)\/(?:view|preview)/.exec(url);
  if (fileMatch) return { fileId: fileMatch[1] };
  if (!/^https:\/\/drive\.google\.com\/(?:open|uc)\?/.test(url)) return null;
  const parsed = new URL(url);
  const fileId = parsed.searchParams.get('id');
  return fileId ? { fileId } : null;
}

function checkLocation() {
  const href = location.href;
  if (href === lastHref) return;
  lastHref = href;
  const match = parseDrivePreviewUrl(href);
  console.debug('[GD-Peeker] url', href, match ? `fileId=${match.fileId}` : 'no match');
  if (!match) {
    lastSentFileId = ''; // preview closed: the same file may be opened again later
    return;
  }
  if (match.fileId === lastSentFileId) return;
  lastSentFileId = match.fileId;
  chrome.runtime.sendMessage(
    {
      type: 'drive:preview',
      fileId: match.fileId,
    },
    (response) => console.debug('[GD-Peeker] background replied', response, chrome.runtime.lastError?.message ?? '')
  );
}

if ('navigation' in window) {
  window.navigation.addEventListener('navigate', () => queueMicrotask(checkLocation));
  window.navigation.addEventListener('currententrychange', () => queueMicrotask(checkLocation));
}

setInterval(checkLocation, 500);
checkLocation();

async function fetchDriveFile(fileId) {
  const url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  const first = await fetchDownloadUrl(url);
  if (!first.ok && first.confirmUrl) return fetchDownloadUrl(first.confirmUrl);
  return first;
}

async function fetchDownloadUrl(url) {
  try {
    const response = await fetch(url, { credentials: 'include', redirect: 'follow' });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 20 * 1024 * 1024) {
      return { ok: false, status: response.status, error: 'too-large', finalUrl: response.url };
    }
    const contentType = response.headers.get('content-type') ?? '';
    const textProbe = contentType.toLowerCase().includes('text/html')
      ? new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 256 * 1024))
      : '';
    const confirmUrl = response.ok ? findConfirmUrl(textProbe, response.url) : null;
    if (confirmUrl) {
      return {
        ok: false,
        status: response.status,
        finalUrl: response.url,
        contentType,
        error: 'confirm-page',
        confirmUrl,
      };
    }
    if (!response.ok || isGoogleDriveHtmlPage(response.url, contentType, textProbe)) {
      return {
        ok: false,
        status: response.status,
        finalUrl: response.url,
        contentType,
        error: response.ok ? 'google-drive-html' : `http-${response.status}`,
      };
    }
    return {
      ok: true,
      status: response.status,
      finalUrl: response.url,
      contentType,
      contentDisposition: response.headers.get('content-disposition') ?? '',
      base64: bytesToBase64(bytes),
    };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err), status: null };
  }
}

function findConfirmUrl(html, baseUrl) {
  if (!html || !/\bconfirm\b/i.test(html)) return null;
  const formAction = /<form\b[^>]*action=(["']?)([^"'\s>]+)\1/i.exec(html)?.[2] ?? baseUrl;
  const params = [...html.matchAll(/<input\b[^>]*>/gi)]
    .map((m) => m[0])
    .map((input) => ({
      name: /name=(["']?)([^"'\s>]+)\1/i.exec(input)?.[2],
      value: /value=(["']?)([^"'>]*)\1/i.exec(input)?.[2] ?? '',
    }))
    .filter((field) => field.name);
  const confirm = params.find((field) => field.name === 'confirm')?.value;
  if (!confirm) return null;
  const retryUrl = new URL(formAction, baseUrl);
  for (const { name, value } of params) retryUrl.searchParams.set(name, value);
  return retryUrl.toString();
}

function isGoogleDriveHtmlPage(url, contentType, text) {
  return (
    (String(contentType).toLowerCase().includes('text/html') && /<title>\s*Google Drive\s*<\/title>/i.test(text)) ||
    String(url).includes('accounts.google.com')
  );
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
