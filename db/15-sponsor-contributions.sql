-- ข้อมูลรูปแบบการสนับสนุนและใบอนุโมทนา
-- รันครั้งเดียวหลัง db/14-lineup-intro-video.sql

ALTER TABLE sponsors
  ADD COLUMN contribution_type ENUM('Money','Goods','Unspecified')
    NOT NULL DEFAULT 'Unspecified' AFTER sponsor_type,
  ADD COLUMN contribution_amount DECIMAL(12,2) NULL AFTER contribution_type,
  ADD COLUMN contribution_detail TEXT NULL AFTER contribution_amount,
  ADD COLUMN acknowledgement_no VARCHAR(100) NULL AFTER contribution_detail,
  ADD COLUMN acknowledgement_date DATE NULL AFTER acknowledgement_no,
  ADD COLUMN signer_name VARCHAR(255) NULL AFTER acknowledgement_date,
  ADD COLUMN signer_title VARCHAR(255) NULL AFTER signer_name,
  ADD COLUMN signature_url VARCHAR(500) NULL AFTER signer_title;
