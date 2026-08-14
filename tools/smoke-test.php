<?php
declare(strict_types=1);

/**
 * Smoke test — ยิง API จริงตามลำดับงานที่เกิดขึ้นจริง
 *
 * ทำไมต้องมี: บั๊ก `iso()` (ทีมหายจากหน้า /school หลังเจ้าภาพยืนยันสลิป) รอดขึ้น
 * production ไปได้ เพราะไม่มีอะไรเคยเรียก myTeams *หลัง* ยืนยันสลิปเลยสักครั้ง
 * schema test (db/02-smoke-test.sql) จับไม่ได้ เพราะเป็นบั๊กใน PHP ไม่ใช่ใน schema
 *
 * วิธีใช้:
 *   1. เตรียมฐานข้อมูลเปล่า + รัน db/01..10 ให้ครบ
 *   2. ตั้ง api/config.local.php ให้ชี้ฐานนั้น (อย่าชี้ฐานจริง — สคริปต์นี้เขียนข้อมูล)
 *   3. php -S localhost:8788 -t .   (จาก root ของโปรเจกต์)
 *   4. php tools/smoke-test.php
 *
 * ออกด้วย exit code 1 ถ้ามีข้อไหนไม่ผ่าน — เอาไปต่อ CI ได้ทันที
 */

const BASE = 'http://localhost:8788/api/index.php';

$pass = 0;
$fail = 0;
$ctx  = [];      // ค่าที่ส่งต่อระหว่างขั้น เช่น token, teamId

function req(string $action, array $body = [], ?string $token = null, string $method = 'POST'): array
{
    $url = BASE . '?action=' . rawurlencode($action);
    $ch = curl_init();
    $headers = ['Accept: application/json'];
    if ($token !== null) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    if ($method === 'GET') {
        if ($body !== []) {
            $url .= '&' . http_build_query($body);
        }
    } else {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    }
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
    ]);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        return ['_http' => 0, '_raw' => $err, 'status' => 'error', 'message' => $err];
    }
    $json = json_decode((string) $raw, true);
    if (!is_array($json)) {
        // ตรงนี้สำคัญ: fatal error ของ PHP จะออกมาเป็น HTML ไม่ใช่ JSON
        // ถ้าไม่ดักไว้ จะเห็นแค่ "ทีมหาย" โดยไม่รู้ว่าเซิร์ฟเวอร์พังตั้งแต่แรก
        return ['_http' => $code, '_raw' => substr((string) $raw, 0, 400),
                'status' => 'error', 'message' => 'ตอบกลับไม่ใช่ JSON'];
    }
    $json['_http'] = $code;
    $json['_raw'] = $raw;
    return $json;
}

function check(string $name, bool $ok, string $detail = ''): void
{
    global $pass, $fail;
    if ($ok) {
        $pass++;
        echo "  PASS  $name\n";
        return;
    }
    $fail++;
    echo "  FAIL  $name" . ($detail !== '' ? "\n        $detail" : '') . "\n";
}

function head(string $t): void { echo "\n== $t ==\n"; }

// ─────────────────────────────────────────────────────────────────────────
head('0. เซิร์ฟเวอร์ตอบไหม');

$r = req('health', [], null, 'GET');
if ($r['_http'] === 0) {
    echo "  ต่อ $BASE ไม่ได้ — เปิด php -S localhost:8788 -t . ก่อน\n";
    exit(1);
}
check('health ตอบเป็น JSON', isset($r['checks']), substr((string) ($r['_raw'] ?? ''), 0, 200));
foreach (($r['checks'] ?? []) as $c) {
    if (($c['required'] ?? true) && !$c['ok']) {
        // เวอร์ชัน PHP เป็นเรื่องของเครื่องที่รันเทสต์ ไม่ใช่บั๊กในโค้ด
        // (XAMPP ในเครื่องเป็น 8.0 ส่วนโฮสต์จริงเป็น 8.3) แจ้งไว้เฉย ๆ ไม่นับว่าไม่ผ่าน
        if ($c['name'] === 'php_version') {
            echo "  NOTE  php ในเครื่องนี้เป็น " . ($c['detail'] ?? '?') . " (โฮสต์จริง 8.3)
";
            continue;
        }
        check('health: ' . $c['name'], false, $c['detail'] ?? '');
    }
}

// ─────────────────────────────────────────────────────────────────────────
head('1. เตรียมข้อมูลตั้งต้น');

$db = require __DIR__ . '/../api/config.local.php';
$pdo = new PDO(
    "mysql:host={$db['db']['host']};dbname={$db['db']['name']};charset=utf8mb4",
    $db['db']['user'], $db['db']['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$stamp = (string) time();
$tid = "T_SMOKE_$stamp";
$sid = "S_SMOKE_$stamp";
$teamId = "TM_SMOKE_$stamp";
$adminId = "U_SMOKE_$stamp";
$code = 'SMOKE' . substr($stamp, -3);

$pdo->prepare("INSERT INTO tournaments
    (tournament_id, name, type, status, team_editing_enabled, players_per_team, max_subs,
     max_teams_per_school, registration_enabled)
    VALUES (?, 'สมโภชน์ทดสอบ', 'Penalty', 'Active', 1, 7, 3, 2, 1)")->execute([$tid]);

$pdo->prepare("INSERT INTO schools (school_id, school_name, is_active, access_code_hash)
    VALUES (?, 'โรงเรียนทดสอบควัน', 1, ?)")
    ->execute([$sid, password_hash($code, PASSWORD_DEFAULT)]);

$pdo->prepare("INSERT INTO teams (team_id, tournament_id, school_id, name, status)
    VALUES (?, ?, ?, 'ทีมทดสอบควัน', 'Draft')")->execute([$teamId, $tid, $sid]);

$pdo->prepare("INSERT INTO users (user_id, username, password_hash, display_name, role)
    VALUES (?, ?, ?, 'แอดมินทดสอบ', 'admin')")
    ->execute([$adminId, "smoke_$stamp", password_hash('smoke-pass-1234', PASSWORD_DEFAULT)]);

echo "  tournament=$tid team=$teamId code=$code\n";

// ─────────────────────────────────────────────────────────────────────────
head('2. โรงเรียนเข้าระบบด้วยรหัส');

$r = req('teamLogin', ['accessCode' => $code, 'tournamentId' => $tid]);
check('teamLogin สำเร็จ', ($r['ok'] ?? false) === true, $r['message'] ?? '');
$teamToken = $r['data']['token'] ?? $r['token'] ?? null;
check('ได้ token กลับมา', is_string($teamToken) && $teamToken !== '');
if ($teamToken === null) { echo "\nหยุด — ไม่มี token ทำต่อไม่ได้\n"; exit(1); }

$r = req('myTeams', [], $teamToken, 'GET');
check('myTeams เห็นทีมของตัวเอง',
    count($r['data']['teams'] ?? $r['teams'] ?? []) === 1,
    substr((string) $r['_raw'], 0, 250));

// ─────────────────────────────────────────────────────────────────────────
head('3. กรอกรายชื่อแล้วส่ง');

$roster = [
    ['name' => 'เด็กชายหนึ่ง สมมติ', 'number' => '7',  'birthDate' => '2013-05-01', 'photoUrl' => ''],
    ['name' => 'เด็กชายสอง สมมติ', 'number' => '9',  'birthDate' => '2013-06-02', 'photoUrl' => ''],
    ['name' => 'เด็กชายสาม สมมติ', 'number' => '11', 'birthDate' => '2013-07-03', 'photoUrl' => ''],
];
$r = req('saveTeam', ['teamId' => $teamId, 'name' => 'ทีมทดสอบควัน', 'players' => $roster], $teamToken);
check('saveTeam สำเร็จ', ($r['ok'] ?? false) === true, $r['message'] ?? '');

$r = req('submitTeam', ['teamId' => $teamId], $teamToken);
check('submitTeam สำเร็จ', ($r['ok'] ?? false) === true,
    'HTTP ' . ($r['_http'] ?? '?') . ' ' . ($r['message'] ?? '') . ' ' . substr((string) $r['_raw'], 0, 200));

$ids1 = $pdo->query("SELECT player_id, name, shirt_number FROM players
                      WHERE team_id = " . $pdo->quote($teamId) . " ORDER BY display_order")
            ->fetchAll(PDO::FETCH_ASSOC);
check('บันทึกผู้เล่นครบ 3 คน', count($ids1) === 3, 'ได้ ' . count($ids1));

// ─────────────────────────────────────────────────────────────────────────
head('4. แอดมินอนุมัติทีมและยืนยันสลิป');

$r = req('auth', ['authType' => 'login', 'username' => "smoke_$stamp", 'password' => 'smoke-pass-1234']);
$adminToken = $r['data']['token'] ?? $r['token'] ?? null;
check('แอดมินเข้าระบบได้', is_string($adminToken), $r['message'] ?? '');

$r = req('updatePlayerLineup', [
    'teamId' => $teamId,
    'playerId' => $ids1[0]['player_id'],
    'number' => (string) $ids1[0]['shirt_number'],
    'position' => 'GK',
], $adminToken);
check('กรรมการแก้เบอร์และตำแหน่งจากหน้า Lineup ได้', ($r['ok'] ?? false) === true, $r['message'] ?? '');
$savedPosition = $pdo->query("SELECT position FROM players WHERE player_id = " . $pdo->quote($ids1[0]['player_id']))
    ->fetchColumn();
check('ตำแหน่ง Lineup บันทึกเป็นรหัสมาตรฐาน', $savedPosition === 'GK', (string) $savedPosition);

$r = req('reviewTeam', ['teamId' => $teamId, 'decision' => 'approve'], $adminToken);
check('อนุมัติทีมได้', ($r['ok'] ?? false) === true,
    'HTTP ' . ($r['_http'] ?? '?') . ' ' . ($r['message'] ?? '') . ' ' . substr((string) $r['_raw'], 0, 200));

// จุดที่เคยพัง: ยืนยันสลิปทำให้ payment_reviewed_at ไม่เป็น NULL
// แล้ว team_payload() เรียก iso() ที่ไม่มีตัวตน -> fatal -> myTeams ตอบ HTML
$pdo->prepare("UPDATE teams SET slip_url = '/x.jpg' WHERE team_id = ?")->execute([$teamId]);
$r = req('reviewRegistrationPayment',
    ['teamId' => $teamId, 'decision' => 'verify'], $adminToken);
check('ยืนยันสลิปค่าสมัครได้', ($r['ok'] ?? false) === true, $r['message'] ?? '');

// ผู้ดูแลต้องยืนยันยอดที่รับเงินสด/แจ้งกันนอกระบบได้ แม้ไม่มีไฟล์สลิป
$r = req('reviewRegistrationPayment',
    ['teamId' => $teamId, 'decision' => 'reset'], $adminToken);
check('คืนสถานะก่อนทดสอบยอดนอกระบบได้', ($r['ok'] ?? false) === true, $r['message'] ?? '');
$pdo->prepare("UPDATE teams SET slip_url = '' WHERE team_id = ?")->execute([$teamId]);
$r = req('reviewRegistrationPayment', [
    'teamId' => $teamId,
    'decision' => 'verify_manual',
    'note' => 'รับเงินสดโดยครูผู้ประสานงาน',
], $adminToken);
check('ยืนยันชำระนอกระบบโดยไม่มีสลิปได้', ($r['ok'] ?? false) === true, $r['message'] ?? '');
$manualPayment = $pdo->query("SELECT payment_status, payment_note FROM teams WHERE team_id = " . $pdo->quote($teamId))
    ->fetch(PDO::FETCH_ASSOC);
check('ยอดนอกระบบนับเป็นจ่ายแล้วและมีหมายเหตุ',
    ($manualPayment['payment_status'] ?? '') === 'Verified'
        && str_contains((string) ($manualPayment['payment_note'] ?? ''), 'ชำระนอกระบบ'),
    (string) json_encode($manualPayment, JSON_UNESCAPED_UNICODE));

// ─────────────────────────────────────────────────────────────────────────
head('5. โรงเรียนกลับมาดูทีมหลังยืนยันการชำระ  ← บั๊ก iso() อยู่ตรงนี้');

$r = req('myTeams', [], $teamToken, 'GET');
check('myTeams ยังตอบเป็น JSON (ไม่ fatal)',
    ($r['message'] ?? '') !== 'ตอบกลับไม่ใช่ JSON', substr((string) $r['_raw'], 0, 300));
$teams = $r['data']['teams'] ?? $r['teams'] ?? [];
check('ทีมยังแสดงอยู่หลังอนุมัติ+ยืนยันสลิป', count($teams) === 1,
    'เห็น ' . count($teams) . ' ทีม');
check('สถานะเป็น Approved', ($teams[0]['status'] ?? '') === 'Approved',
    (string) ($teams[0]['status'] ?? '-'));

// ─────────────────────────────────────────────────────────────────────────
head('6. เปลี่ยนตัวหลังอนุมัติ — ต้องคง player_id เดิม');

// รายงานตัวไว้ก่อน เพื่อดูว่าการแก้รายชื่อล้างผลทิ้งหรือเปล่า
foreach ($ids1 as $p) {
    $pdo->prepare("INSERT INTO player_checkins (tournament_id, team_id, player_id, status)
                   VALUES (?, ?, ?, 'present')")
        ->execute([$tid, $teamId, $p['player_id']]);
}

$sent = array_map(static fn(array $p, array $orig): array => [
    'id' => $p['player_id'],
    'name' => $orig['name'],
    'number' => $orig['number'],
    'birthDate' => $orig['birthDate'],
    'photoUrl' => '',
], $ids1, $roster);
// สลับเบอร์เสื้อสองคน (7 <-> 9) — เคสที่ทำให้ uq_player_shirt ชนกลางคัน
$sent[0]['number'] = '9';
$sent[1]['number'] = '7';
// คนที่สามออก มีคนใหม่เข้าแทน
array_pop($sent);
$sent[] = ['name' => 'เด็กชายสี่ สำรอง', 'number' => '11', 'birthDate' => '2013-08-04', 'photoUrl' => ''];

$r = req('saveTeam', ['teamId' => $teamId, 'name' => 'ทีมทดสอบควัน', 'players' => $sent], $teamToken);
check('แก้รายชื่อ+สลับเบอร์เสื้อได้', ($r['ok'] ?? false) === true, $r['message'] ?? '');

$ids2 = $pdo->query("SELECT player_id, name, shirt_number FROM players
                      WHERE team_id = " . $pdo->quote($teamId) . " ORDER BY display_order")
            ->fetchAll(PDO::FETCH_ASSOC);
check('ยังมีผู้เล่น 3 คน', count($ids2) === 3, 'ได้ ' . count($ids2));

$kept = array_intersect(array_column($ids1, 'player_id'), array_column($ids2, 'player_id'));
check('คนเดิมสองคนคง player_id ไว้', count($kept) === 2,
    'คงไว้ ' . count($kept) . ' จาก 2');

$nums = [];
foreach ($ids2 as $p) { $nums[$p['name']] = $p['shirt_number']; }
check('เบอร์เสื้อสลับกันถูกต้อง',
    ($nums['เด็กชายหนึ่ง สมมติ'] ?? '') === '9' && ($nums['เด็กชายสอง สมมติ'] ?? '') === '7',
    json_encode($nums, JSON_UNESCAPED_UNICODE));

$checkins = (int) $pdo->query("SELECT COUNT(*) FROM player_checkins
                                WHERE team_id = " . $pdo->quote($teamId))->fetchColumn();
check('ผลรายงานตัวของคนเดิมไม่หาย', $checkins === 2, "เหลือ $checkins แถว (ควรเป็น 2)");

$r = req('myTeams', [], $teamToken, 'GET');
$teams = $r['data']['teams'] ?? $r['teams'] ?? [];
check('แก้หลังอนุมัติแล้วสถานะกลับไปรอตรวจ',
    ($teams[0]['status'] ?? '') === 'Submitted', (string) ($teams[0]['status'] ?? '-'));

// ─────────────────────────────────────────────────────────────────────────
head('7. หน้ารายงานตัวของเจ้าภาพ');

$pdo->prepare("UPDATE teams SET status = 'Approved' WHERE team_id = ?")->execute([$teamId]);
$r = req('checkinTeams', ['tournamentId' => $tid], $adminToken, 'GET');
$rows = $r['data']['teams'] ?? $r['teams'] ?? [];
check('checkinTeams เห็นทีมที่อนุมัติ', count($rows) === 1, substr((string) $r['_raw'], 0, 250));

$r = req('checkinTeam', ['teamId' => $teamId], $adminToken, 'GET');
check('checkinTeam คืนรายชื่อครบ',
    count($r['data']['players'] ?? $r['players'] ?? []) === 3,
    substr((string) $r['_raw'], 0, 250));

$r = req('checkinTeams', ['tournamentId' => $tid], $teamToken, 'GET');
check('โรงเรียนเปิดหน้ารายงานตัวไม่ได้', ($r['_http'] ?? 0) === 401 || ($r['_http'] ?? 0) === 403,
    'ได้ HTTP ' . ($r['_http'] ?? '?'));

// ─────────────────────────────────────────────────────────────────────────
head('8. ตัวตนต้องมาจาก token ไม่ใช่ body');

$victim = "U_VICTIM_$stamp";
$pdo->prepare("INSERT INTO users (user_id, display_name, role) VALUES (?, 'เหยื่อ', 'user')")
    ->execute([$victim]);

$r = req('submitPrediction',
    ['matchId' => 'M_NOPE', 'userId' => $victim, 'prediction' => 'A']);
check('ทายผลโดยไม่เข้าระบบไม่ได้', ($r['_http'] ?? 0) === 401,
    'ได้ HTTP ' . ($r['_http'] ?? '?') . ' ' . ($r['message'] ?? ''));

$before = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
$r = req('toggleEntryLike', ['entryId' => 'CE_NOPE', 'userId' => "U_GHOST_$stamp",
    'lineUserId' => 'Ufake_line_id']);
check('กดไลก์โดยไม่เข้าระบบไม่ได้', ($r['_http'] ?? 0) === 401,
    'ได้ HTTP ' . ($r['_http'] ?? '?'));
$after = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
check('ไม่มีผู้ใช้ถูกสร้างจากข้อมูลที่ client ส่ง', $after === $before,
    "ก่อน $before หลัง $after");

// ─────────────────────────────────────────────────────────────────────────
head('8.5 เลขเสื้อซ้ำต้องถูกปฏิเสธ');

$dup = [
    ['name' => 'คนหนึ่ง', 'number' => '5', 'birthDate' => '', 'photoUrl' => ''],
    ['name' => 'คนสอง',  'number' => '5', 'birthDate' => '', 'photoUrl' => ''],
];
$r = req('saveTeam', ['teamId' => $teamId, 'name' => 'ทีมทดสอบควัน', 'players' => $dup], $teamToken);
check('เลขเสื้อซ้ำถูกปฏิเสธ', ($r['_http'] ?? 0) === 422,
    'ได้ HTTP ' . ($r['_http'] ?? '?') . ' ' . ($r['message'] ?? ''));

$still = (int) $pdo->query("SELECT COUNT(*) FROM players
                             WHERE team_id = " . $pdo->quote($teamId))->fetchColumn();
check('รายชื่อเดิมไม่ถูกแตะเมื่อถูกปฏิเสธ', $still === 3, "เหลือ $still คน (ควรเป็น 3)");

// ─────────────────────────────────────────────────────────────────────────
head('8.6 บริจาคแล้วผู้ดูแลต้องได้รับแจ้งเตือน');

$before = (int) $pdo->query("SELECT COUNT(*) FROM notifications
                              WHERE user_id = " . $pdo->quote($adminId))->fetchColumn();

$r = req('submitDonation', [
    'tournamentId' => $tid, 'amount' => 250, 'donorName' => 'ผู้ใจดีทดสอบ',
    'phone' => '0800000000', 'isAnonymous' => false,
    'slipFile' => 'data:image/png;base64,'
        . base64_encode(hex2bin('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
            . '1f15c4890000000a49444154789c6360000002000100' . '05fe02fe') ?: ''),
]);
check('บันทึกการบริจาคได้', ($r['ok'] ?? false) === true,
    'HTTP ' . ($r['_http'] ?? '?') . ' ' . ($r['message'] ?? ''));
$donationId = $r['donationId'] ?? null;

$after = (int) $pdo->query("SELECT COUNT(*) FROM notifications
                             WHERE user_id = " . $pdo->quote($adminId))->fetchColumn();
check('ผู้ดูแลได้รับแจ้งเตือนการบริจาค', $after === $before + 1, "ก่อน $before หลัง $after");
check('ชนิดแจ้งเตือนเป็น donation_received',
    (string) $pdo->query("SELECT type FROM notifications
                           WHERE user_id = " . $pdo->quote($adminId) . "
                           ORDER BY created_at DESC LIMIT 1")->fetchColumn() === 'donation_received');

// ผู้บริจาคที่เข้าระบบอยู่ต้องได้รับแจ้งเตือนตอนสลิปผ่าน
if ($donationId !== null) {
    $pdo->prepare("UPDATE users SET line_user_id = ? WHERE user_id = ?")
        ->execute(["Uline_$stamp", $adminId]);
    $pdo->prepare("UPDATE donations SET line_user_id = ? WHERE donation_id = ?")
        ->execute(["Uline_$stamp", $donationId]);

    $b2 = (int) $pdo->query("SELECT COUNT(*) FROM notifications
                              WHERE user_id = " . $pdo->quote($adminId) . "
                                AND type = 'donation_verified'")->fetchColumn();
    $r = req('verifyDonation', ['donationId' => $donationId, 'status' => 'Verified'], $adminToken);
    check('ยืนยันการบริจาคได้', ($r['ok'] ?? false) === true, $r['message'] ?? '');
    $a2 = (int) $pdo->query("SELECT COUNT(*) FROM notifications
                              WHERE user_id = " . $pdo->quote($adminId) . "
                                AND type = 'donation_verified'")->fetchColumn();
    check('ผู้บริจาคได้รับแจ้งเตือนว่าสลิปผ่าน', $a2 === $b2 + 1, "ก่อน $b2 หลัง $a2");
}

// ─────────────────────────────────────────────────────────────────────────
head('8.7 รายงานตัวทั้งรายการรวดเดียว');

$pdo->exec("DELETE FROM player_checkins WHERE team_id = " . $pdo->quote($teamId));
// กดไว้ก่อนหนึ่งคนว่า "ไม่มา" — ปุ่มรวดเดียวต้องไม่ทับผลที่ตั้งใจกด
$one = (string) $pdo->query("SELECT player_id FROM players
                              WHERE team_id = " . $pdo->quote($teamId) . " LIMIT 1")->fetchColumn();
$pdo->prepare("INSERT INTO player_checkins (tournament_id, team_id, player_id, status)
               VALUES (?, ?, ?, 'absent')")->execute([$tid, $teamId, $one]);

$r = req('checkinAllBulk', ['tournamentId' => $tid, 'status' => 'present'], $adminToken);
check('เรียก checkinAllBulk ได้', ($r['ok'] ?? false) === true,
    'HTTP ' . ($r['_http'] ?? '?') . ' ' . ($r['message'] ?? ''));
check('เขียนเฉพาะคนที่ยังไม่ได้เช็ก', ($r['affected'] ?? -1) === 2,
    'affected = ' . ($r['affected'] ?? '?') . ' (ควรเป็น 2)');

$absent = (int) $pdo->query("SELECT COUNT(*) FROM player_checkins
                              WHERE team_id = " . $pdo->quote($teamId) . "
                                AND status = 'absent'")->fetchColumn();
check('ผลที่กรรมการกดไว้ไม่ถูกทับ', $absent === 1, "เหลือ absent $absent แถว");

$r = req('checkinAllBulk', ['tournamentId' => $tid, 'status' => 'present'], $teamToken);
check('โรงเรียนกดปุ่มนี้ไม่ได้', in_array(($r['_http'] ?? 0), [401, 403], true),
    'ได้ HTTP ' . ($r['_http'] ?? '?'));

// ─────────────────────────────────────────────────────────────────────────
head('8.8 บันทึกซ้ำหลายรอบ (จำลองการบันทึกอัตโนมัติ)');

// ที่ครูเจอบนของจริง: บันทึกครั้งแรกผ่าน ครั้งที่สองเป็นต้นไปตอบ 409
// เพราะ row_version เดินไปแล้วแต่ฝั่งเว็บยังถือเลขเดิม
$rv = (int) $pdo->query("SELECT row_version FROM teams
                          WHERE team_id = " . $pdo->quote($teamId))->fetchColumn();
$body = ['teamId' => $teamId, 'name' => 'ทีมทดสอบควัน', 'rowVersion' => $rv, 'players' => [
    ['name' => 'คนบันทึกซ้ำ', 'number' => '21', 'birthDate' => '', 'photoUrl' => ''],
]];

$r1 = req('saveTeam', $body, $teamToken);
check('บันทึกรอบแรกผ่าน', ($r1['ok'] ?? false) === true, $r1['message'] ?? '');
$rv2 = $r1['team']['rowVersion'] ?? null;
check('ตอบ rowVersion ใหม่กลับมาให้', is_int($rv2) && $rv2 > $rv,
    'ได้ ' . var_export($rv2, true) . ' จากเดิม ' . $rv);

// ส่งด้วยเลขเก่าซ้ำ -> ต้องได้ 409 พร้อมบอกเลขปัจจุบัน เพื่อให้ฝั่งเว็บส่งซ้ำเองได้
$r2 = req('saveTeam', $body, $teamToken);
check('ส่งด้วยเลขเก่าได้ 409', ($r2['_http'] ?? 0) === 409, 'ได้ HTTP ' . ($r2['_http'] ?? '?'));
check('409 บอก currentRowVersion มาด้วย', isset($r2['currentRowVersion']),
    substr((string) $r2['_raw'], 0, 200));

// ใช้เลขที่ server บอกมาแล้วส่งใหม่ = ทางที่ฝั่งเว็บทำอัตโนมัติ
$r3 = req('saveTeam', ['teamId' => $teamId, 'name' => 'ทีมทดสอบควัน',
    'rowVersion' => $r2['currentRowVersion'] ?? 0, 'players' => $body['players']], $teamToken);
check('ส่งซ้ำด้วยเลขที่ได้มาแล้วผ่าน', ($r3['ok'] ?? false) === true,
    'HTTP ' . ($r3['_http'] ?? '?') . ' ' . ($r3['message'] ?? ''));

// ไม่ส่ง rowVersion เลยต้องบันทึกได้ตลอด (ทางถอยเมื่อฝั่งเว็บไม่มีเลข)
$r4 = req('saveTeam', ['teamId' => $teamId, 'name' => 'ทีมทดสอบควัน',
    'players' => $body['players']], $teamToken);
check('ไม่ส่ง rowVersion ก็บันทึกได้', ($r4['ok'] ?? false) === true, $r4['message'] ?? '');

// ─────────────────────────────────────────────────────────────────────────
head('8.9 ทางลัดเข้าด้วยบัญชีต้องล้มแบบไม่ทำลาย session ทีม');

// ที่พังบนของจริง: เปิดหน้า /school แล้วแอปลอง teamLoginByAccount ให้อัตโนมัติ
// ได้ 401 เพราะ token ที่ถืออยู่เป็นของทีม ไม่ใช่ของผู้ใช้ -> ตัวจัดการกลาง
// ล้าง token แล้วเด้งไป /login ครูจึงกรอกอะไรไม่ได้เลย
// ฝั่ง server ต้องตอบ 401 ตามเดิม และ token ทีมต้องยังใช้ได้ต่อ
$r = req('teamLoginByAccount', [], $teamToken);
check('teamLoginByAccount ด้วย token ทีมได้ 401', ($r['_http'] ?? 0) === 401,
    'ได้ HTTP ' . ($r['_http'] ?? '?') . ' ' . ($r['message'] ?? ''));

$r = req('myTeams', [], $teamToken, 'GET');
check('token ทีมยังใช้ได้หลังทางลัดล้มเหลว',
    count($r['data']['teams'] ?? $r['teams'] ?? []) === 1,
    substr((string) $r['_raw'], 0, 200));

// ─────────────────────────────────────────────────────────────────────────
head('8.10 ค่าตั้งของรายการต้องบันทึกแล้วอ่านกลับมาได้');

// เคยพลาดมาแล้ว: เพิ่มช่อง "โลโก้รายการ" กับ "ประกาศ" ในโมดัลตั้งค่า
// แต่ไม่มีคอลัมน์รองรับและ saveTournament ไม่ได้เขียนลงไป
// แอดมินกรอกแล้วกดบันทึกสำเร็จ แต่ค่าหายทุกครั้งโดยไม่มีอะไรเตือน
$r = req('updateTournament', [
    'tournament' => [
        'id' => $tid, 'name' => 'สมโภชน์ทดสอบ', 'type' => 'Penalty', 'status' => 'Active',
        'config' => [
            'competitionLogo' => '/storage/uploads/logo/smoke.png',
            'announcement'    => 'ประกาศทดสอบหนึ่ง|ประกาศทดสอบสอง',
            'registrationFee' => 500,
            'bankName'    => 'ธนาคารกรุงไทย',
            'bankAccount' => '7130256489',
            'accountName' => 'กองทุนกีฬาทดสอบ',
        ],
    ],
], $adminToken);
check('บันทึกค่าตั้งรายการได้', ($r['ok'] ?? false) === true,
    'HTTP ' . ($r['_http'] ?? '?') . ' ' . ($r['message'] ?? ''));

$r = req('getData', ['parts' => 'tournaments'], null, 'GET');
$found = null;
foreach (($r['tournaments'] ?? []) as $t) {
    if (($t['id'] ?? '') === $tid) { $found = json_decode((string) ($t['config'] ?? '{}'), true); break; }
}
check('อ่านโลโก้รายการกลับมาได้', ($found['competitionLogo'] ?? '') !== '',
    'ได้ ' . var_export($found['competitionLogo'] ?? null, true));
check('อ่านประกาศกลับมาได้',
    ($found['announcement'] ?? '') === 'ประกาศทดสอบหนึ่ง|ประกาศทดสอบสอง',
    'ได้ ' . var_export($found['announcement'] ?? null, true));

// บัญชีรับค่าสมัครต้องไปถึงหน้าโรงเรียนด้วย ไม่ใช่มีแต่ใน getData
$r = req('myTeams', [], $teamToken, 'GET');
$tr = $r['tournament'] ?? [];
check('myTeams ส่งค่าสมัครมาด้วย', (float) ($tr['registrationFee'] ?? 0) === 500.0,
    'ได้ ' . var_export($tr['registrationFee'] ?? null, true));
check('myTeams ส่งเลขบัญชีมาด้วย', ($tr['bankAccount'] ?? '') === '7130256489',
    'ได้ ' . var_export($tr['bankAccount'] ?? null, true));
check('myTeams ส่งชื่อบัญชีมาด้วย', ($tr['accountName'] ?? '') === 'กองทุนกีฬาทดสอบ',
    'ได้ ' . var_export($tr['accountName'] ?? null, true));

// ─────────────────────────────────────────────────────────────────────────
head('8.11 ลิงก์ไฮไลต์ของแต่ละคู่');

$mid = "M_SMOKE_$stamp";
$pdo->prepare("INSERT INTO matches (match_id, tournament_id, team_a_id, team_b_id,
                 team_a_name, team_b_name, round_label, status, livestream_url)
               VALUES (?, ?, ?, ?, 'ทีมทดสอบควัน', 'ทีมรับเชิญ', 'รอบแรก', 'Scheduled', ?)")
    ->execute([$mid, $tid, $teamId, $teamId, 'https://youtu.be/LIVEaaaaaaa']);

// บันทึกลิงก์ไฮไลต์
$r = req('saveMatch', ['matchId' => $mid, 'tournamentId' => $tid,
    'highlightUrl' => 'https://www.youtube.com/watch?v=HIGHLbbbbbb',
    'highlightTitle' => 'ไฮไลต์รอบแรก'], $adminToken);
check('บันทึกลิงก์ไฮไลต์ได้', ($r['ok'] ?? false) === true,
    'HTTP ' . ($r['_http'] ?? '?') . ' ' . ($r['message'] ?? ''));

$row = $pdo->query("SELECT highlight_url, highlight_title, livestream_url FROM matches
                     WHERE match_id = " . $pdo->quote($mid))->fetch(PDO::FETCH_ASSOC);
check('เก็บ URL ไฮไลต์ถูกต้อง',
    ($row['highlight_url'] ?? '') === 'https://www.youtube.com/watch?v=HIGHLbbbbbb',
    'ได้ ' . var_export($row['highlight_url'] ?? null, true));
check('ลิงก์ถ่ายทอดสดไม่ถูกทับ',
    ($row['livestream_url'] ?? '') === 'https://youtu.be/LIVEaaaaaaa',
    'ได้ ' . var_export($row['livestream_url'] ?? null, true));

// แก้เวลาแข่งอย่างเดียว (ไม่ส่ง highlightUrl) ต้องไม่ลบลิงก์ไฮไลต์ทิ้ง
$r = req('saveMatch', ['matchId' => $mid, 'tournamentId' => $tid,
    'venue' => 'สนามใหม่'], $adminToken);
check('แก้สนามได้', ($r['ok'] ?? false) === true, $r['message'] ?? '');
$still = (string) $pdo->query("SELECT highlight_url FROM matches
                                WHERE match_id = " . $pdo->quote($mid))->fetchColumn();
check('แก้ช่องอื่นแล้วลิงก์ไฮไลต์ไม่หาย',
    $still === 'https://www.youtube.com/watch?v=HIGHLbbbbbb', "เหลือ '$still'");

// ส่ง '-' = ตั้งใจลบ
$r = req('saveMatch', ['matchId' => $mid, 'tournamentId' => $tid,
    'highlightUrl' => '-'], $adminToken);
$cleared = (string) $pdo->query("SELECT highlight_url FROM matches
                                  WHERE match_id = " . $pdo->quote($mid))->fetchColumn();
check('ส่ง - เพื่อลบลิงก์ได้', $cleared === '', "เหลือ '$cleared'");

// ต้องอ่านออกมาทาง getData ด้วย
$pdo->prepare("UPDATE matches SET highlight_url = ? WHERE match_id = ?")
    ->execute(['https://youtu.be/HIGHLbbbbbb', $mid]);
$r = req('getData', ['parts' => 'matches'], null, 'GET');
$m = null;
foreach (($r['matches'] ?? []) as $row2) {
    if (($row2['id'] ?? '') === $mid) { $m = $row2; break; }
}
check('getData ส่ง highlightUrl มาด้วย', ($m['highlightUrl'] ?? '') !== '',
    'ได้ ' . var_export($m['highlightUrl'] ?? null, true));

$pdo->exec("DELETE FROM matches WHERE match_id = " . $pdo->quote($mid));

// ─────────────────────────────────────────────────────────────────────────
head('8.12 ร่างเก่าต้องเขียนทับของใหม่ไม่ได้');

// ตรรกะทิ้งร่างอยู่ฝั่งเว็บ (เทียบ rowVersion) แต่สิ่งที่ต้องแน่ใจฝั่ง server คือ
// myTeams ส่ง rowVersion มาให้เทียบได้จริง ถ้าไม่มีค่านี้ การกันร่างเก่าจะพังเงียบ ๆ
$r = req('myTeams', [], $teamToken, 'GET');
$t0 = ($r['data']['teams'] ?? $r['teams'] ?? [])[0] ?? [];
check('myTeams ส่ง rowVersion ของทีมมาด้วย', isset($t0['rowVersion']) && is_int($t0['rowVersion']),
    'ได้ ' . var_export($t0['rowVersion'] ?? null, true));

// และผู้เล่นต้องมี id ติดมาด้วย ไม่งั้นร่างที่เก็บไว้จะไม่มี id ให้จับคู่ตอนบันทึกกลับ
$p0 = ($t0['players'] ?? [])[0] ?? [];
check('myTeams ส่ง id ของผู้เล่นมาด้วย', ($p0['id'] ?? '') !== '',
    'ได้ ' . var_export($p0['id'] ?? null, true));

// rowVersion ต้องเดินขึ้นทุกครั้งที่บันทึก ไม่งั้นเทียบว่าร่างเก่าหรือใหม่ไม่ได้เลย
$rvBefore = (int) ($t0['rowVersion'] ?? 0);
req('saveTeam', ['teamId' => $teamId, 'name' => 'ทีมทดสอบควัน',
    'players' => [['id' => $p0['id'] ?? '', 'name' => 'เด็กชายหนึ่ง สมมติ',
                   'number' => '7', 'birthDate' => '', 'photoUrl' => '/x/new.jpg']]], $teamToken);
$r = req('myTeams', [], $teamToken, 'GET');
$t1 = ($r['data']['teams'] ?? $r['teams'] ?? [])[0] ?? [];
check('บันทึกแล้ว rowVersion เดินขึ้น', (int) ($t1['rowVersion'] ?? 0) > $rvBefore,
    "$rvBefore -> " . var_export($t1['rowVersion'] ?? null, true));

// ─────────────────────────────────────────────────────────────────────────
head('8.13 ถอนอนุมัติเฉพาะเมื่อเปลี่ยนจริง + บอกว่าอะไรเปลี่ยน');

$mid2 = "TM_D2_$stamp";
$pdo->prepare("INSERT INTO teams (team_id, tournament_id, school_id, name, status)
               VALUES (?, ?, ?, 'ทีมตรวจ diff', 'Draft')")->execute([$mid2, $tid, $sid]);
$base = [
    ['name' => 'เด็กชาย ก', 'number' => '7', 'birthDate' => '', 'photoUrl' => '/x/a.jpg'],
    ['name' => 'เด็กชาย ข', 'number' => '9', 'birthDate' => '', 'photoUrl' => '/x/b.jpg'],
];
req('saveTeam', ['teamId' => $mid2, 'name' => 'ทีมตรวจ diff', 'players' => $base], $teamToken);
$ids = $pdo->query("SELECT player_id, updated_at FROM players WHERE team_id = " . $pdo->quote($mid2) . " ORDER BY display_order")
           ->fetchAll(PDO::FETCH_ASSOC);
$withId = static function (array $rows) use ($ids): array {
    foreach ($rows as $i => &$r) { if (isset($ids[$i])) $r['id'] = $ids[$i]['player_id']; }
    return $rows;
};
$pdo->prepare("UPDATE teams SET status = 'Approved' WHERE team_id = ?")->execute([$mid2]);

// (ก) บันทึกข้อมูลชุดเดิมเป๊ะ ๆ -> ต้องไม่ถอนอนุมัติ ไม่แจ้งเตือน
$nBefore = (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE user_id = " . $pdo->quote($adminId))->fetchColumn();
$r = req('saveTeam', ['teamId' => $mid2, 'name' => 'ทีมตรวจ diff',
    'players' => $withId($base)], $teamToken);
check('บันทึกชุดเดิมไม่ถอนอนุมัติ',
    (string) $pdo->query("SELECT status FROM teams WHERE team_id = " . $pdo->quote($mid2))->fetchColumn() === 'Approved',
    'สถานะ ' . $pdo->query("SELECT status FROM teams WHERE team_id = " . $pdo->quote($mid2))->fetchColumn());
$nAfter = (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE user_id = " . $pdo->quote($adminId))->fetchColumn();
check('บันทึกชุดเดิมไม่ยิงแจ้งเตือน', $nAfter === $nBefore, "$nBefore -> $nAfter");
check('บันทึกชุดเดิมไม่รายงานว่ามีอะไรเปลี่ยน', ($r['changes'] ?? []) === [],
    json_encode($r['changes'] ?? null, JSON_UNESCAPED_UNICODE));

// (ข) updated_at ต้องไม่ขยับเมื่อไม่ได้เปลี่ยนอะไร — ธงตรวจซ้ำจะได้ไม่ขึ้นมั่ว
$after = $pdo->query("SELECT player_id, updated_at FROM players WHERE team_id = " . $pdo->quote($mid2) . " ORDER BY display_order")
             ->fetchAll(PDO::FETCH_ASSOC);
check('บันทึกชุดเดิมไม่แตะ updated_at ของผู้เล่น',
    $after[0]['updated_at'] === $ids[0]['updated_at'] && $after[1]['updated_at'] === $ids[1]['updated_at'],
    "{$ids[0]['updated_at']} -> {$after[0]['updated_at']}");

// (ค) เปลี่ยนรูปคนเดียว -> ถอนอนุมัติ + บอกชัดว่าใครเปลี่ยนอะไร
$changed = $withId($base);
$changed[0]['photoUrl'] = '/x/a-new.jpg';
$r = req('saveTeam', ['teamId' => $mid2, 'name' => 'ทีมตรวจ diff', 'players' => $changed], $teamToken);
check('เปลี่ยนรูปแล้วถอนอนุมัติ',
    (string) $pdo->query("SELECT status FROM teams WHERE team_id = " . $pdo->quote($mid2))->fetchColumn() === 'Submitted');
check('รายงานว่าเปลี่ยนรูปของใคร',
    in_array('เด็กชาย ก เปลี่ยนรูป', $r['changes'] ?? [], true),
    json_encode($r['changes'] ?? null, JSON_UNESCAPED_UNICODE));

// (ง) เปลี่ยนเบอร์เสื้อ -> บอกเลขเก่าเลขใหม่
$pdo->prepare("UPDATE teams SET status = 'Approved' WHERE team_id = ?")->execute([$mid2]);
$changed[1]['number'] = '11';
$r = req('saveTeam', ['teamId' => $mid2, 'name' => 'ทีมตรวจ diff', 'players' => $changed], $teamToken);
check('รายงานเบอร์เสื้อเก่า→ใหม่',
    in_array('เด็กชาย ข เบอร์ 9 → 11', $r['changes'] ?? [], true),
    json_encode($r['changes'] ?? null, JSON_UNESCAPED_UNICODE));

// (จ) แอดมินแก้เองไม่ถอนอนุมัติ
$pdo->prepare("UPDATE teams SET status = 'Approved' WHERE team_id = ?")->execute([$mid2]);
$changed[0]['photoUrl'] = '/x/a-admin.jpg';
req('saveTeam', ['teamId' => $mid2, 'name' => 'ทีมตรวจ diff', 'players' => $changed], $adminToken);
check('แอดมินแก้เองไม่ถอนอนุมัติ',
    (string) $pdo->query("SELECT status FROM teams WHERE team_id = " . $pdo->quote($mid2))->fetchColumn() === 'Approved');

// ─────────────────────────────────────────────────────────────────────────
head('8.14 ธงตรวจซ้ำในหน้ารายงานตัว');

$pdo->prepare("UPDATE teams SET status = 'Approved' WHERE team_id = ?")->execute([$mid2]);
$pdo->exec("DELETE FROM player_checkins WHERE team_id = " . $pdo->quote($mid2));
foreach ($ids as $x) {
    $pdo->prepare("INSERT INTO player_checkins (tournament_id, team_id, player_id, status)
                   VALUES (?, ?, ?, 'present')")->execute([$tid, $mid2, $x['player_id']]);
}
$r = req('checkinTeam', ['teamId' => $mid2], $adminToken, 'GET');
$stale = array_filter($r['players'] ?? [], static fn($p) => !empty($p['stale']));
check('เพิ่งเช็กเสร็จยังไม่มีธงตรวจซ้ำ', count($stale) === 0, 'มี ' . count($stale) . ' คน');

// แก้รูปหลังรายงานตัว
sleep(1);   // ให้ updated_at ต่างจาก checked_at อย่างน้อย 1 วินาที
$changed[0]['photoUrl'] = '/x/a-after-checkin.jpg';
req('saveTeam', ['teamId' => $mid2, 'name' => 'ทีมตรวจ diff', 'players' => $changed], $adminToken);

$r = req('checkinTeam', ['teamId' => $mid2], $adminToken, 'GET');
$stale = array_values(array_filter($r['players'] ?? [], static fn($p) => !empty($p['stale'])));
check('แก้รูปหลังรายงานตัวแล้วขึ้นธงเฉพาะคนนั้น', count($stale) === 1,
    'ขึ้นธง ' . count($stale) . ' คน');
check('ธงขึ้นถูกคน', ($stale[0]['name'] ?? '') === 'เด็กชาย ก',
    'ได้ ' . var_export($stale[0]['name'] ?? null, true));
check('ผลรายงานตัวไม่ถูกลบทิ้ง',
    (int) $pdo->query("SELECT COUNT(*) FROM player_checkins WHERE team_id = " . $pdo->quote($mid2))->fetchColumn() === 2);

$r = req('checkinTeams', ['tournamentId' => $tid], $adminToken, 'GET');
$row = null;
foreach (($r['teams'] ?? []) as $t2) { if (($t2['id'] ?? '') === $mid2) { $row = $t2; break; } }
check('หน้ารายการทีมนับจำนวนที่ต้องตรวจซ้ำ', (int) ($row['stale'] ?? 0) === 1,
    'ได้ ' . var_export($row['stale'] ?? null, true));

$pdo->exec("DELETE FROM teams WHERE team_id = " . $pdo->quote($mid2));

// ─────────────────────────────────────────────────────────────────────────
head('8.15 บทบาทกรรมการบันทึกผล');

$refId = "U_REF_$stamp";
$pdo->prepare("INSERT INTO users (user_id, username, password_hash, display_name, role)
               VALUES (?, ?, ?, 'กรรมการทดสอบ', 'referee')")
    ->execute([$refId, "ref_$stamp", password_hash('ref-pass-1234', PASSWORD_DEFAULT)]);
$pdo->prepare("INSERT INTO tournament_managers (tournament_id, user_id, granted_by) VALUES (?, ?, ?)")
    ->execute([$tid, $refId, $adminId]);

$r = req('auth', ['authType' => 'login', 'username' => "ref_$stamp", 'password' => 'ref-pass-1234']);
$refToken = $r['token'] ?? null;
check('กรรมการเข้าระบบได้และได้บทบาท referee', ($r['role'] ?? '') === 'referee',
    'ได้ ' . var_export($r['role'] ?? null, true));

$rmid = "M_REF_$stamp";
$pdo->prepare("INSERT INTO matches (match_id, tournament_id, team_a_id, team_b_id,
                 team_a_name, team_b_name, round_label, status)
               VALUES (?, ?, ?, ?, 'ทีมทดสอบควัน', 'ทีมทดสอบควัน', 'รอบแรก', 'Scheduled')")
    ->execute([$rmid, $tid, $teamId, $teamId]);

$r = req('saveMatchResult', ['matchId' => $rmid, 'tournamentId' => $tid,
    'teamA' => 'ทีมทดสอบควัน', 'teamB' => 'ทีมทดสอบควัน',
    'scoreA' => 2, 'scoreB' => 1, 'winner' => 'A', 'status' => 'Finished',
    'kicks' => [
        ['round' => 1, 'teamId' => 'A', 'player' => 'ก', 'result' => 'GOAL'],
        ['round' => 1, 'teamId' => 'B', 'player' => 'ข', 'result' => 'SAVED'],
        ['round' => 2, 'teamId' => 'A', 'player' => 'ค', 'result' => 'GOAL'],
    ]], $refToken);
check('กรรมการบันทึกผลรายการที่ถูกมอบหมายได้', ($r['ok'] ?? false) === true,
    'HTTP ' . ($r['_http'] ?? '?') . ' ' . ($r['message'] ?? ''));
check('ลูกยิงถูกบันทึกครบ',
    (int) $pdo->query("SELECT COUNT(*) FROM kicks WHERE match_id = " . $pdo->quote($rmid))->fetchColumn() === 3);

// แก้ผลลูกยิงแล้วส่งใหม่ — server ลบทั้งนัดแล้วเขียนใหม่ จึงต้องได้ชุดใหม่เป๊ะ
$r = req('saveMatchResult', ['matchId' => $rmid, 'tournamentId' => $tid,
    'teamA' => 'ทีมทดสอบควัน', 'teamB' => 'ทีมทดสอบควัน',
    'scoreA' => 1, 'scoreB' => 1, 'status' => 'Finished',
    'kicks' => [
        ['round' => 1, 'teamId' => 'A', 'player' => 'ก', 'result' => 'MISSED'],
        ['round' => 1, 'teamId' => 'B', 'player' => 'ข', 'result' => 'GOAL'],
        ['round' => 2, 'teamId' => 'A', 'player' => 'ค', 'result' => 'GOAL'],
    ]], $refToken);
$kr = $pdo->query("SELECT team_side, round_no, result FROM kicks
                    WHERE match_id = " . $pdo->quote($rmid) . " ORDER BY team_side, round_no")
          ->fetchAll(PDO::FETCH_ASSOC);
check('แก้ผลลูกยิงแล้วเขียนทับถูกต้อง',
    count($kr) === 3 && $kr[0]['result'] === 'MISSED' && $kr[2]['result'] === 'GOAL',
    json_encode($kr, JSON_UNESCAPED_UNICODE));

// ลบลูกกลางทางแล้วเรียงเลขรอบใหม่ — เลขรอบต้องไม่ขาดช่วง ไม่งั้นชน uq_kick_slot
$r = req('saveMatchResult', ['matchId' => $rmid, 'tournamentId' => $tid,
    'teamA' => 'ทีมทดสอบควัน', 'teamB' => 'ทีมทดสอบควัน',
    'scoreA' => 1, 'scoreB' => 0, 'status' => 'Finished',
    'kicks' => [
        ['round' => 1, 'teamId' => 'A', 'player' => 'ก', 'result' => 'MISSED'],
        ['round' => 2, 'teamId' => 'A', 'player' => 'ค', 'result' => 'GOAL'],
    ]], $refToken);
check('ลบลูกแล้วเหลือเท่าที่ส่งไป',
    (int) $pdo->query("SELECT COUNT(*) FROM kicks WHERE match_id = " . $pdo->quote($rmid))->fetchColumn() === 2);

// สิทธิ์ต้องจำกัดจริง
$r = req('getUsers', [], $refToken, 'GET');
check('กรรมการดูรายชื่อผู้ใช้ไม่ได้', ($r['_http'] ?? 0) === 403, 'ได้ HTTP ' . ($r['_http'] ?? '?'));
$r = req('checkinTeams', ['tournamentId' => $tid], $refToken, 'GET');
check('กรรมการเปิดหน้ารายงานตัวไม่ได้', ($r['_http'] ?? 0) === 403, 'ได้ HTTP ' . ($r['_http'] ?? '?'));

$other = "T_OTHER_$stamp";
$pdo->prepare("INSERT INTO tournaments (tournament_id, name, type, status, players_per_team, max_subs, max_teams_per_school)
               VALUES (?, 'รายการอื่น', 'Penalty', 'Active', 7, 3, 2)")->execute([$other]);
$r = req('saveMatchResult', ['matchId' => "M_X_$stamp", 'tournamentId' => $other,
    'teamA' => 'a', 'teamB' => 'b', 'scoreA' => 9, 'scoreB' => 0,
    'status' => 'Finished', 'skipKicks' => true], $refToken);
check('กรรมการบันทึกผลรายการที่ไม่ได้ถูกมอบหมายไม่ได้', ($r['_http'] ?? 0) === 403,
    'ได้ HTTP ' . ($r['_http'] ?? '?'));
$pdo->exec("DELETE FROM tournaments WHERE tournament_id = " . $pdo->quote($other));

// ─────────────────────────────────────────────────────────────────────────
head('8.16 ข้อมูลที่สถิติการเจอกันต้องใช้');

// จับคู่ข้ามรายการต้องใช้ team id -> school id ถ้า API ไม่ส่งมา สถิติจะว่างเปล่า
$r = req('getData', ['parts' => 'matches,teams'], null, 'GET');
$m0 = null;
foreach (($r['matches'] ?? []) as $x) { if (($x['id'] ?? '') === $rmid) { $m0 = $x; break; } }
check('getData ส่ง teamAId/teamBId ของนัดมาด้วย',
    ($m0['teamAId'] ?? '') !== '' && ($m0['teamBId'] ?? '') !== '',
    json_encode([$m0['teamAId'] ?? null, $m0['teamBId'] ?? null]));
$t0 = null;
foreach (($r['teams'] ?? []) as $x) { if (($x['id'] ?? '') === $teamId) { $t0 = $x; break; } }
check('getData ส่ง schoolId ของทีมมาด้วย', ($t0['schoolId'] ?? '') !== '',
    var_export($t0['schoolId'] ?? null, true));

$pdo->exec("DELETE FROM matches WHERE match_id = " . $pdo->quote($rmid));
$pdo->exec("DELETE FROM users WHERE user_id = " . $pdo->quote($refId));

// ─────────────────────────────────────────────────────────────────────────
head('8.17 แอดมินเปลี่ยนโลโก้/เอกสารของทีมได้');

// เคยพลาด: หน้าแอดมินเก็บ File ไว้แล้วโชว์ preview แต่ไม่เคยอัปขึ้น server
// และ updateTeamData ก็ไม่ได้ส่ง logoUrl ไปเลย กดบันทึกขึ้นว่าสำเร็จแต่โลโก้เหมือนเดิม
$before = (string) $pdo->query("SELECT logo_url FROM teams WHERE team_id = " . $pdo->quote($teamId))->fetchColumn();
$r = req('saveTeam', ['teamId' => $teamId, 'name' => 'ทีมทดสอบควัน',
    'logoUrl' => '/storage/uploads/logo/smoke-logo.png',
    'docUrl'  => '/storage/uploads/doc/smoke-doc.pdf'], $adminToken);
check('บันทึกโลโก้/เอกสารได้', ($r['ok'] ?? false) === true, $r['message'] ?? '');
$row = $pdo->query("SELECT logo_url, doc_url FROM teams WHERE team_id = " . $pdo->quote($teamId))
           ->fetch(PDO::FETCH_ASSOC);
check('โลโก้ถูกเก็บลงฐานข้อมูล',
    ($row['logo_url'] ?? '') === '/storage/uploads/logo/smoke-logo.png',
    "'$before' -> '" . ($row['logo_url'] ?? '') . "'");
check('เอกสารถูกเก็บลงฐานข้อมูล',
    ($row['doc_url'] ?? '') === '/storage/uploads/doc/smoke-doc.pdf',
    var_export($row['doc_url'] ?? null, true));

// ไม่ส่ง logoUrl มา = ไม่ได้แตะ ต้องคงของเดิม ไม่ใช่ล้างทิ้ง
req('saveTeam', ['teamId' => $teamId, 'name' => 'ทีมทดสอบควัน'], $adminToken);
check('บันทึกโดยไม่ส่งโลโก้แล้วโลโก้ไม่หาย',
    (string) $pdo->query("SELECT logo_url FROM teams WHERE team_id = " . $pdo->quote($teamId))->fetchColumn()
        === '/storage/uploads/logo/smoke-logo.png');

// ─────────────────────────────────────────────────────────────────────────
head('9. เก็บกวาด');

foreach (["DELETE FROM donations WHERE tournament_id = " . $pdo->quote($tid),
          "DELETE FROM tournaments WHERE tournament_id = " . $pdo->quote($tid),
          "DELETE FROM schools WHERE school_id = " . $pdo->quote($sid),
          "DELETE FROM users WHERE user_id IN (" . $pdo->quote($adminId) . ", " . $pdo->quote($victim) . ")"] as $sql) {
    $pdo->exec($sql);
}
echo "  ลบข้อมูลทดสอบแล้ว\n";

echo "\n" . str_repeat('─', 52) . "\n";
echo ($fail === 0 ? "ผ่านทั้งหมด" : "ไม่ผ่าน $fail ข้อ") . " (ผ่าน $pass)\n";
exit($fail === 0 ? 0 : 1);
