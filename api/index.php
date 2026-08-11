<?php
declare(strict_types=1);

/**
 * Front controller
 *
 * คงสัญญา `?action=xxx` แบบเดิมของ Apps Script ไว้ เพื่อให้ frontend ย้ายมาได้
 * ด้วยการเปลี่ยน API_URL กับใส่ Authorization header เท่านั้น — คอมโพเนนต์
 * 23 ตัวไม่ต้องแก้
 */

require __DIR__ . '/lib/Db.php';
require __DIR__ . '/lib/Response.php';
require __DIR__ . '/lib/Auth.php';
require __DIR__ . '/lib/Cache.php';
require __DIR__ . '/lib/Input.php';
require __DIR__ . '/lib/Audit.php';

// config.local.php ใช้ทับตอนพัฒนาในเครื่อง (อยู่ใน .gitignore เหมือน config.php)
$configPath = is_file(__DIR__ . '/config.local.php')
    ? __DIR__ . '/config.local.php'
    : __DIR__ . '/config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    exit(json_encode(['status' => 'error',
        'message' => 'ยังไม่มี api/config.php — คัดลอกจาก config.example.php'],
        JSON_UNESCAPED_UNICODE));
}
$cfg = require $configPath;

// ต้องตั้งก่อนเรียก date()/strtotime() ที่ไหนก็ตาม
// Db.php ตั้ง time_zone ให้ MySQL แล้ว แต่ PHP ใช้ค่าของตัวเองแยกต่างหาก
// ถ้าไม่ตั้ง เครื่องที่ php.ini เป็น UTC จะบันทึก "ปิดรับสมัคร 23:59" เป็น 16:59
date_default_timezone_set($cfg['timezone'] ?? 'Asia/Bangkok');

Db::configure($cfg['db']);
Cache::configure($cfg['cache']);
Auth::configure(
    (int) ($cfg['session_ttl'] ?? 43200),
    (int) ($cfg['team_session_ttl'] ?? 604800),
    $cfg['line'] ?? []
);
Response::boot($cfg['allowed_origins'] ?? [], (bool) ($cfg['allow_debug'] ?? false));

set_error_handler(static function (int $no, string $msg, string $file, int $line): bool {
    throw new ErrorException($msg, 0, $no, $file, $line);
});

$routes = [
    // --- ข้อมูลหลัก (อ่าน) -------------------------------------------------
    'getData'            => 'data.php',
    'health'             => 'health.php',

    // --- บัญชีผู้ใช้ -------------------------------------------------------
    'auth'               => 'auth.php',   // ชื่อเดิมที่ frontend เรียกอยู่
    'login'              => 'auth.php',
    'logout'             => 'auth.php',
    'me'                 => 'auth.php',
    'teamLogin'          => 'auth.php',   // โรงเรียนเข้าด้วยรหัส 8 ตัว
    'changePassword'     => 'auth.php',

    // --- ทัวร์นาเมนต์ ------------------------------------------------------
    'createTournament'   => 'tournaments.php',
    'updateTournament'   => 'tournaments.php',
    'deleteTournament'   => 'tournaments.php',   // ใหม่ — เดิมลบไม่ได้เลย
    'setRegistrationWindow' => 'tournaments.php', // ใหม่ — กำหนดวันรับสมัคร

    // --- โรงเรียนและรหัสเข้าใช้งาน ----------------------------------------
    'issueAccessCodes'     => 'schools.php',
    'regenerateAccessCode' => 'schools.php',
    'listSchools'          => 'schools.php',

    // --- ทีม ---------------------------------------------------------------
    'cloneTeams'  => 'teams.php',   // คัดลอกทีมเดิมมาแข่งฤดูใหม่
    'myTeams'     => 'teams.php',   // โรงเรียนดูทีมตัวเอง
    'saveTeam'    => 'teams.php',
    'submitTeam'  => 'teams.php',
    'reviewTeam'  => 'teams.php',   // แอดมินอนุมัติ/ปฏิเสธ
];

$action = (string) ($_GET['action'] ?? Input::str('action'));

try {
    if ($action === '' || !isset($routes[$action])) {
        Response::fail("ไม่รู้จัก action " . ($action === '' ? '(ว่าง)' : "'$action'"), 404);
    }
    Auth::boot();
    require __DIR__ . '/routes/' . $routes[$action];
    handle($action, $cfg);
    Response::fail("action '$action' ไม่ได้ตอบกลับ", 500);
} catch (PDOException $e) {
    // ข้อความจาก MySQL อาจมีชื่อคอลัมน์/ค่าจริง — ไม่ส่งออกไปให้ client
    error_log('[api] PDO ' . $e->getCode() . ' ' . $e->getMessage());
    Response::fail('ฐานข้อมูลผิดพลาด', 500,
        Response::isDebug() ? ['detail' => $e->getMessage()] : []);
} catch (Throwable $e) {
    error_log('[api] ' . $e::class . ' ' . $e->getMessage() . ' @ '
        . $e->getFile() . ':' . $e->getLine());
    Response::fail('เกิดข้อผิดพลาดภายในระบบ', 500,
        Response::isDebug() ? ['detail' => $e->getMessage(),
                               'where' => $e->getFile() . ':' . $e->getLine()] : []);
}
