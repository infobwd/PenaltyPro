-- ---------------------------------------------------------------------
-- 18. บัญชีรับเงิน "ร่วมสนับสนุนโครงการ" บนหน้าแรก
--
-- แยกจาก sponsor_donation_* (db/16) เพราะเป็นคนละกระเป๋าและมักคนละบัญชี:
--   sponsor_donation_*  = เงินผู้สนับสนุนการจัดแข่งขัน เข้าบัญชีของรายการ
--   project_donation_*  = เงินร่วมโครงการพัฒนาโรงเรียน ซึ่งเจ้าภาพมักให้เข้า
--                         บัญชีของสถานศึกษาโดยตรง ไม่ปนกับเงินจัดงาน
--
-- เดิมปุ่ม "ร่วมบริจาค" ในการ์ดโครงการหน้าแรกไม่มีที่ตั้งค่าเลย — ใช้บัญชี
-- ค่าสมัครของรายการเสมอ (ดู App.tsx ที่เรียก setIsDonationOpen ตรง ๆ)
--
-- ⚠️ ต้องรันไฟล์นี้ ไม่งั้นแท็บ "โครงการ" ในกล่องบัญชี/QR ของหน้า Sponsors
-- จะกรอกได้แต่ไม่บันทึกอะไรเลย
--
-- use_existing = 1 (ค่าเริ่มต้น) คือใช้บัญชีเดิมของรายการเหมือนที่เป็นอยู่
-- พฤติกรรมจึงไม่เปลี่ยนจนกว่าเจ้าภาพจะเข้าไปตั้งค่าเอง
-- ---------------------------------------------------------------------

ALTER TABLE tournaments
  ADD COLUMN project_donation_use_existing TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1 = ใช้บัญชีค่าสมัครของรายการ / 0 = ใช้บัญชีที่กำหนดด้านล่าง'
    AFTER sponsor_account_name,
  ADD COLUMN project_donation_qr_url VARCHAR(500) NOT NULL DEFAULT ''
    AFTER project_donation_use_existing,
  ADD COLUMN project_bank_name VARCHAR(120) NOT NULL DEFAULT ''
    AFTER project_donation_qr_url,
  ADD COLUMN project_bank_account VARCHAR(64) NOT NULL DEFAULT ''
    AFTER project_bank_name,
  ADD COLUMN project_account_name VARCHAR(150) NOT NULL DEFAULT ''
    AFTER project_bank_account;
