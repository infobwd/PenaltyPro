<?php
declare(strict_types=1);

/**
 * ตัวช่วยค้นหาที่หลาย route ใช้ร่วมกัน
 *
 * ต้องอยู่ใน lib ไม่ใช่ในไฟล์ route เพราะ index.php include route ทีละไฟล์
 * ฟังก์ชันที่ประกาศใน route หนึ่งจึงเรียกจากอีก route ไม่ได้
 * (เคยเจอมาแล้วตอน drive_img อยู่ใน data.php แล้ว teams.php เรียกจน 500)
 */

/**
 * ชื่อทีม -> team_id ภายในรายการแข่งขันนั้น
 *
 * หน้าจอฝั่งแอดมินหลายที่ยังส่งชื่อทีมมา (สัญญาเดิมของ Apps Script ที่ชีต
 * เก็บแต่ชื่อ) ตรงนี้แปลงกลับเป็น id เพื่อให้ตารางคะแนนยังถูกแม้ทีมเปลี่ยนชื่อ
 * หาไม่เจอคืน null แล้วให้ผู้เรียกเก็บเป็นชื่อล้วนแทน — ดีกว่าเขียนไม่ลง
 */
function team_id_by_name(string $tournamentId, string $name): ?string
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }
    $id = Db::value(
        'SELECT team_id FROM teams
          WHERE tournament_id = :tid AND name = :name
          LIMIT 1',
        [':tid' => $tournamentId, ':name' => $name]
    );
    return $id === null ? null : (string) $id;
}
