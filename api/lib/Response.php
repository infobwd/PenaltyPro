<?php
declare(strict_types=1);

/**
 * รูปแบบ response + CORS + ตัวจับเวลาสำหรับ ?debug=1
 *
 * รูปแบบ payload คงของเดิมไว้ทุกอย่าง (`{status:'success'|'error', ...}`)
 * เพื่อให้ frontend ย้ายมาได้โดยแก้แค่ base URL กับ header auth
 */
final class Response
{
    private static array $timings = [];
    private static array $warnings = [];
    private static float $t0;
    private static bool $debug = false;
    private static array $allowedOrigins = [];

    public static function boot(array $allowedOrigins, bool $allowDebug): void
    {
        self::$t0 = microtime(true);
        self::$allowedOrigins = $allowedOrigins;
        self::$debug = $allowDebug && (($_GET['debug'] ?? '') === '1');
        self::cors();
    }

    private static function cors(): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        // frontend อยู่โดเมนเดียวกัน จึงไม่มี Origin header ในกรณีปกติ
        if ($origin !== '' && in_array($origin, self::$allowedOrigins, true)) {
            header("Access-Control-Allow-Origin: $origin");
            header('Access-Control-Allow-Credentials: true');
            header('Vary: Origin');
        }
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');

        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }

    public static function isDebug(): bool
    {
        return self::$debug;
    }

    /** จับเวลาแต่ละบล็อกงาน — โผล่ใน ?debug=1 */
    public static function time(string $label, callable $fn)
    {
        $t = microtime(true);
        try {
            return $fn();
        } finally {
            self::$timings[$label] = round((microtime(true) - $t) * 1000, 2);
        }
    }

    /**
     * คิวรีที่ล้มเหลวต้องไม่ทำให้ทั้ง endpoint พัง — บันทึกเป็น warning
     * แล้วส่งส่วนที่เหลือออกไป (ดู "Q12_NEW_METRIC_FAILED" ใน skill)
     */
    public static function warn(string $code, string $detail = ''): void
    {
        // รายละเอียดของ exception อาจมีชื่อโฮสต์/ผู้ใช้ฐานข้อมูล — เปิดเผยเฉพาะตอน debug
        self::$warnings[] = ($detail !== '' && self::$debug) ? "$code: $detail" : $code;
    }

    public static function hasWarnings(): bool
    {
        return self::$warnings !== [];
    }

    public static function ok(array $payload = [], int $code = 200): void
    {
        self::send($payload + ['status' => 'success'], $code);
    }

    /** ส่ง payload ดิบ (getData ต้องคงรูปเดิมที่ frontend คาดไว้) */
    public static function raw(array $payload, int $code = 200): void
    {
        self::send($payload, $code);
    }

    public static function fail(string $message, int $code = 400, array $extra = []): void
    {
        self::send($extra + ['status' => 'error', 'message' => $message], $code);
    }

    private static function send(array $payload, int $code): void
    {
        // ธงบอกผลที่เชื่อได้เสมอ
        //
        // ok()/fail() ใช้ `$payload + [...]` ซึ่งไม่เขียนทับคีย์ที่มีอยู่แล้ว
        // endpoint ที่คืนสถานะของตัวเองมาในชื่อ status (submitTeam -> 'Submitted',
        // reviewTeam -> 'Approved') จึงกลืนตัวบอกสำเร็จ/ผิดพลาดหายไปเงียบ ๆ
        // ฝั่งเว็บรอดมาได้เพราะดู HTTP code เป็นหลัก แต่ client อื่นไม่มีอะไรให้ยึด
        $payload['ok'] = $code < 400;

        if (self::$warnings !== []) {
            $payload['warnings'] = self::$warnings;
        }
        if (self::$debug) {
            $payload['debug'] = [
                'total_ms'         => round((microtime(true) - self::$t0) * 1000, 2),
                'query_timings_ms' => self::$timings,
                'query_count'      => count(Db::queryLog()),
                'queries'          => Db::queryLog(),
                'peak_memory_mb'   => round(memory_get_peak_usage(true) / 1048576, 2),
            ];
        }

        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}
