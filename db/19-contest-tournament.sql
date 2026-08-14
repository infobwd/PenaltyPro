-- ---------------------------------------------------------------------
-- 19. ผูกการประกวดภาพถ่ายกับรายการแข่งขัน
--
-- เดิม contests ไม่มี tournament_id เลย จอ Live Wall จึงดึงภาพจาก
-- "ทุกการประกวดที่เคยมี" มาขึ้นสไลด์ Photo Contest Highlight
-- ผลคือระหว่างจัดครั้งที่ 5 จอในสนามขึ้นภาพของครั้งที่ 3 ปนอยู่
--
-- NULL = การประกวดส่วนกลาง ใช้ได้ทุกรายการ (ของเดิมทั้งหมดเป็นแบบนี้)
-- จึงไม่ต้องแก้ข้อมูลย้อนหลัง — เจ้าภาพค่อยเข้าไประบุรายการให้ทีหลัง
--
-- ⚠️ ต้องรันไฟล์นี้ ไม่งั้นสไลด์ภาพถ่ายจะยังปนข้ามรายการเหมือนเดิม
-- ---------------------------------------------------------------------

ALTER TABLE contests
  ADD COLUMN tournament_id VARCHAR(40) NULL
    COMMENT 'NULL = การประกวดส่วนกลาง ใช้ได้ทุกรายการ'
    AFTER contest_id,
  ADD KEY idx_contests_tournament (tournament_id),
  ADD CONSTRAINT fk_contest_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE SET NULL;
