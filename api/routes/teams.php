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
 *   - แก้ได้เฉพาะเมื่อเปิดแก้ไข และก่อน team_edit_deadline
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
        'reviewRegistrationPayment' => review_registration_payment(),
        'createTeam'  => create_team(),
        'deleteTeam'  => delete_team(),
        'setTeamMeta' => set_team_meta(),
        'setLineupMedia' => set_lineup_media(),
        'updatePlayerNumber' => update_player_number(),
        'updatePlayerLineup' => update_player_lineup(),
        default       => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

// ── helper ────────────────────────────────────────────────────────────────

function load_tournament(string $id): array
{
    $t = Db::one(
        'SELECT tournament_id, name, status, registration_deadline,
                team_editing_enabled, team_edit_deadline,
                max_teams, max_teams_per_school, players_per_team, max_subs,
                registration_fee, bank_name, bank_account, account_name
           FROM tournaments WHERE tournament_id = :tid',
        [':tid' => $id]
    );
    if ($t === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }
    return $t;
}

/** ปิดช่วงแก้ไขรายชื่อแล้วห้ามแก้ — ยกเว้นแอดมินที่ต้องแก้ให้ได้เสมอ */
function assert_window_open(array $t): void
{
    if (Auth::isAdmin() || Auth::isStaff()) {
        return;
    }
    if ((int) $t['team_editing_enabled'] !== 1) {
        Response::fail('ผู้ดูแลระบบปิดการแก้ไขข้อมูลทีมและรายชื่อนักกีฬาแล้ว', 403);
    }
    $deadline = $t['team_edit_deadline'];
    if ($deadline !== null && strtotime((string) $deadline) < time()) {
        Response::fail(
            'เลยกำหนดแก้ไขข้อมูลทีมและรายชื่อนักกีฬาแล้ว',
            403,
            ['teamEditDeadline' => $deadline]
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
        'logoUrl'    => drive_img($t['logo_url']),
        'status'     => $t['status'],
        'group'      => (string) $t['group_name'],
        'rejectReason' => $t['reject_reason'],
        'directorName' => $t['director_name'],
        'managerName'  => $t['manager_name'],
        'managerPhone' => $t['manager_phone'],
        'coachName'    => $t['coach_name'],
        'coachPhone'   => $t['coach_phone'],
        'docUrl'     => drive_img($t['doc_url']),
        'slipUrl'    => drive_img($t['slip_url']),
        'paymentStatus' => $t['payment_status'] ?? ((string) $t['slip_url'] !== '' ? 'Pending' : 'Unpaid'),
        'paymentNote' => $t['payment_note'] ?? '',
        'paymentReviewedAt' => isset($t['payment_reviewed_at']) ? iso($t['payment_reviewed_at']) : null,
        'rowVersion' => (int) $t['row_version'],
        'players'    => array_map(static fn(array $p): array => [
            'id'        => $p['player_id'],
            'name'      => $p['name'],
            'number'    => (string) ($p['shirt_number'] ?? ''),
            'position'  => $p['position'],
            'photoUrl'  => drive_img($p['photo_url']),
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
    Auth::requireLogin();

    $from = Input::require_str('fromTournamentId');
    $to   = Input::require_str('toTournamentId');
    // เจ้าภาพคัดลอกทีมเข้ารายการของตัวเองได้ แต่ต้องมีสิทธิ์ในรายการปลายทาง
    Perm::requireTournamentManager($to);
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

    $deadline = $t['team_edit_deadline'];
    $editingEnabled = (int) $t['team_editing_enabled'] === 1;
    Response::ok([
        'tournament' => [
            'id'   => $t['tournament_id'],
            'name' => $t['name'],
            'registrationDeadline' => $t['registration_deadline'],
            'teamEditDeadline' => $deadline,
            'isOpen' => $editingEnabled && ($deadline === null || strtotime((string) $deadline) > time()),
            'playersPerTeam' => (int) $t['players_per_team'],
            'maxSubs'        => (int) $t['max_subs'],
            'maxTeamsPerSchool' => (int) $t['max_teams_per_school'],
            // บัญชีรับค่าสมัคร — ส่งมากับ myTeams เลย
            //
            // หน้าโรงเรียนถือ token ของทีม ไม่ใช่ของผู้ใช้ และไม่ได้โหลด getData
            // ถ้าไม่ส่งมาตรงนี้ ครูต้องกลับไปหาเลขบัญชีจากหน้าอื่นหรือจากไลน์กลุ่ม
            // แล้วจำมาพิมพ์เอง ซึ่งเป็นที่มาของการโอนผิดบัญชี
            'registrationFee' => (float) $t['registration_fee'],
            'bankName'    => (string) $t['bank_name'],
            'bankAccount' => (string) $t['bank_account'],
            'accountName' => (string) $t['account_name'],
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
function normalize_player_birth_date(string $raw): ?string
{
    $value = trim($raw);
    if ($value === '') {
        return null;
    }

    $year = $month = $day = 0;
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $value, $m)) {
        $year = (int) $m[1]; $month = (int) $m[2]; $day = (int) $m[3];
    } elseif (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/', $value, $m)) {
        $day = (int) $m[1]; $month = (int) $m[2]; $year = (int) $m[3];
    } else {
        Response::fail('รูปแบบวันเกิดไม่ถูกต้อง กรุณาเลือกวันจากปฏิทิน', 422);
    }

    // อุปกรณ์ภาษาไทยบางรุ่นหรือข้อมูลที่ย้ายมาจากเอกสารส่งปี พ.ศ. มาให้
    // แม้ input[type=date] มาตรฐานควรส่ง ค.ศ. จึงแปลงทั้งสองรูปแบบที่ชั้น API อีกครั้ง
    if ($year > 2400) {
        $year -= 543;
    }
    if (!checkdate($month, $day, $year)) {
        Response::fail('วันเกิดไม่ถูกต้อง', 422);
    }

    $normalized = sprintf('%04d-%02d-%02d', $year, $month, $day);
    if ($normalized > date('Y-m-d')) {
        Response::fail('วันเกิดต้องไม่อยู่ในอนาคต', 422);
    }
    return $normalized;
}

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

    // แยก "ไม่ส่ง players มา" ออกจาก "ส่งมาเป็นรายการว่าง"
    //
    // หน้าแอดมินแก้เฉพาะข้อมูลทีม ไม่ได้ส่งรายชื่อมาด้วย ถ้าตีความว่าเป็น
    // รายการว่างจะลบผู้เล่นทิ้งทั้งทีมโดยไม่มีใครตั้งใจ — และกู้ไม่ได้
    $touchPlayers = array_key_exists('players', Input::body());
    $players = $touchPlayers ? Input::arr('players') : [];

    $limit = (int) $t['players_per_team'] + (int) $t['max_subs'];
    if ($touchPlayers && count($players) > $limit) {
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

    $newSlip = (string) Input::get('slipUrl', $team['slip_url']);
    $slipChanged = $newSlip !== (string) $team['slip_url'];
    // การแนบสลิปภายหลังต้องไม่ล้มสถานะที่ผู้ดูแลยืนยันจากเงินสด/ช่องทางนอกระบบแล้ว
    // ส่วนสลิปปกติที่ถูกเปลี่ยนยังต้องกลับไปรอตรวจเหมือนเดิม
    $manualPaymentVerified = (string) ($team['payment_status'] ?? '') === 'Verified'
        && str_starts_with((string) ($team['payment_note'] ?? ''), 'ชำระนอกระบบ —');
    $paymentNeedsReset = !$manualPaymentVerified && ($newSlip === '' || $slipChanged);
    $newPaymentStatus = $manualPaymentVerified
        ? 'Verified'
        : ($newSlip === '' ? 'Unpaid'
            : ($slipChanged ? 'Pending' : (string) ($team['payment_status'] ?? 'Pending')));
    $newPaymentNote = $paymentNeedsReset ? '' : (string) ($team['payment_note'] ?? '');
    $newPaymentReviewedAt = $paymentNeedsReset ? null : ($team['payment_reviewed_at'] ?? null);
    $newPaymentReviewedBy = $paymentNeedsReset ? null : ($team['payment_reviewed_by'] ?? null);

    // ── หาว่าอะไรเปลี่ยนบ้าง ก่อนจะเขียนอะไรลงไป ─────────────────────────
    //
    // ผลจากตรงนี้ใช้ 3 อย่าง:
    //   1. ตัดสินว่าต้องถอนอนุมัติไหม (ถอนเฉพาะเมื่อเปลี่ยนจริง)
    //   2. บอกผู้ดูแลว่าอะไรเปลี่ยน จะได้ไม่ต้องไล่เทียบเอง 12 คน
    //   3. ข้ามการ UPDATE แถวที่ไม่ได้เปลี่ยน — สำคัญกว่าที่คิด เพราะ
    //      players.updated_at เป็น ON UPDATE CURRENT_TIMESTAMP
    //      ถ้าเขียนทับทุกแถวทุกครั้ง เวลาแก้จะเดินหมดทั้งทีม แล้วธงเตือน
    //      "แก้หลังรายงานตัว" ในหน้ารายงานตัวจะขึ้นให้ทุกคนจนไร้ความหมาย
    $changes = [];

    $teamFields = [
        ['ชื่อทีม',        'name',           $name],
        ['ชื่อย่อ',        'short_name',     (string) Input::get('shortName', $team['short_name'])],
        ['ผู้อำนวยการ',    'director_name',  (string) Input::get('directorName', $team['director_name'])],
        ['ผู้จัดการทีม',   'manager_name',   (string) Input::get('managerName', $team['manager_name'])],
        ['เบอร์ผู้จัดการ', 'manager_phone',  (string) Input::get('managerPhone', $team['manager_phone'])],
        ['ผู้ฝึกสอน',      'coach_name',     (string) Input::get('coachName', $team['coach_name'])],
        ['เบอร์ผู้ฝึกสอน', 'coach_phone',    (string) Input::get('coachPhone', $team['coach_phone'])],
        ['โลโก้ทีม',       'logo_url',       (string) Input::get('logoUrl', $team['logo_url'])],
        ['เอกสารรับรอง',   'doc_url',        (string) Input::get('docUrl', $team['doc_url'])],
    ];
    foreach ($teamFields as [$label, $col, $val]) {
        if ((string) ($team[$col] ?? '') !== $val) {
            $changes[] = $label === 'โลโก้ทีม' || $label === 'เอกสารรับรอง'
                ? "เปลี่ยน$label"
                : "$label: " . (((string) ($team[$col] ?? '')) ?: '(ว่าง)') . ' → ' . ($val ?: '(ว่าง)');
        }
    }
    if ($slipChanged) {
        $changes[] = $newSlip === '' ? 'เอาสลิปค่าสมัครออก' : 'แนบสลิปค่าสมัครใหม่';
    }

    // ── จับคู่ผู้เล่นเดิมกับที่ส่งมา ─────────────────────────────────────
    //
    // จับคู่ด้วย id ที่ client ส่งกลับมาก่อน ถ้าไม่มีค่อยใช้ชื่อ+เบอร์เสื้อ
    // (client เก่าบางตัวไม่ส่ง id — ต้องไม่พังและต้องไม่ทิ้งข้อมูล)
    $existing = $touchPlayers
        ? Db::all('SELECT player_id, name, shirt_number, position, photo_url, birth_date,
                          display_order
                     FROM players WHERE team_id = :tid2', [':tid2' => $teamId])
        : [];

    $natural = static fn(?string $n, ?string $num): string =>
        mb_strtolower(trim((string) $n)) . '#' . trim((string) $num);

    $byId = [];
    $byKey = [];
    foreach ($existing as $e) {
        $byId[$e['player_id']] = $e;
        $byKey[$natural($e['name'], $e['shirt_number'])][] = $e['player_id'];
    }

    $matched = [];   // player_id -> ข้อมูลชุดใหม่ (ทุกคนที่จับคู่ได้)
    $updates = [];   // เฉพาะคนที่มีอะไรเปลี่ยนจริง
    $insert  = [];   // แถวใหม่ล้วน
    $recheck = [];   // ตัวตนเปลี่ยน ต้องให้เจ้าภาพตรวจใหม่

    foreach ($players as $i => $pIn) {
        $pname = trim((string) ($pIn['name'] ?? ''));
        $num   = trim((string) ($pIn['number'] ?? ''));
        $bd    = normalize_player_birth_date((string) ($pIn['birthDate'] ?? ''));
        $row = [
            'name'  => $pname,
            // '' ต้องเป็น NULL ไม่งั้น uq_player_shirt ชนกันเอง
            'num'   => $num === '' ? null : $num,
            'pos'   => (string) ($pIn['position'] ?? 'Player'),
            'photo' => (string) ($pIn['photoUrl'] ?? ''),
            'bd'    => $bd,
            'ord'   => $i,
        ];

        $hit = null;
        $sentId = trim((string) ($pIn['id'] ?? ''));
        if ($sentId !== '' && isset($byId[$sentId]) && !isset($matched[$sentId])) {
            $hit = $sentId;
        } else {
            foreach ($byKey[$natural($pname, $num)] ?? [] as $cand) {
                if (!isset($matched[$cand])) { $hit = $cand; break; }
            }
        }

        if ($hit === null) {
            $insert[] = $row;
            $changes[] = 'เพิ่ม ' . ($pname !== '' ? $pname : 'นักกีฬาไม่ระบุชื่อ')
                . ($num !== '' ? " (เบอร์ $num)" : '');
            continue;
        }

        $old = $byId[$hit];
        $matched[$hit] = $row;

        $diff = [];
        if (mb_strtolower(trim((string) $old['name'])) !== mb_strtolower($pname)) {
            $diff[] = 'ชื่อ';
            $recheck[] = $hit;
            $changes[] = 'เปลี่ยนชื่อ ' . $old['name'] . ' → ' . $pname;
        }
        if ((string) ($old['shirt_number'] ?? '') !== (string) ($row['num'] ?? '')) {
            $diff[] = 'num';
            $changes[] = $pname . ' เบอร์ '
                . (((string) ($old['shirt_number'] ?? '')) ?: '-') . ' → '
                . (((string) ($row['num'] ?? '')) ?: '-');
        }
        if ((string) $old['photo_url'] !== $row['photo']) {
            $diff[] = 'photo';
            $changes[] = $pname . ' เปลี่ยนรูป';
        }
        if ((string) ($old['birth_date'] ?? '') !== (string) ($row['bd'] ?? '')) {
            $diff[] = 'bd';
            $changes[] = $pname . ' เปลี่ยนวันเกิด';
        }
        if ((string) $old['position'] !== $row['pos']) { $diff[] = 'pos'; }
        if ((int) $old['display_order'] !== (int) $row['ord']) { $diff[] = 'ord'; }

        if ($diff !== []) {
            $updates[$hit] = $row + ['_numChanged' => in_array('num', $diff, true)];
        }
    }

    if ($touchPlayers) {
        foreach ($existing as $e) {
            if (!isset($matched[$e['player_id']])) {
                $changes[] = 'เอาออก ' . $e['name']
                    . ($e['shirt_number'] !== null ? " (เบอร์ {$e['shirt_number']})" : '');
            }
        }
    }

    /**
     * ถอนอนุมัติเฉพาะเมื่อข้อมูลเปลี่ยนจริง
     *
     * เดิมถอนทุกครั้งที่โรงเรียนกดบันทึก และตั้งแต่มีบันทึกอัตโนมัติทุก 2.5 วินาที
     * ครูแค่เปิดหน้าแก้ไข พิมพ์แล้วลบทิ้ง ทีมก็หลุดอนุมัติเงียบ ๆ
     * ผู้ดูแลได้แจ้งเตือนเก้อจนเลิกสนใจ แล้วรอบที่แก้จริงก็ถูกมองข้ามไปด้วย
     *
     * แอดมิน/เจ้าหน้าที่แก้เองไม่ต้องถอน — เขาคือคนตรวจอยู่แล้ว
     */
    $dataChanged = $changes !== [];
    $revokeApproval = $schoolId !== null && $team['status'] === 'Approved' && $dataChanged;

    Db::transaction(static function () use (
        $teamId, $team, $name, $touchPlayers, $newSlip,
        $newPaymentStatus, $newPaymentNote, $newPaymentReviewedAt, $newPaymentReviewedBy,
        $revokeApproval, $existing, $matched, $updates, $insert, $recheck
    ): void {
        Db::exec(
            'UPDATE teams SET
                name = :name, short_name = :short,
                color_primary = :c1, color_secondary = :c2, logo_url = :logo,
                director_name = :dir, manager_name = :mgr, manager_phone = :mgrp,
                coach_name = :coach, coach_phone = :coachp,
                doc_url = :doc, slip_url = :slip,
                payment_status = :payment_status, payment_note = :payment_note,
                payment_reviewed_at = :payment_reviewed_at,
                payment_reviewed_by = :payment_reviewed_by,
                status = CASE
                           WHEN status = :st_invited THEN :st_draft
                           WHEN :revoke = 1 THEN :st_submitted
                           ELSE status
                         END,
                approved_at = CASE WHEN :revoke2 = 1 THEN NULL ELSE approved_at END,
                approved_by = CASE WHEN :revoke3 = 1 THEN NULL ELSE approved_by END,
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
                ':slip'   => $newSlip,
                ':payment_status' => $newPaymentStatus,
                ':payment_note' => $newPaymentNote,
                ':payment_reviewed_at' => $newPaymentReviewedAt,
                ':payment_reviewed_by' => $newPaymentReviewedBy,
                ':st_invited' => 'Invited',
                ':st_draft'   => 'Draft',
                ':st_submitted' => 'Submitted',
                ':revoke'  => $revokeApproval ? 1 : 0,
                ':revoke2' => $revokeApproval ? 1 : 0,
                ':revoke3' => $revokeApproval ? 1 : 0,
                ':tid'    => $teamId,
            ]
        );

        if (!$touchPlayers) {
            return;   // แก้เฉพาะข้อมูลทีม ไม่แตะรายชื่อ
        }
        // ── เขียนเฉพาะสิ่งที่เปลี่ยน ────────────────────────────────────
        //
        // การจับคู่และ diff คำนวณไว้แล้วก่อนเข้าทรานแซกชัน ตรงนี้แค่ลงมือเขียน
        //
        // ทำไมต้องคงแถวเดิมไว้แทนการลบทั้งชุดแล้วสร้างใหม่:
        //   - kicks.player_id เป็น ON DELETE SET NULL -> สถิติรายคนขาดจากตัวคน
        //   - player_checkins เป็น ON DELETE CASCADE -> ผลรายงานตัวหายทั้งทีม

        // 1. คนที่หายไปจากรายชื่อ ลบทิ้ง (เบอร์เสื้อของเขาจะได้ว่างให้คนอื่นใช้)
        foreach ($existing as $e) {
            if (!isset($matched[$e['player_id']])) {
                Db::exec('DELETE FROM players WHERE player_id = :dpid',
                    [':dpid' => $e['player_id']]);
            }
        }

        // 2. ปลดเบอร์เสื้อของคนที่ "เบอร์เปลี่ยน" ให้ว่างก่อน
        //    กรณีสองคนสลับเบอร์กัน (7<->9) ถ้าเขียนทับเลยจะชน uq_player_shirt
        //    กลางคัน ทั้งที่ผลลัพธ์สุดท้ายไม่ซ้ำ
        //    คนที่เบอร์ไม่เปลี่ยนไม่ต้องปลด — และห้ามแตะด้วย ไม่งั้น updated_at
        //    จะเดินทั้งที่ข้อมูลเท่าเดิม
        foreach ($updates as $pid => $row) {
            if (!empty($row['_numChanged'])) {
                Db::exec('UPDATE players SET shirt_number = NULL WHERE player_id = :npid',
                    [':npid' => $pid]);
            }
        }

        // 3. คนใหม่ — เบอร์ที่ต้องใช้ว่างแล้ว ใส่ได้เลย
        foreach ($insert as $i => $row) {
            Db::exec(
                'INSERT INTO players
                    (player_id, team_id, name, shirt_number, position,
                     photo_url, birth_date, display_order)
                 VALUES (:pid, :tid3, :name2, :num, :pos, :photo, :bd, :ord)',
                [
                    ':pid'   => 'P_' . (int) (microtime(true) * 1000) . '_' . $i
                                . '_' . random_int(10, 99),
                    ':tid3'  => $teamId,
                    ':name2' => $row['name'],
                    ':num'   => $row['num'],
                    ':pos'   => $row['pos'],
                    ':photo' => $row['photo'],
                    ':bd'    => $row['bd'],
                    ':ord'   => $row['ord'],
                ]
            );
        }

        // 4. คนเดิมที่มีอะไรเปลี่ยน — แถวที่เหมือนเดิมทุกช่องไม่ถูกแตะเลย
        foreach ($updates as $pid => $row) {
            Db::exec(
                'UPDATE players SET name = :name3, shirt_number = :num2, position = :pos2,
                                    photo_url = :photo2, birth_date = :bd2, display_order = :ord2
                  WHERE player_id = :upid',
                [
                    ':name3'  => $row['name'],
                    ':num2'   => $row['num'],
                    ':pos2'   => $row['pos'],
                    ':photo2' => $row['photo'],
                    ':bd2'    => $row['bd'],
                    ':ord2'   => $row['ord'],
                    ':upid'   => $pid,
                ]
            );
        }

        // 5. คนที่เปลี่ยนชื่อ ล้างผลรายงานตัวทิ้ง — กรรมการตรวจหน้าคนเดิมไว้
        //    ส่วนเปลี่ยนรูป/เบอร์เสื้อไม่ลบ แต่หน้ารายงานตัวจะขึ้นธงเตือนแทน
        //    (เทียบ players.updated_at กับ player_checkins.checked_at)
        //    ตารางนี้อาจยังไม่มีถ้ายังไม่ได้รัน db/10 จึงกลืน error ไว้
        foreach ($recheck as $pid) {
            try {
                Db::exec('DELETE FROM player_checkins WHERE player_id = :cpid',
                    [':cpid' => $pid]);
            } catch (Throwable) {
                // ยังไม่มีตาราง player_checkins — ไม่ใช่เรื่องที่ต้องล้มการบันทึกทีม
            }
        }
    });

    if ($revokeApproval) {
        Audit::log('team', $teamId, 'approval_revoked_by_edit',
            ['status' => 'Approved'], ['status' => 'Submitted', 'changes' => $changes]);

        /**
         * บอกผู้ดูแลว่าอะไรเปลี่ยน ไม่ใช่แค่ว่า "มีการแก้ไข"
         *
         * ถ้าบอกแค่ว่าแก้แล้ว ผู้ดูแลต้องไล่เทียบเอง 12 คน ซึ่งถ้าเปลี่ยนแค่
         * เบอร์เสื้อคนเดียวหรือรูปคนเดียวแทบเป็นไปไม่ได้ที่จะจับได้ด้วยตา
         * ผลคือจะกดอนุมัติผ่านโดยไม่ได้ตรวจ แล้วขั้นตอนถอนอนุมัติก็ไร้ความหมาย
         *
         * ตัดเหลือ 4 รายการในข้อความแจ้งเตือน — ยาวกว่านี้ push จะถูกตัดกลางคัน
         * รายการเต็มอยู่ใน audit_log และ metadata ของการแจ้งเตือน
         */
        $head = array_slice($changes, 0, 4);
        $more = count($changes) - count($head);
        $summary = implode(' · ', $head) . ($more > 0 ? " · และอีก $more รายการ" : '');

        PushNotifier::notifyByRole(
            ['admin', 'staff'], 'team_reedited',
            'ทีมที่อนุมัติแล้วถูกแก้ไข',
            $name . ': ' . $summary,
            '/admin', ['teamId' => $teamId, 'changes' => $changes]
        );
    }

    // แอดมินแก้สถานะ/สาย/โรงเรียนได้ในการบันทึกครั้งเดียวกัน (โรงเรียนแก้ไม่ได้)
    if ($schoolId === null) {
        $newStatus = Input::str('status');
        $newGroup  = Input::get('groupName', null);
        $newSchool = Input::str('schoolId');
        $valid = ['Invited', 'Draft', 'Submitted', 'Approved', 'Rejected', 'Withdrawn'];
        if ($newSchool !== '' && Db::value('SELECT 1 FROM schools WHERE school_id = :sid_chk',
                [':sid_chk' => $newSchool]) === null) {
            Response::fail('ไม่พบโรงเรียนนี้ในระบบ', 404);
        }
        if ($newStatus !== '' || $newGroup !== null || $newSchool !== '') {
            Db::exec(
                'UPDATE teams SET
                    status     = CASE WHEN :has_st = 1 THEN :st ELSE status END,
                    group_name = CASE WHEN :has_gr = 1 THEN :gr ELSE group_name END,
                    school_id  = COALESCE(:sch, school_id)
                  WHERE team_id = :tid_meta',
                [
                    ':has_st'   => ($newStatus !== '' && in_array($newStatus, $valid, true)) ? 1 : 0,
                    ':st'       => in_array($newStatus, $valid, true) ? $newStatus : 'Draft',
                    ':has_gr'   => $newGroup === null ? 0 : 1,
                    ':gr'       => ($newGroup === null || $newGroup === '') ? null : (string) $newGroup,
                    ':sch'      => $newSchool !== '' ? $newSchool : null,
                    ':tid_meta' => $teamId,
                ]
            );
        }
    }

    // เก็บรายการที่เปลี่ยนไว้ด้วย — เดิมเก็บแค่ชื่อทีมกับจำนวนคน
    // เวลามีข้อโต้แย้งว่า "ใครเปลี่ยนเบอร์เสื้อคนนี้" จึงย้อนดูไม่ได้เลย
    Audit::log('team', $teamId, 'save',
        ['name' => $team['name']],
        ['name' => $name, 'players' => count($players), 'changes' => $changes]);
    Cache::flush();

    $fresh = Db::one('SELECT * FROM teams WHERE team_id = :tid4', [':tid4' => $teamId]);
    $freshPlayers = Db::all(
        'SELECT * FROM players WHERE team_id = :tid5 ORDER BY display_order',
        [':tid5' => $teamId]);
    Response::ok(['team' => team_payload($fresh, $freshPlayers), 'changes' => $changes]);
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

    // แจ้งผู้จัดการแข่งขันว่ามีใบสมัครรอตรวจ — ไม่ต้องคอยกดรีเฟรชดูเอง
    PushNotifier::notifyByRole(
        ['admin', 'staff'], 'team_submitted',
        'มีทีมส่งใบสมัครรอตรวจ',
        $team['name'] . ' ส่งรายชื่อ ' . $playerCount . ' คน',
        '/admin', ['teamId' => $teamId]
    );

    Response::ok(['status' => 'Submitted', 'playerCount' => $playerCount]);
}

// ── ฝั่งแอดมิน ────────────────────────────────────────────────────────────

function review_team(): void
{
    Auth::requireLogin();

    $teamId = Input::require_str('teamId');
    $decision = Input::enum('decision', ['approve', 'reject'], null);
    if ($decision === null) {
        Response::fail('ต้องระบุ decision = approve หรือ reject', 422);
    }

    $team = Db::one('SELECT * FROM teams WHERE team_id = :tid', [':tid' => $teamId]);
    if ($team === null) {
        Response::fail('ไม่พบทีมนี้', 404);
    }
    // อนุมัติทีมได้เฉพาะผู้ดูแลของรายการนั้น
    Perm::requireTournamentManager($team['tournament_id']);
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

        // แจ้งครูของโรงเรียนนั้นทันที — เดิมต้องรอโรงเรียนเข้ามาดูเอง
        // ซึ่งหลายทีมไม่รู้ตัวจนเลยกำหนดส่ง
        PushNotifier::notifySchool(
            (string) $team['school_id'], 'team_rejected',
            'ทีมถูกตีกลับให้แก้ไข',
            $team['name'] . ' — ' . mb_substr($reason, 0, 120),
            '/school', ['teamId' => $teamId]
        );

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

    PushNotifier::notifySchool(
        (string) $team['school_id'], 'team_approved',
        'ทีมของคุณได้รับอนุมัติแล้ว',
        $team['name'] . ' ผ่านการตรวจสอบเรียบร้อย พร้อมลงแข่งขัน',
        '/school', ['teamId' => $teamId]
    );

    Response::ok(['status' => 'Approved', 'approvedCount' => $approved + 1]);
}

/**
 * ตรวจหลักฐานค่าสมัครโดยไม่เปลี่ยนสถานะการอนุมัติใบสมัครของทีม
 * ผู้ดูแลประจำรายการตรวจได้เฉพาะรายการที่ได้รับมอบหมาย
 */
function review_registration_payment(): void
{
    Auth::requireLogin();

    $teamId = Input::require_str('teamId');
    $decision = Input::enum('decision', ['verify', 'verify_manual', 'reject', 'reset'], null);
    if ($decision === null) {
        Response::fail('ต้องระบุ decision = verify, verify_manual, reject หรือ reset', 422);
    }

    $team = Db::one(
        'SELECT team_id, tournament_id, name, slip_url, payment_status, payment_note
           FROM teams WHERE team_id = :tid',
        [':tid' => $teamId]
    );
    if ($team === null) {
        Response::fail('ไม่พบทีมนี้', 404);
    }
    Perm::requireTournamentManager($team['tournament_id']);

    $old = ['status' => $team['payment_status'], 'note' => $team['payment_note']];
    $note = trim(Input::str('note'));

    if ($decision === 'verify') {
        if (trim((string) $team['slip_url']) === '') {
            Response::fail('ทีมนี้ยังไม่ได้ส่งสลิปค่าสมัคร', 422);
        }
        $status = 'Verified';
    } elseif ($decision === 'verify_manual') {
        if ($note === '') {
            Response::fail('กรุณาระบุช่องทางหรือรายละเอียดการชำระนอกระบบ เพื่อให้ตรวจสอบย้อนหลังได้', 422);
        }
        $status = 'Verified';
        $note = 'ชำระนอกระบบ — ' . mb_substr($note, 0, 450);
    } elseif ($decision === 'reject') {
        if (trim((string) $team['slip_url']) === '') {
            Response::fail('ทีมนี้ยังไม่ได้ส่งสลิปค่าสมัคร', 422);
        }
        if ($note === '') {
            Response::fail('กรุณาระบุเหตุผลที่สลิปไม่ผ่าน เพื่อให้ติดตามแก้ไขได้', 422);
        }
        $status = 'Rejected';
    } else {
        $status = trim((string) $team['slip_url']) === '' ? 'Unpaid' : 'Pending';
        $note = '';
    }

    Db::exec(
        'UPDATE teams SET payment_status = :status, payment_note = :note,
                          payment_reviewed_at = :reviewed_at,
                          payment_reviewed_by = :reviewed_by,
                          row_version = row_version + 1
          WHERE team_id = :tid2',
        [
            ':status' => $status,
            ':note' => $note,
            ':reviewed_at' => $decision === 'reset' ? null : date('Y-m-d H:i:s'),
            ':reviewed_by' => $decision === 'reset' ? null : Auth::userId(),
            ':tid2' => $teamId,
        ]
    );

    Audit::log('team', $teamId, 'review_registration_payment', $old, [
        'status' => $status,
        'note' => $note,
        'source' => $decision === 'verify_manual' ? 'manual' : ($decision === 'verify' ? 'slip' : null),
    ]);
    Cache::flush();

    // แจ้งเฉพาะตอนผลตรวจสลิปเปลี่ยนจริง — reset เป็นการย้อนสถานะของเจ้าหน้าที่เอง
    // โรงเรียนไม่ต้องรู้ ไม่งั้นจะได้แจ้งเตือนงง ๆ ว่า "ยังไม่ชำระ"
    if ($status === 'Verified' || $status === 'Rejected') {
        $sid = (string) Db::value('SELECT school_id FROM teams WHERE team_id = :tid3',
            [':tid3' => $teamId]);
        PushNotifier::notifySchool(
            $sid, 'payment_verified',
            $status === 'Verified' ? 'ยืนยันการชำระค่าสมัครแล้ว' : 'หลักฐานการชำระเงินไม่ผ่าน',
            $status === 'Verified'
                ? ($team['name'] . ($decision === 'verify_manual'
                    ? ' — ผู้ดูแลยืนยันการชำระเงินนอกระบบแล้ว'
                    : ' — ผู้ดูแลตรวจสลิปเรียบร้อยแล้ว'))
                : $team['name'] . ' — ' . mb_substr($note, 0, 120),
            '/school', ['teamId' => $teamId, 'paymentStatus' => $status]
        );
    }

    Response::ok([
        'teamId' => $teamId,
        'paymentStatus' => $status,
        'paymentNote' => $note,
        'paymentSource' => $decision === 'verify_manual' ? 'manual' : ($decision === 'verify' ? 'slip' : null),
    ]);
}

// ── CRUD ฝั่งแอดมิน ───────────────────────────────────────────────────────

/**
 * สร้างทีมใหม่โดยแอดมิน — ต้องผูกกับ "โรงเรียนที่มีในระบบ" เสมอ
 *
 * ไม่เปิดให้พิมพ์ชื่อโรงเรียนอิสระ เพราะข้อมูลเดิมเคยเก็บชื่อโรงเรียนเป็น
 * ข้อความในทุกทีม ทำให้พิมพ์ต่างกันนิดเดียวก็กลายเป็นคนละโรงเรียน แล้วรวม
 * ประวัติข้ามฤดูไม่ได้
 */
function create_team(): void
{
    Auth::requireLogin();

    $tournamentId = Input::require_str('tournamentId');
    Perm::requireTournamentManager($tournamentId);
    $t = load_tournament($tournamentId);

    $schoolId = Input::require_str('schoolId');
    $school = Db::one('SELECT school_id, school_name FROM schools WHERE school_id = :sid',
        [':sid' => $schoolId]);
    if ($school === null) {
        Response::fail('ไม่พบโรงเรียนนี้ในระบบ', 404);
    }

    $name = trim((string) Input::get('name', $school['school_name']));
    if ($name === '') {
        $name = $school['school_name'];
    }

    // เพดานทีมต่อโรงเรียน — ตรวจก่อนเขียน เพื่อให้ข้อความผิดพลาดอ่านรู้เรื่อง
    $perSchool = (int) Db::value(
        "SELECT COUNT(*) FROM teams
          WHERE tournament_id = :tid AND school_id = :sid2 AND status <> 'Withdrawn'",
        [':tid' => $tournamentId, ':sid2' => $schoolId]
    );
    $maxPer = (int) $t['max_teams_per_school'];
    if ($perSchool >= $maxPer) {
        Response::fail(
            "โรงเรียนนี้มี $perSchool ทีมแล้ว เกินเพดาน $maxPer ทีมต่อโรงเรียน "
            . '(ปรับเพดานได้ที่ตั้งค่ารายการแข่งขัน)',
            409, ['current' => $perSchool, 'max' => $maxPer]
        );
    }

    $dup = Db::value(
        'SELECT team_id FROM teams WHERE tournament_id = :tid2 AND name = :name',
        [':tid2' => $tournamentId, ':name' => $name]
    );
    if ($dup !== null) {
        Response::fail("มีทีมชื่อ \"$name\" ในรายการนี้แล้ว", 409);
    }

    $teamId = 'T_' . (int) (microtime(true) * 1000) . '_' . random_int(100, 999);
    Db::exec(
        'INSERT INTO teams (team_id, tournament_id, school_id, name, short_name,
                            status, group_name, manager_name, manager_phone,
                            coach_name, coach_phone, director_name)
         VALUES (:id, :tid3, :sid3, :name2, :short, :status, :grp,
                 :mgr, :mgrp, :coach, :coachp, :dir)',
        [
            ':id'     => $teamId,
            ':tid3'   => $tournamentId,
            ':sid3'   => $schoolId,
            ':name2'  => $name,
            ':short'  => (string) Input::get('shortName', ''),
            ':status' => Input::str('status') ?: 'Draft',
            ':grp'    => Input::str('groupName') ?: null,
            ':mgr'    => (string) Input::get('managerName', ''),
            ':mgrp'   => (string) Input::get('managerPhone', ''),
            ':coach'  => (string) Input::get('coachName', ''),
            ':coachp' => (string) Input::get('coachPhone', ''),
            ':dir'    => (string) Input::get('directorName', ''),
        ]
    );

    Audit::log('team', $teamId, 'create', null,
        ['name' => $name, 'school' => $school['school_name']]);
    Cache::flush();

    Response::ok(['teamId' => $teamId, 'name' => $name,
                  'schoolName' => $school['school_name']]);
}

/** ลบทีม — ผู้เล่นหายตาม (FK CASCADE) จึงต้องยืนยันชื่อ */
function delete_team(): void
{
    Auth::requireLogin();

    $teamId = Input::require_str('teamId');
    $team = Db::one('SELECT * FROM teams WHERE team_id = :tid', [':tid' => $teamId]);
    if ($team === null) {
        Response::fail('ไม่พบทีมนี้', 404);
    }
    Perm::requireTournamentManager($team['tournament_id']);

    $players = (int) Db::value('SELECT COUNT(*) FROM players WHERE team_id = :tid2',
        [':tid2' => $teamId]);
    $matches = (int) Db::value(
        'SELECT COUNT(*) FROM matches WHERE team_a_id = :tid3 OR team_b_id = :tid4',
        [':tid3' => $teamId, ':tid4' => $teamId]);

    if ($matches > 0 && !Input::bool('force')) {
        // ลบทีมที่ลงแข่งไปแล้ว = ผลการแข่งกลายเป็นนัดที่ไม่มีทีม
        Response::fail(
            "ทีมนี้มี $matches นัดในตารางแข่งแล้ว — ลบแล้วผลการแข่งจะอ้างทีมไม่ได้ "
            . 'ส่ง force=true ถ้ายืนยัน',
            409, ['matches' => $matches, 'players' => $players]
        );
    }

    Audit::log('team', $teamId, 'delete',
        ['name' => $team['name'], 'players' => $players, 'matches' => $matches], null);
    Db::exec('DELETE FROM teams WHERE team_id = :tid5', [':tid5' => $teamId]);
    Cache::flush();

    Response::ok(['deleted' => ['players' => $players, 'matchesAffected' => $matches]]);
}

/** ย้ายทีมเข้าสาย / เปลี่ยนโรงเรียนที่ผูก — แอดมินเท่านั้น */
function set_team_meta(): void
{
    Auth::requireLogin();

    $teamId = Input::require_str('teamId');
    $team = Db::one('SELECT * FROM teams WHERE team_id = :tid', [':tid' => $teamId]);
    if ($team === null) {
        Response::fail('ไม่พบทีมนี้', 404);
    }
    Perm::requireTournamentManager($team['tournament_id']);

    $schoolId = Input::str('schoolId');
    if ($schoolId !== '' && Db::value('SELECT 1 FROM schools WHERE school_id = :sid',
            [':sid' => $schoolId]) === null) {
        Response::fail('ไม่พบโรงเรียนนี้ในระบบ', 404);
    }

    $group = Input::get('groupName', null);

    Db::exec(
        'UPDATE teams
            SET school_id  = COALESCE(:sid2, school_id),
                group_name = CASE WHEN :has_grp = 1 THEN :grp ELSE group_name END,
                row_version = row_version + 1
          WHERE team_id = :tid2',
        [
            ':sid2'    => $schoolId !== '' ? $schoolId : null,
            ':has_grp' => $group === null ? 0 : 1,
            ':grp'     => ($group === null || $group === '') ? null : (string) $group,
            ':tid2'    => $teamId,
        ]
    );

    Audit::log('team', $teamId, 'set_meta',
        ['school' => $team['school_id'], 'group' => $team['group_name']],
        ['school' => $schoolId ?: $team['school_id'], 'group' => $group]);
    Cache::flush();

    Response::ok();
}

/**
 * สื่อสำหรับผังตัวนักกีฬา — คลิปแนะนำทีม/รายคน และคำโปรยประจำทีม
 *
 * ทำไมเป็น endpoint แยกแทนที่จะรวมใน saveTeam:
 *   1. คนละคนทำ — saveTeam คือครูที่โรงเรียนกรอกรายชื่อ ส่วนคลิปแนะนำเป็นงาน
 *      เตรียมออกอากาศของเจ้าภาพ ซึ่งทำหลังปิดรับรายชื่อไปแล้ว (assert_window_open
 *      จะปิดกั้น) และไม่ควรทำให้ทีมที่อนุมัติแล้วถูกถอนอนุมัติเพราะแก้ลิงก์คลิป
 *   2. saveTeam มี diff รายชื่อผู้เล่นที่ละเอียดมาก (จับคู่ ปลดเบอร์ ล้างผลรายงานตัว)
 *      การแทรกช่องใหม่เข้าไปเสี่ยงพังทางเดินที่ใช้งานจริงอยู่แล้วโดยไม่ได้อะไรเพิ่ม
 *
 * เขียนเฉพาะช่องสื่อ ไม่แตะชื่อ เบอร์เสื้อ รูป หรือสถานะทีมเลย
 */
function set_lineup_media(): void
{
    Auth::requireLogin();

    $teamId = Input::require_str('teamId');
    $team = Db::one('SELECT team_id, tournament_id, name FROM teams WHERE team_id = :tid',
        [':tid' => $teamId]);
    if ($team === null) {
        Response::fail('ไม่พบทีมนี้', 404);
    }
    Perm::requireTournamentManager((string) $team['tournament_id']);

    // ส่งช่องไหนมาก็แก้ช่องนั้น ไม่ส่ง = ไม่แตะ
    // (ต่างจากการเช็คค่าว่าง เพราะ "ล้างคลิปทิ้ง" ก็คือการส่งค่าว่างมาโดยตั้งใจ)
    $body = Input::body();
    $hasTeamVideo = array_key_exists('introVideoUrl', $body);
    $hasHype      = array_key_exists('hypeText', $body);

    if ($hasTeamVideo || $hasHype) {
        Db::exec(
            'UPDATE teams SET
                intro_video_url = CASE WHEN :has_v = 1 THEN :video ELSE intro_video_url END,
                hype_text       = CASE WHEN :has_h = 1 THEN :hype  ELSE hype_text END,
                row_version = row_version + 1
              WHERE team_id = :tid2',
            [
                ':has_v' => $hasTeamVideo ? 1 : 0,
                ':video' => mb_substr((string) Input::str('introVideoUrl'), 0, 500),
                ':has_h' => $hasHype ? 1 : 0,
                ':hype'  => mb_substr((string) Input::str('hypeText'), 0, 200),
                ':tid2'  => $teamId,
            ]
        );
    }

    /**
     * คลิปรายคน
     *
     * ผูก player_id กับ team_id ในเงื่อนไข WHERE เสมอ — ไม่งั้นคนที่ดูแลรายการ
     * หนึ่งจะยิง player_id ของอีกรายการเข้ามาแก้ได้ ทั้งที่ตรวจสิทธิ์ที่ระดับทีมไปแล้ว
     */
    $saved = 0;
    foreach (Input::arr('players') as $p) {
        $pid = (string) ($p['id'] ?? '');
        if ($pid === '' || !array_key_exists('introVideoUrl', $p)) {
            continue;
        }
        $saved += Db::exec(
            'UPDATE players SET intro_video_url = :vid
              WHERE player_id = :pid AND team_id = :tid3',
            [
                ':vid' => mb_substr((string) $p['introVideoUrl'], 0, 500),
                ':pid' => $pid,
                ':tid3' => $teamId,
            ]
        );
    }

    Audit::log('team', $teamId, 'set_lineup_media', null,
        ['team' => $hasTeamVideo || $hasHype, 'players' => $saved]);
    Cache::flush();

    Response::ok(['playersUpdated' => $saved]);
}

/**
 * กรรมการแก้เฉพาะหมายเลขเสื้อจากหน้า lineup
 *
 * ใช้สิทธิ์เดียวกับการบันทึกผล: ต้องล็อกอินและได้รับมอบหมายรายการนั้น
 * ไม่เรียก saveTeam เพราะการเปลี่ยนเลขหนึ่งคนต้องไม่เสี่ยงเขียนทับรายชื่อทั้งทีม
 */
function update_player_number(): void
{
    Auth::requireLogin();

    $teamId = Input::require_str('teamId');
    $playerId = Input::require_str('playerId');
    $number = trim(Input::str('number'));

    if ($number !== '' && !preg_match('/^[0-9]{1,3}$/', $number)) {
        Response::fail('เบอร์เสื้อต้องเป็นตัวเลขไม่เกิน 3 หลัก', 422);
    }

    $player = Db::one(
        'SELECT p.player_id, p.name, p.shirt_number, p.team_id, t.tournament_id
           FROM players p
           JOIN teams t ON t.team_id = p.team_id
          WHERE p.player_id = :pid AND p.team_id = :tid',
        [':pid' => $playerId, ':tid' => $teamId]
    );
    if ($player === null) {
        Response::fail('ไม่พบนักกีฬาในทีมนี้', 404);
    }

    Perm::requireTournamentManager((string) $player['tournament_id']);

    if ($number !== '') {
        $duplicate = Db::one(
            'SELECT player_id, name FROM players
              WHERE team_id = :tid2 AND shirt_number = :num AND player_id <> :pid2
              LIMIT 1',
            [':tid2' => $teamId, ':num' => $number, ':pid2' => $playerId]
        );
        if ($duplicate !== null) {
            Response::fail("เบอร์ $number ถูกใช้โดย {$duplicate['name']} ในทีมนี้แล้ว", 409);
        }
    }

    Db::exec(
        'UPDATE players SET shirt_number = :num2 WHERE player_id = :pid3 AND team_id = :tid3',
        [':num2' => $number === '' ? null : $number, ':pid3' => $playerId, ':tid3' => $teamId]
    );

    Audit::log('player', $playerId, 'update_shirt_number',
        ['number' => (string) ($player['shirt_number'] ?? '')],
        ['number' => $number, 'teamId' => $teamId]);
    Cache::flush();

    Response::ok(['playerId' => $playerId, 'teamId' => $teamId, 'number' => $number]);
}

/**
 * แก้ข้อมูลที่ใช้จัดผังตัวและรางวัลรายบุคคลจากหน้า Lineup
 *
 * ตำแหน่งบันทึกเป็นรหัสกลางเท่านั้น เพื่อให้ Live Wall, Golden Glove และ
 * ผังนักกีฬาไม่ต้องเดาว่า Goalkeeper/ผู้รักษาประตู/GK หมายถึงค่าเดียวกันหรือไม่
 */
function update_player_lineup(): void
{
    Auth::requireLogin();

    $teamId = Input::require_str('teamId');
    $playerId = Input::require_str('playerId');
    $number = trim(Input::str('number'));
    $position = Input::enum('position', ['GK', 'DF', 'MF', 'FW', 'Player'], null);

    if ($number !== '' && !preg_match('/^[0-9]{1,3}$/', $number)) {
        Response::fail('เบอร์เสื้อต้องเป็นตัวเลขไม่เกิน 3 หลัก', 422);
    }
    if ($position === null) {
        Response::fail('กรุณาเลือกตำแหน่งนักกีฬา', 422);
    }

    $player = Db::one(
        'SELECT p.player_id, p.name, p.shirt_number, p.position, p.team_id, t.tournament_id
           FROM players p
           JOIN teams t ON t.team_id = p.team_id
          WHERE p.player_id = :pid AND p.team_id = :tid',
        [':pid' => $playerId, ':tid' => $teamId]
    );
    if ($player === null) {
        Response::fail('ไม่พบนักกีฬาในทีมนี้', 404);
    }

    Perm::requireTournamentManager((string) $player['tournament_id']);

    if ($number !== '') {
        $duplicate = Db::one(
            'SELECT player_id, name FROM players
              WHERE team_id = :tid2 AND shirt_number = :num AND player_id <> :pid2
              LIMIT 1',
            [':tid2' => $teamId, ':num' => $number, ':pid2' => $playerId]
        );
        if ($duplicate !== null) {
            Response::fail("เบอร์ $number ถูกใช้โดย {$duplicate['name']} ในทีมนี้แล้ว", 409);
        }
    }

    Db::exec(
        'UPDATE players SET shirt_number = :num2, position = :position
          WHERE player_id = :pid3 AND team_id = :tid3',
        [
            ':num2' => $number === '' ? null : $number,
            ':position' => $position,
            ':pid3' => $playerId,
            ':tid3' => $teamId,
        ]
    );

    Audit::log('player', $playerId, 'update_lineup_profile', [
        'number' => (string) ($player['shirt_number'] ?? ''),
        'position' => (string) ($player['position'] ?? 'Player'),
    ], [
        'number' => $number,
        'position' => $position,
        'teamId' => $teamId,
    ]);
    Cache::flush();

    Response::ok([
        'playerId' => $playerId,
        'teamId' => $teamId,
        'number' => $number,
        'position' => $position,
    ]);
}
