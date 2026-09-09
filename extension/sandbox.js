const user = document.querySelector('#user');

window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return; // the user iframe (null origin) must not re-render itself with looser options
  const message = event.data;
  if (message?.type !== 'render') return;
  try {
    if (message.kind === 'html') {
      renderHtml(message.html ?? '', message.options?.html ?? {});
    } else {
      renderPre(message.text ?? '', message.originalKind, message.options?.unsupportedLabel ?? '');
    }
  } catch (err) {
    parent.postMessage({ type: 'error', message: err?.message ?? String(err) }, '*');
  }
});

function renderHtml(html, options) {
  user.setAttribute(
    'sandbox',
    options.allowScripts === false
      ? 'allow-forms allow-popups allow-modals'
      : 'allow-scripts allow-forms allow-popups allow-modals'
  );
  user.srcdoc = injectHeadControls(html, options);
  parent.postMessage({ type: 'rendered', title: extractTitle(html) }, '*');
}

function renderPre(text, originalKind, unsupportedLabel) {
  user.setAttribute('sandbox', '');
  const label = unsupportedLabel ? `<p class="notice">${escapeHtml(unsupportedLabel)}</p>` : '';
  user.srcdoc = `<!doctype html><meta charset="utf-8"><base target="_blank"><style>
body{margin:0;padding:16px;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#202124;background:#fff}
.notice{margin:0 0 12px;padding:10px;border:1px solid #dfe3ea;background:#f8fafd;font:13px/1.4 system-ui,sans-serif}
pre{margin:0;white-space:pre-wrap;word-break:break-word;content-visibility:auto}
</style>${label}<pre data-kind="${escapeHtml(originalKind ?? '')}">${escapeHtml(text)}</pre>`;
  parent.postMessage({ type: 'rendered' }, '*');
}

function injectHeadControls(html, options) {
  const controls = `${options.allowExternal === false ? externalBlockCsp() : ''}<base target="_blank">`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b([^>]*)>/i, `<head$1>${controls}`);
  return `<!doctype html><head>${controls}</head>${html}`;
}

function externalBlockCsp() {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:">`;
}

function extractTitle(html) {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return '';
  const textarea = document.createElement('textarea');
  textarea.innerHTML = match[1];
  return textarea.value.trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
