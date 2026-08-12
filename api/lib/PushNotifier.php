<?php
declare(strict_types=1);

use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

/**
 * ส่งการแจ้งเตือน — ลงกล่องในแอปเสมอ และยิงเข้าเครื่องถ้าผู้ใช้เปิดไว้
 *
 * หลักการที่ยึด:
 *   1. บันทึกลงกล่องก่อนเสมอ แล้วค่อยยิง push — push ล้มเหลวข้อความต้องไม่หาย
 *   2. เคารพการตั้งค่ารายบุคคล ยกเว้นประเภท 'system_announcement'
 *      ที่ถือว่าทุกคนต้องได้รับ (ใช้เฉพาะเรื่องที่กระทบทุกคนจริง ๆ)
 *   3. ห้ามโยน exception ออกไป — การแจ้งเตือนล้มเหลวต้องไม่ทำให้การบันทึกผล
 *      หรือการอนุมัติทีมพังตามไปด้วย
 *   4. เรียกหลัง commit เสมอ ไม่เรียกในทรานแซกชัน
 *
 * ⚠️ ถ้ายังไม่ได้ติดตั้ง vendor/ (composer) หรือยังไม่ได้ตั้งคีย์ VAPID
 *    ระบบจะยังทำงานได้ปกติ แค่ไม่มี push เข้าเครื่อง กล่องในแอปยังครบ
 */
final class PushNotifier
{
    private static ?bool $libReady = null;

    /** มีไลบรารีส่ง push ให้ใช้หรือยัง — โหลด vendor/ แบบ lazy ครั้งเดียว */
    private static function libraryReady(): bool
    {
        if (self::$libReady !== null) {
            return self::$libReady;
        }
        if (class_exists(WebPush::class)) {
            return self::$libReady = true;
        }
        $autoload = __DIR__ . '/../vendor/autoload.php';
        if (!is_file($autoload)) {
            return self::$libReady = false;
        }
        try {
            // ต้องอยู่ใน try — composer มี platform_check.php ที่ throw ทันที
            // ถ้าเวอร์ชัน PHP ของโฮสต์ต่ำกว่าที่ vendor ถูกสร้างมา
            // ถ้าไม่ดักไว้ ทั้ง API จะ 500 เพราะเรื่องการแจ้งเตือนอย่างเดียว
            require_once $autoload;
        } catch (Throwable $e) {
            error_log('[push] โหลด vendor/ ไม่ได้: ' . $e->getMessage());
            return self::$libReady = false;
        }
        return self::$libReady = class_exists(WebPush::class);
    }

    /** คีย์ VAPID จาก app_settings — คืน null ถ้ายังไม่ได้ตั้ง */
    private static function vapid(): ?array
    {
        $rows = Db::all(
            "SELECT setting_key, setting_value FROM app_settings
              WHERE setting_key IN ('vapid_public_key','vapid_private_key','vapid_subject')"
        );
        $map = [];
        foreach ($rows as $r) {
            $map[$r['setting_key']] = trim((string) $r['setting_value']);
        }
        if (($map['vapid_public_key'] ?? '') === '' || ($map['vapid_private_key'] ?? '') === '') {
            return null;
        }
        return [
            'subject'    => $map['vapid_subject'] ?: 'mailto:info@bwd.ac.th',
            'publicKey'  => $map['vapid_public_key'],
            'privateKey' => $map['vapid_private_key'],
        ];
    }

    /** เก็บลงกล่องในแอป */
    private static function store(
        string $userId, string $type, string $title, string $body,
        string $url, ?array $metadata
    ): void {
        try {
            Db::exec(
                'INSERT INTO notifications (user_id, type, title, body, url, metadata_json)
                 VALUES (:uid, :type, :title, :body, :url, :meta)',
                [
                    ':uid'   => $userId,
                    ':type'  => $type,
                    ':title' => mb_substr($title, 0, 200),
                    ':body'  => $body,
                    ':url'   => mb_substr($url, 0, 500),
                    ':meta'  => $metadata ? json_encode($metadata, JSON_UNESCAPED_UNICODE) : null,
                ]
            );
        } catch (Throwable $e) {
            error_log("[notify] เก็บกล่องแจ้งเตือนไม่สำเร็จ ($userId): " . $e->getMessage());
        }
    }

    /**
     * แจ้งผู้ใช้คนเดียว
     *
     * @param array|null $metadata ข้อมูลเสริม เช่น ['matchId' => 'M_1'] ให้หน้าเว็บ
     *                             สร้างลิงก์เองได้ถ้าเส้นทางในแอปเปลี่ยนไปภายหลัง
     */
    public static function notify(
        string $userId, string $type, string $title, string $body,
        string $url = '/', ?array $metadata = null
    ): void {
        try {
            if ($userId === '') {
                return;
            }
            if ($type !== 'system_announcement' && !NotificationPrefs::isEnabled($userId, $type)) {
                return;
            }

            self::store($userId, $type, $title, $body, $url, $metadata);

            $sub = Db::value(
                'SELECT push_subscription_json FROM users
                  WHERE user_id = :uid AND push_subscription_json IS NOT NULL',
                [':uid' => $userId]
            );
            if (!$sub) {
                return;   // ไม่ได้เปิด push — มีในกล่องก็พอ
            }
            $data = json_decode((string) $sub, true);
            if (!is_array($data) || empty($data['endpoint'])) {
                return;
            }
            self::dispatch($userId, $data, $title, $body, $url);
        } catch (Throwable $e) {
            error_log('[notify] ' . $e->getMessage());
        }
    }

    /** แจ้งหลายคนพร้อมกัน — ตัด id ซ้ำให้ก่อน คนที่เข้าเงื่อนไขหลายทางจะได้ใบเดียว */
    public static function notifyMany(
        array $userIds, string $type, string $title, string $body,
        string $url = '/', ?array $metadata = null
    ): int {
        $sent = 0;
        foreach (array_unique(array_filter($userIds)) as $uid) {
            self::notify((string) $uid, $type, $title, $body, $url, $metadata);
            $sent++;
        }
        return $sent;
    }

    /** แจ้งทุกคนที่มีบทบาทตามที่ระบุ (เช่น ผู้จัดการแข่งขันทั้งหมด) */
    public static function notifyByRole(
        array $roles, string $type, string $title, string $body,
        string $url = '/', ?array $metadata = null
    ): int {
        $roles = array_values(array_filter($roles, static fn($r) => in_array($r, ['admin', 'staff', 'user'], true)));
        if ($roles === []) {
            return 0;
        }
        // ชื่อ placeholder ต้องไม่ซ้ำกันในคิวรีเดียว ไม่งั้น PDO จะโยน HY093
        $names = [];
        $params = [];
        foreach ($roles as $i => $r) {
            $names[] = ":r$i";
            $params[":r$i"] = $r;
        }
        $rows = Db::all(
            'SELECT user_id FROM users WHERE role IN (' . implode(',', $names) . ')',
            $params
        );
        return self::notifyMany(array_column($rows, 'user_id'), $type, $title, $body, $url, $metadata);
    }

    /** แจ้งทุกคนที่ผูกกับโรงเรียนนี้ (ครูของโรงเรียนที่ส่งทีม) */
    public static function notifySchool(
        string $schoolId, string $type, string $title, string $body,
        string $url = '/', ?array $metadata = null
    ): int {
        if ($schoolId === '') {
            return 0;
        }
        $rows = Db::all('SELECT user_id FROM users WHERE school_id = :sid', [':sid' => $schoolId]);
        return self::notifyMany(array_column($rows, 'user_id'), $type, $title, $body, $url, $metadata);
    }

    /** ยิงเข้าเครื่องจริง 1 ราย */
    private static function dispatch(
        string $userId, array $subData, string $title, string $body, string $url
    ): void {
        if (!self::libraryReady()) {
            return;   // ยังไม่ได้ติดตั้ง vendor/ — ข้ามไปเงียบ ๆ กล่องในแอปมีแล้ว
        }
        $vapid = self::vapid();
        if ($vapid === null) {
            return;
        }

        try {
            $webPush = new WebPush(['VAPID' => $vapid]);
            $payload = json_encode([
                'title'    => $title,
                'body'     => mb_substr($body, 0, 300),
                'url'      => $url,
                // tag ไม่ซ้ำ ไม่งั้นเบราว์เซอร์แทนที่ใบเดิมเงียบ ๆ ผู้ใช้จะไม่รู้ว่ามีเรื่องใหม่
                'tag'      => 'penalty-' . bin2hex(random_bytes(4)),
                'renotify' => true,
            ], JSON_UNESCAPED_UNICODE);

            $report = $webPush->sendOneNotification(Subscription::create($subData), $payload);

            if ($report && !$report->isSuccess()) {
                $code = $report->getResponse() ? $report->getResponse()->getStatusCode() : 0;
                // 404/410 = ผู้ใช้ถอนสิทธิ์หรือล้างข้อมูลเบราว์เซอร์ — ล้างทิ้งไม่ต้องยิงซ้ำอีก
                if (in_array($code, [404, 410], true)) {
                    Db::exec('UPDATE users SET push_subscription_json = NULL WHERE user_id = :uid',
                        [':uid' => $userId]);
                }
                error_log("[push] ส่งไม่สำเร็จ ($userId) HTTP $code");
            }
        } catch (Throwable $e) {
            error_log("[push] ข้อผิดพลาด ($userId): " . $e->getMessage());
        }
    }
}
