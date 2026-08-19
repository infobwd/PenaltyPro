# -*- coding: utf-8 -*-
"""
เพิ่ม glyph ว่างสำหรับ U+200B (zero-width space) ให้ฟอนต์ทุกไฟล์ใน api/fonts/

ทำไมต้องทำ:
  mPDF แทรกอักขระ U+200B เข้าไปในข้อความไทยเองเสมอ — หลังจุด (.) ทุกจุด
  (vendor/mpdf/mpdf/src/Otl.php ราวบรรทัด 997 ไม่มีสวิตช์ปิด) และตามจุดตัดคำ
  เมื่อเปิด useDictionaryLBR

  ฟอนต์ไทยจาก Google Fonts ไม่มี glyph ตัวนี้ mPDF จึงวาด .notdef เป็นกล่อง
  สี่เหลี่ยมโผล่กลางข้อความ เช่น "ก.▯ท.▯ 001/2569"

⚠️ ต้องรันทุกครั้งที่เพิ่มหรืออัปเดตไฟล์ฟอนต์
   วิธีใช้:  python api/tools/patch-font.py
"""
import os
import sys

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph

sys.stdout.reconfigure(encoding="utf-8")

GLYPH = "uni200B"
CP = 0x200B

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.abspath(os.path.join(HERE, "..", "fonts"))


def strip_mark_glyph_sets(f: TTFont) -> bool:
    """
    ถอด GDEF.MarkGlyphSetsDef ออก

    mPDF โยน exception ทันทีเมื่อเจอฟอนต์ที่มีตารางนี้
    ("This font [x] contains MarkGlyphSets - Not tested yet") ทำให้ออก PDF
    ด้วยฟอนต์นั้นไม่ได้เลย — Kanit เป็นตัวอย่าง

    ตารางนี้ใช้กับ lookup แบบ UseMarkFilteringSet เท่านั้น ฟอนต์ไทยที่ทดสอบแล้ว
    ยังวางสระและวรรณยุกต์ได้ถูกต้องหลังถอดออก (ดูภาพเทียบตอนเพิ่มฟอนต์)
    ถ้าเพิ่มฟอนต์ใหม่ต้องตรวจด้วยตาอีกครั้งเสมอ
    """
    gdef = f.get("GDEF")
    if gdef is None:
        return False

    has = getattr(gdef.table, "MarkGlyphSetsDef", None) is not None
    # GDEF เวอร์ชัน 1.2 (0x00010002) "ประกาศ" ว่ามีช่อง MarkGlyphSets อยู่
    # ถ้าลบแต่ตัวตารางแล้วปล่อยเวอร์ชันไว้ mPDF ยังอ่านว่ามีและโยน exception เหมือนเดิม
    old_ver = getattr(gdef.table, "Version", 0x00010000)
    if not has and old_ver <= 0x00010000:
        return False

    gdef.table.MarkGlyphSetsDef = None
    gdef.table.Version = 0x00010000
    return True


def patch(path: str) -> str:
    f = TTFont(path)
    stripped = strip_mark_glyph_sets(f)
    if CP in f.getBestCmap():
        if stripped:
            f.save(path)
            return "ถอด MarkGlyphSets"
        return "มีอยู่แล้ว"

    # glyph ว่างจริง ๆ — ไม่มีเส้น ไม่มีความกว้าง
    f["glyf"][GLYPH] = Glyph()
    f["hmtx"][GLYPH] = (0, 0)

    order = f.getGlyphOrder()
    if GLYPH not in order:
        f.setGlyphOrder(list(order) + [GLYPH])

    added = 0
    for table in f["cmap"].tables:
        if table.isUnicode():
            table.cmap[CP] = GLYPH
            added += 1
    if added == 0:
        return "*** ไม่มี unicode cmap ให้เพิ่ม"

    f["maxp"].numGlyphs = len(f.getGlyphOrder())
    f.save(path)   # เขียนทับไฟล์เดิม — ต้นฉบับดาวน์โหลดใหม่ได้เสมอ

    if CP not in TTFont(path).getBestCmap():
        return "*** ล้มเหลว"
    return "แพตช์แล้ว" + (" + ถอด MarkGlyphSets" if stripped else "")


def main() -> int:
    files = sorted(n for n in os.listdir(FONTS) if n.lower().endswith(".ttf"))
    if not files:
        print(f"ไม่พบไฟล์ .ttf ใน {FONTS}")
        return 1

    bad = 0
    for name in files:
        result = patch(os.path.join(FONTS, name))
        print(f"  {name:<28} {result}")
        if result.startswith("***"):
            bad += 1

    print(f"\nรวม {len(files)} ไฟล์ · ไม่ผ่าน {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
