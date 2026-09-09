const user = document.querySelector('#user');
const app = document.querySelector('#app');
const mdTheme = document.querySelector('#md-theme');
const hljsTheme = document.querySelector('#hljs-theme');

window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return; // the user iframe (null origin) must not re-render itself with looser options
  const message = event.data;
  if (message?.type !== 'render') return;
  try {
    if (message.kind === 'html') {
      renderHtml(message.html ?? '', message.options?.html ?? {});
    } else if (message.kind === 'md') {
      renderMarkdown(message.text ?? '', message.options?.md ?? {});
    } else if (message.kind === 'xml') {
      renderXml(message.text ?? '', message.options?.xml ?? {});
    } else if (message.kind === 'txt') {
      renderText(message.text ?? '', message.options?.txt ?? {});
    } else if (message.kind === 'code') {
      renderCode(message.text ?? '', message.options?.code ?? {});
    }
  } catch (err) {
    parent.postMessage({ type: 'error', message: err?.message ?? String(err) }, '*');
  }
});

function renderHtml(html, options) {
  app.hidden = true;
  app.replaceChildren();
  user.hidden = false;
  user.setAttribute(
    'sandbox',
    options.allowScripts === false
      ? 'allow-forms allow-popups allow-modals'
      : 'allow-scripts allow-forms allow-popups allow-modals'
  );
  user.srcdoc = injectHeadControls(html, options);
  parent.postMessage({ type: 'rendered', title: extractTitle(html) }, '*');
}

function showApp(className = '') {
  user.setAttribute('sandbox', '');
  user.srcdoc = '';
  user.hidden = true;
  app.hidden = false;
  app.className = className;
  app.replaceChildren();
}

function renderMarkdown(text, options) {
  const mdOptions = GDPSandbox.normalizeMdOptions(options);
  showApp(`md-view theme-${mdOptions.theme}`);
  document.body.className = `scheme-${mdOptions.colorScheme}`;
  mdTheme.href = `vendor/md-theme-${mdOptions.theme}.css`;
  hljsTheme.href = `vendor/hljs-theme-${mdOptions.colorScheme === 'dark' ? 'dark' : 'light'}.css`;
  const renderer = GDPSandbox.createMarkdownRenderer(globalThis.GDP, mdOptions);
  const result = renderer.render(text);
  const root = document.createElement('article');
  root.className = 'md-root';
  root.innerHTML = result.html;
  app.append(root);
  if (mdOptions.toc) app.append(renderToc(result.toc));
  if (mdOptions.plugins.mermaid) renderMermaid(root);
  parent.postMessage({ type: 'rendered' }, '*');
}

function renderToc(items) {
  const nav = document.createElement('nav');
  nav.className = 'md-toc';
  for (const item of items) {
    const a = document.createElement('a');
    a.href = `#${item.id}`;
    a.textContent = item.text;
    a.style.paddingInlineStart = `${Math.max(0, item.level - 1) * 10}px`;
    nav.append(a);
  }
  return nav;
}

let mermaidLoading = null;
function loadMermaid() {
  // vendor/mermaid.js is ~8MB; it is not referenced from sandbox.html and is fetched only when a document contains a mermaid block
  if (globalThis.mermaid) return Promise.resolve(globalThis.mermaid);
  if (!mermaidLoading) {
    mermaidLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/mermaid.js';
      script.onload = () => resolve(globalThis.mermaid);
      script.onerror = () => reject(new Error('mermaid failed to load'));
      document.head.append(script);
    });
  }
  return mermaidLoading;
}

async function renderMermaid(root) {
  const blocks = [...root.querySelectorAll('pre.mermaid')];
  if (!blocks.length) return;
  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch {
    return; // sources stay visible as <pre class="mermaid">
  }
  if (!mermaid) return;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: isDark() ? 'dark' : 'default' });
  for (let i = 0; i < blocks.length; i++) {
    const pre = blocks[i];
    const source = pre.textContent || '';
    try {
      const result = await mermaid.render(`gd-peeker-mermaid-${Date.now()}-${i}`, source);
      const container = document.createElement('div');
      container.className = 'mermaid-rendered';
      container.innerHTML = result.svg;
      pre.replaceWith(container);
    } catch {
      pre.textContent = source;
    }
  }
}

function renderText(text, options) {
  showApp('text-view');
  const pre = document.createElement('pre');
  pre.className = 'text-pre';
  pre.style.fontSize = `${clamp(Number(options.fontSize) || 14, 10, 24)}px`;
  pre.classList.toggle('wrap', options.wrap !== false);
  if (options.lineNumbers) pre.innerHTML = addLineNumbers(text);
  else pre.textContent = text;
  app.append(pre);
  parent.postMessage({ type: 'rendered' }, '*');
}

function renderCode(text, options = {}) {
  showApp('code-view');
  const language = options.ext === 'json' ? 'json' : options.language || options.ext || '';
  const source = options.ext === 'json' || language === 'json' ? GDPSandbox.jsonPretty(text) : text;
  const pre = document.createElement('pre');
  pre.className = 'code-pre hljs';
  const code = document.createElement('code');
  code.className = language ? `language-${language}` : '';
  if (globalThis.GDP?.hljs) {
    code.innerHTML = highlight(source, language);
  } else {
    code.textContent = source;
  }
  pre.append(code);
  app.append(pre);
  parent.postMessage({ type: 'rendered' }, '*');
}

function renderXml(text, options = {}) {
  showApp('xml-view');
  const result = GDPSandbox.formatXml(text);
  if (!result.ok) {
    const warning = document.createElement('p');
    warning.className = 'notice';
    warning.textContent = `${options.parseErrorLabel || 'Could not format XML'}: ${result.error}`;
    const pre = document.createElement('pre');
    pre.className = 'code-pre hljs';
    const code = document.createElement('code');
    code.className = 'language-xml';
    code.innerHTML = globalThis.GDP?.hljs ? highlight(text, 'xml') : escapeHtml(text);
    pre.append(code);
    app.append(warning);
    app.append(pre);
    parent.postMessage({ type: 'rendered' }, '*');
    return;
  }
  const controls = document.createElement('div');
  controls.className = 'xml-controls';
  const expand = document.createElement('button');
  expand.type = 'button';
  expand.textContent = options.expandAll || 'Expand all';
  const collapse = document.createElement('button');
  collapse.type = 'button';
  collapse.textContent = options.collapseAll || 'Collapse all';
  controls.append(expand, collapse);
  const tree = document.createElement('div');
  tree.className = 'xml-tree hljs';
  tree.innerHTML = result.html || '';
  app.append(controls, tree);
  colorXml(tree);
  initXmlFolding(tree);
  expand.addEventListener('click', () => setAllCollapsed(tree, false));
  collapse.addEventListener('click', () => setAllCollapsed(tree, true));
  parent.postMessage({ type: 'rendered' }, '*');
}

function highlight(source, language) {
  const hljs = globalThis.GDP?.hljs;
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(source, { language, ignoreIllegals: true }).value;
  }
  return hljs.highlightAuto(source).value;
}

function colorXml(root) {
  const hljs = globalThis.GDP?.hljs;
  if (!hljs?.getLanguage?.('xml')) return;
  root.querySelectorAll('code').forEach((code) => {
    code.innerHTML = hljs.highlight(code.textContent, { language: 'xml', ignoreIllegals: true }).value;
  });
}

function initXmlFolding(tree) {
  tree.querySelectorAll('.xml-line').forEach((line) => {
    const toggle = line.querySelector('.xml-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', () => setCollapsed(tree, line, !line.classList.contains('collapsed')));
    if (line.dataset.collapsed === 'true') setCollapsed(tree, line, true);
  });
}

function setAllCollapsed(tree, collapsed) {
  tree.querySelectorAll('.xml-line .xml-toggle').forEach((toggle) => setCollapsed(tree, toggle.closest('.xml-line'), collapsed));
}

function setCollapsed(tree, line, collapsed) {
  line.classList.toggle('collapsed', collapsed);
  line.querySelector('.xml-toggle').textContent = collapsed ? '+' : '-';
  const lines = [...tree.querySelectorAll('.xml-line')];
  const start = lines.indexOf(line);
  const base = Number(line.dataset.indent || 0);
  for (let i = start + 1; i < lines.length; i++) {
    const indent = Number(lines[i].dataset.indent || 0);
    if (indent <= base) break;
    lines[i].hidden = collapsed;
  }
}

function addLineNumbers(text) {
  return String(text)
    .split('\n')
    .map((line, index) => `<span class="line"><span class="ln">${index + 1}</span><span class="lt">${escapeHtml(line)}</span></span>`)
    .join('\n');
}

function isDark() {
  return document.body.classList.contains('scheme-dark') ||
    (document.body.classList.contains('scheme-auto') && matchMedia('(prefers-color-scheme: dark)').matches);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
