-- ---------------------------------------------------------------------
-- 23. หน้าตาเกียรติบัตร — ภาพพื้นหลังและโซนวางข้อความ
--
-- ── ทำไมแยกพื้นหลังตามบทบาท ─────────────────────────────────────────
-- งานจริงมักออกแบบใบนักกีฬากับใบกรรมการคนละแบบ (สี ตราสัญลักษณ์ ข้อความ
-- ประกอบต่างกัน) ถ้าใช้ภาพเดียวทั้งงานเจ้าภาพจะต้องเลือกอย่างใดอย่างหนึ่ง
--
-- ── ทำไมเป็นโซนสำเร็จรูป ไม่ใช่พิกัดอิสระ ──────────────────────────
-- พื้นหลังที่โรงเรียนออกแบบมักเว้นที่ว่างไว้เป็นก้อนเดียว (บน กลาง หรือล่าง)
-- การให้เลือกโซนจึงครอบคลุมของจริงเกือบทั้งหมด และไม่ต้องมีตัวแก้พิกัด
-- ที่ผู้ใช้ต้องลองผิดลองถูกทีละมิลลิเมตร
--
-- ⚠️ ต้องรัน db/21 และ db/22 ก่อนไฟล์นี้
-- ---------------------------------------------------------------------

ALTER TABLE tournaments
  ADD COLUMN cert_bg_player VARCHAR(500) NOT NULL DEFAULT ''
    COMMENT 'ภาพพื้นหลังใบนักกีฬา — ว่างคือใช้กรอบเรียบที่ระบบวาดให้'
    AFTER cert_no_sponsor,
  ADD COLUMN cert_bg_coach   VARCHAR(500) NOT NULL DEFAULT '' AFTER cert_bg_player,
  ADD COLUMN cert_bg_referee VARCHAR(500) NOT NULL DEFAULT '' AFTER cert_bg_coach,

  -- โซนที่วางบล็อกข้อความบนหน้ากระดาษ ให้เลี่ยงลวดลายของพื้นหลังได้
  ADD COLUMN cert_zone_player  ENUM('top','middle','bottom') NOT NULL DEFAULT 'middle'
    AFTER cert_bg_referee,
  ADD COLUMN cert_zone_coach   ENUM('top','middle','bottom') NOT NULL DEFAULT 'middle'
    AFTER cert_zone_player,
  ADD COLUMN cert_zone_referee ENUM('top','middle','bottom') NOT NULL DEFAULT 'middle'
    AFTER cert_zone_coach;
