<?php
declare(strict_types=1);

/**
 * ชั้นบาง ๆ ครอบ mPDF — ตั้งค่าที่ต้องเหมือนกันทุกเอกสารไว้ที่เดียว
 *
 * ── ทำไมต้องใช้ mPDF ไม่ใช่หน้าต่างพิมพ์ของเบราว์เซอร์ ──────────────
 * เบราว์เซอร์ตัดภาพพื้นหลังทิ้งเมื่อพิมพ์ เว้นแต่ผู้ใช้ไปติ๊ก
 * "Background graphics" เอง ครูที่แจกใบให้เด็ก 54 คนจะเจอปัญหานี้ทุกคน
 * และผลลัพธ์ยังต่างกันไปตามเบราว์เซอร์ ทำให้ใบในงานเดียวกันไม่เหมือนกัน
 *
 * ── ทำไมต้องใช้ฟอนต์ใน api/fonts/ เท่านั้น ─────────────────────────
 * ฟอนต์สองไฟล์นั้นถูกแพตช์ให้มี glyph ว่างที่ U+200B แล้ว
 * mPDF แทรกอักขระตัวนี้เข้าไปในข้อความไทยเองเสมอ (Otl.php — หลังจุดทุกจุด
 * และตามพจนานุกรมตัดคำ) ถ้าฟอนต์ไม่มี glyph นี้จะได้กล่องสี่เหลี่ยม
 * โผล่กลางข้อความ เช่น "ก.▯ท.▯ 001/2569"
 * เอาฟอนต์ต้นฉบับจาก Google Fonts มาทับเมื่อไหร่ กล่องกลับมาทันที
 * ถ้าต้องอัปฟอนต์ใหม่ ให้รัน api/tools/patch-font.py ก่อนเสมอ
 */

require_once __DIR__ . '/../vendor/autoload.php';

const PDF_FONT_DIR = __DIR__ . '/../fonts';

/**
 * สร้าง mPDF ที่ตั้งค่าฟอนต์ไทยเรียบร้อยแล้ว
 *
 * useOTL = 0xFF จำเป็น ไม่ใช่ของแถม — ถ้าปิด วรรณยุกต์ที่อยู่เหนือสระ
 * จะหายไปจากภาพที่พิมพ์ออกมา ("ที่" กลายเป็น "ที", "ยิ่ง" กลายเป็น "ยิง")
 * ผลข้างเคียงคือการคัดลอกข้อความออกจากไฟล์ PDF จะได้บางคำไม่ครบ
 * ซึ่งยอมได้ เพราะเอกสารนี้มีไว้พิมพ์ ไม่ได้มีไว้ค้นข้อความ
 */
/**
 * @param array<string,array<string,mixed>>|null $fontdata ฟอนต์ที่จะลงทะเบียน
 *        null = ใช้ Sarabun อย่างเดียว (พอสำหรับเอกสารทั่วไป)
 *        ลงทะเบียนเฉพาะฟอนต์ที่ใช้จริง ไม่ใช่ทั้ง 6 ตระกูล เพราะ mPDF
 *        อ่านและทำ subset ทุกไฟล์ที่ลงทะเบียนไว้ตอนสร้างเอกสาร
 */
function pdf_new(string $format = 'A4-L', ?array $fontdata = null,
                 string $default = 'sarabun'): \Mpdf\Mpdf
{
    $tmp = sys_get_temp_dir() . '/mpdf';
    if (!is_dir($tmp)) {
        @mkdir($tmp, 0775, true);
    }

    $mpdf = new \Mpdf\Mpdf([
        'mode'   => 'utf-8',
        'format' => $format,
        'margin_left' => 0, 'margin_right' => 0,
        'margin_top' => 0, 'margin_bottom' => 0,
        'margin_header' => 0, 'margin_footer' => 0,
        'tempDir'  => $tmp,
        'fontDir'  => [PDF_FONT_DIR],
        'fontdata' => $fontdata ?? [
            'sarabun' => [
                'R' => 'Sarabun-Regular.ttf',
                'B' => 'Sarabun-Bold.ttf',
                'useOTL' => 0xFF,
            ],
        ],
        'default_font' => $default,
        'default_font_size' => 16,
    ]);

    // ตัดบรรทัดตามคำไทย ไม่ใช่ตัดกลางคำ
    $mpdf->useDictionaryLBR = true;
    $mpdf->SetAuthor('kickoff.bwd.ac.th');

    return $mpdf;
}

/**
 * แปลง URL ของไฟล์ที่เก็บไว้ ให้เป็น path ในเครื่องเพื่อให้ mPDF อ่านตรง ๆ
 *
 * สำคัญบน shared hosting: ถ้าปล่อยให้ mPDF ไปดึงรูปผ่าน HTTP กลับมาที่
 * เว็บตัวเอง จะกลายเป็น PHP รอ PHP ด้วยกันเอง ซึ่งค้างยาวจนหมดเวลาเมื่อ
 * มี worker จำกัด และบางโฮสต์ก็บล็อกการเรียกตัวเองอยู่แล้ว
 *
 * คืนค่าว่างเมื่อหาไฟล์ไม่เจอ — ผู้เรียกต้องถือว่า "ไม่มีพื้นหลัง"
 * ไม่ใช่ล้มทั้งการออกใบ
 */
function pdf_local_image(string $url, array $cfg): string
{
    $u = trim($url);
    if ($u === '') {
        return '';
    }

    $publicUrl = rtrim((string) ($cfg['upload']['public_url'] ?? '/storage/uploads'), '/');
    $dir       = rtrim((string) ($cfg['upload']['dir'] ?? ''), '/');
    if ($dir === '') {
        return '';
    }

    // ตัดโดเมนออกถ้ามี เหลือเฉพาะ path
    $path = parse_url($u, PHP_URL_PATH);
    if (!is_string($path) || $path === '') {
        return '';
    }

    if (!str_starts_with($path, $publicUrl . '/')) {
        return '';   // ไฟล์นอกคลังของเรา (ลิงก์ Drive เดิม) — ไม่ดึงมาใส่
    }

    $rel = substr($path, strlen($publicUrl) + 1);
    // กัน ../ ที่หลุดมาจากค่าที่เคยบันทึกไว้
    if ($rel === '' || str_contains($rel, '..')) {
        return '';
    }

    /**
     * ต้องผ่าน realpath ก่อนเสมอ
     *
     * upload.dir ตั้งเป็น __DIR__ . '/../storage/uploads' จึงมี ".." คาอยู่กลางทาง
     * PHP เปิดไฟล์แบบนั้นได้ปกติ แต่ mPDF แปลไม่ออกแล้ว "ข้ามรูปนั้นไปเงียบ ๆ"
     * ผลคือได้ใบเกียรติบัตรพื้นขาวโดยไม่มี error ให้เห็นเลยสักบรรทัด
     */
    $full = realpath($dir . '/' . $rel);
    return ($full !== false && is_file($full) && is_readable($full)) ? $full : '';
}
