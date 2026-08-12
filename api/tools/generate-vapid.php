<?php
declare(strict_types=1);

/**
 * สร้างคีย์ VAPID สำหรับ Web Push แล้วบันทึกลง app_settings
 *
 * รันครั้งเดียวตอนติดตั้ง:  php api/tools/generate-vapid.php
 *
 * ทำไมต้องมีสคริปต์นี้แทนการแปะคีย์ไว้ในไฟล์:
 *   private key คือสิ่งที่ใช้พิสูจน์ว่า push มาจากเซิร์ฟเวอร์เรา ถ้าหลุดออกไป
 *   คนอื่นส่งการแจ้งเตือนในนามระบบได้ จึงต้องไม่ถูก commit ลง git และไม่ควร
 *   ปรากฏในหน้าจอใคร — สคริปต์นี้สร้างแล้วเขียนลงฐานข้อมูลโดยตรง
 *   แสดงออกมาแค่ public key ซึ่งเปิดเผยได้ตามสเปก
 *
 * รันซ้ำได้ แต่จะเตือนก่อน เพราะการเปลี่ยนคีย์ทำให้ผู้ใช้ทุกคนที่เคยกดอนุญาต
 * ต้องกดใหม่ (subscription เดิมผูกกับ public key เดิม)
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("สคริปต์นี้รันได้จาก command line เท่านั้น\n");
}

require __DIR__ . '/../lib/Db.php';
require __DIR__ . '/../lib/Response.php';

$configPath = is_file(__DIR__ . '/../config.local.php')
    ? __DIR__ . '/../config.local.php'
    : __DIR__ . '/../config.php';
if (!is_file($configPath)) {
    exit("ไม่พบ api/config.php\n");
}
$cfg = require $configPath;
Db::configure($cfg['db']);

$existing = Db::value(
    "SELECT setting_value FROM app_settings WHERE setting_key = 'vapid_public_key'");
if ($existing !== null && trim((string) $existing) !== '') {
    $force = in_array('--force', $argv, true);
    if (!$force) {
        echo "มีคีย์ VAPID อยู่แล้ว\n";
        echo "public key: " . $existing . "\n\n";
        echo "ถ้าต้องการสร้างใหม่ ใส่ --force ต่อท้าย\n";
        echo "⚠️ ผู้ใช้ทุกคนที่เคยกดอนุญาตแจ้งเตือนจะต้องกดใหม่ทั้งหมด\n";
        exit(0);
    }
    echo "กำลังสร้างคีย์ใหม่ทับของเดิม...\n";
}

// ── สร้างคู่คีย์ P-256 ────────────────────────────────────────────────────
$res = openssl_pkey_new([
    'curve_name'       => 'prime256v1',
    'private_key_type' => OPENSSL_KEYTYPE_EC,
]);
if ($res === false) {
    exit("สร้างคีย์ไม่สำเร็จ: " . openssl_error_string() . "\n");
}
$details = openssl_pkey_get_details($res);
if (!isset($details['ec']['x'], $details['ec']['y'], $details['ec']['d'])) {
    exit("อ่านรายละเอียดคีย์ไม่ได้ — PHP อาจไม่ได้คอมไพล์มาพร้อม EC\n");
}

/** base64url ตามสเปก VAPID — ไม่มี padding และใช้ -_ แทน +/ */
$b64url = static fn(string $bin): string =>
    rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');

/** เติมศูนย์ด้านหน้าให้ครบ 32 ไบต์ — openssl ตัดศูนย์นำหน้าออกให้ */
$pad32 = static fn(string $bin): string => str_pad($bin, 32, "\x00", STR_PAD_LEFT);

// public key = 0x04 + X + Y (uncompressed point 65 ไบต์)
$publicKey  = $b64url("\x04" . $pad32($details['ec']['x']) . $pad32($details['ec']['y']));
$privateKey = $b64url($pad32($details['ec']['d']));

$subject = $argv[1] ?? null;
if ($subject === null || str_starts_with($subject, '--')) {
    $subject = 'mailto:' . ($cfg['contact_email'] ?? 'info@bwd.ac.th');
}

foreach ([
    'vapid_public_key'  => $publicKey,
    'vapid_private_key' => $privateKey,
    'vapid_subject'     => $subject,
] as $k => $v) {
    Db::exec(
        'INSERT INTO app_settings (setting_key, setting_value, is_public)
         VALUES (:k, :v, 0)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), is_public = 0',
        [':k' => $k, ':v' => $v]
    );
}

echo "สร้างคีย์ VAPID เรียบร้อย\n\n";
echo "public key : $publicKey\n";
echo "private key : (เก็บไว้ในฐานข้อมูลแล้ว ไม่แสดงออกหน้าจอ)\n";
echo "subject     : $subject\n\n";
echo "ขั้นต่อไป: เข้าหน้าตั้งค่าการแจ้งเตือนในแอป แล้วกดเปิดรับการแจ้งเตือน\n";
