<?php
declare(strict_types=1);

/**
 * ?action=health — ตรวจว่าทุกชิ้นต่อกันถูก ใช้ได้ทันทีหลังอัปขึ้นโฮสต์
 *
 * ตั้งใจให้เรียกได้โดยไม่ต้องล็อกอิน แต่ไม่บอกอะไรที่ช่วยโจมตี
 * (ไม่บอกชื่อฐานข้อมูล ผู้ใช้ หรือ path จริง)
 */

function handle(string $action, array $cfg): void
{
    $checks = [];
    $fail = 0;

    $add = static function (string $name, bool $ok, string $detail = '')
        use (&$checks, &$fail): void {
        $checks[] = ['name' => $name, 'ok' => $ok] + ($detail !== '' ? ['detail' => $detail] : []);
        if (!$ok) {
            $fail++;
        }
    };

    $add('php_version', version_compare(PHP_VERSION, '8.1', '>='), PHP_VERSION);
    foreach (['pdo_mysql', 'json', 'mbstring', 'openssl', 'curl'] as $ext) {
        $add("ext_$ext", extension_loaded($ext));
    }
    // imagick/gd ไม่บังคับ — แต่ถ้าไม่มีจะแปลง WebP ฝั่ง server ไม่ได้
    $checks[] = ['name' => 'ext_imagick', 'ok' => extension_loaded('imagick'),
                 'required' => false];
    $checks[] = ['name' => 'ext_gd', 'ok' => extension_loaded('gd'), 'required' => false];

    // ── ความพร้อมของการแจ้งเตือน (ไม่บังคับ — ระบบใช้งานได้แม้ยังไม่พร้อม) ──
    $checks[] = ['name' => 'push_vendor_installed',
        'ok' => is_file(__DIR__ . '/../vendor/autoload.php'), 'required' => false,
        'detail' => 'อัปโหลด api/vendor/ ขึ้นโฮสต์แล้วหรือยัง'];
    $hasVapid = (string) (Db::value(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'vapid_public_key'") ?? '') !== '';
    $checks[] = ['name' => 'push_vapid_key', 'ok' => $hasVapid, 'required' => false,
        'detail' => 'รัน php api/tools/generate-vapid.php เพื่อสร้างคีย์'];
    $checks[] = ['name' => 'table_notifications',
        'ok' => Db::value("SHOW TABLES LIKE 'notifications'") !== null, 'required' => false,
        'detail' => 'รัน db/07-notifications.sql'];

    // ── คอลัมน์ที่โค้ดใช้จริง ต้องมี ไม่งั้นพังทันทีตอนใช้งาน ──────────────
    // ลืมรัน migration บนโฮสต์เป็นสิ่งที่เกิดง่ายที่สุดตอนอัปของ
    // และอาการที่ได้คือ 500 เปล่า ๆ ตอนครูกดเข้าหน้าโรงเรียน หาสาเหตุยาก
    // จึงให้ health บอกตรง ๆ ว่าต้องรันไฟล์ไหน
    $hasCol = static function (string $table, string $col): bool {
        try {
            return Db::value(
                'SELECT COLUMN_NAME FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = :t AND COLUMN_NAME = :c',
                [':t' => $table, ':c' => $col]
            ) !== null;
        } catch (Throwable) {
            return false;
        }
    };
    $add('col_users_school', $hasCol('users', 'school_id'), 'รัน db/06-user-school.sql');
    $add('col_users_school_verified', $hasCol('users', 'school_verified'),
        'รัน db/08-school-verified.sql');
    $add('col_team_sessions_user', $hasCol('team_sessions', 'user_id'),
        'รัน db/09-team-session-user.sql');
    $add('table_player_checkins',
        Db::value("SHOW TABLES LIKE 'player_checkins'") !== null,
        'รัน db/10-player-checkin.sql');
    $add('col_tournaments_branding', $hasCol('tournaments', 'competition_logo'),
        'รัน db/11-tournament-branding.sql');
    $add('col_matches_highlight', $hasCol('matches', 'highlight_url'),
        'รัน db/12-match-highlight.sql');

    try {
        $ver = (string) Db::value('SELECT VERSION()');
        $add('database', true, $ver);

        $collation = Db::all(
            "SELECT TABLE_NAME FROM information_schema.TABLES
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
                AND TABLE_COLLATION <> 'utf8mb4_unicode_ci'"
        );
        // collation ไม่ตรง = JOIN ไม่ใช้ index แล้วช้าแบบหาสาเหตุยาก (pitfall P2)
        $add('collation_consistent', $collation === [],
            $collation === [] ? '' : count($collation) . ' ตารางไม่ตรง');

        $tables = ['tournaments', 'schools', 'teams', 'players', 'matches',
                   'kicks', 'users', 'app_settings'];
        $counts = [];
        foreach ($tables as $t) {
            $counts[$t] = (int) Db::value("SELECT COUNT(*) FROM `$t`");
        }
        $add('tables_present', true);
    } catch (Throwable $e) {
        $add('database', false, 'ต่อฐานข้อมูลไม่ได้');
        $counts = [];
        error_log('[health] ' . $e->getMessage());
    }

    $cacheDir = $cfg['cache']['dir'] ?? '';
    $add('cache_writable', $cacheDir !== '' && is_dir($cacheDir) && is_writable($cacheDir));
    $upDir = $cfg['upload']['dir'] ?? '';
    $add('uploads_writable', $upDir !== '' && is_dir($upDir) && is_writable($upDir));

    $channelId = (string) ($cfg['line']['channel_id'] ?? '');
    $checks[] = ['name' => 'line_channel_id', 'ok' => $channelId !== '',
                 'required' => false];

    Response::raw([
        'status' => $fail === 0 ? 'success' : 'error',
        'ready'  => $fail === 0,
        'failed' => $fail,
        'checks' => $checks,
        'counts' => $counts,
    ], $fail === 0 ? 200 : 500);
}
