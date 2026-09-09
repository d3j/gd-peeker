export function formatXml(source, parser = globalThis.DOMParser) {
  const text = String(source || '');
  if (!parser) return formatXmlFallback(text);
  const document = new parser().parseFromString(text, 'application/xml');
  const errorNode = document.querySelector?.('parsererror');
  if (errorNode) return { ok: false, error: extractParserError(errorNode.textContent || ''), text };

  const lines = [];
  const declaration = text.match(/^\s*(<\?xml[\s\S]*?\?>)/i)?.[1];
  if (declaration) lines.push(declaration.trim());
  for (const node of document.childNodes) {
    if (node.nodeType === 7 && /^xml$/i.test(node.nodeName)) continue;
    formatNode(node, 0, lines);
  }
  const formatted = lines.join('\n');
  return { ok: true, text: formatted, html: renderTree(lines) };
}

export function jsonPretty(source) {
  try {
    return JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    return source;
  }
}

function formatNode(node, level, lines) {
  const pad = '  '.repeat(level);
  if (node.nodeType === 1) return formatElement(node, level, lines);
  if (node.nodeType === 3) {
    const text = node.nodeValue.trim();
    if (text) lines.push(`${pad}${text}`);
    return;
  }
  if (node.nodeType === 4) {
    lines.push(`${pad}<![CDATA[${node.nodeValue}]]>`);
    return;
  }
  if (node.nodeType === 7) {
    lines.push(`${pad}<?${node.nodeName}${node.nodeValue ? ` ${node.nodeValue}` : ''}?>`);
    return;
  }
  if (node.nodeType === 8) {
    lines.push(`${pad}<!--${node.nodeValue}-->`);
  }
}

function formatElement(node, level, lines) {
  const pad = '  '.repeat(level);
  const open = `<${node.nodeName}${formatAttrs(node)}>`;
  const close = `</${node.nodeName}>`;
  const children = [...node.childNodes].filter((child) => child.nodeType !== 3 || child.nodeValue.trim());
  if (!children.length) {
    lines.push(`${pad}<${node.nodeName}${formatAttrs(node)}/>`);
    return;
  }
  if (children.length === 1 && children[0].nodeType === 3) {
    lines.push(`${pad}${open}${children[0].nodeValue.trim()}${close}`);
    return;
  }
  lines.push(`${pad}${open}`);
  for (const child of children) formatNode(child, level + 1, lines);
  lines.push(`${pad}${close}`);
}

function formatAttrs(node) {
  return [...node.attributes].map((attr) => ` ${attr.name}="${escapeXmlAttr(attr.value)}"`).join('');
}

function renderTree(lines) {
  return lines
    .map((line) => {
      const indent = line.match(/^ */)?.[0].length || 0;
      const trimmed = line.trim();
      const isElementOpen = /^<[\w:.-]+(?:\s[^>]*)?>$/.test(trimmed) && !trimmed.endsWith('/>');
      const isClose = /^<\/[\w:.-]+>$/.test(trimmed);
      const childCount = isElementOpen ? countImmediateChildren(lines, line) : 0;
      const collapsed = childCount > 50 ? ' data-collapsed="true"' : '';
      return `<div class="xml-line${isClose ? ' xml-close' : ''}" data-indent="${indent}"${collapsed}><span class="xml-indent">${' '.repeat(
        indent
      )}</span>${isElementOpen ? '<button class="xml-toggle" type="button">-</button>' : '<span class="xml-spacer"></span>'}<code>${escapeHtml(
        trimmed
      )}</code></div>`;
    })
    .join('');
}

function countImmediateChildren(lines, openLine) {
  const index = lines.indexOf(openLine);
  const base = openLine.match(/^ */)?.[0].length || 0;
  let count = 0;
  for (let i = index + 1; i < lines.length; i++) {
    const indent = lines[i].match(/^ */)?.[0].length || 0;
    if (indent <= base) break;
    if (indent === base + 2 && /^<[\w:.-]+/.test(lines[i].trim())) count++;
  }
  return count;
}

function extractParserError(text) {
  return text.trim() || 'XML parse error';
}

function formatXmlFallback(text) {
  if (!looksBalanced(text)) return { ok: false, error: 'XML parse error', text };
  const lines = [];
  const tokens = text.match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]+>|[^<]+/g) || [];
  let level = 0;
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    if (/^<\//.test(trimmed)) level = Math.max(0, level - 1);
    lines.push(`${'  '.repeat(level)}${trimmed}`);
    if (/^<[^!?/][\s\S]*>$/.test(trimmed) && !trimmed.endsWith('/>') && !trimmed.includes(`</`)) level++;
  }
  return { ok: true, text: lines.join('\n'), html: renderTree(lines) };
}

function looksBalanced(text) {
  const stack = [];
  const re = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]+>/g;
  let match;
  while ((match = re.exec(text))) {
    const token = match[0];
    if (/^<!|^<\?/.test(token)) continue;
    const close = /^<\/\s*([\w:.-]+)/.exec(token);
    if (close) {
      if (stack.pop() !== close[1]) return false;
      continue;
    }
    if (token.endsWith('/>')) continue;
    const open = /^<\s*([\w:.-]+)/.exec(token);
    if (open) stack.push(open[1]);
  }
  return stack.length === 0;
}

function escapeXmlAttr(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
