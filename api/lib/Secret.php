<?php
declare(strict_types=1);

/**
 * เข้ารหัส/ถอดรหัสข้อความสั้น ๆ ที่ต้องอ่านกลับได้
 *
 * ใช้กับรหัสเข้าใช้งานของโรงเรียนอย่างเดียว — ผู้ดูแลต้องเปิดดูได้เพื่อบอก
 * ครูทางโทรศัพท์ โดยไม่ต้องออกรหัสใหม่ (ซึ่งจะทำให้รหัสที่แจกไปแล้วตายหมด)
 *
 * ⚠️ ห้ามใช้กับรหัสผ่านผู้ใช้ — รหัสผ่านต้องเป็น hash ทางเดียวเสมอ
 * เพราะไม่มีเหตุผลใดที่ระบบต้องอ่านรหัสผ่านของใครกลับมาได้
 *
 * AES-256-GCM ให้ทั้งความลับและการตรวจว่าไม่ถูกแก้ไข (authenticated encryption)
 * ถ้าใครไปแก้ค่าในฐานข้อมูลตรง ๆ การถอดรหัสจะล้มเหลวแทนที่จะคืนค่าขยะ
 */
final class Secret
{
    private const CIPHER = 'aes-256-gcm';
    private static string $key = '';

    public static function configure(string $appSecret): void
    {
        // app_secret เป็น hex 64 ตัว -> ทำให้เป็นคีย์ 32 ไบต์ที่คงที่
        self::$key = hash('sha256', 'access-code|' . $appSecret, true);
    }

    /** @return string|null คืน null ถ้าเข้ารหัสไม่ได้ (จะได้ไม่เก็บค่าขยะ) */
    public static function encrypt(string $plain): ?string
    {
        if (self::$key === '' || $plain === '') {
            return null;
        }
        $iv = random_bytes(12);
        $tag = '';
        $ct = openssl_encrypt($plain, self::CIPHER, self::$key,
            OPENSSL_RAW_DATA, $iv, $tag);
        if ($ct === false) {
            return null;
        }
        // เก็บ iv + tag + ciphertext ไว้ด้วยกัน จะได้ไม่ต้องมีคอลัมน์เพิ่ม
        return $iv . $tag . $ct;
    }

    /** @return string|null คืน null ถ้าถอดไม่ได้ (คีย์เปลี่ยน/ข้อมูลถูกแก้) */
    public static function decrypt(?string $blob): ?string
    {
        if (self::$key === '' || $blob === null || strlen($blob) < 29) {
            return null;
        }
        $iv  = substr($blob, 0, 12);
        $tag = substr($blob, 12, 16);
        $ct  = substr($blob, 28);
        $out = openssl_decrypt($ct, self::CIPHER, self::$key,
            OPENSSL_RAW_DATA, $iv, $tag);
        return $out === false ? null : $out;
    }
}
