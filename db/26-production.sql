-- ---------------------------------------------------------------------
-- 26. Production Node — เหตุการณ์ระดับมิลลิวินาที + ทะเบียนเครื่องถ่ายทอด
--
-- ── ตารางนี้ไม่ใช่เจ้าของผลการแข่งขัน ────────────────────────────────
-- `match_kicks` กับ `match_events` ยังเป็นความจริงของสกอร์เหมือนเดิม
-- ที่นี่เก็บ "เวลาที่เกิดเหตุ" ละเอียดระดับมิลลิวินาที เพื่อให้ระบบรีเพลย์
-- ตัดคลิปย้อนหลังได้ตรงจังหวะ ซึ่งความละเอียดระดับวินาทีของตารางเดิมไม่พอ
-- (ลูกจุดโทษจากเริ่มวิ่งถึงบอลเข้าใช้เวลาไม่ถึง 2 วินาที)
--
-- ── ทำไมไม่ ALTER ตารางเดิม ───────────────────────────────────────────
-- ระบบรับสมัครและบันทึกผลใช้งานจริงอยู่ตลอดฤดูแข่ง การ ALTER ตารางที่มี
-- ข้อมูลจริงระหว่างฤดูคือความเสี่ยงที่ไม่คุ้ม — ไฟล์นี้จึง CREATE ล้วน
-- ถ้าลบสองตารางนี้ทิ้งทั้งหมด ระบบเดิมยังทำงานได้ครบเหมือนไม่เคยมี
--
-- ── ทำไมมี idempotency_key ───────────────────────────────────────────
-- Production Node ส่งข้อมูลแบบ store-and-forward: เน็ตสนามหลุดแล้วส่งใหม่
-- ได้เรื่อย ๆ ถ้าไม่มีกุญแจกันซ้ำ เหตุการณ์เดียวจะกลายเป็นหลายแถว
-- แล้วไฮไลต์จะมีจังหวะเดิมซ้ำหลายรอบ
--
-- ⚠️ ต้องรัน db/01 ถึง db/25 ก่อนไฟล์นี้
-- ---------------------------------------------------------------------

CREATE TABLE production_events (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  match_id        VARCHAR(64)  NOT NULL,
  event_type      VARCHAR(32)  NOT NULL
                  COMMENT 'GOAL / MISS / SAVE / HIGHLIGHT / CUE',
  -- DATETIME(3) = เก็บถึงหลักมิลลิวินาที ซึ่งเป็นเหตุผลทั้งหมดที่ตารางนี้มีอยู่
  occurred_at     DATETIME(3)  NOT NULL,
  payload         JSON         NULL
                  COMMENT 'ผู้เล่น มุมกล้อง หรือข้อมูลอื่นที่ช่วยตัดคลิป',
  idempotency_key VARCHAR(64)  NOT NULL
                  COMMENT 'Node สร้างเอง กันเหตุการณ์ซ้ำเมื่อส่งใหม่หลังเน็ตหลุด',
  created_by      VARCHAR(64)  NULL COMMENT 'node_id หรือ user_id',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_idem (idempotency_key),
  -- ระบบรีเพลย์ถามเสมอว่า "นัดนี้ ช่วงเวลานี้ มีอะไรเกิดขึ้นบ้าง"
  KEY idx_match_time (match_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='เวลาเหตุการณ์ละเอียดสำหรับตัดรีเพลย์ ไม่ใช่ที่มาของสกอร์';

CREATE TABLE production_nodes (
  node_id         VARCHAR(64)  NOT NULL,
  tournament_id   VARCHAR(64)  NULL,
  -- heartbeat นาทีละครั้ง ไม่ใช่ทุกเฟรม — ตารางนี้ต้องไม่กลายเป็นภาระของ DB
  last_seen_at    DATETIME     NULL,
  status_snapshot JSON         NULL
                  COMMENT 'OBS ต่ออยู่ไหม กล้องกี่ตัว ring buffer เหลือเท่าไร',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (node_id),
  KEY idx_tournament (tournament_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='ทะเบียนเครื่องถ่ายทอด — ให้ส่วนกลางรู้ว่าสนามไหนกำลังถ่ายอยู่';
