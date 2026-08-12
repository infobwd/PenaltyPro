-- กล่องแจ้งเตือนในแอป + Web Push
--
-- ที่ต้องมี: เรื่องที่ต้องรีบรู้ในวันแข่งมีเยอะ (ทีมถูกตีกลับให้แก้ไข, เลื่อนเวลาแข่ง,
-- ผลออกแล้ว) แต่เดิมระบบไม่มีทางบอกใครเลย ต้องโทรหรือส่ง LINE เอง ซึ่งตกหล่นเสมอ
--
-- แยกเป็น 2 ชั้นโดยตั้งใจ:
--   1. ตาราง notifications = กล่องข้อความในแอป — เก็บเสมอ แม้ผู้ใช้ไม่ได้เปิด push
--      ทำให้ครูที่ปฏิเสธการแจ้งเตือนของเบราว์เซอร์ยังตามเรื่องย้อนหลังได้
--   2. users.push_subscription_json = ช่องทางส่งเข้าเครื่อง — มีก็ยิงเพิ่ม ไม่มีก็ข้าม
--      การส่ง push ล้มเหลวจึงไม่ทำให้ข้อความหาย

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       VARCHAR(40)  NOT NULL,
  type          VARCHAR(50)  NOT NULL COMMENT 'ประเภท ใช้จับคู่กับการตั้งค่ารายบุคคล',
  title         VARCHAR(200) NOT NULL,
  body          TEXT         NULL,
  url           VARCHAR(500) NULL COMMENT 'เส้นทางในแอปที่จะเปิดเมื่อแตะ',
  metadata_json JSON         NULL COMMENT 'ข้อมูลเสริม เช่น matchId/teamId ไว้ให้หน้าเว็บสร้างลิงก์เองถ้า url เปลี่ยน',
  read_at       DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  -- อ่าน "ที่ยังไม่อ่านของฉัน" กับ "ล่าสุดของฉัน" เป็นสองคิวรีหลักที่ยิงบ่อยสุด
  KEY idx_notif_user_read (user_id, read_at),
  KEY idx_notif_user_created (user_id, created_at),

  CONSTRAINT fk_notif_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
  ADD COLUMN push_subscription_json TEXT NULL
      COMMENT 'endpoint + คีย์ของเบราว์เซอร์เครื่องนั้น — NULL = ยังไม่เปิดรับ push'
      AFTER picture_url,
  ADD COLUMN notification_preferences_json TEXT NULL
      COMMENT 'ปิด/เปิดรายประเภท — NULL = ใช้ค่าเริ่มต้นตามบทบาท'
      AFTER push_subscription_json;

-- คีย์ VAPID สำหรับเซ็น Web Push (สร้างด้วย `npx web-push generate-vapid-keys`)
-- is_public = 0 ทั้งคู่ แม้ public key จะเปิดเผยได้ตามสเปก เพราะ endpoint สาธารณะ
-- ของระบบส่งค่าใน app_settings ออกไปทั้งก้อน — private key ต้องไม่หลุดเด็ดขาด
-- หน้าเว็บดึง public key ผ่าน ?action=pushConfig ซึ่งส่งเฉพาะ public key
INSERT INTO app_settings (setting_key, setting_value, is_public)
VALUES
  ('vapid_public_key',  '', 0),
  ('vapid_private_key', '', 0),
  ('vapid_subject',     'mailto:info@bwd.ac.th', 0)
ON DUPLICATE KEY UPDATE setting_key = setting_key;
