-- ---------------------------------------------------------------------
-- 25. แม่แบบเกียรติบัตรที่บันทึกไว้ใช้ซ้ำ
--
-- ── ทำไมไม่ผูกกับรายการแข่งขัน ──────────────────────────────────────
-- เหตุผลหลักที่ต้องมีแม่แบบคือ "ออกแบบครั้งเดียว ใช้ได้ทุกที่" —
-- ใช้กับบทบาทอื่นในงานเดียวกัน และใช้กับงานปีถัดไป ถ้าผูกกับรายการ
-- ก็จะกลับไปเป็นปัญหาเดิมคือต้องตั้งใหม่ทุกงาน
--
-- แบบเกียรติบัตรไม่ใช่ข้อมูลลับ (เป็นแค่ข้อความ สี ตำแหน่ง และลิงก์รูป)
-- จึงให้ผู้ดูแลรายการทุกคนหยิบไปใช้ได้ แต่ลบได้เฉพาะคนสร้างกับส่วนกลาง
--
-- ⚠️ ต้องรัน db/21 ถึง db/24 ก่อนไฟล์นี้
-- ---------------------------------------------------------------------

CREATE TABLE certificate_presets (
  preset_id   VARCHAR(40)  NOT NULL,
  name        VARCHAR(120) NOT NULL,
  config_json LONGTEXT     NOT NULL,
  created_by  VARCHAR(40)  NULL COMMENT 'user_id ของคนที่บันทึกไว้',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (preset_id),
  -- ชื่อซ้ำไม่ได้ เพื่อให้ "บันทึกทับชื่อเดิม" เป็นการอัปเดต ไม่ใช่สร้างซ้ำ
  UNIQUE KEY uq_preset_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='แม่แบบเกียรติบัตร ใช้ข้ามบทบาทและข้ามรายการแข่งขันได้';
