<?php
declare(strict_types=1);

/**
 * ข้อความจากผู้ชม สำหรับขึ้นแถบวิ่งบนจอถ่ายทอดสด
 *
 * ── หลักข้อเดียวที่สำคัญที่สุด ────────────────────────────────────────
 * **ไม่มีทางไหนเลยที่ข้อความยังไม่อนุมัติจะออกไปถึงจอถ่ายทอดได้**
 * ปลายทางคือจอที่คนทั้งอำเภอเห็น การพลาดครั้งเดียวลบไม่ได้ — เส้นทางที่
 * เครื่องถ่ายทอดเรียก (`getBroadcastComments`) จึงกรอง status='approved'
 * ไว้ในคำสั่ง SQL ตรง ๆ ไม่ใช่รับพารามิเตอร์มาแล้วค่อยตัดสินใจ
 *
 * ── ทำไมส่งได้โดยไม่ต้องล็อกอิน ──────────────────────────────────────
 * คนดูส่วนใหญ่คือผู้ปกครองที่เปิดจากลิงก์ในไลน์ ถ้าบังคับสมัครสมาชิกก่อน
 * จะไม่มีใครส่งเลยและฟีเจอร์นี้ก็ไม่มีความหมาย — ความปลอดภัยมาจาก
 * "ต้องอนุมัติก่อนขึ้นจอ" ไม่ใช่จาก "ต้องรู้ว่าใครส่ง"
 *
 * ── ถ้าลบไฟล์นี้กับ db/27 ทิ้ง ระบบเดิมยังทำงานครบเหมือนไม่เคยมี ──────
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        'submitBroadcastComment'   => broadcast_comment_submit(),
        'getBroadcastComments'     => broadcast_comments_approved(),
        'listBroadcastComments'    => broadcast_comments_queue(),
        'moderateBroadcastComment' => broadcast_comment_moderate(),
        default                    => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

// ─────────────────────────────────────────────────────────────────────────

/** ยาวกว่านี้อ่านไม่ทันบนแถบวิ่งที่เลื่อนผ่านจอ */
const BCOMMENT_MAX_LEN = 300;

/** ส่งได้กี่ข้อความต่อช่วงเวลา — กันสแปมโดยไม่กันคนที่ตั้งใจส่งจริง */
const BCOMMENT_RATE_MAX     = 5;
const BCOMMENT_RATE_MINUTES = 10;

/**
 * ค่าแฮชของ IP — ใช้กันสแปมโดยไม่เก็บข้อมูลส่วนบุคคล
 *
 * ใช้วิธีเดียวกับ Audit::ipHash คือหมุน salt รายวัน
 * ผลข้างเคียงที่ตั้งใจ: การนับสแปมรีเซ็ตทุกวัน ซึ่งเหมาะกับงานที่จัดเป็นวัน ๆ
 * และแปลว่าค่าที่เก็บไว้ย้อนหลังโยงกลับไปหาคนไม่ได้อีกเลย
 */
function bcomment_ip_hash(): string
{
    $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
    if ($ip === '') {
        return '';
    }
    $ip = trim(explode(',', (string) $ip)[0]);
    return hash('sha256', $ip . '|' . date('Y-m-d'));
}

/** ตัดอักขระควบคุมและช่องว่างซ้ำ — แถบวิ่งขึ้นบรรทัดเดียวเสมอ */
function bcomment_clean(string $s, int $max): string
{
    $s = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s) ?? '';
    $s = preg_replace('/\s+/u', ' ', $s) ?? '';
    return mb_substr(trim($s), 0, $max);
}

/**
 * ผู้ชมส่งข้อความ — เข้าคิวรออนุมัติเสมอ
 */
function broadcast_comment_submit(): void
{
    $tournamentId = Input::require_str('tournamentId');
    $message      = bcomment_clean(Input::str('message'), BCOMMENT_MAX_LEN);
    $author       = bcomment_clean(Input::str('authorName'), 80);
    $matchId      = Input::str('matchId');

    if ($message === '') {
        Response::fail('ยังไม่ได้พิมพ์ข้อความ', 422);
    }
    // สั้นเกินไปมักเป็นการกดทดสอบ ไม่ใช่ข้อความที่อยากให้ขึ้นจอ
    if (mb_strlen($message) < 2) {
        Response::fail('ข้อความสั้นเกินไป', 422);
    }

    $exists = Db::value(
        'SELECT tournament_id FROM tournaments WHERE tournament_id = :tid',
        [':tid' => $tournamentId]
    );
    if ($exists === null || $exists === false) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }

    $ipHash = bcomment_ip_hash();
    // หา IP ไม่ได้ = นับสแปมไม่ได้ ข้ามการนับไปดีกว่าเหมารวมทุกคนเป็นคนเดียวกัน
    $recent = $ipHash === '' ? 0 : (int) Db::value(
        'SELECT COUNT(*) FROM broadcast_comments
          WHERE ip_hash = :ip
            AND created_at > (NOW() - INTERVAL ' . BCOMMENT_RATE_MINUTES . ' MINUTE)',
        [':ip' => $ipHash]
    );
    if ($recent >= BCOMMENT_RATE_MAX) {
        Response::fail(
            'ส่งบ่อยเกินไป — รอสักครู่แล้วลองใหม่',
            429,
            ['retryAfterMinutes' => BCOMMENT_RATE_MINUTES]
        );
    }

    $id = 'BCM_' . (string) round(microtime(true) * 1000);
    Db::exec(
        'INSERT INTO broadcast_comments
            (comment_id, tournament_id, match_id, author_name, message, user_id, ip_hash)
         VALUES (:cid, :tid2, :mid, :author, :msg, :uid, :ip2)',
        [
            ':cid'    => $id,
            ':tid2'   => $tournamentId,
            ':mid'    => $matchId !== '' ? $matchId : null,
            ':author' => $author,
            ':msg'    => $message,
            ':uid'    => Auth::userId(),
            ':ip2'    => $ipHash,
        ]
    );

    Audit::log('broadcast_comment', $id, 'submit', null,
        ['tournamentId' => $tournamentId, 'message' => $message]);

    // บอกตรง ๆ ว่ายังไม่ขึ้นจอ — ไม่งั้นคนส่งจะรอดูแล้วคิดว่าระบบเสีย
    Response::ok([
        'commentId' => $id,
        'status'    => 'pending',
        'note'      => 'ส่งแล้ว รอเจ้าหน้าที่ตรวจก่อนขึ้นจอ',
    ]);
}

/**
 * ข้อความที่อนุมัติแล้ว — เครื่องถ่ายทอดเรียกเส้นนี้
 *
 * ⚠️ status='approved' เขียนตายตัวใน SQL โดยตั้งใจ
 * ไม่รับเป็นพารามิเตอร์ เพราะเส้นนี้เปิดสาธารณะและปลายทางคือจอออกอากาศ
 */
function broadcast_comments_approved(): void
{
    $tournamentId = Input::str('tournamentId');
    $limit = max(1, min(100, (int) (Input::int('limit') ?? 40)));

    /*
     * ดึงรูปกับชื่อจากบัญชีผู้ใช้เมื่อผู้ส่งล็อกอินอยู่
     *
     * LEFT JOIN เพราะคนส่วนใหญ่ส่งโดยไม่ล็อกอิน — ต้องได้ข้อความครบทุกอัน
     * ไม่ใช่เหลือเฉพาะของคนที่มีบัญชี
     *
     * ชื่อในบัญชีใช้ต่อเมื่อผู้ส่งไม่ได้พิมพ์ชื่อเอง — ที่เขาพิมพ์มาสำคัญกว่า
     * เพราะเขาอาจตั้งใจใช้ชื่ออื่นในบริบทนี้ (เช่นชื่อโรงเรียนแทนชื่อตัวเอง)
     */
    $sql = 'SELECT c.comment_id, c.author_name, c.message, c.created_at,
                   u.display_name, u.picture_url
              FROM broadcast_comments c
              LEFT JOIN users u ON u.user_id = c.user_id
             WHERE c.status = \'approved\'';
    $params = [];
    if ($tournamentId !== '') {
        $sql .= ' AND c.tournament_id = :tid';
        $params[':tid'] = $tournamentId;
    }
    $sql .= ' ORDER BY c.created_at DESC LIMIT ' . $limit;

    $rows = Db::all($sql, $params);
    Response::ok(['comments' => array_map(static fn(array $r): array => [
        'id'      => $r['comment_id'],
        'author'  => $r['author_name'] !== '' ? $r['author_name'] : (string) ($r['display_name'] ?? ''),
        'picture' => drive_img((string) ($r['picture_url'] ?? '')),
        'message' => $r['message'],
        'at'      => $r['created_at'],
    ], $rows)]);
}

/**
 * คิวรอตรวจ — เจ้าหน้าที่ของรายการนั้นเท่านั้น
 */
function broadcast_comments_queue(): void
{
    $tournamentId = Input::require_str('tournamentId');
    Perm::requireTournamentManager($tournamentId);

    $status = Input::enum('status', ['pending', 'approved', 'rejected'], 'pending');
    // คนคัดกรองต้องเห็นรูปกับชื่อจริงด้วย — ช่วยตัดสินใจได้เร็วกว่าดูข้อความอย่างเดียว
    $rows = Db::all(
        'SELECT c.comment_id, c.match_id, c.author_name, c.message, c.status,
                c.created_at, c.moderated_at, c.moderated_by,
                u.display_name, u.picture_url
           FROM broadcast_comments c
           LEFT JOIN users u ON u.user_id = c.user_id
          WHERE c.tournament_id = :tid AND c.status = :st
          ORDER BY c.created_at ASC
          LIMIT 200',
        [':tid' => $tournamentId, ':st' => $status]
    );

    $counts = Db::all(
        'SELECT status, COUNT(*) AS n FROM broadcast_comments
          WHERE tournament_id = :tid2 GROUP BY status',
        [':tid2' => $tournamentId]
    );

    Response::ok([
        'comments' => array_map(static fn(array $r): array => [
            'id'          => $r['comment_id'],
            'matchId'     => $r['match_id'],
            'author'      => $r['author_name'] !== '' ? $r['author_name'] : (string) ($r['display_name'] ?? ''),
            'picture'     => drive_img((string) ($r['picture_url'] ?? '')),
            'message'     => $r['message'],
            'status'      => $r['status'],
            'at'          => $r['created_at'],
            'moderatedAt' => $r['moderated_at'],
            'moderatedBy' => $r['moderated_by'],
        ], $rows),
        'counts' => array_column($counts, 'n', 'status'),
    ]);
}

/**
 * อนุมัติ / ปฏิเสธ / เอาลงจากจอ
 *
 * เปลี่ยนกลับเป็น rejected ได้เสมอ — ข้อความที่อนุมัติไปแล้วแต่มีคนทักทีหลัง
 * ต้องเอาลงได้ทันทีโดยไม่ต้องลบทิ้ง (จะได้ยังตรวจสอบย้อนหลังได้ว่าเคยขึ้นอะไร)
 */
function broadcast_comment_moderate(): void
{
    $tournamentId = Input::require_str('tournamentId');
    Perm::requireTournamentManager($tournamentId);

    $ids = Input::arr('commentIds');
    if (!$ids) {
        $one = Input::str('commentId');
        if ($one !== '') { $ids = [$one]; }
    }
    if (!$ids) {
        Response::fail('ยังไม่ได้เลือกข้อความ', 422);
    }
    if (count($ids) > 100) {
        Response::fail('ทำได้ครั้งละไม่เกิน 100 ข้อความ', 422);
    }

    $status = Input::enum('status', ['approved', 'rejected', 'pending']);
    if ($status === null) {
        Response::fail('สถานะต้องเป็น approved, rejected หรือ pending', 422);
    }

    $ph = [];
    $params = [':st' => $status, ':by' => (string) (Auth::userId() ?? ''), ':tid' => $tournamentId];
    foreach (array_values($ids) as $i => $id) {
        $key = ':id' . $i;
        $ph[] = $key;
        $params[$key] = (string) $id;
    }

    // ผูก tournament_id ไว้ในเงื่อนไขด้วย — กันคนที่ดูแลรายการหนึ่ง
    // ส่ง id ของอีกรายการมาแล้วแก้ข้ามรายการได้
    $n = Db::exec(
        'UPDATE broadcast_comments
            SET status = :st, moderated_at = NOW(), moderated_by = :by
          WHERE tournament_id = :tid AND comment_id IN (' . implode(',', $ph) . ')',
        $params
    );

    Audit::log('broadcast_comment', $tournamentId, 'moderate', null,
        ['status' => $status, 'count' => $n, 'ids' => array_values($ids)]);
    Response::ok(['updated' => $n, 'status' => $status]);
}
