# 日刊お試し版の手順（Claude 向け）

`daily/` は週1の本編とは別の、日刊のお試し版です。**本編（リポジトリ直下の `issues/`・`config.json`・`index.html`・`feed.xml`・`audio/`）と `assets/` には触らないこと。**
書き方・誤情報を防ぐルール・ラジオの口調や読みの規則は、リポジトリ直下の `CLAUDE.md` に従う。違うのは下の点だけ。

## 本編との違い
- **分野**：AIに加えて、**物理全般**（実験・理論・計算。物性、量子、光、宇宙・素粒子、計測、装置など）。AIを使っていない物理のニュースも載せてよい。
- **カテゴリ**：`daily/config.json` の `categories` から選ぶ。AIを使わない物理のニュースは `物理の研究`。
- **対象期間**：前の号の `published` の翌日〜今日（初回や週明けは数日分になる）。本編の直近の号（`issues/index.json` の先頭）と同じ話題は載せない。
- **本数**：3〜4本。うち1本を「今日の注目」(`leadId`) にする。無理に埋めない。良いニュースが2本しかなければ2本でよい。
- **`detail`**：`summary` の2〜3倍（目安300〜500字）。
- **号のファイル**：`daily/issues/<YYYY-MM-DD>.json`（`id` も同じ日付）。`title` は「M月D日（曜）　<注目の見出しを短く>」。`period` は「YYYY年M月D日〜D日」。
- **index**：`daily/issues/index.json` の `issues` の先頭に `{ "id": "YYYY-MM-DD", "label": "M/D", "published": "YYYY-MM-DD" }` を追加し、`updated` を今日にする。`audio` 欄には触らない。
- **検証**：事実台帳 `daily/issues/<id>.facts.json` とチェッカー（`python3 tools/check_issue.py daily/issues/<id>.json`）は全記事で必須。別エージェントによる検証は、使用量を抑えるため**「今日の注目」の1本だけ**に絞る（依頼文は `CLAUDE.md` と同じで、対象の記事IDを指定する）。
- **ラジオ**：`daily/issues/<id>.radio.json`。セリフ合計 **600〜850字（約2〜3分）**。構成：あいさつ → 今日の注目（聞き手の素朴な質問と、理論・計算の研究者から見た感想を1往復）→ 残りを1〜2文ずつ → 一言まとめ → クレジット「音声は、ボイスボックスの、四国めたんと、ずんだもんでお送りしました。」。音声はpush後に `.github/workflows/radio-daily.yml` が作る。
- **通知は送らない**（お試し版は通知の対象外）。
- **コミットメッセージ**：`日刊お試し M/D を追加`。
