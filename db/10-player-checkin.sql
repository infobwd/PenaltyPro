-- ---------------------------------------------------------------------
-- 10. รายงานตัวนักกีฬาหน้างาน
--
-- เจ้าภาพต้องยืนบนสนามแล้วเทียบ "รูปในระบบ" กับ "ตัวจริงที่มายืนอยู่"
-- ทีละคนก่อนปล่อยลงแข่ง เดิมใช้กระดาษ พอมีทีมถอน/เปลี่ยนตัวนาทีสุดท้าย
-- ใบที่ปรินต์ไว้ก็ไม่ตรงกับความจริงแล้ว
--
-- เก็บระดับ "ต่อรายการแข่งขัน" ไม่ใช่ต่อนัด เพราะรายงานตัวทำครั้งเดียวตอนมาถึง
-- ไม่ได้ทำใหม่ทุกนัด — ถ้าจะทำต่อนัดในอนาคตค่อยเพิ่มคอลัมน์ match_id ทีหลังได้
--
-- ไม่มี FK ไป tournaments เพราะ player_id ผูกกับ team อยู่แล้ว และ team
-- ผูกกับ tournament — เก็บ tournament_id ไว้เพื่อ query เร็วเท่านั้น
-- ---------------------------------------------------------------------

CREATE TABLE player_checkins (
  tournament_id VARCHAR(40)  NOT NULL,
  team_id       VARCHAR(40)  NOT NULL,
  player_id     VARCHAR(40)  NOT NULL,
  -- present  = ตัวจริงมา หน้าตรงกับรูป
  -- absent   = ไม่มา
  -- issue    = มาแต่มีปัญหา (รูปไม่ตรง เอกสารไม่ครบ) ต้องให้กรรมการตัดสิน
  status        ENUM('present','absent','issue') NOT NULL,
  note          VARCHAR(255) NOT NULL DEFAULT '',
  checked_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
  checked_by    VARCHAR(40)  NULL,
  PRIMARY KEY (player_id),
  KEY idx_checkin_team (team_id),
  KEY idx_checkin_tournament (tournament_id, status),
  CONSTRAINT fk_checkin_player FOREIGN KEY (player_id)
    REFERENCES players (player_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_checkin_team FOREIGN KEY (team_id)
    REFERENCES teams (team_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='ผลรายงานตัวนักกีฬาหน้างาน — 1 แถวต่อ 1 นักกีฬา';
