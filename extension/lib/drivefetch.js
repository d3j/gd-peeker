const MAX_RELAY_BYTES = 20 * 1024 * 1024;

export class DriveFetchError extends Error {
  constructor(message, attempts) {
    super(message);
    this.name = 'DriveFetchError';
    this.attempts = attempts;
  }
}

export function parseContentDisposition(value) {
  if (!value) return null;
  const parts = splitHeaderParameters(value);
  let fallback = null;
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const raw = part.slice(eq + 1).trim();
    if (key === 'filename*') {
      const decoded = decodeRfc5987(raw);
      if (decoded) return decoded;
    }
    if (key === 'filename') fallback = unquoteHeaderValue(raw);
  }
  return fallback;
}

function splitHeaderParameters(value) {
  const parts = [];
  let current = '';
  let quoted = false;
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    if (ch === ';' && !quoted) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current.trim());
  return parts;
}

function unquoteHeaderValue(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"')) return trimmed;
  return trimmed
    .slice(1, trimmed.endsWith('"') ? -1 : undefined)
    .replace(/\\(.)/g, '$1');
}

function decodeRfc5987(value) {
  const unquoted = unquoteHeaderValue(value);
  const match = /^([^']*)'[^']*'(.*)$/.exec(unquoted);
  if (!match) return safeDecodeURIComponent(unquoted);
  const charset = match[1].toLowerCase();
  if (charset && charset !== 'utf-8') return safeDecodeURIComponent(match[2]);
  return safeDecodeURIComponent(match[2]);
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isGoogleDriveHtmlPage({ url = '', contentType = '', text = '' } = {}) {
  const lowerType = contentType.toLowerCase();
  return (
    (lowerType.includes('text/html') && /<title>\s*Google Drive\s*<\/title>/i.test(text)) ||
    String(url).includes('accounts.google.com')
  );
}

export function findConfirmUrl(html, baseUrl) {
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
  const url = new URL(formAction, baseUrl);
  for (const { name, value } of params) url.searchParams.set(name, value);
  return url.toString();
}

export async function fetchDriveFile(fileId, { nameHint = '', driveTabId = null } = {}) {
  const attempts = [];
  const urls = [
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&authuser=0`,
  ];
  for (const url of urls) {
    const result = await tryFetchUrl(url, attempts);
    if (result.ok) return buildResult(result, fileId, nameHint, attempts);
  }
  const relay = await tryRelayFetch(fileId, driveTabId, attempts);
  if (relay.ok) return buildResult(relay, fileId, nameHint, attempts);
  throw new DriveFetchError('drive-fetch-failed', attempts);
}

async function tryFetchUrl(url, attempts) {
  const first = await requestUrl(url, attempts);
  if (first.ok || !first.confirmUrl) return first;
  return requestUrl(first.confirmUrl, attempts, { retryOf: url });
}

async function requestUrl(url, attempts, { retryOf = null } = {}) {
  const started = performance.now();
  try {
    const response = await fetch(url, { credentials: 'include', redirect: 'follow' });
    const contentType = response.headers.get('content-type') ?? '';
    const disposition = response.headers.get('content-disposition') ?? '';
    const bytes = new Uint8Array(await response.arrayBuffer());
    const textProbe = contentType.toLowerCase().includes('text/html')
      ? new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 256 * 1024))
      : '';
    const confirmUrl = response.ok ? findConfirmUrl(textProbe, response.url) : null;
    const googlePage = isGoogleDriveHtmlPage({ url: response.url, contentType, text: textProbe });
    const attempt = {
      strategy: retryOf ? 'direct-confirm' : 'direct',
      url,
      retryOf,
      status: response.status,
      finalUrl: response.url,
      contentType,
      elapsedMs: Math.round(performance.now() - started),
      ok: response.ok && !googlePage && !confirmUrl,
      error: response.ok ? null : `http-${response.status}`,
    };
    if (googlePage) attempt.error = 'google-drive-html';
    if (confirmUrl) attempt.error = 'confirm-page';
    attempts.push(attempt);
    return { ok: attempt.ok, bytes, contentType, disposition, finalUrl: response.url, confirmUrl };
  } catch (err) {
    attempts.push({
      strategy: retryOf ? 'direct-confirm' : 'direct',
      url,
      retryOf,
      status: null,
      finalUrl: null,
      contentType: '',
      elapsedMs: Math.round(performance.now() - started),
      ok: false,
      error: err?.message ?? String(err),
    });
    return { ok: false };
  }
}

async function tryRelayFetch(fileId, driveTabId, attempts) {
  const started = performance.now();
  try {
    const response = await chrome.runtime.sendMessage({ type: 'drive:relayFetch', fileId, driveTabId });
    attempts.push({
      strategy: 'content-script',
      url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
      status: response?.status ?? null,
      finalUrl: response?.finalUrl ?? null,
      contentType: response?.contentType ?? '',
      elapsedMs: Math.round(performance.now() - started),
      ok: Boolean(response?.ok),
      error: response?.error ?? null,
    });
    if (!response?.ok) return { ok: false };
    const bytes = base64ToBytes(response.base64);
    return {
      ok: true,
      bytes,
      contentType: response.contentType ?? '',
      disposition: response.contentDisposition ?? '',
      finalUrl: response.finalUrl ?? '',
    };
  } catch (err) {
    attempts.push({
      strategy: 'content-script',
      url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
      status: null,
      finalUrl: null,
      contentType: '',
      elapsedMs: Math.round(performance.now() - started),
      ok: false,
      error: err?.message ?? String(err),
    });
    return { ok: false };
  }
}

function buildResult(result, fileId, nameHint, attempts) {
  return {
    bytes: result.bytes,
    contentType: result.contentType,
    finalUrl: result.finalUrl,
    fileName: parseContentDisposition(result.disposition) || nameHint || fileId,
    attempts,
  };
}

export async function fetchFromContentScript(fileId) {
  const url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  const response = await fetch(url, { credentials: 'include', redirect: 'follow' });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RELAY_BYTES) return { ok: false, error: 'too-large', status: response.status };
  const contentType = response.headers.get('content-type') ?? '';
  const disposition = response.headers.get('content-disposition') ?? '';
  const textProbe = contentType.toLowerCase().includes('text/html')
    ? new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 256 * 1024))
    : '';
  if (!response.ok || isGoogleDriveHtmlPage({ url: response.url, contentType, text: textProbe })) {
    return { ok: false, error: response.ok ? 'google-drive-html' : `http-${response.status}`, status: response.status };
  }
  return {
    ok: true,
    status: response.status,
    finalUrl: response.url,
    contentType,
    contentDisposition: disposition,
    base64: bytesToBase64(bytes),
  };
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
