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
 * ประเภทไฟล์ที่จะบังคับแปลงเป็น WebP ตอนเก็บ
 *
 * เริ่มที่รูปข่าวก่อนเพราะเป็นรูปที่ใหญ่ที่สุดในระบบ (เจ้าภาพอัปรูปจากกล้อง
 * มือถือเต็มใบ 3-5 MB) และแสดงบนหน้าแรกที่คนเปิดมากที่สุด
 *
 * เปิดให้ชนิดอื่นเพิ่มได้ด้วยการใส่ชื่อ kind ลงในรายการนี้ — 'player' กับ 'logo'
 * ได้ประโยชน์พอกัน แต่ยังไม่เปิดเพราะรูปนักกีฬาผูกกับหน้ารายงานตัวที่ใช้จริง
 * หน้างานแล้ว ควรเปลี่ยนตอนไม่มีการแข่งขัน
 */
const MEDIA_WEBP_KINDS = ['news'];

/** ด้านยาวสุดที่เก็บ — ตรงกับฝั่งเว็บใน services/imageResize.ts */
const MEDIA_MAX_DIMENSION = 1920;
const MEDIA_WEBP_QUALITY = 82;

/**
 * เซิร์ฟเวอร์นี้แปลง WebP ได้ไหม
 *
 * shared hosting บางเจ้าคอมไพล์ GD มาโดยไม่มี WebP และแทบไม่มีเจ้าไหนลง Imagick
 * ให้ ถ้าไม่เช็คก่อนแล้วเรียก imagewebp() ตรง ๆ จะ fatal error ทั้งคำขอ
 * = อัปรูปข่าวไม่ได้เลยทั้งระบบ ทั้งที่แค่ตัวช่วยประหยัดพื้นที่ทำงานไม่ได้
 */
function media_can_webp(): bool
{
    return function_exists('imagewebp') || class_exists('Imagick');
}

/**
 * ย่อรูปให้ไม่เกิน MEDIA_MAX_DIMENSION แล้วแปลงเป็น WebP
 *
 * คืน null เมื่อทำไม่ได้ — ผู้เรียกต้องเก็บไฟล์เดิมแทน ไม่ใช่ล้มทั้งการอัปโหลด
 *
 * ผลพลอยได้ที่สำคัญ: EXIF หายไปทั้งหมดเพราะเขียนภาพใหม่จาก pixel
 * รูปจากมือถือมีพิกัด GPS ติดมาด้วยเสมอ ซึ่งไม่ควรขึ้นเว็บโรงเรียน
 */
function media_to_webp(string $bytes, string $mime): ?string
{
    // GIF อาจเป็นภาพเคลื่อนไหว แปลงแล้วเหลือเฟรมเดียว — ปล่อยไว้อย่างเดิม
    if ($mime === 'image/gif' || $mime === 'image/webp' || !media_can_webp()) {
        return null;
    }
    if ($mime !== 'image/jpeg' && $mime !== 'image/png') {
        return null;
    }

    if (class_exists('Imagick')) {
        try {
            $im = new Imagick();
            $im->readImageBlob($bytes);
            $im->autoOrient();                 // แก้รูปมือถือที่ตะแคงตาม EXIF
            $im->stripImage();                 // ตัด EXIF/GPS ทิ้ง
            if ($im->getImageWidth() > MEDIA_MAX_DIMENSION
                || $im->getImageHeight() > MEDIA_MAX_DIMENSION) {
                // 0 = ให้คำนวณอีกด้านตามสัดส่วนเอง
                $im->resizeImage(
                    $im->getImageWidth() >= $im->getImageHeight() ? MEDIA_MAX_DIMENSION : 0,
                    $im->getImageWidth() >= $im->getImageHeight() ? 0 : MEDIA_MAX_DIMENSION,
                    Imagick::FILTER_LANCZOS, 1);
            }
            $im->setImageFormat('webp');
            $im->setImageCompressionQuality(MEDIA_WEBP_QUALITY);
            $out = $im->getImageBlob();
            $im->clear();
            return $out !== '' ? $out : null;
        } catch (Throwable $e) {
            error_log('[media] imagick webp failed: ' . $e->getMessage());
            // ตกลงไปลอง GD ต่อ ไม่ return ทันที
        }
    }

    if (!function_exists('imagewebp') || !function_exists('imagecreatefromstring')) {
        return null;
    }

    $src = @imagecreatefromstring($bytes);
    if ($src === false) {
        return null;
    }

    try {
        // GD ไม่อ่าน EXIF ให้เอง ต้องหมุนเองก่อนไม่งั้นรูปแนวตั้งจะออกมานอน
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $exif = @exif_read_data('data://image/jpeg;base64,' . base64_encode($bytes));
            $angle = match ((int) ($exif['Orientation'] ?? 0)) {
                3 => 180, 6 => -90, 8 => 90, default => 0,
            };
            if ($angle !== 0) {
                $rotated = @imagerotate($src, $angle, 0);
                if ($rotated !== false) {
                    imagedestroy($src);
                    $src = $rotated;
                }
            }
        }

        $w = imagesx($src);
        $h = imagesy($src);
        $scale = max($w, $h) > MEDIA_MAX_DIMENSION ? MEDIA_MAX_DIMENSION / max($w, $h) : 1.0;

        if ($scale < 1.0) {
            $nw = max(1, (int) round($w * $scale));
            $nh = max(1, (int) round($h * $scale));
            $dst = imagecreatetruecolor($nw, $nh);
            // PNG โปร่งใสต้องรักษา alpha ไว้ ไม่งั้นพื้นหลังกลายเป็นดำสนิท
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
            imagedestroy($src);
            $src = $dst;
        } else {
            imagealphablending($src, false);
            imagesavealpha($src, true);
        }

        ob_start();
        $ok = imagewebp($src, null, MEDIA_WEBP_QUALITY);
        $out = (string) ob_get_clean();
        return ($ok && $out !== '') ? $out : null;
    } catch (Throwable $e) {
        error_log('[media] gd webp failed: ' . $e->getMessage());
        return null;
    } finally {
        if (is_resource($src) || $src instanceof GdImage) {
            imagedestroy($src);
        }
    }
}

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

    $sub = preg_replace('/[^a-z]/', '', strtolower($kind)) ?: 'general';

    /**
     * แปลงเป็น WebP ก่อนเก็บ สำหรับ kind ที่เปิดไว้
     *
     * ทำที่นี่ไม่ใช่ที่ route เพราะทุกทางเดิน (multipart, base64 จากหน้าสมัคร,
     * ของเดิมที่ยัดมาใน JSON) ผ่านฟังก์ชันนี้หมด ถ้าดักที่ route จะมีทางที่หลุด
     *
     * แปลงไม่ได้ก็เก็บไฟล์เดิม — ประหยัดพื้นที่เป็นเรื่องรอง แต่อัปรูปข่าวไม่ได้
     * คือระบบใช้งานไม่ได้
     */
    if (in_array($sub, MEDIA_WEBP_KINDS, true)) {
        $converted = media_to_webp($bytes, $mime);
        /**
         * ใช้ผลลัพธ์เฉพาะเมื่อเล็กลงจริง
         *
         * WebP แบบ lossy ไม่ได้ชนะเสมอ — PNG ที่เป็นลายเส้น กราฟ ตารางคะแนน
         * หรือภาพหน้าจอ บีบด้วย PNG ได้ดีกว่ามาก เคยเจอกรณีที่แปลงแล้ว
         * "ใหญ่ขึ้น 5 เท่า" ซึ่งตรงข้ามกับเหตุผลทั้งหมดที่ทำเรื่องนี้
         *
         * ยกเว้นตอนที่ต้องย่อขนาดอยู่แล้ว — รูปที่กว้างเกิน 1920 ต้องย่อเสมอ
         * เพราะเปลืองทั้งพื้นที่และแบนด์วิดท์ตอนผู้อ่านโหลดหน้าข่าว
         */
        if ($converted !== null) {
            $dim = @getimagesizefromstring($bytes);
            $mustShrink = $dim !== false
                && max((int) $dim[0], (int) $dim[1]) > MEDIA_MAX_DIMENSION;

            if (strlen($converted) < strlen($bytes) || $mustShrink) {
                Audit::log('file', $sub, 'webp', null,
                    ['from' => $mime, 'before' => strlen($bytes), 'after' => strlen($converted)]);
                $bytes = $converted;
                $mime = 'image/webp';
            }
        }
    }

    // ชื่อไฟล์สุ่ม — ไม่ใช้ชื่อเดิมของผู้ใช้ กันทั้ง path traversal และชื่อชนกัน
    $name = date('Ymd') . '_' . bin2hex(random_bytes(8)) . '.' . MEDIA_ALLOWED[$mime];
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
