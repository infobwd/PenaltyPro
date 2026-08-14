-- =====================================================================
--  PenaltyPro / kickoff.bwd.ac.th — MySQL schema
--  Target: MariaDB 10.6 บน DirectAdmin shared hosting (PHP 8.3)
--  Charset: utf8mb4 / utf8mb4_unicode_ci ทุกตาราง (ห้ามผสม — pitfall P2)
--
--  หลักการ
--   1. เก็บ natural key เดิม (team_id 'T_1699...', match_id 'M_...',
--      tournament_id 'TRN_...') เป็น PK เพื่อให้ QR code และลิงก์ที่แจก
--      ออกไปแล้วยังใช้ได้หลัง cutover
--   2. แยก "โรงเรียน" (ถาวร) ออกจาก "ทีมที่ลงแข่ง" (ต่อทัวร์นาเมนต์)
--      teams.school_id คือสิ่งที่ทำให้ดึงทีมเดิมมาแข่งฤดูใหม่ได้
--   3. matches อ้างทีมด้วย team_a_id/team_b_id เท่านั้น — ของเดิมเก็บ
--      "ชื่อทีม" ทำให้เปลี่ยนชื่อทีมแล้วประวัติและตารางคะแนนพังทั้งหมด
--   4. ค่าที่เดิมเป็น string อิสระ (status/role/result) -> ENUM
--   5. JSON ที่เคยยัดใน cell -> ตารางลูกจริง ยกเว้น config ที่ไม่ต้อง query
--   6. ตารางที่แก้ไขพร้อมกันได้ มี row_version สำหรับ optimistic locking
--
--  ⚠️ MariaDB: DEFAULT COLLATE ของ utf8mb4 คือ general_ci ต้องระบุ
--     unicode_ci เองทุกตาราง ไม่งั้น JOIN ข้ามตารางจะไม่ใช้ index
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET time_zone = '+07:00';

-- ---------------------------------------------------------------------
-- 1. ค่าตั้งระบบ
-- ---------------------------------------------------------------------

CREATE TABLE app_settings (
  setting_key    VARCHAR(64)  NOT NULL,
  setting_value  TEXT         NOT NULL,
  is_public      TINYINT(1)   NOT NULL DEFAULT 0
                 COMMENT '1 = ส่งให้ client ที่ไม่ล็อกอินได้ / 0 = แอดมินเท่านั้น',
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='แทน Config เดิมที่เป็น 1 แถว 24 คอลัมน์ตำแหน่งตายตัว';

-- ของเดิมส่ง adminPin ออกไปกับ getData ให้ทุกคน — is_public บังคับว่า
-- ค่าอ่อนไหวต้องประกาศตัวเอง ไม่ใช่หลุดออกไปเพราะลืมกรอง

-- ---------------------------------------------------------------------
-- 2. โรงเรียน — อัตลักษณ์ถาวร ข้ามทัวร์นาเมนต์
-- ---------------------------------------------------------------------

CREATE TABLE schools (
  school_id       VARCHAR(40)  NOT NULL,
  school_name     VARCHAR(255) NOT NULL,
  short_name      VARCHAR(64)  NOT NULL DEFAULT '',
  district        VARCHAR(120) NOT NULL DEFAULT '',
  province        VARCHAR(120) NOT NULL DEFAULT '',

  -- รหัส 8 ตัวที่แจกให้โรงเรียนเข้ามาแก้ข้อมูลทีมตัวเอง
  -- เก็บ hash เท่านั้น — ระบบไม่เคยเก็บรหัสจริง แอดมินเห็นได้ตอนออกรหัสเท่านั้น
  access_code_hash      VARCHAR(255) NULL,
  access_code_issued_at DATETIME     NULL,
  access_code_used_at   DATETIME     NULL,

  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (school_id),
  UNIQUE KEY uq_schools_name (school_name),
  KEY idx_schools_area (province, district)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- uq_schools_name จำเป็นเพราะ ETL จับคู่ทีมเดิมเข้าโรงเรียนด้วย "ชื่อ"
-- (ข้อมูลเดิมไม่มี school_id บนทีม) ถ้าชื่อซ้ำจะ map ผิดโดยไม่รู้ตัว
--
-- ⚠️ ETL ต้อง normalize ภาษาไทยเป็น NFC ก่อนเทียบชื่อ — พบว่าชีตเดิมสะกด
--    "ำ" ไม่ตรงกันระหว่างแท็บ (U+0E33 กับ U+0E4D+U+0E32) ซึ่งตาเปล่ามองไม่เห็น
--    แต่ SQL ถือว่าไม่เท่ากัน ทำให้จับคู่พลาดเงียบ ๆ

-- ---------------------------------------------------------------------
-- 3. ทัวร์นาเมนต์
-- ---------------------------------------------------------------------

CREATE TABLE tournaments (
  tournament_id  VARCHAR(40)  NOT NULL,
  name           VARCHAR(255) NOT NULL,
  type           ENUM('Penalty','7v7','11v11') NOT NULL DEFAULT 'Penalty',
  status         ENUM('Upcoming','Active','Archived') NOT NULL DEFAULT 'Upcoming',

  -- เดิมยัดรวมเป็น JSON string ในเซลล์เดียว query ไม่ได้เลย
  registration_deadline DATETIME     NULL,
  registration_enabled  TINYINT(1)   NOT NULL DEFAULT 1,
  team_editing_enabled  TINYINT(1)   NOT NULL DEFAULT 1,
  team_edit_deadline    DATETIME     NULL,
  max_teams             SMALLINT UNSIGNED NULL COMMENT 'NULL = ไม่จำกัด',
  max_teams_per_school  TINYINT UNSIGNED NOT NULL DEFAULT 1
                        COMMENT '1 = โรงเรียนละทีม / 2+ = ส่งได้หลายทีม (เช่น อนุบาลบ่อพลอย A, B)',
  players_per_team      TINYINT UNSIGNED NOT NULL DEFAULT 7,
  max_subs              TINYINT UNSIGNED NOT NULL DEFAULT 0,
  half_time_duration    SMALLINT UNSIGNED NULL COMMENT 'นาที',
  extra_time            TINYINT(1)   NOT NULL DEFAULT 0,
  registration_fee      DECIMAL(10,2) NOT NULL DEFAULT 0,

  bank_name        VARCHAR(120) NOT NULL DEFAULT '',
  bank_account     VARCHAR(64)  NOT NULL DEFAULT '',
  account_name     VARCHAR(150) NOT NULL DEFAULT '',
  sponsor_donation_enabled TINYINT(1) NOT NULL DEFAULT 1,
  sponsor_donation_use_existing TINYINT(1) NOT NULL DEFAULT 1,
  sponsor_donation_qr_url VARCHAR(500) NOT NULL DEFAULT '',
  sponsor_bank_name VARCHAR(120) NOT NULL DEFAULT '',
  sponsor_bank_account VARCHAR(64) NOT NULL DEFAULT '',
  sponsor_account_name VARCHAR(150) NOT NULL DEFAULT '',
  location_name    VARCHAR(255) NOT NULL DEFAULT '',
  location_link    VARCHAR(500) NOT NULL DEFAULT '',
  location_lat     DECIMAL(10,7) NULL,
  location_lng     DECIMAL(10,7) NULL,

  -- โครงการระดมทุน
  objective_enabled     TINYINT(1)   NOT NULL DEFAULT 0,
  objective_title       VARCHAR(255) NOT NULL DEFAULT '',
  objective_description TEXT         NULL,
  objective_goal        DECIMAL(12,2) NOT NULL DEFAULT 0,
  objective_doc_url     VARCHAR(500) NOT NULL DEFAULT '',

  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (tournament_id),
  KEY idx_tournaments_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tournament_groups (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tournament_id  VARCHAR(40)  NOT NULL,
  group_name     VARCHAR(16)  NOT NULL COMMENT 'A, B, C, ...',
  display_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_group (tournament_id, group_name),
  CONSTRAINT fk_group_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tournament_prizes (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tournament_id  VARCHAR(40)  NOT NULL,
  rank_label     VARCHAR(120) NOT NULL,
  amount         VARCHAR(64)  NOT NULL DEFAULT '' COMMENT 'ข้อความอิสระ เช่น "3,000 บาท + ถ้วย"',
  description    VARCHAR(500) NOT NULL DEFAULT '',
  winner_team_id VARCHAR(40)  NULL,
  display_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_prize_tournament (tournament_id, display_order),
  KEY idx_prize_winner (winner_team_id),
  CONSTRAINT fk_prize_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tournament_images (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tournament_id  VARCHAR(40)  NOT NULL,
  url            VARCHAR(500) NOT NULL,
  image_type     ENUM('before','after','general') NOT NULL DEFAULT 'general',
  caption        VARCHAR(255) NOT NULL DEFAULT '',
  display_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_timage_tournament (tournament_id, display_order),
  CONSTRAINT fk_timage_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. ผู้ใช้และ session
-- ---------------------------------------------------------------------

CREATE TABLE users (
  user_id       VARCHAR(40)  NOT NULL,

  -- LINE เป็นช่องทางหลักของผู้ชม — เก็บจาก `sub` ใน ID token ที่ verify แล้วเท่านั้น
  -- ห้ามเขียนค่านี้จาก lineUserId ที่ client ส่งมา (ช่องโหว่ของระบบเดิม)
  line_user_id  VARCHAR(64)  NULL,

  -- username/password มีเฉพาะแอดมินและสตาฟ
  username      VARCHAR(100) NULL,
  password_hash VARCHAR(255) NULL,
  password_algo ENUM('argon2id','bcrypt','legacy_plain') NOT NULL DEFAULT 'argon2id',
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,

  display_name  VARCHAR(150) NOT NULL DEFAULT '',
  picture_url   VARCHAR(500) NOT NULL DEFAULT '',
  phone         VARCHAR(30)  NOT NULL DEFAULT '',
  role          ENUM('admin','staff','user') NOT NULL DEFAULT 'user',

  last_login_at DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_line (line_user_id),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_role (role),

  -- แอดมิน/สตาฟต้องมีรหัสผ่านเสมอ — ของเดิมมีแอดมิน 4 คนแต่ตั้งรหัสแค่ 2
  -- อีก 2 คนจึงพึ่ง LINE อย่างเดียว ซึ่งปลอมได้
  CONSTRAINT chk_staff_has_password CHECK (
    role = 'user' OR (username IS NOT NULL AND password_hash IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- UNIQUE บนคอลัมน์ NULL ยอมให้มีหลายแถวเป็น NULL ได้ จึงต้องเก็บ NULL
-- (ไม่ใช่ '') สำหรับผู้ใช้ LINE ที่ไม่มี username และผู้ใช้ที่ยังไม่ผูก LINE

CREATE TABLE user_sessions (
  token_hash   CHAR(64)     NOT NULL COMMENT 'sha256 ของ token ที่ส่งให้ client',
  user_id      VARCHAR(40)  NOT NULL,
  issued_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME     NOT NULL,
  last_seen_at DATETIME     NULL,
  user_agent   VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (token_hash),
  KEY idx_usessions_user (user_id),
  KEY idx_usessions_expiry (expires_at),
  CONSTRAINT fk_usessions_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='เก็บ hash ของ token เท่านั้น เพื่อให้เพิกถอน session ได้';

CREATE TABLE tournament_finance_members (
  tournament_id VARCHAR(40) NOT NULL,
  user_id VARCHAR(40) NOT NULL,
  assigned_by VARCHAR(40) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, user_id),
  KEY idx_finance_members_user (user_id, tournament_id),
  CONSTRAINT fk_finance_member_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_finance_member_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_finance_member_assigner FOREIGN KEY (assigned_by)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tournament_finance_entries (
  entry_id VARCHAR(40) NOT NULL,
  tournament_id VARCHAR(40) NOT NULL,
  entry_type ENUM('Income','Expense') NOT NULL,
  category VARCHAR(120) NOT NULL DEFAULT '',
  description VARCHAR(500) NOT NULL DEFAULT '',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  transaction_date DATE NOT NULL,
  evidence_url VARCHAR(500) NOT NULL DEFAULT '',
  funding_source ENUM('Tournament','HostSponsor') NOT NULL DEFAULT 'Tournament',
  created_by VARCHAR(40) NULL,
  updated_by VARCHAR(40) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (entry_id),
  KEY idx_finance_entries_tournament (tournament_id, transaction_date, entry_type),
  KEY idx_finance_entries_creator (created_by),
  CONSTRAINT fk_finance_entry_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_finance_entry_creator FOREIGN KEY (created_by)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_finance_entry_updater FOREIGN KEY (updated_by)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_finance_amount_positive CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. ทีมที่ลงแข่ง (1 แถว = โรงเรียนหนึ่ง ลงแข่งหนึ่งทัวร์นาเมนต์)
-- ---------------------------------------------------------------------

CREATE TABLE teams (
  team_id        VARCHAR(40)  NOT NULL,
  tournament_id  VARCHAR(40)  NOT NULL,
  school_id      VARCHAR(40)  NOT NULL,
  source_team_id VARCHAR(40)  NULL COMMENT 'clone มาจากทีมไหนในทัวร์นาเมนต์ก่อน',

  name           VARCHAR(255) NOT NULL COMMENT 'ชื่อทีมในทัวร์นาเมนต์นี้ (แก้ได้ต่างจากชื่อโรงเรียน)',
  short_name     VARCHAR(64)  NOT NULL DEFAULT '',
  color_primary   VARCHAR(16) NOT NULL DEFAULT '#2563EB',
  color_secondary VARCHAR(16) NOT NULL DEFAULT '#FFFFFF',
  logo_url       VARCHAR(500) NOT NULL DEFAULT '',

  -- state machine: Invited -> Draft -> Submitted -> Approved | Rejected
  --                Invited -> Withdrawn (โรงเรียนแจ้งไม่เข้าร่วม)
  status         ENUM('Invited','Draft','Submitted','Approved','Rejected','Withdrawn')
                 NOT NULL DEFAULT 'Invited',
  reject_reason  VARCHAR(500) NOT NULL DEFAULT '',
  group_name     VARCHAR(16)  NULL,

  doc_url        VARCHAR(500) NOT NULL DEFAULT '',
  slip_url       VARCHAR(500) NOT NULL DEFAULT '',
  payment_status ENUM('Unpaid','Pending','Verified','Rejected') NOT NULL DEFAULT 'Unpaid',
  payment_note   VARCHAR(500) NOT NULL DEFAULT '',
  payment_reviewed_at DATETIME NULL,
  payment_reviewed_by VARCHAR(40) NULL,

  director_name  VARCHAR(150) NOT NULL DEFAULT '',
  manager_name   VARCHAR(150) NOT NULL DEFAULT '',
  manager_phone  VARCHAR(30)  NOT NULL DEFAULT '',
  coach_name     VARCHAR(150) NOT NULL DEFAULT '',
  coach_phone    VARCHAR(30)  NOT NULL DEFAULT '',

  confirmed_at   DATETIME     NULL COMMENT 'โรงเรียนกดยืนยันเข้าร่วม',
  submitted_at   DATETIME     NULL COMMENT 'โรงเรียนกดส่งข้อมูล',
  approved_at    DATETIME     NULL,
  approved_by    VARCHAR(40)  NULL,

  row_version    INT UNSIGNED NOT NULL DEFAULT 0,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (team_id),
  UNIQUE KEY uq_team_name_tournament (tournament_id, name),
  KEY idx_teams_school_tournament (tournament_id, school_id),
  KEY idx_teams_status (tournament_id, status),
  KEY idx_teams_payment_status (tournament_id, payment_status),
  KEY idx_teams_group (tournament_id, group_name),
  KEY idx_teams_school (school_id),
  KEY idx_teams_source (source_team_id),

  CONSTRAINT fk_teams_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_teams_school FOREIGN KEY (school_id)
    REFERENCES schools (school_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_teams_approver FOREIGN KEY (approved_by)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_teams_payment_reviewer FOREIGN KEY (payment_reviewed_by)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ⚠️ ตั้งใจ "ไม่" ใส่ UNIQUE (tournament_id, school_id):
--    โรงเรียนหนึ่งส่งได้หลายทีม — ข้อมูลจริงของครั้งที่ 3 มี "อนุบาลบ่อพลอย A"
--    (สาย D) และ "อนุบาลบ่อพลอย B" (สาย H) เป็นคนละทีมจากโรงเรียนเดียวกัน
--    เพดานคุมด้วย tournaments.max_teams_per_school ในชั้นแอป ไม่ใช่ constraint
--    เพราะแอดมินต้องปรับได้รายทัวร์นาเมนต์
--
-- uq_team_name_tournament ยังบังคับว่า "ชื่อทีมห้ามซ้ำในทัวร์นาเมนต์เดียวกัน"
-- จึงยังกันสมัครซ้ำโดยไม่ตั้งใจได้ที่ระดับ DB (ของเดิมเช็คด้วย loop ใน
-- Apps Script ที่ไม่มี lock -> สมัครพร้อมกันแล้วหลุด)
--
-- row_version: โรงเรียนแก้ข้อมูลพร้อมแอดมินอนุมัติได้ ถ้าชนต้องคืน 409
-- ไม่ใช่เขียนทับเงียบ ๆ

CREATE TABLE players (
  player_id      VARCHAR(40)  NOT NULL,
  team_id        VARCHAR(40)  NOT NULL,
  source_player_id VARCHAR(40) NULL COMMENT 'clone มาจากผู้เล่นคนไหน',

  name           VARCHAR(150) NOT NULL,
  shirt_number   VARCHAR(8)   NULL COMMENT 'NULL = ยังไม่ระบุ — ห้ามใช้ "" เพราะ UNIQUE จะชน',
  position       VARCHAR(40)  NOT NULL DEFAULT 'Player',
  photo_url      VARCHAR(500) NOT NULL DEFAULT '',
  birth_date     DATE         NULL,
  display_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,

  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (player_id),
  UNIQUE KEY uq_player_shirt (team_id, shirt_number),
  KEY idx_players_team (team_id, display_order),
  CONSTRAINT fk_players_team FOREIGN KEY (team_id)
    REFERENCES teams (team_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- players เป็น snapshot ต่อทัวร์นาเมนต์ ไม่ใช่ master ที่ใช้ร่วมกัน:
-- อายุและรายชื่อเปลี่ยนทุกฤดู ถ้าใช้ master ร่วม การแก้รายชื่อปีนี้จะไปแก้
-- ประวัติปีที่แล้วด้วย ผลการแข่งเก่าจะเพี้ยน — จึง clone ตอนสร้างทีมใหม่แทน
--
-- ไม่มีคอลัมน์ tournament_id โดยตั้งใจ — หาผ่าน teams.tournament_id เท่านั้น
-- (กติกา attribution เดียว pitfall P7) คอลัมน์ซ้ำซ้อนคือที่มาของตัวเลขไม่ตรงกัน

-- ---------------------------------------------------------------------
-- 6. รหัสโรงเรียน — session และการกันเดารหัส
-- ---------------------------------------------------------------------

CREATE TABLE team_sessions (
  token_hash    CHAR(64)     NOT NULL,
  school_id     VARCHAR(40)  NOT NULL,
  tournament_id VARCHAR(40)  NOT NULL,
  issued_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATETIME     NOT NULL,
  revoked_at    DATETIME     NULL,
  ip_hash       CHAR(64)     NOT NULL DEFAULT '',
  user_agent    VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (token_hash),
  KEY idx_tsessions_school (school_id, expires_at),
  CONSTRAINT fk_tsessions_school FOREIGN KEY (school_id)
    REFERENCES schools (school_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_tsessions_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='session ของโรงเรียนที่เข้าด้วยรหัส — ผูกทัวร์นาเมนต์เดียว';

-- ออกรหัสใหม่ = ลบทุกแถวของ school_id นั้น เพื่อเตะ session เก่าออกทันที

CREATE TABLE access_attempts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id    VARCHAR(40)  NULL COMMENT 'NULL = ใส่รหัสที่ไม่ตรงกับโรงเรียนไหนเลย',
  ip_hash      CHAR(64)     NOT NULL COMMENT 'sha256(ip + salt รายวัน) — ไม่เก็บ IP ดิบ',
  succeeded    TINYINT(1)   NOT NULL DEFAULT 0,
  attempted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attempt_ip (ip_hash, attempted_at),
  KEY idx_attempt_school (school_id, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='rate limit รหัส 8 ตัว — สั้นพอที่จะถูกไล่เดาถ้าไม่จำกัด';

-- ---------------------------------------------------------------------
-- 7. การแข่งขัน
-- ---------------------------------------------------------------------

CREATE TABLE matches (
  match_id       VARCHAR(40)  NOT NULL,
  tournament_id  VARCHAR(40)  NOT NULL,

  -- FK จริง ไม่ใช่ชื่อทีมแบบเดิม
  team_a_id      VARCHAR(40)  NULL COMMENT 'NULL ได้ เช่นนัดที่ยังรอผู้ชนะรอบก่อน',
  team_b_id      VARCHAR(40)  NULL,
  -- snapshot ชื่อ ณ เวลาแข่ง ใช้แสดงผลนัดเก่าและกรณีทีมถูกลบ
  team_a_name    VARCHAR(255) NOT NULL DEFAULT '',
  team_b_name    VARCHAR(255) NOT NULL DEFAULT '',

  score_a        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  score_b        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  winner         ENUM('A','B','DRAW') NULL,

  status         ENUM('Scheduled','Live','Finished','Walkover') NOT NULL DEFAULT 'Scheduled',
  round_label    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT 'Group A / R16 / QF / SF / FINAL',
  venue          VARCHAR(255) NOT NULL DEFAULT '',
  scheduled_time DATETIME     NULL,
  livestream_url   VARCHAR(500) NOT NULL DEFAULT '',
  livestream_cover VARCHAR(500) NOT NULL DEFAULT '',
  summary        TEXT         NULL,

  played_at      DATETIME     NULL,
  row_version    INT UNSIGNED NOT NULL DEFAULT 0,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (match_id),
  KEY idx_matches_schedule (tournament_id, status, scheduled_time),
  KEY idx_matches_round (tournament_id, round_label),
  KEY idx_matches_team_a (team_a_id),
  KEY idx_matches_team_b (team_b_id),

  CONSTRAINT fk_matches_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_matches_team_a FOREIGN KEY (team_a_id)
    REFERENCES teams (team_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_matches_team_b FOREIGN KEY (team_b_id)
    REFERENCES teams (team_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE kicks (
  kick_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id    VARCHAR(40)  NOT NULL,
  round_no    SMALLINT UNSIGNED NOT NULL,
  team_side   ENUM('A','B') NOT NULL,
  player_name VARCHAR(150) NOT NULL DEFAULT '',
  player_id   VARCHAR(40)  NULL,
  result      ENUM('GOAL','SAVED','MISSED') NOT NULL,
  commentary  VARCHAR(500) NOT NULL DEFAULT '',
  kicked_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (kick_id),
  UNIQUE KEY uq_kick_slot (match_id, round_no, team_side),
  KEY idx_kicks_match (match_id, round_no),
  CONSTRAINT fk_kicks_match FOREIGN KEY (match_id)
    REFERENCES matches (match_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_kicks_player FOREIGN KEY (player_id)
    REFERENCES players (player_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- uq_kick_slot คือหัวใจ: ของเดิม saveMatch เรียก saveKicks ทุกครั้งที่บันทึก
-- แล้ว append ซ้ำ ไม่มี ID ให้ dedupe -> Kicks บวมและสถิติเพี้ยน
-- ตอนนี้บันทึกซ้ำจะกลายเป็น UPSERT ไม่ใช่แถวใหม่

CREATE TABLE match_events (
  event_id       VARCHAR(40)  NOT NULL,
  match_id       VARCHAR(40)  NOT NULL,
  minute_no      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  event_type     ENUM('GOAL','OWN_GOAL','YELLOW_CARD','RED_CARD','BLUE_CARD','SUB_IN','SUB_OUT') NOT NULL,
  team_side      ENUM('A','B') NOT NULL,
  player_name    VARCHAR(150) NOT NULL DEFAULT '',
  related_player VARCHAR(150) NOT NULL DEFAULT '',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id),
  KEY idx_events_match (match_id, minute_no),
  CONSTRAINT fk_events_match FOREIGN KEY (match_id)
    REFERENCES matches (match_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. เนื้อหาและการมีส่วนร่วม
-- ---------------------------------------------------------------------

CREATE TABLE news (
  news_id       VARCHAR(40)  NOT NULL,
  tournament_id VARCHAR(40)  NULL COMMENT 'NULL = ข่าวส่วนกลาง',
  title         VARCHAR(255) NOT NULL,
  content       TEXT         NULL,
  image_url     VARCHAR(500) NOT NULL DEFAULT '',
  document_url  VARCHAR(500) NOT NULL DEFAULT '',
  published_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (news_id),
  KEY idx_news_feed (tournament_id, published_at),
  CONSTRAINT fk_news_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE donations (
  donation_id   VARCHAR(40)  NOT NULL,
  tournament_id VARCHAR(40)  NULL,
  donor_name    VARCHAR(150) NOT NULL DEFAULT '',
  amount        DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- ข้อมูลอ่อนไหว — ต้องถูกตัดออกก่อนส่งให้ผู้ที่ไม่ใช่แอดมิน ไม่ใช่ซ่อนใน UI
  phone         VARCHAR(30)  NOT NULL DEFAULT '',
  tax_id        VARCHAR(20)  NOT NULL DEFAULT '',
  address       VARCHAR(500) NOT NULL DEFAULT '',

  is_edonation  TINYINT(1)   NOT NULL DEFAULT 0,
  is_anonymous  TINYINT(1)   NOT NULL DEFAULT 0,
  slip_url      VARCHAR(500) NOT NULL DEFAULT '',
  tax_file_url  VARCHAR(500) NOT NULL DEFAULT '',
  line_user_id  VARCHAR(64)  NOT NULL DEFAULT '',
  status        ENUM('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (donation_id),
  KEY idx_donations_status (tournament_id, status),
  KEY idx_donations_line (line_user_id),
  CONSTRAINT fk_donations_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE predictions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id      VARCHAR(40)  NOT NULL,
  user_id       VARCHAR(40)  NOT NULL,
  prediction    ENUM('A','B') NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prediction (match_id, user_id),
  KEY idx_pred_user (user_id),
  CONSTRAINT fk_pred_match FOREIGN KEY (match_id)
    REFERENCES matches (match_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_pred_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- uq_prediction ทำให้ "ทายซ้ำ = แก้คำทำนาย" เป็น UPSERT ครั้งเดียว
-- แทนการอ่านทั้งชีตแล้ววนหาแบบเดิม

CREATE TABLE contests (
  contest_id   VARCHAR(40)  NOT NULL,
  title        VARCHAR(255) NOT NULL,
  description  TEXT         NULL,
  status       ENUM('Open','Closed') NOT NULL DEFAULT 'Open',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closing_date DATETIME     NULL,
  PRIMARY KEY (contest_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE contest_entries (
  entry_id     VARCHAR(40)  NOT NULL,
  contest_id   VARCHAR(40)  NOT NULL,
  user_id      VARCHAR(40)  NULL,
  photo_url    VARCHAR(500) NOT NULL DEFAULT '',
  caption      VARCHAR(500) NOT NULL DEFAULT '',
  like_count   INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'cache ของ entry_likes — อัปเดตในทรานแซกชันเดียวกัน',
  share_count  INT UNSIGNED NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entry_id),
  KEY idx_entries_contest (contest_id, created_at),
  KEY idx_entries_user (user_id),
  CONSTRAINT fk_entries_contest FOREIGN KEY (contest_id)
    REFERENCES contests (contest_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_entries_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE entry_likes (
  entry_id   VARCHAR(40)  NOT NULL,
  user_id    VARCHAR(40)  NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entry_id, user_id),
  KEY idx_likes_user (user_id),
  CONSTRAINT fk_likes_entry FOREIGN KEY (entry_id)
    REFERENCES contest_entries (entry_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_likes_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ของเดิมเก็บ LikedByUsers เป็น CSV ในเซลล์เดียว แล้วอ่าน-แก้-เขียนทับ
-- กดไลก์พร้อมกัน = ไลก์หาย และชนลิมิต 50,000 ตัวอักษร/เซลล์

CREATE TABLE contest_comments (
  comment_id VARCHAR(40)  NOT NULL,
  entry_id   VARCHAR(40)  NOT NULL,
  user_id    VARCHAR(40)  NULL,
  message    VARCHAR(1000) NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comment_id),
  KEY idx_comments_entry (entry_id, created_at),
  CONSTRAINT fk_comments_entry FOREIGN KEY (entry_id)
    REFERENCES contest_entries (entry_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 9. จอแสดงผล (LiveWall)
-- ---------------------------------------------------------------------

CREATE TABLE sponsors (
  sponsor_id    VARCHAR(40)  NOT NULL,
  tournament_id VARCHAR(40)  NULL COMMENT 'NULL = แสดงทุกทัวร์นาเมนต์',
  name          VARCHAR(255) NOT NULL,
  logo_url      VARCHAR(500) NOT NULL DEFAULT '',
  sponsor_type  ENUM('Main','Support') NOT NULL DEFAULT 'Support',
  contribution_type ENUM('Money','Goods','Unspecified') NOT NULL DEFAULT 'Unspecified',
  contribution_amount DECIMAL(12,2) NULL,
  contribution_detail TEXT NULL,
  acknowledgement_no VARCHAR(100) NULL,
  acknowledgement_date DATE NULL,
  signer_name   VARCHAR(255) NULL,
  signer_title  VARCHAR(255) NULL,
  signature_url VARCHAR(500) NULL,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (sponsor_id),
  KEY idx_sponsors_tournament (tournament_id, display_order),
  CONSTRAINT fk_sponsors_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE music_tracks (
  track_id      VARCHAR(40)  NOT NULL,
  tournament_id VARCHAR(40)  NULL,
  name          VARCHAR(255) NOT NULL,
  url           VARCHAR(500) NOT NULL,
  track_type    ENUM('Youtube','Spotify','Suno','Other') NOT NULL DEFAULT 'Other',
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (track_id),
  KEY idx_tracks_tournament (tournament_id, display_order),
  CONSTRAINT fk_tracks_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticker_messages (
  ticker_id     VARCHAR(40)  NOT NULL,
  tournament_id VARCHAR(40)  NULL,
  message       VARCHAR(500) NOT NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (ticker_id),
  KEY idx_ticker_active (tournament_id, is_active, display_order),
  CONSTRAINT fk_ticker_tournament FOREIGN KEY (tournament_id)
    REFERENCES tournaments (tournament_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 10. ระบบ
-- ---------------------------------------------------------------------

CREATE TABLE audit_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_type    ENUM('admin','staff','school','user','system') NOT NULL DEFAULT 'system',
  actor_id      VARCHAR(64)  NOT NULL DEFAULT '' COMMENT 'user_id หรือ school_id',
  actor_name    VARCHAR(150) NOT NULL DEFAULT '',
  entity        VARCHAR(50)  NOT NULL COMMENT 'team | player | match | donation | user | ...',
  entity_id     VARCHAR(64)  NOT NULL,
  action        VARCHAR(50)  NOT NULL COMMENT 'create | update | delete | approve | reject | draw',
  before_json   TEXT         NULL,
  after_json    TEXT         NULL,
  ip_hash       CHAR(64)     NOT NULL DEFAULT '',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_entity (entity, entity_id, created_at),
  KEY idx_audit_actor (actor_type, actor_id, created_at),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE idempotency_keys (
  key_hash      CHAR(64)     NOT NULL,
  endpoint      VARCHAR(64)  NOT NULL,
  response_json MEDIUMTEXT   NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (key_hash),
  KEY idx_idem_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='กันกดส่งซ้ำ/เน็ตกระตุกแล้วได้ทีมซ้ำ — ล้างแถวเก่ากว่า 24 ชม. ด้วย cron';

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
--  VIEW — บังคับกติกา attribution เดียว (pitfall P7)
--  ผลการแข่งอ้างทีมด้วย team_id เสมอ ห้ามจับคู่ด้วยชื่อ
-- =====================================================================

CREATE OR REPLACE VIEW v_match_team_results AS
SELECT m.tournament_id, m.match_id, m.round_label,
       m.team_a_id AS team_id, m.score_a AS goals_for, m.score_b AS goals_against,
       CAST(CASE WHEN m.winner = 'A' THEN 'W'
                 WHEN m.winner = 'B' THEN 'L'
                 ELSE 'D' END
            AS CHAR(1)) COLLATE utf8mb4_unicode_ci AS outcome
  FROM matches m
 WHERE m.status IN ('Finished','Walkover') AND m.team_a_id IS NOT NULL
UNION ALL
SELECT m.tournament_id, m.match_id, m.round_label,
       m.team_b_id, m.score_b, m.score_a,
       CAST(CASE WHEN m.winner = 'B' THEN 'W'
                 WHEN m.winner = 'A' THEN 'L'
                 ELSE 'D' END
            AS CHAR(1)) COLLATE utf8mb4_unicode_ci
  FROM matches m
 WHERE m.status IN ('Finished','Walkover') AND m.team_b_id IS NOT NULL;

-- COLLATE บน outcome จำเป็น: literal 'W'/'L'/'D' ใน CASE จะได้ collation
-- ตาม connection (general_ci) ไม่ใช่ของตาราง ถ้าปล่อยไว้แล้วมีใครเอาไป JOIN
-- หรือเทียบกับคอลัมน์จริง จะเจอ error 1267 หรือ index ไม่ถูกใช้ (pitfall P2)

CREATE OR REPLACE VIEW v_standings AS
SELECT t.tournament_id,
       t.team_id,
       t.name        AS team_name,
       t.short_name,
       t.logo_url,
       t.group_name,
       COUNT(r.match_id)                                   AS played,
       SUM(CASE WHEN r.outcome = 'W' THEN 1 ELSE 0 END)    AS won,
       SUM(CASE WHEN r.outcome = 'D' THEN 1 ELSE 0 END)    AS drawn,
       SUM(CASE WHEN r.outcome = 'L' THEN 1 ELSE 0 END)    AS lost,
       COALESCE(SUM(r.goals_for), 0)                       AS goals_for,
       COALESCE(SUM(r.goals_against), 0)                   AS goals_against,
       COALESCE(SUM(r.goals_for), 0)
         - COALESCE(SUM(r.goals_against), 0)               AS goal_diff,
       SUM(CASE WHEN r.outcome = 'W' THEN 3
                WHEN r.outcome = 'D' THEN 1
                ELSE 0 END)                                AS points
  FROM teams t
  LEFT JOIN v_match_team_results r ON r.team_id = t.team_id
 WHERE t.status = 'Approved'
 GROUP BY t.tournament_id, t.team_id, t.name, t.short_name, t.logo_url, t.group_name;

-- v_standings นับเฉพาะทีม Approved ตามกติกา attribution — ทีมที่ยังไม่อนุมัติ
-- ต้องไม่โผล่ในตัวเลขสาธารณะที่ไหนเลย
