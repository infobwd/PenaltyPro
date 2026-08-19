-- ---------------------------------------------------------------------
-- 21. ใบเกียรติบัตร — ค่าตั้งประจำรายการ และเลขที่ที่ออกไปแล้ว
--
-- เจ้าภาพตั้งครั้งเดียวต่อรายการ แล้วออกใบให้ใครกี่คนก็ได้โดยไม่ต้องพิมพ์
-- ชื่อผู้ลงนามและแนบลายเซ็นใหม่ทุกครั้ง (ซึ่งเป็นที่มาของใบที่ลงนามไม่ตรงกัน
-- ในงานเดียวกัน)
--
-- ── เลขที่ใบ ────────────────────────────────────────────────────────
-- แยกเลขตามบทบาท: นักกีฬา / ผู้ควบคุมทีม / กรรมการ เดินเลขคนละชุด
-- รูปแบบเก็บเป็นข้อความที่มี {n} เป็นช่องเลข เช่น "ก.ท. {n}/2569"
--
-- certificate_issues เก็บเลขที่ออกไปแล้วเพื่อให้ "คนเดิมได้เลขเดิมเสมอ"
-- ถ้าคำนวณสด ๆ ตอนพิมพ์ เลขจะขยับทุกครั้งที่มีคนเพิ่ม/ถอนออกจากรายการ
-- แล้วใบที่แจกไปแล้วกับใบที่พิมพ์ใหม่จะเลขไม่ตรงกัน
--
-- ⚠️ ต้องรันไฟล์นี้ ไม่งั้นหน้าเกียรติบัตรจะเปิดไม่ได้ (500)
-- ---------------------------------------------------------------------

ALTER TABLE tournaments
  ADD COLUMN cert_title VARCHAR(200) NOT NULL DEFAULT ''
    COMMENT 'หัวเรื่องบนใบ — ว่างคือใช้ "เกียรติบัตร"'
    AFTER doc_template_url,
  ADD COLUMN cert_signer_name VARCHAR(150) NOT NULL DEFAULT '' AFTER cert_title,
  ADD COLUMN cert_signer_title VARCHAR(200) NOT NULL DEFAULT '' AFTER cert_signer_name,
  ADD COLUMN cert_signature_url VARCHAR(500) NOT NULL DEFAULT '' AFTER cert_signer_title,
  -- ข้อความกลางใบ แยกตามบทบาท ใช้ {name} {team} {tournament} แทนค่าได้
  ADD COLUMN cert_body_player TEXT NULL AFTER cert_signature_url,
  ADD COLUMN cert_body_coach TEXT NULL AFTER cert_body_player,
  ADD COLUMN cert_body_referee TEXT NULL AFTER cert_body_coach,
  -- รูปแบบเลขที่ ใช้ {n} เป็นช่องเลขลำดับ
  ADD COLUMN cert_no_player VARCHAR(100) NOT NULL DEFAULT '' AFTER cert_body_referee,
  ADD COLUMN cert_no_coach VARCHAR(100) NOT NULL DEFAULT '' AFTER cert_no_player,
  ADD COLUMN cert_no_referee VARCHAR(100) NOT NULL DEFAULT '' AFTER cert_no_coach,
  ADD COLUMN cert_no_digits TINYINT UNSIGNED NOT NULL DEFAULT 3
    COMMENT 'เติมศูนย์หน้าเลขให้ครบกี่หลัก เช่น 3 -> 001'
    AFTER cert_no_referee;

CREATE TABLE certificate_issues (
  tournament_id VARCHAR(40)  NOT NULL,
  role          ENUM('Player','Coach','Referee') NOT NULL,
  -- player_id / user_id / หรือชื่อที่พิมพ์เอง — ตัวระบุว่าใบนี้ของใคร
  subject_key   VARCHAR(120) NOT NULL,
  subject_name  VARCHAR(255) NOT NULL DEFAULT '',
  team_name     VARCHAR(255) NOT NULL DEFAULT '',
  seq           INT UNSIGNED NOT NULL,
  issued_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, role, subject_key),
  -- เลขห้ามซ้ำในบทบาทเดียวกันของรายการเดียวกัน
  UNIQUE KEY uq_cert_seq (tournament_id, role, seq),
  CONSTRAINT fk_cert_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
