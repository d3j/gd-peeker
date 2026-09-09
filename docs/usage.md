# GD-Peeker Usage

## Install

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click "Load unpacked".
4. Select this repository's `extension/` directory.

## Use

- Double-click a supported file in Google Drive. GD-Peeker opens a rendered viewer tab for `.html`, `.md`, `.txt`, and `.xml` files when auto-open is enabled.
- Click the extension icon while a Drive file preview is open to open the same file manually.
- Click the extension icon anywhere else to open settings.
- In settings, choose auto-open target formats, HTML script/external-resource behavior, Markdown options, text display options, default encoding, and UI language.

## Real-Device Verification

Use your own Google Drive account and record which fetch stage succeeded: `direct`, `direct-confirm`, or `content-script`.

1. Upload `test.html`, `test.md`, Shift_JIS encoded `test.txt`, and `test.xml` to your Drive.
2. Open the folder that contains those files in Drive's file list. Do not use "Open in new tab" for this check.
3. Double-click the `test.html` row in the list.
   Expected: a new GD-Peeker tab opens, HTML is rendered, and the first HTML safety notice appears. Record the successful fetch stage.
4. Return to the Drive folder tab, close the Drive preview with Esc if it is still open, then double-click the `test.md` row.
   Expected: Markdown headings, lists, code highlighting, Mermaid diagrams, and TOC settings render according to settings. Record the successful fetch stage.
5. Return to the Drive folder tab, close the Drive preview with Esc if needed, then double-click the Shift_JIS `test.txt` row.
   Expected: Japanese text is readable and the toolbar shows `Shift_JIS (auto)`. Record the successful fetch stage.
6. Return to the Drive folder tab, close the Drive preview with Esc if needed, then double-click the `test.xml` row.
   Expected: XML is formatted, highlighted, and foldable. Record the successful fetch stage.
7. Open a Drive preview again and click the GD-Peeker extension icon.
   Expected: the same file opens in a GD-Peeker viewer tab.
8. If fetching fails, include the diagnostics panel content or screenshot in the issue. The report should show the status for `direct`, `direct-confirm` if used, and `content-script`.

## Known Limitations

- If Google Drive has a default app for a file type (for example `.md` → StackEdit), double-clicking opens that app instead of the Drive preview, so GD-Peeker does not start. Remove the default app (right-click → Open with → change the default) or use the extension icon on a `/file/d/<id>/view` tab.
- After updating the extension files, reload it on `chrome://extensions` — Chrome keeps a cached copy of the background service worker.

- Relative references such as `./style.css` or neighboring Drive images are not resolved.
- Scripts in HTML files shared by other people can run inside the isolated sandbox. Open untrusted HTML carefully.
- Auto-open detection depends on Drive's current preview network requests. If Drive changes those request URLs, automatic opening may stop while the manual icon path still works after a preview has been observed.
