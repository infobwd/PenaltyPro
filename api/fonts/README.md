# ฟอนต์สำหรับออกไฟล์ PDF

`Sarabun-Regular.ttf` / `Sarabun-Bold.ttf` — Sarabun จาก Google Fonts
สัญญาอนุญาต SIL Open Font License 1.1 (ดู `OFL.txt`) แจกจ่ายพร้อมระบบได้

## ⚠️ ไฟล์สองไฟล์นี้ถูกแก้แล้ว ห้ามเอาต้นฉบับมาทับ

เพิ่ม glyph ว่างความกว้างศูนย์ที่ **U+200B (zero-width space)** เข้าไป

เหตุผล: mPDF แทรกอักขระ U+200B เข้าไปในข้อความไทยเองเสมอ — หลังจุด (`.`)
ทุกจุด (ดู `vendor/mpdf/mpdf/src/Otl.php` ราวบรรทัด 997 ซึ่งไม่มีสวิตช์ปิด)
และตามจุดตัดคำเมื่อเปิด `useDictionaryLBR`

Sarabun ต้นฉบับไม่มี glyph ตัวนี้ ผลคือ mPDF วาด `.notdef` เป็นกล่องสี่เหลี่ยม
โผล่กลางข้อความ เช่น เลขที่เกียรติบัตรจะออกมาเป็น `ก.▯ท.▯ 001/2569`
และตัวข้อความจะมีกล่องแทรกทุกจุดตัดคำ

## ถ้าต้องอัปเดตฟอนต์เป็นรุ่นใหม่

```bash
# 1. ดาวน์โหลดต้นฉบับ
curl -L -o Sarabun-Regular.ttf \
  https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Regular.ttf
curl -L -o Sarabun-Bold.ttf \
  https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Bold.ttf

# 2. แพตช์ก่อนใช้เสมอ (ต้องมี fonttools: pip install fonttools)
python ../tools/patch-font.py
```

สคริปต์จะเขียนไฟล์ `*-zwsp.ttf` ออกมา ให้เปลี่ยนชื่อทับไฟล์เดิมในโฟลเดอร์นี้

## ตรวจว่าแพตช์แล้วจริง

```bash
python -c "from fontTools.ttLib import TTFont; \
  print(0x200B in TTFont('Sarabun-Regular.ttf').getBestCmap())"
```

ต้องได้ `True`

---

## ฟอนต์ที่มีในระบบ (6 ตระกูล × Regular/Bold)

| key | ตระกูล | บุคลิก |
|---|---|---|
| `sarabun` | Sarabun | ทางการ มาตรฐานเอกสารราชการ |
| `prompt` | Prompt | sans เรขาคณิต ทันสมัย |
| `maitree` | Maitree | มีหัว เอกสารราชการ |
| `mali` | Mali | ลายมือ อ่านง่าย |
| `charmonman` | Charmonman | อ่อนช้อย |
| `srisakdi` | Srisakdi | ไทยโบราณ |

ทุกไฟล์ผ่าน `tools/patch-font.py` แล้ว ซึ่งทำสองอย่าง
1. เพิ่ม glyph ว่างที่ U+200B (กันกล่องสี่เหลี่ยม — ดูด้านบน)
2. ถอด `GDEF.MarkGlyphSetsDef` และลดเวอร์ชัน GDEF เป็น 1.0

## ⚠️ ก่อนเพิ่มฟอนต์ใหม่ ต้องทดสอบเสมอ

mPDF ปฏิเสธฟอนต์ที่มี lookup ตั้ง flag `UseMarkFilteringSet` โดยโยน
exception ทิ้งทั้งเอกสาร (`Otl.php:4491`) — **Kanit ติดข้อนี้จึงใช้ไม่ได้**
และแก้ที่ตัวฟอนต์ไม่ได้อย่างปลอดภัย เพราะต้องไปล้าง flag ในตาราง GSUB/GPOS
ซึ่งเปลี่ยนกติกาการวางวรรณยุกต์ของฟอนต์นั้น

วิธีตรวจ: เพิ่มไฟล์ลงโฟลเดอร์นี้ แล้วลองออก PDF ด้วยฟอนต์นั้นจริง
ถ้าได้ข้อความ "contains MarkGlyphSets" แปลว่าใช้ไม่ได้ ให้หาฟอนต์อื่นแทน
และต้อง **ดูภาพที่วาดออกมาด้วยตา** ว่าสระและวรรณยุกต์วางถูก ไม่ใช่แค่ไม่ error
