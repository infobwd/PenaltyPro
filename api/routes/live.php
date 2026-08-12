<?php
declare(strict_types=1);

/**
 * บันทึกผลการแข่งขันสด — สกอร์ ลูกจุดโทษ และเหตุการณ์ในเกม
 *
 * แยกจาก fixtures.php โดยตั้งใจ: ที่นั่นคือ "จัดตาราง" (ใครเจอใคร วันไหน)
 * ส่วนที่นี่คือ "ผลที่เกิดขึ้นจริง" ซึ่งเขียนถี่มากระหว่างแข่งและมีกฎต่างกัน
 *
 * จุดที่ของเดิม (Apps Script) พลาดแล้วที่นี่แก้:
 *   1. เดิมยิงด้วย mode:'no-cors' ⇒ ผลลัพธ์เป็น opaque, ฝั่งเว็บขึ้น
 *      "บันทึกสำเร็จ" เสมอแม้เซิร์ฟเวอร์ล้ม — ที่นี่ตอบ JSON จริงให้ตรวจได้
 *   2. เดิม append ลูกจุดโทษต่อท้ายชีต ⇒ กดบันทึกซ้ำได้ลูกซ้ำ
 *      ที่นี่เขียนทับทั้งนัดในทรานแซกชันเดียว ยิงกี่รอบผลก็เท่าเดิม
 *   3. เดิมไม่ตรวจสิทธิ์เลย ⇒ ใครยิง URL ตรงก็แก้สกอร์ได้
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        'saveMatchResult' => save_match_result(),
        'saveMatchEvents' => save_match_events(),
        default           => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

// ─────────────────────────────────────────────────────────────────────────

function save_match_result(): void
{
    Auth::requireLogin();

    $tournamentId = Input::str('tournamentId') ?: 'default';
    Perm::requireTournamentManager($tournamentId);

    $matchId = Input::str('matchId');
    if ($matchId === '') {
        Response::fail('ต้องระบุ matchId', 422);
    }

    $scoreA = max(0, (int) (Input::int('scoreA') ?? 0));
    $scoreB = max(0, (int) (Input::int('scoreB') ?? 0));

    // ผู้ชนะ: เชื่อค่าที่ส่งมาเฉพาะเมื่ออยู่ในชุดที่ถูกต้อง ไม่งั้นคำนวณจากสกอร์
    $winner = strtoupper(Input::str('winner'));
    if (!in_array($winner, ['A', 'B', 'DRAW'], true)) {
        $winner = $scoreA === $scoreB ? 'DRAW' : ($scoreA > $scoreB ? 'A' : 'B');
    }

    $status = Input::str('status');
    if (!in_array($status, ['Scheduled', 'Live', 'Finished', 'Walkover'], true)) {
        $status = 'Finished';
    }

    $existing = Db::one('SELECT * FROM matches WHERE match_id = :mid', [':mid' => $matchId]);
    if ($existing !== null && $existing['tournament_id'] !== $tournamentId) {
        // กันเขียนข้ามรายการ — id ชนกันข้ามรายการแล้วสกอร์ไปโผล่ผิดที่
        Response::fail('นัดนี้อยู่คนละรายการแข่งขัน', 409,
            ['matchTournamentId' => $existing['tournament_id']]);
    }

    $nameA = Input::str('teamA');
    $nameB = Input::str('teamB');

    $kicksIn = Input::arr('kicks');
    $skipKicks = Input::bool('skipKicks');
    $eventsIn = Input::arr('events');

    Db::transaction(static function () use (
        $matchId, $tournamentId, $existing, $nameA, $nameB,
        $scoreA, $scoreB, $winner, $status, $kicksIn, $skipKicks, $eventsIn
    ): void {
        if ($existing === null) {
            // นัดที่ไม่ได้อยู่ในตาราง เช่น ชนะบาย/สละสิทธิ์ ที่แอดมินสร้างสด ๆ
            $aId = team_id_by_name($tournamentId, $nameA);
            $bId = team_id_by_name($tournamentId, $nameB);
            Db::exec(
                'INSERT INTO matches
                    (match_id, tournament_id, team_a_id, team_b_id,
                     team_a_name, team_b_name, score_a, score_b, winner, status,
                     round_label, venue, summary, played_at,
                     livestream_url, livestream_cover)
                 VALUES (:mid, :tid, :ta, :tb, :tan, :tbn, :sa, :sb, :win, :st,
                         :round, :venue, :sum, :played, :live, :cover)',
                [
                    ':mid' => $matchId, ':tid' => $tournamentId,
                    ':ta' => $aId, ':tb' => $bId,
                    ':tan' => $nameA, ':tbn' => $nameB,
                    ':sa' => $scoreA, ':sb' => $scoreB,
                    ':win' => $winner, ':st' => $status,
                    ':round' => Input::str('roundLabel'),
                    ':venue' => Input::str('venue'),
                    ':sum'   => Input::str('summary'),
                    ':played' => $status === 'Scheduled' ? null : date('Y-m-d H:i:s'),
                    ':live'  => Input::str('livestreamUrl'),
                    ':cover' => Input::str('livestreamCover'),
                ]
            );
        } else {
            // ไม่แตะ team_a_id/team_b_id — คู่แข่งถูกกำหนดตอนจัดตารางแล้ว
            // ถ้าให้ชื่อที่ส่งมาตอนบันทึกผลไปทับได้ ตารางคะแนนจะเพี้ยนทันที
            // ที่ทีมถูกเปลี่ยนชื่อระหว่างทัวร์นาเมนต์
            Db::exec(
                'UPDATE matches SET
                    score_a = :sa, score_b = :sb, winner = :win, status = :st,
                    summary = :sum,
                    played_at = CASE WHEN :st2 = \'Scheduled\' THEN played_at
                                     ELSE COALESCE(played_at, NOW()) END,
                    livestream_url   = COALESCE(NULLIF(:live, \'\'), livestream_url),
                    livestream_cover = COALESCE(NULLIF(:cover, \'\'), livestream_cover),
                    row_version = row_version + 1
                  WHERE match_id = :mid',
                [
                    ':sa' => $scoreA, ':sb' => $scoreB,
                    ':win' => $winner, ':st' => $status, ':st2' => $status,
                    ':sum'   => Input::str('summary'),
                    ':live'  => Input::str('livestreamUrl'),
                    ':cover' => Input::str('livestreamCover'),
                    ':mid'   => $matchId,
                ]
            );
        }

        // ── ลูกจุดโทษ ────────────────────────────────────────────────────
        // เขียนทับทั้งนัด ไม่ใช่ append — ฝั่งเว็บส่งสถานะปัจจุบันมาทั้งชุดทุกครั้ง
        // ถ้า append จะได้ลูกซ้ำทุกครั้งที่กดบันทึกระหว่างแข่ง
        if (!$skipKicks) {
            Db::exec('DELETE FROM kicks WHERE match_id = :mid2', [':mid2' => $matchId]);
            $seen = [];
            foreach ($kicksIn as $k) {
                $result = strtoupper((string) ($k['result'] ?? ''));
                // WAITING = ยังไม่ได้ยิง เป็นสถานะบนหน้าจอเท่านั้น ไม่เก็บลงฐาน
                if (!in_array($result, ['GOAL', 'SAVED', 'MISSED'], true)) {
                    continue;
                }
                $side = strtoupper((string) ($k['teamId'] ?? ''));
                if ($side !== 'A' && $side !== 'B') {
                    continue;
                }
                $round = (int) ($k['round'] ?? 0);
                // UNIQUE(match_id, round_no, team_side) — กันข้อมูลซ้ำจากฝั่งเว็บ
                $key = $round . $side;
                if (isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;

                Db::exec(
                    'INSERT INTO kicks
                        (match_id, round_no, team_side, player_name, result, commentary)
                     VALUES (:mid3, :round, :side, :player, :res, :note)',
                    [
                        ':mid3'   => $matchId,
                        ':round'  => $round,
                        ':side'   => $side,
                        ':player' => mb_substr((string) ($k['player'] ?? ''), 0, 150),
                        ':res'    => $result,
                        ':note'   => mb_substr((string) ($k['commentary'] ?? ''), 0, 500),
                    ]
                );
            }
        }

        // ── เหตุการณ์ในเกม (ส่งมาพร้อมผลได้เลย ไม่ต้องยิงสองรอบ) ──────────
        if ($eventsIn !== []) {
            write_events($matchId, $eventsIn);
        }
    });

    Cache::flush();
    Audit::log('match', $matchId, 'save_result', null,
        ['score' => "$scoreA-$scoreB", 'status' => $status, 'winner' => $winner]);

    // แจ้งผลเฉพาะตอนจบเกมจริง ไม่ใช่ทุกครั้งที่บันทึกระหว่างแข่ง
    // (ยิงจุดโทษบันทึกทีละลูก ถ้าแจ้งทุกครั้งจะเด้ง 10 ครั้งต่อนัด)
    if ($status === 'Finished' || $status === 'Walkover') {
        notify_match_result($matchId, $tournamentId, $scoreA, $scoreB);
    }

    Response::ok([
        'matchId' => $matchId,
        'scoreA'  => $scoreA,
        'scoreB'  => $scoreB,
        'winner'  => $winner,
        'status'  => $status,
        'kicksSaved' => $skipKicks ? null : (int) Db::value(
            'SELECT COUNT(*) FROM kicks WHERE match_id = :mid', [':mid' => $matchId]),
    ]);
}

/**
 * บันทึกเหตุการณ์ในเกม (ประตู ใบเหลือง ใบแดง เปลี่ยนตัว)
 *
 * ใช้กับแบบ 7v7/11v11 ที่มีเหตุการณ์ระหว่างเกม ไม่ใช่แค่ผลรวม
 */
function save_match_events(): void
{
    Auth::requireLogin();

    $events = Input::arr('events');
    if ($events === []) {
        Response::ok(['saved' => 0]);
    }

    // ทุกเหตุการณ์ในคำขอเดียวต้องเป็นนัดเดียวกัน — ป้องกันการยิงรวมข้ามนัด
    // แล้วเผลอลบของนัดอื่นทิ้งตอนเขียนทับ
    $matchIds = array_values(array_unique(array_filter(
        array_map(static fn($e): string => (string) ($e['matchId'] ?? ''), $events))));
    if (count($matchIds) !== 1) {
        Response::fail('ต้องส่งเหตุการณ์ของนัดเดียวต่อหนึ่งคำขอ', 422,
            ['matchIds' => $matchIds]);
    }
    $matchId = $matchIds[0];

    $m = Db::one('SELECT tournament_id FROM matches WHERE match_id = :mid',
        [':mid' => $matchId]);
    if ($m === null) {
        Response::fail('ไม่พบนัดนี้', 404);
    }
    Perm::requireTournamentManager((string) $m['tournament_id']);

    Db::transaction(static function () use ($matchId, $events): void {
        write_events($matchId, $events);
    });

    Cache::flush();
    Audit::log('match', $matchId, 'save_events', null, ['count' => count($events)]);

    Response::ok(['matchId' => $matchId, 'saved' => (int) Db::value(
        'SELECT COUNT(*) FROM match_events WHERE match_id = :mid', [':mid' => $matchId])]);
}

/**
 * เขียนเหตุการณ์ของนัดหนึ่งทับทั้งชุด
 *
 * ต้องเรียกใน transaction เสมอ — ระหว่าง DELETE กับ INSERT เสร็จ ถ้ามีคนอ่าน
 * จะเห็นนัดที่ไม่มีเหตุการณ์เลย
 */
function write_events(string $matchId, array $events): void
{
    $valid = ['GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'BLUE_CARD', 'SUB_IN', 'SUB_OUT'];

    Db::exec('DELETE FROM match_events WHERE match_id = :mid', [':mid' => $matchId]);

    $i = 0;
    foreach ($events as $e) {
        $type = strtoupper((string) ($e['type'] ?? ''));
        if (!in_array($type, $valid, true)) {
            continue;
        }
        $side = strtoupper((string) ($e['teamId'] ?? ''));
        if ($side !== 'A' && $side !== 'B') {
            continue;
        }
        // id ที่ฝั่งเว็บสร้างอาจซ้ำได้ถ้าบันทึกซ้ำ — ผูก index ไว้ให้ไม่ชนกันเอง
        $eid = (string) ($e['id'] ?? '');
        if ($eid === '' || mb_strlen($eid) > 40) {
            $eid = 'EV_' . (int) (microtime(true) * 1000) . '_' . $i;
        }
        $i++;

        Db::exec(
            'INSERT INTO match_events
                (event_id, match_id, minute_no, event_type, team_side,
                 player_name, related_player)
             VALUES (:eid, :mid2, :min, :type, :side, :player, :rel)
             ON DUPLICATE KEY UPDATE
                minute_no = VALUES(minute_no), event_type = VALUES(event_type),
                team_side = VALUES(team_side), player_name = VALUES(player_name),
                related_player = VALUES(related_player)',
            [
                ':eid'    => $eid,
                ':mid2'   => $matchId,
                ':min'    => max(0, (int) ($e['minute'] ?? 0)),
                ':type'   => $type,
                ':side'   => $side,
                ':player' => mb_substr((string) ($e['player'] ?? ''), 0, 150),
                ':rel'    => mb_substr((string) ($e['relatedPlayer'] ?? ''), 0, 150),
            ]
        );
    }
}

/**
 * แจ้งผลการแข่งขันให้สองโรงเรียนที่ลงแข่ง
 *
 * แจ้งเฉพาะโรงเรียนคู่นั้น ไม่ broadcast ทั้งระบบ — ในหนึ่งวันมี 57 นัด
 * ถ้าแจ้งทุกคนทุกนัด มือถือจะเด้งทั้งวันจนคนปิดการแจ้งเตือนทิ้ง
 */
function notify_match_result(string $matchId, string $tournamentId, int $a, int $b): void
{
    $m = Db::one(
        'SELECT m.team_a_name, m.team_b_name, m.round_label,
                ta.school_id AS school_a, tb.school_id AS school_b,
                ta.name AS name_a, tb.name AS name_b
           FROM matches m
           LEFT JOIN teams ta ON ta.team_id = m.team_a_id
           LEFT JOIN teams tb ON tb.team_id = m.team_b_id
          WHERE m.match_id = :mid',
        [':mid' => $matchId]
    );
    if ($m === null) {
        return;
    }
    $nameA = (string) ($m['name_a'] ?? $m['team_a_name']);
    $nameB = (string) ($m['name_b'] ?? $m['team_b_name']);
    $title = 'ผลการแข่งขันออกแล้ว';
    $body  = "$nameA $a - $b $nameB"
        . (($m['round_label'] ?? '') !== '' ? ' · ' . $m['round_label'] : '');
    $meta  = ['matchId' => $matchId, 'tournamentId' => $tournamentId];

    foreach ([$m['school_a'], $m['school_b']] as $sid) {
        if ($sid) {
            PushNotifier::notifySchool((string) $sid, 'match_result', $title, $body, '/schedule', $meta);
        }
    }
}
