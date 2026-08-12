-- เปิด/ปิดการรับสมัครและการแก้ไขรายชื่อแยกกันในแต่ละรายการแข่งขัน
-- รันครั้งเดียวกับฐานข้อมูลที่สร้างจาก schema รุ่นก่อนหน้า

ALTER TABLE tournaments
  ADD COLUMN registration_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER registration_deadline,
  ADD COLUMN team_editing_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER registration_enabled,
  ADD COLUMN team_edit_deadline DATETIME NULL AFTER team_editing_enabled;
