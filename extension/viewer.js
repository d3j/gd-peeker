import { fetchDriveFile } from './lib/drivefetch.js';
import { detectFileType, VIEW_KINDS } from './lib/filetype.js';
import { decode, displayEncodingName } from './lib/encoding.js';
import { loadSettings, onSettingsChanged } from './lib/settings.js';
import { setLang, t } from './lib/messages.js';

const LARGE_FILE_BYTES = 5 * 1024 * 1024;
const params = new URLSearchParams(location.search);
const fileId = params.get('id');
const nameHint = params.get('name') || '';
const driveTabId = params.get('driveTabId');
const els = {
  fileName: document.querySelector('#file-name'),
  kind: document.querySelector('#kind'),
  encoding: document.querySelector('#encoding'),
  reload: document.querySelector('#reload'),
  drive: document.querySelector('#drive'),
  copy: document.querySelector('#copy'),
  source: document.querySelector('#source'),
  options: document.querySelector('#options'),
  status: document.querySelector('#status'),
  diagnostics: document.querySelector('#diagnostics'),
  sandbox: document.querySelector('#sandbox'),
  notice: document.querySelector('#notice'),
  noticeClose: document.querySelector('#notice-close'),
  largeConfirm: document.querySelector('#large-confirm'),
  largeOpen: document.querySelector('#large-open'),
  largeSource: document.querySelector('#large-source'),
};

let settings = await loadSettings();
let current = {
  bytes: null,
  text: '',
  kind: 'txt',
  fileName: nameHint || fileId || 'file',
  contentType: '',
  detected: { ext: '', language: null },
  decoding: null,
};
let sourceMode = false;
let largeFileChoice = null;
setLang(settings.uiLang);
initControls();
applyI18n();
await render();

els.reload.addEventListener('click', () => render());
els.drive.addEventListener('click', () => chrome.tabs.create({ url: driveViewUrl() }));
els.copy.addEventListener('click', copySource);
els.source.addEventListener('click', () => {
  sourceMode = !sourceMode;
  updateSourceControls();
  renderSandbox(activeRenderKind());
});
els.options.addEventListener('click', () => chrome.runtime.openOptionsPage());
els.kind.addEventListener('change', async () => {
  sourceMode = false;
  current.kind = els.kind.value;
  await chrome.storage.session.set({ [`viewKind:${fileId}`]: current.kind });
  updateSourceControls();
  await maybeShowHtmlNotice(current.kind);
  renderSandbox(activeRenderKind());
});
els.encoding.addEventListener('change', async () => {
  await chrome.storage.session.set({ [`encoding:${fileId}`]: els.encoding.value });
  await decodeAndRender();
});
els.noticeClose.addEventListener('click', async () => {
  els.notice.hidden = true;
  await chrome.storage.local.set({ htmlNoticeDismissed: true });
});
els.largeOpen.addEventListener('click', async () => {
  largeFileChoice = 'open';
  els.largeConfirm.hidden = true;
  sourceMode = false;
  await decodeAndRender();
});
els.largeSource.addEventListener('click', async () => {
  largeFileChoice = 'source';
  els.largeConfirm.hidden = true;
  sourceMode = true;
  await decodeAndRender();
});
els.sandbox.addEventListener('load', () => {
  if (current.text && els.largeConfirm.hidden) renderSandbox(activeRenderKind());
});

onSettingsChanged((next) => {
  settings = next;
  setLang(settings.uiLang);
  applyI18n();
  updateEncodingControl(els.encoding.value || settings.encoding.default || 'auto', current.decoding);
  renderSandbox(activeRenderKind());
});

window.addEventListener('message', (event) => {
  if (event.source !== els.sandbox.contentWindow) return;
  const message = event.data;
  if (message?.type === 'rendered') {
    if (message.title) document.title = `${message.title} — GD-Peeker`;
  }
});

function initControls() {
  for (const kind of VIEW_KINDS) els.kind.append(new Option(t(kind), kind));
  const encodings = [
    ['auto', t('encodingAuto')],
    ['utf-8', 'UTF-8'],
    ['shift_jis', 'Shift_JIS'],
    ['euc-jp', 'EUC-JP'],
    ['utf-16le', 'UTF-16LE'],
    ['utf-16be', 'UTF-16BE'],
    ['iso-8859-1', 'ISO-8859-1'],
  ];
  for (const [value, label] of encodings) els.encoding.append(new Option(label, value));
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  for (const option of els.kind.options) option.textContent = t(option.value);
  updateEncodingControl(els.encoding.value || settings.encoding.default || 'auto', current.decoding);
  updateSourceControls();
  document.documentElement.lang = settings.uiLang;
}

async function render() {
  if (!fileId) {
    showError([{ strategy: 'input', error: 'missing-id' }]);
    return;
  }
  els.status.textContent = '';
  els.diagnostics.hidden = true;
  els.largeConfirm.hidden = true;
  try {
    const result = await fetchDriveFile(fileId, { nameHint, driveTabId });
    const overrideData = await chrome.storage.session.get([`viewKind:${fileId}`, `encoding:${fileId}`]);
    const detected = detectFileType({ name: result.fileName, mime: result.contentType });
    current = {
      bytes: result.bytes,
      text: '',
      kind: overrideData[`viewKind:${fileId}`] || detected.kind || 'txt',
      fileName: result.fileName,
      contentType: result.contentType,
      attempts: result.attempts,
      detected,
      decoding: null,
    };
    sourceMode = false;
    largeFileChoice = result.bytes.byteLength > LARGE_FILE_BYTES ? null : 'open';
    els.fileName.textContent = current.fileName;
    els.kind.value = current.kind;
    document.title = `${current.fileName} — GD-Peeker`;
    updateSourceControls();
    if (!largeFileChoice) {
      els.notice.hidden = true;
      els.largeConfirm.hidden = false;
      return;
    }
    await decodeAndRender(overrideData);
  } catch (err) {
    showError(err.attempts || [{ strategy: 'fetch', error: err.message }]);
  }
}

async function decodeAndRender(sessionData = null) {
  if (!current.bytes) return;
  const overrideData = sessionData || (await chrome.storage.session.get([`encoding:${fileId}`]));
  const selectedEncoding = overrideData[`encoding:${fileId}`] || settings.encoding.default || 'auto';
  current.decoding = decode(current.bytes, selectedEncoding);
  current.text = current.decoding.text;
  updateEncodingControl(selectedEncoding, current.decoding);
  await maybeShowHtmlNotice(current.kind);
  updateSourceControls();
  renderSandbox(activeRenderKind());
}

function renderSandbox(kind) {
  if (!current.text && !current.bytes) return;
  if (!els.largeConfirm.hidden) return;
  els.sandbox.contentWindow.postMessage(
    {
      type: 'render',
      kind,
      originalKind: current.kind,
      text: current.text,
      html: current.text,
      options: {
        html: settings.html,
        md: settings.md,
        txt: settings.txt,
        code: { language: current.detected?.language, ext: current.detected?.ext },
        xml: { parseErrorLabel: t('xmlParseError'), expandAll: t('expandAll'), collapseAll: t('collapseAll') },
      },
    },
    '*'
  );
}

function updateEncodingControl(selectedEncoding, result) {
  const autoOption = [...els.encoding.options].find((option) => option.value === 'auto');
  if (autoOption) autoOption.textContent = result ? `${displayEncodingName(result.encoding)} (auto)` : t('encodingAuto');
  const values = new Set([...els.encoding.options].map((option) => option.value));
  els.encoding.value = values.has(selectedEncoding) ? selectedEncoding : result?.encoding || 'auto';
}

function showError(attempts) {
  els.largeConfirm.hidden = true;
  els.status.textContent = t('errorFetch');
  els.diagnostics.hidden = false;
  const rows = attempts
    .map(
      (a) =>
        `<tr><td>${escapeHtml(a.strategy ?? '')}</td><td>${escapeHtml(a.status ?? '')}</td><td>${escapeHtml(
          a.error ?? ''
        )}</td><td>${escapeHtml(a.contentType ?? '')}</td><td>${escapeHtml(a.finalUrl ?? a.url ?? '')}</td></tr>`
    )
    .join('');
  els.diagnostics.innerHTML = `<h2>${escapeHtml(t('diagnosis'))}</h2><table><thead><tr><th>${escapeHtml(
    t('diagnosticsStrategy')
  )}</th><th>${escapeHtml(t('diagnosticsStatus'))}</th><th>${escapeHtml(t('diagnosticsError'))}</th><th>${escapeHtml(
    t('diagnosticsContentType')
  )}</th><th>${escapeHtml(t('diagnosticsFinalUrl'))}</th></tr></thead><tbody>${rows}</tbody></table><p><button id="diag-drive" type="button">${escapeHtml(
    t('driveOpen')
  )}</button> <button id="diag-retry" type="button">${escapeHtml(t('retry'))}</button></p>`;
  document.querySelector('#diag-drive')?.addEventListener('click', () => chrome.tabs.create({ url: driveViewUrl() }));
  document.querySelector('#diag-retry')?.addEventListener('click', () => render());
}

async function maybeShowHtmlNotice(kind) {
  if (kind !== 'html') {
    els.notice.hidden = true;
    return;
  }
  const data = await chrome.storage.local.get('htmlNoticeDismissed');
  els.notice.hidden = Boolean(data.htmlNoticeDismissed);
}

function activeRenderKind() {
  return sourceMode ? 'code' : current.kind;
}

function updateSourceControls() {
  if (!els.source || !els.kind) return;
  els.source.textContent = sourceMode ? t('showRendered') : t('source');
  els.source.setAttribute('aria-pressed', sourceMode ? 'true' : 'false');
  els.kind.value = sourceMode ? 'code' : current.kind;
}

async function copySource() {
  await navigator.clipboard.writeText(current.text);
  window.clearTimeout(copySource.timeout);
  els.copy.textContent = t('copied');
  copySource.timeout = window.setTimeout(() => {
    els.copy.textContent = t('copySource');
  }, 1200);
}

function driveViewUrl() {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
