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
        'cancelMatchRecord' => cancel_match_record(),
        'discardMatchDraft' => discard_match_draft(),
        'resetMatchResult' => reset_match_result(),
        'liveBoard'       => live_board(),
        default           => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

// ─────────────────────────────────────────────────────────────────────────

/** อายุ cache ของกระดานผลสด — สั้นพอให้ผู้พากย์ทันเกม แต่ยังกันฐานข้อมูลได้ */
const LIVE_BOARD_TTL = 5;

/** จำนวนนัดสูงสุดบนกระดาน — วันแข่งมีถึง 57 นัด แต่ไม่มีใครพากย์พร้อมกันเกินนี้ */
const LIVE_BOARD_LIMIT = 30;

/**
 * กระดานผลสด — สำหรับหน้าโต๊ะพากย์และจอสกอร์ที่ต้องอัปเดตเอง
 *
 * ทำไมไม่ใช้ getData: getData คืนทีม/นักกีฬา/ข่าว/บริจาคของทั้งระบบมาทั้งก้อน
 * ซึ่งหนักเกินกว่าจะยิงซ้ำทุกไม่กี่วินาที ที่นี่คืนเฉพาะนัดที่ "กำลังเกิดขึ้น"
 * พร้อมลูกจุดโทษและเหตุการณ์ในเกม — เล็กพอจะ poll ได้ตลอดวันแข่ง
 *
 * เปิดสาธารณะโดยตั้งใจ: สกอร์และรายชื่อผู้ทำประตูเป็นข้อมูลที่ getData ส่งให้
 * ทุกคนอยู่แล้ว และผู้พากย์ในสนามมักเป็นครูหรือนักเรียนที่ไม่มีบัญชีในระบบ
 *
 * ⚠️ ห้ามใส่อะไรที่ getData ตัดออกสำหรับคนทั่วไป (เบอร์โทร ข้อมูลผู้บริจาค)
 * ไม่งั้นจะกลายเป็นทางอ้อมให้ดึงข้อมูลที่ตั้งใจปิดไว้
 */
function live_board(): void
{
    $tournamentId = Input::str('tournamentId');

    $cacheKey = Cache::key('liveBoard', ['tid' => $tournamentId]);
    if (($hit = Cache::get($cacheKey, LIVE_BOARD_TTL)) !== null) {
        Response::raw($hit);
    }

    $where  = [];
    $params = [];
    if ($tournamentId !== '') {
        $where[] = 'm.tournament_id = :tid';
        $params[':tid'] = $tournamentId;
    }
    $scope = $where === [] ? '' : ' AND ' . implode(' AND ', $where);

    /**
     * ช่วงเวลาที่ถือว่า "อยู่ในเกม"
     *
     *   Live                      — กำลังแข่ง
     *   จบไปไม่เกิน 4 ชม.          — ผู้พากย์ยังต้องสรุปผลคู่ที่เพิ่งจบ
     *   จะเริ่มใน 6 ชม. ข้างหน้า    — เตรียมบทก่อนคู่ถัดไป
     */
    $rows = Db::all(
        "SELECT m.*, ta.name AS team_a_current, tb.name AS team_b_current,
                ta.logo_url AS logo_a, tb.logo_url AS logo_b
           FROM matches m
           LEFT JOIN teams ta ON ta.team_id = m.team_a_id
           LEFT JOIN teams tb ON tb.team_id = m.team_b_id
          WHERE (m.status = 'Live'
                 OR (m.status IN ('Finished','Walkover')
                     AND m.played_at >= NOW() - INTERVAL 4 HOUR)
                 OR (m.status = 'Scheduled'
                     AND m.scheduled_time BETWEEN NOW() - INTERVAL 2 HOUR
                                              AND NOW() + INTERVAL 6 HOUR))
                $scope
          ORDER BY m.status = 'Live' DESC,
                   COALESCE(m.scheduled_time, m.played_at),
                   m.match_id
          LIMIT " . LIVE_BOARD_LIMIT,
        $params
    );

    /**
     * ไม่มีนัดในช่วงเวลาเลย — ถอยไปเอานัดล่าสุดที่มีผลมาแสดงแทน
     *
     * เคสจริงที่เจอบ่อย: กรรมการบันทึกสกอร์แต่ไม่เคยกดเปลี่ยนสถานะเป็น Live
     * และตารางแข่งหลายรายการไม่ได้ใส่เวลานัดไว้เลย ถ้ายึดตามช่วงเวลาอย่างเดียว
     * ผู้พากย์จะเปิดหน้ามาแล้วเจอจอว่างทั้งที่การแข่งขันดำเนินอยู่ตรงหน้า
     *
     * ⚠️ เดิมเรียงด้วย COALESCE(played_at, scheduled_time) DESC ตัวเดียว
     * ทำให้นัดที่ Finished จริง (played_at เป็นเวลาปัจจุบัน) แพ้นัด Scheduled
     * ที่ตั้ง scheduled_time ไว้ล่วงหน้าเป็นเดือน (เช่นวันแข่งจริงในอนาคต)
     * เพราะเทียบกันตรง ๆ วันที่ในอนาคตย่อมมากกว่าเวลาปัจจุบันเสมอ ผลที่เพิ่ง
     * บันทึกจึงตกหล่นไปอยู่นอก 8 อันดับ ทั้งที่นี่คือ "นัดล่าสุดที่มีผล" ตามชื่อฟังก์ชัน
     * แก้โดยให้นัดที่มีผลจริง (Live/Finished/Walkover) ขึ้นก่อนเสมอ
     */
    $fallback = false;
    if ($rows === []) {
        $fallback = true;
        $rows = Db::all(
            "SELECT m.*, ta.name AS team_a_current, tb.name AS team_b_current,
                    ta.logo_url AS logo_a, tb.logo_url AS logo_b
               FROM matches m
               LEFT JOIN teams ta ON ta.team_id = m.team_a_id
               LEFT JOIN teams tb ON tb.team_id = m.team_b_id
              WHERE 1 = 1 $scope
              ORDER BY CASE
                          WHEN m.status = 'Live' THEN 0
                          WHEN m.status IN ('Finished', 'Walkover') THEN 1
                          ELSE 2
                       END,
                       CASE WHEN m.status IN ('Finished', 'Walkover')
                            THEN m.played_at END DESC,
                       CASE WHEN m.status NOT IN ('Finished', 'Walkover')
                            THEN m.scheduled_time END ASC
              LIMIT 8",
            $params
        );
    }

    $matches = [];
    if ($rows !== []) {
        // ดึงลูกยิงและเหตุการณ์ของเฉพาะนัดบนกระดาน ไม่ใช่ทั้งตาราง
        $ids = array_column($rows, 'match_id');
        $in  = implode(',', array_map(
            static fn(int $i): string => ":m$i", range(0, count($ids) - 1)));
        $idParams = [];
        foreach ($ids as $i => $id) {
            $idParams[":m$i"] = $id;
        }

        $kicks  = live_group_by(Db::all(
            "SELECT * FROM kicks WHERE match_id IN ($in)
              ORDER BY match_id, round_no, team_side", $idParams), 'match_id');
        $events = live_group_by(Db::all(
            "SELECT * FROM match_events WHERE match_id IN ($in)
              ORDER BY match_id, minute_no, created_at", $idParams), 'match_id');

        foreach ($rows as $m) {
            $mid = (string) $m['match_id'];
            $matches[] = [
                'id'      => $mid,
                'teamA'   => $m['team_a_current'] ?? $m['team_a_name'],
                'teamB'   => $m['team_b_current'] ?? $m['team_b_name'],
                'teamAId' => $m['team_a_id'],
                'teamBId' => $m['team_b_id'],
                'teamALogo' => drive_img($m['logo_a']),
                'teamBLogo' => drive_img($m['logo_b']),
                'scoreA'  => (int) $m['score_a'],
                'scoreB'  => (int) $m['score_b'],
                'winner'  => $m['winner'],
                'status'  => $m['status'],
                'roundLabel'    => $m['round_label'],
                'venue'         => $m['venue'],
                'date'          => iso($m['played_at']),
                'scheduledTime' => iso($m['scheduled_time']),
                'livestreamUrl' => $m['livestream_url'],
                'summary'       => (string) $m['summary'],
                'tournamentId'  => $m['tournament_id'],
                'rowVersion'    => (int) $m['row_version'],
                'kicks' => array_map(static fn(array $k): array => [
                    'id'      => (string) $k['kick_id'],
                    'matchId' => $k['match_id'],
                    'round'   => (int) $k['round_no'],
                    'teamId'  => $k['team_side'],
                    'player'  => $k['player_name'],
                    'result'  => $k['result'],
                    'commentary' => (string) $k['commentary'],
                    'timestamp'  => strtotime((string) $k['kicked_at']) * 1000,
                ], $kicks[$mid] ?? []),
                'events' => array_map(static fn(array $e): array => [
                    'id'      => (string) $e['event_id'],
                    'matchId' => $e['match_id'],
                    'minute'  => (int) $e['minute_no'],
                    'type'    => $e['event_type'],
                    'teamId'  => $e['team_side'],
                    'player'  => $e['player_name'],
                    'relatedPlayer' => $e['related_player'],
                    'timestamp'     => strtotime((string) $e['created_at']) * 1000,
                ], $events[$mid] ?? []),
            ];
        }
    }

    /**
     * ลายเซ็นของกระดานทั้งใบ
     *
     * row_version อย่างเดียวใช้ไม่ได้ — saveMatchEvents เขียนแค่ตาราง match_events
     * ไม่ได้แตะ matches เลย ประตูที่เพิ่งบันทึกจึงไม่ทำให้เลขเวอร์ชันขยับ
     * แฮชจากเนื้อจริงเลยเป็นทางเดียวที่ตอบว่า "มีอะไรเปลี่ยนไหม" ได้ถูกเสมอ
     */
    $out = [
        'status'     => 'success',
        'matches'    => $matches,
        'version'    => substr(sha1(json_encode($matches, JSON_UNESCAPED_UNICODE) ?: ''), 0, 12),
        'serverTime' => date('c'),
        // บอกฝั่งเว็บว่ากำลังแสดงของสำรอง จะได้ขึ้นป้ายว่านี่ไม่ใช่นัดที่กำลังแข่ง
        'fallback'   => $fallback,
    ];

    if (!Response::hasWarnings()) {
        Cache::put($cacheKey, $out);
    }
    Response::raw($out);
}

/** @return array<string,array<int,array>> */
function live_group_by(array $rows, string $key): array
{
    $out = [];
    foreach ($rows as $r) {
        $out[(string) $r[$key]][] = $r;
    }
    return $out;
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

    $status = Input::str('status');
    if (!in_array($status, ['Scheduled', 'Live', 'Finished', 'Walkover'], true)) {
        $status = 'Finished';
    }

    // ผู้ชนะ: เชื่อค่าที่ส่งมาเฉพาะเมื่ออยู่ในชุดที่ถูกต้อง ไม่งั้นคำนวณจากสกอร์
    $winner = strtoupper(Input::str('winner'));
    if (!in_array($winner, ['A', 'B', 'DRAW'], true)) {
        $winner = $scoreA === $scoreB ? 'DRAW' : ($scoreA > $scoreB ? 'A' : 'B');
    }

    /**
     * นัดที่ยังไม่จบต้องไม่มีผู้ชนะ
     *
     * ตั้งแต่กรรมการซิงก์ผลระหว่างแข่ง สกอร์ 1-0 หลังลูกแรกจะถูกคำนวณเป็น
     * "ทีม A ชนะแล้ว" ถ้าไม่ดักตรงนี้ — แล้วผลที่ยังไม่เกิดจะไหลไปทุกที่ที่นับ
     * จากช่อง winner: ตารางคะแนน สถิติการเจอกัน และแถบผลล่าสุดบนหน้าแรก
     */
    if ($status === 'Live' || $status === 'Scheduled') {
        $winner = null;
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
 * ยกเลิกลูกยิงจุดโทษหรือประตูที่บันทึกผิดจากหน้าโต๊ะพากย์
 *
 * การลบกับการปรับคะแนนต้องอยู่ transaction เดียวกัน ไม่เช่นนั้น Live Wall อาจ
 * อ่านทันช่วงกลางแล้วเห็นจำนวนลูกยิงกับคะแนนคนละเวอร์ชันกันได้
 */
function cancel_match_record(): void
{
    Auth::requireLogin();

    $matchId = Input::require_str('matchId');
    $kind = Input::enum('kind', ['kick', 'goal']);
    $match = Db::one(
        'SELECT match_id, tournament_id, score_a, score_b
           FROM matches WHERE match_id = :mid',
        [':mid' => $matchId]
    );
    if ($match === null) {
        Response::fail('ไม่พบนัดนี้', 404);
    }
    Perm::requireTournamentManager((string) $match['tournament_id']);

    $round = max(0, (int) (Input::int('round') ?? 0));
    $side = strtoupper(Input::str('teamId'));
    $eventId = Input::str('eventId');

    if ($kind === 'kick' && ($round < 1 || !in_array($side, ['A', 'B'], true))) {
        Response::fail('ข้อมูลลูกยิงไม่ครบ', 422);
    }
    if ($kind === 'goal' && $eventId === '') {
        Response::fail('ต้องระบุ eventId', 422);
    }

    $event = null;
    if ($kind === 'kick') {
        $exists = Db::value(
            'SELECT 1 FROM kicks
              WHERE match_id = :mid_check AND round_no = :round_check
                AND team_side = :side_check',
            [':mid_check' => $matchId, ':round_check' => $round, ':side_check' => $side]
        );
        if ($exists === null) {
            Response::fail('ไม่พบผลการยิงที่ต้องการยกเลิก', 404);
        }
    } else {
        $event = Db::one(
            'SELECT event_type, team_side FROM match_events
              WHERE match_id = :mid_event AND event_id = :eid_event',
            [':mid_event' => $matchId, ':eid_event' => $eventId]
        );
        if ($event === null || !in_array($event['event_type'], ['GOAL', 'OWN_GOAL'], true)) {
            Response::fail('ไม่พบประตูที่ต้องการยกเลิก', 404);
        }
    }

    $result = Db::transaction(static function () use (
        $matchId, $kind, $round, $side, $eventId, $match, $event
    ): array {
        if ($kind === 'kick') {
            $deleted = Db::exec(
                'DELETE FROM kicks
                  WHERE match_id = :mid AND round_no = :round AND team_side = :side',
                [':mid' => $matchId, ':round' => $round, ':side' => $side]
            );
            if ($deleted === 0) {
                throw new RuntimeException('ผลการยิงถูกยกเลิกไปแล้ว');
            }

            // ปิดช่องว่างของเลขรอบหลังลบลูกกลางรายการ โดยย้ายออกไปช่วงเลขสูงก่อน
            // เพื่อไม่ให้ชน UNIQUE(match_id, round_no, team_side) ระหว่างไล่เลขใหม่
            $remaining = Db::all(
                "SELECT kick_id, team_side FROM kicks
                  WHERE match_id = :mid2
                  ORDER BY round_no, FIELD(team_side, 'A', 'B')",
                [':mid2' => $matchId]
            );
            Db::exec(
                'UPDATE kicks SET round_no = round_no + 1000 WHERE match_id = :mid3',
                [':mid3' => $matchId]
            );
            $perSide = ['A' => 0, 'B' => 0];
            foreach ($remaining as $kick) {
                $kickSide = (string) $kick['team_side'];
                $perSide[$kickSide]++;
                Db::exec(
                    'UPDATE kicks SET round_no = :round2 WHERE kick_id = :kid',
                    [':round2' => $perSide[$kickSide], ':kid' => $kick['kick_id']]
                );
            }

            $scoreA = (int) Db::value(
                "SELECT COUNT(*) FROM kicks
                  WHERE match_id = :mid4 AND team_side = 'A' AND result = 'GOAL'",
                [':mid4' => $matchId]
            );
            $scoreB = (int) Db::value(
                "SELECT COUNT(*) FROM kicks
                  WHERE match_id = :mid5 AND team_side = 'B' AND result = 'GOAL'",
                [':mid5' => $matchId]
            );
        } else {
            $deleted = Db::exec(
                'DELETE FROM match_events WHERE match_id = :mid7 AND event_id = :eid2',
                [':mid7' => $matchId, ':eid2' => $eventId]
            );
            if ($deleted === 0) {
                throw new RuntimeException('ประตูถูกยกเลิกไปแล้ว');
            }

            $creditedSide = (string) $event['team_side'];
            if ($event['event_type'] === 'OWN_GOAL') {
                $creditedSide = $creditedSide === 'A' ? 'B' : 'A';
            }
            $scoreA = max(0, (int) $match['score_a'] - ($creditedSide === 'A' ? 1 : 0));
            $scoreB = max(0, (int) $match['score_b'] - ($creditedSide === 'B' ? 1 : 0));
        }

        // การแก้ผลหลังจบเกมต้องเปิดนัดกลับมาเป็น Live เพื่อไม่ให้ผลเดิมและผู้ชนะ
        // ที่ตัดสินจากข้อมูลก่อนแก้ยังถูกนำไปคิดตารางคะแนนต่อ
        Db::exec(
            "UPDATE matches
                SET score_a = :sa, score_b = :sb, winner = NULL, status = 'Live',
                    row_version = row_version + 1
              WHERE match_id = :mid8",
            [':sa' => $scoreA, ':sb' => $scoreB, ':mid8' => $matchId]
        );

        return ['scoreA' => $scoreA, 'scoreB' => $scoreB];
    });

    Cache::flush();
    Audit::log('match', $matchId, 'cancel_record', null, [
        'kind' => $kind,
        'round' => $kind === 'kick' ? $round : null,
        'side' => $kind === 'kick' ? $side : null,
        'eventId' => $kind === 'goal' ? $eventId : null,
        'score' => $result['scoreA'] . '-' . $result['scoreB'],
    ]);

    Response::ok([
        'matchId' => $matchId,
        'scoreA' => $result['scoreA'],
        'scoreB' => $result['scoreB'],
        'status' => 'Live',
    ]);
}

/**
 * ยกเลิกผลทั้งนัด — ใช้ได้แม้นัดจบและบันทึกไปแล้ว
 *
 * ต่างจาก discard_match_draft ตรงที่ตัวนั้นตั้งใจกันนัดที่ Finished ไว้
 * เพราะมันคือ "ทิ้งข้อมูลทดลอง" ที่เผลอซิงก์ขึ้นไประหว่างเปิดหน้าบันทึกผล
 * ส่วนตัวนี้คือ "ผลจริงที่บันทึกผิด ต้องล้างแล้วแข่งใหม่" ซึ่งเป็นคนละเจตนา
 *
 * เกิดขึ้นจริงจากบั๊กที่ปล่อยให้ทีมหนึ่งแตะเกินมาหนึ่งคนในรอบปกติ ทำให้ผล
 * ที่ควรจบ 4-3 กลายเป็นเสมอ 4-4 — กรณีแบบนี้ยกเลิกทีละลูกได้แต่ช้าและพลาดง่าย
 *
 * ล้างทุกอย่างในทรานแซกชันเดียวแล้วคืนนัดเป็น Scheduled เหมือนยังไม่เคยแข่ง
 * ตารางคะแนนที่คิดจาก winner จึงกลับไปถูกต้องทันที
 */
function reset_match_result(): void
{
    Auth::requireLogin();

    $matchId = Input::require_str('matchId');
    $match = Db::one(
        'SELECT match_id, tournament_id, status, score_a, score_b, winner
           FROM matches WHERE match_id = :mid',
        [':mid' => $matchId]
    );
    if ($match === null) {
        Response::fail('ไม่พบนัดนี้', 404);
    }
    Perm::requireTournamentManager((string) $match['tournament_id']);

    $before = [
        'status' => $match['status'],
        'score'  => $match['score_a'] . '-' . $match['score_b'],
        'winner' => $match['winner'],
    ];

    $removed = Db::transaction(static function () use ($matchId): array {
        $kicks  = Db::exec('DELETE FROM kicks WHERE match_id = :mid_k', [':mid_k' => $matchId]);
        $events = Db::exec('DELETE FROM match_events WHERE match_id = :mid_e', [':mid_e' => $matchId]);
        Db::exec(
            "UPDATE matches
                SET score_a = 0, score_b = 0, winner = NULL, status = 'Scheduled',
                    summary = '', played_at = NULL, row_version = row_version + 1
              WHERE match_id = :mid_m",
            [':mid_m' => $matchId]
        );
        return ['kicks' => $kicks, 'events' => $events];
    });

    Cache::flush();
    // เก็บค่าก่อนแก้ไว้ด้วย — ผลที่ถูกล้างไปแล้วกู้คืนไม่ได้ ต้องตรวจย้อนได้ว่าเดิมคืออะไร
    Audit::log('match', $matchId, 'reset_result', $before, [
        'kicksRemoved'  => $removed['kicks'],
        'eventsRemoved' => $removed['events'],
    ]);

    Response::ok([
        'matchId'       => $matchId,
        'status'        => 'Scheduled',
        'kicksRemoved'  => $removed['kicks'],
        'eventsRemoved' => $removed['events'],
    ]);
}

/**
 * ทิ้งข้อมูลทดลองที่ถูกซิงก์ขึ้นผลสดระหว่างอยู่หน้าบันทึกผล
 *
 * หน้าบันทึกซิงก์ทุกลูกเพื่อให้โต๊ะพากย์เห็นสด แต่เมื่อผู้ใช้เลือก
 * “ออกโดยไม่บันทึก” ข้อมูลเหล่านั้นต้องถูกลบจาก server ด้วย ไม่ใช่ล้างแค่ state
 * ในโทรศัพท์ ไม่เช่นนั้น Commentary จะยังเห็นนัดทดสอบต่อไป
 */
function discard_match_draft(): void
{
    Auth::requireLogin();
    $matchId = Input::require_str('matchId');
    $match = Db::one(
        'SELECT tournament_id, status FROM matches WHERE match_id = :mid',
        [':mid' => $matchId]
    );
    if ($match === null) {
        // ยังไม่เคยกดผลเลยจึงยังไม่มีแถวบน server — ถือว่าทิ้งข้อมูลสำเร็จอยู่แล้ว
        Response::ok(['matchId' => $matchId, 'status' => 'NotSaved']);
    }
    Perm::requireTournamentManager((string) $match['tournament_id']);
    if (in_array($match['status'], ['Finished', 'Walkover'], true)) {
        Response::fail('ผลการแข่งขันนี้จบและบันทึกแล้ว ไม่สามารถทิ้งเป็นข้อมูลทดลองได้', 409);
    }

    Db::transaction(static function () use ($matchId): void {
        Db::exec('DELETE FROM kicks WHERE match_id = :mid_kicks', [':mid_kicks' => $matchId]);
        Db::exec('DELETE FROM match_events WHERE match_id = :mid_events', [':mid_events' => $matchId]);
        Db::exec(
            "UPDATE matches
                SET score_a = 0, score_b = 0, winner = NULL, status = 'Scheduled',
                    summary = '', played_at = NULL, row_version = row_version + 1
              WHERE match_id = :mid_match",
            [':mid_match' => $matchId]
        );
    });

    Cache::flush();
    Audit::log('match', $matchId, 'discard_draft');
    Response::ok(['matchId' => $matchId, 'status' => 'Scheduled']);
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
