export const MESSAGES = {
  ja: {
    actionOpen: 'GD-Peeker で開く',
    actionSettings: 'GD-Peeker 設定',
    appTitle: 'GD-Peeker',
    autoOpen: '自動起動',
    autoOpenTypes: '対象形式',
    charset: '文字コード',
    copySource: 'ソースをコピー',
    diagnosis: '診断',
    driveOpen: 'Drive で開く',
    encodingAuto: '自動',
    expandAll: 'すべて展開',
    errorFetch:
      'ファイルを取得できませんでした。Google Drive にログインしているか、このファイルの共有権限があるか確認してください。',
    externalResources: '外部リソース',
    fileType: '表示形式',
    html: 'HTML',
    htmlNotice:
      'このファイルのスクリプトは隔離された環境で実行されます。共有された他人のファイルを開くときは注意してください。',
    markdown: 'Markdown',
    md: 'Markdown',
    mdAnchor: '見出し ID',
    mdColorScheme: '配色',
    mdCommonmark: 'CommonMark',
    mdFootnote: '脚注',
    mdFrontMatter: 'Front matter',
    mdGfm: 'GFM',
    mdMermaid: 'Mermaid',
    mdPreset: 'プリセット',
    mdTaskLists: 'タスクリスト',
    mdTheme: 'テーマ',
    mdToc: '目次',
    optionsTitle: 'パーサの設定',
    resetDefaults: '既定に戻す',
    retry: '再試行',
    scripts: 'スクリプト',
    settings: '設定',
    settingsNote: 'このファイルを開くたびの上書き(表示形式・文字コード)はタブを閉じると消えます。',
    source: 'ソース',
    text: 'テキスト',
    txt: 'テキスト',
    unsupported: '未対応(M2/M3 で実装)',
    xmlParseError: 'XML を整形できません',
    xml: 'XML',
    code: 'コード',
    collapseAll: 'すべて折りたたみ',
    wrap: '折り返し',
    lineNumbers: '行番号',
    fontSize: 'フォントサイズ',
    uiLang: '表示言語',
    privacyPolicy: 'プライバシー',
  },
  en: {
    actionOpen: 'Open in GD-Peeker',
    actionSettings: 'GD-Peeker settings',
    appTitle: 'GD-Peeker',
    autoOpen: 'Auto-open',
    autoOpenTypes: 'Target formats',
    charset: 'Encoding',
    copySource: 'Copy source',
    diagnosis: 'Diagnostics',
    driveOpen: 'Open in Drive',
    encodingAuto: 'Auto',
    expandAll: 'Expand all',
    errorFetch:
      'Could not fetch the file. Check that you are signed in to Google Drive and have permission to access this file.',
    externalResources: 'External resources',
    fileType: 'View as',
    html: 'HTML',
    htmlNotice:
      'Scripts in this file run in an isolated environment. Be careful when opening files shared by other people.',
    markdown: 'Markdown',
    md: 'Markdown',
    mdAnchor: 'Heading IDs',
    mdColorScheme: 'Color scheme',
    mdCommonmark: 'CommonMark',
    mdFootnote: 'Footnotes',
    mdFrontMatter: 'Front matter',
    mdGfm: 'GFM',
    mdMermaid: 'Mermaid',
    mdPreset: 'Preset',
    mdTaskLists: 'Task lists',
    mdTheme: 'Theme',
    mdToc: 'Table of contents',
    optionsTitle: 'Parser settings',
    resetDefaults: 'Reset defaults',
    retry: 'Retry',
    scripts: 'Scripts',
    settings: 'Settings',
    settingsNote: 'Per-file overrides for view format and encoding are forgotten when the tab closes.',
    source: 'Source',
    text: 'Text',
    txt: 'Text',
    unsupported: 'Unsupported for now (M2/M3)',
    xmlParseError: 'Could not format XML',
    xml: 'XML',
    code: 'Code',
    collapseAll: 'Collapse all',
    wrap: 'Wrap',
    lineNumbers: 'Line numbers',
    fontSize: 'Font size',
    uiLang: 'Language',
    privacyPolicy: 'Privacy',
  },
};

export const DEFAULT_LANG = 'en';

let currentLang = DEFAULT_LANG;

export function setLang(lang) {
  currentLang = MESSAGES[lang] ? lang : DEFAULT_LANG;
}

export function getLang() {
  return currentLang;
}

export function t(key, params) {
  const template = MESSAGES[currentLang]?.[key] ?? MESSAGES[DEFAULT_LANG][key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}
