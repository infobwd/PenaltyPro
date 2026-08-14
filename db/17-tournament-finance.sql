-- บัญชีรายรับ-รายจ่ายประจำรายการ และผู้รับผิดชอบที่ได้รับมอบหมาย
-- รันครั้งเดียวหลัง db/16-sponsor-donation-settings.sql

CREATE TABLE tournament_finance_members (
  tournament_id VARCHAR(40) NOT NULL,
  user_id        VARCHAR(40) NOT NULL,
  assigned_by   VARCHAR(40) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  entry_id        VARCHAR(40) NOT NULL,
  tournament_id   VARCHAR(40) NOT NULL,
  entry_type      ENUM('Income','Expense') NOT NULL,
  category        VARCHAR(120) NOT NULL DEFAULT '',
  description     VARCHAR(500) NOT NULL DEFAULT '',
  amount          DECIMAL(12,2) NOT NULL DEFAULT 0,
  transaction_date DATE NOT NULL,
  evidence_url    VARCHAR(500) NOT NULL DEFAULT '',
  funding_source  ENUM('Tournament','HostSponsor') NOT NULL DEFAULT 'Tournament',
  created_by      VARCHAR(40) NULL,
  updated_by      VARCHAR(40) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
