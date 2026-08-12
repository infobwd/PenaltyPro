<?php
declare(strict_types=1);

/**
 * รายงานตัวนักกีฬาหน้างาน — สำหรับเจ้าภาพ/กรรมการ
 *
 * ใช้ตอนทีมมาถึงสนาม เทียบรูปในระบบกับตัวจริงทีละคนก่อนปล่อยลงแข่ง
 * เจ้าหน้าที่เท่านั้น — โรงเรียนแก้ผลรายงานตัวของตัวเองไม่ได้
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        'checkinTeams'  => checkin_teams(),
        'checkinTeam'   => checkin_team(),
        'savePlayerCheckin' => save_player_checkin(),
        'checkinTeamBulk'   => checkin_team_bulk(),
        default => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

/** รายการทีมที่ลงแข่งได้ พร้อมความคืบหน้าการรายงานตัว */
function checkin_teams(): void
{
    Auth::requireStaff();

    $tournamentId = Input::str('tournamentId');
    if ($tournamentId === '') {
        $tournamentId = (string) (Db::value(
            "SELECT tournament_id FROM tournaments
              WHERE status = 'Active' ORDER BY created_at DESC LIMIT 1") ?? '');
    }
    if ($tournamentId === '') {
        Response::ok(['tournamentId' => '', 'teams' => []]);
    }

    // นับในคิวรีเดียว — ถ้าวนนับทีละทีมจะยิง query เท่าจำนวนทีม
    // สนามใช้เน็ตมือถือ ทุก round-trip ที่ตัดได้คือเวลาที่กรรมการไม่ต้องยืนรอ
    $teams = Db::all(
        "SELECT t.team_id, t.name, t.logo_url, t.group_name, s.school_name,
                COUNT(p.player_id) AS total,
                SUM(c.status = 'present') AS present,
                SUM(c.status = 'absent')  AS absent,
                SUM(c.status = 'issue')   AS issue
           FROM teams t
           LEFT JOIN schools s ON s.school_id = t.school_id
           LEFT JOIN players p ON p.team_id = t.team_id
           LEFT JOIN player_checkins c ON c.player_id = p.player_id
          WHERE t.tournament_id = :tid AND t.status = 'Approved'
          GROUP BY t.team_id
          ORDER BY t.group_name, t.name",
        [':tid' => $tournamentId]
    );

    Response::ok([
        'tournamentId' => $tournamentId,
        'teams' => array_map(static fn(array $t): array => [
            'id'         => $t['team_id'],
            'name'       => $t['name'],
            'logoUrl'    => drive_img($t['logo_url']),
            'group'      => (string) $t['group_name'],
            'schoolName' => (string) $t['school_name'],
            'total'      => (int) $t['total'],
            'present'    => (int) $t['present'],
            'absent'     => (int) $t['absent'],
            'issue'      => (int) $t['issue'],
        ], $teams),
    ]);
}

/** รายชื่อนักกีฬาของทีมหนึ่ง พร้อมผลรายงานตัวปัจจุบัน */
function checkin_team(): void
{
    Auth::requireStaff();

    $teamId = Input::require_str('teamId');
    $team = Db::one(
        'SELECT t.team_id, t.name, t.tournament_id, t.logo_url, t.group_name,
                t.manager_name, t.manager_phone, t.coach_name, t.coach_phone,
                s.school_name
           FROM teams t
           LEFT JOIN schools s ON s.school_id = t.school_id
          WHERE t.team_id = :tid',
        [':tid' => $teamId]
    );
    if ($team === null) {
        Response::fail('ไม่พบทีมนี้', 404);
    }

    $players = Db::all(
        'SELECT p.player_id, p.name, p.shirt_number, p.position,
                p.photo_url, p.birth_date,
                c.status, c.note, c.checked_at
           FROM players p
           LEFT JOIN player_checkins c ON c.player_id = p.player_id
          WHERE p.team_id = :tid2
          ORDER BY p.display_order, p.player_id',
        [':tid2' => $teamId]
    );

    Response::ok([
        'team' => [
            'id'         => $team['team_id'],
            'name'       => $team['name'],
            'logoUrl'    => drive_img($team['logo_url']),
            'group'      => (string) $team['group_name'],
            'schoolName' => (string) $team['school_name'],
            'managerName'  => (string) $team['manager_name'],
            'managerPhone' => (string) $team['manager_phone'],
            'coachName'    => (string) $team['coach_name'],
            'coachPhone'   => (string) $team['coach_phone'],
        ],
        'players' => array_map(static fn(array $p): array => [
            'id'        => $p['player_id'],
            'name'      => $p['name'],
            'number'    => (string) ($p['shirt_number'] ?? ''),
            'position'  => (string) $p['position'],
            'photoUrl'  => drive_img($p['photo_url']),
            'birthDate' => $p['birth_date'],
            'status'    => $p['status'],          // null = ยังไม่ได้เช็ก
            'note'      => (string) ($p['note'] ?? ''),
            'checkedAt' => isset($p['checked_at']) ? iso($p['checked_at']) : null,
        ], $players),
    ]);
}

/** บันทึกผลรายงานตัวของนักกีฬาหนึ่งคน */
function save_player_checkin(): void
{
    $u = Auth::requireStaff();

    $playerId = Input::require_str('playerId');
    $status   = Input::str('status');

    $row = Db::one(
        'SELECT p.player_id, p.name, t.team_id, t.tournament_id
           FROM players p JOIN teams t ON t.team_id = p.team_id
          WHERE p.player_id = :pid',
        [':pid' => $playerId]
    );
    if ($row === null) {
        Response::fail('ไม่พบนักกีฬาคนนี้', 404);
    }

    // ส่ง status ว่างมา = ยกเลิกผลที่เคยบันทึก กลับไปเป็น "ยังไม่ได้เช็ก"
    // กรรมการกดผิดคนได้ตลอด ต้องถอยได้โดยไม่ต้องเรียกแอดมิน
    if ($status === '') {
        Db::exec('DELETE FROM player_checkins WHERE player_id = :pid2', [':pid2' => $playerId]);
        Audit::log('player', $playerId, 'checkin_clear');
        Response::ok(['playerId' => $playerId, 'status' => null]);
    }

    if (!in_array($status, ['present', 'absent', 'issue'], true)) {
        Response::fail('สถานะไม่ถูกต้อง', 422);
    }

    $note = mb_substr(Input::str('note'), 0, 255);
    Db::exec(
        'INSERT INTO player_checkins
            (tournament_id, team_id, player_id, status, note, checked_by)
         VALUES (:tid, :team, :pid3, :st, :note, :by)
         ON DUPLICATE KEY UPDATE
            status = VALUES(status), note = VALUES(note),
            checked_by = VALUES(checked_by), checked_at = NOW()',
        [
            ':tid'  => $row['tournament_id'],
            ':team' => $row['team_id'],
            ':pid3' => $playerId,
            ':st'   => $status,
            ':note' => $note,
            ':by'   => $u['user_id'],
        ]
    );
    Audit::log('player', $playerId, 'checkin', null, ['status' => $status]);

    Response::ok(['playerId' => $playerId, 'status' => $status, 'note' => $note]);
}

/**
 * ตีตราทั้งทีมรวดเดียว
 *
 * ปกติทีมมากันครบ กดทีละ 12 คนเสียเวลาโดยไม่จำเป็น
 * กดปุ่มเดียวแล้วค่อยแก้เฉพาะคนที่ไม่มาเร็วกว่ามาก
 */
function checkin_team_bulk(): void
{
    $u = Auth::requireStaff();

    $teamId = Input::require_str('teamId');
    $status = Input::str('status');

    $team = Db::one('SELECT team_id, tournament_id FROM teams WHERE team_id = :tid',
        [':tid' => $teamId]);
    if ($team === null) {
        Response::fail('ไม่พบทีมนี้', 404);
    }

    if ($status === '') {
        $n = Db::exec('DELETE FROM player_checkins WHERE team_id = :tid2', [':tid2' => $teamId]);
        Audit::log('team', $teamId, 'checkin_clear_all');
        Response::ok(['teamId' => $teamId, 'affected' => $n]);
    }

    if (!in_array($status, ['present', 'absent', 'issue'], true)) {
        Response::fail('สถานะไม่ถูกต้อง', 422);
    }

    // เขียนทับเฉพาะคนที่ยังไม่ได้เช็ก ไม่ลบผลที่กรรมการตั้งใจกดไว้แล้ว
    // (เช่นกด "ไม่มา" ไว้ก่อน แล้วค่อยกด "มาครบ" ทั้งทีม — คนที่ไม่มาต้องยังไม่มา)
    $onlyNew = Input::str('scope') !== 'all';
    $players = Db::all(
        $onlyNew
            ? 'SELECT p.player_id FROM players p
                 LEFT JOIN player_checkins c ON c.player_id = p.player_id
                WHERE p.team_id = :tid3 AND c.player_id IS NULL'
            : 'SELECT player_id FROM players WHERE team_id = :tid3',
        [':tid3' => $teamId]
    );

    foreach ($players as $p) {
        Db::exec(
            'INSERT INTO player_checkins
                (tournament_id, team_id, player_id, status, checked_by)
             VALUES (:tid4, :team2, :pid, :st2, :by2)
             ON DUPLICATE KEY UPDATE
                status = VALUES(status), checked_by = VALUES(checked_by), checked_at = NOW()',
            [
                ':tid4'  => $team['tournament_id'],
                ':team2' => $teamId,
                ':pid'   => $p['player_id'],
                ':st2'   => $status,
                ':by2'   => $u['user_id'],
            ]
        );
    }
    Audit::log('team', $teamId, 'checkin_bulk', null,
        ['status' => $status, 'count' => count($players)]);

    Response::ok(['teamId' => $teamId, 'affected' => count($players)]);
}
