# CLAUDE.md

GD-Peeker — Google Drive 上の html/md/txt/xml を別タブでレンダリングする Chrome 拡張(MV3、ビルド無しの素の JS。`extension/` が拡張本体)。
**設計判断の正は [README.md](README.md) の「設計判断」節**、実装仕様は [docs/SPEC.md](docs/SPEC.md)、タスクは [docs/tasks.md](docs/tasks.md)。

## 変更時に守ること

- **OAuth・Drive API を導入しない。** 本文取得は `host_permissions` + Cookie 同送 fetch(`extension/lib/drivefetch.js` の 3 段ストラテジー)だけ。`identity` 権限・`googleapis.com` を manifest に足さない(restricted scope の審査が発生し、プライバシー説明「データ送信ゼロ」が崩れる)
- **`<all_urls>` を取らない。** `host_permissions` は `https://drive.google.com/*`、`https://drive.usercontent.google.com/*`、`https://*.googleusercontent.com/*` のみ
- **Drive の DOM に触らない。** content script は `location.href` の監視とメッセージ送受信だけ。行 DOM・メニュー DOM のセレクタを書いた時点で設計違反
- **CDN 参照禁止。** サードパーティは `scripts/vendor.mjs` で `extension/vendor/` に生成してコミット。`extension/` 配下に `https://` のスクリプト/スタイル参照を書かない(MV3 リモートコード禁止で審査に落ちる)
- **HTML はサニタイズしない。隔離する。** ユーザー HTML は sandbox ページ内の `srcdoc` iframe(`allow-scripts`、**`allow-same-origin` を絶対に付けない**)で描画する。viewer(拡張ページ)の DOM に直接入れない。「外部リソース禁止」設定は srcdoc の `<head>` 先頭に `<meta http-equiv="Content-Security-Policy">` を差し込んで**締める方向にだけ**効かせる
- **Markdown はサニタイズする。** markdown-it の出力は必ず DOMPurify を通してから描画。mermaid は DOMPurify 後の `<pre class="mermaid">` を sandbox 内で描画する
- **文字コード判定は `lib/encoding.js` に閉じる。** BOM → UTF-8(`fatal:true`)→ Shift_JIS / EUC-JP スコアリング。判定結果と根拠を viewer のツールバーに出し、手動上書きできるようにする
- **UI 文字列は `extension/lib/messages.js` の `t(key, params)` 経由**(直書き禁止)。既定言語は en、`chrome.storage.local` の `uiLang` で ja に切替(`chrome.i18n` は実行時切替不可のため不使用)
- **本体にテスト用分岐を入れない。** E2E は Playwright の route / fixture で外から差し替える
- 設定のキーとデフォルト値は `extension/lib/settings.js` の一箇所で定義する(viewer・options・background で複製しない)
- 自動起動は **同一タブ・同一 fileId で二重起動しない**(content script が最後に開いた id を保持)。Drive のプレビューを閉じて別ファイルを開いたときだけ再発火する

## テストの実行方法

```sh
node --test tests/unit/            # lib/* の単体テスト(encoding / filetype / xmlformat / md pipeline)
cd <任意の作業ディレクトリ> && npm i playwright-core
node ~/Code/gd-peeker/tests/e2e-viewer-html.mjs   # viewer: html を sandbox で描画・スクリプト実行・隔離
node ~/Code/gd-peeker/tests/e2e-viewer-md.mjs     # viewer: md 描画・DOMPurify・mermaid・hljs
node ~/Code/gd-peeker/tests/e2e-viewer-text.mjs   # viewer: txt(Shift_JIS 自動判定)/ xml 整形・折りたたみ
node ~/Code/gd-peeker/tests/e2e-settings.mjs      # options: 設定永続化・言語切替
```

- Chrome for Testing を ms-playwright キャッシュから自動検出(`CHROME_FOR_TESTING` で明示可)
- **ブランド版 Chrome 137+ は `--load-extension` 不可**の罠あり。実機確認は `chrome://extensions` のデベロッパーモードで `extension/` を読み込む(手順は [docs/usage.md](docs/usage.md))
- Drive 本体には E2E からアクセスしない。`drivefetch.js` の実機確認は開発者自身の Chrome で行う(手順と確認項目は [docs/usage.md](docs/usage.md) の「実機確認」)
