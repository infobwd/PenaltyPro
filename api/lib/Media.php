<?php
declare(strict_types=1);

/**
 * แปลง URL ของไฟล์ให้ใช้แสดงผลได้จริง
 *
 * อยู่ใน lib/ เพราะหลาย route ต้องใช้ (getData, teams, ...) — ตอนแรกนิยามไว้ใน
 * data.php แล้วไปเรียกจาก teams.php ทำให้ `myTeams` พังทั้ง endpoint
 * เพราะ route ไม่ได้ include กัน
 */

/**
 * `drive.google.com/file/d/<id>/view` คือ "หน้าเว็บสำหรับดูไฟล์" ไม่ใช่ตัวรูป
 * ใส่ใน <img src> แล้วขึ้นรูปแตกเสมอ ตัวที่ใช้ได้คือ lh3.googleusercontent.com/d/<id>
 *
 * ระบบเดิมแปลงตรงนี้ตอนอ่านจากชีต (Code.js: toLh3Link) ข้อมูลในฐานข้อมูลจึงเป็น
 * รูปแบบผสมกัน — บางแถวเป็น /view บางแถวเป็น lh3 แล้ว จึงต้องแปลงตอนส่งออก
 * เหมือนเดิม ไม่ใช่ไปไล่แก้ข้อมูลย้อนหลัง
 */
function drive_img(?string $url): string
{
    $u = trim((string) $url);
    if ($u === '' || !str_contains($u, 'drive.google.com')) {
        return $u;   // lh3, URL ปกติ หรือไฟล์ที่อัปขึ้นโฮสต์เอง — ใช้ได้อยู่แล้ว
    }
    // รองรับทั้ง /file/d/<id>/view, /d/<id>/ และ ?id=<id>
    if (preg_match('#/d/([A-Za-z0-9_-]+)#', $u, $m)
        || preg_match('#[?&]id=([A-Za-z0-9_-]+)#', $u, $m)) {
        return 'https://lh3.googleusercontent.com/d/' . $m[1];
    }
    return $u;
}

/** ชนิดไฟล์ที่ยอมให้อัปได้ -> นามสกุลที่จะใช้เก็บ */
const MEDIA_ALLOWED = [
    'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
    'image/gif'  => 'gif', 'application/pdf' => 'pdf',
];

/**
 * เก็บไฟล์ลงดิสก์แล้วคืน URL สาธารณะ
 *
 * ใช้ร่วมกันระหว่าง uploadFile (multipart จากหน้าโรงเรียน) กับหน้าสมัคร/บริจาค
 * ที่ยังส่ง base64 มาแบบเดิม จึงต้องอยู่ใน lib ไม่ใช่ในไฟล์ route
 *
 * โยน RuntimeException เมื่อไฟล์ผิดชนิดหรือใหญ่เกิน — ผู้เรียกเป็นคนตัดสินว่า
 * จะตอบ error หรือข้ามไฟล์นั้นไป (หน้าสมัครควรข้าม ไม่ควรล้มทั้งใบสมัคร)
 */
function store_file(string $bytes, string $kind, array $cfg, string $origName = ''): string
{
    $dir = (string) ($cfg['upload']['dir'] ?? '');
    $publicUrl = rtrim((string) ($cfg['upload']['public_url'] ?? '/storage/uploads'), '/');
    $maxBytes = (int) ($cfg['upload']['max_bytes'] ?? 8388608);

    if ($dir === '' || !is_dir($dir) || !is_writable($dir)) {
        throw new RuntimeException('โฟลเดอร์เก็บไฟล์เขียนไม่ได้ — ตั้งสิทธิ์ storage/uploads เป็น 775');
    }
    if ($bytes === '') {
        throw new RuntimeException('ไฟล์ว่างเปล่า');
    }
    if (strlen($bytes) > $maxBytes) {
        throw new RuntimeException('ไฟล์ใหญ่เกิน ' . round($maxBytes / 1048576, 1) . ' MB');
    }

    // ตรวจชนิดจากเนื้อไฟล์จริง ไม่เชื่อนามสกุลหรือ Content-Type ที่ client ส่งมา
    $mime = (string) (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
    if (!isset(MEDIA_ALLOWED[$mime])) {
        throw new RuntimeException(
            'รองรับเฉพาะรูปภาพ (JPG/PNG/WebP/GIF) และไฟล์ PDF เท่านั้น');
    }

    // ชื่อไฟล์สุ่ม — ไม่ใช้ชื่อเดิมของผู้ใช้ กันทั้ง path traversal และชื่อชนกัน
    $name = date('Ymd') . '_' . bin2hex(random_bytes(8)) . '.' . MEDIA_ALLOWED[$mime];
    $sub = preg_replace('/[^a-z]/', '', strtolower($kind)) ?: 'general';
    $destDir = $dir . '/' . $sub;
    if (!is_dir($destDir) && !mkdir($destDir, 0775, true) && !is_dir($destDir)) {
        throw new RuntimeException('สร้างโฟลเดอร์เก็บไฟล์ไม่ได้');
    }
    if (file_put_contents($destDir . '/' . $name, $bytes) === false) {
        throw new RuntimeException('บันทึกไฟล์ไม่สำเร็จ');
    }

    Audit::log('file', $name, 'upload', null,
        ['kind' => $kind, 'bytes' => strlen($bytes), 'original' => $origName]);

    return "$publicUrl/$sub/$name";
}

/**
 * รับค่าที่อาจเป็น data URL (base64), URL ที่อัปไว้แล้ว หรือค่าว่าง
 * แล้วคืน URL ที่ใช้เก็บลงฐานข้อมูลได้
 *
 * หน้าสมัครของเดิมส่ง base64 มาทุกไฟล์ ส่วนหน้าใหม่ ๆ อัปแยกแล้วส่ง URL มา
 * ตัวนี้รับได้ทั้งสองแบบ จึงไม่ต้องแยกโค้ดสองทาง
 */
function store_data_url(?string $value, string $kind, array $cfg): string
{
    $v = trim((string) $value);
    if ($v === '') {
        return '';
    }
    if (!preg_match('#^data:([^;]+);base64,(.*)$#s', $v, $m)) {
        return $v;   // เป็น URL อยู่แล้ว (อัปมาก่อนหน้า หรือลิงก์ Drive เดิม)
    }
    $bytes = base64_decode($m[2], true);
    if ($bytes === false) {
        throw new RuntimeException('ถอดรหัสไฟล์ไม่ได้');
    }
    return store_file($bytes, $kind, $cfg);
}
