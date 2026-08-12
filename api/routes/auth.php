<?php
declare(strict_types=1);

/**
 * เข้าสู่ระบบ 3 ช่องทาง — ดูเหตุผลของแต่ละอย่างใน lib/Auth.php
 *
 * `?action=auth` คงชื่อเดิมที่ frontend เรียกอยู่ แต่พฤติกรรมต่างจากเดิมตรงที่
 * authType=line **ต้องส่ง idToken มา** ไม่ใช่ lineUserId ดิบ ๆ
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        'auth', 'login'    => do_login(),
        'teamLogin'        => do_team_login($cfg),
        'logout'           => do_logout(),
        'me'               => do_me(),
        'changePassword'   => do_change_password(),
        'setMySchool'      => set_my_school(),
        default            => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

function do_login(): void
{
    $type = strtolower(Input::str('authType', 'login'));

    if ($type === 'line') {
        line_login();
        return;
    }
    if ($type !== 'login') {
        // ระบบเดิมมี authType=register ให้สมัครบัญชีเองได้ — ปิดไป เพราะตอนนี้
        // ผู้ชมใช้ LINE และแอดมินถูกสร้างโดยแอดมินเท่านั้น
        Response::fail('ช่องทางเข้าสู่ระบบนี้ถูกปิดแล้ว', 400);
    }

    $username = Input::require_str('username');
    $password = Input::require_str('password');

    $u = Db::one(
        'SELECT u.user_id, u.username, u.password_hash, u.display_name, u.role, u.phone,
                u.picture_url, u.line_user_id, u.must_change_password,
                u.school_id, u.school_set_at, s.school_name
           FROM users u
           LEFT JOIN schools s ON s.school_id = u.school_id
          WHERE u.username = :un',
        [':un' => $username]
    );

    // ข้อความเดียวกันทั้งกรณีไม่มีบัญชีและรหัสผิด — ไม่ให้เดาว่ามี username ไหน
    if ($u === null || !Auth::verifyPassword($password, $u)) {
        usleep(300000);
        Response::fail('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401);
    }

    $session = Auth::issue($u['user_id']);
    Audit::log('user', $u['user_id'], 'login');

    Response::ok([
        'userId'      => $u['user_id'],
        'username'    => $u['username'],
        'displayName' => $u['display_name'],
        'pictureUrl'  => $u['picture_url'],
        'phoneNumber' => $u['phone'],
        'role'        => $u['role'],
        'lineUserId'  => $u['line_user_id'],
        'schoolId'    => $u['school_id'],
        'schoolName'  => $u['school_name'],
        // เจ้าหน้าที่ไม่ต้องถูกถามหาโรงเรียน — แอดมินเป็นคนกำหนดให้
        'needsSchool' => $u['school_set_at'] === null && $u['role'] === 'user',
        'mustChangePassword' => (bool) $u['must_change_password'],
        'token'       => $session['token'],
        'expiresAt'   => $session['expiresAt'],
    ]);
}

/**
 * LINE Login — เชื่อเฉพาะ `sub` จาก ID token ที่ verify กับ LINE แล้ว
 *
 * ของเดิมรับ lineUserId จาก client ตรง ๆ ทำให้ปลอมเป็นแอดมินได้
 * (ดูรายละเอียดใน lib/Auth.php)
 */
function line_login(): void
{
    $idToken = Input::str('idToken');
    if ($idToken === '') {
        Response::fail(
            'ต้องส่ง idToken จาก liff.getIDToken() — ระบบไม่รับ lineUserId โดยตรงอีกแล้ว',
            422
        );
    }

    $profile = Auth::verifyLineIdToken($idToken);
    $sub = $profile['sub'];

    $u = Db::one(
        'SELECT u.user_id, u.username, u.display_name, u.role, u.phone, u.picture_url,
                u.line_user_id, u.must_change_password, u.school_id, u.school_set_at,
                s.school_name
           FROM users u
           LEFT JOIN schools s ON s.school_id = u.school_id
          WHERE u.line_user_id = :sub',
        [':sub' => $sub]
    );

    if ($u === null) {
        // ผู้ใช้ใหม่ได้ role 'user' เสมอ — เลื่อนเป็นแอดมินได้จากหน้าแอดมินเท่านั้น
        $uid = 'U_' . (int) (microtime(true) * 1000);
        $name = $profile['name'] !== '' ? $profile['name'] : 'ผู้ใช้ LINE';
        Db::exec(
            'INSERT INTO users (user_id, line_user_id, display_name, picture_url, role)
             VALUES (:uid, :sub, :name, :pic, :role)',
            [
                ':uid'  => $uid,
                ':sub'  => $sub,
                ':name' => $name,
                ':pic'  => $profile['picture'],
                ':role' => 'user',
            ]
        );
        $u = [
            'user_id' => $uid, 'username' => null, 'display_name' => $name,
            'role' => 'user', 'phone' => '', 'picture_url' => $profile['picture'],
            'line_user_id' => $sub, 'must_change_password' => 0,
            'school_id' => null, 'school_set_at' => null, 'school_name' => null,
        ];
        Audit::log('user', $uid, 'create_via_line');
    } else {
        // อัปเดตชื่อ/รูปให้ตรงกับ LINE ปัจจุบัน
        Db::exec(
            'UPDATE users SET display_name = :name, picture_url = :pic
              WHERE user_id = :uid',
            [
                ':name' => $profile['name'] !== '' ? $profile['name'] : $u['display_name'],
                ':pic'  => $profile['picture'] !== '' ? $profile['picture'] : $u['picture_url'],
                ':uid'  => $u['user_id'],
            ]
        );
    }

    $session = Auth::issue($u['user_id']);

    Response::ok([
        'userId'      => $u['user_id'],
        'username'    => $u['username'],
        'displayName' => $u['display_name'],
        'pictureUrl'  => $u['picture_url'],
        'phoneNumber' => $u['phone'],
        'role'        => $u['role'],
        'lineUserId'  => $u['line_user_id'],
        'schoolId'    => $u['school_id'],
        'schoolName'  => $u['school_name'],
        // ยังไม่เคยเลือกโรงเรียน -> ฝั่งเว็บถามก่อนเข้าใช้งาน
        // ใช้ school_set_at ไม่ใช่ school_id เพราะคนที่ "เลือกว่าไม่สังกัดโรงเรียนใด"
        // ต้องไม่ถูกถามซ้ำทุกครั้งที่เปิดแอป
        'needsSchool' => $u['school_set_at'] === null,
        'token'       => $session['token'],
        'expiresAt'   => $session['expiresAt'],
    ]);
}

/**
 * ผู้ใช้เลือกโรงเรียนต้นสังกัดของตัวเอง
 *
 * เลือกได้เฉพาะโรงเรียนที่มีในระบบ ไม่ให้พิมพ์ชื่ออิสระ — ชื่อที่พิมพ์เองต่างกัน
 * นิดเดียวจะกลายเป็นคนละโรงเรียนทันที แล้วตามรวมทีหลังไม่ได้
 * ส่ง schoolId ว่าง = "ไม่สังกัดโรงเรียนใด" ซึ่งเป็นคำตอบที่ถูกต้องได้
 * (ผู้ปกครอง/ผู้ชมทั่วไป) จึงบันทึกเวลาไว้เพื่อไม่ถามซ้ำ
 */
function set_my_school(): void
{
    $u = Auth::requireLogin();

    $schoolId = Input::str('schoolId');
    $name = null;
    if ($schoolId !== '') {
        $name = Db::value('SELECT school_name FROM schools
                            WHERE school_id = :sid AND is_active = 1',
            [':sid' => $schoolId]);
        if ($name === null) {
            Response::fail('ไม่พบโรงเรียนนี้ในระบบ', 404);
        }
    }

    Db::exec(
        'UPDATE users SET school_id = :sid2, school_set_at = NOW() WHERE user_id = :uid',
        [':sid2' => $schoolId !== '' ? $schoolId : null, ':uid' => $u['user_id']]
    );

    Audit::log('user', (string) $u['user_id'], 'set_school', null,
        ['schoolId' => $schoolId ?: null]);

    Response::ok([
        'schoolId'   => $schoolId ?: null,
        'schoolName' => $name,
        'needsSchool' => false,
    ]);
}

/**
 * โรงเรียนเข้าด้วยรหัส 8 ตัว
 *
 * รหัสสั้นพอที่จะถูกไล่เดา จึงต้องมี rate limit — ไม่งั้นการมีรหัสเท่ากับไม่มี
 */
function do_team_login(array $cfg): void
{
    $code = strtoupper(preg_replace('/[^A-Z0-9]/i', '', Input::require_str('accessCode')));
    $tournamentId = Input::str('tournamentId');

    $limits = $cfg['access_code'] ?? [];
    $window   = (int) ($limits['window_seconds'] ?? 900);
    $maxTry   = (int) ($limits['max_attempts_per_ip'] ?? 5);
    $lockTry  = (int) ($limits['lockout_attempts'] ?? 10);
    $lockSecs = (int) ($limits['lockout_seconds'] ?? 3600);
    $ip = Auth::ipHash();

    $recent = (int) Db::value(
        'SELECT COUNT(*) FROM access_attempts
          WHERE ip_hash = :ip AND succeeded = 0
            AND attempted_at > DATE_SUB(NOW(), INTERVAL :win SECOND)',
        [':ip' => $ip, ':win' => $window]
    );
    if ($recent >= $lockTry) {
        Db::exec('INSERT INTO access_attempts (ip_hash, succeeded) VALUES (:ip2, 0)',
            [':ip2' => $ip]);
        Response::fail('ใส่รหัสผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่', 429,
            ['retryAfterSeconds' => $lockSecs]);
    }
    if ($recent >= $maxTry) {
        usleep(1500000);   // หน่วงให้การไล่เดาช้าลงมาก
    }

    // รหัสเก็บเป็น hash จึงต้องดึงมาเทียบทีละแถว — โรงเรียนมีหลักสิบ ไม่ใช่ปัญหา
    $rows = Db::all(
        'SELECT school_id, school_name, access_code_hash FROM schools
          WHERE access_code_hash IS NOT NULL AND is_active = 1'
    );
    $school = null;
    foreach ($rows as $r) {
        if (password_verify($code, (string) $r['access_code_hash'])) {
            $school = $r;
            break;
        }
    }

    if ($school === null) {
        Db::exec('INSERT INTO access_attempts (ip_hash, succeeded) VALUES (:ip3, 0)',
            [':ip3' => $ip]);
        usleep(300000);
        Response::fail('รหัสไม่ถูกต้อง', 401);
    }

    // ── เลือกรายการแข่งขันที่จะเข้า ────────────────────────────────────
    //
    // ⚠️ เดิมเลือก "รายการ Active ที่สร้างล่าสุด" โดยไม่ดูว่าโรงเรียนนี้มีทีม
    // อยู่ในรายการนั้นหรือเปล่า พอเดาผิดโรงเรียนจะเห็นหน้าว่างเปล่าว่า
    // "ยังไม่มีทีมของโรงเรียนนี้" ทั้งที่มีทีมที่โอนมาจากรายการเดิมอยู่จริง
    // ยิ่งไปกว่านั้น ETL ตั้ง created_at ของทุกรายการเป็นเวลาเดียวกัน
    // การเรียงจึงไม่ได้ให้ผลที่คาดเดาได้เลย
    //
    // ตอนนี้เลือกจาก "รายการที่โรงเรียนนี้มีทีมอยู่จริง" เท่านั้น
    $mine = Db::all(
        "SELECT t.tournament_id, t.name, t.status, t.registration_deadline,
                COUNT(tm.team_id) AS team_count
           FROM tournaments t
           JOIN teams tm ON tm.tournament_id = t.tournament_id
          WHERE tm.school_id = :sid_t AND tm.status <> 'Withdrawn'
          GROUP BY t.tournament_id
          ORDER BY FIELD(t.status,'Active','Upcoming','Archived'),
                   t.registration_deadline IS NULL,
                   t.registration_deadline DESC",
        [':sid_t' => $school['school_id']]
    );

    if ($mine === []) {
        Response::fail(
            'รหัสถูกต้อง แต่ยังไม่มีทีมของโรงเรียนนี้ในรายการแข่งขันใด — '
            . 'กรุณาแจ้งผู้จัดการแข่งขันให้เพิ่มทีมหรือคัดลอกทีมจากรายการก่อนหน้า',
            409, ['schoolName' => $school['school_name']]
        );
    }

    if ($tournamentId !== '') {
        // ระบุมาเอง -> ต้องเป็นรายการที่โรงเรียนนี้มีทีมอยู่จริง
        $ok = false;
        foreach ($mine as $m) {
            if ($m['tournament_id'] === $tournamentId) { $ok = true; break; }
        }
        if (!$ok) {
            Response::fail('โรงเรียนนี้ไม่มีทีมในรายการแข่งขันที่เลือก', 409);
        }
    } else {
        $tournamentId = (string) $mine[0]['tournament_id'];
    }

    Db::exec('INSERT INTO access_attempts (school_id, ip_hash, succeeded)
              VALUES (:sid, :ip4, 1)',
        [':sid' => $school['school_id'], ':ip4' => $ip]);
    Db::exec('UPDATE schools SET access_code_used_at = NOW() WHERE school_id = :sid2',
        [':sid2' => $school['school_id']]);

    $session = Auth::issueTeam($school['school_id'], $tournamentId);
    Audit::log('school', $school['school_id'], 'team_login');

    $teams = Db::all(
        'SELECT team_id, name, status, group_name,
                (SELECT COUNT(*) FROM players p WHERE p.team_id = t.team_id) AS player_count
           FROM teams t
          WHERE t.school_id = :sid3 AND t.tournament_id = :tid
          ORDER BY t.name',
        [':sid3' => $school['school_id'], ':tid' => $tournamentId]
    );

    Response::ok([
        'schoolId'     => $school['school_id'],
        'schoolName'   => $school['school_name'],
        'tournamentId' => $tournamentId,
        'teams'        => array_map(static fn(array $t): array => [
            'id'          => $t['team_id'],
            'name'        => $t['name'],
            'status'      => $t['status'],
            'group'       => (string) $t['group_name'],
            'playerCount' => (int) $t['player_count'],
        ], $teams),
        // ถ้าโรงเรียนมีทีมหลายรายการ ให้เลือกสลับได้ ไม่ใช่ล็อกไว้รายการเดียว
        'availableTournaments' => array_map(static fn(array $m): array => [
            'id'        => $m['tournament_id'],
            'name'      => $m['name'],
            'status'    => $m['status'],
            'teamCount' => (int) $m['team_count'],
        ], $mine),
        'token'     => $session['token'],
        'expiresAt' => $session['expiresAt'],
    ]);
}

function do_logout(): void
{
    Auth::revokeCurrent();
    Response::ok();
}

function do_me(): void
{
    if (Auth::schoolId() !== null) {
        Response::ok([
            'type'         => 'school',
            'schoolId'     => Auth::schoolId(),
            'tournamentId' => Auth::teamTournamentId(),
        ]);
    }
    $u = Auth::requireLogin();
    $sc = Db::one('SELECT u.school_id, u.school_set_at, s.school_name
                     FROM users u LEFT JOIN schools s ON s.school_id = u.school_id
                    WHERE u.user_id = :uid', [':uid' => $u['user_id']]) ?? [];
    Response::ok([
        'type'        => 'user',
        'userId'      => $u['user_id'],
        'displayName' => $u['display_name'],
        'role'        => $u['role'],
        'pictureUrl'  => $u['picture_url'],
        'lineUserId'  => $u['line_user_id'],
        'schoolId'    => $sc['school_id'] ?? null,
        'schoolName'  => $sc['school_name'] ?? null,
        'needsSchool' => ($sc['school_set_at'] ?? null) === null
            && ($u['role'] ?? 'user') === 'user',
        'mustChangePassword' => (bool) $u['must_change_password'],
    ]);
}

function do_change_password(): void
{
    $u = Auth::requireLogin();
    $new = Input::require_str('newPassword');
    if (strlen($new) < 8) {
        Response::fail('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร', 422);
    }

    // บัญชีที่ถูกบังคับเปลี่ยนรหัส (ย้ายมาจากชีตที่รหัสเป็น plaintext)
    // ไม่ต้องยืนยันรหัสเดิม เพราะรหัสเดิมถือว่าหลุดแล้ว
    if (!$u['must_change_password']) {
        $current = Input::require_str('currentPassword');
        $full = Db::one('SELECT password_hash FROM users WHERE user_id = :uid',
            [':uid' => $u['user_id']]);
        if ($full === null || !Auth::verifyPassword($current, $full)) {
            Response::fail('รหัสผ่านเดิมไม่ถูกต้อง', 401);
        }
    }

    Db::exec(
        "UPDATE users SET password_hash = :h, password_algo = 'argon2id',
                          must_change_password = 0
          WHERE user_id = :uid2",
        [':h' => Auth::hashPassword($new), ':uid2' => $u['user_id']]
    );
    Audit::log('user', $u['user_id'], 'change_password');
    Response::ok();
}
