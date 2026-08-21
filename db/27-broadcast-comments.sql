-- ---------------------------------------------------------------------
-- 27. ข้อความจากผู้ชม สำหรับขึ้นแถบวิ่งบนจอถ่ายทอดสด
--
-- ── ทำไมไม่ใช้ contest_comments เดิม ──────────────────────────────────
-- ตารางนั้นผูกกับ "ภาพที่ส่งประกวด" (entry_id) และคนเห็นได้ทันทีที่โพสต์
-- ส่วนตารางนี้ผูกกับ "รายการแข่ง" และ **ต้องผ่านการอนุมัติก่อนเสมอ**
-- เพราะปลายทางคือจอที่ถ่ายทอดออกไปให้คนทั้งอำเภอเห็น ไม่ใช่หน้าเว็บที่เลื่อนผ่าน
-- การเอาสองอย่างมารวมกันแปลว่าวันหนึ่งจะมีคนเผลอทำให้คอมเมนต์ภาพประกวด
-- ขึ้นจอถ่ายทอด หรือทำให้คอมเมนต์ที่ยังไม่อนุมัติหลุดขึ้นจอ
--
-- ── ทำไมสถานะเริ่มต้นคือรออนุมัติ ─────────────────────────────────────
-- ค่าเริ่มต้นของฐานข้อมูลคือด่านสุดท้ายที่โกหกไม่ได้ ถ้าตั้งเป็น approved
-- แล้วลืมกรองที่โค้ดสักที่เดียว ข้อความที่ไม่เหมาะสมจะขึ้นจอทันที
-- ตั้งเป็น pending ไว้ ต่อให้โค้ดพลาด ผลที่แย่ที่สุดคือ "ไม่มีอะไรขึ้นจอ"
--
-- ── ทำไมเก็บ ip_hash ไม่เก็บ IP ตรง ๆ ────────────────────────────────
-- ต้องกันคนสแปมรัว ๆ ซึ่งต้องรู้ว่า "คนเดิมหรือเปล่า" แต่ไม่จำเป็นต้องรู้ว่า
-- "เป็นใครที่ไหน" — เก็บค่าแฮชจึงกันสแปมได้เท่าเดิมโดยไม่เก็บข้อมูลส่วนบุคคล
--
-- ⚠️ ต้องรัน db/01 ถึง db/26 ก่อนไฟล์นี้
-- ถ้าลบตารางนี้กับ routes/broadcast.php ทิ้ง ระบบเดิมยังทำงานครบเหมือนไม่เคยมี
-- ---------------------------------------------------------------------

CREATE TABLE broadcast_comments (
  comment_id    VARCHAR(40)  NOT NULL,
  tournament_id VARCHAR(40)  NOT NULL,
  match_id      VARCHAR(64)  NULL
                COMMENT 'ผูกกับนัดได้ถ้าส่งจากหน้านัดนั้น — ไม่ผูกก็ได้',
  author_name   VARCHAR(80)  NOT NULL DEFAULT '',
  message       VARCHAR(300) NOT NULL
                COMMENT 'สั้นโดยตั้งใจ — แถบวิ่งบนจออ่านได้ไม่เกินประมาณนี้',
  status        ENUM('pending','approved','rejected')
                NOT NULL DEFAULT 'pending'
                COMMENT 'ค่าเริ่มต้นต้องเป็น pending เสมอ ดูเหตุผลหัวไฟล์',
  user_id       VARCHAR(64)  NULL COMMENT 'ถ้าล็อกอินอยู่ — ไม่บังคับ',
  ip_hash       CHAR(64)     NOT NULL DEFAULT '' COMMENT 'ค่าแฮช ไม่ใช่ IP',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  moderated_at  DATETIME     NULL,
  moderated_by  VARCHAR(64)  NULL,
  PRIMARY KEY (comment_id),

  -- คำถามที่ระบบถามบ่อยที่สุดคือ "รายการนี้ มีข้อความที่อนุมัติแล้วอะไรบ้าง"
  -- (เครื่องถ่ายทอดถามซ้ำทุกไม่กี่วินาทีตลอดงาน)
  KEY idx_show (tournament_id, status, created_at),

  -- หน้าคัดกรองถามว่า "มีอะไรรออนุมัติบ้าง" เรียงเก่าสุดก่อน
  KEY idx_queue (status, created_at),

  -- กันสแปม: นับว่าคนนี้ส่งไปกี่ข้อความในช่วงเวลาที่ผ่านมา
  KEY idx_rate (ip_hash, created_at),

  CONSTRAINT fk_bcomment_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
