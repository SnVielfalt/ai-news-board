#!/usr/bin/env python3
"""ラジオ台本（issues/<id>.radio.json）から VOICEVOX で MP3 を作り、
issues/index.json に音声情報を書き込み、ポッドキャスト用 feed.xml を作り直す。

GitHub Actions（.github/workflows/radio.yml）から呼ばれる想定。手元でも
VOICEVOX エンジンを localhost:50021 で起動しておけば同じように動く。

  python3 tools/make_audio.py [--engine http://localhost:50021] [--force]
"""
import argparse
import datetime as dt
import email.utils
import hashlib
import io
import json
import re
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path
from xml.sax.saxutils import escape

import requests

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config.json"
INDEX = ROOT / "issues" / "index.json"
AUDIO_DIR = ROOT / "audio"
FEED = ROOT / "feed.xml"


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def dump(p, data):
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def wait_engine(base, timeout=180):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if requests.get(f"{base}/version", timeout=5).ok:
                return
        except requests.RequestException:
            pass
        time.sleep(3)
    sys.exit("VOICEVOX エンジンに接続できませんでした: " + base)


def resolve_speakers(base, hosts):
    """config の {name, style} を VOICEVOX の style id に変換する。"""
    speakers = requests.get(f"{base}/speakers", timeout=30).json()
    ids = {}
    for key, h in hosts.items():
        found = None
        for sp in speakers:
            if sp["name"] == h["name"]:
                for st in sp["styles"]:
                    if st["name"] == h.get("style", "ノーマル"):
                        found = st["id"]
                if found is None and sp["styles"]:
                    found = sp["styles"][0]["id"]
        if found is None:
            sys.exit(f"話者が見つかりません: {h['name']}（{h.get('style')}）")
        ids[key] = found
    return ids


def split_text(t, limit=120):
    """長いセリフは句点で区切って合成する（エンジンの負荷と不自然な間を避ける）。"""
    t = t.strip()
    if len(t) <= limit:
        return [t]
    parts, buf = [], ""
    for seg in re.split(r"(?<=[。！？!?])", t):
        if buf and len(buf) + len(seg) > limit:
            parts.append(buf)
            buf = ""
        buf += seg
    if buf:
        parts.append(buf)
    return [p for p in parts if p.strip()]


def synth(base, text, speaker, speed):
    q = requests.post(f"{base}/audio_query", params={"text": text, "speaker": speaker}, timeout=120)
    q.raise_for_status()
    query = q.json()
    query["speedScale"] = speed
    query["prePhonemeLength"] = 0.05
    query["postPhonemeLength"] = 0.05
    query["outputSamplingRate"] = 24000
    query["outputStereo"] = False
    r = requests.post(f"{base}/synthesis", params={"speaker": speaker}, json=query, timeout=300)
    r.raise_for_status()
    return r.content


def build_wav(base, script, ids, rcfg, out_path):
    speed = float(rcfg.get("speedScale", 1.0))
    p_same = float(rcfg.get("pauseSameSpeaker", 0.3))
    p_change = float(rcfg.get("pauseChangeSpeaker", 0.45))
    params = None
    frames = []
    prev = None
    for i, line in enumerate(script["lines"]):
        s, t = line.get("s"), str(line.get("t", ""))
        if s not in ids or not t.strip():
            continue
        for chunk in split_text(t):
            data = synth(base, chunk, ids[s], speed)
            with wave.open(io.BytesIO(data)) as w:
                if params is None:
                    params = w.getparams()
                if prev is not None:
                    gap = p_same if prev == s else p_change
                    frames.append(b"\x00" * int(params.framerate * gap) * params.sampwidth * params.nchannels)
                frames.append(w.readframes(w.getnframes()))
                prev = s
        print(f"  {i + 1}/{len(script['lines'])}", flush=True)
    if params is None:
        raise SystemExit("台本にセリフがありません")
    with wave.open(str(out_path), "wb") as w:
        w.setparams(params)
        for f in frames:
            w.writeframes(f)


def encode_mp3(wav_path, mp3_path, title, artist):
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path),
        "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "64k",
        "-metadata", f"title={title}", "-metadata", f"artist={artist}",
        str(mp3_path)], check=True)
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", str(mp3_path)], capture_output=True, text=True, check=True)
    return round(float(out.stdout.strip()))


def rfc822(date_str):
    d = dt.datetime.strptime(date_str, "%Y-%m-%d").replace(hour=7, tzinfo=dt.timezone(dt.timedelta(hours=9)))
    return email.utils.format_datetime(d)


def build_feed(cfg, index):
    pc = cfg["radio"]["podcast"]
    site = pc["siteUrl"].rstrip("/") + "/"
    items = []
    for meta in index.get("issues", []):
        a = meta.get("audio")
        if not a:
            continue
        issue_path = ROOT / "issues" / f"{meta['id']}.json"
        issue = load(issue_path) if issue_path.exists() else {}
        title = issue.get("title") or meta.get("label") or meta["id"]
        desc = (issue.get("editorNote") or "") + f"\n\n記事一覧: {site}#{meta['id']}\n{cfg['radio'].get('credit', '')}"
        items.append(f"""    <item>
      <title>{escape(title)}</title>
      <description>{escape(desc)}</description>
      <link>{escape(site + '#' + meta['id'])}</link>
      <guid isPermaLink="false">{escape(meta['id'])}</guid>
      <pubDate>{rfc822(meta['published'])}</pubDate>
      <enclosure url="{escape(site + a['src'])}" length="{a['bytes']}" type="audio/mpeg"/>
      <itunes:duration>{a['duration']}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>""")
    feed = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{escape(pc['title'])}</title>
    <link>{escape(site)}</link>
    <atom:link href="{escape(site + 'feed.xml')}" rel="self" type="application/rss+xml"/>
    <language>{escape(pc.get('language', 'ja'))}</language>
    <description>{escape(pc['description'])}</description>
    <itunes:author>{escape(pc['author'])}</itunes:author>
    <itunes:summary>{escape(pc['description'])}</itunes:summary>
    <itunes:image href="{escape(site + pc['image'])}"/>
    <itunes:category text="{escape(pc.get('category', 'Science'))}"/>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
{chr(10).join(items)}
  </channel>
</rss>
"""
    FEED.write_text(feed, encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default="http://localhost:50021")
    ap.add_argument("--force", action="store_true", help="既存の音声も作り直す")
    ap.add_argument("--feed-only", action="store_true")
    args = ap.parse_args()

    cfg = load(CONFIG)
    rcfg = cfg.get("radio", {})
    index = load(INDEX)
    AUDIO_DIR.mkdir(exist_ok=True)

    todo = []
    for meta in index.get("issues", []):
        sp = ROOT / "issues" / f"{meta['id']}.radio.json"
        if not sp.exists():
            continue
        h = hashlib.sha256(sp.read_bytes() + json.dumps(rcfg, sort_keys=True).encode()).hexdigest()[:16]
        mp3 = AUDIO_DIR / f"{meta['id']}.mp3"
        if args.force or not mp3.exists() or (meta.get("audio") or {}).get("hash") != h:
            todo.append((meta, sp, mp3, h))

    if todo and not args.feed_only:
        if not rcfg.get("enabled", True):
            print("radio.enabled が false のため音声生成をスキップ")
        else:
            wait_engine(args.engine)
            ids = resolve_speakers(args.engine, rcfg["hosts"])
            for meta, sp, mp3, h in todo:
                print(f"合成中: {meta['id']}", flush=True)
                script = load(sp)
                with tempfile.TemporaryDirectory() as td:
                    wav = Path(td) / "out.wav"
                    build_wav(args.engine, script, ids, rcfg, wav)
                    title = script.get("title") or meta.get("label") or meta["id"]
                    dur = encode_mp3(wav, mp3, title, rcfg.get("podcast", {}).get("title", ""))
                meta["audio"] = {"src": f"audio/{meta['id']}.mp3", "duration": dur, "bytes": mp3.stat().st_size, "hash": h}
                print(f"  → {mp3.name} {dur}秒", flush=True)
            dump(INDEX, index)

    if rcfg.get("podcast"):
        build_feed(cfg, index)
        print("feed.xml を更新しました")


if __name__ == "__main__":
    main()
