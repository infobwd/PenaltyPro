<?php
declare(strict_types=1);

/**
 * งานหลังบ้านที่เหลือ — ผู้ใช้ ข่าว ค่าตั้งระบบ เงินบริจาค ผู้สนับสนุน
 *
 * ทั้งหมดนี้เคยยิงไป Apps Script ด้วย mode:'no-cors' ซึ่งตอบ "สำเร็จ" เสมอ
 * แล้วเขียนลงชีต — คนละที่กับที่หน้าเว็บอ่าน (MySQL) ผลคือแอดมินแก้อะไรก็
 * ไม่เห็นผล และไม่มีอะไรบอกว่าล้มเหลว
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        // ผู้ใช้
        'getUsers'          => list_users(),
        'createUser'        => create_user(),
        'updateUserDetails' => update_user(),
        'updateUserRole'    => update_user_role(),
        'deleteUser'        => delete_user(),
        // ข่าวและค่าตั้ง
        'manageNews'        => manage_news($cfg),
        'saveSettings'      => save_settings(),
        // เงินบริจาค
        'verifyDonation'        => verify_donation(),
        'updateDonationDetails' => update_donation(),
        // จอแสดงผล
        'getSponsors'       => list_scoped('sponsors'),
        'manageSponsor'     => manage_scoped('sponsors'),
        'getMusicTracks'    => list_scoped('music_tracks'),
        'manageMusicTrack'  => manage_scoped('music_tracks'),
        'getTickerMessages' => list_scoped('ticker_messages'),
        'manageTickerMessage' => manage_scoped('ticker_messages'),
        default => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

// ── ผู้ใช้ ────────────────────────────────────────────────────────────────

function list_users(): void
{
    // ⚠️ ของเดิม getUsers เปิดสาธารณะ คืน lineUserId ของทุกคนรวมแอดมิน
    // ซึ่งเป็นขั้นแรกของการยึดสิทธิ์แอดมิน — ปิดให้เจ้าหน้าที่เท่านั้น
    Auth::requireStaff();

    $rows = Db::all(
        'SELECT u.user_id, u.username, u.display_name, u.role, u.phone, u.picture_url,
                u.line_user_id, u.last_login_at, u.must_change_password,
                u.school_id, u.school_set_at, s.school_name
           FROM users u
           LEFT JOIN schools s ON s.school_id = u.school_id
          ORDER BY FIELD(u.role,\'admin\',\'staff\',\'user\'), u.display_name'
    );
    Response::ok(['users' => array_map(static fn(array $u): array => [
        'userId'      => $u['user_id'],
        'username'    => $u['username'],
        'displayName' => $u['display_name'],
        'role'        => $u['role'],
        'phoneNumber' => $u['phone'],
        'pictureUrl'  => drive_img($u['picture_url']),
        'lineUserId'  => $u['line_user_id'],
        'lastLogin'   => $u['last_login_at'],
        'schoolId'    => $u['school_id'],
        'schoolName'  => $u['school_name'],
        // แยก "ยังไม่เคยถูกถาม" ออกจาก "เลือกแล้วว่าไม่สังกัดโรงเรียนใด"
        'schoolChosen' => $u['school_set_at'] !== null,
        'mustChangePassword' => (bool) $u['must_change_password'],
    ], $rows)]);
}

function create_user(): void
{
    Auth::requireAdmin();

    $username = Input::require_str('username');
    $password = Input::str('password');
    $role = Input::str('role') ?: 'user';
    if (!in_array($role, ['admin', 'staff', 'user'], true)) {
        $role = 'user';
    }
    if (in_array($role, ['admin', 'staff'], true) && strlen($password) < 8) {
        // chk_staff_has_password ใน schema บังคับอยู่แล้ว แต่บอกให้เข้าใจก่อนชน
        Response::fail('บัญชีผู้ดูแล/เจ้าหน้าที่ต้องตั้งรหัสผ่านอย่างน้อย 8 ตัวอักษร', 422);
    }
    if (Db::value('SELECT 1 FROM users WHERE username = :un', [':un' => $username]) !== null) {
        Response::fail('ชื่อผู้ใช้นี้มีอยู่แล้ว', 409);
    }

    $schoolId = Input::str('schoolId');
    if ($schoolId !== '' && Db::value('SELECT 1 FROM schools WHERE school_id = :sid',
            [':sid' => $schoolId]) === null) {
        Response::fail('ไม่พบโรงเรียนนี้ในระบบ', 404);
    }

    $uid = 'U_' . (int) (microtime(true) * 1000);
    Db::exec(
        'INSERT INTO users (user_id, username, password_hash, password_algo,
                            display_name, role, phone, must_change_password,
                            school_id, school_set_at)
         VALUES (:uid, :un2, :pw, :algo, :name, :role, :phone, :must,
                 :sid2, NOW())',
        [
            ':uid'  => $uid,
            ':un2'  => $username,
            ':pw'   => $password !== '' ? Auth::hashPassword($password) : null,
            ':algo' => 'argon2id',
            ':name' => Input::str('displayName') ?: $username,
            ':role' => $role,
            ':phone' => Input::str('phone'),
            ':must' => $password !== '' ? 1 : 0,
            ':sid2' => $schoolId !== '' ? $schoolId : null,
        ]
    );
    Audit::log('user', $uid, 'create', null, ['username' => $username, 'role' => $role]);
    Cache::flush();
    Response::ok(['userId' => $uid]);
}

function update_user(): void
{
    Auth::requireAdmin();

    $uid = Input::require_str('userId');
    $before = Db::one('SELECT * FROM users WHERE user_id = :uid', [':uid' => $uid]);
    if ($before === null) {
        Response::fail('ไม่พบผู้ใช้นี้', 404);
    }

    $password = Input::str('password');
    $role = Input::str('role') ?: $before['role'];
    if (!in_array($role, ['admin', 'staff', 'user'], true)) {
        $role = $before['role'];
    }
    // เลื่อนเป็นแอดมิน/สตาฟ ต้องมีรหัสผ่าน ไม่งั้นเข้าหลังบ้านไม่ได้เลย
    if (in_array($role, ['admin', 'staff'], true)
        && $before['password_hash'] === null && $password === '') {
        Response::fail('ต้องตั้งรหัสผ่านให้บัญชีนี้ก่อนเลื่อนเป็นผู้ดูแล/เจ้าหน้าที่', 422);
    }

    // โรงเรียนต้นสังกัด — ส่งมาเมื่อไหร่ถึงจะแก้ ไม่ส่งมาก็ไม่แตะของเดิม
    // (ถ้าไม่แยกแบบนี้ การกดบันทึกชื่อ/เบอร์เฉย ๆ จะล้างโรงเรียนทิ้งทุกครั้ง)
    $touchSchool = array_key_exists('schoolId', Input::body());
    $schoolId = null;
    if ($touchSchool) {
        $schoolId = Input::str('schoolId');
        if ($schoolId !== '' && Db::value('SELECT 1 FROM schools WHERE school_id = :sid',
                [':sid' => $schoolId]) === null) {
            Response::fail('ไม่พบโรงเรียนนี้ในระบบ', 404);
        }
    }

    Db::exec(
        'UPDATE users SET
            display_name = :name, phone = :phone, role = :role,
            school_id = CASE WHEN :touch = 1 THEN :sid2 ELSE school_id END,
            school_set_at = CASE WHEN :touch2 = 1 THEN NOW() ELSE school_set_at END,
            password_hash = COALESCE(:pw, password_hash),
            must_change_password = CASE WHEN :pw2 IS NULL THEN must_change_password ELSE 1 END
          WHERE user_id = :uid2',
        [
            ':name'  => Input::str('displayName') ?: $before['display_name'],
            ':phone' => Input::str('phone'),
            ':role'  => $role,
            ':touch' => $touchSchool ? 1 : 0,
            ':touch2' => $touchSchool ? 1 : 0,
            ':sid2'  => ($schoolId ?? '') !== '' ? $schoolId : null,
            ':pw'    => $password !== '' ? Auth::hashPassword($password) : null,
            ':pw2'   => $password !== '' ? '1' : null,
            ':uid2'  => $uid,
        ]
    );
    Audit::log('user', $uid, 'update', $before, ['role' => $role]);
    Cache::flush();
    Response::ok();
}

function update_user_role(): void
{
    Auth::requireAdmin();
    $uid = Input::require_str('userId');
    $role = Input::str('role');
    if (!in_array($role, ['admin', 'staff', 'user'], true)) {
        Response::fail('บทบาทไม่ถูกต้อง', 422);
    }
    $u = Db::one('SELECT role, password_hash FROM users WHERE user_id = :uid', [':uid' => $uid]);
    if ($u === null) {
        Response::fail('ไม่พบผู้ใช้นี้', 404);
    }
    if (in_array($role, ['admin', 'staff'], true) && $u['password_hash'] === null) {
        Response::fail('บัญชีนี้ยังไม่มีรหัสผ่าน — ตั้งรหัสผ่านก่อนจึงจะเลื่อนสิทธิ์ได้', 422);
    }
    Db::exec('UPDATE users SET role = :role WHERE user_id = :uid2',
        [':role' => $role, ':uid2' => $uid]);
    Audit::log('user', $uid, 'update_role', ['role' => $u['role']], ['role' => $role]);
    Cache::flush();
    Response::ok();
}

function delete_user(): void
{
    Auth::requireAdmin();
    $uid = Input::require_str('userId');
    if ($uid === Auth::userId()) {
        Response::fail('ลบบัญชีตัวเองไม่ได้', 422);
    }
    $u = Db::one('SELECT display_name, role FROM users WHERE user_id = :uid', [':uid' => $uid]);
    if ($u === null) {
        Response::fail('ไม่พบผู้ใช้นี้', 404);
    }
    // กันลบแอดมินคนสุดท้ายจนไม่มีใครเข้าหลังบ้านได้
    if ($u['role'] === 'admin') {
        $left = (int) Db::value(
            "SELECT COUNT(*) FROM users WHERE role = 'admin' AND user_id <> :uid2",
            [':uid2' => $uid]);
        if ($left === 0) {
            Response::fail('นี่คือผู้ดูแลระบบคนสุดท้าย ลบแล้วจะไม่มีใครเข้าหลังบ้านได้', 409);
        }
    }
    Audit::log('user', $uid, 'delete', $u, null);
    Db::exec('DELETE FROM users WHERE user_id = :uid3', [':uid3' => $uid]);
    Cache::flush();
    Response::ok();
}

// ── ข่าว ──────────────────────────────────────────────────────────────────

function manage_news(array $cfg): void
{
    Auth::requireStaff();

    $sub = Input::str('subAction');
    $item = Input::arr('newsItem');
    $id = trim((string) ($item['id'] ?? ''));

    if ($sub === 'delete') {
        if ($id === '') {
            Response::fail('ต้องระบุ id ของข่าว', 422);
        }
        Db::exec('DELETE FROM news WHERE news_id = :id', [':id' => $id]);
        Audit::log('news', $id, 'delete');
        Cache::flush();
        Response::ok();
    }

    $tid = trim((string) ($item['tournamentId'] ?? ''));
    $tid = ($tid === '' || $tid === 'global') ? null : $tid;

    // รองรับ client รุ่นเก่าที่ยังส่ง Base64 มา แต่แปลงเป็นไฟล์ก่อนเขียน DB
    // client รุ่นใหม่จะส่ง URL สั้น ๆ มาอยู่แล้ว จึงผ่านจุดนี้ได้ทันที
    try {
        $imageUrl = store_data_url((string) ($item['imageUrl'] ?? ''), 'news', $cfg);
        $documentUrl = store_data_url((string) ($item['documentUrl'] ?? ''), 'doc', $cfg);
    } catch (RuntimeException $e) {
        Response::fail($e->getMessage(), 422);
    }

    if ($sub === 'add' || $id === '') {
        $id = $id !== '' ? $id : 'N_' . (int) (microtime(true) * 1000);
        Db::exec(
            'INSERT INTO news (news_id, tournament_id, title, content,
                               image_url, document_url, published_at)
             VALUES (:id2, :tid, :title, :content, :img, :doc, NOW())',
            [
                ':id2' => $id, ':tid' => $tid,
                ':title' => (string) ($item['title'] ?? ''),
                ':content' => (string) ($item['content'] ?? ''),
                ':img' => $imageUrl,
                ':doc' => $documentUrl,
            ]
        );
        Audit::log('news', $id, 'create');
    } else {
        Db::exec(
            'UPDATE news SET tournament_id = :tid2, title = :title2, content = :content2,
                             image_url = COALESCE(NULLIF(:img2, \'\'), image_url),
                             document_url = COALESCE(NULLIF(:doc2, \'\'), document_url)
              WHERE news_id = :id3',
            [
                ':tid2' => $tid,
                ':title2' => (string) ($item['title'] ?? ''),
                ':content2' => (string) ($item['content'] ?? ''),
                ':img2' => $imageUrl,
                ':doc2' => $documentUrl,
                ':id3' => $id,
            ]
        );
        Audit::log('news', $id, 'update');
    }
    Cache::flush();
    Response::ok(['newsId' => $id]);
}

// ── ค่าตั้งระบบ ───────────────────────────────────────────────────────────

function save_settings(): void
{
    Auth::requireAdmin();

    $settings = Input::arr('settings');
    if ($settings === []) {
        Response::fail('ไม่มีค่าที่จะบันทึก', 422);
    }

    // ค่าที่ห้ามส่งออกให้คนทั่วไป — ต้องตั้ง is_public=0 ตอนบันทึก
    $private = ['adminPin', 'lineChannelId'];

    Db::transaction(static function () use ($settings, $private): void {
        foreach ($settings as $k => $v) {
            if (is_array($v) || is_object($v)) {
                continue;
            }
            // camelCase -> snake_case ให้ตรงกับที่ ETL เขียนไว้
            $key = strtolower(preg_replace('/([a-z])([A-Z])/', '$1_$2', (string) $k));
            Db::exec(
                'INSERT INTO app_settings (setting_key, setting_value, is_public)
                 VALUES (:k, :v, :pub)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
                [
                    ':k' => $key,
                    // PHP แปลง false เป็นสตริงว่าง ซึ่ง frontend จะตีความเป็น
                    // "ยังไม่ได้ตั้งค่า" และย้อนกลับไปใช้ค่า default=true
                    ':v' => is_bool($v) ? ($v ? '1' : '0') : (string) $v,
                    ':pub' => in_array($k, $private, true) ? 0 : 1,
                ]
            );
        }
    });

    Audit::log('system', 'settings', 'update', null, ['keys' => array_keys($settings)]);
    Cache::flush();
    Response::ok();
}

// ── เงินบริจาค ────────────────────────────────────────────────────────────

function verify_donation(): void
{
    Auth::requireStaff();
    $id = Input::require_str('donationId');
    $status = Input::str('status');
    if (!in_array($status, ['Pending', 'Verified', 'Rejected'], true)) {
        Response::fail('สถานะไม่ถูกต้อง', 422);
    }
    $before = Db::one('SELECT status, amount FROM donations WHERE donation_id = :id',
        [':id' => $id]);
    if ($before === null) {
        Response::fail('ไม่พบรายการบริจาคนี้', 404);
    }
    Db::exec('UPDATE donations SET status = :st WHERE donation_id = :id2',
        [':st' => $status, ':id2' => $id]);
    Audit::log('donation', $id, 'verify', $before, ['status' => $status]);
    Cache::flush();
    Response::ok();
}

function update_donation(): void
{
    Auth::requireStaff();
    $id = Input::require_str('donationId');
    if (Db::value('SELECT 1 FROM donations WHERE donation_id = :id', [':id' => $id]) === null) {
        Response::fail('ไม่พบรายการบริจาคนี้', 404);
    }
    $anon = Input::get('isAnonymous', null);
    Db::exec(
        'UPDATE donations SET
            is_anonymous = CASE WHEN :has_a = 1 THEN :anon ELSE is_anonymous END,
            tax_file_url = COALESCE(NULLIF(:tax, \'\'), tax_file_url)
          WHERE donation_id = :id2',
        [
            ':has_a' => $anon === null ? 0 : 1,
            ':anon'  => !empty($anon) ? 1 : 0,
            ':tax'   => Input::str('taxFile'),
            ':id2'   => $id,
        ]
    );
    Audit::log('donation', $id, 'update');
    Cache::flush();
    Response::ok();
}

// ── ผู้สนับสนุน / เพลง / ข้อความวิ่ง (โครงเหมือนกันหมด) ────────────────────

/** @return array{0:string,1:string,2:array<string,string>} table, pk, columns */
function scoped_meta(string $table): array
{
    return match ($table) {
        'sponsors' => ['sponsors', 'sponsor_id',
            ['name' => 'name', 'logoUrl' => 'logo_url', 'type' => 'sponsor_type']],
        'music_tracks' => ['music_tracks', 'track_id',
            ['name' => 'name', 'url' => 'url', 'type' => 'track_type']],
        default => ['ticker_messages', 'ticker_id',
            ['message' => 'message', 'isActive' => 'is_active']],
    };
}

function list_scoped(string $table): void
{
    [$tbl, $pk] = scoped_meta($table);
    $rows = Db::all("SELECT * FROM `$tbl` ORDER BY display_order, `$pk`");

    // frontend เดิมอ่าน type เป็น "Main::tournamentId" — ประกอบกลับให้เหมือนเดิม
    $out = array_map(static function (array $r) use ($table, $pk): array {
        $scope = $r['tournament_id'] ? '::' . $r['tournament_id'] : '';
        return match ($table) {
            'sponsors' => ['id' => $r[$pk], 'name' => $r['name'],
                           'logoUrl' => drive_img($r['logo_url']),
                           'type' => $r['sponsor_type'] . $scope],
            'music_tracks' => ['id' => $r[$pk], 'name' => $r['name'],
                               'url' => $r['url'], 'type' => $r['track_type'] . $scope],
            default => ['id' => $r[$pk], 'message' => $r['message'],
                        'isActive' => (bool) $r['is_active'], 'type' => 'ticker' . $scope],
        };
    }, $rows);

    $key = match ($table) {
        'sponsors' => 'sponsors', 'music_tracks' => 'tracks', default => 'messages',
    };
    Response::ok([$key => $out]);
}

function manage_scoped(string $table): void
{
    Auth::requireStaff();
    [$tbl, $pk, $cols] = scoped_meta($table);

    $sub = Input::str('subAction');
    $id = Input::str('id');

    if ($sub === 'delete') {
        if ($id === '') {
            Response::fail('ต้องระบุ id', 422);
        }
        Db::exec("DELETE FROM `$tbl` WHERE `$pk` = :id", [':id' => $id]);
        Audit::log($tbl, $id, 'delete');
        Cache::flush();
        Response::ok();
    }

    if ($sub === 'toggle' && $table === 'ticker_messages') {
        Db::exec("UPDATE `$tbl` SET is_active = 1 - is_active WHERE `$pk` = :id2",
            [':id2' => $id]);
        Cache::flush();
        Response::ok();
    }

    // type อาจมาเป็น "Main::tournamentId" — แยกออกเป็นคอลัมน์จริง
    [$type, $scope] = array_pad(explode('::', Input::str('type'), 2), 2, null);

    $data = [];
    foreach ($cols as $in => $col) {
        $v = Input::get($in, null);
        if ($v === null) {
            continue;
        }
        $data[$col] = $col === 'is_active' ? (!empty($v) ? 1 : 0) : (string) $v;
    }
    if ($type !== null && $type !== '' && isset($cols['type'])) {
        $data[$cols['type']] = $type;
    }

    if ($id === '') {
        $id = strtoupper(substr($table, 0, 3)) . '_' . (int) (microtime(true) * 1000);
        $data[$pk] = $id;
        $data['tournament_id'] = $scope ?: null;
        $fields = implode(', ', array_map(static fn($c) => "`$c`", array_keys($data)));
        $marks  = implode(', ', array_map(static fn($c) => ":$c", array_keys($data)));
        $params = [];
        foreach ($data as $c => $v) {
            $params[":$c"] = $v;
        }
        Db::exec("INSERT INTO `$tbl` ($fields) VALUES ($marks)", $params);
        Audit::log($tbl, $id, 'create');
    } else {
        if ($data === []) {
            Response::fail('ไม่มีค่าที่จะบันทึก', 422);
        }
        $sets = [];
        $params = [':pkid' => $id];
        foreach ($data as $c => $v) {
            $sets[] = "`$c` = :$c";
            $params[":$c"] = $v;
        }
        Db::exec("UPDATE `$tbl` SET " . implode(', ', $sets) . " WHERE `$pk` = :pkid", $params);
        Audit::log($tbl, $id, 'update');
    }

    Cache::flush();
    Response::ok(['id' => $id]);
}
