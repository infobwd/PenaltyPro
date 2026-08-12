<?php
declare(strict_types=1);

/**
 * ตัวช่วยแปลงรูปแบบข้อมูลที่ route ไหนก็ใช้ได้
 *
 * ทำไมต้องแยกออกมา: index.php require route แค่ไฟล์เดียวต่อคำขอ ฟังก์ชันที่
 * ประกาศไว้ใน routes/data.php จึงไม่มีตัวตนเวลาเรียก routes/teams.php
 *
 * เคสจริงที่เจอ: team_payload() ใน teams.php เรียก iso() ที่อยู่ใน data.php
 * ตราบใดที่ payment_reviewed_at ยังเป็น NULL ก็ไม่มีปัญหา เพราะ isset() เป็น false
 * แต่พอเจ้าภาพกดยืนยันสลิปค่าสมัคร คอลัมน์นั้นมีค่า -> เรียก iso() -> fatal
 * -> myTeams ตอบ 500 -> โรงเรียนเปิดหน้า /school แล้วไม่เห็นทีมตัวเองเลย
 * ทั้งที่ข้อมูลยังอยู่ครบ
 */

if (!function_exists('iso')) {
    /** DATETIME ของ MySQL -> ISO ที่ frontend เข้าใจ (เวลาไทย) */
    function iso(?string $dt): string
    {
        if ($dt === null || $dt === '' || str_starts_with($dt, '0000')) {
            return '';
        }
        $ts = strtotime($dt);
        return $ts === false ? '' : date('c', $ts);
    }
}

if (!function_exists('snake_to_camel')) {
    function snake_to_camel(string $s): string
    {
        return lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $s))));
    }
}
