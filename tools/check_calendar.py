"""締切カレンダー calendar.json の点検。使い方: python3 tools/check_calendar.py [calendar.json]
- 各予定に date（YYYY-MM-DD）・kind・title・url・checked（確認した日）があること
- url は一次情報（主催者・募集元のページ）であること（人が確かめる。ここでは形式だけ）
- 過ぎた予定は警告（次の更新で消す）
"""
import datetime as dt, json, sys
from pathlib import Path

KINDS = {"締切", "開催", "公募締切", "参加登録締切"}


def main(path="calendar.json"):
    cal = json.loads(Path(path).read_text(encoding="utf-8"))
    errors, warns, today = [], [], dt.date.today()
    seen = set()
    for e in cal.get("events", []):
        tag = f"[{e.get('id')}] {str(e.get('title', ''))[:30]}"
        if e.get("id") in seen:
            errors.append(f"{tag}: id が重複")
        seen.add(e.get("id"))
        for k in ("id", "date", "kind", "title", "url", "checked"):
            if not e.get(k):
                errors.append(f"{tag}: {k} がない")
        if e.get("kind") and e["kind"] not in KINDS:
            errors.append(f"{tag}: kind は {sorted(KINDS)} のいずれか")
        for k in ("date", "checked"):
            try:
                d = dt.date.fromisoformat(str(e.get(k, "")))
                if k == "date" and d < today:
                    warns.append(f"{tag}: {d} は過ぎた予定（次の更新で消す）")
            except ValueError:
                errors.append(f"{tag}: {k} が YYYY-MM-DD 形式でない")
        if not str(e.get("url", "")).startswith("https://"):
            errors.append(f"{tag}: url は https:// で始まる主催者のページ")
    for w in warns:
        print("警告:", w)
    for x in errors:
        print("エラー:", x)
    print(f"\ncalendar: {len(cal.get('events', []))} 件、エラー {len(errors)} 件、警告 {len(warns)} 件")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:2]))
