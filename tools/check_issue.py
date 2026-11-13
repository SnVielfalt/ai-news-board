#!/usr/bin/env python3
"""号の誤情報チェック（機械で拾える範囲）。

  python3 tools/check_issue.py issues/<号ID>.json

調べること:
  1. 出典：各記事に、一次情報か報道の出典があるか（まとめサイトだけは不可）
  2. 数字：見出し・要約・詳細・図・日付に出てくる数字が、事実台帳（issues/<号ID>.facts.json）に
     出典付きで記録されているか
  3. 比較・断定の表現（値下げ・初・最大・倍 など）：台帳に、その表現そのものを裏付ける記録があるか
  4. 台帳の出典URLが、その記事の sources に入っているか
  5. 自己申告：台帳で selfReport: true とした記録（企業などの自社性能の主張）がある記事に「同社」等の明記があるか
  6. 日付：記事の日付が対象期間（前号の翌日〜発行日）から大きく外れていないか（警告のみ）
エラーが1つでもあれば終了コード1。
"""
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# primary: 当事者の一次発表（論文、企業・大学・行政機関の公式発表）／news: 報道機関の記事／aggregator: まとめサイト・ニュースレター
GOOD_TYPES = {"primary", "news"}
ALL_TYPES = GOOD_TYPES | {"aggregator"}
# 裏付けが要る比較・断定の表現
STRONG_WORDS = ["値下げ", "値上げ", "初めて", "初の", "世界初", "史上", "最大", "最高", "最良", "最も", "唯一", "倍", "上回", "下回", "抜いた"]
NUM_RE = re.compile(r"\d+(?:[,，]\d{3})*(?:\.\d+)?")


def norm_nums(text):
    text = re.sub(r"\(\d\)", " ", str(text))           # (1)〜(9) の箇条番号は除く
    out = set()
    for m in NUM_RE.findall(text):
        v = m.replace(",", "").replace("，", "")
        v = v.lstrip("0") or "0"
        if "." in v:
            v = v.rstrip("0").rstrip(".")
        out.add(v)
    return out


def texts_of(item):
    parts = [item.get("title", ""), item.get("summary", ""), item.get("detail", ""), item.get("date", "")]
    vis = item.get("visual")
    for v in (vis if isinstance(vis, list) else [vis] if vis else []):
        parts += [v.get("headline", ""), v.get("title", ""), v.get("note", "")]
        for x in v.get("items", []):
            parts += [str(x.get("value", "")), x.get("label", ""), x.get("note", "")]
    return "\n".join(map(str, parts))


def main(path):
    issue_path = Path(path)
    issue = json.loads(issue_path.read_text(encoding="utf-8"))
    facts_path = issue_path.with_name(issue_path.stem + ".facts.json")
    errors, warns = [], []
    if not facts_path.exists():
        print(f"エラー: 事実台帳 {facts_path.name} がありません")
        return 1
    facts = json.loads(facts_path.read_text(encoding="utf-8"))
    by_item = {}
    for c in facts.get("claims", []):
        by_item.setdefault(c.get("item"), []).append(c)

    # 対象期間（前号の翌日〜発行日）
    index = json.loads((ROOT / "issues" / "index.json").read_text(encoding="utf-8"))
    ids = [i["id"] for i in index.get("issues", [])]
    pub = dt.date.fromisoformat(issue["published"])
    start = pub - dt.timedelta(days=14)
    if issue["id"] in ids:
        k = ids.index(issue["id"])
        if k + 1 < len(ids):
            start = dt.date.fromisoformat(index["issues"][k + 1]["published"]) + dt.timedelta(days=1)

    for it in issue.get("items", []):
        iid = it.get("id")
        tag = f"[{iid}] {it.get('title', '')[:28]}"
        srcs = it.get("sources", [])
        urls = {s.get("url") for s in srcs}
        types = [s.get("type") for s in srcs]
        # 1. 出典
        for s in srcs:
            if s.get("type") not in ALL_TYPES:
                errors.append(f"{tag}: 出典「{s.get('name')}」の type が未設定か不正（{sorted(ALL_TYPES)} のいずれか）")
        if not any(t in GOOD_TYPES for t in types):
            errors.append(f"{tag}: 一次情報か報道の出典がない（まとめサイトだけでは不可）")
        claims = by_item.get(iid, [])
        if not claims:
            errors.append(f"{tag}: 事実台帳に記録がない")
            continue
        # 4. 台帳の出典
        for c in claims:
            if c.get("source") not in urls:
                errors.append(f"{tag}: 台帳の記録「{c.get('claim', '')[:24]}」の出典URLが記事の sources にない")
            if not c.get("evidence"):
                errors.append(f"{tag}: 台帳の記録「{c.get('claim', '')[:24]}」に evidence（出典のどこに書いてあるか）がない")
        # 2. 数字
        known = set()
        for c in claims:
            known |= norm_nums(c.get("claim", ""))
            for v in c.get("values", []):
                known |= norm_nums(v)
        missing = sorted(norm_nums(texts_of(it)) - known, key=lambda x: (len(x), x))
        if missing:
            errors.append(f"{tag}: 台帳にない数字 → {', '.join(missing)}")
        # 3. 比較・断定の表現
        body = texts_of(it)
        claim_text = "\n".join(c.get("claim", "") for c in claims)
        for w in STRONG_WORDS:
            if w in body and w not in claim_text:
                errors.append(f"{tag}: 「{w}」を裏付ける台帳の記録がない（台帳の claim に同じ表現で、何と比べてかを書く）")
        # 5. 自己申告
        if any(c.get("selfReport") for c in claims):
            body2 = it.get("summary", "") + it.get("detail", "")
            if not any(w in body2 for w in ["同社", "発表ベース", "自己申告", "著者ら"]):
                errors.append(f"{tag}: 自己申告の数字を使っているのに、要約か詳細に「同社の発表」等の明記がない")
        # 6. 日付：記事の date は台帳に同じ日付（YYYY-MM-DD）で記録されていること
        if it.get("date") and not any(it["date"] in map(str, c.get("values", [])) for c in claims):
            errors.append(f"{tag}: 記事の日付 {it.get('date')} が台帳に記録されていない（出典で確認した日付を values に YYYY-MM-DD で入れる）")
        try:
            d = dt.date.fromisoformat(it.get("date", ""))
            if d > pub:
                errors.append(f"{tag}: 日付 {d} が発行日 {pub} より後")
            elif d < start - dt.timedelta(days=7):
                warns.append(f"{tag}: 日付 {d} が対象期間（{start}〜{pub}）より1週間以上前。新しいニュースか確認")
        except ValueError:
            errors.append(f"{tag}: date が YYYY-MM-DD 形式でない")

    for w in warns:
        print("警告:", w)
    for e in errors:
        print("エラー:", e)
    print(f"\n{issue['id']}: エラー {len(errors)} 件、警告 {len(warns)} 件")
    return 1 if errors else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
