-- ---------------------------------------------------------------------
-- 24. เทมเพลตเกียรติบัตรแบบยืดหยุ่น + QR ตรวจสอบ
--
-- ── ทำไมเก็บเป็น JSON ไม่ใช่คอลัมน์ ─────────────────────────────────
-- เทมเพลตมีราว 25 ค่า และมี "ผู้ลงนามหลายคน" ซึ่งเป็น array ถ้าแตกเป็น
-- คอลัมน์จะได้ tournaments ที่มี cert_* เกือบ 40 คอลัมน์ และเพิ่มผู้ลงนาม
-- คนที่ 3 ทีไรต้องทำ migration ใหม่ทุกที
--
-- ค่าที่ "ฟีเจอร์อื่นอ่านด้วย" ยังเป็นคอลัมน์เหมือนเดิม ไม่ย้ายมา JSON
--   cert_public       -> data.php ใช้ตัดสินว่าปุ่มหน้าแรกโผล่ไหม
--   cert_no_sponsor   -> หน้า /sponsors ใช้ออกเลขใบอนุโมทนา
--   cert_signer_*     -> หน้า /sponsors ใช้เป็นค่าตั้งต้นผู้ลงนาม
-- ถ้าย้ายไป JSON ฟีเจอร์พวกนั้นต้องมาแกะ JSON เอง ซึ่งไม่คุ้ม
--
-- LONGTEXT ไม่ใช่ JSON type เพราะโฮสต์ยังเป็น MariaDB ที่ไม่การันตีว่ารองรับ
--
-- ⚠️ ต้องรัน db/21 ถึง db/23 ก่อนไฟล์นี้
-- ---------------------------------------------------------------------

CREATE TABLE certificate_templates (
  tournament_id VARCHAR(40) NOT NULL,
  role          ENUM('Player','Coach','Referee') NOT NULL,
  config_json   LONGTEXT    NOT NULL,
  updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, role),
  CONSTRAINT fk_certtpl_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='เทมเพลตเกียรติบัตรต่อรายการต่อบทบาท — ไม่มีแถว = ใช้ค่าตั้งต้น';

-- ── QR ตรวจสอบ ──────────────────────────────────────────────────────
-- token สุ่มแยกจากเลขที่ใบ เพราะเลขที่เรียงกัน 001 002 003 ถ้าเอาไปใส่ URL
-- ใครก็ไล่ดูรายชื่อเด็กทั้งงานได้ด้วยการนับเลขขึ้นไปเรื่อย ๆ
ALTER TABLE certificate_issues
  ADD COLUMN verify_token CHAR(22) NULL
    COMMENT 'token สุ่มสำหรับ QR — NULL คือใบที่ออกก่อนมีฟีเจอร์นี้'
    AFTER seq,
  ADD UNIQUE KEY uq_verify_token (verify_token);

ALTER TABLE tournaments
  ADD COLUMN cert_verify_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = พิมพ์ QR ลงใบ และเปิดหน้า /verify ให้ตรวจสอบได้'
    AFTER cert_public;
