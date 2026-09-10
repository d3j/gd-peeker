export function createMarkdownRenderer(libs, options = {}) {
  const MarkdownIt = libs.MarkdownIt;
  const frontMatterBlocks = [];
  const headingItems = [];
  const mdOptions = normalizeMdOptions(options);
  const md = new MarkdownIt(mdOptions.preset === 'commonmark' ? 'commonmark' : 'commonmark', {
    html: mdOptions.preset === 'gfm',
    linkify: mdOptions.preset === 'gfm',
    typographer: false,
    breaks: false,
    highlight: (code, lang) => highlightFence(libs.hljs, code, lang),
  });

  if (mdOptions.preset === 'gfm') md.enable(['table', 'strikethrough']);
  if (mdOptions.preset === 'gfm' && mdOptions.plugins.footnote && libs.markdownItFootnote) md.use(libs.markdownItFootnote);
  if (mdOptions.preset === 'gfm' && mdOptions.plugins.taskLists && libs.markdownItTaskLists) {
    md.use(libs.markdownItTaskLists, { enabled: true, label: true, labelAfter: true });
  }
  if (mdOptions.preset === 'gfm' && mdOptions.plugins.anchor && libs.markdownItAnchor) {
    md.use(libs.markdownItAnchor, { slugify: slug });
  }
  if (mdOptions.preset === 'gfm' && mdOptions.plugins.frontMatter && libs.markdownItFrontMatter) {
    md.use(libs.markdownItFrontMatter, (fm) => frontMatterBlocks.push(fm));
  }
  md.core.ruler.push('gd_peeker_toc', (state) => {
    headingItems.length = 0;
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      if (token.type !== 'heading_open') continue;
      const inline = state.tokens[i + 1];
      if (!inline || inline.type !== 'inline') continue;
      const level = Number(token.tag.slice(1));
      const text = inline.content;
      const id = token.attrGet('id') || slug(text);
      if (!token.attrGet('id')) token.attrSet('id', id);
      headingItems.push({ level, text, id });
    }
  });

  return {
    render(markdown) {
      frontMatterBlocks.length = 0;
      headingItems.length = 0;
      const raw = md.render(String(markdown ?? ''));
      const withFrontMatter = frontMatterBlocks.length ? renderFrontMatter(frontMatterBlocks) + raw : raw;
      return {
        html: sanitize(libs.DOMPurify, withFrontMatter),
        toc: [...headingItems],
      };
    },
  };
}

export function normalizeMdOptions(options = {}) {
  return {
    preset: options.preset === 'commonmark' ? 'commonmark' : 'gfm',
    plugins: {
      footnote: options.plugins?.footnote !== false,
      taskLists: options.plugins?.taskLists !== false,
      anchor: options.plugins?.anchor !== false,
      frontMatter: options.plugins?.frontMatter !== false,
      mermaid: options.plugins?.mermaid !== false,
    },
    theme: ['github', 'plain', 'serif'].includes(options.theme) ? options.theme : 'github',
    colorScheme: ['auto', 'light', 'dark'].includes(options.colorScheme) ? options.colorScheme : 'auto',
    toc: options.toc === true,
    fullWidth: options.fullWidth !== false,
  };
}

function highlightFence(hljs, code, rawLang) {
  const lang = String(rawLang || '').trim().split(/\s+/, 1)[0].toLowerCase();
  if (lang === 'mermaid') return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
  if (lang && hljs?.getLanguage?.(lang)) {
    try {
      return `<pre class="hljs"><code class="language-${escapeAttr(lang)}">${hljs.highlight(code, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
    } catch {}
  }
  if (hljs?.highlightAuto) {
    const result = hljs.highlightAuto(code);
    return `<pre class="hljs"><code>${result.value}</code></pre>`;
  }
  return `<pre><code>${escapeHtml(code)}</code></pre>`;
}

function sanitize(DOMPurify, html) {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['pre'],
    ADD_ATTR: ['class', 'id', 'target', 'rel', 'checked', 'disabled', 'type'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed'],
  });
}

function renderFrontMatter(blocks) {
  return blocks
    .map(
      (block) =>
        `<details class="front-matter"><summary>Front matter</summary><pre><code>${escapeHtml(block.trim())}</code></pre></details>`
    )
    .join('');
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}
