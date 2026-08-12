<?php
declare(strict_types=1);

/**
 * ประกวดภาพถ่าย — รายการประกวด รูปที่ส่งเข้าประกวด ไลก์ และคอมเมนต์
 *
 * ของเดิมอยู่บนชีตและยิงด้วย mode:'no-cors' ทั้งหมด ผลคือ:
 *   - กดไลก์รัว ๆ แล้วยอดเพี้ยน เพราะอ่าน-บวก-เขียนคนละจังหวะกัน
 *     ที่นี่ไลก์เป็นตาราง entry_likes ที่มี PK (entry_id, user_id) ⇒ ซ้ำไม่ได้
 *     โดยตัวโครงสร้างเอง ไม่ต้องพึ่งลำดับการเรียก
 *   - ลบรูปของคนอื่นได้ถ้ายิง URL ตรง ที่นี่ตรวจเจ้าของหรือแอดมินเสมอ
 *   - นับแชร์/คอมเมนต์แล้วไม่รู้ว่าสำเร็จจริงไหม ที่นี่ตอบยอดล่าสุดกลับไป
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        'getContests'         => list_contests(),
        'submitContestEntry'  => submit_entry($cfg),
        'deleteContestEntry'  => delete_entry(),
        'toggleEntryLike'     => toggle_like(),
        'manageContest'       => manage_contest(),
        'getComments'         => list_comments(),
        'submitContestComment' => submit_comment(),
        'incrementShareCount' => increment_share(),
        default               => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

// ─────────────────────────────────────────────────────────────────────────

/** ผู้ใช้ LINE ที่ยังไม่มีในระบบต้องสร้างก่อน ไม่งั้น FK ไม่ผ่าน */
/**
 * ตัวตนของคนที่กำลังทำรายการ — เอาจาก token เท่านั้น
 *
 * ของเดิมอ่าน userId จาก body ตรง ๆ แล้วเชื่อเลย ใครรู้ user id ของคนอื่นก็
 * ส่งรูปประกวด กดไลก์ คอมเมนต์ หรือลบรูปในนามคนนั้นได้ทันที
 * แถม ensure_user() ยัง INSERT users ใหม่จากข้อมูลที่ client ส่งมา รวมถึง
 * line_user_id — จองบัญชีดักไว้ล่วงหน้าได้ พอเจ้าตัวเข้าด้วย LINE จริง
 * line_login() จะเจอแถวที่ถูกยัดไว้แล้วแล้วออก session ให้กับแถวนั้น
 *
 * เป็นช่องโหว่ชนิดเดียวกับที่ปิดไปแล้วในหน้า login (เลิกเชื่อ lineUserId ดิบ)
 * แต่ตกหล่นไฟล์นี้ ผู้ใช้ LINE ที่เข้าระบบแล้วมี token อยู่แล้วทุกคน
 * จึงไม่ต้องสร้าง user เองอีก
 */
function actor_id(): string
{
    return (string) Auth::requireLogin()['user_id'];
}

function entry_payload(array $e, array $likedBy): array
{
    return [
        'id'              => $e['entry_id'],
        'contestId'       => $e['contest_id'],
        'userId'          => (string) ($e['user_id'] ?? ''),
        'userDisplayName' => (string) ($e['display_name'] ?? 'ผู้ใช้ที่ถูกลบ'),
        'userPictureUrl'  => drive_img($e['picture_url'] ?? ''),
        'photoUrl'        => drive_img($e['photo_url']),
        'caption'         => $e['caption'],
        'likeCount'       => (int) $e['like_count'],
        'likedBy'         => $likedBy,
        'commentCount'    => (int) ($e['comment_count'] ?? 0),
        'shareCount'      => (int) $e['share_count'],
        'timestamp'       => iso_dt($e['created_at']),
    ];
}

/** DATETIME ของ MySQL -> ISO ที่ frontend อ่านได้ (มี timezone ติดไปด้วย) */
function iso_dt(?string $v): ?string
{
    if ($v === null || $v === '') {
        return null;
    }
    $ts = strtotime($v);
    return $ts === false ? null : date('c', $ts);
}

// ── อ่าน ──────────────────────────────────────────────────────────────────

function list_contests(): void
{
    $payload = Cache::remember('contests_all', static function (): array {
        $contests = array_map(static fn(array $c): array => [
            'id'          => $c['contest_id'],
            'title'       => $c['title'],
            'description' => (string) $c['description'],
            'status'      => $c['status'],
            'createdDate' => iso_dt($c['created_at']),
            'closingDate' => iso_dt($c['closing_date']),
        ], Db::all('SELECT * FROM contests ORDER BY created_at DESC'));

        $rows = Db::all(
            'SELECT e.*, u.display_name, u.picture_url,
                    (SELECT COUNT(*) FROM contest_comments c
                      WHERE c.entry_id = e.entry_id) AS comment_count
               FROM contest_entries e
               LEFT JOIN users u ON u.user_id = e.user_id
              ORDER BY e.created_at DESC'
        );

        // ดึงไลก์ทั้งหมดทีเดียวแล้วจัดกลุ่มในโค้ด — ไม่ยิงทีละรูป (N+1)
        $likes = [];
        foreach (Db::all('SELECT entry_id, user_id FROM entry_likes') as $l) {
            $likes[$l['entry_id']][] = $l['user_id'];
        }

        $entries = array_map(
            static fn(array $e): array => entry_payload($e, $likes[$e['entry_id']] ?? []),
            $rows);

        return ['contests' => $contests, 'entries' => $entries];
    });

    Response::ok($payload);
}

function list_comments(): void
{
    $entryId = Input::require_str('entryId');
    $rows = Db::all(
        'SELECT c.*, u.display_name, u.picture_url
           FROM contest_comments c
           LEFT JOIN users u ON u.user_id = c.user_id
          WHERE c.entry_id = :eid
          ORDER BY c.created_at',
        [':eid' => $entryId]
    );

    Response::ok(['comments' => array_map(static fn(array $c): array => [
        'id'              => $c['comment_id'],
        'entryId'         => $c['entry_id'],
        'userId'          => (string) ($c['user_id'] ?? ''),
        'userDisplayName' => (string) ($c['display_name'] ?? 'ผู้ใช้ที่ถูกลบ'),
        'userPictureUrl'  => drive_img($c['picture_url'] ?? ''),
        'message'         => $c['message'],
        'timestamp'       => iso_dt($c['created_at']),
    ], $rows)]);
}

// ── ส่งรูปเข้าประกวด ──────────────────────────────────────────────────────

function submit_entry(array $cfg): void
{
    $contestId = Input::require_str('contestId');
    $userId = actor_id();

    $c = Db::one('SELECT * FROM contests WHERE contest_id = :cid', [':cid' => $contestId]);
    if ($c === null) {
        Response::fail('ไม่พบรายการประกวดนี้', 404);
    }
    // ปิดรับแล้วส่งไม่ได้ — เดิมเช็คแค่ฝั่งหน้าเว็บ
    if ($c['status'] !== 'Open') {
        Response::fail('รายการประกวดนี้ปิดรับแล้ว', 409);
    }
    if ($c['closing_date'] !== null && strtotime((string) $c['closing_date']) < time()) {
        Response::fail('เลยกำหนดปิดรับภาพแล้ว', 409,
            ['closingDate' => $c['closing_date']]);
    }

    try {
        $photoUrl = store_data_url(Input::str('photoFile') ?: Input::str('photoUrl'),
            'contest', $cfg);
    } catch (RuntimeException $e) {
        Response::fail('อัปโหลดรูปไม่สำเร็จ: ' . $e->getMessage(), 422);
    }
    if ($photoUrl === '') {
        Response::fail('ต้องแนบรูปภาพ', 422);
    }

    $entryId = 'CE_' . (int) (microtime(true) * 1000) . '_' . random_int(100, 999);
    Db::exec(
        'INSERT INTO contest_entries (entry_id, contest_id, user_id, photo_url, caption)
         VALUES (:eid, :cid2, :uid, :photo, :cap)',
        [
            ':eid'   => $entryId,
            ':cid2'  => $contestId,
            ':uid'   => $userId,
            ':photo' => $photoUrl,
            ':cap'   => mb_substr(Input::str('caption'), 0, 500),
        ]
    );

    Audit::log('contest_entry', $entryId, 'submit', null, ['contest' => $contestId]);
    Cache::flush();
    Response::ok(['entryId' => $entryId, 'photoUrl' => $photoUrl]);
}

function delete_entry(): void
{
    $entryId = Input::require_str('entryId');
    $userId  = actor_id();

    $e = Db::one('SELECT * FROM contest_entries WHERE entry_id = :eid', [':eid' => $entryId]);
    if ($e === null) {
        Response::fail('ไม่พบรูปนี้', 404);
    }
    // เจ้าของรูป หรือเจ้าหน้าที่เท่านั้น — เดิมใครยิง URL ตรงก็ลบของคนอื่นได้
    // (isStaff() เป็น staff ล้วน ไม่รวม admin จึงต้องเช็ค role เอง)
    $isCrew = in_array(Auth::role() ?? '', ['admin', 'staff'], true);
    if (!$isCrew && (string) $e['user_id'] !== $userId) {
        Response::fail('ลบได้เฉพาะรูปของตัวเอง', 403);
    }

    Audit::log('contest_entry', $entryId, 'delete', $e, null);
    Db::exec('DELETE FROM contest_entries WHERE entry_id = :eid2', [':eid2' => $entryId]);
    Cache::flush();
    Response::ok();
}

// ── ไลก์ / คอมเมนต์ / แชร์ ────────────────────────────────────────────────

/**
 * กดไลก์/ยกเลิกไลก์
 *
 * like_count เป็นแค่ cache ของจำนวนแถวใน entry_likes — คำนวณใหม่จากของจริง
 * ทุกครั้งในทรานแซกชันเดียวกัน ไม่ใช่ +1/-1 ซึ่งเพี้ยนได้ถ้ามีคำขอชนกัน
 */
function toggle_like(): void
{
    $entryId = Input::require_str('entryId');
    $userId = actor_id();

    if (Db::value('SELECT 1 FROM contest_entries WHERE entry_id = :eid',
            [':eid' => $entryId]) === null) {
        Response::fail('ไม่พบรูปนี้', 404);
    }

    $liked = false;
    Db::transaction(static function () use ($entryId, $userId, &$liked): void {
        $has = Db::value(
            'SELECT 1 FROM entry_likes WHERE entry_id = :eid2 AND user_id = :uid',
            [':eid2' => $entryId, ':uid' => $userId]);

        if ($has !== null) {
            Db::exec('DELETE FROM entry_likes WHERE entry_id = :eid3 AND user_id = :uid2',
                [':eid3' => $entryId, ':uid2' => $userId]);
            $liked = false;
        } else {
            Db::exec('INSERT INTO entry_likes (entry_id, user_id) VALUES (:eid4, :uid3)',
                [':eid4' => $entryId, ':uid3' => $userId]);
            $liked = true;
        }

        Db::exec(
            'UPDATE contest_entries
                SET like_count = (SELECT COUNT(*) FROM entry_likes l
                                   WHERE l.entry_id = :eid5)
              WHERE entry_id = :eid6',
            [':eid5' => $entryId, ':eid6' => $entryId]
        );
    });

    $likedBy = array_column(
        Db::all('SELECT user_id FROM entry_likes WHERE entry_id = :eid7',
            [':eid7' => $entryId]), 'user_id');

    Cache::flush();
    Response::ok([
        'liked'    => $liked,
        'newCount' => count($likedBy),
        'likedBy'  => $likedBy,
    ]);
}

function submit_comment(): void
{
    $entryId = Input::require_str('entryId');
    $userId = actor_id();

    $message = trim(Input::str('message'));
    if ($message === '') {
        Response::fail('ข้อความว่างเปล่า', 422);
    }
    if (Db::value('SELECT 1 FROM contest_entries WHERE entry_id = :eid',
            [':eid' => $entryId]) === null) {
        Response::fail('ไม่พบรูปนี้', 404);
    }

    $commentId = 'CMT_' . (int) (microtime(true) * 1000) . '_' . random_int(100, 999);
    Db::exec(
        'INSERT INTO contest_comments (comment_id, entry_id, user_id, message)
         VALUES (:cid, :eid2, :uid, :msg)',
        [
            ':cid'  => $commentId,
            ':eid2' => $entryId,
            ':uid'  => $userId,
            ':msg'  => mb_substr($message, 0, 1000),
        ]
    );

    Cache::flush();
    Response::ok(['commentId' => $commentId, 'id' => $commentId]);
}

function increment_share(): void
{
    $entryId = Input::require_str('entryId');
    Db::exec(
        'UPDATE contest_entries SET share_count = share_count + 1 WHERE entry_id = :eid',
        [':eid' => $entryId]);
    $n = Db::value('SELECT share_count FROM contest_entries WHERE entry_id = :eid2',
        [':eid2' => $entryId]);
    if ($n === null) {
        Response::fail('ไม่พบรูปนี้', 404);
    }
    Cache::flush();
    Response::ok(['shareCount' => (int) $n]);
}

// ── จัดการรายการประกวด (แอดมิน) ───────────────────────────────────────────

function manage_contest(): void
{
    Auth::requireStaff();

    $mode = strtolower(Input::str('mode') ?: 'add');
    $c = Input::arr('contest');
    if ($c === []) {
        // รองรับแบบส่งค่าแบนมาตรง ๆ ตามสัญญาเดิม
        $c = ['id' => Input::str('id'), 'title' => Input::str('title'),
              'description' => Input::str('description'),
              'status' => Input::str('status'),
              'closingDate' => Input::str('closingDate')];
    }

    $status = in_array($c['status'] ?? '', ['Open', 'Closed'], true) ? $c['status'] : 'Open';
    $closing = ($c['closingDate'] ?? '') !== ''
        ? date('Y-m-d H:i:s', (int) strtotime((string) $c['closingDate'])) : null;

    if ($mode === 'delete') {
        $id = trim((string) ($c['id'] ?? ''));
        if ($id === '') {
            Response::fail('ต้องระบุ id', 422);
        }
        // รูปและคอมเมนต์หายตาม FK CASCADE — บอกให้รู้ก่อนว่ากี่รูป
        $entries = (int) Db::value(
            'SELECT COUNT(*) FROM contest_entries WHERE contest_id = :cid',
            [':cid' => $id]);
        if ($entries > 0 && !Input::bool('force')) {
            Response::fail(
                "รายการนี้มี $entries รูปที่จะถูกลบไปด้วย — ส่ง force=true เพื่อยืนยัน",
                409, ['entries' => $entries]);
        }
        Audit::log('contest', $id, 'delete', null, ['entries' => $entries]);
        Db::exec('DELETE FROM contests WHERE contest_id = :cid2', [':cid2' => $id]);
        Cache::flush();
        Response::ok(['deletedEntries' => $entries]);
    }

    $title = trim((string) ($c['title'] ?? ''));
    if ($title === '') {
        Response::fail('ต้องระบุชื่อรายการประกวด', 422);
    }

    if ($mode === 'add') {
        $id = 'CT_' . (int) (microtime(true) * 1000) . '_' . random_int(100, 999);
        Db::exec(
            'INSERT INTO contests (contest_id, title, description, status, closing_date)
             VALUES (:cid3, :title, :desc, :status, :close)',
            [
                ':cid3'  => $id, ':title' => $title,
                ':desc'  => (string) ($c['description'] ?? ''),
                ':status' => $status, ':close' => $closing,
            ]
        );
        Audit::log('contest', $id, 'create', null, ['title' => $title]);
    } else {
        $id = trim((string) ($c['id'] ?? ''));
        if ($id === '') {
            Response::fail('ต้องระบุ id', 422);
        }
        Db::exec(
            'UPDATE contests SET title = :title2, description = :desc2,
                    status = :status2, closing_date = :close2
              WHERE contest_id = :cid4',
            [
                ':title2' => $title,
                ':desc2'  => (string) ($c['description'] ?? ''),
                ':status2' => $status, ':close2' => $closing, ':cid4' => $id,
            ]
        );
        Audit::log('contest', $id, 'update', null, ['title' => $title]);
    }

    Cache::flush();
    Response::ok(['contestId' => $id]);
}
