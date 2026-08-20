<?php
declare(strict_types=1);

/**
 * Production Node — รับเหตุการณ์ระดับมิลลิวินาที และ heartbeat ของเครื่องถ่ายทอด
 *
 * ── ตัวนี้ไม่ยุ่งกับสกอร์ ────────────────────────────────────────────
 * `live.php` ยังเป็นเจ้าของผลการแข่งขันเหมือนเดิมทุกอย่าง ที่นี่รับเฉพาะ
 * "เวลาที่เกิดเหตุ" ละเอียดระดับมิลลิวินาที ซึ่งระบบรีเพลย์ต้องใช้ตัดคลิป
 * ให้ตรงจังหวะ — ลูกจุดโทษจากเริ่มวิ่งถึงบอลเข้าใช้เวลาไม่ถึง 2 วินาที
 * ความละเอียดระดับวินาทีของ `match_kicks` จึงไม่พอ
 *
 * ถ้าไฟล์นี้กับตารางใน db/26 หายไปทั้งหมด ระบบเดิมยังทำงานได้ครบเหมือนเดิม
 *
 * ── ทำไมต้องกันซ้ำที่ฐานข้อมูล ──────────────────────────────────────
 * Production Node อยู่ที่สนามซึ่งเน็ตหลุดได้ตลอด มันจึงเก็บเหตุการณ์ไว้ก่อน
 * แล้วส่งใหม่เรื่อย ๆ จนกว่าจะสำเร็จ ถ้ากันซ้ำแค่ที่ฝั่ง Node เหตุการณ์เดียว
 * จะกลายเป็นหลายแถวทันทีที่ Node รีสตาร์ตกลางงาน แล้วไฮไลต์จะมีจังหวะเดิม
 * ซ้ำหลายรอบ — จึงบังคับด้วย UNIQUE KEY ที่ฐานข้อมูลซึ่งโกหกไม่ได้
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        'productionEvents'    => production_events_push(),
        'productionTimeline'  => production_timeline(),
        'productionHeartbeat' => production_heartbeat(),
        'productionNodes'     => production_nodes_list(),
        default               => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

// ─────────────────────────────────────────────────────────────────────────

/** จำนวนเหตุการณ์สูงสุดต่อหนึ่งคำขอ — Node ส่งเป็นชุดหลังเน็ตกลับมา */
const PRODUCTION_EVENT_BATCH_MAX = 200;

/** ชนิดเหตุการณ์ที่ยอมรับ — จำกัดไว้เพื่อให้ query ฝั่งรีเพลย์เดาได้ */
const PRODUCTION_EVENT_TYPES = ['GOAL', 'MISS', 'SAVE', 'HIGHLIGHT', 'CUE'];

/**
 * รับเหตุการณ์เป็นชุด
 *
 * ตอบกลับว่ารับไปกี่รายการและซ้ำกี่รายการ — Node ต้องรู้ว่าลบออกจากคิว
 * ได้แล้วหรือยัง ถ้าตอบแค่ "สำเร็จ" Node จะไม่รู้ว่าที่ส่งไปตกหล่นหรือเปล่า
 */
function production_events_push(): void
{
    $tournamentId = Input::str('tournamentId');
    if ($tournamentId === '') {
        Response::fail('ต้องระบุ tournamentId', 422);
    }
    Perm::requireTournamentManager($tournamentId);

    $events = Input::arr('events');
    if (!$events) {
        Response::fail('ไม่มีเหตุการณ์ที่จะบันทึก', 422);
    }
    if (count($events) > PRODUCTION_EVENT_BATCH_MAX) {
        Response::fail('ส่งได้ครั้งละไม่เกิน ' . PRODUCTION_EVENT_BATCH_MAX . ' รายการ', 422);
    }

    $nodeId = Input::str('nodeId') ?: (Auth::userId() ?? 'unknown');
    $accepted = 0;
    $duplicated = 0;
    $rejected = [];

    Db::transaction(function () use ($events, $nodeId, &$accepted, &$duplicated, &$rejected) {
        foreach ($events as $i => $e) {
            if (!is_array($e)) { $rejected[] = ['index' => $i, 'reason' => 'รูปแบบไม่ถูกต้อง']; continue; }

            $matchId = (string) ($e['matchId'] ?? '');
            $type    = strtoupper((string) ($e['type'] ?? ''));
            $at      = (string) ($e['occurredAt'] ?? '');
            $idem    = (string) ($e['idempotencyKey'] ?? '');

            if ($matchId === '' || $idem === '') {
                $rejected[] = ['index' => $i, 'reason' => 'ต้องมี matchId และ idempotencyKey'];
                continue;
            }
            if (!in_array($type, PRODUCTION_EVENT_TYPES, true)) {
                $rejected[] = ['index' => $i, 'reason' => "ชนิด '$type' ไม่รองรับ"];
                continue;
            }
            // แปลงเวลาจาก ISO-8601 ที่ Node ส่งมา ให้เป็นรูปแบบที่ MySQL เก็บได้
            // เก็บถึงมิลลิวินาที ซึ่งเป็นเหตุผลทั้งหมดที่ตารางนี้มีอยู่
            $ts = production_parse_time($at);
            if ($ts === null) {
                $rejected[] = ['index' => $i, 'reason' => "เวลา '$at' อ่านไม่ได้"];
                continue;
            }

            $payload = isset($e['payload']) && is_array($e['payload'])
                ? json_encode($e['payload'], JSON_UNESCAPED_UNICODE)
                : null;

            // INSERT IGNORE + UNIQUE KEY = ส่งซ้ำกี่ครั้งก็ได้แถวเดียว
            // ไม่ต้อง SELECT ก่อนซึ่งจะแข่งกันเองเมื่อ Node ส่งพร้อมกันหลายชุด
            $n = Db::exec(
                'INSERT IGNORE INTO production_events
                   (match_id, event_type, occurred_at, payload, idempotency_key, created_by)
                 VALUES (?, ?, ?, ?, ?, ?)',
                [$matchId, $type, $ts, $payload, $idem, $nodeId]
            );
            if ($n > 0) { $accepted++; } else { $duplicated++; }
        }
    });

    Audit::log('production', $tournamentId, 'events_push', null, [
        'node'    => $nodeId,
        'accepted' => $accepted,
        'duplicated' => $duplicated,
        'rejected' => count($rejected),
    ]);

    Response::ok([
        'accepted'   => $accepted,
        'duplicated' => $duplicated,
        'rejected'   => $rejected,
    ]);
}

/**
 * ไทม์ไลน์ของนัดหนึ่ง — ให้ระบบรีเพลย์ดึงไปสร้างรายการจังหวะที่ตัดได้
 *
 * เปิดให้ผู้ดูแลรายการอ่านเท่านั้น เพราะ payload อาจมีชื่อผู้เล่นและมุมกล้อง
 * ซึ่งไม่ใช่ข้อมูลที่ต้องเปิดสาธารณะ
 */
function production_timeline(): void
{
    $tournamentId = Input::str('tournamentId');
    if ($tournamentId === '') {
        Response::fail('ต้องระบุ tournamentId', 422);
    }
    Perm::requireTournamentManager($tournamentId);

    $matchId = Input::str('matchId');
    if ($matchId === '') {
        Response::fail('ต้องระบุ matchId', 422);
    }

    $rows = Db::all(
        'SELECT event_type, occurred_at, payload, idempotency_key, created_by
           FROM production_events
          WHERE match_id = ?
          ORDER BY occurred_at ASC
          LIMIT 500',
        [$matchId]
    );

    $events = array_map(static function (array $r): array {
        return [
            'type'       => $r['event_type'],
            'occurredAt' => $r['occurred_at'],
            'payload'    => $r['payload'] !== null ? json_decode($r['payload'], true) : null,
            'key'        => $r['idempotency_key'],
            'node'       => $r['created_by'],
        ];
    }, $rows);

    Response::ok(['matchId' => $matchId, 'events' => $events]);
}

/**
 * heartbeat ของเครื่องถ่ายทอด — นาทีละครั้ง ไม่ใช่ทุกเฟรม
 *
 * มีไว้เพื่อให้ส่วนกลางตอบได้ว่า "ตอนนี้สนามไหนกำลังถ่ายอยู่ และเครื่องยังดีไหม"
 * โดยไม่ต้องโทรถาม — ไม่ได้ใช้ควบคุมอะไร Production Node ทำงานได้ต่อ
 * แม้ heartbeat ส่งไม่ถึงเลยทั้งงาน (หลักข้อแรก: WAN ขาดต้องยังทำงาน)
 */
function production_heartbeat(): void
{
    $nodeId = Input::str('nodeId');
    if ($nodeId === '') {
        Response::fail('ต้องระบุ nodeId', 422);
    }
    $tournamentId = Input::str('tournamentId');
    if ($tournamentId !== '') {
        Perm::requireTournamentManager($tournamentId);
    } else {
        Perm::requireGlobalAdmin();
    }

    $snapshot = Input::arr('status');
    $json = $snapshot ? json_encode($snapshot, JSON_UNESCAPED_UNICODE) : null;

    Db::exec(
        'INSERT INTO production_nodes (node_id, tournament_id, last_seen_at, status_snapshot)
         VALUES (?, ?, NOW(), ?)
         ON DUPLICATE KEY UPDATE
           tournament_id  = VALUES(tournament_id),
           last_seen_at    = VALUES(last_seen_at),
           status_snapshot = VALUES(status_snapshot)',
        [$nodeId, $tournamentId ?: null, $json]
    );

    // ไม่เขียน Audit ที่นี่ — heartbeat มานาทีละครั้งตลอดงาน
    // ถ้าบันทึกทุกครั้ง audit จะเต็มไปด้วยรายการที่ไม่มีใครอ่าน
    // จนกลบรายการที่สำคัญจริง
    Response::ok(['nodeId' => $nodeId, 'seenAt' => date('c')]);
}

/** รายชื่อเครื่องถ่ายทอดที่เคยรายงานตัว — สำหรับหน้าแอดมิน */
function production_nodes_list(): void
{
    Perm::requireGlobalAdmin();

    $rows = Db::all(
        'SELECT node_id, tournament_id, last_seen_at, status_snapshot
           FROM production_nodes
          ORDER BY last_seen_at DESC
          LIMIT 50'
    );

    $nodes = array_map(static function (array $r): array {
        return [
            'nodeId'       => $r['node_id'],
            'tournamentId' => $r['tournament_id'],
            'lastSeenAt'   => $r['last_seen_at'],
            // สดหรือไม่ตัดที่ 3 นาที = พลาด heartbeat ได้ 2 ครั้งก่อนถูกนับว่าหลุด
            // เผื่อไว้เพราะ Wi-Fi สนามหลุดเป็นช่วงสั้น ๆ เป็นเรื่องปกติ
            'online'       => $r['last_seen_at'] !== null
                && (time() - strtotime($r['last_seen_at'])) < 180,
            'status'       => $r['status_snapshot'] !== null
                ? json_decode($r['status_snapshot'], true) : null,
        ];
    }, $rows);

    Response::ok(['nodes' => $nodes]);
}

/**
 * อ่านเวลาแบบ ISO-8601 ที่มีมิลลิวินาที ให้เป็นรูปแบบของ MySQL
 * คืน null ถ้าอ่านไม่ได้ — ปฏิเสธดีกว่าบันทึกเวลาที่ผิดแล้วตัดคลิปพลาดทั้งงาน
 */
function production_parse_time(string $iso): ?string
{
    if ($iso === '') {
        return null;
    }
    try {
        $dt = new DateTimeImmutable($iso);
    } catch (Exception) {
        return null;
    }
    // เก็บเป็นเวลาไทยให้ตรงกับคอลัมน์ DATETIME อื่นในระบบเดิม
    // ถ้าเก็บ UTC ปนกับตารางที่เก็บเวลาไทย การเทียบเวลาจะเพี้ยนไป 7 ชั่วโมง
    // โดยไม่มีอะไรฟ้อง
    $dt = $dt->setTimezone(new DateTimeZone('Asia/Bangkok'));
    return $dt->format('Y-m-d H:i:s.v');
}
