<?php
declare(strict_types=1);

/**
 * ลบฟอนต์ที่ mPDF แถมมาแต่ระบบนี้ไม่ได้ใช้
 *
 * mPDF แถมฟอนต์มา ~88 MB (DejaVu, ฟอนต์อินเดีย อาหรับ ฯลฯ) ซึ่งเราไม่แตะเลย
 * เพราะเกียรติบัตรใช้ Sarabun ที่เก็บไว้ที่ api/fonts/ อย่างเดียว
 * บน shared hosting การอัป 88 MB ที่ไม่ได้ใช้คือทั้งเปลืองโควตาและอัปนาน
 *
 * ⚠️ ต้องรันทุกครั้งหลัง composer install / composer update
 *    (composer จะดึงฟอนต์กลับมาให้ใหม่เสมอ)
 *
 * วิธีใช้:  php api/tools/trim-mpdf-fonts.php
 */

$dir = __DIR__ . '/../vendor/mpdf/mpdf/ttfonts';

if (!is_dir($dir)) {
    fwrite(STDERR, "ไม่พบ $dir — ยังไม่ได้ติดตั้ง mPDF หรือลบไปแล้ว\n");
    exit(0);
}

$before = 0;
$removed = 0;
foreach (new DirectoryIterator($dir) as $f) {
    if ($f->isDot() || !$f->isFile()) {
        continue;
    }
    $before += $f->getSize();
    if (unlink($f->getPathname())) {
        $removed++;
    }
}

printf("ลบฟอนต์ที่ไม่ได้ใช้ %d ไฟล์ คืนพื้นที่ %.1f MB\n", $removed, $before / 1048576);
printf("เกียรติบัตรใช้ฟอนต์จาก api/fonts/ ซึ่งไม่ถูกแตะต้อง\n");
