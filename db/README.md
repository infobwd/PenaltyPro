# Database — ย้ายจาก Google Sheets → MySQL

ปลายทาง: `kickoff.bwd.ac.th` · DirectAdmin · **PHP 8.3.30 · MariaDB 10.6.24**
พื้นหลังและเหตุผลของแต่ละการตัดสินใจ: [../docs/BUILD_PLAN_2569-09-01.md](../docs/BUILD_PLAN_2569-09-01.md)

## ไฟล์

| ไฟล์ | commit ลง git? | คำอธิบาย |
|---|---|---|
| `01-schema.sql` | ✅ | DDL — 27 ตาราง + 2 view |
| `02-smoke-test.sql` | ✅ | ตรวจว่า schema บังคับกติกาได้จริง (rollback ทุกครั้ง) |
| `seed/raw/*.csv` | ❌ | snapshot ดิบจาก Google Sheet |
| `seed/02-seed.sql` | ❌ | ข้อมูลจริงพร้อม import |
| `seed/etl-report.md` | ❌ | รายงานทุกแถวที่แปลงไม่ได้ |
| `vapid-keys.local.sql` | ❌ | คีย์ push ของเครื่องนี้ (มี private key) |

### migration — รันตามลำดับหลัง `01-schema.sql`

ไฟล์พวกนี้เพิ่มทีหลังตามฟีเจอร์ที่ทำ **รันให้ครบทุกไฟล์** ก่อนอัปโค้ดขึ้นโฮสต์
รันซ้ำไม่ได้ (เป็น `ALTER`/`CREATE TABLE` ตรง ๆ) รันแล้วข้ามได้เลย

| ไฟล์ | เพิ่มอะไร |
|---|---|
| `02-registration-payment.sql` | หลักฐานโอนเงินค่าสมัคร |
| `03-tournament-admins.sql` | ผู้ดูแลรายรายการแข่งขัน |
| `04-access-code-reveal.sql` | log การเปิดดูรหัสโรงเรียน |
| `05-registration-visibility.sql` | เปิด/ปิดการรับสมัครรายรายการ |
| `06-user-school.sql` | ผูกบัญชีผู้ใช้กับโรงเรียน |
| `07-notifications.sql` | ศูนย์แจ้งเตือน + Web Push |
| `08-school-verified.sql` | แยกโรงเรียนที่ผู้ดูแลรับรอง ออกจากที่ผู้ใช้เลือกเอง |
| `09-team-session-user.sql` | session โรงเรียนจำบัญชีที่เข้ามา (แก้ "เซสชันหมดอายุ") |
| `10-player-checkin.sql` | รายงานตัวนักกีฬาหน้างาน |
| `11-tournament-branding.sql` | โลโก้และประกาศประจำรายการแข่งขัน |
| `12-match-highlight.sql` | ลิงก์คลิปไฮไลต์ของแต่ละคู่ |
| `13-referee-role.sql` | บทบาทกรรมการบันทึกผล |
| `14-lineup-intro-video.sql` | คลิปแนะนำทีม/รายคน และคำโปรยประจำทีม สำหรับผังตัวนักกีฬา |
| `15-sponsor-contributions.sql` | เงิน/สิ่งของที่สนับสนุน และข้อมูลผู้ลงนามในใบอนุโมทนา |
| `16-sponsor-donation-settings.sql` | บัญชีหรือ QR รับเงินผู้สนับสนุนระดับรายการ และการเลือกใช้บัญชีเดิม |
| `17-tournament-finance.sql` | ผู้ทำบัญชีและรายการรายรับ-รายจ่ายพร้อมหลักฐาน |
| `18-project-donation-settings.sql` | บัญชี/QR รับเงิน "ร่วมสนับสนุนโครงการ" บนหน้าแรก แยกจากบัญชีผู้สนับสนุน |
| `19-contest-tournament.sql` | ผูกการประกวดภาพถ่ายกับรายการแข่งขัน (จอในสนามจะได้ไม่ขึ้นภาพข้ามปี) |
| `20-team-doc-policy.sql` | เจ้าภาพกำหนดว่ารับ/ไม่รับ/บังคับ เอกสารรับรองของทีม + ไฟล์แบบฟอร์มให้ดาวน์โหลด |
| `21-certificates.sql` | ใบเกียรติบัตร — ผู้ลงนาม/ลายเซ็น/ข้อความ/รูปแบบเลขที่ และเลขที่ที่ออกไปแล้ว |
| `22-certificate-access.sql` | สวิตช์เปิดหน้าเกียรติบัตรให้ผู้ใช้ทั่วไป + เลขชุดใบอนุโมทนาผู้สนับสนุน |
| `23-certificate-design.sql` | ภาพพื้นหลังและโซนวางข้อความของเกียรติบัตร (แยกตามบทบาท) |
| `24-certificate-template.sql` | เทมเพลตเกียรติบัตรแบบยืดหยุ่น (JSON) + QR ตรวจสอบ |
| `25-certificate-preset.sql` | แม่แบบเกียรติบัตรที่บันทึกไว้ใช้ซ้ำข้ามรายการ |

เช็กว่าครบไหมโดยไม่ต้องเปิดฐานข้อมูล: เรียก `https://kickoff.bwd.ac.th/api/?action=health`
ถ้ามี `col_*` หรือ `table_*` ตัวไหน `ok: false` แปลว่ายังไม่ได้รันไฟล์ที่มันบอกไว้ใน `detail`

`db/seed/` อยู่ใน `.gitignore` เพราะมี **รหัสผ่าน, เบอร์โทรผู้ปกครอง/ครู,
เลขผู้เสียภาษีและที่อยู่ผู้บริจาค** — ห้าม commit สร้างใหม่ได้ทุกเมื่อด้วย `tools/etl/`

## สร้างข้อมูลใหม่จากชีต

```bash
pip install bcrypt
python tools/etl/extract.py                       # ชีต -> db/seed/raw/*.csv
python tools/etl/transform.py                     # -> db/seed/02-seed.sql + etl-report.md
```

`extract.py` ใช้ `/export?format=csv&gid=...` **ไม่ใช่ `gviz/tq`** — gviz เดาชนิด
ข้อมูลแล้วทำแถวหายเงียบ ๆ (เคยกลืน 5 แถวแรกของ Schools เข้าไปเป็นชื่อคอลัมน์
เพราะคอลัมน์ id มีทั้ง `S001` และ `71020006` ปนกัน)

**อ่าน `db/seed/etl-report.md` ทุกครั้งก่อน import** — ทุกแถวที่ถูกตัดออกอยู่ในนั้น

## Import

```bash
mysql -u bwdacth_kickoff -p bwdacth_kickoff < db/01-schema.sql
mysql -u bwdacth_kickoff -p bwdacth_kickoff < db/seed/02-seed.sql
```

ผล ETL รอบล่าสุด (11 ส.ค. 2569) — import ผ่านบน MariaDB โดย FK ครบ:

| ตาราง | แถว | | ตาราง | แถว |
|---|---|---|---|---|
| `app_settings` | 21 | | `matches` | 58 |
| `tournaments` | 4 | | `users` | 16 |
| `tournament_prizes` | 7 | | `predictions` | 23 |
| `schools` | 31 | | `donations` | 6 |
| `teams` | 32 | | `contest_entries` | 7 |
| `players` | 14 | | อื่น ๆ | 22 |

**ตัดออก 25 แถว** — ทั้งหมดเป็นข้อมูลกำพร้าที่อ้างถึงแม่ที่ถูกลบไปแล้ว
(kicks 14, contest_comments 6, match_events 3, predictions 2) ระบบเดิมไม่มี FK
จึงลบนัดทิ้งแต่ลูกยังค้างในชีต ของพวกนี้แสดงผลในแอปเดิมไม่ได้อยู่แล้ว

DirectAdmin ที่ไม่มี shell: **phpMyAdmin → Import** ทีละไฟล์ (`01-schema.sql` ก่อน)
ถ้าไฟล์เกินขีดจำกัดการอัปโหลด ให้ gzip แล้วอัปโหลด `.sql.gz`

## ตรวจหลัง import

```sql
-- 1. จำนวนแถวต้องตรงกับ etl-report.md
SELECT 'schools' t, COUNT(*) n FROM schools
UNION ALL SELECT 'teams',   COUNT(*) FROM teams
UNION ALL SELECT 'players', COUNT(*) FROM players
UNION ALL SELECT 'matches', COUNT(*) FROM matches
UNION ALL SELECT 'kicks',   COUNT(*) FROM kicks
UNION ALL SELECT 'users',   COUNT(*) FROM users;

-- 2. collation ต้องตรงกันทุกตาราง — ถ้าไม่ตรง JOIN จะไม่ใช้ index (pitfall P2)
--    ⚠️ MariaDB default ของ utf8mb4 คือ general_ci ข้อนี้จึงพลาดง่ายมาก
SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_COLLATION <> 'utf8mb4_unicode_ci';

-- 3. คอลัมน์ที่ collation หลุด (รวม view ด้วย) — ต้องไม่มีแถวคืนมา
SELECT TABLE_NAME, COLUMN_NAME, COLLATION_NAME FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND COLLATION_NAME IS NOT NULL
   AND COLLATION_NAME <> 'utf8mb4_unicode_ci';

-- 4. ทีมที่ไม่มีโรงเรียนต้นทาง (ETL จับคู่พลาด) — ต้องเป็น 0
SELECT COUNT(*) FROM teams t LEFT JOIN schools s ON s.school_id = t.school_id
 WHERE s.school_id IS NULL;
```

## ทดสอบว่า schema บังคับกติกาได้จริง

ใช้ฐานข้อมูล **เปล่าแยกต่างหาก** (อย่ารันกับฐานจริง):

```bash
mysql -u USER -p SCRATCH_DB < db/01-schema.sql
mysql -u USER -p --default-character-set=utf8mb4 --table SCRATCH_DB < db/02-smoke-test.sql
```

`--default-character-set=utf8mb4` จำเป็น ไม่งั้นภาษาไทยเข้าเป็นขยะ
ผลที่ผ่านแล้วบน MariaDB 10.4 (11 ส.ค. 2569): kick upsert ได้ 1 แถว ·
prediction upsert ได้ 1 แถว · ตารางคะแนนถูกต้อง · **เปลี่ยนชื่อทีมแล้วคะแนนไม่หาย** ·
ทีมที่ยังไม่อนุมัติหายจากตัวเลขสาธารณะ

## จุดที่ต้องรู้เกี่ยวกับ schema

**แยก `schools` (ถาวร) ออกจาก `teams` (ต่อทัวร์นาเมนต์)** — ระบบเดิมไม่มีชั้นนี้
`teams.school_id` คือสิ่งที่ทำให้ดึงทีมเดิมมาแข่งฤดูใหม่ได้ และ `teams.source_team_id`
บอกว่า clone มาจากทีมไหน

**`matches` อ้างทีมด้วย `team_a_id`/`team_b_id` ไม่ใช่ชื่อ** — ของเดิมเก็บ *ชื่อทีม*
ทำให้เปลี่ยนชื่อทีมแล้วประวัติและตารางคะแนนพังทั้งหมด (`StandingsView.tsx` เทียบ
`.name ===` ทั้งไฟล์) คอลัมน์ `team_a_name`/`team_b_name` เก็บไว้เป็น snapshot
สำหรับแสดงผลนัดเก่าเท่านั้น **ห้ามใช้จับคู่**

**`players` เป็น snapshot ต่อทัวร์นาเมนต์ ไม่ใช่ master ที่ใช้ร่วมกัน** — อายุและ
รายชื่อเปลี่ยนทุกฤดู ถ้าใช้ master ร่วม การแก้รายชื่อปีนี้จะไปแก้ประวัติปีที่แล้วด้วย
`shirt_number` ต้องเป็น `NULL` เมื่อไม่ระบุ **ห้ามใช้ `''`** เพราะ `uq_player_shirt` จะชน

**`kicks` มี `UNIQUE(match_id, round_no, team_side)`** — ของเดิม `saveMatch` เรียก
`saveKicks` ทุกครั้งแล้ว append ซ้ำโดยไม่มี ID ให้ dedupe ทำให้ชีตบวมและสถิติเพี้ยน
ตอนนี้บันทึกซ้ำต้องเขียนเป็น `INSERT ... ON DUPLICATE KEY UPDATE`

**`users.password_hash` เป็น NULL ได้** สำหรับผู้ใช้ LINE แต่ `chk_staff_has_password`
บังคับว่า role `admin`/`staff` ต้องมี username + รหัสผ่านเสมอ — ของเดิมมีแอดมิน 4 คน
แต่ตั้งรหัสแค่ 2 อีก 2 คนจึงพึ่ง LINE อย่างเดียวซึ่งปลอมได้

**`users.line_user_id` ต้องมาจาก `sub` ใน ID token ที่ verify แล้วเท่านั้น** —
ห้ามเขียนจากค่าที่ client ส่งมา นี่คือช่องโหว่ที่ทำให้ยึดสิทธิ์แอดมินได้ในระบบเดิม

**`row_version`** อยู่บน `teams` และ `matches` สำหรับ optimistic locking:

```sql
UPDATE matches SET score_a = :score_a, row_version = row_version + 1
 WHERE match_id = :match_id AND row_version = :expected;
-- affected rows = 0 -> มีคนอื่นแก้ไปแล้ว ต้องคืน 409 ไม่ใช่เขียนทับ
```

**`v_standings` นับเฉพาะทีม `Approved`** — บังคับกติกา attribution เดียว
ทีมที่ยังไม่อนุมัติต้องไม่โผล่ในตัวเลขสาธารณะที่ไหนเลย

## ภาษาไทย: normalize NFC (ตรวจแล้ว — ข้อมูลดิบสะอาด)

`extract.py` normalize ทุกค่าเป็น NFC ก่อนเขียน CSV และ `transform.py` เทียบชื่อ
แบบ normalize แล้วเสมอ

**ผลตรวจจริง 11 ส.ค. 2569:** ข้อมูลดิบในชีตไม่มีค่าที่ไม่ใช่ NFC เลย (0 รายการ)
และชื่อทีมใน `Matches` จับคู่กับ `Teams` ได้ **31/31 ทั้งก่อนและหลัง normalize**
⇒ **ไม่มีนัดไหนต้องถูกทิ้ง**

การ normalize จึงเป็น *ประกัน* ไม่ใช่การแก้ปัญหาที่มีอยู่ — เก็บไว้เพราะต้นทุนเป็นศูนย์
และกันกรณีมีคนแก้ชีตด้วยมือ/คีย์บอร์ดคนละตัวในอนาคต ซึ่ง `ำ` (U+0E33) กับ
`ํา` (U+0E4D + U+0E32) ตาเปล่ามองไม่เห็นความต่างแต่ SQL ถือว่าไม่เท่ากัน

ถ้าสงสัยว่าข้อมูลชุดใหม่มีปัญหานี้ ตรวจระดับ byte ไม่ใช่ดูด้วยตา:

```sql
SELECT name, HEX(name) FROM teams WHERE name LIKE '%ำ%' OR name LIKE '%ํา%';
```

PHP บนโฮสต์นี้**ไม่มี `intl`** (คลาส `Normalizer`) จึง normalize ฝั่ง PHP ไม่ได้ —
ทำใน ETL ฝั่ง Python เท่านั้น
