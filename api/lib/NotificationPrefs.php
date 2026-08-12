<?php
declare(strict_types=1);

/**
 * การตั้งค่าการแจ้งเตือนรายบุคคล
 *
 * เก็บเป็น JSON map { ประเภท => เปิด/ปิด } ใน users.notification_preferences_json
 * ถ้าไม่มีค่า (ผู้ใช้ยังไม่เคยตั้ง) จะใช้ค่าเริ่มต้นตามบทบาท
 *
 * ทำไมต้องมีค่าเริ่มต้นแยกตามบทบาท: ครูที่ส่งทีมสนใจแค่เรื่องทีมตัวเอง
 * ส่วนแอดมินต้องรู้ทุกใบสมัครที่เข้ามา ถ้าใช้ค่าเดียวกันหมด ฝ่ายหนึ่งจะโดนสแปม
 * อีกฝ่ายจะพลาดเรื่องสำคัญ
 */
final class NotificationPrefs
{
    /** ประเภทการแจ้งเตือนทั้งหมดที่ระบบรองรับ */
    public const TYPES = [
        // เกี่ยวกับทีมของตัวเอง
        'team_approved',
        'team_rejected',
        'payment_verified',
        'roster_reminder',
        // เกี่ยวกับการแข่งขัน
        'match_scheduled',
        'match_result',
        'match_starting',
        // งานของผู้ดูแล
        'team_submitted',
        'payment_submitted',
        // ทั่วไป
        'news',
        'system_announcement',
    ];

    /**
     * ค่าเริ่มต้นตามบทบาท
     *
     * 'user' คือครู/ผู้ปกครองที่เข้าผ่าน LINE — ให้เฉพาะเรื่องที่เกี่ยวกับตัวเอง
     * 'staff'/'admin' คือผู้จัดการแข่งขัน — ต้องรู้ทุกอย่างที่ต้องลงมือทำ
     */
    public static function getDefaultsByRole(string $role): array
    {
        $map = [
            'admin' => [
                'team_submitted', 'payment_submitted', 'team_approved', 'team_rejected',
                'payment_verified', 'match_scheduled', 'match_result', 'match_starting',
                'news', 'system_announcement',
            ],
            'staff' => [
                'team_submitted', 'payment_submitted', 'match_scheduled', 'match_result',
                'match_starting', 'news', 'system_announcement',
            ],
            'user' => [
                'team_approved', 'team_rejected', 'payment_verified', 'roster_reminder',
                'match_scheduled', 'match_result', 'match_starting',
                'news', 'system_announcement',
            ],
        ];
        return $map[$role] ?? ['news', 'system_announcement'];
    }

    /** ค่าที่ใช้จริงของผู้ใช้คนหนึ่ง — คืนครบทุกประเภทเสมอ */
    public static function get(string $userId): array
    {
        $row = Db::one(
            'SELECT notification_preferences_json, role FROM users WHERE user_id = :uid',
            [':uid' => $userId]
        );
        if ($row === null) {
            return self::allFalse();
        }

        $defaults = self::getDefaultsByRole((string) ($row['role'] ?? 'user'));
        $defaultMap = [];
        foreach (self::TYPES as $t) {
            $defaultMap[$t] = in_array($t, $defaults, true);
        }

        $raw = $row['notification_preferences_json'] ?? null;
        if (!$raw) {
            return $defaultMap;
        }
        $parsed = json_decode((string) $raw, true);
        if (!is_array($parsed)) {
            return $defaultMap;
        }

        // ประเภทที่เพิ่มเข้ามาทีหลังจะไม่มีใน JSON เก่า — เติมด้วยค่าเริ่มต้น
        // ไม่ใช่ปิดทิ้ง ไม่งั้นผู้ใช้เก่าจะไม่ได้รับเรื่องใหม่โดยไม่รู้ตัว
        $out = [];
        foreach (self::TYPES as $t) {
            $out[$t] = array_key_exists($t, $parsed)
                ? (bool) $parsed[$t]
                : $defaultMap[$t];
        }
        return $out;
    }

    public static function isEnabled(string $userId, string $type): bool
    {
        return (bool) (self::get($userId)[$type] ?? false);
    }

    /** บันทึก — เก็บเฉพาะประเภทที่รู้จัก กัน JSON บวมจากค่าที่ client ส่งมั่ว */
    public static function set(string $userId, array $prefs): bool
    {
        $clean = [];
        foreach (self::TYPES as $t) {
            if (array_key_exists($t, $prefs)) {
                $clean[$t] = (bool) $prefs[$t];
            }
        }
        return Db::exec(
            'UPDATE users SET notification_preferences_json = :json WHERE user_id = :uid',
            [':json' => json_encode($clean, JSON_UNESCAPED_UNICODE), ':uid' => $userId]
        ) >= 0;
    }

    private static function allFalse(): array
    {
        $out = [];
        foreach (self::TYPES as $t) {
            $out[$t] = false;
        }
        return $out;
    }
}
