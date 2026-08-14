<?php
declare(strict_types=1);

/**
 * อ่านพารามิเตอร์จาก query string และ JSON body รวมกัน
 *
 * frontend เดิมส่ง POST body เป็น text/plain ที่ข้างในเป็น JSON
 * (เลี่ยง CORS preflight ของ Apps Script) จึงต้องอ่าน php://input เอง
 * ไม่ใช่พึ่ง $_POST
 */
final class Input
{
    private static ?array $body = null;

    public static function body(): array
    {
        if (self::$body !== null) {
            return self::$body;
        }
        $raw = file_get_contents('php://input') ?: '';
        $decoded = json_decode($raw, true);
        self::$body = is_array($decoded) ? $decoded : [];
        return self::$body;
    }

    /** ค่าจาก body ก่อน แล้วค่อย query string */
    public static function get(string $key, $default = null)
    {
        $b = self::body();
        if (array_key_exists($key, $b)) {
            return $b[$key];
        }
        return $_GET[$key] ?? $default;
    }

    public static function str(string $key, string $default = ''): string
    {
        $v = self::get($key, $default);
        return is_scalar($v) ? trim((string) $v) : $default;
    }

    public static function require_str(string $key): string
    {
        $v = self::str($key);
        if ($v === '') {
            Response::fail("ต้องระบุ $key", 422);
        }
        return $v;
    }

    public static function num(string $key, ?float $default = null): ?float
    {
        $v = self::get($key, null);
        if ($v === null || $v === '') {
            return $default;
        }
        return is_numeric($v) ? (float) $v : $default;
    }

    public static function int(string $key, ?int $default = null): ?int
    {
        $v = self::num($key, null);
        return $v === null ? $default : (int) $v;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $v = self::get($key, null);
        if ($v === null) {
            return $default;
        }
        if (is_bool($v)) {
            return $v;
        }
        return in_array(strtolower((string) $v), ['1', 'true', 'yes', 'on'], true);
    }

    public static function arr(string $key): array
    {
        $v = self::get($key, []);
        return is_array($v) ? $v : [];
    }

    /** จำกัดค่าให้อยู่ในชุดที่อนุญาต ป้องกันค่าแปลกๆ หลุดไปถึง ENUM ของ MySQL */
    /**
     * ค่าที่ต้องอยู่ในชุดที่กำหนด — เทียบแบบไม่สนตัวพิมพ์ แล้วคืน "ค่าตามรูปแบบใน
     * $allowed" เสมอ ผู้เรียกจึงเอาไปเขียนลงฐานได้ตรง ๆ โดยไม่ต้องแปลงอีก
     *
     * ⚠️ ของเดิม strtolower ค่าที่รับมาแล้วเทียบแบบ strict กับ $allowed ดิบ ๆ
     * ชุดที่ไม่ได้เป็นตัวพิมพ์เล็กล้วนจึงไม่มีทางตรงเลยสักค่า — ตำแหน่งนักกีฬา
     * (GK/DF/MF/FW/Player) แก้ไม่ได้ทั้งระบบ ได้ 422 ทุกครั้งที่กดบันทึก
     * ทั้งที่ค่าที่ส่งมาถูกต้องแล้ว
     */
    public static function enum(string $key, array $allowed, ?string $default = null): ?string
    {
        $v = self::str($key);
        if ($v === '') {
            return $default;
        }
        foreach ($allowed as $option) {
            if (strcasecmp($v, (string) $option) === 0) {
                return (string) $option;
            }
        }
        Response::fail("ค่า $key ไม่ถูกต้อง (รับได้: " . implode(', ', $allowed) . ')', 422);
    }
}
