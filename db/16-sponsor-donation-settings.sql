-- ช่องทางรับเงินผู้สนับสนุนระดับรายการแข่งขัน
-- เลือกใช้บัญชีเดิมของรายการ หรือกำหนดบัญชี/QR เฉพาะสำหรับผู้สนับสนุนได้
-- รันครั้งเดียวหลัง db/15-sponsor-contributions.sql

ALTER TABLE tournaments
  ADD COLUMN sponsor_donation_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER account_name,
  ADD COLUMN sponsor_donation_use_existing TINYINT(1) NOT NULL DEFAULT 1 AFTER sponsor_donation_enabled,
  ADD COLUMN sponsor_donation_qr_url VARCHAR(500) NOT NULL DEFAULT '' AFTER sponsor_donation_use_existing,
  ADD COLUMN sponsor_bank_name VARCHAR(120) NOT NULL DEFAULT '' AFTER sponsor_donation_qr_url,
  ADD COLUMN sponsor_bank_account VARCHAR(64) NOT NULL DEFAULT '' AFTER sponsor_bank_name,
  ADD COLUMN sponsor_account_name VARCHAR(150) NOT NULL DEFAULT '' AFTER sponsor_bank_account;
