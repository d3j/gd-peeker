# GD-Peeker Usage

## Install

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click "Load unpacked".
4. Select this repository's `extension/` directory.

## Use

- Double-click a supported file in Google Drive. GD-Peeker opens a rendered viewer tab for `.html`, `.md`, `.txt`, and `.xml` files when auto-open is enabled.
- Click the extension icon while a Drive preview URL is open to open the same file manually.
- Click the extension icon anywhere else to open settings.
- In settings, choose auto-open target formats, HTML script/external-resource behavior, Markdown options, text display options, default encoding, and UI language.

## Real-Device Verification

Use your own Google Drive account and record which fetch stage succeeded: `direct`, `direct-confirm`, or `content-script`.

1. Upload `test.html`, `test.md`, Shift_JIS encoded `test.txt`, and `test.xml` to your Drive.
2. Double-click `test.html`.
   Expected: a new GD-Peeker tab opens, HTML is rendered, and the first HTML safety notice appears. Record the successful fetch stage.
3. Double-click `test.md`.
   Expected: Markdown headings, lists, code highlighting, Mermaid diagrams, and TOC settings render according to settings. Record the successful fetch stage.
4. Double-click Shift_JIS `test.txt`.
   Expected: Japanese text is readable and the toolbar shows `Shift_JIS (auto)`. Record the successful fetch stage.
5. Double-click `test.xml`.
   Expected: XML is formatted, highlighted, and foldable. Record the successful fetch stage.
6. If fetching fails, include the diagnostics panel content or screenshot in the issue. The report should show the status for `direct`, `direct-confirm` if used, and `content-script`.

## Known Limitations

- Relative references such as `./style.css` or neighboring Drive images are not resolved.
- Scripts in HTML files shared by other people can run inside the isolated sandbox. Open untrusted HTML carefully.
- The duplicate-open prevention map is kept in the service worker. If the service worker restarts, the prevention state can disappear.
