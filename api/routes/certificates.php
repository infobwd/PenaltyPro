<?php
declare(strict_types=1);

/**
 * ใบเกียรติบัตร — ค่าตั้งประจำรายการ + รายชื่อผู้รับ + เลขที่ใบ
 *
 * เจ้าภาพตั้งผู้ลงนาม ลายเซ็น ข้อความ และรูปแบบเลขที่ครั้งเดียว
 * แล้วออกใบให้นักกีฬา ผู้ควบคุมทีม และกรรมการได้โดยไม่ต้องกรอกซ้ำ
 *
 * เลขที่ใบ "ล็อกไว้กับคน" ในตาราง certificate_issues — คนเดิมได้เลขเดิมเสมอ
 * แม้จะมีคนเพิ่มหรือถอนออกจากรายการทีหลัง (ดูเหตุผลใน db/21)
 */

function handle(string $action, array $cfg): void
{
    match ($action) {
        'getCertificateData'     => certificate_data(),
        'saveCertificateSettings' => save_certificate_settings($cfg),
        'issueCertificates'      => issue_certificates(),
        'downloadCertificates'   => download_certificates($cfg),
        'saveCertificateTemplate' => save_certificate_template($cfg),
        'verifyCertificate'      => verify_certificate(),
        'listCertificatePresets'  => list_certificate_presets(),
        'saveCertificatePreset'   => save_certificate_preset($cfg),
        'deleteCertificatePreset' => delete_certificate_preset(),
        default => Response::fail("ไม่รองรับ action '$action'", 404),
    };
}

require_once __DIR__ . '/../lib/CertTemplate.php';

/** อ่านเทมเพลตของบทบาทนี้ — ไม่มีแถวก็แปลงจากค่าตั้งเดิมให้ */
function cert_template(array $t, string $role): array
{
    $row = Db::value(
        'SELECT config_json FROM certificate_templates
          WHERE tournament_id = :tid AND role = :role',
        [':tid' => $t['tournament_id'], ':role' => $role]);

    if ($row === null) {
        return cert_tpl_merge($role, cert_tpl_from_legacy($t, $role));
    }
    $saved = json_decode((string) $row, true);
    return cert_tpl_merge($role, is_array($saved) ? $saved : null);
}

const CERT_ROLES = ['Player', 'Coach', 'Referee', 'Sponsor'];

/** บทบาทที่มีรายชื่อให้เลือกในหน้าเกียรติบัตร (Sponsor ออกใบจากหน้า /sponsors) */
const CERT_LIST_ROLES = ['Player', 'Coach', 'Referee'];

/**
 * ใครแก้ค่าตั้งของรายการนี้ได้ (เจ้าภาพ / ผู้ดูแลรายการ / แอดมินส่วนกลาง)
 *
 * แยกจาก Perm::requireTournamentManager เพราะหน้านี้ต้อง "ตอบได้ทั้งสองแบบ"
 * คนทั่วไปเปิดดูได้เมื่อเจ้าภาพเปิดสวิตช์ แต่ปุ่มตั้งค่าต้องไม่โผล่
 *
 * ต้องเป็นเงื่อนไขเดียวกับ Perm::requireTournamentManager ที่ endpoint บันทึกใช้
 * (save_certificate_settings / save_certificate_template) ไม่งั้นจะมีคนเห็นปุ่ม
 * แต่กดแล้วโดน 403 — เดิม staff เข้าเงื่อนไขนี้ทั้งที่บันทึกไม่ได้
 */
function cert_can_manage(string $tid): bool
{
    // managesTournament นับแอดมินส่วนกลางให้อยู่แล้ว
    return Perm::managesTournament($tid);
}

/**
 * ด่านเข้าหน้าเกียรติบัตร — คืนค่าว่าคนที่เรียกมาจัดการได้หรือแค่ดู
 *
 * ปิดอยู่ = ต้องเป็นผู้จัดการรายการเท่านั้น (เจ้าภาพยังตั้งค่าไม่เสร็จ)
 *
 * เปิดสวิตช์แล้วเปิดดูได้โดยไม่ต้องเข้าระบบ — ผู้ปกครองที่ไม่มีบัญชีต้องโหลด
 * ใบของลูกได้ ส่วนปุ่มตั้งค่า/ออกแบบซ่อนด้วย canManage ที่ส่งกลับไปแทน
 */
function cert_gate(array $t): bool
{
    $canManage = cert_can_manage((string) $t['tournament_id']);
    if (!$canManage && !(bool) ($t['cert_public'] ?? 0)) {
        Response::fail('รายการนี้ยังไม่เปิดให้ดาวน์โหลดเกียรติบัตร', 403);
    }
    return $canManage;
}

/** ข้อความตั้งต้นเมื่อเจ้าภาพยังไม่ได้เขียนเอง */
const CERT_DEFAULT_BODY = [
    'Player'  => 'ขอมอบเกียรติบัตรฉบับนี้เพื่อแสดงว่า {name}'
        . "\nโรงเรียน {team} ได้เข้าร่วมการแข่งขัน {tournament}",
    'Coach'   => 'ขอมอบเกียรติบัตรฉบับนี้เพื่อแสดงว่า {name}'
        . "\nเป็นผู้ควบคุมทีมโรงเรียน {team} ในการแข่งขัน {tournament}",
    'Referee' => 'ขอมอบเกียรติบัตรฉบับนี้เพื่อแสดงว่า {name}'
        . "\nเป็นคณะกรรมการตัดสินการแข่งขัน {tournament}",
];

function cert_settings(array $t): array
{
    $body = static fn(string $role, ?string $v): string =>
        trim((string) $v) !== '' ? (string) $v : CERT_DEFAULT_BODY[$role];

    return [
        'title'        => (string) ($t['cert_title'] ?? '') ?: 'เกียรติบัตร',
        'signerName'   => (string) ($t['cert_signer_name'] ?? ''),
        'signerTitle'  => (string) ($t['cert_signer_title'] ?? ''),
        'signatureUrl' => drive_img($t['cert_signature_url'] ?? ''),
        'body' => [
            'Player'  => $body('Player',  $t['cert_body_player'] ?? null),
            'Coach'   => $body('Coach',   $t['cert_body_coach'] ?? null),
            'Referee' => $body('Referee', $t['cert_body_referee'] ?? null),
        ],
        'numberFormat' => [
            'Player'  => (string) ($t['cert_no_player'] ?? ''),
            'Coach'   => (string) ($t['cert_no_coach'] ?? ''),
            'Referee' => (string) ($t['cert_no_referee'] ?? ''),
            'Sponsor' => (string) ($t['cert_no_sponsor'] ?? ''),
        ],
        'digits'   => max(1, min(6, (int) ($t['cert_no_digits'] ?? 3))),
        'isPublic' => (bool) ($t['cert_public'] ?? 0),
        'background' => [
            'Player'  => drive_img($t['cert_bg_player'] ?? ''),
            'Coach'   => drive_img($t['cert_bg_coach'] ?? ''),
            'Referee' => drive_img($t['cert_bg_referee'] ?? ''),
        ],
        'zone' => [
            'Player'  => cert_zone($t['cert_zone_player'] ?? null),
            'Coach'   => cert_zone($t['cert_zone_coach'] ?? null),
            'Referee' => cert_zone($t['cert_zone_referee'] ?? null),
        ],
    ];
}

const CERT_ZONES = ['top', 'middle', 'bottom'];

function cert_zone(?string $v): string
{
    $z = strtolower(trim((string) $v));
    return in_array($z, CERT_ZONES, true) ? $z : 'middle';
}

/** แทน {n} ด้วยเลขลำดับที่เติมศูนย์แล้ว — ไม่มี {n} ก็ต่อท้ายให้ */
function cert_format_no(string $format, int $seq, int $digits): string
{
    $num = str_pad((string) $seq, $digits, '0', STR_PAD_LEFT);
    $f = trim($format);
    if ($f === '') {
        return $num;
    }
    return str_contains($f, '{n}') ? str_replace('{n}', $num, $f) : ($f . ' ' . $num);
}

function certificate_data(): void
{
    $tid = Input::require_str('tournamentId');

    $t = Db::one('SELECT * FROM tournaments WHERE tournament_id = :tid', [':tid' => $tid]);
    if ($t === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }
    $canManage = cert_gate($t);
    $settings = cert_settings($t);

    // เลขที่ที่ออกไปแล้ว — ใช้เติมให้รายชื่อและกันออกเลขซ้ำ
    $issued = [];
    foreach (Db::all(
        'SELECT role, subject_key, seq FROM certificate_issues WHERE tournament_id = :tid',
        [':tid' => $tid]) as $row) {
        $issued[$row['role']][$row['subject_key']] = (int) $row['seq'];
    }

    /**
     * ผู้รับใบ 3 กลุ่ม
     *
     * นักกีฬาและผู้ควบคุมทีมมาจากทีมที่ "อนุมัติแล้ว" เท่านั้น — ทีมที่ยังไม่ผ่าน
     * การตรวจไม่ควรได้เกียรติบัตร และเป็นเกณฑ์เดียวกับที่ตารางคะแนนใช้
     */
    $teams = Db::all(
        "SELECT team_id, name FROM teams
          WHERE tournament_id = :tid AND status = 'Approved' ORDER BY name",
        [':tid' => $tid]
    );
    $teamName = [];
    foreach ($teams as $tm) {
        $teamName[$tm['team_id']] = $tm['name'];
    }

    $people = ['Player' => [], 'Coach' => [], 'Referee' => []];

    if ($teams !== []) {
        foreach (Db::all(
            'SELECT p.player_id, p.name, p.team_id
               FROM players p JOIN teams t ON t.team_id = p.team_id
              WHERE t.tournament_id = :tid AND t.status = \'Approved\'
              ORDER BY t.name, p.display_order, p.player_id',
            [':tid' => $tid]) as $p) {
            $people['Player'][] = [
                'key'  => $p['player_id'],
                'name' => $p['name'],
                'team' => $teamName[$p['team_id']] ?? '',
                'teamId' => $p['team_id'],
            ];
        }

        // ผู้ควบคุมทีม = ผู้จัดการทีม + ผู้ฝึกสอน (เท่าที่กรอกมา ไม่บังคับว่าต้องมีทั้งคู่)
        foreach (Db::all(
            "SELECT team_id, name, manager_name, coach_name FROM teams
              WHERE tournament_id = :tid AND status = 'Approved' ORDER BY name",
            [':tid' => $tid]) as $tm) {
            foreach ([['manager', $tm['manager_name']], ['coach', $tm['coach_name']]] as [$slot, $person]) {
                $person = trim((string) $person);
                if ($person === '') {
                    continue;
                }
                $people['Coach'][] = [
                    'key'  => $tm['team_id'] . ':' . $slot,
                    'name' => $person,
                    'team' => $tm['name'],
                    'teamId' => $tm['team_id'],
                ];
            }
        }
    }

    // กรรมการ = บัญชีที่ได้บทบาท referee หรือผู้ดูแลรายการนี้
    foreach (Db::all(
        'SELECT DISTINCT u.user_id, u.display_name
           FROM users u
           LEFT JOIN tournament_managers m
                  ON m.user_id = u.user_id AND m.tournament_id = :tid
          WHERE u.role = \'referee\' OR m.user_id IS NOT NULL
          ORDER BY u.display_name',
        [':tid' => $tid]) as $u) {
        $people['Referee'][] = [
            'key'  => $u['user_id'],
            'name' => $u['display_name'],
            'team' => '',
            'teamId' => '',
        ];
    }

    // เติมเลขที่ให้คนที่เคยออกใบแล้ว
    foreach (CERT_LIST_ROLES as $role) {
        foreach ($people[$role] as $i => $person) {
            $seq = $issued[$role][$person['key']] ?? null;
            $people[$role][$i]['seq'] = $seq;
            $people[$role][$i]['certNo'] = $seq === null ? ''
                : cert_format_no($settings['numberFormat'][$role], $seq, $settings['digits']);
        }
    }

    $templates = [];
    foreach (CERT_LIST_ROLES as $r) {
        $templates[$r] = cert_template($t, $r);
    }

    Response::ok([
        'settings'  => $settings,
        'templates' => $templates,
        'fonts'     => array_map(
            static fn(array $f): string => $f['label'], CERT_FONTS),
        'frames'    => CERT_FRAMES,
        'verifyEnabled' => (bool) ($t['cert_verify_enabled'] ?? 0),
        'canManage' => $canManage,
        'people'    => $people,
        'teams'    => array_map(static fn(array $tm): array => [
            'id' => $tm['team_id'], 'name' => $tm['name'],
        ], $teams),
        'tournamentName' => $t['name'],
    ]);
}

function save_certificate_settings(array $cfg): void
{
    $tid = Input::require_str('tournamentId');
    Auth::requireLogin();
    Perm::requireTournamentManager($tid);

    $signature = Input::str('signatureUrl');
    if (Input::get('signatureFile', null) !== null) {
        try {
            $signature = store_data_url(Input::str('signatureFile'), 'signature', $cfg);
        } catch (Throwable $e) {
            Response::fail('อัปโหลดลายเซ็นไม่สำเร็จ: ' . $e->getMessage(), 422);
        }
    }

    $body = Input::arr('body');
    $noFmt = Input::arr('numberFormat');

    /**
     * ภาพพื้นหลังต่อบทบาท
     *
     * ส่งมาเป็น data URL เมื่อเพิ่งเลือกไฟล์ หรือ URL เดิมเมื่อไม่ได้เปลี่ยน
     * ค่าว่างแปลว่าผู้ใช้กด "เอาออก" — ต้องเก็บเป็นว่างจริง ไม่ใช่ข้ามไป
     */
    $bgIn = Input::arr('background');
    $bg = [];
    foreach (CERT_LIST_ROLES as $r) {
        try {
            $bg[$r] = mb_substr(
                store_cert_background((string) ($bgIn[$r] ?? ''), $cfg), 0, 500);
        } catch (Throwable $e) {
            Response::fail("อัปโหลดพื้นหลัง($r) ไม่สำเร็จ: " . $e->getMessage(), 422);
        }
    }

    $zoneIn = Input::arr('zone');

    Db::exec(
        'UPDATE tournaments SET
            cert_title = :title,
            cert_signer_name = :sname, cert_signer_title = :stitle,
            cert_signature_url = :sig,
            cert_body_player = :bp, cert_body_coach = :bc, cert_body_referee = :br,
            cert_no_player = :np, cert_no_coach = :nc, cert_no_referee = :nr,
            cert_no_sponsor = :ns,
            cert_bg_player = :gp, cert_bg_coach = :gc, cert_bg_referee = :gr,
            cert_zone_player = :zp, cert_zone_coach = :zc, cert_zone_referee = :zr,
            cert_no_digits = :digits, cert_public = :public
          WHERE tournament_id = :tid',
        [
            ':title'  => mb_substr(Input::str('title'), 0, 200),
            ':sname'  => mb_substr(Input::str('signerName'), 0, 150),
            ':stitle' => mb_substr(Input::str('signerTitle'), 0, 200),
            ':sig'    => mb_substr($signature, 0, 500),
            ':bp' => (string) ($body['Player'] ?? ''),
            ':bc' => (string) ($body['Coach'] ?? ''),
            ':br' => (string) ($body['Referee'] ?? ''),
            ':np' => mb_substr((string) ($noFmt['Player'] ?? ''), 0, 100),
            ':nc' => mb_substr((string) ($noFmt['Coach'] ?? ''), 0, 100),
            ':nr' => mb_substr((string) ($noFmt['Referee'] ?? ''), 0, 100),
            ':ns' => mb_substr((string) ($noFmt['Sponsor'] ?? ''), 0, 100),
            ':gp' => $bg['Player'], ':gc' => $bg['Coach'], ':gr' => $bg['Referee'],
            ':zp' => cert_zone($zoneIn['Player'] ?? null),
            ':zc' => cert_zone($zoneIn['Coach'] ?? null),
            ':zr' => cert_zone($zoneIn['Referee'] ?? null),
            ':digits' => max(1, min(6, (int) (Input::num('digits') ?? 3))),
            ':public' => Input::bool('isPublic') ? 1 : 0,
            ':tid'  => $tid,
        ]
    );
    Audit::log('tournament', $tid, 'certificate_settings');
    Cache::flush();
    Response::ok([
        'signatureUrl' => drive_img($signature),
        'background'   => array_map(
            static fn(string $u): string => drive_img($u), $bg),
    ]);
}

/**
 * บันทึกเทมเพลตของบทบาทเดียว
 *
 * รูปทุกช่อง (พื้นหลัง โลโก้ ลายเซ็นของผู้ลงนามแต่ละคน) รับได้ทั้ง data URL
 * ที่เพิ่งเลือกไฟล์ และ URL เดิมที่อัปไว้แล้ว
 */
function save_certificate_template(array $cfg): void
{
    $tid = Input::require_str('tournamentId');
    Auth::requireLogin();
    Perm::requireTournamentManager($tid);

    $role = Input::enum('role', CERT_LIST_ROLES, null);
    if ($role === null) {
        Response::fail('ต้องระบุบทบาท (Player / Coach / Referee)', 422);
    }

    $in = Input::arr('template');
    if ($in === []) {
        Response::fail('ไม่มีข้อมูลเทมเพลตที่จะบันทึก', 422);
    }

    // เก็บรูปก่อน merge เพื่อให้ค่าที่บันทึกเป็น URL ไม่ใช่ base64 ก้อนโต
    try {
        $in['backgroundUrl'] = store_cert_background($in['backgroundUrl'] ?? '', $cfg);
        foreach (['logoLeftUrl', 'logoRightUrl'] as $k) {
            $in[$k] = store_data_url((string) ($in[$k] ?? ''), 'certlogo', $cfg);
        }
        foreach ((array) ($in['signatories'] ?? []) as $i => $s) {
            $in['signatories'][$i]['signatureUrl'] =
                store_data_url((string) ($s['signatureUrl'] ?? ''), 'signature', $cfg);
        }
    } catch (Throwable $e) {
        Response::fail('อัปโหลดรูปไม่สำเร็จ: ' . $e->getMessage(), 422);
    }

    $tpl = cert_tpl_merge($role, $in);

    Db::exec(
        'INSERT INTO certificate_templates (tournament_id, role, config_json)
         VALUES (:tid, :role, :cfg)
         ON DUPLICATE KEY UPDATE config_json = VALUES(config_json)',
        [':tid' => $tid, ':role' => $role,
         ':cfg' => json_encode($tpl, JSON_UNESCAPED_UNICODE)]
    );

    // สวิตช์ QR อยู่ระดับรายการ ไม่ใช่ระดับบทบาท
    if (Input::get('verifyEnabled', null) !== null) {
        Db::exec('UPDATE tournaments SET cert_verify_enabled = :v
                   WHERE tournament_id = :tid',
            [':v' => Input::bool('verifyEnabled') ? 1 : 0, ':tid' => $tid]);
    }

    Audit::log('tournament', $tid, 'certificate_template', null, ['role' => $role]);
    Cache::flush();

    // คืนเทมเพลตที่ผ่านการกรองแล้ว หน้าเว็บจะได้เห็น URL จริงของรูปที่เพิ่งอัป
    Response::ok(['template' => $tpl]);
}

// ── แม่แบบที่บันทึกไว้ใช้ซ้ำ ──────────────────────────────────────────

/**
 * ใครใช้แม่แบบได้ — ผู้ดูแลรายการใดรายการหนึ่งก็พอ
 *
 * ไม่ผูกกับรายการใดรายการหนึ่ง เพราะเหตุผลทั้งหมดที่ต้องมีแม่แบบคือ
 * เอาไปใช้ข้ามรายการและข้ามบทบาท (ดู db/25)
 */
function cert_preset_gate(): void
{
    Auth::requireLogin();
    if (!Auth::isAdmin() && !Auth::isStaff()
        && (Perm::managedTournamentIds() ?? []) === []) {
        Response::fail('เฉพาะเจ้าภาพและผู้ดูแลเท่านั้น', 403);
    }
}

function list_certificate_presets(): void
{
    cert_preset_gate();

    $me = Auth::userId();
    $isAdmin = Auth::isAdmin() || Auth::isStaff();

    // ส่ง config มาด้วยเลย แม่แบบเป็นข้อความไม่กี่ KB และมีไม่กี่อัน
    // หน้าเว็บจะได้กด "ใช้แม่แบบนี้" แล้วเห็นผลทันทีโดยไม่ต้องยิงซ้ำ
    $rows = Db::all(
        'SELECT preset_id, name, config_json, created_by, updated_at
           FROM certificate_presets ORDER BY name');

    Response::ok(['presets' => array_map(
        static function (array $r) use ($isAdmin, $me): array {
            $saved = json_decode((string) $r['config_json'], true);
            return [
                'id' => $r['preset_id'],
                'name' => $r['name'],
                'updatedAt' => $r['updated_at'],
                'template' => cert_tpl_merge('Player', is_array($saved) ? $saved : null),
                // ลบได้เฉพาะคนที่บันทึกไว้เองกับส่วนกลาง คนอื่นหยิบไปใช้ได้อย่างเดียว
                'canDelete' => $isAdmin
                    || ($r['created_by'] !== null && $r['created_by'] === $me),
            ];
        }, $rows)]);
}

/**
 * บันทึกแบบปัจจุบันเป็นแม่แบบ
 *
 * ชื่อซ้ำ = เขียนทับของเดิม (ตั้งใจ) เพื่อให้แก้แม่แบบได้โดยไม่ต้องลบก่อน
 * รูปทุกช่องถูกเก็บเป็นไฟล์ก่อนอยู่แล้วตอนบันทึกเทมเพลต แม่แบบจึงเก็บแค่ URL
 */
function save_certificate_preset(array $cfg): void
{
    cert_preset_gate();

    $name = mb_substr(trim(Input::str('name')), 0, 120);
    if ($name === '') {
        Response::fail('ตั้งชื่อแม่แบบก่อนบันทึก', 422);
    }

    $in = Input::arr('template');
    if ($in === []) {
        Response::fail('ไม่มีข้อมูลแบบที่จะบันทึก', 422);
    }

    // รับ data URL ได้ด้วย เผื่อผู้ใช้บันทึกเป็นแม่แบบก่อนกดบันทึกเทมเพลต
    try {
        $in['backgroundUrl'] = store_cert_background($in['backgroundUrl'] ?? '', $cfg);
        foreach (['logoLeftUrl', 'logoRightUrl'] as $k) {
            $in[$k] = store_data_url((string) ($in[$k] ?? ''), 'certlogo', $cfg);
        }
        foreach ((array) ($in['signatories'] ?? []) as $i => $s) {
            $in['signatories'][$i]['signatureUrl'] =
                store_data_url((string) ($s['signatureUrl'] ?? ''), 'signature', $cfg);
        }
    } catch (Throwable $e) {
        Response::fail('อัปโหลดรูปไม่สำเร็จ: ' . $e->getMessage(), 422);
    }

    // กรองด้วยกติกาเดียวกับเทมเพลต แม่แบบจึงไม่มีทางพาค่าเพี้ยนกลับเข้าระบบ
    $tpl = cert_tpl_merge('Player', $in);

    $existing = Db::value(
        'SELECT preset_id FROM certificate_presets WHERE name = :n', [':n' => $name]);
    $id = $existing !== null ? (string) $existing : 'CP_' . bin2hex(random_bytes(8));

    Db::exec(
        'INSERT INTO certificate_presets (preset_id, name, config_json, created_by)
         VALUES (:id, :n, :cfg, :by)
         ON DUPLICATE KEY UPDATE config_json = VALUES(config_json)',
        [':id' => $id, ':n' => $name,
         ':cfg' => json_encode($tpl, JSON_UNESCAPED_UNICODE), ':by' => Auth::userId()]
    );

    Audit::log('certificate_preset', $id, $existing !== null ? 'update' : 'create',
        null, ['name' => $name]);
    Cache::flush();
    Response::ok(['id' => $id, 'name' => $name, 'template' => $tpl,
                  'replaced' => $existing !== null]);
}

function delete_certificate_preset(): void
{
    cert_preset_gate();

    $id = Input::require_str('presetId');
    $row = Db::one('SELECT created_by FROM certificate_presets WHERE preset_id = :id',
        [':id' => $id]);
    if ($row === null) {
        Response::fail('ไม่พบแม่แบบนี้', 404);
    }
    if (!Auth::isAdmin() && !Auth::isStaff() && $row['created_by'] !== Auth::userId()) {
        Response::fail('ลบได้เฉพาะแม่แบบที่ตัวเองบันทึกไว้', 403);
    }

    Db::exec('DELETE FROM certificate_presets WHERE preset_id = :id', [':id' => $id]);
    Audit::log('certificate_preset', $id, 'delete');
    Cache::flush();
    Response::ok(['deleted' => true]);
}

/**
 * ตรวจสอบเกียรติบัตรจาก token ใน QR — เปิดสาธารณะ
 *
 * ตอบเฉพาะสิ่งที่พิมพ์อยู่บนใบอยู่แล้ว (ชื่อ ทีม บทบาท เลขที่ รายการ)
 * ไม่มีรหัสนักเรียน เบอร์โทร หรืออะไรที่ใบไม่ได้บอก
 */
function verify_certificate(): void
{
    $token = trim((string) (Input::str('token') ?: ($_GET['token'] ?? '')));
    if ($token === '') {
        Response::fail('ไม่พบรหัสตรวจสอบ', 422);
    }

    $row = Db::one(
        'SELECT i.role, i.subject_name, i.team_name, i.seq, i.issued_at,
                t.tournament_id, t.name AS tournament_name,
                t.cert_verify_enabled, t.cert_no_player, t.cert_no_coach,
                t.cert_no_referee, t.cert_no_digits
           FROM certificate_issues i
           JOIN tournaments t ON t.tournament_id = i.tournament_id
          WHERE i.verify_token = :tok',
        [':tok' => $token]);

    if ($row === null) {
        Response::ok(['found' => false]);
    }
    if (!(bool) $row['cert_verify_enabled']) {
        // ปิดสวิตช์แล้ว = ไม่ยืนยันต่อ แต่ต้องไม่บอกว่า token มีจริงหรือไม่
        Response::ok(['found' => false]);
    }

    $fmt = ['Player' => $row['cert_no_player'], 'Coach' => $row['cert_no_coach'],
            'Referee' => $row['cert_no_referee']][$row['role']] ?? '';

    Response::ok([
        'found'  => true,
        'name'   => $row['subject_name'],
        'team'   => $row['team_name'],
        'role'   => $row['role'],
        'roleLabel' => ['Player' => 'นักกีฬา', 'Coach' => 'ผู้ควบคุมทีม',
                        'Referee' => 'กรรมการ'][$row['role']] ?? $row['role'],
        'certNo' => cert_format_no((string) $fmt, (int) $row['seq'],
            max(1, min(6, (int) $row['cert_no_digits']))),
        'tournament' => $row['tournament_name'],
        'issuedAt'   => $row['issued_at'],
    ]);
}

/**
 * จองเลขที่ใบให้คนที่ยังไม่เคยได้
 *
 * เรียกซ้ำได้ — คนที่มีเลขแล้วจะได้เลขเดิมคืนไป ไม่ออกเลขใหม่ทับ
 * (หน้าเว็บเรียกทุกครั้งก่อนพิมพ์ ผู้ใช้จึงไม่ต้องกด "ออกเลข" แยกอีกขั้น)
 */
function issue_certificates(): void
{
    $tid = Input::require_str('tournamentId');

    $role = Input::enum('role', CERT_ROLES, null);
    if ($role === null) {
        Response::fail('ต้องระบุบทบาท (Player / Coach / Referee / Sponsor)', 422);
    }

    $subjects = Input::arr('subjects');
    if ($subjects === []) {
        Response::fail('ยังไม่ได้เลือกผู้รับเกียรติบัตร', 422);
    }

    $t = Db::one('SELECT * FROM tournaments WHERE tournament_id = :tid', [':tid' => $tid]);
    if ($t === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }
    $canManage = cert_gate($t);
    // ใบอนุโมทนาผูกกับยอดเงินที่ผู้สนับสนุนมอบให้ ไม่ใช่ของที่ผู้ชมโหลดเองได้
    if ($role === 'Sponsor' && !$canManage) {
        Perm::requireTournamentManager($tid);
    }
    $settings = cert_settings($t);

    Cache::flush();
    Response::ok(['issued' => cert_reserve_numbers($tid, $role, $subjects, $settings)]);
}

/**
 * จองเลขให้รายชื่อที่ส่งมา แล้วคืนเลขของทุกคน
 *
 * ใช้ร่วมกันระหว่าง issueCertificates (หน้าเว็บขอเลขล่วงหน้า) กับ
 * downloadCertificates (ตอนสร้าง PDF จริง) เพื่อให้เลขมาจากที่เดียว
 *
 * @param  array<int,array<string,mixed>> $subjects
 * @return array<int,array{key:string,seq:int,certNo:string}>
 */
/**
 * token สำหรับ QR — สุ่มล้วน ไม่อิงเลขที่ใบ
 *
 * เลขที่ใบเรียงกัน 001 002 003 ถ้าเอาไปใส่ URL ตรวจสอบ ใครก็ไล่ดูรายชื่อ
 * เด็กทั้งงานได้ด้วยการนับเลขขึ้นไปเรื่อย ๆ
 */
function cert_new_token(): string
{
    // 16 ไบต์ -> base64url 22 ตัวอักษร ตรงกับ CHAR(22) ใน db/24
    return rtrim(strtr(base64_encode(random_bytes(16)), '+/', '-_'), '=');
}

function cert_reserve_numbers(string $tid, string $role, array $subjects, array $settings): array
{
    $out = [];
    Db::transaction(static function () use ($tid, $role, $subjects, $settings, &$out): void {
        // เลขล่าสุดของบทบาทนี้ — อ่านครั้งเดียวแล้วเดินต่อในหน่วยความจำ
        $next = 1 + (int) (Db::value(
            'SELECT COALESCE(MAX(seq), 0) FROM certificate_issues
              WHERE tournament_id = :tid AND role = :role',
            [':tid' => $tid, ':role' => $role]) ?? 0);

        foreach ($subjects as $s) {
            $key = trim((string) ($s['key'] ?? ''));
            if ($key === '') {
                continue;
            }
            $existing = Db::one(
                'SELECT seq, verify_token FROM certificate_issues
                  WHERE tournament_id = :tid AND role = :role AND subject_key = :k',
                [':tid' => $tid, ':role' => $role, ':k' => $key]);

            if ($existing === null) {
                $seq = $next++;
                $token = cert_new_token();
                Db::exec(
                    'INSERT INTO certificate_issues
                        (tournament_id, role, subject_key, subject_name, team_name,
                         seq, verify_token)
                     VALUES (:tid2, :role2, :k2, :name, :team, :seq, :tok)',
                    [
                        ':tid2' => $tid, ':role2' => $role, ':k2' => $key,
                        ':name' => mb_substr((string) ($s['name'] ?? ''), 0, 255),
                        ':team' => mb_substr((string) ($s['team'] ?? ''), 0, 255),
                        ':seq'  => $seq,
                        ':tok'  => $token,
                    ]
                );
            } else {
                $seq = (int) $existing['seq'];
                $token = (string) ($existing['verify_token'] ?? '');
                // ใบที่ออกก่อนมีฟีเจอร์ QR ยังไม่มี token — เติมให้ตอนพิมพ์ซ้ำ
                if ($token === '') {
                    $token = cert_new_token();
                    Db::exec(
                        'UPDATE certificate_issues SET verify_token = :tok
                          WHERE tournament_id = :tid AND role = :role AND subject_key = :k',
                        [':tok' => $token, ':tid' => $tid, ':role' => $role, ':k' => $key]);
                }
            }

            $out[] = [
                'key' => $key,
                'seq' => $seq,
                'token' => $token,
                'certNo' => cert_format_no($settings['numberFormat'][$role], $seq, $settings['digits']),
            ];
        }
    });

    return $out;
}

// ── ออกไฟล์ PDF ────────────────────────────────────────────────────────

/** หนีอักขระ HTML — เนื้อหามาจากชื่อคนและข้อความที่เจ้าภาพพิมพ์เอง */
function cert_esc(string $v): string
{
    return htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** แทนช่องในข้อความ แล้วแปลงขึ้นบรรทัดใหม่เป็น <br> */
function cert_fill_body(string $tpl, array $p, string $tournament): string
{
    return str_replace(
        ['{name}', '{team}', '{tournament}', "\n"],
        ['<b>' . cert_esc($p['name']) . '</b>', cert_esc($p['team']),
         cert_esc($tournament), '<br>'],
        cert_esc($tpl)
    );
}

/**
 * ทำชื่อไฟล์ให้ปลอดภัยแต่ยังอ่านออกเป็นภาษาไทย
 *
 * ส่งชื่อไทยได้จริงผ่าน filename* (RFC 5987) ซึ่งเบราว์เซอร์ยุคนี้รองรับหมด
 * แต่ต้องแนบ filename แบบ ASCII ไว้ด้วยเผื่อตัวที่อ่าน filename* ไม่ได้
 */
function cert_filename(string $base): string
{
    $s = preg_replace('/[\\\\\/:*?"<>|\r\n]+/u', ' ', $base) ?? $base;
    $s = trim(preg_replace('/\s+/u', ' ', $s) ?? $s);
    return mb_substr($s === '' ? 'certificate' : $s, 0, 80);
}

/**
 * ที่อยู่เว็บสำหรับประกอบลิงก์ QR
 *
 * ปกติ API อยู่ใต้โดเมนเดียวกับหน้าเว็บ (/api/) จึงเดาจากคำขอได้
 * ถ้าโฮสต์แยกโดเมนเมื่อไหร่ ให้ตั้ง 'public_url' ใน config.php ทับ
 */
function cert_guess_origin(): string
{
    $https = ($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off';
    $host  = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
    return ($https ? 'https://' : 'http://') . $host;
}

/**
 * ข้อความรางวัลของทีมนี้ สำหรับช่อง {award}
 *
 * ระบบนี้เก็บผลเป็นแมตช์ ไม่ได้เก็บอันดับไว้ตรง ๆ จึงหาจากนัดชิงชนะเลิศ
 * ว่าทีมนี้ชนะหรือแพ้ ถ้าไม่ได้เข้าชิงก็ถือว่าเข้าร่วม
 */
function cert_award_text(string $tid, array $subject): string
{
    $team = trim((string) ($subject['teamId'] ?? ''));
    if ($team === '') {
        return 'ได้เข้าร่วมการแข่งขัน';
    }

    static $cache = [];
    if (!array_key_exists($tid, $cache)) {
        $cache[$tid] = Db::one(
            "SELECT team_a_id, team_b_id, winner FROM matches
              WHERE tournament_id = :tid AND winner IS NOT NULL AND winner <> ''
                AND (round_label LIKE '%ชิงชนะเลิศ%' OR round_label LIKE '%Final%')
              ORDER BY scheduled_time DESC LIMIT 1",
            [':tid' => $tid]);
    }
    $final = $cache[$tid];
    if ($final === null) {
        return 'ได้เข้าร่วมการแข่งขัน';
    }

    if ($final['winner'] === $team) {
        return 'ได้รับรางวัลชนะเลิศ';
    }
    if ($final['team_a_id'] === $team || $final['team_b_id'] === $team) {
        return 'ได้รับรางวัลรองชนะเลิศ';
    }
    return 'ได้เข้าร่วมการแข่งขัน';
}

/**
 * สร้างไฟล์ PDF แล้วส่งกลับเป็นไฟล์ดาวน์โหลด
 *
 * เลือกคนเดียว = ไฟล์หน้าเดียว / เลือกทั้งทีม = ไฟล์เดียวหลายหน้า
 * เลขที่ใบถูกจองก่อนวาด คนเดิมจึงได้เลขเดิมทุกครั้งที่โหลดซ้ำ
 */
function download_certificates(array $cfg): void
{
    $tid = Input::require_str('tournamentId');

    $role = Input::enum('role', CERT_LIST_ROLES, null);
    if ($role === null) {
        Response::fail('ต้องระบุบทบาท (Player / Coach / Referee)', 422);
    }
    $subjects = Input::arr('subjects');
    if ($subjects === []) {
        Response::fail('ยังไม่ได้เลือกผู้รับเกียรติบัตร', 422);
    }
    // กันคำขอที่ใหญ่เกินจนหมดเวลา — 400 ใบยังอยู่ในระดับไม่กี่วินาที
    if (count($subjects) > 400) {
        Response::fail('เลือกได้ครั้งละไม่เกิน 400 ใบ — แบ่งเป็นหลายรอบ', 422);
    }

    $t = Db::one('SELECT * FROM tournaments WHERE tournament_id = :tid', [':tid' => $tid]);
    if ($t === null) {
        Response::fail('ไม่พบรายการแข่งขันนี้', 404);
    }
    cert_gate($t);
    $s = cert_settings($t);

    $issued = [];
    foreach (cert_reserve_numbers($tid, $role, $subjects, $s) as $n) {
        $issued[$n['key']] = $n;
    }

    // โหลดชั้น PDF ที่นี่ไม่ใช่บนหัวไฟล์ — action อื่นในไฟล์นี้ไม่ต้องแตะ mPDF
    // ซึ่งเป็น autoload ก้อนใหญ่ที่ไม่มีเหตุให้โหลดทุกคำขอ
    require_once __DIR__ . '/../lib/CertRender.php';

    $tournamentName = (string) $t['name'];
    $tpl = cert_template($t, $role);

    // ลิงก์ตรวจสอบต้องชี้กลับมาที่หน้าเว็บ ไม่ใช่ /api/
    $verifyBase = '';
    if ((bool) ($t['cert_verify_enabled'] ?? 0)) {
        $origin = (string) (($cfg['public_url'] ?? '') ?: cert_guess_origin());
        $verifyBase = rtrim($origin, '/') . '/verify?c=';
    }

    $people = [];
    foreach ($subjects as $raw) {
        $key = trim((string) ($raw['key'] ?? ''));
        if ($key === '') {
            continue;
        }
        $n = $issued[$key] ?? [];
        $people[] = [
            'key'  => $key,
            'name' => (string) ($raw['name'] ?? ''),
            'team' => (string) ($raw['team'] ?? ''),
            'certNo' => (string) ($n['certNo'] ?? ''),
            'award'  => $tpl['showRank'] ? cert_award_text($tid, $raw) : '',
            'verifyUrl' => ($verifyBase !== '' && ($n['token'] ?? '') !== '')
                ? $verifyBase . $n['token'] : '',
        ];
    }

    try {
        $mpdf = cert_pdf_new($tpl);
        $mpdf->SetTitle($tpl['title'] . ' — ' . $tournamentName);
        cert_render_pages($mpdf, $tpl, $people, $tournamentName, $cfg);

        $pdf = $mpdf->Output('', \Mpdf\Output\Destination::STRING_RETURN);
    } catch (Throwable $e) {
        error_log('[certificates] mpdf: ' . $e->getMessage());
        Response::fail('สร้างไฟล์ PDF ไม่สำเร็จ กรุณาลองใหม่', 500,
            Response::isDebug() ? ['detail' => $e->getMessage()] : []);
        return;
    }

    $label = count($subjects) === 1
        ? (string) ($subjects[0]['name'] ?? 'เกียรติบัตร')
        : (trim((string) ($subjects[0]['team'] ?? '')) !== ''
            ? (string) $subjects[0]['team'] : $tournamentName);
    $name = cert_filename($tpl['title'] . ' ' . $label) . '.pdf';

    Audit::log('tournament', $tid, 'certificate_pdf', null,
        ['role' => $role, 'count' => count($subjects)]);

    header('Content-Type: application/pdf');
    header('Content-Length: ' . strlen($pdf));
    header('Content-Disposition: attachment; filename="certificate.pdf"; '
        . "filename*=UTF-8''" . rawurlencode($name));
    /**
     * ต้องประกาศ expose ไม่งั้นหน้าเว็บอ่านชื่อไฟล์ไม่ได้
     *
     * fetch() เห็น response header ได้แค่ไม่กี่ตัวตามค่าเริ่มต้น
     * Content-Disposition ไม่อยู่ในนั้น ผลคือไฟล์ที่ผู้ใช้ได้ชื่อว่า
     * "เกียรติบัตร.pdf" เหมือนกันหมด แยกไม่ออกว่าของทีมไหน
     * (บน production เป็น same-origin จึงไม่เจอ แต่ถ้าเข้าผ่าน www
     *  หรือแยกโดเมน API เมื่อไหร่ก็จะเจอทันที)
     */
    header('Access-Control-Expose-Headers: Content-Disposition');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, no-store');
    echo $pdf;
    exit;
}
