<?php
declare(strict_types=1);

/**
 * File cache สำหรับ response ที่อ่านอย่างเดียว
 *
 * เป้าหมายจริงคือรับ ~100 คนดูพร้อมกันวันแข่ง โดยไม่ให้ทุกคนไปโดน MySQL
 * ข้อมูลทั้งฐานเล็กมาก (13k แถว) จึงไม่ต้องใช้ Redis เลย
 *
 * กติกา cache key (pitfall P6): ต้องมีทุกมิติที่ทำให้ response ต่างกัน
 * ที่สำคัญที่สุดคือ **ระดับสิทธิ์** ไม่งั้น response ของ admin จะถูก cache
 * แล้วเสิร์ฟให้คนทั่วไปในคำขอถัดไป
 */
final class Cache
{
    private static string $dir = '';
    private static int $ttl = 300;
    private static string $version = 'v1';

    public static function configure(array $cfg): void
    {
        self::$dir     = $cfg['dir'];
        self::$ttl     = (int) $cfg['ttl'];
        self::$version = $cfg['version'];

        if (!is_dir(self::$dir)) {
            @mkdir(self::$dir, 0775, true);
        }
    }

    /**
     * @param array<string,scalar|null> $dims มิติที่ทำให้ผลลัพธ์ต่างกัน
     *        (section, page, filter, ...) — ระดับสิทธิ์ถูกเติมให้อัตโนมัติ
     */
    public static function key(string $name, array $dims = []): string
    {
        // ผู้ใช้ต่างบทบาทเห็นข้อมูลไม่เท่ากัน จึงต้องแยก cache
        // ถ้าไม่แยก response ของแอดมิน (ที่มีเบอร์โทร/ข้อมูลผู้บริจาค) จะถูก
        // cache แล้วเสิร์ฟให้คนทั่วไปในคำขอถัดไป — pitfall P5/P6
        $scope = match (true) {
            Auth::isAdmin()      => 'admin',
            Auth::isStaff()      => 'staff',
            // โรงเรียนเห็นข้อมูลทีมตัวเองเท่านั้น -> ผูก school_id เข้าคีย์
            Auth::schoolId() !== null => 'sch_' . Auth::schoolId(),
            Auth::isLoggedIn()   => 'user',
            default              => 'public',
        };

        $parts = [$name, self::$version, $scope];
        ksort($dims);
        foreach ($dims as $k => $v) {
            if ($v === null || $v === '') {
                continue;
            }
            $val = is_bool($v) ? ($v ? '1' : '0') : (string) $v;
            // ค่ายาว/มีอักขระแปลก -> ย่อเป็น hash ไม่ให้ชื่อไฟล์พัง
            if (strlen($val) > 24 || !preg_match('/^[\w.-]+$/u', $val)) {
                $val = substr(sha1($val), 0, 10);
            }
            $parts[] = "$k-$val";
        }

        return preg_replace('/[^\w.-]/u', '_', implode('_', $parts)) . '.json';
    }

    /**
     * @param int|null $ttl อายุเฉพาะคีย์นี้ (วินาที) — ว่างคือใช้ค่ากลางจาก config
     *
     * ที่ต้องมี: กระดานผลสดถูก poll ทุกไม่กี่วินาที ถ้าใช้ TTL กลาง 5 นาที
     * ผู้พากย์จะเห็นสกอร์ช้ากว่าความจริงถึง 5 นาที แต่จะเลิกแคชไปเลยก็ไม่ได้
     * เพราะวันแข่งมีคนเปิดพร้อมกันหลักร้อย — TTL สั้น ๆ ตรึงภาระฐานข้อมูลไว้ที่
     * ประมาณหนึ่งคิวรีต่อช่วง TTL ไม่ว่าจะมีคนดูกี่คน
     */
    public static function get(string $key, ?int $ttl = null): ?array
    {
        $path = self::$dir . '/' . $key;
        if (!is_file($path) || filemtime($path) + ($ttl ?? self::$ttl) < time()) {
            return null;
        }
        $raw = @file_get_contents($path);
        if ($raw === false) {
            return null;
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : null;
    }

    public static function put(string $key, array $payload): void
    {
        $path = self::$dir . '/' . $key;
        $tmp  = $path . '.' . getmypid() . '.tmp';
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return;
        }
        // เขียนลง temp แล้ว rename เพื่อให้ผู้อ่านไม่เจอไฟล์ที่เขียนค้างอยู่
        if (@file_put_contents($tmp, $json, LOCK_EX) !== false) {
            @rename($tmp, $path);
        }
    }

    /**
     * ล้าง cache ที่ขึ้นต้นด้วย prefix — เรียกหลังทุก write
     * เช่น flush('data') ล้างทุก scope/section ของ getData
     */
    public static function flush(string $prefix = ''): void
    {
        $pattern = self::$dir . '/' . ($prefix === '' ? '' : $prefix . '_') . '*.json';
        foreach (glob($pattern) ?: [] as $f) {
            @unlink($f);
        }
    }

    /** ห่อการอ่านที่แคชได้ — เขียนครั้งเดียวใช้ได้ทุก endpoint */
    public static function remember(string $key, callable $fn): array
    {
        $hit = self::get($key);
        if ($hit !== null) {
            if (Response::isDebug()) {
                $hit['_cache'] = 'hit';
            }
            return $hit;
        }
        $fresh = $fn();
        // ห้ามแคช response ที่มีคิวรีล้มเหลว ไม่งั้นข้อมูลที่ขาดหายจะถูกเสิร์ฟ
        // ต่ออีก 5 นาทีทั้งที่ฐานข้อมูลกลับมาปกติแล้ว
        if (!Response::hasWarnings()) {
            self::put($key, $fresh);
        }
        if (Response::isDebug()) {
            $fresh['_cache'] = Response::hasWarnings() ? 'miss (ไม่แคชเพราะมี warning)' : 'miss';
        }
        return $fresh;
    }
}
