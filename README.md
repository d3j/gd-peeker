# GD-Peeker

**HTML, Markdown, XML & Text Viewer for Google Drive™**

Google Drive に置いた `.html` / `.md` / `.txt` / `.xml` を、Drive 上でダブルクリックするだけで **別タブにレンダリングして表示する** Chrome 拡張。Drive のプレビューは HTML をソースのまま、Markdown をプレーンテキストのまま、Shift_JIS の txt を文字化けのまま見せる。GD-Peeker はそれらを「読める形」で開く。

- ストア公開前提・OSS(MIT)
- **サーバ無し・OAuth 無し・データ送信ゼロ。** ファイル本文はユーザー自身の Drive セッションで取得し、ブラウザの中だけで描画する
- HTML は `allow-same-origin` を持たない sandboxed iframe で「動かすが隔離する」(サニタイズで殺さない)

## 現在の状態(2026-09-10)

- v0.1.0 M7 まで実装完了。Drive 一覧のダブルクリックで発生する preview 通信を `webRequest` で観測し、header sniff でファイル名と種別を決めて HTML / Markdown / txt / XML を viewer で開く。HTML は隔離 sandbox、Markdown はサニタイズ、txt は Shift_JIS を含む文字コード自動判定、XML は整形・折りたたみに対応。viewer はツールバー以外の全高・全幅を描画に使い、Markdown は既定でブラウザの横幅いっぱいに描く(設定 `md.fullWidth` を切ると従来の読みやすい幅)
- 設定画面は自動起動、HTML、Markdown、テキスト、文字コード、表示言語の全項目を編集でき、変更は開いている viewer に反映される
- テスト(2026-09-10 M8): unit 34/34、隔離 E2E 60/60(html 15・md 13・text 9・settings 17・fetch failure 6)、**実機 E2E 17/17**(本物の Drive で html/md/Shift_JIS txt/xml の 4 形式をダブルクリック → 自動起動 → 描画。テストアカウントの `.md`/`.txt` の既定アプリ(StackEdit)を外したので全形式がダブルクリック経路)
- 既知の挙動: Drive 側で拡張子に既定アプリが設定されていると、ダブルクリックはプレビューではなくそのアプリを開くので GD-Peeker は起動しない(正しい挙動)。xml など一部の形式は小さくても Google の「ウイルス スキャンに関する警告」ページを挟むが、confirm フォームを 1 回たどって取得する
- Chrome ウェブストアは未公開。提出物(zip・スクリーンショット 5 枚・プロモ画像)を作るスクリプトと、ダッシュボードの入力内容をまとめた手順書は用意済み([docs/store-submission.md](docs/store-submission.md))。残りは開発者登録(5 USD)と公開範囲の判断

## 名前の由来

- **Peeker**: 覗く人。Drive が見せてくれない中身を覗く道具、という機能そのもの
- **GD-**: Google Drive の頭字。製品名に `Google` / `Drive` の文字列を含めない(Chrome ウェブストアの[ブランディングガイドライン](https://developer.chrome.com/docs/webstore/branding)は Google 商標を拡張名に使うことを禁じ、`for Google Drive™` の形だけを認めている)。ストア掲載タイトルは規約準拠の `GD-Peeker — HTML, Markdown, XML & Text Viewer for Google Drive™` とし、`short_name` を `GD-Peeker` にする
- 却下した候補と理由: `Drive-Peeker`(商標ガイドライン違反側)、`Glimpse`(ストア上で同名拡張が複数・最大 17 万ユーザーで埋没)、`GDlimpse`(先行例ゼロで上手いが、口頭で伝わらず綴れない)

## 設計判断(2026-09-09 の議論で確定)

### 何を作らないか
- **右クリックメニューの拡張は作らない。** Drive のコンテキストメニューは Drive 自前の DOM で、`chrome.contextMenus` では項目を足せない。MutationObserver でメニュー DOM を監視して注入する方式は Drive の UI 変更のたびに壊れる。代わりに拡張アイコンのクリックを手動トリガにする
- **ダブルクリックの真の横取り(capture phase で `dblclick` を奪う)はしない。** Drive の行 DOM(難読化クラス名・`data-id`)に依存する
- **(2026-09-10 改訂)自動起動は `chrome.webRequest` の観測で行う。** 当初は「Drive がプレビューで `drive.google.com/file/d/<id>/view` に遷移する」前提で URL を検知する設計だったが、実機で **一覧のダブルクリックは URL も title も変えず、fileId を含む iframe も現れない**ことが分かった。代わりに、プレビューを開いた瞬間に Drive が送る `…/file/*/d/<fileId>/docos/p/sync` と `drivesharing/clientmodel?id=<fileId>` を background が観測して fileId を得る。観測のみで blocking はしない。DOM 依存ゼロは維持。ファイル名は `document.title` ではなく、本文取得 URL にヘッダだけ取りに行って(`Content-Disposition`)決める。URL 検知は「新しいタブで開く」経路として残す
- **OAuth を使わない。** `drive.readonly` は restricted scope で、本番公開かつ 100 ユーザー超で毎年の第三者セキュリティ審査(CASA)が要る。ファイル本文は拡張の `host_permissions`(`drive.google.com` / `drive.usercontent.google.com`)を使ってユーザーの Drive セッション Cookie 同送でダウンロード URL から取得する。同意画面も審査も不要になり、プライバシー説明が「データは一切外部に送信しない」で完結する
- **CDN 参照を書かない。** MV3 はリモートコード実行禁止。markdown-it / DOMPurify / highlight.js / mermaid はすべて `extension/vendor/` に同梱する

### アーキテクチャ
- Manifest V3。拡張本体 `extension/` は **ビルド無しの素の JS/HTML**([tabflock](https://github.com/d3j/tabflock) と同じ流儀)。サードパーティは `scripts/vendor.mjs`(esbuild)で `extension/vendor/` に生成してコミットする(拡張の実行にビルドは不要)
- 入口は2つ。**(1) 自動**: background が webRequest でプレビュー時の通信から fileId を得て(補助として content script の URL 検知)、ヘッダだけ取って種別を判定 → viewer タブを開く。**(2) 手動**: 拡張アイコンのクリック(プレビュー URL を開いているタブでのみ有効化、それ以外は設定画面を開く)。どちらも DOM に触らない
- 描画は viewer(拡張ページ)→ sandbox ページ(`manifest.sandbox`、unique origin)→ ユーザーコンテンツ、の三層。HTML は sandbox 内の `srcdoc` iframe(`allow-scripts`、`allow-same-origin` 無し)で **スクリプトを動かしたまま隔離**する。null origin で走るので親の Cookie・トークン・`chrome.*` には触れない
- Markdown は markdown-it → DOMPurify → sandbox ページで描画(mermaid / highlight.js は sandbox 内で実行)
- txt は文字コード自動判定(BOM → UTF-8 厳格デコード → Shift_JIS / EUC-JP ヒューリスティック)。**日本語 txt の Shift_JIS が Drive で化ける問題をここで解く**。手動上書き可
- xml は整形 + ハイライト + 折りたたみ
- 設定は「パーサの設定」を中心に: 自動起動 ON/OFF と対象形式、HTML のスクリプト/外部リソース許可、Markdown のプリセット/プラグイン/テーマ、既定文字コード、UI 言語

### 前提とリスク
- 実装前 PoC は行わない判断(2026-09-09)。最大の技術リスクは「Cookie 同送 fetch でダウンロード URL から本文が取れるか」(リダイレクト先 `drive.usercontent.google.com` の扱い)。取得は viewer 側 fetch → 別 URL 形 → content script 中継の **3 段のストラテジー**で実装し、失敗時は viewer に診断(どの段で・どの HTTP 状態で失敗したか)を出す。最初の実機確認は開発者自身の Chrome で行う
- Drive の URL 形が変わると自動起動が止まる(DOM 依存は無いので静かに degrade し、手動トリガと設定画面は生き残る)

## 使い方・開発

- 使い方: [docs/usage.md](docs/usage.md)
- 仕様: [docs/SPEC.md](docs/SPEC.md)
- タスク: [docs/tasks.md](docs/tasks.md)
- ストア掲載文・権限の説明: [docs/store-listing.md](docs/store-listing.md)

## License

MIT — see [LICENSE](LICENSE). Google Drive is a trademark of Google LLC. This project is not affiliated with or endorsed by Google.
