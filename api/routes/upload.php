<?php
declare(strict_types=1);

/**
 * อัปโหลดไฟล์ — รูปนักกีฬา โลโก้ทีม เอกสารหลักฐาน สลิปโอนเงิน
 *
 * รับได้ 2 แบบ:
 *   1. multipart/form-data (แนะนำ — ไม่บวมและมี progress จริง)
 *   2. base64 ใน JSON (รองรับของเดิมที่ frontend ส่งแบบนี้)
 *
 * ไฟล์เก็บลงดิสก์ของโฮสต์ทันทีแล้วตอบ URL กลับ ผู้ใช้จึงเห็นผลทันที
 * (cron ค่อยส่งขึ้น Drive เป็น backup ทีหลัง — ดู api/cron/)
 *
 * ตัวเขียนไฟล์จริงอยู่ที่ lib/Media.php เพราะหน้าสมัครก็ใช้ตัวเดียวกัน
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        'uploadFile' => do_upload($cfg),
        default      => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

function do_upload(array $cfg): void
{
    // โรงเรียน (รหัส) หรือเจ้าหน้าที่เท่านั้น — ไม่เปิดให้คนทั่วไปอัปไฟล์ขึ้นโฮสต์
    if (Auth::schoolId() === null && !Auth::isLoggedIn()) {
        Response::fail('ต้องเข้าสู่ระบบก่อนอัปโหลดไฟล์', 401);
    }

    // multipart ส่ง field มาทาง $_POST ส่วน Input:: อ่านเฉพาะ JSON body กับ query
    // ถ้าไม่ดู $_POST ด้วย ไฟล์ที่อัปแบบ multipart จะตกไปอยู่ใน general/ ทั้งหมด
    $kind = Input::str('kind')
        ?: (is_string($_POST['kind'] ?? null) ? trim($_POST['kind']) : '')
        ?: 'general';   // player | logo | doc | slip

    $bytes = null;
    $origName = '';

    if (!empty($_FILES['file']['tmp_name'])) {
        $f = $_FILES['file'];
        if ((int) $f['error'] !== UPLOAD_ERR_OK) {
            Response::fail('อัปโหลดไม่สำเร็จ (รหัส ' . $f['error'] . ')', 400);
        }
        $bytes = (string) file_get_contents($f['tmp_name']);
        $origName = (string) $f['name'];
    } else {
        // base64 แบบเดิม: "data:image/jpeg;base64,...."
        $data = Input::str('file');
        if ($data === '') {
            Response::fail('ไม่พบไฟล์ที่ส่งมา', 422);
        }
        if (!preg_match('#^data:([^;]+);base64,(.*)$#s', $data, $m)) {
            Response::fail('รูปแบบไฟล์ไม่ถูกต้อง', 422);
        }
        $decoded = base64_decode($m[2], true);
        if ($decoded === false) {
            Response::fail('ถอดรหัสไฟล์ไม่ได้', 422);
        }
        $bytes = $decoded;
        $origName = Input::str('filename');
    }

    try {
        $url = store_file($bytes, $kind, $cfg, $origName);
    } catch (RuntimeException $e) {
        // ไฟล์ผิดชนิด/ใหญ่เกิน เป็นความผิดของคำขอ ไม่ใช่ระบบพัง
        Response::fail($e->getMessage(), 422);
    }

    Response::ok([
        'url'  => $url,
        'kind' => $kind,
        'size' => strlen($bytes),
    ]);
}
