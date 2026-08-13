<?php
declare(strict_types=1);

/**
 * จัดการทัวร์นาเมนต์ — สร้าง / แก้ไข / ลบ / กำหนดช่วงรับสมัคร
 *
 * ทุก action ที่นี่ต้องเป็นแอดมิน และตรวจที่ server ไม่ใช่ซ่อนปุ่มใน UI
 * (ระบบเดิม doPost ไม่ตรวจสิทธิ์เลย ใครยิง URL ตรงก็ทำได้ทุกอย่าง)
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        'createTournament'      => create_tournament(),
        'updateTournament'      => update_tournament(),
        'deleteTournament'      => delete_tournament(),
        'setRegistrationWindow' => set_registration_window(),
        'setTournamentHost'     => set_tournament_host(),
        'assignTournamentManager' => assign_tournament_manager(),
        'listTournamentManagers'  => list_tournament_managers(),
        'flushCache'            => flush_cache(),
        default                 => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

// ─────────────────────────────────────────────────────────────────────────

function create_tournament(): void
{
    // สร้างรายการใหม่ = แอดมินส่วนกลางเท่านั้น เจ้าภาพขอให้สร้างแล้วค่อยมอบสิทธิ์
    Perm::requireGlobalAdmin();

    $name = Input::require_str('name');
    $type = Input::enum('type', ['penalty', '7v7', '11v11'], 'penalty');
    $type = ['penalty' => 'Penalty', '7v7' => '7v7', '11v11' => '11v11'][$type];

    $id = 'TRN_' . (int) (microtime(true) * 1000);
    Db::exec(
        'INSERT INTO tournaments (tournament_id, name, type, status)
         VALUES (:id, :name, :type, :status)',
        [':id' => $id, ':name' => $name, ':type' => $type, ':status' => 'Upcoming']
    );

    Audit::log('tournament', $id, 'create', null, ['name' => $name, 'type' => $type]);
    Cache::flush();
    Response::ok(['tournamentId' => $id]);
}

function update_tournament(): void
{
    Auth::requireLogin();

    $t = Input::arr('tournament');
    $id = trim((string) ($t['id'] ?? ''));
    if ($id === '') {
        Response::fail('ต้องระบุ tournament.id', 422);
    }
    // โรงเรียนเจ้าภาพตั้งค่ารายการของตัวเองได้ แต่แตะรายการอื่นไม่ได้
    Perm::requireTournamentManager($id);
    $before = Db::one('SELECT * FROM tournaments WHERE tournament_id = :id', [':id' => $id]);
    if ($before === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }

    // config ส่งมาเป็น JSON string แบบเดิม — แตกกลับเป็นคอลัมน์จริง
    $cfg = [];
    if (isset($t['config']) && is_string($t['config'])) {
        $decoded = json_decode($t['config'], true);
        $cfg = is_array($decoded) ? $decoded : [];
    } elseif (isset($t['config']) && is_array($t['config'])) {
        $cfg = $t['config'];
    }
    $obj = $cfg['objective'] ?? [];

    Db::transaction(static function () use ($id, $t, $cfg, $obj): void {
        Db::exec(
            'UPDATE tournaments SET
                name = :name, type = :type, status = :status,
                competition_logo = :complogo, announcement = :announce,
                registration_deadline = :deadline,
                registration_enabled = :regon,
                team_editing_enabled = :editon,
                team_edit_deadline = :editdeadline,
                max_teams = :maxteams, max_teams_per_school = :maxper,
                players_per_team = :ppt, max_subs = :subs,
                half_time_duration = :half, extra_time = :extra,
                registration_fee = :fee,
                bank_name = :bank, bank_account = :acct, account_name = :acctname,
                location_name = :locname, location_link = :loclink,
                location_lat = :lat, location_lng = :lng,
                objective_enabled = :objon, objective_title = :objtitle,
                objective_description = :objdesc, objective_goal = :objgoal,
                objective_doc_url = :objdoc
              WHERE tournament_id = :id',
            [
                ':name'     => (string) ($t['name'] ?? ''),
                ':type'     => in_array($t['type'] ?? '', ['Penalty', '7v7', '11v11'], true)
                    ? $t['type'] : 'Penalty',
                ':status'   => in_array($t['status'] ?? '', ['Upcoming', 'Active', 'Archived'], true)
                    ? $t['status'] : 'Upcoming',
                ':complogo' => (string) ($cfg['competitionLogo'] ?? ''),
                ':announce' => (string) ($cfg['announcement'] ?? ''),
                ':deadline' => to_dt($cfg['registrationDeadline'] ?? null),
                ':regon'    => !array_key_exists('registrationEnabled', $cfg) || !empty($cfg['registrationEnabled']) ? 1 : 0,
                ':editon'   => !array_key_exists('teamEditingEnabled', $cfg) || !empty($cfg['teamEditingEnabled']) ? 1 : 0,
                ':editdeadline' => to_dt($cfg['teamEditDeadline'] ?? null),
                ':maxteams' => nn($cfg['maxTeams'] ?? null),
                ':maxper'   => max(1, (int) ($cfg['maxTeamsPerSchool'] ?? 1)),
                ':ppt'      => max(1, (int) ($cfg['playersPerTeam'] ?? 7)),
                ':subs'     => max(0, (int) ($cfg['maxSubs'] ?? 0)),
                ':half'     => nn($cfg['halfTimeDuration'] ?? null),
                ':extra'    => !empty($cfg['extraTime']) ? 1 : 0,
                ':fee'      => (float) ($cfg['registrationFee'] ?? 0),
                ':bank'     => (string) ($cfg['bankName'] ?? ''),
                ':acct'     => (string) ($cfg['bankAccount'] ?? ''),
                ':acctname' => (string) ($cfg['accountName'] ?? ''),
                ':locname'  => (string) ($cfg['locationName'] ?? ''),
                ':loclink'  => (string) ($cfg['locationLink'] ?? ''),
                ':lat'      => nn($cfg['locationLat'] ?? null),
                ':lng'      => nn($cfg['locationLng'] ?? null),
                ':objon'    => !empty($obj['isEnabled']) ? 1 : 0,
                ':objtitle' => (string) ($obj['title'] ?? ''),
                ':objdesc'  => (string) ($obj['description'] ?? ''),
                ':objgoal'  => (float) ($obj['goal'] ?? 0),
                ':objdoc'   => (string) ($obj['docUrl'] ?? ''),
                ':id'       => $id,
            ]
        );

        // รางวัลและรูปโครงการเป็นตารางลูก — เขียนทับทั้งชุด
        if (array_key_exists('prizes', $cfg)) {
            Db::exec('DELETE FROM tournament_prizes WHERE tournament_id = :id', [':id' => $id]);
            foreach (($cfg['prizes'] ?? []) as $i => $p) {
                Db::exec(
                    'INSERT INTO tournament_prizes
                        (tournament_id, rank_label, amount, description,
                         winner_team_id, display_order)
                     VALUES (:tid, :label, :amount, :desc, :winner, :ord)',
                    [
                        ':tid'    => $id,
                        ':label'  => (string) ($p['rankLabel'] ?? ''),
                        ':amount' => (string) ($p['amount'] ?? ''),
                        ':desc'   => (string) ($p['description'] ?? ''),
                        ':winner' => ($p['winnerTeamId'] ?? '') !== '' ? $p['winnerTeamId'] : null,
                        ':ord'    => $i,
                    ]
                );
            }
        }
        if (isset($obj['images'])) {
            Db::exec('DELETE FROM tournament_images WHERE tournament_id = :id2', [':id2' => $id]);
            foreach (($obj['images'] ?? []) as $i => $im) {
                $type = (string) ($im['type'] ?? 'general');
                Db::exec(
                    'INSERT INTO tournament_images
                        (tournament_id, url, image_type, caption, display_order)
                     VALUES (:tid, :url, :type, :caption, :ord)',
                    [
                        ':tid'     => $id,
                        ':url'     => (string) ($im['url'] ?? ''),
                        ':type'    => in_array($type, ['before', 'after', 'general'], true)
                            ? $type : 'general',
                        ':caption' => (string) ($im['caption'] ?? ''),
                        ':ord'     => $i,
                    ]
                );
            }
        }
    });

    Audit::log('tournament', $id, 'update', $before, ['name' => $t['name'] ?? '']);
    Cache::flush();
    Response::ok();
}

/**
 * ลบรายการแข่งขัน
 *
 * FK ทั้งหมดเป็น ON DELETE CASCADE ⇒ ลบทัวร์นาเมนต์เดียวจะพาทีม ผู้เล่น
 * นัดแข่ง ลูกจุดโทษ ข่าว ผู้สนับสนุน หายตามไปทั้งหมด จึงบังคับ 2 ชั้น:
 *
 *   1. ต้องส่ง confirmName ที่ตรงกับชื่อรายการเป๊ะ ๆ (กันกดพลาด)
 *   2. ถ้ายังมีทีมอยู่ ต้องส่ง force=true มาอีกชั้น
 *
 * ก่อนลบจะสรุปให้ดูว่าจะพาอะไรหายไปบ้าง แล้วบันทึกลง audit_log
 */
function delete_tournament(): void
{
    // ลบรายการพาข้อมูลหายทั้งชุด — ไม่ให้เจ้าภาพทำเอง
    Perm::requireGlobalAdmin();

    $id = Input::require_str('tournamentId');
    $t = Db::one('SELECT * FROM tournaments WHERE tournament_id = :id', [':id' => $id]);
    if ($t === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }

    $counts = [
        'teams'   => (int) Db::value(
            'SELECT COUNT(*) FROM teams WHERE tournament_id = :id', [':id' => $id]),
        'players' => (int) Db::value(
            'SELECT COUNT(*) FROM players p JOIN teams t ON t.team_id = p.team_id
              WHERE t.tournament_id = :id', [':id' => $id]),
        'matches' => (int) Db::value(
            'SELECT COUNT(*) FROM matches WHERE tournament_id = :id', [':id' => $id]),
        'donations' => (int) Db::value(
            'SELECT COUNT(*) FROM donations WHERE tournament_id = :id', [':id' => $id]),
    ];

    // ชั้นที่ 1 — ต้องพิมพ์ชื่อให้ตรง
    $confirm = Input::str('confirmName');
    if ($confirm !== $t['name']) {
        Response::fail(
            'กรุณาพิมพ์ชื่อรายการแข่งขันให้ตรงเพื่อยืนยันการลบ',
            409,
            ['expectedName' => $t['name'], 'willDelete' => $counts]
        );
    }

    // ชั้นที่ 2 — มีทีมอยู่ ต้องยืนยันซ้ำ
    if ($counts['teams'] > 0 && !Input::bool('force')) {
        Response::fail(
            "รายการนี้มี {$counts['teams']} ทีมที่จะถูกลบไปด้วย — ส่ง force=true เพื่อยืนยัน",
            409,
            ['willDelete' => $counts]
        );
    }

    // ยอดบริจาคลบไม่ได้ด้วยเหตุผลทางบัญชี — ตัดความเชื่อมโยงแทน
    if ($counts['donations'] > 0) {
        Db::exec('UPDATE donations SET tournament_id = NULL WHERE tournament_id = :id',
            [':id' => $id]);
    }

    Audit::log('tournament', $id, 'delete', $t + ['cascade' => $counts], null);
    Db::exec('DELETE FROM tournaments WHERE tournament_id = :id', [':id' => $id]);

    Cache::flush();
    Response::ok([
        'deleted' => $counts,
        'donationsKept' => $counts['donations'],
        'message' => "ลบ \"{$t['name']}\" แล้ว",
    ]);
}

/**
 * กำหนดช่วงรับสมัคร
 *
 * ระบบเดิมเก็บ registrationDeadline ไว้ใน JSON แล้วเช็คเฉพาะฝั่ง client
 * ⇒ ปิดรับสมัครแล้วยังยิง API ตรงเข้ามาสมัครได้ ตอนนี้ค่าอยู่ในคอลัมน์จริง
 * และจะถูกบังคับที่ server ตอนสมัคร
 */
function set_registration_window(): void
{
    Auth::requireLogin();

    $id = Input::require_str('tournamentId');
    Perm::requireTournamentManager($id);
    $t = Db::one('SELECT tournament_id, name, registration_deadline, max_teams
                    FROM tournaments WHERE tournament_id = :id', [':id' => $id]);
    if ($t === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }

    $deadline = to_dt(Input::get('registrationDeadline'));
    $maxTeams = Input::int('maxTeams');
    $maxPer   = Input::int('maxTeamsPerSchool');

    if ($deadline !== null && strtotime($deadline) === false) {
        Response::fail('รูปแบบวันปิดรับสมัครไม่ถูกต้อง', 422);
    }

    $current = (int) Db::value('SELECT COUNT(*) FROM teams WHERE tournament_id = :id',
        [':id' => $id]);
    if ($maxTeams !== null && $maxTeams > 0 && $maxTeams < $current) {
        Response::fail(
            "ตอนนี้มี $current ทีมสมัครแล้ว ตั้งเพดานต่ำกว่านี้ไม่ได้",
            422,
            ['currentTeams' => $current]
        );
    }

    Db::exec(
        'UPDATE tournaments
            SET registration_deadline = :deadline,
                max_teams = COALESCE(:maxteams, max_teams),
                max_teams_per_school = COALESCE(:maxper, max_teams_per_school)
          WHERE tournament_id = :id',
        [
            ':deadline' => $deadline,
            ':maxteams' => $maxTeams,
            ':maxper'   => $maxPer,
            ':id'       => $id,
        ]
    );

    Audit::log('tournament', $id, 'set_registration_window',
        ['deadline' => $t['registration_deadline'], 'maxTeams' => $t['max_teams']],
        ['deadline' => $deadline, 'maxTeams' => $maxTeams]);

    Cache::flush();

    $isOpen = $deadline === null || strtotime($deadline) > time();
    Response::ok([
        'tournamentId' => $id,
        'registrationDeadline' => $deadline,
        'maxTeams' => $maxTeams ?? ($t['max_teams'] === null ? null : (int) $t['max_teams']),
        'currentTeams' => $current,
        'isOpen' => $isOpen,
    ]);
}

// ── helper ────────────────────────────────────────────────────────────────

/** ค่าว่าง -> NULL (ไม่ใช่ 0) สำหรับคอลัมน์ตัวเลขที่ยอมให้ว่างได้ */
function nn($v)
{
    return ($v === null || $v === '') ? null : $v;
}

/** ISO/`YYYY-MM-DD HH:MM` -> DATETIME ของ MySQL (เวลาไทย) */
function to_dt($v): ?string
{
    if ($v === null || $v === '' || $v === false) {
        return null;
    }
    $ts = strtotime((string) $v);
    return $ts === false ? null : date('Y-m-d H:i:s', $ts);
}

// ── ผู้ดูแลประจำรายการ (โรงเรียนเจ้าภาพ) ──────────────────────────────────

/** กำหนดว่ารายการนี้โรงเรียนไหนเป็นเจ้าภาพ */
function set_tournament_host(): void
{
    Perm::requireGlobalAdmin();

    $id = Input::require_str('tournamentId');
    $schoolId = Input::str('hostSchoolId');

    $t = Db::one('SELECT tournament_id, name, host_school_id FROM tournaments
                   WHERE tournament_id = :tid', [':tid' => $id]);
    if ($t === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }
    if ($schoolId !== '' && Db::value(
            'SELECT 1 FROM schools WHERE school_id = :sid', [':sid' => $schoolId]) === null) {
        Response::fail('ไม่พบโรงเรียนนี้', 404);
    }

    Db::exec('UPDATE tournaments SET host_school_id = :host WHERE tournament_id = :tid2',
        [':host' => $schoolId !== '' ? $schoolId : null, ':tid2' => $id]);

    Audit::log('tournament', $id, 'set_host',
        ['host' => $t['host_school_id']], ['host' => $schoolId]);
    Cache::flush();
    Response::ok(['tournamentId' => $id, 'hostSchoolId' => $schoolId ?: null]);
}

/**
 * มอบ/ถอนสิทธิ์ผู้ดูแลประจำรายการ
 *
 * แอดมินส่วนกลางเท่านั้นที่ทำได้ — ผู้ดูแลรายการมอบสิทธิ์ต่อไม่ได้
 * ไม่งั้นสิทธิ์จะกระจายจนตามไม่ทันว่าใครแก้อะไรได้
 */
function assign_tournament_manager(): void
{
    Perm::requireGlobalAdmin();

    $id = Input::require_str('tournamentId');
    $userId = Input::require_str('userId');
    $remove = Input::bool('remove');

    if (Db::value('SELECT 1 FROM tournaments WHERE tournament_id = :tid',
            [':tid' => $id]) === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }
    $u = Db::one('SELECT user_id, display_name, role FROM users WHERE user_id = :uid',
        [':uid' => $userId]);
    if ($u === null) {
        Response::fail('ไม่พบผู้ใช้นี้', 404);
    }

    if ($remove) {
        Db::exec('DELETE FROM tournament_managers
                   WHERE tournament_id = :tid2 AND user_id = :uid2',
            [':tid2' => $id, ':uid2' => $userId]);
        Audit::log('tournament', $id, 'revoke_manager', ['userId' => $userId], null);
        Cache::flush();
        Response::ok(['removed' => true, 'userId' => $userId]);
    }

    // ผู้ดูแลรายการต้องล็อกอินด้วย username/password ได้ จึงต้องเป็น staff ขึ้นไป
    // (บัญชี LINE ล้วนไม่มีรหัสผ่าน จะเข้ามาจัดการหลังบ้านไม่ได้)
    //
    // กรรมการที่มีบทบาท referee อยู่แล้วไม่ต้องยกเป็น staff — เขาแค่ต้องบันทึกผล
    // ไม่ต้องเห็นรายชื่อผู้ใช้ทั้งระบบหรือเงินบริจาค
    if ($u['role'] === 'user') {
        Db::exec("UPDATE users SET role = 'staff' WHERE user_id = :uid3",
            [':uid3' => $userId]);
        Response::warn('USER_PROMOTED_TO_STAFF');
    }

    Db::exec(
        'INSERT INTO tournament_managers
            (tournament_id, user_id, school_id, note, granted_by)
         VALUES (:tid3, :uid4, :sid, :note, :by)
         ON DUPLICATE KEY UPDATE school_id = VALUES(school_id), note = VALUES(note)',
        [
            ':tid3' => $id,
            ':uid4' => $userId,
            ':sid'  => Input::str('schoolId') ?: null,
            ':note' => Input::str('note'),
            ':by'   => Auth::userId(),
        ]
    );

    Audit::log('tournament', $id, 'grant_manager', null,
        ['userId' => $userId, 'name' => $u['display_name']]);
    Cache::flush();
    Response::ok(['userId' => $userId, 'displayName' => $u['display_name']]);
}

function list_tournament_managers(): void
{
    $id = Input::require_str('tournamentId');
    Perm::requireTournamentManager($id);

    $rows = Db::all(
        'SELECT tm.user_id, tm.school_id, tm.note, tm.created_at,
                u.display_name, u.username, u.role, s.school_name
           FROM tournament_managers tm
           JOIN users u  ON u.user_id = tm.user_id
           LEFT JOIN schools s ON s.school_id = tm.school_id
          WHERE tm.tournament_id = :tid
          ORDER BY u.display_name',
        [':tid' => $id]
    );
    $host = Db::one(
        'SELECT t.host_school_id, s.school_name
           FROM tournaments t
           LEFT JOIN schools s ON s.school_id = t.host_school_id
          WHERE t.tournament_id = :tid2',
        [':tid2' => $id]
    );

    Response::ok([
        'tournamentId' => $id,
        'hostSchoolId'   => $host['host_school_id'] ?? null,
        'hostSchoolName' => $host['school_name'] ?? null,
        'managers' => array_map(static fn(array $m): array => [
            'userId'      => $m['user_id'],
            'displayName' => $m['display_name'],
            'username'    => $m['username'],
            'role'        => $m['role'],
            'schoolId'    => $m['school_id'],
            'schoolName'  => $m['school_name'],
            'note'        => $m['note'],
            'grantedAt'   => $m['created_at'],
        ], $rows),
    ]);
}

/**
 * ล้าง cache ด้วยมือ
 *
 * จำเป็นเมื่อมีการแก้ข้อมูลนอกระบบ (เช่น แก้ผ่าน phpMyAdmin โดยตรง) ซึ่ง API
 * ไม่รู้จึงไม่ได้ล้าง cache ให้ ผลคือหน้าเว็บยังแสดงข้อมูลเก่าจนกว่า TTL จะหมด
 */
function flush_cache(): void
{
    Auth::requireStaff();
    Cache::flush();
    Audit::log('system', 'cache', 'flush');
    Response::ok(['message' => 'ล้าง cache แล้ว — โหลดหน้าเว็บใหม่เพื่อดูข้อมูลล่าสุด']);
}
