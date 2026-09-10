# tasks.md

実装は [SPEC.md](SPEC.md) を正とする。マイルストンごとにコミットする(1 行目 `gd-peeker: M<n> 何をしたか`、本文に判断の理由)。

## v0.1.0

### M1 骨格 + HTML — 完了(2026-09-09、Codex 実装 + Claude レビュー)
- [x] manifest / background / content / viewer / sandbox / options の空実装と配線(SPEC §2, §3)
- [x] `lib/settings.js`・`lib/messages.js`(en/ja)
- [x] `lib/drivefetch.js` 3 段ストラテジー + 診断 `attempts[]` + Content-Disposition 解析(SPEC §4)
- [x] html 描画: sandbox → srcdoc iframe(`allow-same-origin` 無し)、allowScripts / allowExternal(meta CSP)、`<base target=_blank>`(SPEC §5.2)
- [x] 自動起動(URL 監視・二重起動防止・対象形式判定)+ アイコンクリック(バッジ・設定への分岐)
- [x] icons(svg → png)
- [x] unit 9 件 / E2E e2e-viewer-html.mjs 9 項目
- レビューで直したもの: sandbox が子 iframe からの `render` を受け付けていた(緩い設定で再描画できる穴)/ 同じファイルを閉じて開き直しても自動起動しなかった / 拡張子なしのファイルが txt として自動起動していた / 未使用の `fetchFromContentScript` を削除
- Codex の解釈(採用): 5MB 超の確認は M4 へ / 拡張子なしは MIME より SPEC 表を優先(→レビューで自動起動対象から外した)
- 既知の限界: background の二重起動防止 Map は service worker の再起動で消える(手動クリックで同じファイルの viewer が 2 枚開きうる)。v0.2 候補に `chrome.storage.session` 化を記載

### M2 Markdown — 完了(2026-09-09、Codex 実装 + Claude レビュー)
- [x] `scripts/vendor.mjs` + `scripts/package.json`(esbuild、バージョン固定)→ `vendor/md-runtime.js`, `vendor/mermaid.js`, テーマ css, `VERSIONS.md`, `LICENSES.txt`(SPEC §8)
- [x] `lib/mdrender.js`(preset / plugins / hljs / DOMPurify)+ sandbox 側 mermaid 描画 + TOC + テーマ・ダーク追従(SPEC §5.3)
- [x] unit: mdrender / E2E: e2e-viewer-md.mjs 9 項目
- Codex の解釈(採用): sandbox ページは unique origin で ES module を import できないため、first-party の mdrender/xmlformat も `vendor/sandbox-runtime.js` に IIFE 化して読む(CLAUDE.md に再生成の注意を記載)。unit の DOMPurify は Node に DOM が無いため契約 shim、実体は E2E で検証
- レビューで直したもの: `vendor/mermaid.js`(未 minify で 7.9MB)を sandbox.html から常時読んでいた → esbuild minify(3.3MB)+ mermaid ブロックがある文書でだけ動的ロード。md-runtime も 711KB → 300KB / md E2E の「script が除去された」が sandbox.html 自身の `<script src>` を数えて必ず落ちていた → 描画結果内で数え、実行されなかったことも確認

### M3 txt / xml / code + 文字コード — 完了(2026-09-09、Codex 実装 + Claude レビュー)
- [x] `lib/encoding.js`(BOM → UTF-8 厳格 → SJIS/EUC スコアリング → fallback)+ ツールバーの判定表示・手動上書き(SPEC §5.5)
- [x] `lib/xmlformat.js`(整形・折りたたみ・不正 xml フォールバック)(SPEC §5.4)
- [x] code(hljs 自動判定、json 整形)
- [x] unit: encoding(各エンコーディングの fixture)/ xmlformat / E2E: e2e-viewer-text.mjs 8 項目
- Codex の解釈(採用): xmlformat の unit は Node に DOMParser が無いため同一 API 内の Node 用 tokenizer 経路を検証(ブラウザでは DOMParser 経路)

### M4 設定画面 + 仕上げ — 完了(2026-09-09、Codex 実装 + Claude レビュー)
- [x] options.html(SPEC §6 の全項目、即時保存、既定に戻す、onChanged で viewer 再描画)
- [x] 初回 HTML 通知、5MB 超の確認、ソース表示トグル、ソースコピー
- [x] E2E: e2e-settings.mjs 14 項目、e2e-fetch-failure.mjs 6 項目
- レビューで直したもの: background の `relayFetch` が `Number(null)=0` を有効なタブ id と見なし、driveTabId 無しのときに `no-drive-tab` ではなく「No tab with id 0」になっていた(fetch failure E2E が 5/6 で検出)/ Codex が SPEC §11 の grep を空にするため Drive URL を `'https:' + '//'` に分割していた → 元に戻し、§11 の確認コマンドを Drive ホスト除外の形に直した(**チェックを逃れる変更は禁止**と明記)
- Codex の解釈(採用): 5MB 超の確認はサイズ判定に本文が要るため「fetch 後・decode/render 前」/ fetch failure は別ファイル

### M5 ドキュメント・ストア準備 — 完了(2026-09-09)
- [x] docs/usage.md(インストール・使い方・**実機確認手順**・既知の制限)
- [x] docs/store-listing.md(説明文 英/日・権限の正当化・データ利用申告・スクショ一覧)
- [x] PRIVACY.md(英/日)
- [x] README「現在の状態」更新、CLAUDE.md に E2E 件数を記載
- [x] SPEC §11 のうち機械確認できる項目(unit/E2E 全パス・外部参照なし・permissions/host_permissions・docs 3 点)は充足。残りは下の「実機確認」(Drive 実機でのダブルクリック・アイコン・Shift_JIS)

### M6 自動起動の再設計 — webRequest 観測 + header sniff(SPEC §3.1/§3.2 改訂版)
- [x] manifest に `webRequest`(観測のみ)。background で `onBeforeRequest`(2 パターン)→ 10 秒デデュープ → `sniffDriveFile` → 種別判定 → viewer
- [x] `lib/drivefetch.js` に `sniffDriveFile(fileId)`(GET + ヘッダ受信で abort、`{fileName, contentType, ok, status, finalUrl, error}`)
- [x] `previewByTab` と `openedByDriveTab` を `chrome.storage.session` へ。content.js は fileId だけ送る(`drive:title?` 廃止)
- [x] アイコン: URL 一致 → previewByTab(30 分以内)→ options。バッジも同基準
- [x] unit: webRequest URL → fileId 抽出、sniff の判定(HTML ページ/Content-Disposition 無し/HTTP 403)
- [x] `tests/e2e-drive.mjs`(実機、フォルダ 1DkhF… の中だけ)4 形式 + previewByTab 確認
- [x] docs/usage.md の実機確認手順を「ダブルクリックで開く」に合わせて更新、store-listing の権限正当化に webRequest を追加
- Codex の解釈(採用): `previewByTab` は自動オープン対象外でも手動アイコンの根拠になるため、sniff が成功しファイル名が取れた時点で保存する。`autoOpen` / `autoOpenTypes` は viewer を自動で開くかどうかだけに効かせる。`sniffDriveFile` はヘッダ受信後に本文を読まず abort するため、Google HTML 判定は `accounts.google.com` 最終 URL、または `text/html` かつ `Content-Disposition` ファイル名なしを失敗扱いにする
- レビューで直したもの(2026-09-10): 永続プロファイルが古い service worker をキャッシュしていて webRequest リスナが無かった → ハーネスが起動直後に `chrome.runtime.reload()`(`freshServiceWorker`)/ xml は小さくても Google の「ウイルス スキャンに関する警告」ページに当たり sniff が `text/html` で失敗していた → sniff も本文を読んで confirm フォームで 1 回再試行 / このアカウントは `.md`/`.txt` の既定アプリが StackEdit で、ダブルクリックが Drive のプレビューではなく StackEdit を開く → 実機 E2E は ⚠️ で記録し `/file/d/<id>/view` 経路で描画を検証
- テスト(2026-09-10、Claude 実行): unit 33/33、隔離 E2E 46/46、**実機 E2E 15/15**(html/xml はダブルクリック自動起動、md/Shift_JIS txt は view 経路)

## 実機確認
- [x] 「アプリで開く → 新しいタブで開く」+ アイコンクリックで html が描画された(2026-09-09 千田)= **Cookie 同送 fetch は通る**
- [x] 一覧ダブルクリックの調査(2026-09-10、専用プロファイル + hmw アカウント、フォルダ GD-Peeker-dev 内): URL/title 不変、fileId 入り iframe 無し、**通信に fileId が乗る**(`docos/p/sync`、`drivesharing/clientmodel`)→ M6 へ
- [x] GD-Peeker-dev フォルダで html / xml のダブルクリック → 自動起動 → 描画(2026-09-10、実機 E2E)。md / txt は既定アプリ StackEdit に取られるため view 経路で描画確認 → 千田が既定アプリを外し、M7 着手前(2026-09-10)に 4 形式ともダブルクリック経路で 17/17
- [ ] 共有された他人のファイル(閲覧権限のみ)でも取れるか
- [ ] hmw.gr.jp アカウント(Workspace)と gmail アカウントの両方で取れるか(`authuser` 複数ログイン時の挙動)
- [ ] `drivefetch` のどの段で成功したかを記録して docs/usage.md に反映

## M7 viewer の描画領域をブラウザいっぱいに広げる — 完了(2026-09-10、Claude 実装)
- 症状: html 等を開いたとき描画領域が狭い(約 150px)。md は中央の 980px 幅にしか出ない
- 原因(高さ): `viewer.css` の body が `grid-template-rows: 40px auto auto auto 1fr` で、hidden の `#notice`/`#large-confirm`/`#diagnostics` と `:empty` の `#status` は `display:none` になっても grid の行としては残る → `#sandbox` が 2 行目(auto)に落ち、iframe の `height:100%` が効かず既定高さになっていた
- 原因(幅): `vendor/md-theme-*.css` の `.md-root{max-width:980px;margin:0 auto}`。さらに **grid item に `margin:auto` を付けると shrink-to-fit になる**ため、短い文書では `.md-root` が本文幅(E2E fixture で 240px)まで縮んでいた(M7 の E2E で発見。M7 以前からの潜在バグ)
- [x] `viewer.css` を flex column に(`body{display:flex;flex-direction:column;height:100vh;overflow:hidden auto}`、ツールバー/notice/large-confirm/status/diagnostics は `flex:none`、`#sandbox` は `flex:1 1 auto;min-height:0`)。どの帯が出ていても sandbox が残り全高を取る。横スクロールは出さない
- [x] `sandbox.css`: `#app`/`.text-pre`/`.code-pre`/`.xml-view` を `box-sizing:border-box` に(`min-height:100vh`/`100%` + padding で sandbox を数十 px はみ出し、短いファイルでも二重スクロールになっていた)
- [x] 設定 `md.fullWidth`(既定 `true`。千田の要望「ブラウザサイズ一杯」)を `lib/settings.js` に追加、`normalizeMdOptions` が通し、sandbox は `#app` に `md-full` クラスを付ける。テーマ css(`scripts/vendor.mjs` → 再生成)に `.md-full .md-root{max-width:none;margin:0}` と、`.md-root{box-sizing:border-box;width:100%}`(shrink-to-fit 対策。false のときも列幅いっぱい → 980px で頭打ち → 中央寄せ)。padding は従来どおり(github/plain 24px 32px、serif 28px 36px)。TOC(220px)は右に残る
- [x] options の Markdown 節にトグル(`#mdFullWidth`、文言は `messages.js` の `mdFullWidth` en/ja)
- [x] E2E 追加: html 1b(sandbox 高 = viewport − ツールバー ±2px / 幅 = viewport / viewer がスクロールしない / user iframe が sandbox いっぱい)・1c(`htmlNoticeDismissed:false` で #notice を出しても sandbox が残り全高)、md 2(既定で `md-full`・`.md-root` 幅 = #app − TOC / `fullWidth:false` で 980px)、text(短い Shift_JIS が sandbox いっぱいで縦にはみ出さない)、settings(`fullWidth` の永続化と開いている viewer への反映)
- 判断: Codex に委譲せず Claude が直接実装した(CSS 中心の小さな差分で、レビューの手間の方が大きい)。`box-sizing` は sandbox 全体に当てず 4 要素に限定(ユーザー md のテーマ css の前提を変えない)
- 実機 E2E の前提変化: 千田がこのアカウントの `.md`/`.txt` の既定アプリ(StackEdit)を外したので、4 形式ともダブルクリック経路で通るようになった(⚠️ フォールバック無し、項目数 15 → 17)
- テスト(2026-09-10、Claude 実行): unit 33/33、隔離 E2E 60/60(html 15・md 13・text 9・settings 17・fetch failure 6)、実機 E2E 17/17
- 追記(2026-09-10 千田の手動確認): `chrome://extensions` で再読み込みした直後に「エラー: No tab with id: N」(background.js の `updateAction` → `chrome.action.setBadgeText`)。`tabs.onUpdated` から設定読込と previewByTab 参照を await している間にタブが閉じると、存在しないタブ ID にバッジを付けて例外になる競合(再読み込み直後は全タブ分の onUpdated が来るので出やすい)。動作には影響しないが赤いエラーが残るので、バッジ/タイトル設定を try/catch で握りつぶした
- 残している既知の見た目: `fullWidth:false` + dark で `.md-root` の外側(sandbox の body)が白のまま。M7 の範囲外

## v0.2 以降(候補)
- background の二重起動防止 Map を `chrome.storage.session` に置く(service worker 再起動で消える問題)
- csv / tsv のテーブル表示(ソート・列固定)
- KaTeX(md 数式)
- md の相対画像参照(同じ Drive フォルダ内の画像を取りに行く。要 Drive 一覧 API → OAuth が要るため慎重に)
- html の相対パス解決(同上)
- Drive の一覧画面で行を選択しただけの状態からアイコンで開く(DOM 依存が要るため原則やらない)
- `share` 用の固定 URL(拡張の viewer URL は他人の環境では開けないので、Drive のリンク + 「GD-Peeker で開く」案内)
- ストア公開: スクリーンショット 5 枚、プロモ画像、Web Store 開発者登録(5 USD)
- ドメイン(gd-peeker.app 等)は防衛目的のみ。ストア公開直前に検討
