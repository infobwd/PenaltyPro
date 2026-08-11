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
        default                 => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

// ─────────────────────────────────────────────────────────────────────────

function create_tournament(): void
{
    Auth::requireAdmin();

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
    Auth::requireAdmin();

    $t = Input::arr('tournament');
    $id = trim((string) ($t['id'] ?? ''));
    if ($id === '') {
        Response::fail('ต้องระบุ tournament.id', 422);
    }
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
                registration_deadline = :deadline,
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
                ':deadline' => to_dt($cfg['registrationDeadline'] ?? null),
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
    Auth::requireAdmin();

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
    Auth::requireAdmin();

    $id = Input::require_str('tournamentId');
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
