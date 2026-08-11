-- =====================================================================
--  Smoke test — ตรวจว่า schema "บังคับกติกาได้จริง" ไม่ใช่แค่ import ผ่าน
--
--  วิธีรัน (ใช้ฐานข้อมูลเปล่าแยกต่างหาก ไม่ใช่ฐานจริง):
--    mysql -u USER -p SCRATCH_DB < db/01-schema.sql
--    mysql -u USER -p --default-character-set=utf8mb4 --table SCRATCH_DB < db/02-smoke-test.sql
--
--  ผลที่ถูกต้อง: ทุก SELECT คืน expect_* ตามชื่อคอลัมน์ และบล็อกท้ายไฟล์
--  (ที่คอมเมนต์ไว้) ต้อง error ถ้าเอา comment ออก
--
--  ⚠️ ต้องใช้ --default-character-set=utf8mb4 ไม่งั้นภาษาไทยเข้าเป็นขยะ
-- =====================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT INTO tournaments (tournament_id, name, type, status, players_per_team)
VALUES ('_T_NEW', 'ทัวร์นาเมนต์ทดสอบ', 'Penalty', 'Active', 7);

INSERT INTO schools (school_id, school_name) VALUES
  ('_S_A', 'โรงเรียนทดสอบ ก'),
  ('_S_B', 'โรงเรียนทดสอบ ข');

INSERT INTO users (user_id, display_name, role, line_user_id)
VALUES ('_U_1', 'ผู้ชมทดสอบ', 'user', '_L1');

INSERT INTO teams (team_id, tournament_id, school_id, name, status) VALUES
  ('_T_A', '_T_NEW', '_S_A', 'ทีม ก', 'Approved'),
  ('_T_B', '_T_NEW', '_S_B', 'ทีม ข', 'Approved');

INSERT INTO matches (match_id, tournament_id, team_a_id, team_b_id,
                     team_a_name, team_b_name, status, score_a, score_b, winner)
VALUES ('_M_1', '_T_NEW', '_T_A', '_T_B', 'ทีม ก', 'ทีม ข', 'Finished', 3, 1, 'A');

-- 1. บันทึกลูกจุดโทษซ้ำช่องเดิม ต้องเป็น UPSERT ไม่ใช่แถวใหม่
--    (ของเดิม saveMatch เรียก saveKicks ทุกครั้ง -> Kicks บวมและสถิติเพี้ยน)
INSERT INTO kicks (match_id, round_no, team_side, player_name, result)
VALUES ('_M_1', 1, 'A', 'ผู้เล่น 1', 'GOAL');
INSERT INTO kicks (match_id, round_no, team_side, player_name, result)
VALUES ('_M_1', 1, 'A', 'ผู้เล่น 1', 'SAVED')
ON DUPLICATE KEY UPDATE result = VALUES(result);
SELECT '1. kick upsert' AS test, COUNT(*) AS expect_1_row,
       MAX(result) AS expect_SAVED FROM kicks WHERE match_id = '_M_1';

-- 2. ทายผลซ้ำ = แก้คำทำนาย ไม่ใช่แถวใหม่
INSERT INTO predictions (match_id, user_id, prediction) VALUES ('_M_1', '_U_1', 'A');
INSERT INTO predictions (match_id, user_id, prediction) VALUES ('_M_1', '_U_1', 'B')
ON DUPLICATE KEY UPDATE prediction = VALUES(prediction);
SELECT '2. prediction upsert' AS test, COUNT(*) AS expect_1_row,
       MAX(prediction) AS expect_B FROM predictions WHERE match_id = '_M_1';

-- 3. ตารางคะแนนคำนวณถูกต้อง
SELECT '3. standings' AS test, team_name, played, won, lost,
       goals_for, goals_against, goal_diff, points
  FROM v_standings WHERE tournament_id = '_T_NEW' ORDER BY points DESC;

-- 4. เปลี่ยนชื่อทีมกลางฤดูแล้วตารางคะแนนต้องไม่พัง
--    นี่คือข้อบกพร่องหลักของระบบเดิมที่เก็บ "ชื่อทีม" ไว้ใน Matches
UPDATE teams SET name = 'ทีม ก (เปลี่ยนชื่อแล้ว)' WHERE team_id = '_T_A';
SELECT '4. rename team' AS test, team_name,
       played AS expect_1, points AS expect_3
  FROM v_standings WHERE team_id = '_T_A';

-- 5. ทีมที่ยังไม่อนุมัติต้องหายจากตัวเลขสาธารณะทันที
UPDATE teams SET status = 'Submitted' WHERE team_id = '_T_B';
SELECT '5. pending hidden' AS test, COUNT(*) AS expect_1_row
  FROM v_standings WHERE tournament_id = '_T_NEW';

-- 6. โรงเรียนเดียวส่งได้หลายทีม (เช่น "อนุบาลบ่อพลอย A" / "อนุบาลบ่อพลอย B")
--    ต้องเข้าได้ และอยู่คนละสายได้ — ข้อมูลจริงครั้งที่ 3 มีเคสนี้
INSERT INTO teams (team_id, tournament_id, school_id, name, status, group_name)
VALUES ('_T_A2', '_T_NEW', '_S_A', 'ทีม ก ชุด 2', 'Approved', 'H');
UPDATE teams SET group_name = 'D' WHERE team_id = '_T_A';
SELECT '6. multi-team per school' AS test,
       COUNT(*) AS expect_2_teams,
       COUNT(DISTINCT group_name) AS expect_2_groups
  FROM teams WHERE tournament_id = '_T_NEW' AND school_id = '_S_A';

ROLLBACK;

SELECT 'ทดสอบเสร็จ — rollback แล้ว ไม่มีข้อมูลตกค้าง' AS done;

-- =====================================================================
--  ต่อไปนี้ "ต้อง error" — เอา comment ออกทีละบล็อกเพื่อยืนยัน
--  ถ้าบล็อกไหนรันผ่านโดยไม่ error แปลว่า constraint หายไป
-- =====================================================================

-- 7. ชื่อทีมซ้ำในทัวร์นาเมนต์เดียว -> ต้องได้ 1062
--    (โรงเรียนเดียวส่งหลายทีมได้ แต่ "ชื่อทีม" ต้องไม่ซ้ำ)
-- INSERT INTO teams (team_id, tournament_id, school_id, name)
-- VALUES ('_T_DUP2', '_T_NEW', '_S_B', 'ทีม ก');

-- 8. แอดมินที่ไม่มีรหัสผ่าน -> ต้องได้ 4025 (CHECK)
--    ของเดิมมีแอดมิน 4 คนแต่ตั้งรหัสแค่ 2 อีก 2 คนพึ่ง LINE อย่างเดียว
-- INSERT INTO users (user_id, display_name, role, line_user_id)
-- VALUES ('_U_BAD', 'แอดมินไม่มีรหัส', 'admin', '_L2');
