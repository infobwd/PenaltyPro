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
require __DIR__ . '/lib/Perm.php';
require __DIR__ . '/lib/Media.php';
require __DIR__ . '/lib/Format.php';
require __DIR__ . '/lib/Lookup.php';
require __DIR__ . '/lib/Secret.php';
require __DIR__ . '/lib/NotificationPrefs.php';
require __DIR__ . '/lib/PushNotifier.php';

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
Secret::configure((string) ($cfg['app_secret'] ?? ''));
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
    'setMySchool'        => 'auth.php',
    'teamLoginByAccount' => 'auth.php',   // เข้าจัดการทีมด้วยบัญชีที่ผู้ดูแลรับรอง   // ผู้ใช้เลือกโรงเรียนต้นสังกัดเอง

    // --- ทัวร์นาเมนต์ ------------------------------------------------------
    'createTournament'   => 'tournaments.php',
    'updateTournament'   => 'tournaments.php',
    'deleteTournament'   => 'tournaments.php',   // ใหม่ — เดิมลบไม่ได้เลย
    'setRegistrationWindow' => 'tournaments.php', // ใหม่ — กำหนดวันรับสมัคร
    'setTournamentHost'       => 'tournaments.php',  // โรงเรียนเจ้าภาพของรายการ
    'assignTournamentManager' => 'tournaments.php',  // มอบสิทธิ์ผู้ดูแลประจำรายการ
    'listTournamentManagers'  => 'tournaments.php',
    // รหัสเริ่มแข่ง — ให้กรรมการที่ไม่มีบัญชีบันทึกผลได้ (db/28)
    'getScorerCodeStatus'     => 'tournaments.php',
    'setScorerCode'           => 'tournaments.php',
    'scorerLogin'             => 'auth.php',
    'scorerSession'           => 'auth.php',
    'flushCache'              => 'tournaments.php',  // ล้าง cache หลังแก้ DB ตรง

    // --- โรงเรียนและรหัสเข้าใช้งาน ----------------------------------------
    'issueAccessCodes'     => 'schools.php',
    'regenerateAccessCode' => 'schools.php',
    'listSchools'          => 'schools.php',
    'publicSchools'        => 'schools.php',  // รายชื่อโรงเรียนให้ผู้ใช้เลือกเอง
    'searchUsers'          => 'schools.php',  // ตัวเลือกผู้ดูแลประจำรายการ
    'revealAccessCode'     => 'schools.php',  // ผู้ดูแลเปิดดูรหัสเดิมได้
    'downloadAccessCodes' => 'schools.php',  // ดาวน์โหลด CSV ผ่าน frontend (ผู้ดูแลเท่านั้น)

    // --- ทีม ---------------------------------------------------------------
    'cloneTeams'  => 'teams.php',   // คัดลอกทีมเดิมมาแข่งฤดูใหม่
    'myTeams'     => 'teams.php',   // โรงเรียนดูทีมตัวเอง
    'saveTeam'    => 'teams.php',
    'submitTeam'  => 'teams.php',
    'reviewTeam'  => 'teams.php',   // แอดมินอนุมัติ/ปฏิเสธ
    'reviewRegistrationPayment' => 'teams.php', // ตรวจสลิปค่าสมัคร (แยกจากสถานะใบสมัคร)
    'createTeam'  => 'teams.php',   // แอดมินเพิ่มทีม (ผูกโรงเรียนในระบบ)
    'deleteTeam'  => 'teams.php',
    'setTeamMeta' => 'teams.php',   // ย้ายสาย / เปลี่ยนโรงเรียนที่ผูก
    'setLineupMedia' => 'teams.php', // คลิปแนะนำทีม/รายคน สำหรับผังตัวนักกีฬา
    'updatePlayerNumber' => 'teams.php', // กรรมการแก้เบอร์เสื้อก่อน/ระหว่างบันทึกผล
    'updatePlayerLineup' => 'teams.php', // กรรมการแก้เบอร์เสื้อและตำแหน่งที่ใช้ร่วมกับ Live Wall

    // --- ตารางแข่ง ---------------------------------------------------------
    'generateFixtures' => 'fixtures.php',  // ประกบคู่อัตโนมัติทั้งสาย
    'autoAssignGroups' => 'fixtures.php',  // สุ่มแบ่งสาย
    'saveMatch'        => 'fixtures.php',
    'deleteMatch'      => 'fixtures.php',
    'deleteAllMatches' => 'fixtures.php',  // ล้างตารางทั้งรายการ

    // --- ผลการแข่งขันสด ----------------------------------------------------
    'saveMatchResult'  => 'live.php',   // สกอร์ + ลูกจุดโทษ (เขียนทับทั้งนัด)
    'saveMatchEvents'  => 'live.php',   // ประตู/ใบเหลือง/เปลี่ยนตัว
    'cancelMatchRecord'=> 'live.php',   // ยกเลิกลูกยิง/ประตูที่กดผิดจากโต๊ะพากย์
    'discardMatchDraft'=> 'live.php',   // ออกจากหน้าบันทึกผลโดยไม่เก็บข้อมูลทดลอง
    'resetMatchResult' => 'live.php',   // ยกเลิกผลทั้งนัด (ใช้กับนัดที่จบแล้วได้)
    'liveBoard'        => 'live.php',   // กระดานผลสด (อ่านอย่างเดียว ยิงซ้ำได้ถี่)

    // --- เครื่องถ่ายทอดสด (Production Node) --------------------------------
    // เพิ่มใหม่ล้วน ไม่แตะ action เดิม — ถ้าลบสี่บรรทัดนี้กับ production.php ทิ้ง
    // ระบบเดิมยังทำงานได้ครบเหมือนไม่เคยมี
    'productionEvents'    => 'production.php',  // เวลาเหตุการณ์ระดับมิลลิวินาที (ส่งเป็นชุด กันซ้ำ)
    'productionTimeline'  => 'production.php',  // ไทม์ไลน์ของนัด สำหรับสร้างรายการรีเพลย์
    'productionHeartbeat' => 'production.php',  // เครื่องถ่ายทอดรายงานตัวนาทีละครั้ง
    'productionNodes'     => 'production.php',  // รายชื่อเครื่องถ่ายทอด (แอดมินเท่านั้น)

    // --- ข้อความผู้ชมขึ้นแถบวิ่ง (ต้องอนุมัติก่อนขึ้นจอเสมอ) ---------------
    // เพิ่มใหม่ล้วน ไม่แตะ action เดิม — ลบสี่บรรทัดนี้กับ broadcast.php ทิ้ง
    // แล้วระบบเดิมยังทำงานครบเหมือนไม่เคยมี
    'submitBroadcastComment'   => 'broadcast.php',  // ผู้ชมส่ง (เข้าคิวรออนุมัติ)
    'getBroadcastComments'     => 'broadcast.php',  // เฉพาะที่อนุมัติแล้ว — เครื่องถ่ายทอดใช้
    'listBroadcastComments'    => 'broadcast.php',  // คิวรอตรวจ (เจ้าหน้าที่ของรายการ)
    'moderateBroadcastComment' => 'broadcast.php',  // อนุมัติ/ปฏิเสธ/เอาลง

    // --- ใบเกียรติบัตร -----------------------------------------------------
    'getCertificateData'      => 'certificates.php',
    'saveCertificateSettings' => 'certificates.php',
    'issueCertificates'       => 'certificates.php',
    'downloadCertificates'    => 'certificates.php',   // ส่งกลับเป็นไฟล์ PDF ไม่ใช่ JSON
    'saveCertificateTemplate' => 'certificates.php',
    'verifyCertificate'       => 'certificates.php',   // เปิดสาธารณะ — สแกน QR แล้วเข้ามา
    'listCertificatePresets'  => 'certificates.php',   // แม่แบบที่ใช้ข้ามรายการได้
    'saveCertificatePreset'   => 'certificates.php',
    'deleteCertificatePreset' => 'certificates.php',

    // --- ไฟล์ -------------------------------------------------------------
    'uploadFile'       => 'upload.php',

    // --- ผู้ใช้ทั่วไป (ไม่ต้องล็อกอินด้วยรหัสผ่าน) --------------------------
    'register'         => 'public.php',   // สมัครทีมจากหน้าเว็บ
    'submitDonation'   => 'public.php',
    'submitPrediction' => 'public.php',

    // --- การแจ้งเตือน ------------------------------------------------------
    'getNotifications'       => 'notifications.php',
    'notificationCount'      => 'notifications.php',
    'readNotification'       => 'notifications.php',
    'readAllNotifications'   => 'notifications.php',
    'deleteNotification'     => 'notifications.php',
    'clearNotifications'     => 'notifications.php',
    'savePushSubscription'   => 'notifications.php',
    'deletePushSubscription' => 'notifications.php',
    'getNotificationPrefs'   => 'notifications.php',
    'saveNotificationPrefs'  => 'notifications.php',
    'pushConfig'             => 'notifications.php',
    'sendTestNotification'   => 'notifications.php',

    // --- ประกวดภาพ ---------------------------------------------------------
    'getContests'          => 'contests.php',
    'submitContestEntry'   => 'contests.php',
    'deleteContestEntry'   => 'contests.php',
    'toggleEntryLike'      => 'contests.php',
    'manageContest'        => 'contests.php',
    'getComments'          => 'contests.php',
    'submitContestComment' => 'contests.php',
    'incrementShareCount'  => 'contests.php',

    // --- งานหลังบ้านที่เหลือ (ย้ายมาจาก Apps Script) -----------------------
    'getUsers'          => 'admin.php',
    'createUser'        => 'admin.php',
    'updateUserDetails' => 'admin.php',
    'updateUserRole'    => 'admin.php',
    'deleteUser'        => 'admin.php',
    'manageNews'        => 'admin.php',
    'saveSettings'      => 'admin.php',
    'verifyDonation'        => 'admin.php',
    'updateDonationDetails' => 'admin.php',
    'getSponsors'       => 'admin.php',
    'manageSponsor'     => 'admin.php',
    'saveSponsorPaymentSettings' => 'admin.php',
    // --- บัญชีรายรับ-รายจ่ายของรายการ ------------------------------------
    'getFinanceData'          => 'finance.php',
    'saveFinanceEntry'        => 'finance.php',
    'deleteFinanceEntry'      => 'finance.php',
    'assignFinanceAccountant' => 'finance.php',
    'listRegistrationSlips'   => 'finance.php',  // ตรวจสลิปจากหน้าบัญชีได้เลย
    'getMusicTracks'    => 'admin.php',
    'manageMusicTrack'  => 'admin.php',
    'getTickerMessages' => 'admin.php',
    'manageTickerMessage' => 'admin.php',

    // --- รายงานตัวนักกีฬาหน้างาน -------------------------------------------
    'checkinTeams'      => 'checkin.php',
    'checkinTeam'       => 'checkin.php',
    'savePlayerCheckin' => 'checkin.php',
    'checkinTeamBulk'   => 'checkin.php',
    'checkinAllBulk'    => 'checkin.php',
    'updateCheckinPlayer' => 'checkin.php',   // เปลี่ยนตัวหน้างาน — แก้ชื่อ/รูปคนที่มาแทน
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
