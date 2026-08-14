<?php
declare(strict_types=1);

/**
 * ตารางแข่ง — ประกบคู่อัตโนมัติ + จัดการรายนัด
 *
 * ของเดิมแอดมินต้องพิมพ์คู่แข่งทีละนัดเอง 57 นัด (สาย A-H + R16 + QF + SF + FINAL)
 * ซึ่งกินเวลาและพลาดง่าย เช่น ลืมคู่ ใส่ทีมซ้ำในนัดเดียว หรือทีมหนึ่งแข่ง 2 สนาม
 * พร้อมกัน ที่นี่จึงสร้างคู่ให้ทั้งสายและลงวัน เวลา สนามให้ในคำสั่งเดียว
 *
 * ยังคงแก้ด้วยมือได้ทุกนัด — อัตโนมัติเป็นตัวช่วยตั้งต้น ไม่ใช่ตัวบังคับ
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        'generateFixtures' => generate_fixtures(),
        'saveMatch'        => save_match(),
        'deleteMatch'      => delete_match(),
        'autoAssignGroups' => auto_assign_groups(),
        'deleteAllMatches' => delete_all_matches(),
        default            => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

/**
 * สร้างคู่แข่งแบบพบกันหมดในแต่ละสาย (round-robin)
 *
 * ใช้วิธี circle method: ตรึงทีมแรกไว้ แล้วหมุนที่เหลือ ได้ตารางที่ทุกทีม
 * ลงเล่นจำนวนนัดเท่ากันและไม่มีทีมไหนแข่งซ้อนกันเองในรอบเดียว
 * สายที่มีทีมเป็นจำนวนคี่จะมี "ทีมพัก" 1 ทีมต่อรอบโดยอัตโนมัติ
 */
function generate_fixtures(): void
{
    Auth::requireLogin();

    $tournamentId = Input::require_str('tournamentId');
    Perm::requireTournamentManager($tournamentId);

    $t = Db::one('SELECT tournament_id, name FROM tournaments WHERE tournament_id = :tid',
        [':tid' => $tournamentId]);
    if ($t === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }

    $replace = Input::bool('replace');

    // ถ้าส่งวันที่มา ให้สร้างทั้งคู่แข่งและตารางเวลาในครั้งเดียว
    // ยังคงรองรับ caller เก่าที่ไม่ส่ง scheduleDate โดยจะสร้างเฉพาะคู่เหมือนเดิม
    $scheduleDate = Input::str('scheduleDate');
    $withSchedule = $scheduleDate !== '';
    $startAt = null;
    $matchDuration = 0;
    $lunchEnabled = false;
    $lunchStartAt = null;
    $lunchEndAt = null;
    $groupVenues = [];

    if ($withSchedule) {
        $startTime = Input::str('startTime');
        $matchDuration = (int) (Input::int('matchDurationMinutes') ?? 0);
        $lunchEnabled = Input::bool('lunchBreakEnabled');
        $lunchStart = Input::str('lunchStart', '12:00');
        $lunchEnd = Input::str('lunchEnd', '13:00');
        $rawVenues = Input::arr('groupVenues');

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $scheduleDate)
            || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $startTime)) {
            Response::fail('วันที่หรือเวลาเริ่มแข่งขันไม่ถูกต้อง', 422);
        }
        [$year, $month, $day] = array_map('intval', explode('-', $scheduleDate));
        if (!checkdate($month, $day, $year)) {
            Response::fail('วันที่แข่งขันไม่ถูกต้อง', 422);
        }
        if ($matchDuration < 1 || $matchDuration > 240) {
            Response::fail('เวลาต่อคู่ต้องอยู่ระหว่าง 1–240 นาที', 422);
        }

        $startAt = new DateTimeImmutable("$scheduleDate $startTime");
        if ($lunchEnabled) {
            if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $lunchStart)
                || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $lunchEnd)) {
                Response::fail('ช่วงเวลาพักเที่ยงไม่ถูกต้อง', 422);
            }
            $lunchStartAt = new DateTimeImmutable("$scheduleDate $lunchStart");
            $lunchEndAt = new DateTimeImmutable("$scheduleDate $lunchEnd");
            if ($lunchEndAt <= $lunchStartAt) {
                Response::fail('เวลาจบพักต้องอยู่หลังเวลาเริ่มพัก', 422);
            }
        }

        foreach ($rawVenues as $group => $venue) {
            if (is_scalar($venue)) {
                $groupVenues[(string) $group] = trim((string) $venue);
            }
        }
    }

    // นัดที่แข่งไปแล้วห้ามถูกลบทิ้งโดยอัตโนมัติ — ผลการแข่งจะหาย
    $played = (int) Db::value(
        "SELECT COUNT(*) FROM matches
          WHERE tournament_id = :tid2 AND status <> 'Scheduled'",
        [':tid2' => $tournamentId]
    );
    $existing = (int) Db::value(
        'SELECT COUNT(*) FROM matches WHERE tournament_id = :tid3',
        [':tid3' => $tournamentId]
    );
    if ($existing > 0 && !$replace) {
        Response::fail(
            "รายการนี้มี $existing นัดอยู่แล้ว — ส่ง replace=true เพื่อสร้างใหม่ "
            . ($played > 0 ? "(นัดที่แข่งไปแล้ว $played นัดจะถูกเก็บไว้)" : ''),
            409, ['existing' => $existing, 'played' => $played]
        );
    }

    // เฉพาะทีมที่อนุมัติแล้วและมีสายเท่านั้น
    $teams = Db::all(
        "SELECT team_id, name, group_name
           FROM teams
          WHERE tournament_id = :tid4 AND status = 'Approved'
            AND group_name IS NOT NULL AND group_name <> ''
          ORDER BY group_name, name",
        [':tid4' => $tournamentId]
    );
    if ($teams === []) {
        Response::fail(
            'ยังไม่มีทีมที่อนุมัติและจัดสายแล้ว — อนุมัติทีมและแบ่งสายก่อนสร้างตารางแข่ง',
            409
        );
    }

    $byGroup = [];
    foreach ($teams as $tm) {
        $byGroup[$tm['group_name']][] = $tm;
    }
    ksort($byGroup);

    if ($withSchedule) {
        foreach (array_keys($byGroup) as $group) {
            if (($groupVenues[$group] ?? '') === '') {
                Response::fail("กรุณากำหนดสนามของสาย $group", 422);
            }
        }
    }

    $created = [];
    $skipped = [];
    // สายที่ใช้ชื่อสนามเดียวกันจะใช้ cursor เดียวกัน จึงไม่ถูกจัดแข่งชนกัน
    $venueCursors = [];

    Db::transaction(static function () use (
        $tournamentId, $byGroup, $replace, $withSchedule, $startAt,
        $matchDuration, $lunchEnabled, $lunchStartAt, $lunchEndAt,
        $groupVenues, &$venueCursors, &$created, &$skipped
    ): void {
        if ($replace) {
            // ลบเฉพาะนัดที่ยังไม่ได้แข่ง — ผลที่บันทึกไปแล้วต้องอยู่ต่อ
            Db::exec(
                "DELETE FROM matches
                  WHERE tournament_id = :tid AND status = 'Scheduled'",
                [':tid' => $tournamentId]
            );
        }

        foreach ($byGroup as $group => $list) {
            $n = count($list);
            if ($n < 2) {
                $skipped[] = "สาย $group มีทีมเดียว ข้ามไป";
                continue;
            }

            // circle method — ถ้าจำนวนคี่ เติม BYE เพื่อให้จับคู่ได้ลงตัว
            $arr = $list;
            if ($n % 2 === 1) {
                $arr[] = null;   // BYE
            }
            $size = count($arr);
            $rounds = $size - 1;
            $half = intdiv($size, 2);

            for ($r = 0; $r < $rounds; $r++) {
                for ($i = 0; $i < $half; $i++) {
                    $a = $arr[$i];
                    $b = $arr[$size - 1 - $i];
                    if ($a === null || $b === null) {
                        continue;   // ทีมพักรอบนี้
                    }

                    // มีคู่นี้อยู่แล้วไหม (กรณี replace แล้วนัดเก่ายังอยู่เพราะแข่งไปแล้ว)
                    $dup = Db::value(
                        'SELECT match_id FROM matches
                          WHERE tournament_id = :tid2
                            AND ((team_a_id = :a1 AND team_b_id = :b1)
                              OR (team_a_id = :b2 AND team_b_id = :a2))',
                        [
                            ':tid2' => $tournamentId,
                            ':a1' => $a['team_id'], ':b1' => $b['team_id'],
                            ':b2' => $b['team_id'], ':a2' => $a['team_id'],
                        ]
                    );
                    if ($dup !== null) {
                        $skipped[] = "{$a['name']} พบ {$b['name']} (มีอยู่แล้ว)";
                        continue;
                    }

                    $venue = '';
                    $scheduled = null;
                    if ($withSchedule && $startAt instanceof DateTimeImmutable) {
                        $venue = $groupVenues[$group];
                        $cursor = $venueCursors[$venue] ?? $startAt;
                        $endsAt = $cursor->modify("+$matchDuration minutes");

                        // ถ้าคู่ใดเริ่มก่อนพักแต่แข่งไปทับเวลาพัก ให้ย้ายทั้งคู่ไปหลังพัก
                        if ($lunchEnabled
                            && $lunchStartAt instanceof DateTimeImmutable
                            && $lunchEndAt instanceof DateTimeImmutable
                            && $cursor < $lunchEndAt && $endsAt > $lunchStartAt) {
                            $cursor = $lunchEndAt;
                            $endsAt = $cursor->modify("+$matchDuration minutes");
                        }

                        $scheduled = $cursor->format('Y-m-d H:i:s');
                        $venueCursors[$venue] = $endsAt;
                    }

                    $mid = 'M_' . (int) (microtime(true) * 1000) . '_'
                         . random_int(100, 999);
                    Db::exec(
                        'INSERT INTO matches
                            (match_id, tournament_id, team_a_id, team_b_id,
                             team_a_name, team_b_name, round_label, venue,
                             scheduled_time, status)
                         VALUES (:mid, :tid3, :ta, :tb, :tan, :tbn, :round,
                                 :venue, :scheduled, :st)',
                        [
                            ':mid'   => $mid,
                            ':tid3'  => $tournamentId,
                            ':ta'    => $a['team_id'],
                            ':tb'    => $b['team_id'],
                            ':tan'   => $a['name'],
                            ':tbn'   => $b['name'],
                            ':round' => "สาย $group นัดที่ " . ($r + 1),
                            ':venue' => $venue,
                            ':scheduled' => $scheduled,
                            ':st'    => 'Scheduled',
                        ]
                    );
                    $created[] = [
                        'matchId' => $mid,
                        'group'   => $group,
                        'round'   => $r + 1,
                        'teamA'   => $a['name'],
                        'teamB'   => $b['name'],
                        'venue'   => $venue,
                        'scheduledTime' => $scheduled,
                    ];
                }
                // หมุนทีม (ตรึงตัวแรกไว้)
                $fixed = array_shift($arr);
                $last  = array_pop($arr);
                array_unshift($arr, $last);
                array_unshift($arr, $fixed);
            }
        }
    });

    Audit::log('tournament', $tournamentId, 'generate_fixtures', null,
        ['created' => count($created), 'groups' => array_keys($byGroup)]);
    Cache::flush();

    Response::ok([
        'created'  => count($created),
        'matches'  => $created,
        'skipped'  => $skipped,
        'scheduled' => $withSchedule,
        'groups'   => array_map(static fn($g, $l): array => [
            'group' => $g, 'teams' => count($l),
        ], array_keys($byGroup), $byGroup),
    ]);
}

/**
 * สุ่มแบ่งสายให้ทีมที่อนุมัติแล้ว
 *
 * เป็น "ข้อเสนอ" ที่เขียนลงฐานเลย แต่แอดมินย้ายทีมทีหลังได้ทุกทีม
 * พยายามไม่ให้โรงเรียนเดียวกันอยู่สายเดียวกัน (กรณีส่ง 2 ทีม)
 */
function auto_assign_groups(): void
{
    Auth::requireLogin();

    $tournamentId = Input::require_str('tournamentId');
    Perm::requireTournamentManager($tournamentId);

    $groupCount = max(2, min(16, (int) (Input::int('groupCount') ?? 4)));

    $teams = Db::all(
        "SELECT team_id, name, school_id FROM teams
          WHERE tournament_id = :tid AND status = 'Approved'
          ORDER BY RAND()",
        [':tid' => $tournamentId]
    );
    if (count($teams) < $groupCount) {
        Response::fail(
            'จำนวนทีมที่อนุมัติแล้วน้อยกว่าจำนวนสายที่ต้องการ',
            422, ['approvedTeams' => count($teams), 'groupCount' => $groupCount]
        );
    }

    $letters = range('A', 'Z');
    $groups = array_fill(0, $groupCount, []);

    // แจกแบบงู (snake) เพื่อให้แต่ละสายมีจำนวนใกล้เคียงกัน
    // แล้วเลี่ยงไม่ให้โรงเรียนเดียวกันชนกันในสายเดียว
    $i = 0;
    foreach ($teams as $tm) {
        $placed = false;
        for ($try = 0; $try < $groupCount; $try++) {
            $g = ($i + $try) % $groupCount;
            $clash = false;
            foreach ($groups[$g] as $x) {
                if ($x['school_id'] === $tm['school_id']) { $clash = true; break; }
            }
            // เลือกสายที่ไม่ชนโรงเรียน และยังไม่ล้นเกินสายอื่น
            if (!$clash && count($groups[$g]) <= count($groups[$i % $groupCount])) {
                $groups[$g][] = $tm;
                $placed = true;
                break;
            }
        }
        if (!$placed) {
            $groups[$i % $groupCount][] = $tm;   // ยอมชนถ้าเลี่ยงไม่ได้จริง
        }
        $i++;
    }

    Db::transaction(static function () use ($groups, $letters): void {
        foreach ($groups as $gi => $list) {
            foreach ($list as $tm) {
                Db::exec(
                    'UPDATE teams SET group_name = :g, row_version = row_version + 1
                      WHERE team_id = :tid',
                    [':g' => $letters[$gi], ':tid' => $tm['team_id']]
                );
            }
        }
    });

    Audit::log('tournament', $tournamentId, 'auto_assign_groups', null,
        ['groups' => $groupCount, 'teams' => count($teams)]);
    Cache::flush();

    Response::ok([
        'groups' => array_map(static fn($gi, $list): array => [
            'group' => $letters[$gi],
            'teams' => array_map(static fn($t): string => $t['name'], $list),
        ], array_keys($groups), $groups),
        'notice' => 'ผลการแบ่งสายบันทึกแล้ว — ย้ายทีมด้วยมือได้ที่หน้าจัดการทีม',
    ]);
}

/** สร้าง/แก้ไขนัดเดียว — ใช้กับการจัดตารางด้วยมือ */
function save_match(): void
{
    Auth::requireLogin();

    $matchId = Input::str('matchId');
    $tournamentId = Input::require_str('tournamentId');
    Perm::requireTournamentManager($tournamentId);

    // หน้าจัดตารางฝั่งแอดมินยังส่งชื่อทีมมา (สัญญาเดิมของ Apps Script)
    // จึงรับได้ทั้ง id และชื่อ แล้วแปลงเป็น id ให้เสมอ ตารางคะแนนจะได้ไม่พังตอนเปลี่ยนชื่อทีม
    $teamA = Input::str('teamAId') ?: team_id_by_name($tournamentId, Input::str('teamA'));
    $teamB = Input::str('teamBId') ?: team_id_by_name($tournamentId, Input::str('teamB'));
    if ($teamA !== null && $teamA === $teamB) {
        Response::fail('ทีมเดียวกันแข่งกับตัวเองไม่ได้', 422);
    }

    // snapshot ชื่อ ณ เวลาจัดตาราง — ถ้าหา id ไม่เจอ ให้เก็บชื่อที่ส่งมาไว้ก่อน
    // ดีกว่าปล่อยว่าง เพราะช่องคู่แข่งบนตารางจะกลายเป็นบรรทัดเปล่า
    $fallback = [Input::str('teamA'), Input::str('teamB')];
    $names = [];
    foreach ([$teamA, $teamB] as $i => $tid) {
        $names[] = $tid === null
            ? $fallback[$i]
            : (string) (Db::value('SELECT name FROM teams WHERE team_id = :tid',
                [':tid' => $tid]) ?? $fallback[$i]);
    }

    $scheduled = Input::str('scheduledTime');
    $sched = $scheduled === '' ? null : date('Y-m-d H:i:s', (int) strtotime($scheduled));

    /**
     * สร้างแถวให้ก่อนถ้ายังไม่มี — หน้าผังการแข่งขันตั้ง match_id เองฝั่งเว็บ
     *
     * ⚠️ ของเดิม matchId ที่ไม่ว่างจะวิ่งเข้า UPDATE ทันที ถ้าแถวนั้นยังไม่มีในฐาน
     * (ช่องรอบ 16/32 ทีมที่ยังไม่เคยบันทึก) UPDATE จะไม่โดนแถวไหนเลย แล้ว API
     * ยังตอบ success ตามปกติ — แอดมินเห็นว่า "บันทึกสำเร็จ" แต่พอรีเฟรชผังก็ว่างเหมือนเดิม
     * เป็นที่มาของ "จัดรอบ 16/32 ทีมไม่ได้" (บน production มีนัดรอบแบ่งสาย 48 นัด
     * แต่รอบ R16/R32/QF/SF/FINAL เป็น 0 ทั้งที่จัดไปหลายรอบแล้ว)
     */
    if ($matchId !== '' && Db::value(
            'SELECT 1 FROM matches WHERE match_id = :mid_chk', [':mid_chk' => $matchId]) === null) {
        Db::exec(
            'INSERT INTO matches
                (match_id, tournament_id, team_a_id, team_b_id, team_a_name, team_b_name,
                 round_label, venue, scheduled_time, status)
             VALUES (:mid0, :tid0, :ta0, :tb0, :tan0, :tbn0, :round0, :venue0, :sched0, :st0)',
            [
                ':mid0' => $matchId, ':tid0' => $tournamentId,
                ':ta0' => $teamA, ':tb0' => $teamB,
                ':tan0' => $names[0], ':tbn0' => $names[1],
                ':round0' => Input::str('roundLabel'),
                ':venue0' => Input::str('venue'),
                ':sched0' => $sched,
                ':st0'    => 'Scheduled',
            ]
        );
        Audit::log('match', $matchId, 'create');
        Cache::flush();
        Response::ok(['matchId' => $matchId, 'created' => true]);
    }

    if ($matchId === '') {
        $matchId = 'M_' . (int) (microtime(true) * 1000) . '_' . random_int(100, 999);
        Db::exec(
            'INSERT INTO matches
                (match_id, tournament_id, team_a_id, team_b_id, team_a_name, team_b_name,
                 round_label, venue, scheduled_time, status)
             VALUES (:mid, :tid, :ta, :tb, :tan, :tbn, :round, :venue, :sched, :st)',
            [
                ':mid' => $matchId, ':tid' => $tournamentId,
                ':ta' => $teamA, ':tb' => $teamB,
                ':tan' => $names[0], ':tbn' => $names[1],
                ':round' => Input::str('roundLabel'),
                ':venue' => Input::str('venue'),
                ':sched' => $sched,
                ':st'    => 'Scheduled',
            ]
        );
        Audit::log('match', $matchId, 'create');
    } else {
        // อ่านค่าเดิมไว้เทียบว่าเวลา/สนามเปลี่ยนไหม — ต้องอ่านก่อน UPDATE
        $existing = Db::one(
            'SELECT scheduled_time, venue, team_a_id, team_b_id, team_a_name, team_b_name
               FROM matches WHERE match_id = :mid_old',
            [':mid_old' => $matchId]
        ) ?? [];

        // ⚠️ แก้เฉพาะเวลา/สนามโดยไม่ส่งทีมมาด้วย = ต้องไม่ล้างคู่แข่งทิ้ง
        // ก่อนหน้านี้ค่าที่ไม่ได้ส่งมากลายเป็น NULL ทำให้นัดนั้นไม่มีคู่แข่งอีกเลย
        // และตารางคะแนนนับผลนัดนั้นไม่ได้ (ของเดิมรอดเพราะหน้าเว็บส่งทีมมาทุกครั้ง
        // แต่พึ่งพฤติกรรมของ client ไม่ได้ — ใครยิง API ตรงก็ทำข้อมูลหายได้)
        $teamsProvided = Input::str('teamAId') !== '' || Input::str('teamBId') !== ''
            || Input::str('teamA') !== '' || Input::str('teamB') !== '';
        if (!$teamsProvided && $existing !== []) {
            $teamA = $existing['team_a_id'];
            $teamB = $existing['team_b_id'];
            $names = [(string) $existing['team_a_name'], (string) $existing['team_b_name']];
        }

        // ลิงก์ไฮไลต์: ส่งมาว่าง = ไม่ได้แตะช่องนี้ ให้คงของเดิม
        //
        // หน้าแก้ไขนัดส่งเฉพาะช่องที่กรอก ถ้าตีความว่างเปล่าว่า "ลบ"
        // การแก้เวลาแข่งอย่างเดียวจะลบลิงก์ไฮไลต์ทิ้งโดยไม่มีใครตั้งใจ
        // ต้องส่งขีดกลางมาเท่านั้นถึงจะถือว่าตั้งใจล้างค่า
        // ใช้กับ livestream_url ด้วย ด้วยเหตุผลเดียวกัน — เดิมเขียนทับด้วยค่าว่างเสมอ
        // ใครก็ตามที่บันทึกนัดโดยไม่ได้ส่งลิงก์มาด้วยจะลบลิงก์ถ่ายทอดสดทิ้งทั้งที่ไม่ได้ตั้งใจ
        $CLEAR = '-';
        $liveIn = Input::str('livestreamUrl');
        $hlIn   = Input::str('highlightUrl');
        $hltIn  = Input::str('highlightTitle');
        $liveSet = $liveIn !== '' ? 1 : 0;
        $hlSet   = $hlIn !== '' ? 1 : 0;
        $hltSet  = $hltIn !== '' ? 1 : 0;
        $liveVal = $liveIn === $CLEAR ? '' : $liveIn;
        $hlVal   = $hlIn === $CLEAR ? '' : $hlIn;
        $hltVal  = $hltIn === $CLEAR ? '' : $hltIn;

        Db::exec(
            'UPDATE matches SET
                team_a_id = :ta, team_b_id = :tb,
                team_a_name = :tan, team_b_name = :tbn,
                round_label = :round, venue = :venue, scheduled_time = :sched,
                livestream_url = CASE WHEN :liveset = 1 THEN :liveval ELSE livestream_url END,
                highlight_url = CASE WHEN :hlset = 1 THEN :hlval ELSE highlight_url END,
                highlight_title = CASE WHEN :hltset = 1 THEN :hltval ELSE highlight_title END,
                row_version = row_version + 1
              WHERE match_id = :mid AND tournament_id = :tid',
            [
                ':ta' => $teamA, ':tb' => $teamB,
                ':tan' => $names[0], ':tbn' => $names[1],
                ':round' => Input::str('roundLabel'),
                ':venue' => Input::str('venue'),
                ':sched' => $sched,
                ':liveset' => $liveSet,
                ':liveval' => $liveVal,
                ':hlset'  => $hlSet,
                ':hlval'  => $hlVal,
                ':hltset' => $hltSet,
                ':hltval' => $hltVal,
                ':mid' => $matchId, ':tid' => $tournamentId,
            ]
        );
        Audit::log('match', $matchId, 'update');

        // เวลาหรือสนามเปลี่ยน = เรื่องที่ต้องรีบบอก ทีมอาจเดินทางผิดเวลา
        $timeChanged  = (string) ($existing['scheduled_time'] ?? '') !== (string) $sched;
        $venueChanged = (string) ($existing['venue'] ?? '') !== Input::str('venue');
        if ($timeChanged || $venueChanged) {
            notify_schedule_change($matchId, $names[0], $names[1], $sched, Input::str('venue'),
                [$teamA, $teamB]);
        }
    }

    Cache::flush();
    Response::ok(['matchId' => $matchId]);
}

function delete_match(): void
{
    Auth::requireLogin();

    $matchId = Input::require_str('matchId');
    $m = Db::one('SELECT * FROM matches WHERE match_id = :mid', [':mid' => $matchId]);
    if ($m === null) {
        Response::fail('ไม่พบนัดนี้', 404);
    }
    Perm::requireTournamentManager($m['tournament_id']);

    if ($m['status'] !== 'Scheduled' && !Input::bool('force')) {
        Response::fail(
            'นัดนี้แข่งไปแล้ว — ลบแล้วผลการแข่งและตารางคะแนนจะเปลี่ยน ส่ง force=true ถ้ายืนยัน',
            409, ['status' => $m['status'], 'score' => "{$m['score_a']}-{$m['score_b']}"]
        );
    }

    Audit::log('match', $matchId, 'delete', $m, null);
    Db::exec('DELETE FROM matches WHERE match_id = :mid2', [':mid2' => $matchId]);
    Cache::flush();
    Response::ok();
}

/**
 * ลบตารางแข่งทั้งหมดของรายการ
 *
 * แยกจาก generateFixtures(replace) เพราะเป็นคนละเจตนา — อันนั้นคือ "สร้างใหม่"
 * อันนี้คือ "ล้างให้ว่าง" เพื่อเริ่มจัดใหม่ตั้งแต่ต้น
 *
 * นัดที่แข่งไปแล้วมีผลคะแนนอยู่ ถ้าลบไปตารางคะแนนจะเปลี่ยนทันที จึงต้องยืนยัน
 * เพิ่มอีกชั้นและบอกจำนวนให้เห็นก่อน
 */
function delete_all_matches(): void
{
    Auth::requireLogin();

    $tournamentId = Input::require_str('tournamentId');
    Perm::requireTournamentManager($tournamentId);

    $total = (int) Db::value(
        'SELECT COUNT(*) FROM matches WHERE tournament_id = :tid', [':tid' => $tournamentId]);
    $played = (int) Db::value(
        "SELECT COUNT(*) FROM matches
          WHERE tournament_id = :tid2 AND status <> 'Scheduled'",
        [':tid2' => $tournamentId]);

    if ($total === 0) {
        Response::fail('รายการนี้ยังไม่มีนัดให้ลบ', 409);
    }

    $keepPlayed = Input::bool('keepPlayed');

    if ($played > 0 && !$keepPlayed && !Input::bool('force')) {
        Response::fail(
            "มีนัดที่แข่งไปแล้ว $played นัดจากทั้งหมด $total นัด — ลบแล้วผลการแข่ง"
            . 'และตารางคะแนนจะหายไปด้วย ส่ง force=true เพื่อลบทั้งหมด '
            . 'หรือ keepPlayed=true เพื่อลบเฉพาะนัดที่ยังไม่แข่ง',
            409, ['total' => $total, 'played' => $played]
        );
    }

    if ($keepPlayed) {
        $deleted = Db::exec(
            "DELETE FROM matches WHERE tournament_id = :tid3 AND status = 'Scheduled'",
            [':tid3' => $tournamentId]);
    } else {
        $deleted = Db::exec('DELETE FROM matches WHERE tournament_id = :tid4',
            [':tid4' => $tournamentId]);
    }

    Audit::log('tournament', $tournamentId, 'delete_all_matches',
        ['total' => $total, 'played' => $played], ['deleted' => $deleted]);
    Cache::flush();

    Response::ok([
        'deleted'   => $deleted,
        'keptPlayed' => $keepPlayed ? $played : 0,
        'message'   => $keepPlayed
            ? "ลบนัดที่ยังไม่แข่ง $deleted นัด (เก็บนัดที่แข่งแล้ว $played นัดไว้)"
            : "ลบตารางแข่งทั้งหมด $deleted นัด",
    ]);
}

/**
 * แจ้งเมื่อเวลาหรือสนามแข่งเปลี่ยน — ส่งเฉพาะสองโรงเรียนที่เกี่ยวข้อง
 */
function notify_schedule_change(
    string $matchId, string $nameA, string $nameB,
    ?string $scheduled, string $venue, array $teamIds
): void {
    $when = $scheduled ? date('j M เวลา H:i น.', (int) strtotime($scheduled)) : 'ยังไม่กำหนดเวลา';
    $body = "$nameA พบ $nameB · $when" . ($venue !== '' ? " · $venue" : '');

    foreach (array_filter($teamIds) as $tid) {
        $sid = Db::value('SELECT school_id FROM teams WHERE team_id = :tid', [':tid' => $tid]);
        if ($sid) {
            PushNotifier::notifySchool((string) $sid, 'match_scheduled',
                'เปลี่ยนกำหนดการแข่งขัน', $body, '/schedule', ['matchId' => $matchId]);
        }
    }
}
