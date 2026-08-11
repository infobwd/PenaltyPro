# PenaltyPro — บทวิเคราะห์ระบบ และแผนย้ายฐานข้อมูลเป็น MySQL

> เอกสารวิเคราะห์ (ยังไม่แตะโค้ด) — จัดทำ 11 ส.ค. 2569 · ปรับตามข้อตัดสินใจที่ยืนยันแล้ว
> ขอบเขต: ประเมินระบบปัจจุบัน → ออกแบบการย้ายไป MySQL (PHP/PDO ตามแนวทาง skill `db-dashboard-builder`) → ปรับส่วนที่ยังไม่สมบูรณ์ให้เร็ว/เสถียร → ยกระดับระบบรับสมัครทีม
>
> **อ่านก่อน:** [2.1 ช่องโหว่ยึดสิทธิ์แอดมิน](#21-️-ช่องโหว่ที่ต้องแก้ก่อนอื่นใด--ยึดสิทธิ์แอดมินได้ใน-2-คำขอ)
>
> ### 🔄 แผนปฏิบัติงานย้ายไปที่เอกสารใหม่แล้ว
> เอกสารนี้เก็บไว้เป็น **ผลวิเคราะห์ระบบเดิมและช่องโหว่** (หัวข้อ 1-2 ยังใช้อ้างอิงได้ทั้งหมด)
> แต่หัวข้อ 3.4 / 5 / 6 / 7 **ล้าสมัยแล้ว** เพราะข้อตัดสินใจเปลี่ยน:
> ระบบยังไม่เปิดใช้ · แข่ง 1 ก.ย. 2569 · สร้างใหม่บน host ได้เลยไม่ต้อง dual-run ·
> ต้องดึงทีมเดิมมาใช้ + แบ่งสายใหม่ · มีรหัสรายโรงเรียนให้แก้ข้อมูลเอง
>
> **⇒ ใช้แผนฉบับปัจจุบันที่ [BUILD_PLAN_2569-09-01.md](BUILD_PLAN_2569-09-01.md)**

---

## 1. สถาปัตยกรรมปัจจุบัน

```
React 19 + Vite (SPA)
   │  fetch (GET = JSON, POST = mode:'no-cors')
   ▼
Google Apps Script  Code.js  (693 บรรทัด, ไฟล์เดียว, 1 endpoint /exec)
   │  SpreadsheetApp                    │  DriveApp
   ▼                                    ▼
Google Sheets (18 ชีต)            Google Drive (PenaltyPro_Uploads)
```

**ชั้นข้อมูล — 18 ชีต**

| ชีต | คอลัมน์ | หมายเหตุ |
|---|---|---|
| Tournaments | ID, Name, Type, Status, ConfigJSON | config ทั้งก้อนยัดเป็น JSON ในเซลล์เดียว |
| Teams | 21 คอลัมน์ | ID เป็น `T_<timestamp>` |
| Players | 8 คอลัมน์ | ผูก TeamID แบบ string |
| Matches | 15 คอลัมน์ | **TeamA/TeamB เก็บเป็น "ชื่อทีม" ไม่ใช่ ID** |
| Kicks | 7 คอลัมน์ | **ไม่มีคอลัมน์ ID** |
| MatchEvents | 8 คอลัมน์ | สร้าง on-demand |
| Donations | 14 คอลัมน์ | มี PII: เบอร์โทร, เลขผู้เสียภาษี, ที่อยู่ |
| News, Schools, Predictions | — | |
| Users | ID, Username, **Password (plaintext)**, DisplayName, Role, Phone, PictureUrl, LineUserId, LastLogin | |
| Config | 1 แถว × 24 คอลัมน์ตำแหน่งตายตัว | มี `adminPin` |
| Contests, ContestEntries, ContestComments | — | `LikedByUsers` เก็บ CSV ในเซลล์เดียว |
| Sponsors, MusicTracks, TickerMessages | — | |

**ชั้นแอป — ฝั่ง client**

- `App.tsx` 73 KB (~1,700 บรรทัด) เป็น God component ถือ state ทั้งระบบ
- `AdminDashboard.tsx` 2,405 บรรทัด, `ScheduleList` 1,128, `ContestGallery` 1,096, `TournamentView` 1,052
- `services/sheetService.ts` = data layer ทั้งหมด (334 บรรทัด, hardcode API_URL)
- แคช `localStorage` 5 นาที ครอบ `getData()` ทั้งก้อน

---

## 2. ปัญหาที่พบ (เรียงตามความรุนแรง)

### 🔴 ระดับวิกฤต — ความปลอดภัย

| # | ปัญหา | หลักฐาน | ผลกระทบ |
|---|---|---|---|
| S1 | `getData()` เปิดสาธารณะ ส่ง **ทั้งฐานข้อมูล** ให้ทุกคน รวม `adminPin` และ Donations (เบอร์โทร/เลขผู้เสียภาษี/ที่อยู่) | `Code.js:133,150,155` | เปิด URL `/exec?action=getData` ตรง ๆ ก็ได้ PII + PIN แอดมิน — ผิด PDPA |
| S2 | รหัสผ่านเก็บเป็น plaintext และเทียบด้วย string compare | `Code.js:642` | หลุดชีต = หลุดทุกบัญชี |
| S3 | `getUsers()` เปิดสาธารณะ คืน lineUserId + เบอร์โทรของผู้ใช้ทุกคน | `Code.js:90` | เก็บเกี่ยว PII ได้ทันที |
| S4 | **ไม่มี auth ที่ backend เลย** — ทุก action ใน `doPost` ยิงได้จากใครก็ได้ | `Code.js:38-86` | ใครก็ `deleteTeam` / `updateUserRole` ตัวเองเป็น admin / `verifyDonation` ได้ |
| S5 | สิทธิ์แอดมินเป็นแค่ PIN ฝั่ง client | `App.tsx` PinDialog | ตรงกับ pitfall **P5** ของ skill — ซ่อนใน UI ไม่ใช่การป้องกัน |
| **S6** | **LINE Login ไม่ตรวจ ID token — เชื่อ `lineUserId` ที่ client ส่งมาดิบ ๆ** | `Code.js:642` (`authType === 'line'` ค้นแถวจาก `data.lineUserId` แล้วคืน `role` ของแถวนั้น); `services/liffService.ts` ไม่มี `getIDToken()` เลย | **ยึดบัญชีแอดมินได้ใน 2 ขั้น** (ดู 2.1 ด้านล่าง) |

#### 2.1 ⚠️ ช่องโหว่ที่ต้องแก้ก่อนอื่นใด — ยึดสิทธิ์แอดมินได้ใน 2 คำขอ

S3 + S6 ต่อกันเป็นสายโจมตีที่สมบูรณ์ ไม่ต้องใช้เครื่องมือพิเศษ:

```
ขั้นที่ 1:  GET  /exec?action=getUsers
           → ได้ lineUserId ของผู้ใช้ทุกคน รวมของแอดมิน  (S3)

ขั้นที่ 2:  POST /exec  {"action":"auth","authType":"line",
                        "lineUserId":"<lineUserId ของแอดมิน>"}
           → server คืน { role: "admin" }  โดยไม่ตรวจสอบอะไรเลย  (S6)
           → client เก็บลง localStorage → เข้า AdminDashboard ได้เต็มรูปแบบ
```

จากนั้นทำได้ทุกอย่าง: ลบทีม, อนุมัติ/ปฏิเสธการสมัคร, แก้ผลการแข่งขัน, ดูข้อมูลผู้บริจาคทั้งหมด, เลื่อนบัญชีตัวเองเป็นแอดมินถาวรผ่าน `updateUserRole`

> **เมื่อเลือกให้ LINE Login เป็น auth หลัก ช่องโหว่นี้กลายเป็นความเสี่ยงอันดับหนึ่งของระบบ** — ต้องแก้ด้วยการ **verify ID token ฝั่ง server** (`liff.getIDToken()` → ยิงไป `https://api.line.me/oauth2/v2.1/verify` พร้อม `channel_id` แล้วเชื่อ `sub` จากผลลัพธ์เท่านั้น ไม่เชื่อ `lineUserId` ที่ client ส่ง) และ **ปิด `getUsers()` ไม่ให้เปิดสาธารณะ**
>
> แนวทางการ verify มีอยู่แล้วใน skill `line-miniapp-vote` (server-side ID token verification)

### 🔴 ระดับวิกฤต — ความเสถียร

| # | ปัญหา | หลักฐาน | ผลกระทบ |
|---|---|---|---|
| R1 | **เกือบทุกคำสั่งเขียนใช้ `mode: 'no-cors'`** → response เป็น opaque, ฟังก์ชัน `return true` เสมอ | `sheetService.ts` 20+ จุด | ผู้ใช้เห็น "สำเร็จ" ทั้งที่ server error / เกินโควตา → **นี่คือรากของอาการ "บันทึกแล้วข้อมูลหาย"** |
| R2 | ไม่ใช้ `LockService` เลย | ทั้งไฟล์ | สมัครพร้อมกัน → เช็คชื่อซ้ำหลุด, เขียนทับแถวกัน |
| R3 | `toggleEntryLike` เป็น read-modify-write บน CSV ในเซลล์เดียว | `Code.js:269` | กดไลก์พร้อมกัน = ไลก์หาย (lost update) |
| R4 | `saveKicks` append อย่างเดียว ไม่มี ID / ไม่ dedupe และถูกเรียกซ้ำจาก `saveMatch` ทุกครั้ง | `Code.js:640-641` | Kicks ซ้ำสะสม → สถิติเพี้ยน, ชีตบวม |
| R5 | ไม่มี transaction — `registerTeam` เขียน Teams สำเร็จแต่ Players ล้มได้ | `Code.js:621` | ทีมไม่มีนักเตะ, ข้อมูลกำพร้า |
| R6 | ไม่มี retry / idempotency | ทั้งระบบ | กดสมัครซ้ำ = ทีมซ้ำ |

### 🟠 ประสิทธิภาพ

| # | ปัญหา | ผลกระทบ |
|---|---|---|
| P1 | ทุกคำสั่งอ่านทั้งชีตด้วย `getDataRange().getValues()` แล้ววนลูปเชิงเส้น | O(n) ต่อ 1 operation — ยิ่งข้อมูลเยอะยิ่งช้าแบบเส้นตรง |
| P2 | `registerTeam` ทำ Drive upload สูงสุด 9 ไฟล์ + `appendRow` ทีละแถว 7 ครั้ง ในคำขอเดียว | ใกล้ชนลิมิต 6 นาที/execution → สมัครค้าง |
| P3 | อัปโหลดไฟล์เป็น base64 ฝังใน JSON body | payload โต +33%, กินหน่วยความจำ, ไม่มี progress จริง |
| P4 | โควตา Apps Script (~30 นาที execution/วัน, บัญชีฟรี) | **วันแข่งจริงที่คนเข้าพร้อมกันจะตัน** |
| P5 | `getData()` ส่งก้อนเดียวทั้งหมด ไม่มี pagination / section | โหลดแรกช้าขึ้นเรื่อย ๆ ตามจำนวนนัด/kick |
| P6 | แคช localStorage 5 นาที + no-cors | สมัครเสร็จแล้วรีเฟรชยังไม่เห็นทีมตัวเอง → ผู้ใช้สมัครซ้ำ |
| P7 | ไม่มี code splitting — AdminDashboard/LiveWall/ContestGallery รวมใน bundle เดียว | bundle แรกใหญ่เกินจำเป็นสำหรับผู้ชมทั่วไป |
| P8 | `index.html` โหลด React/lucide จาก CDN importmap **พร้อมกับ** Vite bundle + ใช้ Tailwind CDN | โหลดซ้ำซ้อน, Tailwind CDN ห้ามใช้ production (FOUC + ช้า) |

### 🟡 โครงสร้างข้อมูล

| # | ปัญหา | ผลกระทบ |
|---|---|---|
| D1 | **Matches เก็บชื่อทีมเป็น string** ไม่ใช่ FK — `StandingsView.tsx` จับคู่ด้วย `.name ===` ทั้งไฟล์ | เปลี่ยนชื่อทีม = ประวัติ/ตารางคะแนนพังทันที |
| D2 | Kicks ไม่มี PK | ลบ/แก้รายการเดี่ยวไม่ได้ |
| D3 | Config เป็น 1 แถว 24 คอลัมน์ตำแหน่งตายตัว | เพิ่ม field ต้องแก้ทั้ง reader และ writer พร้อมกัน แตกง่าย |
| D4 | `TournamentConfig` (prizes, objective, images) เป็น JSON string ในเซลล์เดียว | query/รายงานไม่ได้, ชนลิมิต 50,000 ตัวอักษร/เซลล์ |
| D5 | `color` เก็บเป็น JSON array string `["#2563EB","#FFFFFF"]` | ต้อง parse ทุกที่ที่ใช้ |
| D6 | `ContestEntries.LikedByUsers` เป็น CSV | ชนลิมิตเซลล์, นับไลก์ผิด, query ไม่ได้ |
| D7 | Teams ไม่ผูก FK กับ Schools (Schools ใช้แค่ autocomplete) | ข้อมูลโรงเรียนไม่ normalize |
| D8 | ไม่มี `created_at`/`updated_at` ที่เชื่อถือได้ทุกตาราง | ตรวจสอบย้อนหลังไม่ได้ |

### 🟡 คุณภาพโค้ด

| # | ปัญหา |
|---|---|
| C1 | `src/App.tsx` (73 KB) เป็น **dead code** — ไม่มีใคร import และ compile ไม่ผ่าน (อ้าง `./types`, `./components` ที่ไม่มีใน `src/`) |
| C2 | `services/geminiService.ts` เรียก `generateGeminiContent` ที่ hardcode คืน `"AI Response Placeholder"` — ฟีเจอร์ AI ตายแต่โค้ดยังเรียกอยู่ |
| C3 | `API_URL` hardcode ใน source ไม่มี `.env` / ไม่มีแยก dev-prod |
| C4 | `sw.js` ใช้ cache name คงที่ `penalty-pro-v2` ไม่ผูกกับ build hash | ผู้ใช้ค้างเวอร์ชันเก่า |
| C5 | `Code.js` เขียนเป็นบรรทัดยาวบรรทัดเดียวหลายฟังก์ชัน (บรรทัด 637-686) | รีวิว/แก้ไขยากมาก |
| C6 | ไม่มี test, ไม่มี lint config, ไม่มี CI ตรวจ type |

### 🔴 ระบบรับสมัคร — บั๊กและช่องว่าง (ตรงกับที่ร้องขอ)

| # | ปัญหา | หลักฐาน |
|---|---|---|
| **G1** | **`tournamentId` ถูก hardcode เป็น `'default'` ตอนสมัคร** และ `App.tsx` ไม่เคยส่ง prop tournamentId ให้ฟอร์ม | `RegistrationForm.tsx:340` → `registerTeam(payload, 'default', ...)`; `App.tsx:474-483` ไม่มี prop |
| | ⇒ **ไม่ว่าเลือกทัวร์นาเมนต์ไหน ทีมจะไปตกอยู่ที่ `default` ทั้งหมด** — ระบบหลายทัวร์นาเมนต์ใช้งานจริงไม่ได้ | |
| G2 | ตรวจ deadline / `maxTeams` เฉพาะฝั่ง client | ปิดรับสมัครแล้วยังยิง API ตรงเข้าไปได้ |
| G3 | จำนวนผู้เล่นล็อคตายตัวที่ 7 คน ไม่อ่าน `playersPerTeam` / `maxSubs` จาก config | `RegistrationForm.tsx:95` |
| G4 | ไม่มี draft / autosave — กรอก 4 ขั้น + 7 นักเตะ + 9 ไฟล์ ถ้าเน็ตหลุดหรือปิดแท็บ = เริ่มใหม่ทั้งหมด | |
| G5 | อัปโหลดไฟล์ทั้งหมดพร้อมกันตอนกดส่ง, ไม่มี retry, progress เป็นตัวเลขปลอม (setUploadProgress คงที่) | `RegistrationForm.tsx:259-280` |
| G6 | `compressImage` ไม่ทำ EXIF rotation → รูปจาก iPhone หมุน 90°; ไม่แปลง WebP; บีบเป็น JPEG 70% ที่ 1024px เท่านั้น | `RegistrationForm.tsx:24-58` |
| G7 | ไม่ validate เบอร์โทร (10 หลัก), วันเกิด, อายุตามรุ่นการแข่งขัน | |
| G8 | ผู้สมัครไม่ได้รับแจ้งเตือนเมื่อถูกอนุมัติ/ปฏิเสธ (มี `rejectReason` ในชีตแต่ไม่มีช่องทางแจ้ง) | |
| G9 | ไม่มีหน้าตรวจสถานะสาธารณะ / ไม่มีตัวนับ "สมัครแล้ว x/y ทีม" แบบสด | |

---

## 3. แผนย้ายฐานข้อมูลเป็น MySQL

### 3.1 Target stack

ตามแนวทาง skill `db-dashboard-builder` — **สอดคล้องกับข้อตัดสินใจที่ยืนยันแล้วในหัวข้อ 6**
(shared hosting เดิมที่มี PHP • ไฟล์เก็บ local แล้ว sync ขึ้น Drive เป็น backup • LINE Login เป็นหลัก, username/password เฉพาะแอดมิน):

```
React 19 + Vite (คงเดิม)
   │  fetch JSON จริง (มี response, มี error, มี ETag)
   ▼
PHP 8.x + PDO   (shared hosting)
   ├── api/public.php    — read, ?section=, file cache, ไม่ต้อง auth
   ├── api/admin.php     — read/write, Bearer token + role check ฝั่ง server
   ├── api/register.php  — สมัครทีม (idempotent)
   ├── api/upload.php    — อัปโหลดไฟล์ทีละไฟล์ (multipart)
   └── lib/ CorsHelper, AuthHelper, Cache, Db
   ▼
MySQL 8 — utf8mb4_unicode_ci ทั้ง DB (pitfall P2)
Storage — local `/uploads` + sync ขึ้น Drive แบบ async (skill `drive-upload`)
```

### 3.2 Schema ที่เสนอ (18 ชีต → 21 ตาราง)

หลักการสำคัญ:

1. **PK เป็น `BIGINT UNSIGNED AUTO_INCREMENT` และเก็บ `legacy_id VARCHAR(40) UNIQUE`** ไว้ทุกตารางหลัก (`T_1699…`, `P_…`, `DON_…`) — ทำให้ import ได้โดยไม่พัง URL/QR/ลิงก์เดิมที่แจกไปแล้ว
2. **collation เดียวกันทั้ง DB** ตั้งแต่ต้น — กัน pitfall P2 (`COLLATE` ใน JOIN ฆ่า index)
3. เลิกเก็บ JSON ในเซลล์ ยกเว้นที่เป็น config จริง ๆ

```
tournaments        id, legacy_id, name, type ENUM, status ENUM,
                   registration_deadline DATETIME, max_teams,
                   players_per_team, max_subs, half_time_duration,
                   registration_fee, bank_*, location_*, created_at, updated_at
tournament_prizes  id, tournament_id FK, rank_label, amount, description, winner_team_id FK
tournament_images  id, tournament_id FK, url, type ENUM, caption, sort_order
app_settings       setting_key PK, setting_value, is_public TINYINT   ← แทน Config 1 แถว 24 คอลัมน์
schools            id, legacy_id, name, district, province   (+FULLTEXT/prefix index สำหรับ autocomplete)
teams              id, legacy_id, tournament_id FK, school_id FK NULL, name, short_name,
                   color_primary, color_secondary, logo_url, status ENUM,
                   group_name, reject_reason, doc_url, slip_url,
                   district, province, director_name, manager_name, manager_phone,
                   coach_name, coach_phone, creator_user_id FK, line_user_id,
                   registered_at, created_at, updated_at
players            id, legacy_id, team_id FK, tournament_id FK, name, shirt_number,
                   position, photo_url, birth_date DATE, created_at
matches            id, legacy_id, tournament_id FK,
                   team_a_id FK, team_b_id FK,            ← เลิกอ้างด้วยชื่อ (D1)
                   team_a_name, team_b_name,               ← snapshot กันข้อมูลเก่าที่จับคู่ไม่ได้
                   score_a, score_b, winner ENUM('A','B','DRAW',NULL),
                   status ENUM, round_label, venue, scheduled_time,
                   livestream_url, livestream_cover, summary, played_at
kicks              id PK, match_id FK, round, team_side ENUM('A','B'),
                   player_name, player_id FK NULL, result ENUM, kicked_at
                   UNIQUE (match_id, round, team_side)     ← กัน duplicate ที่ระดับ DB (R4)
match_events       id, match_id FK, minute, type ENUM, player_name, team_side, related_player
users              id, legacy_id,
                   line_user_id VARCHAR(64) UNIQUE NULL,   ← ช่องทางหลัก (จาก `sub` ใน ID token เท่านั้น)
                   username VARCHAR(64) UNIQUE NULL,       ← เฉพาะแอดมิน/สตาฟ
                   password_hash VARCHAR(255) NULL,        ← argon2id เฉพาะแอดมิน/สตาฟ (S2)
                   display_name, role ENUM('admin','staff','user') DEFAULT 'user',
                   phone, picture_url, last_login, created_at
                   CHECK: role IN ('admin','staff') ⇒ password_hash IS NOT NULL
sessions           token_hash PK, user_id FK, role_snapshot, issued_at, expires_at,
                   revoked_at NULL                         ← เพิกถอน session ได้ (S4/S6)
donations          id, legacy_id, tournament_id FK, donor_name, amount DECIMAL(10,2),
                   phone, is_edonation, tax_id, address, slip_url, tax_file_url,
                   line_user_id, status ENUM, is_anonymous, created_at
news               id, legacy_id, tournament_id FK NULL, title, content,
                   image_url, document_url, published_at
predictions        id, match_id FK, user_id FK, prediction ENUM('A','B'), created_at
                   UNIQUE (match_id, user_id)              ← ทำให้ upsert เป็น atomic
contests           id, title, description, status ENUM, created_at, closing_date
contest_entries    id, contest_id FK, user_id FK, photo_url, caption,
                   like_count, share_count, created_at
entry_likes        entry_id FK, user_id FK, created_at, PRIMARY KEY(entry_id,user_id)  ← เลิก CSV (D6/R3)
contest_comments   id, entry_id FK, user_id FK, message, created_at
sponsors           id, tournament_id FK NULL, name, logo_url, type ENUM, sort_order
music_tracks       id, tournament_id FK NULL, name, url, type ENUM, sort_order
ticker_messages    id, tournament_id FK NULL, message, is_active, sort_order
uploads            id, entity_type, entity_id, local_path, public_url,
                   drive_file_id NULL, sync_status ENUM, created_at   ← สำหรับ drive-upload
idempotency_keys   key_hash PK, endpoint, response_json, created_at   ← กันสมัครซ้ำ (R6)
```

**Index ที่ต้องมีตั้งแต่วันแรก** (ทุกคอลัมน์ที่อยู่ใน JOIN ON / WHERE / GROUP BY):

```
teams            (tournament_id, status), UNIQUE (tournament_id, name), creator_user_id, line_user_id
players          (team_id), (tournament_id)
matches          (tournament_id, status, scheduled_time), (team_a_id), (team_b_id)
kicks            (match_id, round)
match_events     (match_id, minute)
donations        (tournament_id, status), (line_user_id)
predictions      (match_id), (user_id)
contest_entries  (contest_id, created_at DESC)
news             (tournament_id, published_at DESC)
schools          (name(32)), (province, district)
```

### 3.3 ชั้น API

**แยก public / admin ตั้งแต่ระดับ endpoint** (pitfall P5) — ไม่ใช่ซ่อนใน UI:

| Endpoint | Auth | Section |
|---|---|---|
| `public.php?section=bootstrap` | ไม่ต้อง | app_settings (`is_public=1` เท่านั้น), รายการทัวร์นาเมนต์ |
| `public.php?section=teams&tournament=X` | ไม่ต้อง | ทีม `status=Approved` + จำนวนนักเตะ (ไม่ส่งเบอร์โทร) |
| `public.php?section=schedule` | ไม่ต้อง | ตารางแข่ง + สถานะ |
| `public.php?section=standings` | ไม่ต้อง | คำนวณด้วย SQL ไม่ใช่ client |
| `public.php?section=live` | ไม่ต้อง | นัดที่ `status=Live` เท่านั้น — payload เล็ก, poll ถี่ได้ |
| `public.php?section=news\|contests\|sponsors` | ไม่ต้อง | |
| `admin.php?section=*` | **Bearer token + role** | ทีม Pending, PII ผู้บริจาค, ผู้ใช้, การอนุมัติ |
| `register.php` | user token | สมัครทีม + Idempotency-Key |
| `upload.php` | user token | multipart ทีละไฟล์ คืน URL |

กติกาที่ต้องบังคับตาม skill:

- **cache key ต้องครบทุกมิติ** (pitfall P6):
  `penalty_{v}_{section}_{tournament}_{admin0|1}_{page}_{limit}_{qhash}.json`
  และ **bump `$cacheVersion` ทุกครั้งที่เปลี่ยนรูปร่าง response**
- ทุก query อยู่ใน `try/catch` ของตัวเอง แล้วเติม `warnings[] = "Q3_STANDINGS_FAILED"` — ห้าม throw ออกจาก endpoint
- รองรับ `?debug=1` คืน `query_timings_ms` ตั้งแต่วันแรก
- **placeholder ห้ามซ้ำชื่อในคำสั่งเดียว** (pitfall P1 — `HY093`): ใช้ `:q_name`, `:q_school` แทน `:q` ซ้ำ
- ไม่ใส่ `LOWER()`/`CAST()`/`COLLATE` บนคอลัมน์ที่ JOIN (pitfall P2)
- feed ล่าสุด (ข่าว/นัดถัดไป/ผลงานล่าสุด) ต้อง **LIMIT ก่อน JOIN** (pitfall P4)
- ทุกตัวนับที่ผ่าน LEFT JOIN หลายชั้น ใช้ derived table pre-aggregate ไม่ใช่ `COUNT(*)` ตรง ๆ (pitfall P3)

**กติกา attribution เดียวของระบบ** (pitfall P7) — เขียนไว้ให้ทุก query ยึด:

> - จำนวนทีม/นักเตะ → นับผ่าน `teams.tournament_id`
> - สถิติผลการแข่ง → นับผ่าน `matches.tournament_id` และอ้างทีมด้วย `team_a_id/team_b_id` เท่านั้น (ห้ามจับคู่ด้วยชื่อ)
> - ยอดเงิน → `donations.tournament_id` + `status='Verified'` เท่านั้น
> - ทีมที่ยังไม่อนุมัติ ไม่นับในตัวเลขสาธารณะทุกจุด

### 3.4 ลำดับการย้าย — แผน 3 ราง (เพราะมีทัวร์นาเมนต์กำลังจะแข่ง)

**ข้อจำกัดที่กำหนดแผนทั้งหมด:** มีทัวร์นาเมนต์กำลังจะแข่งขัน ⇒ **ห้ามตัด backend ในช่วงนี้**
การเปลี่ยนระบบระหว่างที่คนกำลังสมัครและกำลังบันทึกผลสด เป็นความเสี่ยงที่ไม่คุ้ม
จึงแยกเป็น 3 ราง โดยราง A ทำทันที และราง B เดินขนานกันไปบน staging

---

#### 🔴 ราง A — ทำทันทีบน Apps Script เดิม (ก่อนแข่ง, ไม่แตะสถาปัตยกรรม)

เป้าหมาย: ให้ทัวร์นาเมนต์นี้ผ่านไปได้อย่างปลอดภัยและไม่มีข้อมูลหาย

| ลำดับ | งาน | เหตุผล | ความเสี่ยง |
|---|---|---|---|
| **A1** | **verify LINE ID token ฝั่ง server + ปิด `getUsers()` สาธารณะ** | ปิดสายโจมตียึดสิทธิ์แอดมิน (หัวข้อ 2.1) — วิกฤตที่สุด | ต่ำ-กลาง (ต้องมี LINE `channel_id`) |
| **A2** | เอา `adminPin` + PII ผู้บริจาค (เบอร์/เลขผู้เสียภาษี/ที่อยู่) ออกจาก `getData()` | ปิดการรั่วข้อมูล + ลดขนาด payload | ต่ำ |
| **A3** | ตรวจ role ฝั่ง server ก่อน action อันตราย (`deleteTeam`, `updateUserRole`, `verifyDonation`, `updateStatus`) | ตอนนี้ใครก็เรียกได้โดยไม่ต้องล็อกอิน | ต่ำ-กลาง |
| **A4** | **เลิก `no-cors` เฉพาะเส้นทางสมัคร + บันทึกผล** แล้วเช็คผลลัพธ์จริง | หยุดอาการ "บันทึกแล้วข้อมูลหาย" ในช่วงที่สำคัญที่สุด | กลาง (ต้องตั้ง CORS ให้ถูก) |
| **A5** | ใส่ `LockService.getScriptLock()` ใน `registerTeam` / `toggleEntryLike` / `submitPrediction` | กัน race condition ตอนคนสมัคร/ไลก์พร้อมกัน | ต่ำ |
| **A6** | **แก้ `tournamentId` hardcode** (ส่ง prop จาก `App.tsx`) | ถ้าทัวร์นาเมนต์ที่จะแข่งไม่ใช่ id `default` การสมัครกำลังตกผิดที่ทั้งหมด | ต่ำ |
| **A7** | Autosave draft ใบสมัครลง localStorage | ลดการกรอกซ้ำ/สมัครซ้ำระหว่างเปิดรับสมัคร | ต่ำ |
| **A8** | กันกดส่งซ้ำฝั่ง client + เช็คชื่อทีมซ้ำก่อนส่ง | กันทีมซ้ำในชีต | ต่ำ |

> **A6 ต้องตรวจก่อนลงมือ:** ถ้าทัวร์นาเมนต์ที่กำลังจะแข่งใช้ id `default` อยู่แล้ว บั๊กนี้ยังไม่แสดงอาการ
> แต่ถ้าเป็น `TRN_…` ⇒ **การสมัครทั้งหมดกำลังตกไปที่ทัวร์นาเมนต์ผิด** ต้องแก้เป็นอันดับแรกคู่กับ A1

#### 🟢 ราง B — สร้าง MySQL ขนานกันบน staging (ไม่กระทบ production)

| Phase | งาน | เกณฑ์ผ่าน |
|---|---|---|
| **B0** | สำรวจ hosting (PHP version, MySQL version, มี Imagick? cron? connection limit) → สร้าง DB + schema + index + collation | `EXPLAIN` คิวรีที่หนักที่สุดผ่านโดยไม่มี full scan |
| **B1** | Export Sheets → JSON (สคริปต์ครั้งเดียว) → Importer PHP; จับคู่ `matches.team_*_name` → `team_id`; **แถวที่จับคู่ไม่ได้ให้ทิ้ง + เขียน log** | จำนวนแถวตรงกับชีต, มี `import_discarded.log` ให้ตรวจย้อนหลัง |
| **B2** | Read API (`public.php?section=…`) + file cache + `?debug=1` | ทุกตัวเลขตรงกับระบบเดิม 100% (เทียบทีละการ์ด) |
| **B3** | Auth จริง: LINE ID token verification + session token + argon2id เฉพาะแอดมิน + role check ทุก endpoint | ทดสอบสายโจมตีในหัวข้อ 2.1 ซ้ำ ต้องล้มเหลวทั้งสองขั้น |
| **B4** | Write API: `register.php` (idempotent), `upload.php` (multipart ทีละไฟล์), admin actions | สมัคร/อนุมัติ/บันทึกผลครบ, เขียนล้มเหลวต้องคืน error จริง |
| **B5** | Storage: local `/uploads` + async sync ขึ้น Drive (skill `drive-upload`) + WebP/EXIF (skill `image-upload-webp`) | ไฟล์เดิมเข้าถึงได้ครบ, ไฟล์ใหม่มีทั้ง local และ Drive |
| **B6** | Frontend ต่อ API ใหม่หลัง feature flag + lazy load + ลบ CDN importmap | ใช้งานครบทุกหน้าบน staging |

#### ⚪ ราง C — ตัดระบบ (หลังทัวร์นาเมนต์จบ)

| ลำดับ | งาน |
|---|---|
| **C1** | Freeze การเขียนบน Sheets → import รอบสุดท้าย (delta) → verify ตัวเลขอีกครั้ง |
| **C2** | สลับ frontend ไป MySQL 100% (คง flag ย้อนกลับได้ 1 สัปดาห์) |
| **C3** | บังคับแอดมินทุกคนตั้งรหัสใหม่ (รหัสเดิมเป็น plaintext ⇒ ถือว่าหลุดแล้ว) + ยกเลิก `adminPin` |
| **C4** | Apps Script เหลือ read-only 1 เดือน แล้วปิด; เก็บ Sheets เป็น archive |
| **C5** | ตั้ง cron warm cache ทุก 4 นาที + บันทึก `?debug=1` baseline ไว้ใน README |

> **เรื่องข้อมูล match เก่า (ตามที่ตัดสินใจ — ทิ้ง):** แถว `matches` ที่จับคู่ `team_id` ไม่ได้จะถูกทิ้งใน B1
> แต่ต้องเขียน `import_discarded.log` พร้อมชื่อทีมและวันที่ไว้ทุกแถว และ**ตรวจจำนวนที่ทิ้งก่อนเดินต่อ** —
> ถ้าทิ้งเยอะกว่าที่คาด (เช่นเกิน 10% ของนัดทั้งหมด) ควรกลับมาทบทวนอีกครั้งก่อนยืนยัน

---

## 4. แผนยกระดับระบบรับสมัครทีม

### 4.1 แก้บั๊กที่บล็อกการใช้งานจริง

1. **[G1] แก้ `tournamentId` hardcode** — ส่ง `currentTournamentId` เป็น prop ลง `RegistrationForm` และใช้ค่านั้นแทน `'default'`
   *(แก้ได้ทันทีก่อนย้าย MySQL — เป็นการแก้บรรทัดเดียว)*
2. **[G2] ย้ายการตรวจ deadline / maxTeams ไปฝั่ง server** — คืน error code ชัดเจน (`REG_CLOSED`, `REG_FULL`, `DUPLICATE_NAME`) ให้ UI แสดงข้อความไทยที่ถูกต้อง
3. **[R1] เลิก `mode:'no-cors'`** — ให้ backend ตอบ JSON จริง + CORS header ถูกต้อง แล้วให้ client เช็คผลลัพธ์ (ข้อนี้แก้ได้ทั้งระบบพร้อมกันตอนย้าย PHP)
4. **[D1] อ้างทีมด้วย `team_id`** ในทุก match — แก้ต้นเหตุตารางคะแนนเพี้ยนเวลาเปลี่ยนชื่อทีม

### 4.2 ทำให้ "สมัครง่าย พร้อมใช้งาน"

| ฟีเจอร์ | รายละเอียด | ผลที่ได้ |
|---|---|---|
| **อัปโหลดแยกจากการส่งฟอร์ม** | เลือกไฟล์ปุ๊บอัปโหลดทันทีผ่าน `upload.php` (multipart) เก็บ URL ไว้ใน state; ตอนกดส่งจริงส่งแค่ JSON เล็ก ๆ | เร็วขึ้นมาก, progress จริง, ไฟล์ไหนล้มก็ลองใหม่เฉพาะไฟล์นั้น |
| **Autosave draft** | เก็บทุก field ลง localStorage อัตโนมัติ + ปุ่ม "กรอกต่อจากเดิม" | เน็ตหลุด/ปิดแท็บแล้วกลับมากรอกต่อได้ |
| **Idempotency-Key** | client สร้าง UUID ต่อ 1 การสมัคร ส่งเป็น header; server จำ 24 ชม. | กดซ้ำ/เน็ตกระตุก ไม่เกิดทีมซ้ำ |
| **จำนวนนักเตะตาม config** | อ่าน `players_per_team` + `max_subs` จากทัวร์นาเมนต์ แทนเลข 7 ตายตัว | ใช้กับ 7v7 / 11v11 / เตะจุดโทษ ได้ในระบบเดียว |
| **Validation ครบ** | เบอร์โทร 10 หลัก, วันเกิด, ตรวจอายุตามรุ่น, ชนิด/ขนาดไฟล์ก่อนอัปโหลด, กันเลขเสื้อซ้ำในทีม | ลดงานตรวจสอบของแอดมินอย่างมาก |
| **รูปภาพ WebP + EXIF rotate** | ใช้ skill `image-upload-webp` (Canvas ฝั่ง client + Imagick/GD ฝั่ง PHP) | รูปจาก iPhone ไม่หมุน, ประหยัด bandwidth 60-80% |
| **หน้า "ทีมของฉัน"** | ดู/แก้ไขได้จนถึง deadline, เห็นสถานะ (รออนุมัติ/อนุมัติ/ถูกปฏิเสธ + เหตุผล) | ลดคำถามเข้าแอดมิน |
| **แจ้งเตือนผลอนุมัติ** | Web Push (skill `production-pwa`) และ/หรือ LINE (มี `line_user_id` อยู่แล้ว) | ผู้สมัครรู้ผลทันที |
| **ตัวนับสาธารณะ** | "สมัครแล้ว 18/24 ทีม • ปิดรับ 20 ส.ค." บนหน้าแรก + ปิดปุ่มอัตโนมัติเมื่อเต็ม | ความคาดหวังตรงกัน ลดการสมัครเกิน |
| **ใบสมัคร PDF + QR** | พิมพ์ใบสมัครพร้อม QR ลิงก์ตรวจสถานะทีม | ใช้ยื่นเอกสารจริงได้ |

### 4.3 เป้าหมายประสิทธิภาพหลังย้าย

| ตัวชี้วัด | ปัจจุบัน (ประมาณ) | เป้าหมาย |
|---|---|---|
| โหลดหน้าแรก (ข้อมูล) | 3-8 วิ (getData ทั้งก้อน) | < 500 ms (section + file cache) |
| ส่งใบสมัคร 1 ทีม (7 คน + 9 ไฟล์) | 30-90 วิ / เสี่ยง timeout | < 3 วิ (ไฟล์อัปโหลดล่วงหน้าแล้ว) |
| อัปเดตคะแนนสด | ทุก 5 นาที (แคช) | 5-10 วิ (`section=live` payload เล็ก + ETag) |
| ผู้ใช้พร้อมกันวันแข่ง | ตันตามโควตา Apps Script | หลักร้อย (cache + cron warm ทุก 4 นาที) |
| bundle แรก | ทั้งแอปรวม admin | แยก chunk: admin/livewall/gallery lazy load |

---

## 5. งานที่ทำได้ทันทีบน Apps Script เดิม (= ราง A)

จัดลำดับตาม **ความเสี่ยงที่เกิดขึ้นจริงในช่วงทัวร์นาเมนต์ที่กำลังจะแข่ง**

| ลำดับ | งาน | ผลกระทบ | ความเสี่ยงในการแก้ |
|---|---|---|---|
| **1** | verify LINE ID token ฝั่ง server + ปิด `getUsers()` สาธารณะ | **ปิดสายโจมตียึดสิทธิ์แอดมิน** (2.1) | ต่ำ-กลาง |
| **2** | เช็คว่าทัวร์นาเมนต์ที่จะแข่งใช้ id อะไร → ถ้าไม่ใช่ `default` แก้ `tournamentId` hardcode ทันที | การสมัครไปตกทัวร์นาเมนต์ถูกต้อง | ต่ำ |
| **3** | เอา `adminPin` + PII ผู้บริจาคออกจาก `getData()` | ปิดการรั่วข้อมูล + payload เล็กลง | ต่ำ |
| **4** | ตรวจ role ฝั่ง server ก่อน action อันตราย | กันการลบทีม/แก้ผลจากคนนอก | ต่ำ-กลาง |
| **5** | `LockService` ใน `registerTeam` / `toggleEntryLike` / `submitPrediction` | กัน race condition ช่วงคนสมัครพร้อมกัน | ต่ำ |
| **6** | เลิก `no-cors` เฉพาะเส้นทางสมัคร + บันทึกผล | หยุดอาการ "บันทึกแล้วข้อมูลหาย" | กลาง |
| **7** | Autosave draft ใบสมัคร + กันกดส่งซ้ำ | ลดการกรอกซ้ำและทีมซ้ำ | ต่ำ |
| **8** | ลบ `src/App.tsx` (dead code 73 KB) | ลดความสับสนก่อนเริ่มราง B | ต่ำ |

**เลื่อนไปทำในราง B (ห้ามทำช่วงก่อนแข่ง — เสี่ยงพังหน้าใช้งาน):**

| งาน | เหตุผลที่เลื่อน |
|---|---|
| เอา importmap CDN ออกจาก `index.html` + Tailwind แบบ build | เปลี่ยนวิธีโหลดทั้งแอป ถ้าพลาดคือขาวทั้งหน้า |
| `React.lazy` ให้ AdminDashboard / LiveWall / ContestGallery | ควรทำพร้อมการรื้อ frontend ใน B6 |
| ผูก `CACHE_NAME` ใน `sw.js` กับ build hash | เกี่ยวกับ build pipeline ทำพร้อม B6 |

---

## 6. ข้อตัดสินใจ (ยืนยันแล้ว — 11 ส.ค. 2569)

| # | ประเด็น | ข้อสรุป | ผลต่อแผน |
|---|---|---|---|
| 1 | โฮสต์ MySQL | **shared hosting เดิมที่มี PHP อยู่แล้ว** | ต้องสำรวจ PHP/MySQL version, connection limit, cron, Imagick ใน B0 — เข้ากับ skill `db-dashboard-builder` ตรง ๆ |
| 2 | ไฟล์อัปโหลด | **เก็บ local เป็นหลัก + async sync ขึ้น Drive เป็น backup** | ใช้ skill `drive-upload` (service account + retry queue) ใน B5; ต้องมีตาราง `uploads` ติดตามสถานะ sync |
| 3 | Auth | **LINE Login เป็นหลัก, username/password เฉพาะแอดมิน** | **ยกระดับ A1/B3 เป็นงานสำคัญสูงสุด** — ต้อง verify ID token ฝั่ง server (skill `line-miniapp-vote`); `users.password_hash` เป็น NULL ได้สำหรับผู้ใช้ทั่วไป |
| 4 | ช่วงเวลาตัดระบบ | **มีทัวร์นาเมนต์กำลังจะแข่ง** | **เปลี่ยนแผนเป็น 3 ราง (3.4)** — ราง A ทำทันทีบนระบบเดิม, ราง B สร้างขนานบน staging, ตัดระบบ (ราง C) หลังแข่งจบ |
| 5 | match เก่าที่จับคู่ทีมไม่ได้ | **ทิ้ง** | B1 ทิ้งได้เลย แต่ต้องเขียน `import_discarded.log` และตรวจจำนวนก่อนเดินต่อ |

---

## 7. ขั้นถัดไปที่แนะนำ

1. **ตรวจ id ของทัวร์นาเมนต์ที่กำลังจะแข่ง** (ในชีต `Tournaments`) — ตัวนี้ตัดสินว่าบั๊ก G1 กำลังสร้างความเสียหายอยู่จริงหรือยังไม่แสดงอาการ
2. **ลงมือราง A ข้อ 1-5** — ปิดช่องโหว่ยึดสิทธิ์แอดมินก่อนเปิดรับสมัคร/เริ่มแข่ง
3. **หาข้อมูล hosting สำหรับ B0** — PHP version, MySQL version, มี cron ไหม, มี Imagick ไหม, connection limit เท่าไร
4. **เริ่มราง B0-B1** — ร่าง `schema.sql` ฉบับเต็ม + สคริปต์ export จาก Sheets (ทำบน staging ไม่กระทบระบบที่ใช้งาน)
5. ใช้รูปแบบ `PROMPT_B0.md` … `PROMPT_B6.md` ตามแนวทาง skill เพื่อส่งงานต่อเป็นเฟส
