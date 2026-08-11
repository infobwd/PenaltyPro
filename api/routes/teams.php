<?php
declare(strict_types=1);

/**
 * ทีมและรายชื่อผู้เล่น
 *
 * เส้นทางหลักของงานนี้ (เดดไลน์ 20 ส.ค.):
 *   cloneTeams  แอดมินคัดลอกทีมจากทัวร์นาเมนต์ก่อน -> สถานะ "รอยืนยัน"
 *   myTeams     โรงเรียนใส่รหัสแล้วเห็นทีมของตัวเอง
 *   saveTeam    โรงเรียนแก้ชื่อ/สี/รายชื่อผู้เล่น
 *   submitTeam  โรงเรียนกดยืนยันส่ง
 *   reviewTeam  แอดมินอนุมัติ/ปฏิเสธ
 *
 * กติกาที่บังคับฝั่ง server ทุกครั้ง (ของเดิมเช็คแค่ฝั่ง client):
 *   - โรงเรียนแก้ได้เฉพาะทีมของ school_id ตัวเอง
 *   - แก้ได้เฉพาะก่อน registration_deadline
 *   - จำนวนผู้เล่นไม่เกิน players_per_team + max_subs
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        'cloneTeams'  => clone_teams(),
        'myTeams'     => my_teams(),
        'saveTeam'    => save_team(),
        'submitTeam'  => submit_team(),
        'reviewTeam'  => review_team(),
        default       => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

// ── helper ────────────────────────────────────────────────────────────────

function load_tournament(string $id): array
{
    $t = Db::one(
        'SELECT tournament_id, name, status, registration_deadline,
                max_teams, max_teams_per_school, players_per_team, max_subs
           FROM tournaments WHERE tournament_id = :tid',
        [':tid' => $id]
    );
    if ($t === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }
    return $t;
}

/** ปิดรับสมัครแล้วห้ามแก้ — ยกเว้นแอดมินที่ต้องแก้ให้ได้เสมอ */
function assert_window_open(array $t): void
{
    if (Auth::isAdmin() || Auth::isStaff()) {
        return;
    }
    $deadline = $t['registration_deadline'];
    if ($deadline !== null && strtotime((string) $deadline) < time()) {
        Response::fail(
            'เลยกำหนดปิดรับสมัครแล้ว ไม่สามารถแก้ไขข้อมูลได้',
            403,
            ['registrationDeadline' => $deadline]
        );
    }
}

function team_payload(array $t, array $players): array
{
    return [
        'id'         => $t['team_id'],
        'name'       => $t['name'],
        'shortName'  => $t['short_name'],
        'colorPrimary'   => $t['color_primary'],
        'colorSecondary' => $t['color_secondary'],
        'logoUrl'    => $t['logo_url'],
        'status'     => $t['status'],
        'group'      => (string) $t['group_name'],
        'rejectReason' => $t['reject_reason'],
        'directorName' => $t['director_name'],
        'managerName'  => $t['manager_name'],
        'managerPhone' => $t['manager_phone'],
        'coachName'    => $t['coach_name'],
        'coachPhone'   => $t['coach_phone'],
        'docUrl'     => $t['doc_url'],
        'slipUrl'    => $t['slip_url'],
        'rowVersion' => (int) $t['row_version'],
        'players'    => array_map(static fn(array $p): array => [
            'id'        => $p['player_id'],
            'name'      => $p['name'],
            'number'    => (string) ($p['shirt_number'] ?? ''),
            'position'  => $p['position'],
            'photoUrl'  => $p['photo_url'],
            'birthDate' => $p['birth_date'],
        ], $players),
    ];
}

// ── clone ทีมเดิมมาแข่งฤดูใหม่ ─────────────────────────────────────────────

/**
 * คัดลอกทีมจากทัวร์นาเมนต์ก่อนหน้ามาเป็น "รอยืนยัน" ในทัวร์นาเมนต์ใหม่
 *
 * ผู้เล่นถูก clone เป็น snapshot ชุดใหม่ ไม่ใช่ใช้แถวเดิมร่วมกัน — ถ้าใช้ร่วม
 * การแก้รายชื่อปีนี้จะไปแก้ประวัติปีที่แล้วด้วย ผลการแข่งเก่าจะเพี้ยน
 */
function clone_teams(): void
{
    Auth::requireAdmin();

    $from = Input::require_str('fromTournamentId');
    $to   = Input::require_str('toTournamentId');
    if ($from === $to) {
        Response::fail('ต้นทางกับปลายทางต้องเป็นคนละรายการ', 422);
    }
    load_tournament($from);
    $target = load_tournament($to);

    $existing = (int) Db::value(
        'SELECT COUNT(*) FROM teams WHERE tournament_id = :tid', [':tid' => $to]);
    if ($existing > 0 && !Input::bool('force')) {
        Response::fail(
            "ปลายทางมี $existing ทีมอยู่แล้ว — ส่ง force=true ถ้าต้องการคัดลอกเพิ่ม",
            409, ['existingTeams' => $existing]
        );
    }

    $source = Db::all(
        'SELECT * FROM teams WHERE tournament_id = :tid2 ORDER BY name',
        [':tid2' => $from]
    );
    if ($source === []) {
        Response::fail('รายการต้นทางไม่มีทีมให้คัดลอก', 409);
    }

    $created = [];
    $skipped = [];

    Db::transaction(static function () use ($source, $to, &$created, &$skipped): void {
        foreach ($source as $s) {
            // ทีมเดิมของโรงเรียนนี้อยู่ในปลายทางแล้วหรือยัง (ชื่อซ้ำ = UNIQUE ชน)
            $dup = Db::value(
                'SELECT team_id FROM teams WHERE tournament_id = :tid AND name = :name',
                [':tid' => $to, ':name' => $s['name']]
            );
            if ($dup !== null) {
                $skipped[] = $s['name'];
                continue;
            }

            $newId = 'T_' . (int) (microtime(true) * 1000) . '_' . random_int(100, 999);
            Db::exec(
                'INSERT INTO teams
                    (team_id, tournament_id, school_id, source_team_id, name, short_name,
                     color_primary, color_secondary, logo_url, status,
                     director_name, manager_name, manager_phone, coach_name, coach_phone)
                 VALUES (:id, :tid2, :sid, :src, :name, :short,
                         :c1, :c2, :logo, :status,
                         :dir, :mgr, :mgrp, :coach, :coachp)',
                [
                    ':id'     => $newId,
                    ':tid2'   => $to,
                    ':sid'    => $s['school_id'],
                    ':src'    => $s['team_id'],
                    ':name'   => $s['name'],
                    ':short'  => $s['short_name'],
                    ':c1'     => $s['color_primary'],
                    ':c2'     => $s['color_secondary'],
                    ':logo'   => $s['logo_url'],
                    // ยังไม่ใช่ผู้เข้าแข่งขันจนกว่าโรงเรียนจะยืนยันเอง
                    ':status' => 'Invited',
                    ':dir'    => $s['director_name'],
                    ':mgr'    => $s['manager_name'],
                    ':mgrp'   => $s['manager_phone'],
                    ':coach'  => $s['coach_name'],
                    ':coachp' => $s['coach_phone'],
                ]
            );

            $players = Db::all(
                'SELECT * FROM players WHERE team_id = :src2 ORDER BY display_order, player_id',
                [':src2' => $s['team_id']]
            );
            foreach ($players as $i => $p) {
                Db::exec(
                    'INSERT INTO players
                        (player_id, team_id, source_player_id, name, shirt_number,
                         position, photo_url, birth_date, display_order)
                     VALUES (:pid, :tid3, :src3, :name2, :num, :pos, :photo, :bd, :ord)',
                    [
                        ':pid'   => 'P_' . (int) (microtime(true) * 1000) . '_' . $i
                                    . '_' . random_int(10, 99),
                        ':tid3'  => $newId,
                        ':src3'  => $p['player_id'],
                        ':name2' => $p['name'],
                        ':num'   => $p['shirt_number'],
                        ':pos'   => $p['position'],
                        ':photo' => $p['photo_url'],
                        ':bd'    => $p['birth_date'],
                        ':ord'   => $i,
                    ]
                );
            }

            $created[] = [
                'teamId'      => $newId,
                'name'        => $s['name'],
                'playerCount' => count($players),
            ];
        }
    });

    Audit::log('tournament', $to, 'clone_teams',
        ['from' => $from], ['created' => count($created), 'skipped' => count($skipped)]);
    Cache::flush();

    $noRoster = count(array_filter($created, static fn(array $c): bool => $c['playerCount'] === 0));

    Response::ok([
        'created'      => count($created),
        'skipped'      => $skipped,
        'teams'        => $created,
        'withoutRoster' => $noRoster,
        'notice' => $noRoster > 0
            ? "$noRoster ทีมไม่มีรายชื่อผู้เล่นติดมา — โรงเรียนต้องกรอกใหม่เอง"
            : '',
    ]);
}

// ── ฝั่งโรงเรียน ──────────────────────────────────────────────────────────

function my_teams(): void
{
    $schoolId = Auth::requireSchool();
    $tournamentId = Auth::teamTournamentId();
    $t = load_tournament((string) $tournamentId);

    $teams = Db::all(
        'SELECT * FROM teams WHERE school_id = :sid AND tournament_id = :tid ORDER BY name',
        [':sid' => $schoolId, ':tid' => $tournamentId]
    );

    $out = [];
    foreach ($teams as $team) {
        $players = Db::all(
            'SELECT * FROM players WHERE team_id = :tmid ORDER BY display_order, player_id',
            [':tmid' => $team['team_id']]
        );
        $out[] = team_payload($team, $players);
    }

    $deadline = $t['registration_deadline'];
    Response::ok([
        'tournament' => [
            'id'   => $t['tournament_id'],
            'name' => $t['name'],
            'registrationDeadline' => $deadline,
            'isOpen' => $deadline === null || strtotime((string) $deadline) > time(),
            'playersPerTeam' => (int) $t['players_per_team'],
            'maxSubs'        => (int) $t['max_subs'],
            'maxTeamsPerSchool' => (int) $t['max_teams_per_school'],
        ],
        'teams' => $out,
    ]);
}

/**
 * บันทึกข้อมูลทีม + รายชื่อผู้เล่น (แทนที่ทั้งชุด)
 *
 * ใช้ row_version กันเขียนทับ: ถ้าแอดมินอนุมัติไปพร้อมกับที่โรงเรียนกดบันทึก
 * ฝ่ายที่ช้ากว่าจะได้ 409 พร้อมข้อมูลล่าสุด แทนที่จะเขียนทับเงียบ ๆ
 */
function save_team(): void
{
    $teamId = Input::require_str('teamId');
    $team = Db::one('SELECT * FROM teams WHERE team_id = :tid', [':tid' => $teamId]);
    if ($team === null) {
        Response::fail('ไม่พบทีมนี้', 404);
    }

    // โรงเรียนแก้ได้เฉพาะทีมตัวเอง / แอดมินแก้ได้ทุกทีม
    $schoolId = Auth::schoolId();
    if ($schoolId !== null) {
        if ($schoolId !== $team['school_id']) {
            Response::fail('ทีมนี้ไม่ใช่ของโรงเรียนคุณ', 403);
        }
    } else {
        Auth::requireStaff();
    }

    $t = load_tournament($team['tournament_id']);
    assert_window_open($t);

    $expected = Input::int('rowVersion');
    if ($expected !== null && $expected !== (int) $team['row_version']) {
        Response::fail('ข้อมูลถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่แล้วลองอีกครั้ง', 409,
            ['currentRowVersion' => (int) $team['row_version']]);
    }

    $players = Input::arr('players');
    $limit = (int) $t['players_per_team'] + (int) $t['max_subs'];
    if (count($players) > $limit) {
        Response::fail("รายชื่อผู้เล่นเกินกำหนด (สูงสุด $limit คน)", 422,
            ['limit' => $limit, 'given' => count($players)]);
    }

    // เลขเสื้อห้ามซ้ำในทีมเดียวกัน — ตรวจก่อนเขียนเพื่อให้ข้อความผิดพลาดเข้าใจง่าย
    // กว่าปล่อยให้ UNIQUE ของ MySQL โยน 1062 ออกมา
    $seen = [];
    foreach ($players as $p) {
        $num = trim((string) ($p['number'] ?? ''));
        if ($num === '') {
            continue;
        }
        if (isset($seen[$num])) {
            Response::fail("เลขเสื้อ $num ซ้ำกันในทีม", 422);
        }
        $seen[$num] = true;
    }

    $name = trim((string) Input::get('name', $team['name']));
    if ($name === '') {
        Response::fail('ต้องระบุชื่อทีม', 422);
    }

    Db::transaction(static function () use ($teamId, $team, $name, $players): void {
        Db::exec(
            'UPDATE teams SET
                name = :name, short_name = :short,
                color_primary = :c1, color_secondary = :c2, logo_url = :logo,
                director_name = :dir, manager_name = :mgr, manager_phone = :mgrp,
                coach_name = :coach, coach_phone = :coachp,
                doc_url = :doc, slip_url = :slip,
                status = CASE WHEN status = :st_invited THEN :st_draft ELSE status END,
                confirmed_at = COALESCE(confirmed_at, NOW()),
                row_version = row_version + 1
              WHERE team_id = :tid',
            [
                ':name'   => $name,
                ':short'  => (string) Input::get('shortName', $team['short_name']),
                ':c1'     => (string) Input::get('colorPrimary', $team['color_primary']),
                ':c2'     => (string) Input::get('colorSecondary', $team['color_secondary']),
                ':logo'   => (string) Input::get('logoUrl', $team['logo_url']),
                ':dir'    => (string) Input::get('directorName', $team['director_name']),
                ':mgr'    => (string) Input::get('managerName', $team['manager_name']),
                ':mgrp'   => (string) Input::get('managerPhone', $team['manager_phone']),
                ':coach'  => (string) Input::get('coachName', $team['coach_name']),
                ':coachp' => (string) Input::get('coachPhone', $team['coach_phone']),
                ':doc'    => (string) Input::get('docUrl', $team['doc_url']),
                ':slip'   => (string) Input::get('slipUrl', $team['slip_url']),
                ':st_invited' => 'Invited',
                ':st_draft'   => 'Draft',
                ':tid'    => $teamId,
            ]
        );

        // แทนที่รายชื่อทั้งชุด — ง่ายและถูกต้องกว่าไล่ diff ทีละคน
        Db::exec('DELETE FROM players WHERE team_id = :tid2', [':tid2' => $teamId]);
        foreach ($players as $i => $p) {
            $num = trim((string) ($p['number'] ?? ''));
            $bd  = trim((string) ($p['birthDate'] ?? ''));
            $ts  = $bd === '' ? false : strtotime($bd);
            Db::exec(
                'INSERT INTO players
                    (player_id, team_id, name, shirt_number, position,
                     photo_url, birth_date, display_order)
                 VALUES (:pid, :tid3, :name2, :num, :pos, :photo, :bd, :ord)',
                [
                    ':pid'   => 'P_' . (int) (microtime(true) * 1000) . '_' . $i
                                . '_' . random_int(10, 99),
                    ':tid3'  => $teamId,
                    ':name2' => trim((string) ($p['name'] ?? '')),
                    // '' ต้องเป็น NULL ไม่งั้น uq_player_shirt ชนกันเอง
                    ':num'   => $num === '' ? null : $num,
                    ':pos'   => (string) ($p['position'] ?? 'Player'),
                    ':photo' => (string) ($p['photoUrl'] ?? ''),
                    ':bd'    => $ts === false ? null : date('Y-m-d', $ts),
                    ':ord'   => $i,
                ]
            );
        }
    });

    Audit::log('team', $teamId, 'save',
        ['name' => $team['name']], ['name' => $name, 'players' => count($players)]);
    Cache::flush();

    $fresh = Db::one('SELECT * FROM teams WHERE team_id = :tid4', [':tid4' => $teamId]);
    $freshPlayers = Db::all(
        'SELECT * FROM players WHERE team_id = :tid5 ORDER BY display_order',
        [':tid5' => $teamId]);
    Response::ok(['team' => team_payload($fresh, $freshPlayers)]);
}

/** โรงเรียนกด "ยืนยันและส่ง" — หลังจากนี้แอดมินเป็นผู้ตรวจ */
function submit_team(): void
{
    $teamId = Input::require_str('teamId');
    $team = Db::one('SELECT * FROM teams WHERE team_id = :tid', [':tid' => $teamId]);
    if ($team === null) {
        Response::fail('ไม่พบทีมนี้', 404);
    }

    $schoolId = Auth::schoolId();
    if ($schoolId === null || $schoolId !== $team['school_id']) {
        Response::fail('ทีมนี้ไม่ใช่ของโรงเรียนคุณ', 403);
    }

    $t = load_tournament($team['tournament_id']);
    assert_window_open($t);

    if (Input::bool('withdraw')) {
        Db::exec("UPDATE teams SET status = 'Withdrawn', row_version = row_version + 1
                   WHERE team_id = :tid2", [':tid2' => $teamId]);
        Audit::log('team', $teamId, 'withdraw');
        Cache::flush();
        Response::ok(['status' => 'Withdrawn']);
    }

    $playerCount = (int) Db::value('SELECT COUNT(*) FROM players WHERE team_id = :tid3',
        [':tid3' => $teamId]);
    if ($playerCount === 0) {
        Response::fail('ยังไม่มีรายชื่อผู้เล่น กรุณากรอกรายชื่อก่อนส่ง', 422);
    }

    Db::exec(
        "UPDATE teams SET status = 'Submitted', submitted_at = NOW(),
                          reject_reason = '', row_version = row_version + 1
          WHERE team_id = :tid4",
        [':tid4' => $teamId]
    );
    Audit::log('team', $teamId, 'submit', null, ['players' => $playerCount]);
    Cache::flush();

    Response::ok(['status' => 'Submitted', 'playerCount' => $playerCount]);
}

// ── ฝั่งแอดมิน ────────────────────────────────────────────────────────────

function review_team(): void
{
    Auth::requireStaff();

    $teamId = Input::require_str('teamId');
    $decision = Input::enum('decision', ['approve', 'reject'], null);
    if ($decision === null) {
        Response::fail('ต้องระบุ decision = approve หรือ reject', 422);
    }

    $team = Db::one('SELECT * FROM teams WHERE team_id = :tid', [':tid' => $teamId]);
    if ($team === null) {
        Response::fail('ไม่พบทีมนี้', 404);
    }
    $t = load_tournament($team['tournament_id']);

    if ($decision === 'reject') {
        $reason = Input::str('reason');
        if ($reason === '') {
            // ปฏิเสธโดยไม่บอกเหตุผล = โรงเรียนไม่รู้จะแก้อะไร แล้วต้องโทรถาม
            Response::fail('ต้องระบุเหตุผลที่ปฏิเสธ เพื่อให้โรงเรียนแก้ไขได้ถูกจุด', 422);
        }
        Db::exec(
            "UPDATE teams SET status = 'Rejected', reject_reason = :reason,
                              approved_at = NULL, approved_by = NULL,
                              row_version = row_version + 1
              WHERE team_id = :tid2",
            [':reason' => $reason, ':tid2' => $teamId]
        );
        Audit::log('team', $teamId, 'reject', ['status' => $team['status']],
            ['reason' => $reason]);
        Cache::flush();
        Response::ok(['status' => 'Rejected']);
    }

    // อนุมัติ — ตรวจเพดานจำนวนทีมก่อน
    $approved = (int) Db::value(
        "SELECT COUNT(*) FROM teams
          WHERE tournament_id = :tid3 AND status = 'Approved' AND team_id <> :tid4",
        [':tid3' => $team['tournament_id'], ':tid4' => $teamId]
    );
    $max = $t['max_teams'] === null ? null : (int) $t['max_teams'];
    if ($max !== null && $approved >= $max) {
        Response::fail("อนุมัติครบ $max ทีมตามเพดานแล้ว", 409,
            ['approved' => $approved, 'maxTeams' => $max]);
    }

    $perSchool = (int) Db::value(
        "SELECT COUNT(*) FROM teams
          WHERE tournament_id = :tid5 AND school_id = :sid
            AND status = 'Approved' AND team_id <> :tid6",
        [':tid5' => $team['tournament_id'], ':sid' => $team['school_id'], ':tid6' => $teamId]
    );
    $maxPer = (int) $t['max_teams_per_school'];
    if ($perSchool >= $maxPer) {
        Response::fail(
            "โรงเรียนนี้อนุมัติครบ $maxPer ทีมตามเพดานต่อโรงเรียนแล้ว",
            409, ['approvedForSchool' => $perSchool, 'maxTeamsPerSchool' => $maxPer]
        );
    }

    Db::exec(
        "UPDATE teams SET status = 'Approved', approved_at = NOW(), approved_by = :by,
                          reject_reason = '', row_version = row_version + 1
          WHERE team_id = :tid7",
        [':by' => Auth::userId(), ':tid7' => $teamId]
    );
    Audit::log('team', $teamId, 'approve', ['status' => $team['status']], null);
    Cache::flush();

    Response::ok(['status' => 'Approved', 'approvedCount' => $approved + 1]);
}
