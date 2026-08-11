<?php
/**
 * คัดลอกไฟล์นี้เป็น config.php แล้วแก้ค่าให้ตรงกับโฮสต์
 * config.php อยู่ใน .gitignore — ห้าม commit
 *
 * โฮสต์ปลายทาง: kickoff.bwd.ac.th (DirectAdmin, PHP 8.3, MariaDB 10.6)
 */

return [
    'db' => [
        'host'    => 'localhost',
        'name'    => 'bwdacth_kickoff',
        'user'    => 'bwdacth_kickoff',
        'pass'    => '',
        'charset' => 'utf8mb4',
    ],

    // ใช้เซ็น token — สุ่มใหม่ด้วย: php -r "echo bin2hex(random_bytes(32));"
    // เปลี่ยนค่านี้ = เตะทุก session ออกจากระบบ (ทั้งผู้ใช้และโรงเรียน)
    'app_secret' => 'CHANGE_ME',

    // อายุ token ผู้ใช้ (วินาที) — 12 ชม. พอสำหรับวันแข่ง 1 วัน
    'session_ttl' => 43200,

    // อายุ session ของโรงเรียนที่เข้าด้วยรหัส — ยาวกว่าเพราะกรอกรายชื่อหลายวัน
    'team_session_ttl' => 604800,   // 7 วัน

    'cache' => [
        'dir' => __DIR__ . '/../storage/cache',
        // TTL สั้นเพราะผลแข่งเปลี่ยนระหว่างวัน — การเขียนทุกครั้งล้าง cache อยู่แล้ว
        'ttl' => 300,
        // bump ทุกครั้งที่รูปร่าง response เปลี่ยน ไม่งั้น cache เก่าถูกเสิร์ฟต่อ
        'version' => 'v1',
    ],

    'timezone' => 'Asia/Bangkok',

    'app_base_url' => 'https://kickoff.bwd.ac.th',

    'upload' => [
        'dir'        => __DIR__ . '/../storage/uploads',
        'public_url' => '/storage/uploads',
        'max_bytes'  => 8 * 1024 * 1024,
    ],

    // --- LINE ---------------------------------------------------------
    // channel_id ใช้ตรวจ ID token ฝั่ง server ว่า token ออกให้ channel เราจริง
    // ระบบเดิมไม่มีค่านี้ จึงเชื่อ lineUserId ที่ client ส่งมาดิบ ๆ = ปลอมได้
    // ทั้งสองค่าแก้ได้จากหน้าตั้งค่าแอดมิน (ตาราง app_settings) — ค่าที่นี่เป็น fallback
    'line' => [
        'channel_id' => '',
        'liff_id'    => '',
        'verify_url' => 'https://api.line.me/oauth2/v2.1/verify',
    ],

    // --- Google Drive (backup ของไฟล์อัปโหลด) --------------------------
    // ไฟล์เขียนลงดิสก์ก่อนเพื่อตอบผู้ใช้ทันที แล้ว cron ค่อยส่งขึ้น Drive
    // ขั้นตอนตั้งค่า service account: ดู api/README.md
    'drive' => [
        'enabled'                 => false,
        'service_account_path'    => '/home/USER/secure/kickoff-drive.json',
        'token_cache'             => __DIR__ . '/../storage/cache/.drive-token',
        'root_folder_id'          => '',
        'shared_drive'            => false,
        'shared_drive_id'         => '',
        // งานนี้เป็น "backup" ไม่ใช่การย้ายที่เก็บ — เก็บไฟล์ในเครื่องไว้ด้วย
        'delete_local_after_sync' => false,
        'batch_size'              => 10,
        'max_attempts'            => 5,
    ],

    // --- Web Push -----------------------------------------------------
    // สร้างคีย์ครั้งเดียวด้วย: php tools/gen-vapid.php
    'push' => [
        'enabled'     => false,
        'public_key'  => '',
        'private_key' => '',
        'subject'     => 'mailto:info@bwd.ac.th',
    ],

    // สำหรับเรียก cron ผ่าน HTTP — สุ่มด้วยคำสั่งเดียวกับ app_secret
    'cron_secret' => 'CHANGE_ME_TOO',

    // frontend อยู่โดเมนเดียวกัน (kickoff.bwd.ac.th) จึงไม่ต้องใช้ CORS
    // ใส่เพิ่มเฉพาะตอน dev — ห้ามใส่ '*' เพราะ API นี้มี auth
    'allowed_origins' => [],

    // เปิด ?debug=1 ได้หรือไม่ — ปิดบน production ยกเว้นตอนไล่ปัญหา
    'allow_debug' => true,

    // --- กันเดารหัสโรงเรียน --------------------------------------------
    'access_code' => [
        'max_attempts_per_ip'     => 5,    // ใน window ด้านล่าง
        'window_seconds'          => 900,  // 15 นาที
        'lockout_attempts'        => 10,
        'lockout_seconds'         => 3600, // 1 ชม.
    ],
];
