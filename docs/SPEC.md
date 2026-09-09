# GD-Peeker 実装仕様(v0.1)

実装者(Codex)向けの契約。設計判断の背景は [README.md](../README.md)、守るべき制約は [CLAUDE.md](../CLAUDE.md)。迷ったら **README の設計判断 → この SPEC → tabflock(`~/Code/tabflock`)の流儀** の順で従う。

## 0. 一言で

Drive でファイルをダブルクリック → Drive が `https://drive.google.com/file/d/<id>/view` に遷移 → 拡張がそれを検知して **`viewer.html?id=<id>` を新タブで開く** → viewer が本文を Drive セッション Cookie で取得 → 種別ごとにレンダリング。手動トリガは拡張アイコン。設定画面で「パーサの設定」。

## 1. ディレクトリ構成

```
extension/
  manifest.json
  background.js            # service worker (module)。タブ生成・action 有効化・中継のみ
  content.js               # drive.google.com 上。URL 監視と fetch 中継だけ。DOM に触らない
  viewer.html / viewer.js / viewer.css   # 拡張ページ。ツールバー + sandbox iframe
  sandbox.html / sandbox.js / sandbox.css # manifest.sandbox。ユーザーコンテンツの描画
  options.html / options.js / options.css # 設定画面(パーサの設定)
  lib/
    settings.js            # 設定キー・既定値・load/save(唯一の定義場所)
    messages.js            # t(key, params)。en 既定 / ja
    drivefetch.js          # 本文取得 3 段ストラテジー + Content-Disposition 解析
    filetype.js            # 拡張子/MIME → 種別(html|md|txt|xml|code)と言語推定
    encoding.js            # バイト列 → 文字列。BOM/UTF-8/Shift_JIS/EUC-JP 判定
    xmlformat.js           # XML 整形(インデント)+ 折りたたみ用ツリー構築
    mdrender.js            # markdown-it 構成 → HTML 文字列 → DOMPurify
  vendor/                  # scripts/vendor.mjs の生成物(コミットする)
    VERSIONS.md            # 同梱ライブラリ名・バージョン・ライセンス
  icons/                   # 16/32/48/128 png + 元 svg
scripts/
  vendor.mjs               # esbuild で vendor/ を生成(npm 依存はここだけ。package.json は scripts/ 配下)
  icons.mjs                # svg → png
tests/
  unit/*.test.mjs          # node --test
  e2e-*.mjs                # Playwright + Chrome for Testing(tabflock と同じ流儀)
docs/
  SPEC.md tasks.md usage.md store-listing.md
PRIVACY.md                 # ストア掲載用プライバシーポリシー(英語、日本語併記)
```

## 2. manifest.json

```json
{
  "manifest_version": 3,
  "name": "GD-Peeker — HTML, Markdown, XML & Text Viewer for Google Drive™",
  "short_name": "GD-Peeker",
  "version": "0.1.0",
  "description": "Open .html, .md, .txt and .xml files from Google Drive™ as rendered pages in a new tab. No server, no sign-in, nothing leaves your browser.",
  "minimum_chrome_version": "120",
  "permissions": ["storage", "webRequest"],
  "host_permissions": [
    "https://drive.google.com/*",
    "https://drive.usercontent.google.com/*",
    "https://*.googleusercontent.com/*"
  ],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [{
    "matches": ["https://drive.google.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "action": { "default_title": "GD-Peeker", "default_icon": { "16": "icons/icon-16.png", "32": "icons/icon-32.png" } },
  "options_page": "options.html",
  "sandbox": { "pages": ["sandbox.html"] },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'",
    "sandbox": "sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: blob:; style-src 'self' 'unsafe-inline' https: data:; img-src * data: blob:; font-src * data:; media-src * data: blob:; connect-src *; child-src 'self' data: blob:; frame-src 'self' data: blob:"
  },
  "icons": { "16": "icons/icon-16.png", "32": "icons/icon-32.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" }
}
```

- `permissions` は `storage` と `webRequest`(観測のみ)だけ。`tabs` は不要(`chrome.tabs.create` と、`host_permissions` 対象タブの `url` 参照は `tabs` 権限無しで可)。`webNavigation` / `scripting` / `identity` / `contextMenus` を足さない
- sandbox の CSP は「外部リソース許可」時の上限。締める方向の制御は §5.2 のとおり srcdoc 内 meta CSP で行う
- `web_accessible_resources` は不要(viewer は拡張が自分で開く)

## 3. 入口

### 3.1 自動 — background の webRequest 観測(2026-09-10 改訂)

**実機で確認した Drive の挙動(2026-09-10、専用プロファイル)**: 一覧でのダブルクリックは URL を変えない(`/drive/folders/<id>` のまま)。`document.title` も変わらず、fileId を含む iframe も現れない(プレビューは Drive 自身の DOM で描かれる)。一方でプレビューを開いた瞬間に Drive が次のリクエストを送り、URL に fileId が入る:

- `https://drive.google.com/file/*/d/<fileId>/docos/p/sync?*`(開いたファイルだけで発火)
- `https://drive.google.com/drivesharing/clientmodel?id=<fileId>&*`(同上)
- 参考: `https://clients6.google.com/drive/v2internal/files/<id>?fields=preview…` は**隣のファイルの先読みでも発火する**ので使わない。`clients6.google.com` を host_permissions に足さない

- background が `chrome.webRequest.onBeforeRequest` を**観測のみ**で登録し(`urls` は上の 2 パターン、`types: ['xmlhttprequest']`)、`details.tabId` と URL から fileId を得る。`webRequestBlocking` / `declarativeNetRequest` は使わない。manifest の `permissions` に `webRequest` を追加する(単体では権限警告を増やさない。警告は host_permissions 由来のみ)
- 同一 tab・同一 fileId を 10 秒以内に再観測したら無視する(1 回のプレビューで 2 本とも飛ぶ)
- **ファイル名・種別は `document.title` に頼らない。** background が `https://drive.google.com/uc?export=download&id=<id>` を `credentials:'include'` で GET し、ヘッダを受け取った時点で `AbortController` で本文を中断する(header sniff、`lib/drivefetch.js` の `sniffDriveFile(fileId)` として実装。`Content-Disposition` 解析は既存の `parseContentDisposition` を使う)。得た名前から `filetype.js` で種別を決め、`autoOpen` かつ `autoOpenTypes` に含まれる場合だけ viewer を開く。名前が取れない・対象外は開かない。sniff が HTML(Google のログイン/確認ページ)を返したら失敗扱い
- `previewByTab: {[tabId]: {fileId, fileName, kind, at}}` を **`chrome.storage.session`** に持つ(service worker 再起動で消えない)。viewer には `name=<fileName>` を渡す。二重起動防止の `openedByDriveTab` も同じく session storage へ
- content.js の URL 検知(`/file/d/<id>/view`)は「新しいタブで開く」経路として残す。こちらも title ではなく同じ sniff で名前を決める(content.js は `drive:preview` に fileId だけ送ればよい。`drive:title?` は廃止)
- webRequest リスナは service worker のトップレベルで登録する(イベントで SW が起きる)

### 3.2 手動(拡張アイコン)

- `chrome.action.onClicked`: アクティブタブの URL が `/file/d/<id>/view` 形に一致 → その fileId で viewer(種別に関わらず開く)。一致しない → `previewByTab[tab.id]` があり `at` が 30 分以内 → その fileId で viewer。どちらも無し → `chrome.runtime.openOptionsPage()`
- バッジ: 一致する URL、または `previewByTab` にエントリがあるタブに `●`。`chrome.action.disable` は使わない

## 4. 本文取得(lib/drivefetch.js)

viewer(拡張ページ)から実行する。順に試し、最初に成功したものを採用。各段の結果(URL・HTTP status・最終 URL・content-type・所要 ms)を `attempts[]` に積み、失敗時は viewer の診断パネルに全段を表示する。

1. `GET https://drive.google.com/uc?export=download&id=<id>` — `credentials:'include'`, `redirect:'follow'`
2. `GET https://drive.usercontent.google.com/download?id=<id>&export=download&authuser=0` — 同上
3. content script 中継: background 経由で **その fileId を開いている Drive タブ**の content script に `drive:fetch` を送り、content script が同一オリジンで 1 の URL を `credentials:'include'` で fetch → `ArrayBuffer` を base64 で返す(サイズ上限 20MB。超えたら `too-large` で失敗扱い)

成功判定: HTTP 2xx かつ、レスポンスの `content-type` が `text/html` で本文が Google のログイン/確認ページ(`<title>Google Drive` を含む、または `accounts.google.com` へ最終リダイレクト)**でない**こと。「ウイルススキャンできません」確認ページ(`confirm=` を含むフォーム)が返った場合は `confirm` パラメータを拾って**同段で 1 回だけ再試行**する。

メタデータ:
- ファイル名: `Content-Disposition` の `filename*=UTF-8''...` → `filename="..."` の順で採用。無ければ URL パラメータ `name`(§3 のヒント)。それも無ければ `<id>` を表示名にする
- 種別判定は §5.0

制約: `googleapis.com` を叩かない。OAuth トークンを扱わない。取得した本文を `chrome.storage` に保存しない(メモリのみ)。

## 5. 描画(viewer.html + sandbox.html)

### 5.0 種別判定(lib/filetype.js)

拡張子(小文字)で決める。ユーザーはツールバーの「表示形式」セレクタで上書きできる(上書きは fileId 単位で `chrome.storage.session` に記憶)。

| 種別 | 拡張子 | 描画 |
|---|---|---|
| `html` | html, htm, xhtml | §5.2 |
| `md` | md, markdown, mdown, mkd | §5.3 |
| `xml` | xml, xsl, xslt, xsd, plist, rss, atom, opml | §5.4 |
| `txt` | txt, text, log, (拡張子なし) | §5.5 |
| `code` | json, yaml, yml, csv, tsv, js, mjs, ts, py, rb, sh, bash, zsh, css, sql, ini, toml, conf, cfg, java, kt, go, rs, c, h, cpp, hpp, cs, php, swift | §5.5 + highlight.js。json は整形(2 スペース)+ハイライト |

`.svg` は対象外(Drive が正しくプレビューする)。

### 5.1 viewer(拡張ページ)

- URL: `viewer.html?id=<fileId>&name=<hint>`
- 構成: 上部ツールバー(高さ 40px、折りたたみ可)+ 全面 `<iframe id="sandbox" src="sandbox.html" sandbox="allow-scripts allow-forms allow-popups allow-modals">`(**`allow-same-origin` を付けない**)
- ツールバー: ファイル名 / 種別セレクタ(§5.0)/ 文字コードセレクタ(auto + 判定結果表示 + 手動: UTF-8, Shift_JIS, EUC-JP, UTF-16LE, UTF-16BE, ISO-8859-1)/ 再読み込み / Drive で開く(`https://drive.google.com/file/d/<id>/view` を新タブ)/ ソースをコピー / ソース表示トグル(`code` 描画に切替)/ 設定(options を開く)
- 手順: ①`drivefetch` で bytes 取得 → ②`encoding.decode(bytes, override)` → ③種別ごとに sandbox へ `postMessage({type:'render', kind, text|html, options})` → ④sandbox から `{type:'rendered', title?, height?}` / `{type:'error'}` を受けてツールバー更新。`document.title` は `<ファイル名> — GD-Peeker`
- 失敗時: ツールバー下に診断パネル(§4 の `attempts[]` を表形式)+「Drive で開く」「再試行」ボタン。**エラー文言に「ログインしているか」「共有権限があるか」の確認を含める**
- 初回のみ(拡張インストール後 1 回)、HTML を開いたときにツールバー下に「このファイルのスクリプトは隔離された環境で実行されます。共有された他人のファイルを開くときは注意してください」を表示し、閉じたら `storage.local.htmlNoticeDismissed=true`
- 大きいファイル(> 5MB)は種別に関わらず**先に確認**(「開く / ソース表示」)

### 5.2 html

- sandbox.js は受け取った HTML 文字列をそのまま内側の `<iframe id="user" sandbox="allow-scripts allow-forms allow-popups allow-modals">` の `srcdoc` に入れる。**サニタイズしない**
- 設定 `html.allowScripts=false` のときは内側 iframe の `sandbox` から `allow-scripts` を外す
- 設定 `html.allowExternal=false` のときは、HTML の `<head>` 先頭(無ければ文書先頭)に `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:">` を差し込む(**締めるだけ。緩める用途には使えない**)
- `<base target="_blank">` を差し込む(リンクは新タブへ。null origin から親を乗っ取れない)
- `<title>` があれば `rendered.title` で viewer に返す
- 相対パス参照(`./style.css` 等)は解決できない(Drive 上の隣接ファイルは取らない)。v0.1 では諦める。壊れた参照はそのまま

### 5.3 md(lib/mdrender.js)

- markdown-it: プリセット `md.preset`(`gfm`(既定)= `commonmark` + `html:true, linkify:true, typographer:false, breaks:false` + 以下プラグイン / `commonmark` = プラグイン無し)
- プラグイン(すべて vendor に同梱、設定で個別 ON/OFF): `markdown-it-footnote`, `markdown-it-task-lists`, `markdown-it-anchor`(見出しに id)、テーブルは markdown-it 本体、`markdown-it-front-matter`(YAML front matter を折りたたみ表示)
- コードブロック: `highlight.js`(common languages)。`mermaid` 言語はハイライトせず `<pre class="mermaid">` にする
- 出力は **DOMPurify** を通す(`ADD_TAGS: ['pre'], ADD_ATTR: ['class','id','target']`、`FORBID_TAGS: ['style','script','iframe','object','embed']`)。**md では inline HTML の script を絶対に動かさない**
- sandbox 内で `.mermaid` を mermaid(`securityLevel:'strict'`, `startOnLoad:false`)でレンダリング。失敗した図はソースをそのまま `<pre>` で残す
- テーマ `md.theme`: `github`(既定)/ `plain` / `serif`。`prefers-color-scheme: dark` に追従(設定で `light`/`dark`/`auto`)
- 目次: 設定 `md.toc=true` で見出しから右サイドに TOC(sandbox 内)
- KaTeX は v0.1 対象外(tasks.md に後続として記載)

### 5.4 xml(lib/xmlformat.js)

- `DOMParser('application/xml')` → `parsererror` があれば「整形できません」と `code` 描画にフォールバック(エラー位置を表示)
- 整形: 2 スペースインデント、属性は 1 行、テキストノードは trim。整形後を highlight.js(xml)でハイライト
- 折りたたみ: 各要素の開始タグにトグル。子要素数 > 50 の要素は初期状態で折りたたむ。「すべて展開/折りたたみ」ボタン
- 宣言・コメント・CDATA・処理命令は保持

### 5.5 txt / code(lib/encoding.js)

- `decode(bytes, override)`:
  1. `override` 指定があればそれで `TextDecoder` (`fatal:false`)
  2. BOM: `EF BB BF`→UTF-8、`FF FE`→UTF-16LE、`FE FF`→UTF-16BE
  3. `TextDecoder('utf-8',{fatal:true})` が通れば UTF-8
  4. Shift_JIS / EUC-JP をスコアリング: 各エンコーディングで `TextDecoder(fatal:false)` し、U+FFFD の個数(少ないほど良い)、ひらがな/カタカナ/常用漢字(U+3040–30FF, 4E00–9FFF)の出現数(多いほど良い)、制御文字・半角カナ連続(少ないほど良い)で採点。差が小さいときは Shift_JIS を優先(日本語 txt の既定に近い)
  5. どれも成立しなければ `windows-1252`
  - 戻り値 `{text, encoding, confidence: 'bom'|'strict'|'heuristic'|'fallback', hadBom}`。ツールバーには `Shift_JIS (auto)` のように表示
- txt: `<pre>` で描画。設定 `txt.wrap`(既定 on)、`txt.fontSize`、行番号表示 `txt.lineNumbers`(既定 off)。5,000 行超は仮想化不要だが `content-visibility:auto` を付ける
- code: highlight.js で言語自動判定(拡張子優先)。json は `JSON.parse` できれば 2 スペース整形、できなければ生のまま
- csv/tsv: v0.1 では `code` 扱い(テーブル化は tasks.md の後続)

## 6. 設定(options.html, lib/settings.js)

`chrome.storage.local` に `settings` オブジェクト 1 つで保存。既定値:

```js
{
  autoOpen: true,
  autoOpenTypes: ['html','md','txt','xml'],        // 'code' は既定 off
  html: { allowScripts: true, allowExternal: true },
  md:   { preset: 'gfm', plugins: { footnote: true, taskLists: true, anchor: true, frontMatter: true, mermaid: true }, theme: 'github', colorScheme: 'auto', toc: false },
  txt:  { wrap: true, fontSize: 14, lineNumbers: false },
  encoding: { default: 'auto' },                   // 'auto' | 'utf-8' | 'shift_jis' | 'euc-jp'
  uiLang: 'en'                                     // 'en' | 'ja'
}
```

- options は上記をそのまま編集する 1 ページ。セクション: 自動起動 / HTML / Markdown / テキスト / 文字コード / 表示。保存は即時(変更のたび)+ 「既定に戻す」
- 設定変更は `chrome.storage.onChanged` で開いている viewer に反映(再描画)
- 最下部に「このファイルを開くたびの上書き(表示形式・文字コード)はタブを閉じると消えます」の注記と、PRIVACY.md へのリンク、バージョン表示

## 7. i18n(lib/messages.js)

tabflock の `messages.js` と同じ形(`t(key, params)`、`{en:{...}, ja:{...}}` を 1 ファイルに持つ)。既定 en。全 UI 文字列(ツールバー、options、診断、初回通知)を網羅。

## 8. vendor(scripts/vendor.mjs)

- `scripts/package.json` に devDependencies(esbuild, markdown-it とプラグイン群, dompurify, highlight.js, mermaid)を **バージョン固定**で持つ。実装時点の最新安定版を採用し、`extension/vendor/VERSIONS.md` に名前・バージョン・ライセンス・生成日を書く
- 生成物: `vendor/md-runtime.js`(markdown-it + プラグイン + DOMPurify + hljs common を 1 本、IIFE でグローバル `GDP` に export)、`vendor/mermaid.js`(mermaid 単体、ESM か IIFE)、`vendor/hljs-theme-light.css` / `-dark.css`、`vendor/md-theme-*.css`
- 生成物はコミットする。`extension/` は実行にビルド不要
- ライセンス文は `vendor/LICENSES.txt` に連結して同梱

## 9. テスト

- `tests/unit/`: `encoding`(UTF-8/BOM/Shift_JIS/EUC-JP/UTF-16 の fixture バイト列)、`filetype`、`xmlformat`(整形・エラー・CDATA 保持)、`mdrender`(DOMPurify で script が落ちる・mermaid ブロックが `<pre class="mermaid">` になる・front matter)、`drivefetch` の `Content-Disposition` 解析と confirm ページ判定
- `tests/e2e-*.mjs`: Playwright + Chrome for Testing(`--load-extension`)。Drive には行かない。`context.route('https://drive.google.com/uc**')` と `https://drive.usercontent.google.com/**` を fixture で応答させ、`chrome-extension://<id>/viewer.html?id=test-html` を直接開いて検証する
  - html: `<script>` が実行される(DOM に書いた要素が見える)/ `allowScripts=false` で実行されない / `allowExternal=false` で外部 img がブロックされる / 内側 iframe から `parent.chrome` にアクセスできない(null origin)/ `<title>` が viewer のタイトルに反映
  - md: 見出し・表・タスクリスト・脚注 / inline `<script>` が消える / mermaid が svg になる / hljs のクラスが付く
  - text: Shift_JIS の fixture が化けずに読める・ツールバーに `Shift_JIS (auto)` / 手動で UTF-8 に切替えると化ける(=上書きが効く)/ xml 整形・折りたたみ・不正 xml のフォールバック / json 整形
  - settings: options の変更が `storage.local` に入る / 開いている viewer に反映 / `uiLang:'ja'` で日本語
  - fetch 失敗: route で 403 を返す → 診断パネルに 3 段の attempts が並ぶ
- 拡張 ID は Chrome for Testing 起動後に `chrome://extensions` ではなく service worker の URL(`context.serviceWorkers()`)から取る(tabflock の E2E と同じ)
- **実機 E2E `tests/e2e-drive.mjs`**(専用プロファイル `~/.gd-peeker/profile`、`scripts/drive-inspect.mjs` と同じ起動。Drive フォルダ `https://drive.google.com/drive/folders/1DkhF-K_7FymE8hWRNh8ehvEnS16rBvhW`(GD-Peeker-dev)の中だけを読み書きする): フォルダを開く → `tests/fixtures/gdp-*` の各行(`[aria-label^="<name> "]`、テストハーネスは DOM を使ってよい)をダブルクリック → `context.waitForEvent('page')` で `viewer.html?id=<行の data-id>` が開く → 描画を確認(html: sandbox 内 user iframe に `#ok` / md: `.md-root h1` / sjis txt: `.text-pre` に「日本語のテキスト」/ xml: `.xml-tree`)→ viewer を閉じ、Esc でプレビューを閉じる。さらにアイコン経路: プレビューを開いたまま `chrome.action.onClicked` 相当を service worker から `chrome.action.onClicked.dispatch` は不可なので、`sw.evaluate` で `openViewer` を直接呼ぶ代わりに **`previewByTab` が session storage に入っていること**を確認する

## 10. ドキュメント・ストア

- `docs/usage.md`: インストール(デベロッパーモード)/ 使い方 / **実機確認手順**(自分の Drive に `test.html`・`test.md`・Shift_JIS の `test.txt`・`test.xml` を置いてダブルクリック→期待される表示。失敗時は診断パネルのスクリーンショットを issue に)/ 既知の制限(相対パス・共有ファイルのスクリプト)
- `docs/store-listing.md`: ストアの説明文(英・日)/ **権限の正当化文**(`storage`: 設定保存、`drive.google.com`: ファイル本文の取得、`drive.usercontent.google.com` と `googleusercontent.com`: ダウンロードのリダイレクト先)/ 単一目的の説明 / データ利用の申告(収集なし)/ スクリーンショットの撮り方リスト
- `PRIVACY.md`: 収集しない・送信しない・第三者無し・本文はメモリのみ、を英日で
- `README.md` の「現在の状態」を実装完了時に更新(実装者が書く)

## 11. 完了の定義(v0.1.0)

- [ ] Drive で `.html/.md/.txt/.xml` をダブルクリックすると新タブで描画される(`tests/e2e-drive.mjs` 4 形式パス)
- [ ] 拡張アイコンのクリックでプレビュー画面から同じ viewer が開き、それ以外の画面では options が開く
- [ ] Shift_JIS の日本語 txt が自動判定で読める
- [ ] `node --test tests/unit/` 全パス、E2E 全パス(件数を CLAUDE.md に記載)
- [ ] `extension/` 配下に外部のスクリプト/スタイル参照が無い。確認コマンドは `grep -rn "https://" extension --include='*.html' --include='*.js' --include='*.css' | grep -v "^extension/vendor/" | grep -vE "drive\.google\.com|drive\.usercontent|googleusercontent|accounts\.google"` が空であること。**Drive のダウンロード URL は本文取得に必要な文字列であり対象外。URL を文字列連結で分割して grep を逃れるような変更はしない**(2026-09-09 に一度そうされ、レビューで戻した)
- [ ] `manifest.json` の permissions が `storage` と `webRequest` のみ、host_permissions が 3 つのみ
- [ ] docs/usage.md・docs/store-listing.md・PRIVACY.md がある
