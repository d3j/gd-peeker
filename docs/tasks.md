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

### M4 設定画面 + 仕上げ
- [ ] options.html(SPEC §6 の全項目、即時保存、既定に戻す、onChanged で viewer 再描画)
- [ ] 初回 HTML 通知、5MB 超の確認、ソース表示トグル、ソースコピー
- [ ] E2E: e2e-settings.mjs、fetch 失敗時の診断パネル

### M5 ドキュメント・ストア準備
- [ ] docs/usage.md(インストール・使い方・**実機確認手順**・既知の制限)
- [ ] docs/store-listing.md(説明文 英/日・権限の正当化・データ利用申告・スクショ一覧)
- [ ] PRIVACY.md(英/日)
- [ ] README「現在の状態」更新、CLAUDE.md に E2E 件数を記載
- [ ] SPEC §11 の完了チェックをすべて満たす

## 実機確認(開発者=千田が行う)
- [ ] 自分の Drive で html / md / Shift_JIS txt / xml をダブルクリック → 期待どおり
- [ ] 共有された他人のファイル(閲覧権限のみ)でも取れるか
- [ ] hmw.gr.jp アカウント(Workspace)と gmail アカウントの両方で取れるか(`authuser` 複数ログイン時の挙動)
- [ ] `drivefetch` のどの段で成功したかを記録して docs/usage.md に反映

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
