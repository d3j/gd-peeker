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
- **`lib/mdrender.js` と `lib/xmlformat.js` を変えたら `cd scripts && npm run vendor` を再実行する。** sandbox ページ(unique origin)は ES module を import できないため、この 2 つは `vendor/sandbox-runtime.js` に IIFE 化して読み込んでいる。E2E はバンドル側を見るので、再生成を忘れると古いコードをテストする
- **`vendor/mermaid.js`(約 8MB)は sandbox.html から参照しない。** mermaid ブロックがある文書を描くときだけ `sandbox.js` の `loadMermaid()` が動的に読む。html/txt/xml の表示で 8MB を読ませない
- 自動起動は **同一タブ・同一 fileId で二重起動しない**(content script が最後に開いた id を保持し、プレビュー URL から離れたら解除する。background の Map は既存 viewer タブへフォーカスするだけ)。**拡張子の無いファイル名は自動起動しない**(バイナリ誤爆防止。手動は開ける)
- **sandbox ページは `event.source === window.parent` 以外の `render` を無視する**(ユーザー iframe が自分を緩い設定で再描画させる経路を塞ぐ。E2E の項目 4 が回帰テスト)

## テストの実行方法

```sh
node --test tests/unit/            # lib/* の単体テスト(encoding / filetype / xmlformat / md pipeline)
cd <任意の作業ディレクトリ> && npm i playwright-core
node ~/Code/gd-peeker/tests/e2e-viewer-html.mjs   # 9項目(html: sandbox 描画・スクリプト実行/禁止・外部リソース CSP・null origin・title 返却・子 iframe からの render 乗っ取り拒否)
node ~/Code/gd-peeker/tests/e2e-viewer-md.mjs     # 9項目(md: GFM 表/タスク/脚注・script 除去と不実行・front matter・hljs・mermaid→svg・TOC)
node ~/Code/gd-peeker/tests/e2e-viewer-text.mjs   # 8項目(Shift_JIS 自動判定と手動上書き / xml 整形・折りたたみ・不正 xml フォールバック / json 整形)
node ~/Code/gd-peeker/tests/e2e-settings.mjs      # 14項目(options: 設定永続化・開いている viewer への反映・言語切替)
node ~/Code/gd-peeker/tests/e2e-fetch-failure.mjs # 6項目(fetch 失敗: direct 403 / direct 500 / content-script no-drive-tab の診断・文言・操作ボタン)
```

E2E 合計: 46項目(html 9 + md 9 + text 8 + settings 14 + fetch failure 6)。全 5 本 + unit 25 件が 2026-09-09 時点で Chrome for Testing でパス。

- Chrome for Testing を ms-playwright キャッシュから自動検出(`CHROME_FOR_TESTING` で明示可)
- **ブランド版 Chrome 137+ は `--load-extension` 不可**の罠あり。実機確認は `chrome://extensions` のデベロッパーモードで `extension/` を読み込む(手順は [docs/usage.md](docs/usage.md))
- Drive 本体には E2E からアクセスしない。`drivefetch.js` の実機確認は開発者自身の Chrome で行う(手順と確認項目は [docs/usage.md](docs/usage.md) の「実機確認」)
