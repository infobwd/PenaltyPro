<?php
declare(strict_types=1);

/**
 * โรงเรียนและรหัสเข้าใช้งาน
 *
 * รหัส 8 ตัวคือสิ่งเดียวที่กั้นระหว่างคนนอกกับการแก้ข้อมูลทีม จึงต้อง:
 *   - เก็บเป็น hash เท่านั้น ระบบไม่เคยเก็บรหัสจริง
 *   - แอดมินเห็นได้ครั้งเดียวตอนออกรหัส (เอาไปพิมพ์แจก)
 *   - ลืมแล้วออกใหม่ได้ 1 คลิก และรหัสเก่าตายทันทีพร้อม session ที่ค้าง
 */

/** ตัด 0/O/1/I/L ออก เพราะพิมพ์ผิดกันบ่อยเวลาอ่านจากกระดาษ */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function handle(string $action, array $cfg): void
{
    match ($action) {
        'issueAccessCodes'    => issue_access_codes(),
        'regenerateAccessCode' => regenerate_access_code(),
        'publicSchools'       => public_schools(),
        'listSchools'         => list_schools(),
        'searchUsers'         => search_users(),
        'revealAccessCode'    => reveal_access_code(),
        default               => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

function generate_code(): string
{
    $out = '';
    $max = strlen(CODE_ALPHABET) - 1;
    for ($i = 0; $i < 8; $i++) {
        $out .= CODE_ALPHABET[random_int(0, $max)];
    }
    return $out;
}

/**
 * ออกรหัสให้โรงเรียนทีเดียวทั้งชุด
 *
 * ค่าเริ่มต้นออกให้เฉพาะโรงเรียนที่ "มีทีมอยู่ในทัวร์นาเมนต์นี้" — ไม่ใช่ทุก
 * โรงเรียนในระบบ เพราะแจกรหัสให้คนที่ไม่ได้แข่งด้วยคือเพิ่มความเสี่ยงเปล่า ๆ
 *
 * โรงเรียนที่มีรหัสอยู่แล้วจะถูกข้าม เว้นแต่ส่ง regenerateExisting=true
 * (ไม่งั้นกดปุ่มซ้ำแล้วรหัสที่แจกไปทั้งหมดใช้ไม่ได้กะทันหัน)
 */
function issue_access_codes(): void
{
    Auth::requireLogin();

    $tournamentId = Input::require_str('tournamentId');
    Perm::requireTournamentManager($tournamentId);
    $regenerate   = Input::bool('regenerateExisting');

    $t = Db::one('SELECT tournament_id, name FROM tournaments WHERE tournament_id = :tid',
        [':tid' => $tournamentId]);
    if ($t === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }

    $schools = Db::all(
        'SELECT DISTINCT s.school_id, s.school_name, s.access_code_hash
           FROM schools s
           JOIN teams t ON t.school_id = s.school_id
          WHERE t.tournament_id = :tid2 AND s.is_active = 1
          ORDER BY s.school_name',
        [':tid2' => $tournamentId]
    );
    if ($schools === []) {
        Response::fail(
            'ยังไม่มีทีมในรายการแข่งขันนี้ — คัดลอกทีมจากรายการก่อนหน้า (cloneTeams) ก่อน',
            409
        );
    }

    $issued = [];
    $skipped = [];

    Db::transaction(static function () use ($schools, $regenerate, &$issued, &$skipped): void {
        foreach ($schools as $s) {
            if ($s['access_code_hash'] !== null && !$regenerate) {
                $skipped[] = $s['school_name'];
                continue;
            }
            $code = generate_code();
            Db::exec(
                'UPDATE schools
                    SET access_code_hash = :hash, access_code_enc = :enc,
                        access_code_issued_at = NOW()
                  WHERE school_id = :sid',
                [
                    ':hash' => password_hash($code, PASSWORD_BCRYPT),
                    ':enc'  => Secret::encrypt($code),
                    ':sid'  => $s['school_id'],
                ]
            );
            // รหัสเก่าตาย -> session ที่ยังค้างต้องตายตาม
            Db::exec('DELETE FROM team_sessions WHERE school_id = :sid2',
                [':sid2' => $s['school_id']]);

            $issued[] = [
                'schoolId'   => $s['school_id'],
                'schoolName' => $s['school_name'],
                'accessCode' => $code,   // ครั้งเดียวเท่านั้น หลังจากนี้ดูย้อนหลังไม่ได้
            ];
        }
    });

    Audit::log('tournament', $tournamentId, 'issue_access_codes', null,
        ['issued' => count($issued), 'skipped' => count($skipped)]);
    Cache::flush();

    Response::ok([
        'tournamentId'   => $tournamentId,
        'tournamentName' => $t['name'],
        'issued'         => $issued,
        'skippedExisting' => $skipped,
        'notice' => 'รหัสเหล่านี้แสดงเพียงครั้งเดียว — พิมพ์หรือบันทึกไว้ก่อนปิดหน้านี้',
    ]);
}

/**
 * ออกรหัสใหม่ให้โรงเรียนเดียว
 *
 * ผู้ดูแลประจำรายการ (โรงเรียนเจ้าภาพ) ทำได้ด้วย — เพราะคนที่รับสายเวลาครู
 * โทรมาบอกว่า "ลืมรหัส" คือเจ้าภาพ ไม่ใช่แอดมินส่วนกลาง แต่ทำได้เฉพาะ
 * โรงเรียนที่มีทีมอยู่ในรายการที่ตัวเองดูแลเท่านั้น
 */
function regenerate_access_code(): void
{
    Auth::requireLogin();

    $schoolId = Input::require_str('schoolId');
    $s = Db::one('SELECT school_id, school_name FROM schools WHERE school_id = :sid',
        [':sid' => $schoolId]);
    if ($s === null) {
        Response::fail('ไม่พบโรงเรียนนี้', 404);
    }

    if (!Auth::isAdmin()) {
        // ต้องเป็นผู้ดูแลของรายการใดรายการหนึ่งที่โรงเรียนนี้มีทีมอยู่
        $managed = Perm::managedTournamentIds();   // null = แอดมินส่วนกลาง
        $allowed = false;
        foreach (($managed ?? []) as $tid) {
            if (Db::value('SELECT 1 FROM teams WHERE tournament_id = :tid AND school_id = :sid2',
                    [':tid' => $tid, ':sid2' => $schoolId]) !== null) {
                $allowed = true;
                break;
            }
        }
        if (!$allowed) {
            Response::fail(
                'คุณไม่มีสิทธิ์ออกรหัสให้โรงเรียนนี้ — ทำได้เฉพาะโรงเรียนที่มีทีม'
                . 'ในรายการแข่งขันที่คุณดูแล',
                403
            );
        }
    }

    $code = generate_code();
    Db::transaction(static function () use ($schoolId, $code): void {
        Db::exec(
            'UPDATE schools SET access_code_hash = :hash, access_code_enc = :enc,
                                access_code_issued_at = NOW()
              WHERE school_id = :sid',
            [
                ':hash' => password_hash($code, PASSWORD_BCRYPT),
                ':enc'  => Secret::encrypt($code),
                ':sid'  => $schoolId,
            ]
        );
        Db::exec('DELETE FROM team_sessions WHERE school_id = :sid2', [':sid2' => $schoolId]);
    });

    Audit::log('school', $schoolId, 'regenerate_access_code');
    Response::ok([
        'schoolId'   => $s['school_id'],
        'schoolName' => $s['school_name'],
        'accessCode' => $code,
        'notice' => 'รหัสเดิมใช้ไม่ได้แล้ว และผู้ที่กำลังเข้าใช้อยู่ถูกออกจากระบบทันที',
    ]);
}

/** รายชื่อโรงเรียนพร้อมสถานะรหัส — ไม่คืนตัวรหัส (เก็บเป็น hash) */
function list_schools(): void
{
    Auth::requireStaff();
    $tournamentId = Input::str('tournamentId');
    $onlyWithTeams = Input::bool('onlyWithTeams');

    $rows = Db::all(
        'SELECT s.school_id, s.school_name, s.district, s.province,
                s.access_code_issued_at, s.access_code_used_at,
                (s.access_code_hash IS NOT NULL) AS has_code,
                COUNT(t.team_id) AS team_count
           FROM schools s
           LEFT JOIN teams t ON t.school_id = s.school_id
            AND (:tid = :tid_blank OR t.tournament_id = :tid_match)
          WHERE s.is_active = 1
          GROUP BY s.school_id
          HAVING (:only_teams = 0 OR COUNT(t.team_id) > 0)
          ORDER BY s.school_name',
        [
            ':tid' => $tournamentId, ':tid_blank' => '', ':tid_match' => $tournamentId,
            ':only_teams' => $onlyWithTeams ? 1 : 0,
        ]
    );

    Response::ok(['schools' => array_map(static fn(array $s): array => [
        'schoolId'   => $s['school_id'],
        'schoolName' => $s['school_name'],
        'district'   => $s['district'],
        'province'   => $s['province'],
        'hasAccessCode' => (bool) $s['has_code'],
        'codeIssuedAt'  => $s['access_code_issued_at'],
        'codeUsedAt'    => $s['access_code_used_at'],
        'teamCount'     => (int) $s['team_count'],
    ], $rows)]);
}

/**
 * ค้นหาผู้ใช้สำหรับมอบสิทธิ์ผู้ดูแลประจำรายการ
 *
 * เดิมหน้าแอดมินให้พิมพ์ `user_id` เอง (เช่น U_1699...) ซึ่งไม่มีใครจำได้และ
 * พิมพ์ผิดแล้วไปมอบสิทธิ์ให้คนอื่นโดยไม่รู้ตัว
 */
function search_users(): void
{
    Auth::requireStaff();

    $q = Input::str('q');
    $rows = $q === ''
        ? Db::all(
            "SELECT user_id, display_name, username, role, phone
               FROM users WHERE role IN ('admin','staff')
              ORDER BY display_name LIMIT 50")
        : Db::all(
            // placeholder ห้ามซ้ำชื่อในคิวรีเดียว (EMULATE_PREPARES=false)
            "SELECT user_id, display_name, username, role, phone
               FROM users
              WHERE display_name LIKE :q_name
                 OR username     LIKE :q_user
                 OR phone        LIKE :q_phone
              ORDER BY FIELD(role,'admin','staff','user'), display_name
              LIMIT 30",
            [':q_name' => "%$q%", ':q_user' => "%$q%", ':q_phone' => "%$q%"]
        );

    Response::ok(['users' => array_map(static fn(array $u): array => [
        'userId'      => $u['user_id'],
        'displayName' => $u['display_name'],
        'username'    => $u['username'],
        'role'        => $u['role'],
        // เบอร์โทรช่วยยืนยันตัวตนตอนเลือก แต่แสดงแค่ 4 ตัวท้าย
        'phoneHint'   => $u['phone'] ? '••••' . substr((string) $u['phone'], -4) : '',
    ], $rows)]);
}

/**
 * เปิดดูรหัสของโรงเรียน (ไม่ต้องออกรหัสใหม่)
 *
 * มีไว้เพื่อกรณีที่เกิดขึ้นจริงบ่อยที่สุด: ครูโทรมาบอกว่าทำใบรหัสหาย
 * ถ้าไม่มีทางดูย้อนหลัง ผู้ดูแลต้องออกรหัสใหม่ ซึ่งทำให้รหัสที่แจกไปแล้ว
 * ของโรงเรียนนั้นตายทันที และถ้าครูอีกคนถือใบเดิมอยู่ก็เข้าไม่ได้ตามไปด้วย
 *
 * ทุกครั้งที่เปิดดูจะถูกบันทึกลง audit_log ว่าใครดูของโรงเรียนไหนเมื่อไหร่
 */
function reveal_access_code(): void
{
    Auth::requireLogin();

    $schoolId = Input::require_str('schoolId');
    $s = Db::one(
        'SELECT school_id, school_name, access_code_enc, access_code_hash,
                access_code_issued_at
           FROM schools WHERE school_id = :sid',
        [':sid' => $schoolId]
    );
    if ($s === null) {
        Response::fail('ไม่พบโรงเรียนนี้', 404);
    }

    if (!Auth::isAdmin()) {
        $managed = Perm::managedTournamentIds();
        $allowed = false;
        foreach (($managed ?? []) as $tid) {
            if (Db::value('SELECT 1 FROM teams WHERE tournament_id = :tid AND school_id = :sid2',
                    [':tid' => $tid, ':sid2' => $schoolId]) !== null) {
                $allowed = true;
                break;
            }
        }
        if (!$allowed) {
            Response::fail('คุณไม่มีสิทธิ์ดูรหัสของโรงเรียนนี้', 403);
        }
    }

    if ($s['access_code_hash'] === null) {
        Response::fail('โรงเรียนนี้ยังไม่เคยได้รับรหัส', 404);
    }

    $code = Secret::decrypt($s['access_code_enc']);
    if ($code === null) {
        // รหัสที่ออกก่อนเปิดใช้ฟีเจอร์นี้จะไม่มีสำเนาที่ถอดได้
        Response::fail(
            'รหัสนี้ออกไว้ก่อนระบบรองรับการเปิดดู — ต้องออกรหัสใหม่จึงจะดูได้',
            409, ['needsRegenerate' => true]
        );
    }

    Db::exec('UPDATE schools SET access_code_revealed_at = NOW() WHERE school_id = :sid3',
        [':sid3' => $schoolId]);
    Audit::log('school', $schoolId, 'reveal_access_code');

    Response::ok([
        'schoolId'   => $s['school_id'],
        'schoolName' => $s['school_name'],
        'accessCode' => $code,
        'issuedAt'   => $s['access_code_issued_at'],
    ]);
}

/**
 * รายชื่อโรงเรียนแบบเปิด — ใช้ให้ผู้ใช้เลือกต้นสังกัดของตัวเองตอนเข้าผ่าน LINE
 *
 * แยกจาก listSchools ที่ต้องเป็นเจ้าหน้าที่ เพราะอันนั้นบอกด้วยว่าโรงเรียนไหน
 * มีรหัสเข้าใช้งานแล้วและออกรหัสเมื่อไหร่ ซึ่งเป็นข้อมูลที่ช่วยคนเดารหัสได้
 * อันนี้ให้แค่ชื่อกับที่ตั้ง ซึ่งเป็นข้อมูลสาธารณะอยู่แล้ว
 */
function public_schools(): void
{
    $payload = Cache::remember('public_schools', static fn(): array => [
        'schools' => array_map(static fn(array $s): array => [
            'schoolId'   => $s['school_id'],
            'schoolName' => $s['school_name'],
            'district'   => $s['district'],
            'province'   => $s['province'],
        ], Db::all('SELECT school_id, school_name, district, province
                      FROM schools WHERE is_active = 1 ORDER BY school_name')),
    ]);

    Response::ok($payload);
}
