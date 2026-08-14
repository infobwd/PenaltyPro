<?php
declare(strict_types=1);

/** บัญชีรายรับ-รายจ่ายประจำรายการแข่งขัน */
function handle(string $action, array $cfg): void
{
    match ($action) {
        'getFinanceData'          => finance_data(),
        'saveFinanceEntry'        => save_finance_entry($cfg),
        'deleteFinanceEntry'      => delete_finance_entry(),
        'assignFinanceAccountant' => assign_finance_accountant(),
        default => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

function finance_is_manager(string $tournamentId): bool
{
    // เจ้าภาพต้องเป็นผู้ดูแลรายการที่แอดมินมอบหมายไว้ใน tournament_managers
    // ห้ามเชื่อ users.school_id โดยตรง เพราะผู้ใช้ทั่วไปเลือกโรงเรียนของตนเองได้
    return Perm::managesTournament($tournamentId);
}

function finance_is_accountant(string $tournamentId): bool
{
    $uid = Auth::userId();
    return $uid !== null && Db::value(
        'SELECT 1 FROM tournament_finance_members
          WHERE tournament_id = :tid AND user_id = :uid',
        [':tid' => $tournamentId, ':uid' => $uid]
    ) !== null;
}

/** @return array{manager:bool,accountant:bool} */
function require_finance_access(string $tournamentId): array
{
    Auth::requireLogin();
    $manager = finance_is_manager($tournamentId);
    $accountant = finance_is_accountant($tournamentId);
    if (!$manager && !$accountant) {
        Response::fail('คุณยังไม่ได้รับมอบหมายให้ทำบัญชีของรายการนี้', 403);
    }
    return ['manager' => $manager, 'accountant' => $accountant];
}

function finance_data(): void
{
    $tid = Input::require_str('tournamentId');
    $access = require_finance_access($tid);
    if (Db::value('SELECT 1 FROM tournaments WHERE tournament_id = :tid', [':tid' => $tid]) === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }

    $rows = Db::all(
        'SELECT f.*, cu.display_name AS created_by_name, uu.display_name AS updated_by_name
           FROM tournament_finance_entries f
           LEFT JOIN users cu ON cu.user_id = f.created_by
           LEFT JOIN users uu ON uu.user_id = f.updated_by
          WHERE f.tournament_id = :tid
          ORDER BY f.transaction_date DESC, f.created_at DESC',
        [':tid' => $tid]
    );
    $entries = array_map(static fn(array $row): array => [
        'id' => $row['entry_id'],
        'type' => $row['entry_type'],
        'category' => $row['category'],
        'description' => $row['description'],
        'amount' => (float) $row['amount'],
        'date' => $row['transaction_date'],
        'evidenceUrl' => drive_img($row['evidence_url']),
        'fundingSource' => $row['funding_source'],
        'createdByName' => $row['created_by_name'] ?? '',
        'updatedByName' => $row['updated_by_name'] ?? '',
        'updatedAt' => iso($row['updated_at']),
    ], $rows);

    $totals = Db::one(
        "SELECT
            COALESCE(SUM(CASE WHEN entry_type = 'Income' THEN amount ELSE 0 END), 0) income_total,
            COALESCE(SUM(CASE WHEN entry_type = 'Expense' THEN amount ELSE 0 END), 0) expense_total,
            COALESCE(SUM(CASE WHEN entry_type = 'Expense' AND funding_source = 'HostSponsor'
                              THEN amount ELSE 0 END), 0) host_support_total,
            SUM(CASE WHEN evidence_url = '' THEN 1 ELSE 0 END) missing_evidence
           FROM tournament_finance_entries WHERE tournament_id = :tid",
        [':tid' => $tid]
    ) ?? [];
    $income = (float) ($totals['income_total'] ?? 0);
    $expense = (float) ($totals['expense_total'] ?? 0);
    $hostSupport = (float) ($totals['host_support_total'] ?? 0);
    $cashExpense = max(0, $expense - $hostSupport);

    $members = Db::all(
        'SELECT m.user_id, u.display_name, u.username, u.role, u.picture_url, m.created_at
           FROM tournament_finance_members m
           JOIN users u ON u.user_id = m.user_id
          WHERE m.tournament_id = :tid ORDER BY u.display_name',
        [':tid' => $tid]
    );

    $users = [];
    if ($access['manager']) {
        $users = array_map(static fn(array $user): array => [
            'userId' => $user['user_id'], 'displayName' => $user['display_name'],
            'username' => $user['username'] ?? '', 'role' => $user['role'],
            'pictureUrl' => drive_img($user['picture_url'] ?? ''),
        ], Db::all('SELECT user_id, display_name, username, role, picture_url
                      FROM users ORDER BY display_name, username'));
    }

    Response::ok([
        'entries' => $entries,
        'members' => array_map(static fn(array $member): array => [
            'userId' => $member['user_id'], 'displayName' => $member['display_name'],
            'username' => $member['username'] ?? '', 'role' => $member['role'],
            'pictureUrl' => drive_img($member['picture_url'] ?? ''),
            'assignedAt' => iso($member['created_at']),
        ], $members),
        'users' => $users,
        'canManage' => $access['manager'],
        'canEdit' => $access['manager'] || $access['accountant'],
        'summary' => [
            'income' => $income, 'expense' => $expense, 'hostSupport' => $hostSupport,
            'cashExpense' => $cashExpense, 'balance' => $income - $cashExpense,
            'missingEvidence' => (int) ($totals['missing_evidence'] ?? 0),
        ],
    ]);
}

function finance_date(string $value): string
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m)
        || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
        Response::fail('วันที่รายการไม่ถูกต้อง', 422);
    }
    return $value;
}

function save_finance_entry(array $cfg): void
{
    $tid = Input::require_str('tournamentId');
    require_finance_access($tid);
    $id = Input::str('id');
    $type = Input::enum('type', ['income', 'expense']);
    $type = $type === 'income' ? 'Income' : 'Expense';
    $category = mb_substr(Input::require_str('category'), 0, 120);
    $description = mb_substr(Input::require_str('description'), 0, 500);
    $amount = Input::num('amount');
    if ($amount === null || $amount <= 0) {
        Response::fail('จำนวนเงินต้องมากกว่า 0', 422);
    }
    $date = finance_date(Input::require_str('date'));
    $funding = $type === 'Expense' && Input::bool('paidByHost') ? 'HostSponsor' : 'Tournament';
    $uid = Auth::userId();

    $existing = null;
    if ($id !== '') {
        $existing = Db::one(
            'SELECT * FROM tournament_finance_entries
              WHERE entry_id = :id AND tournament_id = :tid',
            [':id' => $id, ':tid' => $tid]
        );
        if ($existing === null) {
            Response::fail('ไม่พบรายการบัญชีนี้', 404);
        }
    } else {
        $id = 'FIN_' . (int) (microtime(true) * 1000) . '_' . bin2hex(random_bytes(3));
    }

    $evidence = (string) ($existing['evidence_url'] ?? '');
    if (Input::bool('removeEvidence')) {
        $evidence = '';
    }
    if (Input::get('evidenceFile', null) !== null) {
        try {
            $evidence = store_data_url(Input::str('evidenceFile'), 'finance', $cfg);
        } catch (Throwable $e) {
            Response::fail('อัปโหลดหลักฐานไม่สำเร็จ: ' . $e->getMessage(), 422);
        }
    } elseif (Input::get('evidenceUrl', null) !== null) {
        $evidence = Input::str('evidenceUrl');
    }

    if ($existing === null) {
        Db::exec(
            'INSERT INTO tournament_finance_entries
                (entry_id, tournament_id, entry_type, category, description, amount,
                 transaction_date, evidence_url, funding_source, created_by, updated_by)
             VALUES (:id, :tid, :type, :category, :description, :amount,
                     :date, :evidence, :funding, :created, :updated)',
            [':id' => $id, ':tid' => $tid, ':type' => $type, ':category' => $category,
             ':description' => $description, ':amount' => number_format($amount, 2, '.', ''),
             ':date' => $date, ':evidence' => $evidence, ':funding' => $funding,
             ':created' => $uid, ':updated' => $uid]
        );
        Audit::log('finance', $id, 'create', null, ['tournamentId' => $tid]);
    } else {
        Db::exec(
            'UPDATE tournament_finance_entries SET entry_type = :type, category = :category,
                    description = :description, amount = :amount, transaction_date = :date,
                    evidence_url = :evidence, funding_source = :funding, updated_by = :updated
              WHERE entry_id = :id AND tournament_id = :tid',
            [':type' => $type, ':category' => $category, ':description' => $description,
             ':amount' => number_format($amount, 2, '.', ''), ':date' => $date,
             ':evidence' => $evidence, ':funding' => $funding, ':updated' => $uid,
             ':id' => $id, ':tid' => $tid]
        );
        Audit::log('finance', $id, 'update');
    }
    sync_host_finance_sponsor($tid);
    Cache::flush();
    Response::ok(['id' => $id, 'evidenceUrl' => drive_img($evidence)]);
}

function delete_finance_entry(): void
{
    $tid = Input::require_str('tournamentId');
    require_finance_access($tid);
    $id = Input::require_str('id');
    $changed = Db::exec(
        'DELETE FROM tournament_finance_entries WHERE entry_id = :id AND tournament_id = :tid',
        [':id' => $id, ':tid' => $tid]
    );
    if ($changed === 0) {
        Response::fail('ไม่พบรายการบัญชีนี้', 404);
    }
    Audit::log('finance', $id, 'delete');
    sync_host_finance_sponsor($tid);
    Cache::flush();
    Response::ok();
}

function assign_finance_accountant(): void
{
    $tid = Input::require_str('tournamentId');
    Auth::requireLogin();
    if (!finance_is_manager($tid)) {
        Response::fail('เฉพาะแอดมินหรือเจ้าภาพเท่านั้นที่มอบหมายผู้ทำบัญชีได้', 403);
    }
    $uid = Input::require_str('userId');
    $user = Db::one('SELECT user_id, display_name FROM users WHERE user_id = :uid', [':uid' => $uid]);
    if ($user === null) {
        Response::fail('ไม่พบผู้ใช้นี้', 404);
    }
    if (Input::bool('remove')) {
        Db::exec('DELETE FROM tournament_finance_members
                   WHERE tournament_id = :tid AND user_id = :uid',
            [':tid' => $tid, ':uid' => $uid]);
        Audit::log('finance_member', "$tid:$uid", 'delete');
        Response::ok(['displayName' => $user['display_name']]);
    }
    Db::exec(
        'INSERT INTO tournament_finance_members (tournament_id, user_id, assigned_by)
         VALUES (:tid, :uid, :by)
         ON DUPLICATE KEY UPDATE assigned_by = VALUES(assigned_by), created_at = CURRENT_TIMESTAMP',
        [':tid' => $tid, ':uid' => $uid, ':by' => Auth::userId()]
    );
    Audit::log('finance_member', "$tid:$uid", 'assign');
    Response::ok(['displayName' => $user['display_name']]);
}

/** รวมรายจ่ายที่เจ้าภาพออกให้เป็นการสนับสนุนสิ่งของบนหน้า Sponsors */
function sync_host_finance_sponsor(string $tournamentId): void
{
    $sponsorId = 'FHOST_' . substr(hash('sha256', $tournamentId), 0, 24);
    $total = (float) (Db::value(
        "SELECT COALESCE(SUM(amount), 0) FROM tournament_finance_entries
          WHERE tournament_id = :tid AND entry_type = 'Expense'
            AND funding_source = 'HostSponsor'",
        [':tid' => $tournamentId]
    ) ?? 0);
    if ($total <= 0) {
        Db::exec('DELETE FROM sponsors WHERE sponsor_id = :id', [':id' => $sponsorId]);
        return;
    }

    $host = Db::one(
        'SELECT t.name tournament_name, s.school_name,
                COALESCE((SELECT tm.logo_url FROM teams tm
                           WHERE tm.tournament_id = t.tournament_id
                             AND tm.school_id = t.host_school_id LIMIT 1), \'\') logo_url
           FROM tournaments t LEFT JOIN schools s ON s.school_id = t.host_school_id
          WHERE t.tournament_id = :tid',
        [':tid' => $tournamentId]
    ) ?? [];
    $name = trim((string) ($host['school_name'] ?? ''));
    if ($name === '') {
        $name = 'เจ้าภาพ ' . (string) ($host['tournament_name'] ?? 'การแข่งขัน');
    }
    $categories = array_column(Db::all(
        "SELECT category FROM tournament_finance_entries
          WHERE tournament_id = :tid AND entry_type = 'Expense'
            AND funding_source = 'HostSponsor'
          GROUP BY category ORDER BY MIN(transaction_date)",
        [':tid' => $tournamentId]
    ), 'category');
    $detail = 'เจ้าภาพสนับสนุนค่าใช้จ่ายจัดการแข่งขัน';
    if ($categories !== []) {
        $detail .= ': ' . implode(', ', array_slice($categories, 0, 8));
    }

    Db::exec(
        "INSERT INTO sponsors
            (sponsor_id, tournament_id, name, logo_url, sponsor_type,
             contribution_type, contribution_amount, contribution_detail, display_order)
         VALUES (:id, :tid, :name, :logo, 'Support', 'Goods', :amount, :detail, 999)
         ON DUPLICATE KEY UPDATE name = VALUES(name), logo_url = VALUES(logo_url),
             contribution_type = 'Goods', contribution_amount = VALUES(contribution_amount),
             contribution_detail = VALUES(contribution_detail)",
        [':id' => $sponsorId, ':tid' => $tournamentId, ':name' => $name,
         ':logo' => (string) ($host['logo_url'] ?? ''),
         ':amount' => number_format($total, 2, '.', ''), ':detail' => $detail]
    );
}
