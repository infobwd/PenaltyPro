-- Run once on an existing PenaltyPro database before deploying the matching API.
-- Registration payment review is deliberately independent from team approval.

ALTER TABLE teams
  ADD COLUMN payment_status ENUM('Unpaid','Pending','Verified','Rejected')
    NOT NULL DEFAULT 'Unpaid' AFTER slip_url,
  ADD COLUMN payment_note VARCHAR(500) NOT NULL DEFAULT '' AFTER payment_status,
  ADD COLUMN payment_reviewed_at DATETIME NULL AFTER payment_note,
  ADD COLUMN payment_reviewed_by VARCHAR(40) NULL AFTER payment_reviewed_at,
  ADD KEY idx_teams_payment_status (tournament_id, payment_status),
  ADD CONSTRAINT fk_teams_payment_reviewer
    FOREIGN KEY (payment_reviewed_by) REFERENCES users (user_id)
    ON UPDATE CASCADE ON DELETE SET NULL;

UPDATE teams
   SET payment_status = 'Pending'
 WHERE slip_url <> '' AND payment_status = 'Unpaid';
