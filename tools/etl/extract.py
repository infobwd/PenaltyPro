#!/usr/bin/env python3
"""
ดึงทุกแท็บจาก Google Sheet เดิมลงเป็น CSV ใน db/seed/raw/

    python tools/etl/extract.py --out db/seed/raw

ต้องให้ชีตเปิดแชร์แบบ "ทุกคนที่มีลิงก์" ระหว่างดึงเท่านั้น
**ดึงเสร็จแล้วให้ปิดการแชร์ทันที** — ในชีตมีรหัสผ่าน เบอร์โทร เลขผู้เสียภาษี
และที่อยู่ผู้บริจาค ซึ่งตอนนี้ใครมีลิงก์ก็อ่านได้

ไฟล์ที่ได้ลงใน db/seed/ ซึ่งอยู่ใน .gitignore — ห้าม commit
"""
from __future__ import annotations

import argparse
import csv
import io
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

SHEET_ID = "17JNCutwHvFMV8BwMfyS8t_kGyyRDXmLPqbJfrkxo_BA"

# ชื่อแท็บทั้งหมดที่ Code.js อ้างถึง — เรียงตามลำดับที่ใช้ตอน import
TABS = [
    "Tournaments",
    "Schools",
    "Teams",
    "Players",
    "Matches",
    "Kicks",
    "MatchEvents",
    "Users",
    "Config",
    "News",
    "Donations",
    "Predictions",
    "Contests",
    "ContestEntries",
    "ContestComments",
    "Sponsors",
    "MusicTracks",
    "TickerMessages",
]

# ⚠️ ห้ามใช้ gviz/tq (https://.../gviz/tq?tqx=out:csv&sheet=NAME)
#
# gviz "เดาชนิดข้อมูล" ของแต่ละคอลัมน์ก่อนส่งออก แล้วทำข้อมูลหายแบบเงียบ ๆ
# สองแบบ ซึ่งเจอจริงกับชีตนี้:
#
#   1. คอลัมน์ที่มีทั้งข้อความและตัวเลขปนกัน (Schools.id มีทั้ง "S001" และ
#      71020006) -> gviz กลืน 5 แถวแรกเข้าไปเป็น "ชื่อคอลัมน์" หายไปจากข้อมูล
#   2. ใส่ &headers=0 เพื่อแก้ข้อ 1 -> gviz ตีคอลัมน์นั้นเป็น numeric แล้วคืน
#      ค่าว่างให้ทุกแถวที่เป็นข้อความ ("S001" หายหมด)
#
# /export?format=csv&gid=... คือปลายทางเดียวกับ ไฟล์ > ดาวน์โหลด > .csv
# ส่งข้อมูลดิบตามที่เห็นในชีต ไม่เดา type ไม่ยุ่งกับหัวตาราง
EXPORT_URL = (
    "https://docs.google.com/spreadsheets/d/{sid}/export?format=csv&gid={gid}"
)

# ดึงอัตโนมัติจากหน้า htmlview — ปักไว้ตรงนี้เพื่อให้ทำงานได้แม้ชีตถูกปิดแชร์แล้ว
GIDS = {
    "Tournaments":     "182159796",
    "Schools":         "518824030",
    "Teams":           "1483591806",
    "Players":         "1922340939",
    "Matches":         "1487274722",
    "Kicks":           "1932499899",
    "MatchEvents":     "2036554800",
    "Users":           "100836994",
    "Config":          "1030857895",
    "News":            "1673427885",
    "Donations":       "1546747653",
    "Predictions":     "2069274650",
    "Contests":        "528161162",
    "ContestEntries":  "1218464775",
    "ContestComments": "540627745",
    "Sponsors":        "1183294491",
    "MusicTracks":     "407201495",
    "TickerMessages":  "572583258",
}


def normalize_thai(s: str) -> str:
    """
    รวมรูปเขียนภาษาไทยให้เป็นแบบเดียว (NFC) ก่อนบันทึกลง CSV

    ตรวจแล้ว (11 ส.ค. 2569): ข้อมูลดิบชุดปัจจุบันเป็น NFC อยู่แล้วทั้งหมด และชื่อทีม
    ใน Matches จับคู่กับ Teams ได้ครบ 31/31 โดยไม่ต้องพึ่งฟังก์ชันนี้

    เก็บไว้เป็นประกันเพราะต้นทุนเป็นศูนย์ และกันกรณีมีคนแก้ชีตด้วยมือในอนาคต:
    "ำ" เขียนได้สองแบบคือ U+0E33 กับ U+0E4D + U+0E32 ซึ่งตาเปล่ามองไม่เห็น
    ความต่าง แต่เทียบสตริงแล้วไม่เท่ากัน ถ้าหลุดเข้ามาจะทำให้ transform.py
    จับคู่ matches.TeamA -> team_id พลาดแล้วทิ้งนัดของทีมนั้นโดยไม่มีใครรู้
    """
    return unicodedata.normalize("NFC", s)


def fetch_tab(tab: str, sheet_id: str, retries: int = 3) -> str | None:
    gid = GIDS.get(tab)
    if gid is None:
        print(f"  !! {tab}: ไม่รู้ gid — ดูวิธีหาใน docstring", file=sys.stderr)
        return None
    url = EXPORT_URL.format(sid=sheet_id, gid=gid)
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "penaltypro-etl/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"HTTP {resp.status}")
                return resp.read().decode("utf-8")
        except Exception as e:  # noqa: BLE001 — รายงานแล้วไปแท็บถัดไป
            if attempt == retries:
                print(f"  !! {tab}: ดึงไม่สำเร็จ ({e})", file=sys.stderr)
                return None
            time.sleep(2 * attempt)
    return None


def main() -> int:
    # console ของ Windows ไทยเป็น cp874 ซึ่ง encode อีโมจิ/ข้อความบางตัวไม่ได้
    # แล้วสคริปต์จะตายตอน print ทั้งที่ดึงไฟล์ครบแล้ว
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="db/seed/raw", help="โฟลเดอร์ปลายทาง")
    ap.add_argument("--sheet-id", default=SHEET_ID)
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"ดึงจากชีต {args.sheet_id}")
    print(f"ลงที่ {out_dir.resolve()}\n")

    total_rows = 0
    failed: list[str] = []

    for tab in TABS:
        raw = fetch_tab(tab, args.sheet_id)
        if raw is None:
            failed.append(tab)
            continue

        rows = list(csv.reader(io.StringIO(raw)))
        rows = [[normalize_thai(c) for c in row] for row in rows]

        dest = out_dir / f"{tab}.csv"
        with dest.open("w", encoding="utf-8", newline="") as fh:
            csv.writer(fh).writerows(rows)

        data_rows = max(0, len(rows) - 1)
        total_rows += data_rows
        print(f"  {tab:<18} {data_rows:>6} แถว")

    print(f"\nรวม {total_rows} แถว จาก {len(TABS) - len(failed)}/{len(TABS)} แท็บ")

    if failed:
        print(f"\n!! ดึงไม่สำเร็จ: {', '.join(failed)}", file=sys.stderr)
        print("   แท็บที่ชื่อไม่ตรงจะดึงไม่ได้ — ตรวจชื่อแท็บในชีตอีกครั้ง", file=sys.stderr)

    print(
        "\n⚠️  ดึงเสร็จแล้ว — ปิดการแชร์ชีตได้เลย\n"
        "    (ในชีตมีรหัสผ่าน เบอร์โทร เลขผู้เสียภาษี และที่อยู่ผู้บริจาค)"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
