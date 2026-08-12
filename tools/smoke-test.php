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

$r = req('reviewTeam', ['teamId' => $teamId, 'decision' => 'approve'], $adminToken);
check('อนุมัติทีมได้', ($r['ok'] ?? false) === true,
    'HTTP ' . ($r['_http'] ?? '?') . ' ' . ($r['message'] ?? '') . ' ' . substr((string) $r['_raw'], 0, 200));

// จุดที่เคยพัง: ยืนยันสลิปทำให้ payment_reviewed_at ไม่เป็น NULL
// แล้ว team_payload() เรียก iso() ที่ไม่มีตัวตน -> fatal -> myTeams ตอบ HTML
$pdo->prepare("UPDATE teams SET slip_url = '/x.jpg' WHERE team_id = ?")->execute([$teamId]);
$r = req('reviewRegistrationPayment',
    ['teamId' => $teamId, 'decision' => 'verify'], $adminToken);
check('ยืนยันสลิปค่าสมัครได้', ($r['ok'] ?? false) === true, $r['message'] ?? '');

// ─────────────────────────────────────────────────────────────────────────
head('5. โรงเรียนกลับมาดูทีมหลังยืนยันสลิป  ← บั๊ก iso() อยู่ตรงนี้');

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
head('9. เก็บกวาด');

foreach (["DELETE FROM tournaments WHERE tournament_id = " . $pdo->quote($tid),
          "DELETE FROM schools WHERE school_id = " . $pdo->quote($sid),
          "DELETE FROM users WHERE user_id IN (" . $pdo->quote($adminId) . ", " . $pdo->quote($victim) . ")"] as $sql) {
    $pdo->exec($sql);
}
echo "  ลบข้อมูลทดสอบแล้ว\n";

echo "\n" . str_repeat('─', 52) . "\n";
echo ($fail === 0 ? "ผ่านทั้งหมด" : "ไม่ผ่าน $fail ข้อ") . " (ผ่าน $pass)\n";
exit($fail === 0 ? 0 : 1);
