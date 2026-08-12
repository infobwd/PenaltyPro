<?php
declare(strict_types=1);

/**
 * กล่องแจ้งเตือนในแอป + การตั้งค่า + การรับ push
 *
 * ทุก action ที่นี่ทำงานกับ "ของฉัน" เท่านั้น — ผูก user_id จาก session เสมอ
 * ไม่รับ userId จาก client ไม่ว่ากรณีใด ไม่งั้นจะอ่าน/ลบกล่องของคนอื่นได้
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        'getNotifications'      => list_notifications(),
        'notificationCount'     => unread_count(),
        'readNotification'      => mark_read(),
        'readAllNotifications'  => mark_all_read(),
        'deleteNotification'    => delete_one(),
        'clearNotifications'    => clear_all(),
        'savePushSubscription'  => save_subscription(),
        'deletePushSubscription' => delete_subscription(),
        'getNotificationPrefs'  => get_prefs(),
        'saveNotificationPrefs' => save_prefs(),
        'pushConfig'            => push_config(),
        'sendTestNotification'  => send_test(),
        default                 => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

/** id ของผู้ใช้ปัจจุบัน — ทุก endpoint ที่นี่ต้องผ่านตัวนี้ */
function me(): string
{
    return (string) Auth::requireLogin()['user_id'];
}

function row_payload(array $n): array
{
    return [
        'id'        => (int) $n['id'],
        'type'      => $n['type'],
        'title'     => $n['title'],
        'body'      => $n['body'],
        'url'       => $n['url'],
        'metadata'  => $n['metadata_json'] ? json_decode((string) $n['metadata_json'], true) : null,
        'readAt'    => $n['read_at'],
        'createdAt' => $n['created_at'],
        'isRead'    => $n['read_at'] !== null,
    ];
}

// ── อ่าน ──────────────────────────────────────────────────────────────────

function list_notifications(): void
{
    $uid = me();
    $limit  = max(1, min(50, Input::int('limit') ?? 20));
    $offset = max(0, Input::int('offset') ?? 0);
    $unreadOnly = Input::bool('unread');

    $where = 'user_id = :uid' . ($unreadOnly ? ' AND read_at IS NULL' : '');

    // LIMIT/OFFSET ต่อเข้าไปตรง ๆ หลังบังคับเป็น int แล้ว เพราะ MySQL ไม่ยอมให้
    // bind ค่าเหล่านี้เป็นพารามิเตอร์ในโหมด emulate ปิด
    $rows = Db::all(
        "SELECT * FROM notifications WHERE $where
          ORDER BY created_at DESC, id DESC
          LIMIT $limit OFFSET $offset",
        [':uid' => $uid]
    );

    Response::ok([
        'items'  => array_map('row_payload', $rows),
        'total'  => (int) Db::value(
            "SELECT COUNT(*) FROM notifications WHERE $where", [':uid' => $uid]),
        'unreadCount' => (int) Db::value(
            'SELECT COUNT(*) FROM notifications WHERE user_id = :uid2 AND read_at IS NULL',
            [':uid2' => $uid]),
        'limit'  => $limit,
        'offset' => $offset,
    ]);
}

function unread_count(): void
{
    Response::ok(['unreadCount' => (int) Db::value(
        'SELECT COUNT(*) FROM notifications WHERE user_id = :uid AND read_at IS NULL',
        [':uid' => me()])]);
}

// ── เปลี่ยนสถานะ ──────────────────────────────────────────────────────────

function mark_read(): void
{
    $uid = me();
    $id = Input::int('id') ?? 0;
    if ($id <= 0) {
        Response::fail('ต้องระบุ id', 422);
    }
    // เงื่อนไข user_id ในคำสั่งเดียวกัน = คนอื่นสั่งอ่านของเราไม่ได้แม้รู้ id
    Db::exec(
        'UPDATE notifications SET read_at = NOW()
          WHERE id = :id AND user_id = :uid AND read_at IS NULL',
        [':id' => $id, ':uid' => $uid]
    );
    unread_count();
}

function mark_all_read(): void
{
    $uid = me();
    $n = Db::exec(
        'UPDATE notifications SET read_at = NOW() WHERE user_id = :uid AND read_at IS NULL',
        [':uid' => $uid]);
    Response::ok(['marked' => $n, 'unreadCount' => 0]);
}

function delete_one(): void
{
    $uid = me();
    $id = Input::int('id') ?? 0;
    if ($id <= 0) {
        Response::fail('ต้องระบุ id', 422);
    }
    Db::exec('DELETE FROM notifications WHERE id = :id AND user_id = :uid',
        [':id' => $id, ':uid' => $uid]);
    unread_count();
}

function clear_all(): void
{
    $uid = me();
    $n = Db::exec('DELETE FROM notifications WHERE user_id = :uid', [':uid' => $uid]);
    Response::ok(['deleted' => $n, 'unreadCount' => 0]);
}

// ── การรับ push เข้าเครื่อง ───────────────────────────────────────────────

/**
 * บันทึก subscription ของเบราว์เซอร์เครื่องนี้
 *
 * เก็บได้เครื่องเดียวต่อบัญชีโดยตั้งใจ — เปิดจากเครื่องใหม่จะแทนที่ของเก่า
 * ครูส่วนใหญ่ใช้มือถือเครื่องเดียว การเก็บหลายเครื่องแลกกับความซับซ้อน
 * (ต้องมีตารางแยก + ตามล้างของที่ตายแล้ว) ซึ่งไม่คุ้มในรอบนี้
 */
function save_subscription(): void
{
    $uid = me();
    $sub = Input::arr('subscription');
    if ($sub === []) {
        $sub = Input::body();   // รองรับกรณีส่ง subscription มาตรง ๆ ทั้งก้อน
    }
    $endpoint = (string) ($sub['endpoint'] ?? '');
    if ($endpoint === '' || !str_starts_with($endpoint, 'https://')) {
        Response::fail('ข้อมูลการรับแจ้งเตือนไม่ถูกต้อง', 422);
    }
    if (empty($sub['keys']['p256dh']) || empty($sub['keys']['auth'])) {
        Response::fail('ข้อมูลการรับแจ้งเตือนไม่ครบ (ไม่มีคีย์)', 422);
    }

    Db::exec('UPDATE users SET push_subscription_json = :json WHERE user_id = :uid',
        [':json' => json_encode($sub, JSON_UNESCAPED_SLASHES), ':uid' => $uid]);

    Audit::log('user', $uid, 'push_subscribe');
    Response::ok(['subscribed' => true]);
}

function delete_subscription(): void
{
    $uid = me();
    Db::exec('UPDATE users SET push_subscription_json = NULL WHERE user_id = :uid',
        [':uid' => $uid]);
    Audit::log('user', $uid, 'push_unsubscribe');
    Response::ok(['subscribed' => false]);
}

/**
 * ค่าที่หน้าเว็บต้องใช้เพื่อขอสิทธิ์แจ้งเตือน
 *
 * ส่งเฉพาะ public key — private key ต้องไม่ออกจากเซิร์ฟเวอร์เด็ดขาด
 */
function push_config(): void
{
    $pub = (string) (Db::value(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'vapid_public_key'") ?? '');
    Response::ok([
        'vapidPublicKey' => $pub,
        'enabled' => $pub !== '',
    ]);
}

// ── การตั้งค่ารายบุคคล ────────────────────────────────────────────────────

function get_prefs(): void
{
    $uid = me();
    Response::ok([
        'preferences' => NotificationPrefs::get($uid),
        'types' => NotificationPrefs::TYPES,
        'pushEnabled' => Db::value(
            'SELECT push_subscription_json IS NOT NULL FROM users WHERE user_id = :uid',
            [':uid' => $uid]) == 1,
    ]);
}

function save_prefs(): void
{
    $uid = me();
    $prefs = Input::arr('preferences');
    if ($prefs === []) {
        Response::fail('ไม่มีค่าที่จะบันทึก', 422);
    }
    NotificationPrefs::set($uid, $prefs);
    Response::ok(['preferences' => NotificationPrefs::get($uid)]);
}

/**
 * ส่งการแจ้งเตือนทดสอบให้ตัวเอง
 *
 * ใช้ตรวจว่าเปิดสิทธิ์ในเบราว์เซอร์แล้วใช้ได้จริงไหม ก่อนถึงวันแข่ง
 * ส่งได้เฉพาะให้ตัวเอง จึงไม่กลายเป็นช่องทางสแปมคนอื่น
 */
function send_test(): void
{
    $uid = me();
    PushNotifier::notify(
        $uid, 'system_announcement',
        'ทดสอบการแจ้งเตือน',
        'ถ้าเห็นข้อความนี้ แปลว่าการแจ้งเตือนใช้งานได้แล้ว',
        '/', ['test' => true]
    );
    Response::ok(['sent' => true]);
}
