# NAIS — News on AI for Science

理論研究者のためのAIニュース掲示板

理論・計算物性の研究者向けに、AIニュースを週1回厳選して届ける静的Webアプリです（GitHub Pages）。

- 公開URL: https://snvielfalt.github.io/ai-news-board/
- スマホではブラウザの共有メニューから「ホーム画面に追加」するとアプリのように使えます。

## ファイル構成

| ファイル | 役割 | よく変える？ |
|---|---|---|
| `config.json` | サイト名、タグ（アイコン・名前・色）、メモ方式の設定 | ○ |
| `issues/index.json` | 号の一覧（**新しい号を先頭に**） | ○（毎週） |
| `issues/<号ID>.json` | 1号分の記事 | ○（毎週） |
| `assets/app.js` | 表示ロジック | まれ |
| `assets/style.css` | 見た目 | まれ |
| `CLAUDE.md` | 週次更新を自動で行うときの手順書 | まれ |

ビルド作業はありません。ファイルを直して `main` に push すれば1〜2分で反映されます。

## よくある変更

- **タグを増やす・名前を変える**：`config.json` の `tags` に1項目足す／書き換える。記事側の `tags` 配列にそのキーを書けば表示されます。
- **メモ方式を変える**：`config.json` の `memo.provider` を変更（現在 `giscus`／`none`）。別の方式を足すときは `assets/app.js` の `MEMO_PROVIDERS` に1つ追加。

## 記事データの形

```json
{
  "id": "a1",
  "cat": "研究のやり方",
  "date": "2026-11-04",
  "title": "見出し",
  "summary": "要約（2〜3文）",
  "detail": "補足（任意）",
  "implication": "理論研究者にとっての意味（1〜2文）",
  "tags": ["tool", "short", "career", "discuss"],
  "sources": [{ "name": "出典名", "url": "https://..." }]
}
```

## メモ機能（giscus）の初期設定

メモは GitHub Discussions に保存され、閲覧者は GitHub アカウントでログインして書き込みます。

1. リポジトリの Settings → General → Features で **Discussions** をオンにする。
2. Discussions に **Memos** というカテゴリを作る（形式は Announcement 推奨：新規スレッドは管理者とgiscusのみ作成）。
3. https://github.com/apps/giscus から giscus アプリをこのリポジトリにインストール。
4. https://giscus.app/ja でリポジトリ名を入れ、表示される `data-repo-id` と `data-category-id` を `config.json` の `memo.giscus.repoId` / `categoryId` に貼る。

## 見た目を変えたとき
`assets/style.css` や `assets/app.js` を変えたら、`index.html` の `?v=...` の値も変えてください（例：`?v=20261120-1`）。スマホが古いファイルを使い続けるのを防ぎます。

## リアクションを全員で集計する（Supabase・無料）
初期設定では、リアクションはその端末だけに保存されます。全員の数を集計するには：
1. https://supabase.com で無料プロジェクトを作る。
2. SQL Editor に `tools/reactions.sql` の中身を貼って実行する。
3. Project Settings → API の「Project URL」と「anon public」キーを `config.json` の `reactions.supabase.url` / `anonKey` に入れ、`reactions.provider` を `"supabase"` にする。
anon キーは公開して問題ない鍵です（テーブルには直接触れず、用意した関数だけを呼べる設定にしてあります）。

## 新しい号の通知（Web Push）とアイコンの印
- 読者がヘッダーの「新しい号を通知」を押すと、登録が Supabase（`tools/push.sql`）に保存されます。iPhone はホーム画面に追加したアプリからのみ登録できます。
- `issues/index.json` に新しい号が加わると、`.github/workflows/notify.yml` が `tools/notify.mjs` で通知を送ります。アイコンの印は通知と一緒に付き、アプリを開くと消えます。
- GitHub の Secrets に `VAPID_PRIVATE_KEY` と `PUSH_ADMIN_TOKEN` が必要です。公開鍵は `config.json` の `push.vapidPublicKey`。
