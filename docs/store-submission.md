# Chrome ウェブストア 提出手順(v0.1.0)

掲載文そのものは [store-listing.md](store-listing.md)、プライバシーポリシー本文は [../PRIVACY.md](../PRIVACY.md)。
この文書は「どの画面に何を入れるか」と「提出前に何を通すか」を書く。

## 0. 提出物の作り方

```sh
# 1) 提出前チェック + zip(dist/gd-peeker-<version>.zip)
cd scripts && npm run pack

# 2) 掲載画像(スクショ 5 枚 + プロモ 2 枚 → dist/store/)
cd <playwright-core を入れた作業ディレクトリ>
node ~/Code/gd-peeker/scripts/store-assets.mjs
```

`dist/` は `.gitignore` 済み(生成物はコミットしない。スクリプトだけをコミットする)。

`npm run pack` は zip を作る前に SPEC §11 の機械確認を行い、1 つでも外れたら zip を作らずに終わる。

- `permissions` が `storage` / `webRequest` のみ、`host_permissions` が 3 つのみ
- `identity` / `declarativeNetRequest` / `webRequestBlocking` / `<all_urls>` が manifest に無い
- `extension/` 配下に外部のスクリプト・スタイル参照が無い(`vendor/` と Drive のホストは対象外)
- ストアの文字数上限: `name` 75 / `short_name` 12 / `description` 132
- `lib/mdrender.js`・`lib/xmlformat.js` が `vendor/sandbox-runtime.js` より新しくない(再生成忘れの検出)
- zip の直下に `manifest.json` がある

## 1. 提出前に通すテスト

```sh
node --test tests/unit/*.test.mjs                  # 34
node ~/Code/gd-peeker/tests/e2e-viewer-html.mjs    # 15
node ~/Code/gd-peeker/tests/e2e-viewer-md.mjs      # 13
node ~/Code/gd-peeker/tests/e2e-viewer-text.mjs    #  9
node ~/Code/gd-peeker/tests/e2e-settings.mjs       # 17
node ~/Code/gd-peeker/tests/e2e-fetch-failure.mjs  #  6
node ~/Code/gd-peeker/tests/e2e-drive.mjs          # 17(実機 Drive。専用プロファイルが要る)
```

## 2. 開発者登録(初回のみ、千田の作業)

**登録に使うのは gmail の個人アカウント**(2026-09-10 千田の判断)。会社の管理下から独立させ、公開される連絡先も個人のものにする。更新時も同じアカウントが要るので、実際に使ったアドレスをこの節に追記すること。

1. <https://chrome.google.com/webstore/devconsole> に gmail の個人アカウントでログイン
2. 開発者登録料 **5 USD**(一回限り)を支払う
3. 開発者情報に**公開される連絡先メールアドレス**を登録し、確認メールで検証を済ませる(未検証だと審査に出せない)
4. 実際に登録したアカウントをこの節に追記する

実機テストで使っている hmw.gr.jp アカウント(GD-Peeker-dev フォルダ)とは別物。ストアの操作はこの個人アカウントで行う。

## 3. アイテムの作成とアップロード

「新しいアイテム」→ `dist/gd-peeker-0.1.0.zip` をアップロード。

## 4. 「ストアの掲載情報」タブ

| 項目 | 入れる値 |
|---|---|
| 言語(既定) | English (United States)。日本語は翻訳として追加する |
| アイテム名 | `GD-Peeker — HTML, Markdown, XML & Text Viewer for Google Drive™`(manifest と同じ、63 文字) |
| 概要(132 文字以内) | `Render .html, .md, .txt and .xml files from Google Drive™ in a new tab. No server, no sign-in, nothing leaves your browser.` |
| 説明 | [store-listing.md](store-listing.md) の「Store Description (English)」をそのまま貼る |
| カテゴリ | **Workflow & Planning**(代替候補: Tools)。Drive のファイルを読む作業の道具という位置づけ |
| アイコン | zip 内の 128x128 がそのまま使われる |
| スクリーンショット | `dist/store/screenshot-1-html.png` … `screenshot-5-settings.png`(1280x800、この順) |
| 小さいプロモタイル | `dist/store/promo-small-440x280.png` |
| マーキープロモタイル | `dist/store/promo-marquee-1400x560.png`(任意。おすすめ掲載の候補に必要) |
| ホームページ URL | `https://github.com/d3j/gd-peeker` |
| サポート URL | `https://github.com/d3j/gd-peeker/issues` |

日本語の翻訳を足す場合は「言語を追加 → 日本語」で、名前は同じ、説明は store-listing.md の「ストア説明文(日本語)」。

スクリーンショットの並びと内容(store-listing.md の一覧と同じ):

1. Drive の HTML(通知バーを出したまま。スクリプトは隔離されて動く)
2. Markdown(見出し・表・タスクリスト・ハイライト・Mermaid・TOC)
3. Shift_JIS の日本語テキスト(ツールバーに `Shift_JIS (auto)`)
4. XML(整形 + 折りたたみ)
5. 設定画面

## 5. 「プライバシー」タブ

- **単一用途**: store-listing.md の「Single Purpose」を貼る
- **権限の正当化**: store-listing.md の「Permission Justification」から、`storage` / `webRequest` / ホスト権限 3 つをそれぞれ対応する欄に貼る
- **リモートコード**: 「いいえ、リモートコードは使用していません」。理由欄には、サードパーティは `extension/vendor/` に同梱していて CDN 参照が無いこと(`vendor/VERSIONS.md` / `LICENSES.txt` に版とライセンスがある)を書く
- **データ使用**: 収集項目は**すべてチェックしない**。下の 3 つの確認事項(第三者への販売なし / 単一用途に無関係な用途に使わない / 信用調査や融資目的に使わない)にチェック
- **プライバシーポリシー URL**: `https://github.com/d3j/gd-peeker/blob/main/PRIVACY.md`
  (リポジトリは public。非公開に変える場合はホスティング先を先に用意する)

## 6. 「配布」タブ

- 公開範囲: **限定公開(リンクを知っている人)**(2026-09-10 千田の判断)。§9 の未確認項目を実際のユーザーで踏む前に確かめたいため。問題が無ければダッシュボードから一般公開に切り替える(切り替えにも審査が入る)
- 地域: すべての地域
- 価格: 無料

## 7. 提出

「審査のために送信」。審査は数日〜2 週間程度で、`webRequest` とホスト権限があるぶん長くなることがある。
差し戻しの通知は §2 で登録した連絡先メールに来る。よくある差し戻しの理由と、この拡張での状態:

- 権限が過剰 → §5 の正当化で説明。`webRequest` は観測のみで blocking しない(SPEC §3.1 の 2 パターンだけ)
- リモートコード → 無し(`vendor/` に同梱)
- プライバシーポリシーが無い / 権限と対応していない → PRIVACY.md に「収集しない・送信しない・保存しない」を明記済み
- 商標の使用 → 名前は `for Google Drive™` の形。ブランディングガイドラインに沿っている(README「名前の由来」)

## 8. 決まっていること / 残っていること

決定(2026-09-10 千田):

- 公開範囲は**限定公開**から始める
- 登録は **gmail の個人アカウント**
- `v0.1.0` タグは打って push 済み

残り(千田の作業):

- [ ] 開発者登録(5 USD)と連絡先メールの検証(§2)
- [ ] 登録したアカウントと連絡先を §2 に追記
- [ ] §3〜§7 の入力と提出

## 9. 未確認のまま出すことになる項目

[tasks.md](tasks.md) の「実機確認」に残っている、審査には出せるが自分では未確認のもの:

- 共有された他人のファイル(閲覧権限のみ)で本文が取れるか
- Workspace アカウントと gmail アカウントの併用(`authuser` が複数ある状態)での挙動
- `drivefetch` のどの段で成功したかの記録と docs/usage.md への反映
