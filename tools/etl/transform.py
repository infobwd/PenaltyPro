#!/usr/bin/env python3
"""
แปลง CSV ดิบใน db/seed/raw/ -> db/seed/02-seed.sql พร้อมรายงานการแปลง

    python tools/etl/transform.py --raw db/seed/raw \\
        --out db/seed/02-seed.sql --report db/seed/etl-report.md

หลักการ
  1. ไม่อ่านชื่อคอลัมน์จากไฟล์ — ใช้ LAYOUT ที่ประกาศไว้ในสคริปต์ เพราะชีตเดิม
     มีคอลัมน์ที่หัวตารางว่าง (Config 16-23) ซึ่งอ่านตามชื่อไม่ได้
  2. ทุกแถวที่แปลงไม่ได้ต้องถูก "รายงาน" ไม่ใช่ทิ้งเงียบ
  3. ไม่เขียนรหัสผ่าน plaintext ลง SQL เด็ดขาด — bcrypt เสมอ
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import secrets
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt

TH = timezone(timedelta(hours=7))

# --- ตำแหน่งคอลัมน์ (0-based) ตามที่ Code.js เขียนลงชีต -------------------
# Config มีคอลัมน์ 16-23 ที่ "หัวตารางว่าง" จึงต้องอ้างด้วยตำแหน่งเท่านั้น
CONFIG_LAYOUT = {
    "competition_name": 0, "competition_logo": 1, "bank_name": 2,
    "bank_account": 3, "account_name": 4, "location_name": 5,
    "location_link": 6, "announcement": 7, "admin_pin": 8,
    "location_lat": 9, "location_lng": 10, "registration_fee": 11,
    "fundraising_goal": 12, "objective_title": 13, "objective_description": 14,
    "objective_image_url": 15,
    "liff_id": 16, "pwa_start_url": 17, "pwa_scope": 18,
    "coffee_support_phone": 19, "education_support_qr_url": 20,
    "education_support_account_name": 21, "education_support_bank_name": 22,
    "education_support_account_number": 23,
}

# ค่าที่ห้ามส่งออกให้ client ที่ไม่ใช่แอดมิน
NON_PUBLIC_SETTINGS = {"admin_pin"}

# ชื่อทีมที่เป็นโรงเรียนเดิมแต่ตั้งชื่อต่างไป — ระบุด้วยมือดีกว่าเดาด้วย regex
# เพราะเดาผิดแล้วทีมไปผูกโรงเรียนผิดโดยไม่มีใครเห็น
SCHOOL_ALIASES = {
    "บ้านวังด้ง FC": "บ้านวังด้ง",
}

report_lines: list[str] = []
warnings: list[str] = []
# นับคำเตือนซ้ำ ๆ แบบรวมกลุ่ม แทนที่จะพ่นทีละบรรทัดจนอ่านไม่ออก
orphans: dict[str, list[str]] = {}


def note(msg: str) -> None:
    report_lines.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)
    report_lines.append(f"- ⚠️ {msg}")


def orphan(table: str, detail: str) -> None:
    """แถวที่อ้างถึงของที่ไม่มีอยู่ — รวมกลุ่มไว้รายงานทีเดียว"""
    orphans.setdefault(table, []).append(detail)


# --- helper ---------------------------------------------------------------

def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", (s or "").strip())


def sq(v) -> str:
    """escape ค่าเป็น SQL literal"""
    if v is None or v == "":
        return "NULL"
    s = str(v)
    s = (s.replace("\\", "\\\\").replace("'", "\\'")
          .replace("\n", "\\n").replace("\r", "\\r"))
    return f"'{s}'"


def sq_str(v) -> str:
    """เหมือน sq แต่ค่าว่างเป็น '' ไม่ใช่ NULL (สำหรับคอลัมน์ NOT NULL DEFAULT '')"""
    if v is None:
        return "''"
    s = str(v)
    s = (s.replace("\\", "\\\\").replace("'", "\\'")
          .replace("\n", "\\n").replace("\r", "\\r"))
    return f"'{s}'"


def num(v, default="0"):
    s = str(v or "").strip().replace(",", "")
    if s == "":
        return default
    try:
        f = float(s)
        return str(int(f)) if f.is_integer() else str(f)
    except ValueError:
        return default


def dt(v) -> str:
    """
    ISO/รูปแบบต่าง ๆ -> 'YYYY-MM-DD HH:MM:SS' เวลาไทย

    ชีตเก็บเป็น ISO ลงท้าย Z (UTC) ถ้า import ตรง ๆ เวลาจะเพี้ยนไป 7 ชม.
    ซึ่งทำให้ "นัดเวลา 13:00" กลายเป็น 06:00 บนตารางแข่ง
    """
    s = str(v or "").strip()
    if not s:
        return "NULL"
    try:
        if s.endswith("Z"):
            d = datetime.fromisoformat(s[:-1]).replace(tzinfo=timezone.utc)
        else:
            d = datetime.fromisoformat(s)
            if d.tzinfo is None:
                d = d.replace(tzinfo=TH)
        return f"'{d.astimezone(TH).strftime('%Y-%m-%d %H:%M:%S')}'"
    except ValueError:
        pass
    # timestamp มิลลิวินาที (News.timestamp เก็บแบบนี้)
    if re.fullmatch(r"\d{10,13}", s):
        ms = int(s)
        d = datetime.fromtimestamp(ms / (1000 if len(s) > 10 else 1), tz=TH)
        return f"'{d.strftime('%Y-%m-%d %H:%M:%S')}'"
    # dd/mm/yyyy
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        dd, mm, yy = (int(x) for x in m.groups())
        if yy > 2400:            # พ.ศ. -> ค.ศ.
            yy -= 543
        try:
            return f"'{datetime(yy, mm, dd).strftime('%Y-%m-%d %H:%M:%S')}'"
        except ValueError:
            pass
    return "NULL"


def dt_now(v) -> str:
    """
    สำหรับคอลัมน์ NOT NULL อย่าง created_at — ชีตเดิมมีแถวที่ไม่มีวันที่
    (ทีมที่แอดมินเพิ่มเองไม่ผ่านฟอร์มสมัคร) ถ้าปล่อยเป็น NULL จะ import ไม่ผ่าน
    """
    d = dt(v)
    return "NOW()" if d == "NULL" else d


def date_only(v) -> str:
    d = dt(v)
    return "NULL" if d == "NULL" else f"'{d[1:11]}'"


def yn(v) -> str:
    return "1" if str(v or "").strip().upper() in {"TRUE", "1", "YES", "Y"} else "0"


phone_fixed = 0


def phone(raw: str) -> str:
    """
    คืน 0 นำหน้าให้เบอร์ที่หายไป

    Code.js เขียนเบอร์ลงชีตด้วย "'" + เบอร์ เพื่อบังคับให้เป็นข้อความ แต่บางแถว
    (ที่บันทึกก่อนมีโค้ดส่วนนั้น) ถูกเก็บเป็น "ตัวเลข" ทำให้ 0 ตัวหน้าหายไป
    เช่น 0836645989 -> 836645989 ซึ่งโทรไม่ติดและมองผ่าน ๆ ไม่เห็นว่าผิด

    เบอร์มือถือไทยเป็น 10 หลักขึ้นต้น 06/08/09 ⇒ 9 หลักขึ้นต้น 6/8/9 คือเบอร์ที่
    เสีย 0 ไป ส่วนรูปแบบอื่นปล่อยไว้ตามเดิม ไม่เดา
    """
    global phone_fixed
    s = re.sub(r"[^\d]", "", str(raw or ""))
    if len(s) == 9 and s[0] in "689":
        phone_fixed += 1
        return "0" + s
    return s


def split_colors(raw: str) -> tuple[str, str]:
    """
    Color เก็บ 2 แบบปนกัน: '["#2563EB","#835d5d"]' และ '#C60C30'
    """
    s = (raw or "").strip()
    if s.startswith("["):
        try:
            arr = json.loads(s)
            if isinstance(arr, list) and arr:
                a = str(arr[0]).strip() or "#2563EB"
                b = str(arr[1]).strip() if len(arr) > 1 else "#FFFFFF"
                return a, b or "#FFFFFF"
        except (json.JSONDecodeError, TypeError):
            warn(f"Color แปลงไม่ได้ ใช้ค่าตั้งต้นแทน: {s[:40]!r}")
    return (s or "#2563EB"), "#FFFFFF"


def split_scoped_type(raw: str) -> tuple[str, str | None]:
    """'Youtube::default' -> ('Youtube', 'default')  |  'Main' -> ('Main', None)"""
    s = (raw or "").strip()
    if "::" in s:
        a, _, b = s.partition("::")
        return a.strip(), (b.strip() or None)
    return s, None


def read_csv(raw_dir: Path, name: str) -> list[list[str]]:
    p = raw_dir / f"{name}.csv"
    if not p.exists():
        warn(f"ไม่พบไฟล์ {name}.csv — ข้ามตารางนี้")
        return []
    rows = list(csv.reader(p.open(encoding="utf-8")))
    return [[nfc(c) for c in r] for r in rows[1:]]


def get(row: list[str], i: int) -> str:
    return row[i] if len(row) > i else ""


def values_block(table: str, cols: list[str], rows: list[list[str]]) -> str:
    if not rows:
        return f"-- {table}: ไม่มีข้อมูล\n"
    head = f"INSERT INTO {table} ({', '.join(cols)}) VALUES\n"
    body = ",\n".join("  (" + ", ".join(r) + ")" for r in rows)
    return head + body + ";\n"


# --- ตัวแปลงหลัก ----------------------------------------------------------

def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="db/seed/raw")
    ap.add_argument("--out", default="db/seed/02-seed.sql")
    ap.add_argument("--report", default="db/seed/etl-report.md")
    args = ap.parse_args()

    raw = Path(args.raw)
    out_sql: list[str] = []
    counts: dict[str, int] = {}

    out_sql.append(
        "-- สร้างโดย tools/etl/transform.py — อย่าแก้ไฟล์นี้ด้วยมือ\n"
        "-- ข้อมูลจริง: มีเบอร์โทร เลขผู้เสียภาษี ที่อยู่ผู้บริจาค — ห้าม commit\n"
        "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET time_zone = '+07:00';\n"
    )

    note("# รายงานการแปลงข้อมูล Sheets → MySQL\n")
    note(f"สร้างเมื่อ {datetime.now(TH).strftime('%Y-%m-%d %H:%M')} (เวลาไทย)\n")

    # ---------------- app_settings ----------------
    cfg_rows = read_csv(raw, "Config")
    setting_rows = []
    if cfg_rows:
        c = cfg_rows[0]
        for key, idx in CONFIG_LAYOUT.items():
            val = get(c, idx)
            if val == "":
                continue
            is_public = "0" if key in NON_PUBLIC_SETTINGS else "1"
            setting_rows.append([sq_str(key), sq_str(val), is_public])
        note(f"- `app_settings`: {len(setting_rows)} ค่า จาก Config 1 แถว 24 คอลัมน์")
        if get(c, CONFIG_LAYOUT["admin_pin"]):
            note("  - `admin_pin` ถูกตั้ง `is_public=0` — ของเดิมส่งออกไปกับ "
                 "`getData` ให้ทุกคน")
        if get(c, CONFIG_LAYOUT["liff_id"]):
            note(f"  - `liff_id` = `{get(c, CONFIG_LAYOUT['liff_id'])}`")
    out_sql.append(values_block(
        "app_settings", ["setting_key", "setting_value", "is_public"], setting_rows))
    counts["app_settings"] = len(setting_rows)

    # ---------------- tournaments ----------------
    t_rows = read_csv(raw, "Tournaments")
    tour_sql, prize_sql, timg_sql = [], [], []
    tournament_ids: set[str] = set()

    for r in t_rows:
        tid = get(r, 0)
        if not tid:
            continue
        tournament_ids.add(tid)
        name, ttype, status = get(r, 1), get(r, 2) or "Penalty", get(r, 3) or "Upcoming"

        # ครั้งที่ 3 กับครั้งที่ 4 เป็น Active พร้อมกันในชีต ทำให้ตัวเลือก
        # ทัวร์นาเมนต์ในแอปสับสน — ปิดของเก่าเป็น Archived
        if tid == "default" and status == "Active":
            status = "Archived"
            note(f"- `tournaments`: `{tid}` ({name}) Active → **Archived** "
                 "เพราะมี 2 ทัวร์นาเมนต์ Active พร้อมกัน")

        cfg = {}
        try:
            cfg = json.loads(get(r, 4) or "{}") or {}
        except json.JSONDecodeError:
            warn(f"tournaments {tid}: ConfigJSON อ่านไม่ได้ ใช้ค่าตั้งต้นแทน")

        obj = cfg.get("objective") or {}
        tour_sql.append([
            sq(tid), sq_str(name),
            sq_str(ttype if ttype in ("Penalty", "7v7", "11v11") else "Penalty"),
            sq_str(status if status in ("Upcoming", "Active", "Archived") else "Upcoming"),
            dt(cfg.get("registrationDeadline")),
            num(cfg.get("maxTeams"), "NULL"),
            num(cfg.get("playersPerTeam"), "7"),
            num(cfg.get("maxSubs"), "0"),
            num(cfg.get("halfTimeDuration"), "NULL"),
            "1" if cfg.get("extraTime") else "0",
            num(cfg.get("registrationFee"), "0"),
            sq_str(cfg.get("bankName", "")), sq_str(cfg.get("bankAccount", "")),
            sq_str(cfg.get("accountName", "")), sq_str(cfg.get("locationName", "")),
            sq_str(cfg.get("locationLink", "")),
            num(cfg.get("locationLat"), "NULL"), num(cfg.get("locationLng"), "NULL"),
            "1" if obj.get("isEnabled") else "0",
            sq_str(obj.get("title", "")), sq(obj.get("description")),
            num(obj.get("goal"), "0"), sq_str(obj.get("docUrl", "")),
        ])

        for i, pz in enumerate(cfg.get("prizes") or []):
            prize_sql.append([
                sq(tid), sq_str(pz.get("rankLabel", "")), sq_str(pz.get("amount", "")),
                sq_str(pz.get("description", "")), sq(pz.get("winnerTeamId")), str(i),
            ])
        for i, im in enumerate(obj.get("images") or []):
            it = im.get("type", "general")
            timg_sql.append([
                sq(tid), sq_str(im.get("url", "")),
                sq_str(it if it in ("before", "after", "general") else "general"),
                sq_str(im.get("caption", "")), str(i),
            ])

    out_sql.append(values_block("tournaments", [
        "tournament_id", "name", "type", "status", "registration_deadline",
        "max_teams", "players_per_team", "max_subs", "half_time_duration",
        "extra_time", "registration_fee", "bank_name", "bank_account",
        "account_name", "location_name", "location_link", "location_lat",
        "location_lng", "objective_enabled", "objective_title",
        "objective_description", "objective_goal", "objective_doc_url"], tour_sql))
    out_sql.append(values_block("tournament_prizes", [
        "tournament_id", "rank_label", "amount", "description",
        "winner_team_id", "display_order"], prize_sql))
    out_sql.append(values_block("tournament_images", [
        "tournament_id", "url", "image_type", "caption", "display_order"], timg_sql))
    counts["tournaments"] = len(tour_sql)
    counts["tournament_prizes"] = len(prize_sql)
    counts["tournament_images"] = len(timg_sql)
    note(f"- `tournaments`: {len(tour_sql)} แถว "
         f"(รางวัล {len(prize_sql)}, รูปโครงการ {len(timg_sql)}) "
         "— ConfigJSON ถูกแตกเป็นคอลัมน์จริงและตารางลูก")

    # ---------------- schools (+ ทีมที่ยังไม่มีโรงเรียน) ----------------
    s_rows = read_csv(raw, "Schools")
    schools: dict[str, dict] = {}     # school_id -> data
    by_name: dict[str, str] = {}      # school_name -> school_id

    for r in s_rows:
        sid, nm = get(r, 0), get(r, 1)
        if not sid or not nm or nm in by_name:
            continue
        schools[sid] = {"name": nm, "district": get(r, 2), "province": get(r, 3)}
        by_name[nm] = sid

    team_rows_raw = read_csv(raw, "Teams")

    def resolve_school(team_name: str, district: str, province: str) -> tuple[str, str]:
        """คืน (school_id, วิธีที่จับคู่ได้)"""
        if team_name in by_name:
            return by_name[team_name], "exact"
        alias = SCHOOL_ALIASES.get(team_name)
        if alias and alias in by_name:
            return by_name[alias], "alias"
        # โรงเรียนหนึ่งส่งหลายทีมจะตั้งชื่อ "<โรงเรียน> A" / "<โรงเรียน> B"
        # ตัด suffix ออกแล้วลองใหม่ — ทำเฉพาะเมื่อชื่อฐานมีอยู่จริงเท่านั้น
        base = re.sub(r"\s+[A-Zก-ฮ0-9]$", "", team_name).strip()
        if base != team_name and base in by_name:
            return by_name[base], f"suffix('{team_name[len(base):].strip()}')"
        new_id = "SCH_" + re.sub(r"\W+", "", team_name)[:24] or f"SCH_{len(schools)}"
        while new_id in schools:
            new_id += "X"
        schools[new_id] = {"name": team_name, "district": district, "province": province}
        by_name[team_name] = new_id
        return new_id, "created"

    team_sql, multi = [], {}
    team_ids: set[str] = set()
    name_to_team: dict[tuple[str, str], str] = {}   # (tournament_id, team_name) -> team_id
    match_methods: dict[str, int] = {}

    for r in team_rows_raw:
        tid_team, nm = get(r, 0), get(r, 1)
        if not tid_team or not nm:
            continue
        tour = get(r, 18) or "default"
        if tour not in tournament_ids:
            warn(f"teams {tid_team} ({nm}): tournament '{tour}' ไม่มีอยู่ — ข้ามแถวนี้")
            continue
        sid, how = resolve_school(nm, get(r, 7), get(r, 8))
        match_methods[how] = match_methods.get(how, 0) + 1
        multi.setdefault((tour, sid), []).append(nm)

        c1, c2 = split_colors(get(r, 3))
        status = get(r, 5) or "Pending"
        # สถานะเดิมมีแค่ Pending/Approved/Rejected — map เข้า state machine ใหม่
        status = {"Pending": "Submitted", "Approved": "Approved",
                  "Rejected": "Rejected"}.get(status, "Submitted")

        team_sql.append([
            sq(tid_team), sq(tour), sq(sid), "NULL",
            sq_str(nm), sq_str(get(r, 2)), sq_str(c1), sq_str(c2), sq_str(get(r, 4)),
            sq_str(status), sq_str(get(r, 16)), sq(get(r, 6) or None),
            sq_str(get(r, 14)), sq_str(get(r, 15)),
            sq_str(get(r, 9)), sq_str(get(r, 10)), sq_str(phone(get(r, 11))),
            sq_str(get(r, 12)), sq_str(phone(get(r, 13))),
            dt_now(get(r, 17)),
        ])
        team_ids.add(tid_team)
        name_to_team[(tour, nm)] = tid_team

    school_sql = [[sq(sid), sq_str(d["name"]), "''", sq_str(d["district"]),
                   sq_str(d["province"])] for sid, d in schools.items()]

    out_sql.append(values_block("schools", [
        "school_id", "school_name", "short_name", "district", "province"], school_sql))
    out_sql.append(values_block("teams", [
        "team_id", "tournament_id", "school_id", "source_team_id", "name",
        "short_name", "color_primary", "color_secondary", "logo_url", "status",
        "reject_reason", "group_name", "doc_url", "slip_url", "director_name",
        "manager_name", "manager_phone", "coach_name", "coach_phone",
        "created_at"], team_sql))
    counts["schools"] = len(school_sql)
    counts["teams"] = len(team_sql)

    note(f"- `schools`: {len(school_sql)} แถว (จากชีต {len(s_rows)})")
    note(f"- `teams`: {len(team_sql)} แถว — จับคู่โรงเรียนได้: "
         + ", ".join(f"{k} {v}" for k, v in sorted(match_methods.items())))
    dupes = {k: v for k, v in multi.items() if len(v) > 1}
    if dupes:
        note("  - โรงเรียนที่ส่งมากกว่า 1 ทีม (schema รองรับแล้ว):")
        for (tour, sid), names in dupes.items():
            note(f"    - `{tour}` / {schools[sid]['name']}: {', '.join(names)}")

    # ---------------- players ----------------
    p_sql, seen_shirt = [], set()
    for r in read_csv(raw, "Players"):
        pid, team = get(r, 0), get(r, 1)
        if not pid or team not in team_ids:
            if pid:
                warn(f"players {pid}: teamId '{team}' ไม่มีอยู่ — ข้ามแถวนี้")
            continue
        shirt = get(r, 3).strip()
        # '' ต้องเป็น NULL ไม่งั้น uq_player_shirt จะชนกันเองในทีมเดียว
        if shirt and (team, shirt) in seen_shirt:
            warn(f"players {pid}: เลขเสื้อ '{shirt}' ซ้ำในทีม {team} — ตั้งเป็น NULL")
            shirt = ""
        if shirt:
            seen_shirt.add((team, shirt))
        p_sql.append([
            sq(pid), sq(team), "NULL", sq_str(get(r, 2)),
            sq(shirt or None), sq_str(get(r, 4) or "Player"), sq_str(get(r, 5)),
            date_only(get(r, 6)),
        ])
    out_sql.append(values_block("players", [
        "player_id", "team_id", "source_player_id", "name", "shirt_number",
        "position", "photo_url", "birth_date"], p_sql))
    counts["players"] = len(p_sql)
    note(f"- `players`: {len(p_sql)} แถว จาก {len({r[1] for r in p_sql})} ทีม")

    # ---------------- matches ----------------
    m_sql, match_ids, discarded = [], set(), []
    for r in read_csv(raw, "Matches"):
        mid = get(r, 0)
        if not mid:
            continue
        tour = get(r, 14) or "default"
        if tour not in tournament_ids:
            discarded.append((mid, f"tournament '{tour}' ไม่มีอยู่"))
            continue
        na, nb = get(r, 1), get(r, 2)
        ta = name_to_team.get((tour, na))
        tb = name_to_team.get((tour, nb))
        if ta is None and na:
            discarded.append((mid, f"ทีม A '{na}' จับคู่ไม่ได้"))
        if tb is None and nb:
            discarded.append((mid, f"ทีม B '{nb}' จับคู่ไม่ได้"))
        st = get(r, 9) or "Finished"
        st = st if st in ("Scheduled", "Live", "Finished", "Walkover") else "Finished"
        w = get(r, 5).strip().upper()
        m_sql.append([
            sq(mid), sq(tour), sq(ta), sq(tb), sq_str(na), sq_str(nb),
            num(get(r, 3)), num(get(r, 4)),
            sq(w) if w in ("A", "B", "DRAW") else "NULL",
            sq_str(st), sq_str(get(r, 8)), sq_str(get(r, 10)),
            dt(get(r, 11)), sq_str(get(r, 12)), sq_str(get(r, 13)),
            sq(get(r, 7)), dt(get(r, 6)),
        ])
        match_ids.add(mid)
    out_sql.append(values_block("matches", [
        "match_id", "tournament_id", "team_a_id", "team_b_id", "team_a_name",
        "team_b_name", "score_a", "score_b", "winner", "status", "round_label",
        "venue", "scheduled_time", "livestream_url", "livestream_cover",
        "summary", "played_at"], m_sql))
    counts["matches"] = len(m_sql)
    note(f"- `matches`: {len(m_sql)} แถว")
    if discarded:
        note(f"  - **จับคู่ team_id ไม่ได้ {len(discarded)} รายการ** "
             "(ยัง import แต่ team_a_id/team_b_id เป็น NULL):")
        for mid, why in discarded[:20]:
            note(f"    - `{mid}`: {why}")
    else:
        note("  - จับคู่ `team_id` ได้ครบทุกนัด ไม่มีรายการถูกทิ้ง ✅")

    # ---------------- kicks ----------------
    k_sql, kick_slots = [], set()
    for r in read_csv(raw, "Kicks"):
        mid = get(r, 0)
        if mid not in match_ids:
            if mid:
                orphan("kicks", mid)
            continue
        side = get(r, 2).strip().upper()
        if side not in ("A", "B"):
            warn(f"kicks {mid}: team '{side}' ไม่ใช่ A/B — ข้ามแถวนี้")
            continue
        rd = num(get(r, 1), "0")
        if (mid, rd, side) in kick_slots:
            warn(f"kicks {mid} รอบ {rd} ฝั่ง {side}: ซ้ำ — เก็บอันแรกไว้")
            continue
        kick_slots.add((mid, rd, side))
        res = get(r, 4).strip().upper()
        if res not in ("GOAL", "SAVED", "MISSED"):
            res = "MISSED"
        k_sql.append([sq(mid), rd, sq_str(side), sq_str(get(r, 3)),
                      sq_str(res), dt_now(get(r, 5))])
    out_sql.append(values_block("kicks", [
        "match_id", "round_no", "team_side", "player_name", "result",
        "kicked_at"], k_sql))
    counts["kicks"] = len(k_sql)
    note(f"- `kicks`: {len(k_sql)} แถว")

    # ---------------- match_events ----------------
    e_sql = []
    valid_ev = {"GOAL", "OWN_GOAL", "YELLOW_CARD", "RED_CARD", "BLUE_CARD",
                "SUB_IN", "SUB_OUT"}
    for r in read_csv(raw, "MatchEvents"):
        eid, mid = get(r, 0), get(r, 1)
        if not eid or mid not in match_ids:
            if eid:
                orphan("match_events", mid)
            continue
        et = get(r, 4).strip().upper()
        side = get(r, 6).strip().upper()
        e_sql.append([sq(eid), sq(mid), num(get(r, 3)),
                      sq_str(et if et in valid_ev else "GOAL"),
                      sq_str(side if side in ("A", "B") else "A"),
                      sq_str(get(r, 5)), "''", dt_now(get(r, 7))])
    out_sql.append(values_block("match_events", [
        "event_id", "match_id", "minute_no", "event_type", "team_side",
        "player_name", "related_player", "created_at"], e_sql))
    counts["match_events"] = len(e_sql)

    # ---------------- users ----------------
    u_sql, user_ids, need_reset = [], set(), []
    for r in read_csv(raw, "Users"):
        uid = get(r, 0)
        if not uid:
            continue
        role = get(r, 4) or "user"
        role = role if role in ("admin", "staff", "user") else "user"
        username = get(r, 1) or None
        pw = get(r, 2)
        line_id = get(r, 7) or None

        if pw:
            # รหัสเดิมเป็น plaintext และอยู่ในชีตที่เปิดอ่านสาธารณะ
            # ถือว่าหลุดแล้ว -> ใช้เข้าได้ครั้งเดียวแล้วบังคับเปลี่ยน
            pw_hash = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
            must_change = "1"
        elif role in ("admin", "staff"):
            # chk_staff_has_password บังคับว่าต้องมีรหัส — ตั้งรหัสสุ่มที่
            # ไม่มีใครรู้ (เข้าไม่ได้) แล้วให้แอดมินรัน tools/set-password.php
            pw_hash = bcrypt.hashpw(secrets.token_urlsafe(32).encode(),
                                    bcrypt.gensalt()).decode()
            must_change = "1"
            need_reset.append(username or uid)
        else:
            pw_hash, must_change = None, "0"

        if role in ("admin", "staff") and not username:
            username = f"admin_{uid}"
            warn(f"users {uid}: role={role} แต่ไม่มี username — ตั้งเป็น '{username}'")

        u_sql.append([
            sq(uid), sq(line_id), sq(username), sq(pw_hash),
            sq_str("bcrypt"), must_change, sq_str(get(r, 3)),
            sq_str(get(r, 6)), sq_str(phone(get(r, 5))), sq_str(role), dt(get(r, 8)),
        ])
        user_ids.add(uid)
    out_sql.append(values_block("users", [
        "user_id", "line_user_id", "username", "password_hash", "password_algo",
        "must_change_password", "display_name", "picture_url", "phone", "role",
        "last_login_at"], u_sql))
    counts["users"] = len(u_sql)
    note(f"- `users`: {len(u_sql)} แถว — รหัสผ่านเดิมเป็น plaintext ทั้งหมด "
         "ถูกแปลงเป็น bcrypt และตั้ง `must_change_password=1`")
    if need_reset:
        note(f"  - **ต้องตั้งรหัสให้ {len(need_reset)} บัญชีนี้ก่อนใช้งาน** "
             f"(`php tools/set-password.php <username>`): {', '.join(need_reset)}")

    # ---------------- news / donations / predictions ----------------
    n_sql = []
    for r in read_csv(raw, "News"):
        nid = get(r, 0)
        if not nid:
            continue
        tour = get(r, 6)
        n_sql.append([sq(nid), sq(tour if tour in tournament_ids else None),
                      sq_str(get(r, 1)), sq(get(r, 2)), sq_str(get(r, 3)),
                      sq_str(get(r, 5)), dt_now(get(r, 4))])
    out_sql.append(values_block("news", [
        "news_id", "tournament_id", "title", "content", "image_url",
        "document_url", "published_at"], n_sql))
    counts["news"] = len(n_sql)

    d_sql = []
    for r in read_csv(raw, "Donations"):
        did = get(r, 0)
        if not did:
            continue
        tour = get(r, 9)
        st = get(r, 11) or "Pending"
        d_sql.append([
            sq(did), sq(tour if tour in tournament_ids else None), sq_str(get(r, 2)),
            num(get(r, 3)), sq_str(phone(get(r, 4))), sq_str(get(r, 6)), sq_str(get(r, 7)),
            yn(get(r, 5)), yn(get(r, 12)), sq_str(get(r, 8)), sq_str(get(r, 13)),
            sq_str(get(r, 10)),
            sq_str(st if st in ("Pending", "Verified", "Rejected") else "Pending"),
            dt_now(get(r, 1)),
        ])
    out_sql.append(values_block("donations", [
        "donation_id", "tournament_id", "donor_name", "amount", "phone", "tax_id",
        "address", "is_edonation", "is_anonymous", "slip_url", "tax_file_url",
        "line_user_id", "status", "created_at"], d_sql))
    counts["donations"] = len(d_sql)

    pr_sql, pr_seen = [], set()
    for r in read_csv(raw, "Predictions"):
        mid, uid = get(r, 1), get(r, 2)
        if mid not in match_ids or uid not in user_ids:
            orphan("predictions", mid if mid not in match_ids else uid)
            continue
        if (mid, uid) in pr_seen:
            warn(f"predictions: {uid} ทายนัด {mid} ซ้ำ — เก็บอันแรกไว้")
            continue
        pr_seen.add((mid, uid))
        p = get(r, 5).strip().upper()
        pr_sql.append([sq(mid), sq(uid), sq_str(p if p in ("A", "B") else "A"),
                       dt_now(get(r, 6))])
    out_sql.append(values_block("predictions", [
        "match_id", "user_id", "prediction", "created_at"], pr_sql))
    counts["predictions"] = len(pr_sql)

    # ---------------- contests ----------------
    c_sql, contest_ids = [], set()
    for r in read_csv(raw, "Contests"):
        cid = get(r, 0)
        if not cid:
            continue
        st = get(r, 3) or "Open"
        c_sql.append([sq(cid), sq_str(get(r, 1)), sq(get(r, 2)),
                      sq_str(st if st in ("Open", "Closed") else "Open"),
                      dt_now(get(r, 4)), dt(get(r, 5))])
        contest_ids.add(cid)
    out_sql.append(values_block("contests", [
        "contest_id", "title", "description", "status", "created_at",
        "closing_date"], c_sql))
    counts["contests"] = len(c_sql)

    ce_sql, like_sql, entry_ids = [], [], set()
    for r in read_csv(raw, "ContestEntries"):
        eid = get(r, 0)
        if not eid or get(r, 1) not in contest_ids:
            if eid:
                warn(f"contest_entries {eid}: contestId ไม่มีอยู่ — ข้ามแถวนี้")
            continue
        uid = get(r, 2)
        liked = [x for x in (get(r, 8) or "").split(",") if x.strip() in user_ids]
        for lu in dict.fromkeys(liked):
            like_sql.append([sq(eid), sq(lu.strip())])
        ce_sql.append([
            sq(eid), sq(get(r, 1)), sq(uid if uid in user_ids else None),
            sq_str(get(r, 5)), sq_str(get(r, 6)),
            str(len(set(liked))), num(get(r, 10)), dt_now(get(r, 9)),
        ])
        entry_ids.add(eid)
    out_sql.append(values_block("contest_entries", [
        "entry_id", "contest_id", "user_id", "photo_url", "caption",
        "like_count", "share_count", "created_at"], ce_sql))
    out_sql.append(values_block("entry_likes", ["entry_id", "user_id"], like_sql))
    counts["contest_entries"] = len(ce_sql)
    counts["entry_likes"] = len(like_sql)
    note(f"- `entry_likes`: {len(like_sql)} แถว — แตกจาก CSV ในเซลล์เดียวของเดิม "
         "(`like_count` คำนวณใหม่จากจำนวนที่ไม่ซ้ำ)")

    cc_sql = []
    for r in read_csv(raw, "ContestComments"):
        cid = get(r, 0)
        if not cid or get(r, 1) not in entry_ids:
            if cid:
                orphan("contest_comments", get(r, 1))
            continue
        uid = get(r, 2)
        cc_sql.append([sq(cid), sq(get(r, 1)), sq(uid if uid in user_ids else None),
                       sq_str(get(r, 5)), dt_now(get(r, 6))])
    out_sql.append(values_block("contest_comments", [
        "comment_id", "entry_id", "user_id", "message", "created_at"], cc_sql))
    counts["contest_comments"] = len(cc_sql)

    # ---------------- sponsors / music / ticker ----------------
    sp_sql = []
    for i, r in enumerate(read_csv(raw, "Sponsors")):
        sid = get(r, 0)
        if not sid:
            continue
        ty, scope = split_scoped_type(get(r, 3))
        sp_sql.append([sq(sid), sq(scope if scope in tournament_ids else None),
                       sq_str(get(r, 1)), sq_str(get(r, 2)),
                       sq_str(ty if ty in ("Main", "Support") else "Support"), str(i)])
    out_sql.append(values_block("sponsors", [
        "sponsor_id", "tournament_id", "name", "logo_url", "sponsor_type",
        "display_order"], sp_sql))
    counts["sponsors"] = len(sp_sql)

    mt_sql = []
    for i, r in enumerate(read_csv(raw, "MusicTracks")):
        mid = get(r, 0)
        if not mid:
            continue
        ty, scope = split_scoped_type(get(r, 3))
        mt_sql.append([sq(mid), sq(scope if scope in tournament_ids else None),
                       sq_str(get(r, 1)), sq_str(get(r, 2)),
                       sq_str(ty if ty in ("Youtube", "Spotify", "Suno", "Other")
                              else "Other"), str(i)])
    out_sql.append(values_block("music_tracks", [
        "track_id", "tournament_id", "name", "url", "track_type",
        "display_order"], mt_sql))
    counts["music_tracks"] = len(mt_sql)

    tk_sql = []
    for i, r in enumerate(read_csv(raw, "TickerMessages")):
        tkid = get(r, 0)
        if not tkid:
            continue
        _, scope = split_scoped_type(get(r, 3))
        tk_sql.append([sq(tkid), sq(scope if scope in tournament_ids else None),
                       sq_str(get(r, 1)), yn(get(r, 2)), str(i)])
    out_sql.append(values_block("ticker_messages", [
        "ticker_id", "tournament_id", "message", "is_active",
        "display_order"], tk_sql))
    counts["ticker_messages"] = len(tk_sql)

    out_sql.append("\nSET FOREIGN_KEY_CHECKS = 1;\n")

    # ---------------- เขียนไฟล์ ----------------
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text("\n".join(out_sql), encoding="utf-8")

    if phone_fixed:
        note(f"\n- 🔧 ซ่อมเบอร์โทรที่เสีย 0 นำหน้า **{phone_fixed} เบอร์** — "
             "ชีตต้นทางเก็บบางแถวเป็นตัวเลข ทำให้ 0 หายไป "
             "(`836645989` → `0836645989`) ซึ่งโทรไม่ติดและมองผ่าน ๆ ไม่เห็นว่าผิด")

    # ---------------- สรุปข้อมูลกำพร้า ----------------
    if orphans:
        note("\n## ข้อมูลกำพร้าที่ถูกตัดออก\n")
        note("แถวที่อ้างถึงของที่ไม่มีอยู่ในชีตแล้ว — เกิดจากระบบเดิมไม่มี "
             "foreign key จึงลบแม่ทิ้งแต่ลูกยังค้าง ของพวกนี้แสดงผลในแอปเดิม"
             "ไม่ได้อยู่แล้ว การตัดออกจึงไม่ทำให้ผู้ใช้เห็นอะไรหายไป\n")
        note("| ตาราง | แถวที่ตัด | อ้างถึง id ที่ไม่มี |")
        note("|---|---|---|")
        for tbl, refs in sorted(orphans.items()):
            uniq = sorted(set(refs))
            shown = ", ".join(f"`{u}`" for u in uniq[:4])
            if len(uniq) > 4:
                shown += f" (+{len(uniq) - 4})"
            note(f"| `{tbl}` | {len(refs)} | {shown} |")

    note("\n## จำนวนแถวต่อตาราง\n")
    note("| ตาราง | แถว |")
    note("|---|---|")
    for k, v in counts.items():
        note(f"| `{k}` | {v} |")
    note(f"\n**รวม {sum(counts.values())} แถว**\n")
    if warnings:
        note(f"\n## คำเตือน {len(warnings)} รายการ\n")
    else:
        note("\n## ไม่มีคำเตือน — แปลงครบทุกแถว ✅\n")

    Path(args.report).write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print(f"เขียน {args.out}  ({sum(counts.values())} แถว, {len(counts)} ตาราง)")
    print(f"เขียน {args.report}")
    if warnings:
        print(f"\nคำเตือน {len(warnings)} รายการ — อ่านใน {args.report}")
        for w in warnings[:10]:
            print("  -", w)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
