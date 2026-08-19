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
        'saveSettings'      => save_settings($cfg),
        // เงินบริจาค
        'verifyDonation'        => verify_donation(),
        'updateDonationDetails' => update_donation(),
        // จอแสดงผล
        'getSponsors'       => list_scoped('sponsors'),
        'manageSponsor'     => manage_scoped('sponsors', $cfg),
        'saveSponsorPaymentSettings' => save_sponsor_payment_settings($cfg),
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
                u.school_id, u.school_set_at, u.school_verified, s.school_name
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
        // ช่องทางเข้าระบบ — ไม่เคยส่งมาก่อน ฝั่งเว็บจึงขึ้นว่า "รหัสผ่าน" ให้ทุกคน
        // รวมถึงบัญชี LINE ล้วนที่ไม่มีรหัสผ่านเลย
        // ผู้ดูแล/เจ้าหน้าที่มีทั้งสองทางได้ ให้ถือว่าเข้าด้วยรหัสผ่านเป็นหลัก
        // เพราะนั่นคือทางที่ใช้เข้าหลังบ้าน
        'type'        => ($u['username'] !== null && $u['username'] !== '')
            ? 'credentials'
            : (($u['line_user_id'] !== null && $u['line_user_id'] !== '') ? 'line' : 'guest'),
        'lastLogin'   => $u['last_login_at'],
        'schoolId'    => $u['school_id'],
        'schoolName'  => $u['school_name'],
        // แยก "ยังไม่เคยถูกถาม" ออกจาก "เลือกแล้วว่าไม่สังกัดโรงเรียนใด"
        'schoolChosen' => $u['school_set_at'] !== null,
        // รับรองแล้ว = เข้าจัดการทีมของโรงเรียนได้โดยไม่ต้องกรอกรหัส 8 ตัว
        'schoolVerified' => (bool) $u['school_verified'],
        'mustChangePassword' => (bool) $u['must_change_password'],
    ], $rows)]);
}

function create_user(): void
{
    Auth::requireAdmin();

    $username = Input::require_str('username');
    $password = Input::str('password');
    $role = Input::str('role') ?: 'user';
    if (!in_array($role, ['admin', 'staff', 'referee', 'user'], true)) {
        $role = 'user';
    }
    if (in_array($role, ['admin', 'staff', 'referee'], true) && strlen($password) < 8) {
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
                            school_id, school_set_at, school_verified, school_verified_by)
         VALUES (:uid, :un2, :pw, :algo, :name, :role, :phone, :must,
                 :sid2, NOW(), :ver, :verby)',
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
            ':ver'   => $schoolId !== '' ? 1 : 0,
            ':verby' => $schoolId !== '' ? Auth::userId() : null,
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
    if (!in_array($role, ['admin', 'staff', 'referee', 'user'], true)) {
        $role = $before['role'];
    }
    // เลื่อนเป็นแอดมิน/สตาฟ ต้องมีรหัสผ่าน ไม่งั้นเข้าหลังบ้านไม่ได้เลย
    if (in_array($role, ['admin', 'staff', 'referee'], true)
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
            -- ผู้ดูแลเป็นคนผูกให้ = รับรองแล้ว เข้าจัดการทีมได้โดยไม่ต้องกรอกรหัส
            -- (ล้างโรงเรียนทิ้ง = ถอนการรับรองไปด้วย)
            school_verified = CASE WHEN :touch3 = 1
                THEN (CASE WHEN :sid3 IS NULL THEN 0 ELSE 1 END) ELSE school_verified END,
            school_verified_by = CASE WHEN :touch4 = 1 THEN :by ELSE school_verified_by END,
            password_hash = COALESCE(:pw, password_hash),
            must_change_password = CASE WHEN :pw2 IS NULL THEN must_change_password ELSE 1 END
          WHERE user_id = :uid2',
        [
            ':name'  => Input::str('displayName') ?: $before['display_name'],
            ':phone' => Input::str('phone'),
            ':role'  => $role,
            ':touch' => $touchSchool ? 1 : 0,
            ':touch2' => $touchSchool ? 1 : 0,
            ':touch3' => $touchSchool ? 1 : 0,
            ':touch4' => $touchSchool ? 1 : 0,
            ':sid2'  => ($schoolId ?? '') !== '' ? $schoolId : null,
            ':sid3'  => ($schoolId ?? '') !== '' ? $schoolId : null,
            ':by'    => Auth::userId(),
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
    if (!in_array($role, ['admin', 'staff', 'referee', 'user'], true)) {
        Response::fail('บทบาทไม่ถูกต้อง', 422);
    }
    $u = Db::one('SELECT role, password_hash FROM users WHERE user_id = :uid', [':uid' => $uid]);
    if ($u === null) {
        Response::fail('ไม่พบผู้ใช้นี้', 404);
    }
    if (in_array($role, ['admin', 'staff', 'referee'], true) && $u['password_hash'] === null) {
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

function save_settings(array $cfg = []): void
{
    Auth::requireAdmin();

    $settings = Input::arr('settings');
    if ($settings === []) {
        Response::fail('ไม่มีค่าที่จะบันทึก', 422);
    }

    // ค่าที่ห้ามส่งออกให้คนทั่วไป — ต้องตั้ง is_public=0 ตอนบันทึก
    $private = ['adminPin', 'lineChannelId'];

    /**
     * รูปที่ส่งมาเป็น data URL ให้เก็บเป็นไฟล์ก่อน แล้วบันทึกแค่ URL
     *
     * ⚠️ setting_value เป็น TEXT (65,535 ไบต์) — โลโก้ที่แปลงเป็น base64
     * มักเกินนั้น MySQL จึงตัดปลายทิ้งเงียบ ๆ ได้ data URL ที่ไม่สมบูรณ์
     * เบราว์เซอร์ฟ้อง ERR_INVALID_URL แล้วรูปหายโดยไม่มีใครรู้สาเหตุ
     *
     * หน้าเว็บอัปไฟล์แยกให้อยู่แล้ว ตรงนี้เป็นตาข่ายรองรับ client รุ่นเก่า
     * และทางเดินอื่นที่อาจยังส่ง base64 มา
     */
    foreach ($settings as $k => $v) {
        if (!is_string($v) || !str_starts_with($v, 'data:')) {
            continue;
        }
        try {
            $settings[$k] = store_data_url($v, 'logo', $cfg);
        } catch (Throwable $e) {
            Response::fail("บันทึกรูปของ $k ไม่สำเร็จ: " . $e->getMessage(), 422);
        }
    }

    Db::transaction(static function () use ($settings, $private): void {
        foreach ($settings as $k => $v) {
            if (is_array($v) || is_object($v)) {
                continue;
            }
            // กันค่าที่ยาวเกินคอลัมน์หลุดเข้าไปแล้วถูกตัดกลางทาง
            if (is_string($v) && strlen($v) > 60000) {
                Response::fail("ค่าของ $k ยาวเกินไป", 422);
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
    $before = Db::one(
        'SELECT status, amount, donor_name, line_user_id FROM donations
          WHERE donation_id = :id', [':id' => $id]);
    if ($before === null) {
        Response::fail('ไม่พบรายการบริจาคนี้', 404);
    }
    Db::exec('UPDATE donations SET status = :st WHERE donation_id = :id2',
        [':st' => $status, ':id2' => $id]);
    Audit::log('donation', $id, 'verify', $before, ['status' => $status]);
    Cache::flush();

    // บอกผู้บริจาคว่าสลิปผ่านหรือไม่ผ่าน
    //
    // เดิมผู้บริจาคโอนแล้วเงียบหายไปเลย ต้องเข้ามาดูหน้าเว็บเองว่ายอดขึ้นหรือยัง
    // ถ้าสลิปไม่ผ่าน (โอนไม่ครบ อ่านไม่ออก) ยิ่งต้องรู้ ไม่งั้นเข้าใจว่าบริจาคแล้ว
    //
    // หาเจ้าของจาก line_user_id ที่บันทึกไว้ตอนบริจาค ซึ่งมาจาก session จริง
    // คนที่บริจาคโดยไม่เข้าระบบจะไม่มีค่านี้ — ข้ามไป ไม่มีช่องทางแจ้ง
    $line = (string) ($before['line_user_id'] ?? '');
    if ($line !== '' && $status !== (string) $before['status']
        && in_array($status, ['Verified', 'Rejected'], true)) {
        $donorId = Db::value('SELECT user_id FROM users WHERE line_user_id = :line',
            [':line' => $line]);
        if ($donorId !== null) {
            $amt = number_format((float) $before['amount'], 2);
            if ($status === 'Verified') {
                PushNotifier::notify((string) $donorId, 'donation_verified',
                    'ยืนยันการบริจาคแล้ว',
                    'ขอบคุณสำหรับการสนับสนุน ' . $amt . ' บาท — ยอดของคุณถูกนับรวมแล้ว',
                    '/', ['donationId' => $id]);
            } else {
                PushNotifier::notify((string) $donorId, 'donation_rejected',
                    'สลิปบริจาคยังตรวจสอบไม่ผ่าน',
                    'ยอด ' . $amt . ' บาท — กรุณาติดต่อผู้จัดการแข่งขันเพื่อตรวจสอบ',
                    '/', ['donationId' => $id]);
            }
        }
    }

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
            ['name' => 'name', 'logoUrl' => 'logo_url', 'type' => 'sponsor_type',
             'contributionType' => 'contribution_type',
             'contributionAmount' => 'contribution_amount',
             'contributionDetail' => 'contribution_detail',
             'acknowledgementNo' => 'acknowledgement_no',
             'acknowledgementDate' => 'acknowledgement_date',
             'signerName' => 'signer_name', 'signerTitle' => 'signer_title',
             'signatureUrl' => 'signature_url']],
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
                           'type' => $r['sponsor_type'] . $scope,
                           'contributionType' => $r['contribution_type'],
                           'contributionAmount' => $r['contribution_amount'] === null
                               ? null : (float) $r['contribution_amount'],
                           'contributionDetail' => $r['contribution_detail'] ?? '',
                           'acknowledgementNo' => $r['acknowledgement_no'] ?? '',
                           'acknowledgementDate' => $r['acknowledgement_date'] ?? '',
                           'signerName' => $r['signer_name'] ?? '',
                           'signerTitle' => $r['signer_title'] ?? '',
                           'signatureUrl' => drive_img($r['signature_url'] ?? '')],
            'music_tracks' => ['id' => $r[$pk], 'name' => $r['name'],
                               'url' => $r['url'], 'type' => $r['track_type'] . $scope],
            default => ['id' => $r[$pk], 'message' => $r['message'],
                        'isActive' => (bool) $r['is_active'], 'type' => 'ticker' . $scope],
        };
    }, $rows);

    $key = match ($table) {
        'sponsors' => 'sponsors', 'music_tracks' => 'tracks', default => 'messages',
    };
    $payload = [$key => $out];
    if ($table === 'sponsors') {
        $tid = Input::str('tournamentId');
        $payload['canManage'] = $tid !== '' && can_manage_sponsors($tid);
        /**
         * สปอนเซอร์ส่วนกลาง (ไม่ผูกรายการ) แก้ได้เฉพาะเจ้าหน้าที่ส่วนกลาง
         *
         * แยกจาก canManage เพราะเจ้าภาพจัดการสปอนเซอร์ของรายการตัวเองได้
         * แต่ต้องไม่แก้สปอนเซอร์ที่ใช้ร่วมกันทุกรายการ — ฝั่ง server กันอยู่แล้ว
         * (manage_scoped อ่าน tournament_id ของแถวนั้นมาตรวจสิทธิ์ตาม scope จริง)
         * ค่านี้มีไว้ให้หน้าเว็บรู้ว่าควรโชว์ปุ่มให้ใคร ไม่ใช่ตัวบังคับสิทธิ์
         */
        $payload['canManageGlobal'] = can_manage_sponsors('');

        /**
         * ค่าตั้งต้นของใบอนุโมทนา — ดึงจากค่าตั้งเกียรติบัตรของรายการ (db/21-22)
         *
         * ก่อนหน้านี้หน้าเว็บลอกชื่อผู้ลงนามมาจากสปอนเซอร์รายก่อน ซึ่งพังทันที
         * ที่ออกใบแรกของงาน (ยังไม่มีใครให้ลอก) และได้ชื่อผิดถ้าใบเก่าลงนามคนละคน
         * จึงย้ายมาอ่านจากที่เดียวกับใบเกียรติบัตร — เจ้าภาพตั้งครั้งเดียวใช้ทุกใบ
         */
        if ($payload['canManage'] && $tid !== '') {
            $t = Db::one(
                'SELECT cert_signer_name, cert_signer_title, cert_signature_url,
                        cert_no_sponsor, cert_no_digits
                   FROM tournaments WHERE tournament_id = :tid', [':tid' => $tid]);
            $payload['signerDefaults'] = [
                'signerName'   => (string) ($t['cert_signer_name'] ?? ''),
                'signerTitle'  => (string) ($t['cert_signer_title'] ?? ''),
                'signatureUrl' => drive_img($t['cert_signature_url'] ?? ''),
                // ว่าง = เจ้าภาพยังไม่ตั้งรูปแบบ ให้พิมพ์เลขเองเหมือนเดิม
                'autoNumber'   => trim((string) ($t['cert_no_sponsor'] ?? '')) !== '',
            ];
        }
    }
    Response::ok($payload);
}

/** เจ้าภาพ ผู้ดูแลรายการ หรือเจ้าหน้าที่ส่วนกลางจัดการสปอนเซอร์ของรายการได้ */
function can_manage_sponsors(?string $tournamentId): bool
{
    $tid = trim((string) $tournamentId);
    if ($tid === '') {
        return Auth::isAdmin() || Auth::isStaff();
    }
    if (Auth::isAdmin() || Auth::isStaff() || Perm::managesTournament($tid)) {
        return true;
    }

    // บัญชีโรงเรียนที่ได้รับการรับรองอาจเปิดหน้านี้จาก user session โดยยังไม่ได้
    // แลกรหัสโรงเรียนเป็น team session จึงตรวจได้ทั้งสองแหล่ง
    $schoolId = Auth::schoolId();
    if ($schoolId === null && Auth::userId() !== null) {
        $schoolId = Db::value(
            'SELECT school_id FROM users
              WHERE user_id = :uid AND school_verified = 1',
            [':uid' => Auth::userId()]
        );
        $schoolId = $schoolId === null ? null : (string) $schoolId;
    }
    if ($schoolId !== null) {
        $isHost = Db::value(
            'SELECT 1 FROM tournaments
              WHERE tournament_id = :tid AND host_school_id = :sid',
            [':tid' => $tid, ':sid' => $schoolId]
        ) !== null;
        if ($isHost) {
            return true;
        }
    }

    return false;
}

function require_sponsor_manager(?string $tournamentId): void
{
    if (can_manage_sponsors($tournamentId)) {
        return;
    }
    Response::fail('เฉพาะเจ้าภาพหรือผู้ดูแลรายการเท่านั้นที่จัดการสปอนเซอร์ได้', 403);
}

/**
 * บัญชี/QR สำหรับรับเงิน โดยรายการที่แจ้งโอนยังเข้าตาราง donations เดิม
 *
 * รับได้สองกระเป๋าผ่าน purpose เดียวกัน เพื่อให้เจ้าภาพตั้งค่าที่เดียวจบ:
 *   sponsor — เงินผู้สนับสนุนการจัดแข่งขัน (ปุ่มบนหน้า Sponsors / ตารางคะแนน)
 *   project — เงินร่วมโครงการพัฒนาโรงเรียน (ปุ่มในการ์ดโครงการหน้าแรก)
 *             มักเข้าบัญชีสถานศึกษาโดยตรง ไม่ปนกับเงินจัดงาน
 */
function save_sponsor_payment_settings(array $cfg): void
{
    $tid = Input::require_str('tournamentId');
    require_sponsor_manager($tid);
    $tournament = Db::one(
        'SELECT bank_account FROM tournaments WHERE tournament_id = :id', [':id' => $tid]
    );
    if ($tournament === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }

    $purpose = Input::str('purpose') === 'project' ? 'project' : 'sponsor';

    $useExisting = Input::bool('useExistingAccount');
    // กระเป๋าโครงการไม่มีสวิตช์เปิด/ปิดของตัวเอง — คุมด้วย objective.isEnabled อยู่แล้ว
    $enabled = $purpose === 'project' ? true : Input::bool('enabled');
    $bankName = trim(Input::str('bankName'));
    $bankAccount = trim(Input::str('bankAccount'));
    $accountName = trim(Input::str('accountName'));
    $qrUrl = Input::str('qrUrl');
    if (Input::get('qrFile', null) !== null) {
        try {
            $qrUrl = store_data_url(Input::str('qrFile'), "$purpose-qr", $cfg);
        } catch (Throwable $e) {
            Response::fail('อัปโหลด QR Code ไม่สำเร็จ: ' . $e->getMessage(), 422);
        }
    }
    if ($enabled && !$useExisting && $bankAccount === '' && $qrUrl === '') {
        Response::fail('กรุณาระบุเลขบัญชีหรือแนบ QR Code อย่างน้อยหนึ่งรายการ', 422);
    }
    if ($enabled && $useExisting && trim((string) $tournament['bank_account']) === '' && $qrUrl === '') {
        Response::fail('บัญชีเดิมของรายการยังไม่มีเลขบัญชี กรุณาแนบ QR Code หรือเลือกกำหนดบัญชีใหม่', 422);
    }

    if ($purpose === 'project') {
        Db::exec(
            'UPDATE tournaments SET
                project_donation_use_existing = :existing,
                project_donation_qr_url = :qr,
                project_bank_name = :bank, project_bank_account = :account,
                project_account_name = :account_name
              WHERE tournament_id = :id',
            [
                ':existing' => $useExisting ? 1 : 0, ':qr' => $qrUrl,
                ':bank' => $bankName, ':account' => $bankAccount,
                ':account_name' => $accountName, ':id' => $tid,
            ]
        );
    } else {
        Db::exec(
            'UPDATE tournaments SET sponsor_donation_enabled = :enabled,
                sponsor_donation_use_existing = :existing,
                sponsor_donation_qr_url = :qr,
                sponsor_bank_name = :bank, sponsor_bank_account = :account,
                sponsor_account_name = :account_name
              WHERE tournament_id = :id',
            [
                ':enabled' => $enabled ? 1 : 0, ':existing' => $useExisting ? 1 : 0,
                ':qr' => $qrUrl, ':bank' => $bankName, ':account' => $bankAccount,
                ':account_name' => $accountName, ':id' => $tid,
            ]
        );
    }
    Audit::log('tournament', $tid, "{$purpose}_payment_settings");
    Cache::flush();
    Response::ok();
}

function manage_scoped(string $table, array $cfg = []): void
{
    [$tbl, $pk, $cols] = scoped_meta($table);

    $sub = Input::str('subAction');
    $id = Input::str('id');

    // type อาจมาเป็น "Main::tournamentId" — แยกออกเป็นคอลัมน์จริง
    [$type, $scope] = array_pad(explode('::', Input::str('type'), 2), 2, null);

    if ($table === 'sponsors') {
        $targetScope = $scope;
        if ($id !== '') {
            $existingScope = Db::one(
                "SELECT tournament_id FROM `$tbl` WHERE `$pk` = :scope_id",
                [':scope_id' => $id]
            );
            if ($existingScope === null) {
                Response::fail('ไม่พบสปอนเซอร์นี้', 404);
            }
            $targetScope = $existingScope['tournament_id'];
        }
        require_sponsor_manager($targetScope);
    } else {
        Auth::requireStaff();
    }

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

    $data = [];
    foreach ($cols as $in => $col) {
        if ($table === 'sponsors' && in_array($in, ['logoUrl', 'signatureUrl'], true)) {
            continue; // จัดการไฟล์และ URL ผ่านตัวตรวจไฟล์ด้านล่าง
        }
        $v = Input::get($in, null);
        if ($v === null) {
            continue;
        }
        $data[$col] = $col === 'is_active' ? (!empty($v) ? 1 : 0) : (string) $v;
    }
    if ($type !== null && $type !== '' && isset($cols['type'])) {
        $data[$cols['type']] = $type;
    }
    if ($table === 'sponsors') {
        if (isset($data['sponsor_type']) && !in_array($data['sponsor_type'], ['Main', 'Support'], true)) {
            Response::fail('ประเภทสปอนเซอร์ไม่ถูกต้อง', 422);
        }
        if (isset($data['contribution_type'])
            && !in_array($data['contribution_type'], ['Money', 'Goods', 'Unspecified'], true)) {
            Response::fail('รูปแบบการสนับสนุนไม่ถูกต้อง', 422);
        }
        if (array_key_exists('contribution_amount', $data)) {
            $rawAmount = trim((string) $data['contribution_amount']);
            if ($rawAmount === '') {
                $data['contribution_amount'] = null;
            } elseif (!is_numeric($rawAmount) || (float) $rawAmount < 0) {
                Response::fail('จำนวนเงินหรือมูลค่าต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป', 422);
            } else {
                $data['contribution_amount'] = number_format((float) $rawAmount, 2, '.', '');
            }
        }
        if (array_key_exists('acknowledgement_date', $data)
            && trim((string) $data['acknowledgement_date']) === '') {
            $data['acknowledgement_date'] = null;
        }
    }
    if ($table === 'sponsors'
        && (Input::get('logoFile', null) !== null || Input::get('logoUrl', null) !== null)) {
        try {
            $data['logo_url'] = store_data_url(
                Input::str('logoFile') ?: Input::str('logoUrl'), 'sponsor', $cfg
            );
        } catch (Throwable $e) {
            Response::fail('อัปโหลดโลโก้ไม่สำเร็จ: ' . $e->getMessage(), 422);
        }
    }
    if ($table === 'sponsors'
        && (Input::get('signatureFile', null) !== null || Input::get('signatureUrl', null) !== null)) {
        try {
            $data['signature_url'] = store_data_url(
                Input::str('signatureFile') ?: Input::str('signatureUrl'), 'signature', $cfg
            );
        } catch (Throwable $e) {
            Response::fail('อัปโหลดลายเซ็นไม่สำเร็จ: ' . $e->getMessage(), 422);
        }
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
