const EXTENSION_TYPES = new Map([
  ['html', 'html'],
  ['htm', 'html'],
  ['xhtml', 'html'],
  ['md', 'md'],
  ['markdown', 'md'],
  ['mdown', 'md'],
  ['mkd', 'md'],
  ['xml', 'xml'],
  ['xsl', 'xml'],
  ['xslt', 'xml'],
  ['xsd', 'xml'],
  ['plist', 'xml'],
  ['rss', 'xml'],
  ['atom', 'xml'],
  ['opml', 'xml'],
  ['txt', 'txt'],
  ['text', 'txt'],
  ['log', 'txt'],
]);

const CODE_EXTENSIONS = new Set([
  'json',
  'yaml',
  'yml',
  'csv',
  'tsv',
  'js',
  'mjs',
  'ts',
  'py',
  'rb',
  'sh',
  'bash',
  'zsh',
  'css',
  'sql',
  'ini',
  'toml',
  'conf',
  'cfg',
  'java',
  'kt',
  'go',
  'rs',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'php',
  'swift',
]);

const CODE_LANGUAGES = new Map([
  ['mjs', 'javascript'],
  ['js', 'javascript'],
  ['ts', 'typescript'],
  ['yml', 'yaml'],
  ['sh', 'bash'],
  ['zsh', 'bash'],
  ['h', 'c'],
  ['hpp', 'cpp'],
]);

export const VIEW_KINDS = ['html', 'md', 'txt', 'xml', 'code'];

export function extensionFromName(name = '') {
  const cleanName = String(name).split(/[?#]/, 1)[0].trim().toLowerCase();
  const last = cleanName.split('/').pop() ?? cleanName;
  if (!last || !last.includes('.')) return '';
  const ext = last.slice(last.lastIndexOf('.') + 1);
  return ext === 'svg' ? '' : ext;
}

export function detectFileType({ name = '', mime = '' } = {}) {
  const ext = extensionFromName(name);
  if (!ext) return { kind: 'txt', ext, language: null };
  if (EXTENSION_TYPES.has(ext)) return { kind: EXTENSION_TYPES.get(ext), ext, language: null };
  if (CODE_EXTENSIONS.has(ext)) {
    return { kind: 'code', ext, language: CODE_LANGUAGES.get(ext) ?? ext };
  }
  const normalizedMime = String(mime).split(';', 1)[0].trim().toLowerCase();
  if (normalizedMime === 'text/html' || normalizedMime === 'application/xhtml+xml') {
    return { kind: 'html', ext, language: null };
  }
  if (normalizedMime.includes('xml')) return { kind: 'xml', ext, language: null };
  if (normalizedMime.startsWith('text/')) return { kind: 'txt', ext, language: null };
  return { kind: null, ext, language: null };
}

export function isAutoOpenKind(kind, settings) {
  return Boolean(kind && settings?.autoOpenTypes?.includes(kind));
}
