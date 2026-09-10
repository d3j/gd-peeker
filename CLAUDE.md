# CLAUDE.md

GD-Peeker — Google Drive 上の html/md/txt/xml を別タブでレンダリングする Chrome 拡張(MV3、ビルド無しの素の JS。`extension/` が拡張本体)。
**設計判断の正は [README.md](README.md) の「設計判断」節**、実装仕様は [docs/SPEC.md](docs/SPEC.md)、タスクは [docs/tasks.md](docs/tasks.md)。

## 変更時に守ること

- **OAuth・Drive API を導入しない。** 本文取得は `host_permissions` + Cookie 同送 fetch(`extension/lib/drivefetch.js` の 3 段ストラテジー)だけ。`identity` 権限・`googleapis.com` を manifest に足さない(restricted scope の審査が発生し、プライバシー説明「データ送信ゼロ」が崩れる)
- **`webRequest` は観測のみ。** `chrome.webRequest.onBeforeRequest` の `urls` は SPEC §3.1 の 2 パターン(`…/file/*/d/*/docos/p/sync*`、`…/drivesharing/clientmodel?id=*`)だけ。`webRequestBlocking` / `declarativeNetRequest` を足さない。`clients6.google.com` を host_permissions に足さない(隣接ファイルの先読みで誤発火する上、警告が増える)
- **ファイル名を `document.title` から取らない。** background の header sniff(`sniffDriveFile`)で `Content-Disposition` から決める
- **`<all_urls>` を取らない。** `host_permissions` は `https://drive.google.com/*`、`https://drive.usercontent.google.com/*`、`https://*.googleusercontent.com/*` のみ
- **Drive の DOM に触らない。** content script は `location.href` の監視とメッセージ送受信だけ。行 DOM・メニュー DOM のセレクタを書いた時点で設計違反
- **CDN 参照禁止。** サードパーティは `scripts/vendor.mjs` で `extension/vendor/` に生成してコミット。`extension/` 配下に `https://` のスクリプト/スタイル参照を書かない(MV3 リモートコード禁止で審査に落ちる)
- **HTML はサニタイズしない。隔離する。** ユーザー HTML は sandbox ページ内の `srcdoc` iframe(`allow-scripts`、**`allow-same-origin` を絶対に付けない**)で描画する。viewer(拡張ページ)の DOM に直接入れない。「外部リソース禁止」設定は srcdoc の `<head>` 先頭に `<meta http-equiv="Content-Security-Policy">` を差し込んで**締める方向にだけ**効かせる
- **Markdown はサニタイズする。** markdown-it の出力は必ず DOMPurify を通してから描画。mermaid は DOMPurify 後の `<pre class="mermaid">` を sandbox 内で描画する
- **文字コード判定は `lib/encoding.js` に閉じる。** BOM → UTF-8(`fatal:true`)→ Shift_JIS / EUC-JP スコアリング。判定結果と根拠を viewer のツールバーに出し、手動上書きできるようにする
- **UI 文字列は `extension/lib/messages.js` の `t(key, params)` 経由**(直書き禁止)。既定言語は en、`chrome.storage.local` の `uiLang` で ja に切替(`chrome.i18n` は実行時切替不可のため不使用)
- **本体にテスト用分岐を入れない。** E2E は Playwright の route / fixture で外から差し替える
- 設定のキーとデフォルト値は `extension/lib/settings.js` の一箇所で定義する(viewer・options・background で複製しない)
- **viewer の縦レイアウトは flex column**(`viewer.css`)。`#sandbox` は `flex:1 1 auto; min-height:0` で残り全高を取る。grid に戻さない(非表示の帯が行として残り sandbox が既定高さに落ちる、M7 で修正済み)。md の幅は設定 `md.fullWidth`(既定 true)で `#app.md-full` → テーマ css の `.md-full .md-root` が効く。テーマ css は `scripts/vendor.mjs` の生成物なので `vendor/` を直接編集しない
- **`lib/mdrender.js` と `lib/xmlformat.js` を変えたら `cd scripts && npm run vendor` を再実行する。** sandbox ページ(unique origin)は ES module を import できないため、この 2 つは `vendor/sandbox-runtime.js` に IIFE 化して読み込んでいる。E2E はバンドル側を見るので、再生成を忘れると古いコードをテストする
- **`vendor/mermaid.js`(約 8MB)は sandbox.html から参照しない。** mermaid ブロックがある文書を描くときだけ `sandbox.js` の `loadMermaid()` が動的に読む。html/txt/xml の表示で 8MB を読ませない
- 自動起動は **同一タブ・同一 fileId で二重起動しない**(content script が最後に開いた id を保持し、プレビュー URL から離れたら解除する。background の Map は既存 viewer タブへフォーカスするだけ)。**拡張子の無いファイル名は自動起動しない**(バイナリ誤爆防止。手動は開ける)
- **sandbox ページは `event.source === window.parent` 以外の `render` を無視する**(ユーザー iframe が自分を緩い設定で再描画させる経路を塞ぐ。E2E の項目 4 が回帰テスト)

## ストア提出

提出物は `dist/`(.gitignore 済み)に生成する。**生成物はコミットせず、スクリプトだけを置く。**

```sh
cd scripts && npm run pack                        # SPEC §11 の機械確認 → dist/gd-peeker-<version>.zip
node ~/Code/gd-peeker/scripts/store-assets.mjs    # dist/store/ に掲載画像(要 playwright-core)
```

`pack.mjs` のチェックに引っかかったら zip は作られない。**チェックを緩める方向の変更はしない**(SPEC §11 と同じ扱い)。ダッシュボードの各欄に入れる値は [docs/store-submission.md](docs/store-submission.md)、掲載文は [docs/store-listing.md](docs/store-listing.md)。manifest の `description` はストアの 132 文字上限があるので、書き換えたら `npm run pack` を通す。

## テストの実行方法

```sh
node --test tests/unit/*.test.mjs  # lib/* の単体テスト(encoding / filetype / xmlformat / md pipeline / drivefetch sniff / drive URL)
cd <任意の作業ディレクトリ> && npm i playwright-core
node ~/Code/gd-peeker/tests/e2e-viewer-html.mjs   # 15項目(html: sandbox 描画・スクリプト実行/禁止・外部リソース CSP・null origin・title 返却・子 iframe からの render 乗っ取り拒否・sandbox が viewport いっぱい/#notice 表示時も残り全高)
node ~/Code/gd-peeker/tests/e2e-viewer-md.mjs     # 13項目(md: GFM 表/タスク/脚注・script 除去と不実行・front matter・hljs・mermaid→svg・TOC・fullWidth true/false で .md-root 幅)
node ~/Code/gd-peeker/tests/e2e-viewer-text.mjs   # 9項目(Shift_JIS 自動判定と手動上書き・短いテキストが sandbox いっぱいで二重スクロール無し / xml 整形・折りたたみ・不正 xml フォールバック / json 整形)
node ~/Code/gd-peeker/tests/e2e-settings.mjs      # 17項目(options: 設定永続化(md.fullWidth 含む)・開いている viewer への反映・言語切替)
node ~/Code/gd-peeker/tests/e2e-fetch-failure.mjs # 6項目(fetch 失敗: direct 403 / direct 500 / content-script no-drive-tab の診断・文言・操作ボタン)
node ~/Code/gd-peeker/tests/e2e-drive.mjs         # 17項目(実機 Drive: GD-Peeker-dev フォルダ内の html/md/Shift_JIS txt/xml。ダブルクリック → 自動起動 → 描画 → previewByTab。既定アプリに取られる形式があれば /file/d/<id>/view 経路で代替(⚠️ として数える))
```

隔離 E2E 合計: 60項目(html 15 + md 13 + text 9 + settings 17 + fetch failure 6)。実機 E2E: 17項目(drive)。unit 34件。**2026-09-10 M8 時点で unit 34 / 隔離 E2E 60 がすべてパス**(実機 E2E 17 は M7 時点でパス)(Chrome for Testing、実機は hmw アカウントの GD-Peeker-dev フォルダ)。

- Chrome for Testing を ms-playwright キャッシュから自動検出(`CHROME_FOR_TESTING` で明示可)
- **永続プロファイルは拡張の service worker スクリプトをキャッシュする**(2026-09-10 実機で確認: background.js を更新しても古いものが動き続け、webRequest リスナが無かった)。実機ハーネス(`tests/e2e-drive.mjs`、`scripts/drive-inspect.mjs`)は起動直後に `chrome.runtime.reload()` で拡張を起動し直す(`freshServiceWorker`)。手動確認でも `git pull` 後は `chrome://extensions` の再読み込みが必須
- **Drive 側で拡張子に既定アプリ(例: `.md` → StackEdit)が設定されていると、ダブルクリックはプレビューではなくそのアプリを開く**ので GD-Peeker は起動しない(起動しないのが正しい)。テスト用アカウントでは既定アプリを外しておく。実機 E2E はこのケースを ⚠️ として数え、失敗にはしない
- **ブランド版 Chrome 137+ は `--load-extension` 不可**の罠あり。実機確認は `chrome://extensions` のデベロッパーモードで `extension/` を読み込む(手順は [docs/usage.md](docs/usage.md))
- 隔離 E2E(上の 5 本)は Drive 本体にアクセスしない。**本物の Drive に対する確認は専用プロファイル**で行う: `bash scripts/drive-profile.sh` で Chrome for Testing を `~/.gd-peeker/profile` で素起動し、テスト用 Google アカウントで一度ログインして閉じる → 以後 `scripts/drive-inspect.mjs`(調査)と `tests/e2e-drive.mjs`(実機 E2E、作成予定)がそのプロファイルを Playwright から使う。プロファイルはリポ外(`.gitignore` 済み)。**2026-09-10 千田の判断で hmw.gr.jp 本アカウントでログイン済み。自動操作の読み書きは Drive フォルダ `1DkhF-K_7FymE8hWRNh8ehvEnS16rBvhW`(GD-Peeker-dev)の中だけ**に限る。フォルダ外のファイル・フォルダに触らない(一覧の閲覧も my-drive ではなくこのフォルダ URL を開く)。mock keychain なので作業が終わったら `rm -rf ~/.gd-peeker/profile` を勧める
- **実機で判明した Drive の挙動(2026-09-09/10)**: 一覧でのダブルクリックは URL も title も変えず、fileId 入りの iframe も出ない。代わりに `…/file/u/0/d/<id>/docos/p/sync` と `drivesharing/clientmodel?id=<id>` が飛ぶ(SPEC §3.1)。`/file/d/<id>/view` になるのは「新しいタブで開く」のときだけ。手動(アイコン)経路と Cookie 同送 fetch は実機で動作確認済み
