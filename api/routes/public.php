<?php
declare(strict_types=1);

/**
 * งานที่ผู้ใช้ทั่วไปทำได้ — สมัครทีม บริจาค ทายผล
 *
 * ต่างจาก route อื่นตรงที่ไม่บังคับล็อกอินด้วยรหัสผ่าน (คนทั่วไปเข้าผ่าน LINE
 * หรือไม่ล็อกอินเลยก็ได้) กฎที่เคยอยู่แค่ฝั่งหน้าเว็บจึงต้องมาบังคับที่นี่ทั้งหมด:
 *
 *   - ปิดรับสมัครแล้วสมัครไม่ได้ (เดิมเช็คแค่ฝั่ง client ⇒ ยิง URL ตรงผ่านฉลุย)
 *   - เต็มเพดานทีมแล้วสมัครไม่ได้
 *   - โรงเรียนเดิมส่งซ้ำไม่ได้เกินเพดานต่อโรงเรียน
 *   - ทายผลได้ก่อนแข่งเท่านั้น และหนึ่งคนหนึ่งเสียงต่อนัด
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        'register'         => do_register($cfg),
        'submitDonation'   => submit_donation($cfg),
        'submitPrediction' => submit_prediction(),
        default            => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

// ── สมัครทีม ──────────────────────────────────────────────────────────────

/**
 * รับสมัครทีมจากหน้าเว็บสาธารณะ
 *
 * โรงเรียนถูก "หาให้เจอหรือสร้างใหม่" จากชื่อ เพราะระบบเดิมเก็บชื่อโรงเรียนเป็น
 * ข้อความในทุกทีม ทำให้พิมพ์ต่างกันนิดเดียวกลายเป็นคนละโรงเรียนแล้วรวมประวัติ
 * ข้ามฤดูไม่ได้ ตอนนี้ทุกทีมผูก school_id เสมอ
 */
function do_register(array $cfg): void
{
    $tournamentId = Input::str('tournamentId') ?: 'default';
    $t = Db::one('SELECT * FROM tournaments WHERE tournament_id = :tid',
        [':tid' => $tournamentId]);
    if ($t === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }

    // ── กฎที่ต้องบังคับฝั่ง server ────────────────────────────────────────
    if ((int) $t['registration_enabled'] !== 1) {
        Response::fail('ผู้ดูแลระบบปิดรับสมัครแล้ว', 409);
    }
    if ($t['registration_deadline'] !== null
        && strtotime((string) $t['registration_deadline']) < time()) {
        Response::fail('เลยกำหนดปิดรับสมัครแล้ว', 409,
            ['registrationDeadline' => $t['registration_deadline']]);
    }
    $current = (int) Db::value(
        "SELECT COUNT(*) FROM teams WHERE tournament_id = :tid2 AND status <> 'Withdrawn'",
        [':tid2' => $tournamentId]);
    $maxTeams = $t['max_teams'] === null ? 0 : (int) $t['max_teams'];
    if ($maxTeams > 0 && $current >= $maxTeams) {
        Response::fail("รับสมัครครบ $maxTeams ทีมแล้ว", 409,
            ['currentTeams' => $current, 'maxTeams' => $maxTeams]);
    }

    $schoolName = trim(Input::require_str('schoolName'));
    $teamName   = trim(Input::str('teamName')) ?: $schoolName;

    // ── หาโรงเรียน หรือสร้างใหม่ถ้ายังไม่มี ───────────────────────────────
    $school = Db::one('SELECT school_id FROM schools WHERE school_name = :name',
        [':name' => $schoolName]);
    if ($school === null) {
        $schoolId = 'S_' . (int) (microtime(true) * 1000) . '_' . random_int(100, 999);
        Db::exec(
            'INSERT INTO schools (school_id, school_name, short_name, district, province)
             VALUES (:sid, :name2, :short, :dist, :prov)',
            [
                ':sid'   => $schoolId,
                ':name2' => $schoolName,
                ':short' => Input::str('shortName'),
                ':dist'  => Input::str('district'),
                ':prov'  => Input::str('province'),
            ]
        );
    } else {
        $schoolId = (string) $school['school_id'];
    }

    $maxPer = max(1, (int) $t['max_teams_per_school']);
    $perSchool = (int) Db::value(
        "SELECT COUNT(*) FROM teams
          WHERE tournament_id = :tid3 AND school_id = :sid2 AND status <> 'Withdrawn'",
        [':tid3' => $tournamentId, ':sid2' => $schoolId]);
    if ($perSchool >= $maxPer) {
        Response::fail(
            "โรงเรียนนี้สมัครไว้ $perSchool ทีมแล้ว เกินเพดาน $maxPer ทีมต่อโรงเรียน",
            409, ['current' => $perSchool, 'max' => $maxPer]);
    }
    if (Db::value('SELECT team_id FROM teams WHERE tournament_id = :tid4 AND name = :tn',
            [':tid4' => $tournamentId, ':tn' => $teamName]) !== null) {
        Response::fail("มีทีมชื่อ \"$teamName\" ในรายการนี้แล้ว", 409);
    }

    // ── ไฟล์แนบ ──────────────────────────────────────────────────────────
    // ไฟล์เสียหนึ่งใบไม่ควรทำให้ใบสมัครทั้งใบหาย — เก็บเท่าที่เก็บได้แล้วรายงานกลับ
    $fileWarnings = [];
    $keep = static function (string $field, string $kind) use ($cfg, &$fileWarnings): string {
        try {
            return store_data_url(Input::str($field), $kind, $cfg);
        } catch (RuntimeException $e) {
            $fileWarnings[] = "$field: " . $e->getMessage();
            return '';
        }
    };
    $logoUrl = $keep('logoFile', 'logo');
    $docUrl  = $keep('documentFile', 'doc');
    $slipUrl = $keep('slipFile', 'slip');

    $teamId = 'T_' . (int) (microtime(true) * 1000) . '_' . random_int(100, 999);
    $players = Input::arr('players');

    Db::transaction(static function () use (
        $teamId, $tournamentId, $schoolId, $teamName,
        $logoUrl, $docUrl, $slipUrl, $players, $cfg, &$fileWarnings
    ): void {
        Db::exec(
            'INSERT INTO teams
                (team_id, tournament_id, school_id, name, short_name,
                 color_primary, color_secondary, logo_url, doc_url, slip_url, payment_status,
                 status, manager_name, manager_phone, coach_name, coach_phone,
                 director_name)
             VALUES (:id, :tid, :sid, :name, :short, :c1, :c2, :logo, :doc, :slip, :payment_status,
                     :status, :mgr, :mgrp, :coach, :coachp, :dir)',
            [
                ':id'     => $teamId,
                ':tid'    => $tournamentId,
                ':sid'    => $schoolId,
                ':name'   => $teamName,
                ':short'  => Input::str('shortName'),
                ':c1'     => Input::str('color') ?: '#2563EB',
                ':c2'     => Input::str('colorSecondary') ?: '#FFFFFF',
                ':logo'   => $logoUrl,
                ':doc'    => $docUrl,
                ':slip'   => $slipUrl,
                ':payment_status' => $slipUrl === '' ? 'Unpaid' : 'Pending',
                // สมัครจากหน้าเว็บ = ส่งแล้วรอตรวจ ไม่ใช่อนุมัติทันที
                ':status' => 'Submitted',
                ':mgr'    => Input::str('managerName'),
                ':mgrp'   => Input::str('managerPhone'),
                ':coach'  => Input::str('coachName'),
                ':coachp' => Input::str('coachPhone'),
                ':dir'    => Input::str('directorName'),
            ]
        );

        foreach ($players as $i => $p) {
            $name = trim((string) ($p['name'] ?? ''));
            if ($name === '') {
                continue;   // แถวที่เว้นว่างไว้ ไม่ต้องเก็บ
            }
            $photo = '';
            try {
                $photo = store_data_url((string) ($p['photoFile'] ?? $p['photoUrl'] ?? ''),
                    'player', $cfg);
            } catch (RuntimeException $e) {
                $fileWarnings[] = "รูปนักกีฬาคนที่ " . ($i + 1) . ': ' . $e->getMessage();
            }
            $num = trim((string) ($p['number'] ?? $p['sequence'] ?? ''));
            $bd  = trim((string) ($p['birthDate'] ?? ''));
            $ts  = $bd === '' ? false : strtotime($bd);
            Db::exec(
                'INSERT INTO players
                    (player_id, team_id, name, shirt_number, position,
                     photo_url, birth_date, display_order)
                 VALUES (:pid, :tid2, :pname, :num, :pos, :photo, :dob, :ord)',
                [
                    ':pid'   => 'P_' . (int) (microtime(true) * 1000) . '_' . $i
                                . '_' . random_int(10, 99),
                    ':tid2'  => $teamId,
                    ':pname' => $name,
                    // '' ต้องเป็น NULL ไม่งั้น uq_player_shirt ชนกันเอง
                    ':num'   => $num === '' ? null : $num,
                    ':pos'   => (string) ($p['position'] ?? 'Player'),
                    ':photo' => $photo,
                    ':dob'   => $ts === false ? null : date('Y-m-d', $ts),
                    ':ord'   => $i,
                ]
            );
        }
    });

    Audit::log('team', $teamId, 'register', null,
        ['school' => $schoolName, 'tournament' => $tournamentId,
         'players' => count($players)]);
    Cache::flush();

    Response::ok([
        'teamId'     => $teamId,
        'schoolId'   => $schoolId,
        'status'     => 'Submitted',
        'warnings'   => $fileWarnings,
        'message'    => 'ส่งใบสมัครแล้ว รอผู้จัดการแข่งขันตรวจสอบ',
    ]);
}

// ── บริจาค ────────────────────────────────────────────────────────────────

function submit_donation(array $cfg): void
{
    $amount = (float) (Input::num('amount') ?? 0);
    if ($amount <= 0) {
        Response::fail('จำนวนเงินต้องมากกว่า 0', 422);
    }

    $tournamentId = Input::str('tournamentId');
    if ($tournamentId !== '' && Db::value(
            'SELECT 1 FROM tournaments WHERE tournament_id = :tid',
            [':tid' => $tournamentId]) === null) {
        $tournamentId = '';   // รายการถูกลบไปแล้ว — เก็บยอดไว้แต่ไม่ผูกรายการ
    }

    try {
        $slipUrl = store_data_url(Input::str('slipFile') ?: Input::str('slipUrl'),
            'slip', $cfg);
        $taxUrl  = store_data_url(Input::str('taxFile') ?: Input::str('taxFileUrl'),
            'doc', $cfg);
    } catch (RuntimeException $e) {
        Response::fail('แนบสลิปไม่สำเร็จ: ' . $e->getMessage(), 422);
    }

    $id = 'DN_' . (int) (microtime(true) * 1000) . '_' . random_int(100, 999);
    Db::exec(
        'INSERT INTO donations
            (donation_id, tournament_id, donor_name, amount, phone, tax_id, address,
             is_edonation, is_anonymous, slip_url, tax_file_url, line_user_id, status)
         VALUES (:id, :tid2, :donor, :amt, :phone, :tax, :addr,
                 :edon, :anon, :slip, :taxf, :line, :status)',
        [
            ':id'     => $id,
            ':tid2'   => $tournamentId !== '' ? $tournamentId : null,
            ':donor'  => Input::str('donorName') ?: 'ผู้ไม่ประสงค์ออกนาม',
            ':amt'    => $amount,
            ':phone'  => Input::str('phone'),
            ':tax'    => Input::str('taxId'),
            ':addr'   => Input::str('address'),
            ':edon'   => Input::bool('isEdonation') ? 1 : 0,
            ':anon'   => Input::bool('isAnonymous') ? 1 : 0,
            ':slip'   => $slipUrl,
            ':taxf'   => $taxUrl,
            // ผูกกับบัญชีที่เข้าระบบอยู่จริง ไม่ใช่ค่าที่ client ส่งมา
            // ผู้บริจาคไม่ต้องเข้าระบบก็บริจาคได้ (เป็นช่องว่างได้) แต่ถ้าเข้าระบบอยู่
            // ต้องเป็นตัวเขาจริง ไม่งั้นใครก็ยัดยอดบริจาคใส่ชื่อคนอื่นได้
            ':line'   => (string) (Auth::user()['line_user_id'] ?? ''),
            // รอเจ้าหน้าที่ตรวจสลิปเสมอ — ยอดยังไม่นับรวมจนกว่าจะยืนยัน
            ':status' => 'Pending',
        ]
    );

    Audit::log('donation', $id, 'submit', null, ['amount' => $amount]);
    Cache::flush();

    Response::ok([
        'donationId' => $id,
        'status'     => 'Pending',
        'message'    => 'ขอบคุณสำหรับการสนับสนุน — รอเจ้าหน้าที่ตรวจสอบสลิป',
    ]);
}

// ── ทายผล ─────────────────────────────────────────────────────────────────

function submit_prediction(): void
{
    $matchId = Input::require_str('matchId');
    // ตัวตนจาก token เท่านั้น — เดิมรับ userId จาก body ทำให้ทายผลแทนคนอื่นได้
    // และสร้างบัญชีใหม่จากข้อมูลที่ client ส่งมาได้ด้วย (เหตุผลเต็มใน contests.php)
    $userId  = (string) Auth::requireLogin()['user_id'];
    $pick    = strtoupper(Input::str('prediction'));
    if ($pick !== 'A' && $pick !== 'B') {
        Response::fail('ต้องเลือกทีม A หรือ B', 422);
    }

    $m = Db::one('SELECT match_id, status, scheduled_time FROM matches
                   WHERE match_id = :mid', [':mid' => $matchId]);
    if ($m === null) {
        Response::fail('ไม่พบนัดนี้', 404);
    }
    // ทายหลังเริ่มแข่งแล้วไม่นับ — ของเดิมเปิดให้ทายย้อนหลังได้ทั้งหมด
    if ($m['status'] !== 'Scheduled') {
        Response::fail('นัดนี้เริ่มแข่งแล้ว ทายผลไม่ได้', 409,
            ['status' => $m['status']]);
    }

    // หนึ่งคนหนึ่งเสียงต่อนัด — เปลี่ยนใจได้ก่อนเริ่มแข่ง
    Db::exec(
        'INSERT INTO predictions (match_id, user_id, prediction)
         VALUES (:mid2, :uid3, :pick)
         ON DUPLICATE KEY UPDATE prediction = VALUES(prediction)',
        [':mid2' => $matchId, ':uid3' => $userId, ':pick' => $pick]
    );

    Cache::flush();
    Response::ok(['matchId' => $matchId, 'prediction' => $pick]);
}
