-- ผูกบัญชีผู้ใช้กับโรงเรียนต้นสังกัด
--
-- ที่ต้องมี: ผู้ใช้ที่เข้าผ่าน LINE ตอนนี้เป็นแค่ "คนหนึ่ง" ในระบบ ไม่รู้ว่ามาจาก
-- โรงเรียนไหน ทำให้ทำอะไรที่อิงโรงเรียนไม่ได้เลย เช่น กรองข่าว/รูปประกวดของ
-- โรงเรียนตัวเอง หรือให้ครูเห็นทีมของโรงเรียนตัวเองทันทีโดยไม่ต้องกรอกรหัส 8 ตัว
--
-- ON DELETE SET NULL เพราะโรงเรียนถูกปิดใช้งานได้ แต่บัญชีผู้ใช้ต้องไม่หายตาม
-- (คนละอายุการใช้งานกัน — บัญชีอยู่ข้ามปี ส่วนโรงเรียนอาจถูกยุบ/รวม)

SET NAMES utf8mb4;

ALTER TABLE users
  ADD COLUMN school_id VARCHAR(40) NULL
      COMMENT 'โรงเรียนต้นสังกัด — ผู้ใช้เลือกเองตอนเข้าครั้งแรก หรือแอดมินกำหนดให้'
      AFTER role,
  ADD COLUMN school_set_at DATETIME NULL
      COMMENT 'เวลาที่ผูกโรงเรียน — ว่าง = ยังไม่เคยเลือก ให้ถามตอนเข้าระบบ'
      AFTER school_id,
  ADD KEY idx_users_school (school_id),
  ADD CONSTRAINT fk_users_school FOREIGN KEY (school_id)
      REFERENCES schools (school_id) ON UPDATE CASCADE ON DELETE SET NULL;
