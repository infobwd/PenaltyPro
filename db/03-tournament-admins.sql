-- =====================================================================
--  ผู้ดูแลประจำรายการแข่งขัน (รันหลัง 01-schema.sql)
--
--  ที่มา: การแข่งขันวนสนามไปแต่ละโรงเรียน โรงเรียนที่เป็นเจ้าภาพปีนั้นควร
--  ตั้งค่ารายการของตัวเองได้ โดยไม่ต้องให้แอดมินส่วนกลางทำให้ทุกอย่าง
--  และต้องแก้ได้ "เฉพาะรายการของตัวเอง" ไม่ใช่ทุกรายการในระบบ
--
--  โครงสิทธิ์หลังไฟล์นี้:
--    users.role = 'admin'        -> ทำได้ทุกอย่าง ทุกรายการ (ส่วนกลาง)
--    tournament_managers         -> ทำได้เฉพาะรายการที่ถูกมอบหมาย
--    users.role = 'staff'        -> ช่วยงานทั่วไป แต่ไม่ได้ตั้งค่ารายการ
--    รหัสโรงเรียน                 -> แก้ได้เฉพาะทีมของโรงเรียนตัวเอง
-- =====================================================================

SET NAMES utf8mb4;

-- โรงเรียนเจ้าภาพของรายการนี้ (ใช้แสดงผลและเป็นค่าตั้งต้นตอนมอบสิทธิ์)
ALTER TABLE tournaments
  ADD COLUMN host_school_id VARCHAR(40) NULL
      COMMENT 'โรงเรียนเจ้าภาพปีนั้น — การแข่งขันวนสนามไปแต่ละโรงเรียน'
      AFTER status,
  ADD KEY idx_tournaments_host (host_school_id),
  ADD CONSTRAINT fk_tournaments_host FOREIGN KEY (host_school_id)
      REFERENCES schools (school_id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE tournament_managers (
  tournament_id VARCHAR(40)  NOT NULL,
  user_id       VARCHAR(40)  NOT NULL,
  school_id     VARCHAR(40)  NULL COMMENT 'สังกัดของผู้ดูแลคนนี้ ไว้แสดงผล',
  note          VARCHAR(255) NOT NULL DEFAULT '',
  granted_by    VARCHAR(40)  NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (tournament_id, user_id),
  KEY idx_tmgr_user (user_id),
  KEY idx_tmgr_school (school_id),

  CONSTRAINT fk_tmgr_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_tmgr_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_tmgr_school FOREIGN KEY (school_id)
    REFERENCES schools (school_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_tmgr_granter FOREIGN KEY (granted_by)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='ผู้ดูแลที่ทำได้เฉพาะรายการที่ระบุ — ไม่ใช่แอดมินทั้งระบบ';

-- ตารางนี้ตั้งใจ "ไม่" ให้ผู้ดูแลรายการมอบสิทธิ์ต่อให้คนอื่นได้
-- (เฉพาะ role='admin' ส่วนกลางเท่านั้นที่เพิ่ม/ถอดคนในตารางนี้ได้)
-- ไม่งั้นสิทธิ์จะกระจายออกไปเรื่อย ๆ จนตามไม่ทันว่าใครแก้อะไรได้บ้าง
