<?php
declare(strict_types=1);

/**
 * โรงเรียนและรหัสเข้าใช้งาน
 *
 * รหัส 8 ตัวคือสิ่งเดียวที่กั้นระหว่างคนนอกกับการแก้ข้อมูลทีม จึงต้อง:
 *   - เก็บเป็น hash เท่านั้น ระบบไม่เคยเก็บรหัสจริง
 *   - แอดมินเห็นได้ครั้งเดียวตอนออกรหัส (เอาไปพิมพ์แจก)
 *   - ลืมแล้วออกใหม่ได้ 1 คลิก และรหัสเก่าตายทันทีพร้อม session ที่ค้าง
 */

/** ตัด 0/O/1/I/L ออก เพราะพิมพ์ผิดกันบ่อยเวลาอ่านจากกระดาษ */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function handle(string $action, array $cfg): void
{
    match ($action) {
        'issueAccessCodes'    => issue_access_codes(),
        'regenerateAccessCode' => regenerate_access_code(),
        'listSchools'         => list_schools(),
        default               => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

function generate_code(): string
{
    $out = '';
    $max = strlen(CODE_ALPHABET) - 1;
    for ($i = 0; $i < 8; $i++) {
        $out .= CODE_ALPHABET[random_int(0, $max)];
    }
    return $out;
}

/**
 * ออกรหัสให้โรงเรียนทีเดียวทั้งชุด
 *
 * ค่าเริ่มต้นออกให้เฉพาะโรงเรียนที่ "มีทีมอยู่ในทัวร์นาเมนต์นี้" — ไม่ใช่ทุก
 * โรงเรียนในระบบ เพราะแจกรหัสให้คนที่ไม่ได้แข่งด้วยคือเพิ่มความเสี่ยงเปล่า ๆ
 *
 * โรงเรียนที่มีรหัสอยู่แล้วจะถูกข้าม เว้นแต่ส่ง regenerateExisting=true
 * (ไม่งั้นกดปุ่มซ้ำแล้วรหัสที่แจกไปทั้งหมดใช้ไม่ได้กะทันหัน)
 */
function issue_access_codes(): void
{
    Auth::requireAdmin();

    $tournamentId = Input::require_str('tournamentId');
    $regenerate   = Input::bool('regenerateExisting');

    $t = Db::one('SELECT tournament_id, name FROM tournaments WHERE tournament_id = :tid',
        [':tid' => $tournamentId]);
    if ($t === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }

    $schools = Db::all(
        'SELECT DISTINCT s.school_id, s.school_name, s.access_code_hash
           FROM schools s
           JOIN teams t ON t.school_id = s.school_id
          WHERE t.tournament_id = :tid2 AND s.is_active = 1
          ORDER BY s.school_name',
        [':tid2' => $tournamentId]
    );
    if ($schools === []) {
        Response::fail(
            'ยังไม่มีทีมในรายการแข่งขันนี้ — คัดลอกทีมจากรายการก่อนหน้า (cloneTeams) ก่อน',
            409
        );
    }

    $issued = [];
    $skipped = [];

    Db::transaction(static function () use ($schools, $regenerate, &$issued, &$skipped): void {
        foreach ($schools as $s) {
            if ($s['access_code_hash'] !== null && !$regenerate) {
                $skipped[] = $s['school_name'];
                continue;
            }
            $code = generate_code();
            Db::exec(
                'UPDATE schools
                    SET access_code_hash = :hash, access_code_issued_at = NOW()
                  WHERE school_id = :sid',
                [
                    ':hash' => password_hash($code, PASSWORD_BCRYPT),
                    ':sid'  => $s['school_id'],
                ]
            );
            // รหัสเก่าตาย -> session ที่ยังค้างต้องตายตาม
            Db::exec('DELETE FROM team_sessions WHERE school_id = :sid2',
                [':sid2' => $s['school_id']]);

            $issued[] = [
                'schoolId'   => $s['school_id'],
                'schoolName' => $s['school_name'],
                'accessCode' => $code,   // ครั้งเดียวเท่านั้น หลังจากนี้ดูย้อนหลังไม่ได้
            ];
        }
    });

    Audit::log('tournament', $tournamentId, 'issue_access_codes', null,
        ['issued' => count($issued), 'skipped' => count($skipped)]);
    Cache::flush();

    Response::ok([
        'tournamentId'   => $tournamentId,
        'tournamentName' => $t['name'],
        'issued'         => $issued,
        'skippedExisting' => $skipped,
        'notice' => 'รหัสเหล่านี้แสดงเพียงครั้งเดียว — พิมพ์หรือบันทึกไว้ก่อนปิดหน้านี้',
    ]);
}

function regenerate_access_code(): void
{
    Auth::requireAdmin();

    $schoolId = Input::require_str('schoolId');
    $s = Db::one('SELECT school_id, school_name FROM schools WHERE school_id = :sid',
        [':sid' => $schoolId]);
    if ($s === null) {
        Response::fail('ไม่พบโรงเรียนนี้', 404);
    }

    $code = generate_code();
    Db::transaction(static function () use ($schoolId, $code): void {
        Db::exec(
            'UPDATE schools SET access_code_hash = :hash, access_code_issued_at = NOW()
              WHERE school_id = :sid',
            [':hash' => password_hash($code, PASSWORD_BCRYPT), ':sid' => $schoolId]
        );
        Db::exec('DELETE FROM team_sessions WHERE school_id = :sid2', [':sid2' => $schoolId]);
    });

    Audit::log('school', $schoolId, 'regenerate_access_code');
    Response::ok([
        'schoolId'   => $s['school_id'],
        'schoolName' => $s['school_name'],
        'accessCode' => $code,
        'notice' => 'รหัสเดิมใช้ไม่ได้แล้ว และผู้ที่กำลังเข้าใช้อยู่ถูกออกจากระบบทันที',
    ]);
}

/** รายชื่อโรงเรียนพร้อมสถานะรหัส — ไม่คืนตัวรหัส (เก็บเป็น hash) */
function list_schools(): void
{
    Auth::requireStaff();
    $tournamentId = Input::str('tournamentId');

    $rows = Db::all(
        'SELECT s.school_id, s.school_name, s.district, s.province,
                s.access_code_issued_at, s.access_code_used_at,
                (s.access_code_hash IS NOT NULL) AS has_code,
                COUNT(t.team_id) AS team_count
           FROM schools s
           LEFT JOIN teams t ON t.school_id = s.school_id
            AND (:tid = :tid_blank OR t.tournament_id = :tid_match)
          WHERE s.is_active = 1
          GROUP BY s.school_id
          ORDER BY s.school_name',
        [':tid' => $tournamentId, ':tid_blank' => '', ':tid_match' => $tournamentId]
    );

    Response::ok(['schools' => array_map(static fn(array $s): array => [
        'schoolId'   => $s['school_id'],
        'schoolName' => $s['school_name'],
        'district'   => $s['district'],
        'province'   => $s['province'],
        'hasAccessCode' => (bool) $s['has_code'],
        'codeIssuedAt'  => $s['access_code_issued_at'],
        'codeUsedAt'    => $s['access_code_used_at'],
        'teamCount'     => (int) $s['team_count'],
    ], $rows)]);
}
