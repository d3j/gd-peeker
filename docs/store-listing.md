# Chrome Web Store Listing

## Store Description (English)

GD-Peeker opens HTML, Markdown, XML, and text files from Google Drive as readable rendered pages in a new tab.

Google Drive's built-in preview often shows HTML and Markdown as source text, and Japanese text files can appear garbled when they use Shift_JIS. GD-Peeker fetches the file through your existing Drive browser session and renders it locally in Chrome. There is no server, no OAuth sign-in, and file contents are not stored.

HTML runs in an isolated sandboxed iframe without same-origin access to the extension page. Markdown is sanitized before rendering. Text files support automatic UTF-8, Shift_JIS, EUC-JP, and BOM-based encoding detection.

## ストア説明文(日本語)

GD-Peeker は、Google Drive 上の HTML、Markdown、XML、テキストファイルを別タブで読みやすく表示する Chrome 拡張です。

Drive 標準のプレビューでは HTML や Markdown がソースのまま表示され、Shift_JIS の日本語テキストは文字化けすることがあります。GD-Peeker はブラウザ内の Drive セッションを使ってファイル本文を取得し、Chrome の中だけで描画します。サーバ、OAuth ログイン、本文の保存はありません。

HTML は拡張ページと同一オリジンにならない sandbox iframe 内で実行されます。Markdown はサニタイズしてから表示します。テキストは UTF-8、Shift_JIS、EUC-JP、BOM 付き UTF-16 などの自動判定に対応します。

## Permission Justification

- `storage`: saves user settings such as renderer options, default encoding, and UI language.
- `webRequest`: observes only two Google Drive preview request patterns so the extension can learn the ID of the file the user just opened in Drive preview. Requests are not blocked, modified, redirected, or read.
- `https://drive.google.com/*`: fetches the selected Drive file body using the user's existing browser session.
- `https://drive.usercontent.google.com/*`: follows Google Drive download redirects and large-file download flows.
- `https://*.googleusercontent.com/*`: follows Google Drive download redirects served from Google user content hosts.

## Single Purpose

GD-Peeker has one purpose: render supported Google Drive files (`.html`, `.md`, `.txt`, `.xml`, and related text/code formats) in a readable viewer tab.

## Data Use Disclosure

GD-Peeker does not collect, sell, transmit, or share user data. File contents are fetched and rendered locally in the browser and are kept in memory only. Settings are stored locally in Chrome storage.

## Screenshots

1. HTML file rendered from Drive with the safety notice visible.
2. Markdown file with headings, table, code highlighting, Mermaid, and TOC.
3. Shift_JIS text file showing readable Japanese and `Shift_JIS (auto)` in the toolbar.
4. XML file with formatted and foldable tree view.
5. Settings page showing auto-open, HTML, Markdown, text, encoding, and display sections.
