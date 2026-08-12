<?php
declare(strict_types=1);

/**
 * ?action=getData — คืนรูปร่างเดียวกับที่ Apps Script เคยคืน
 * { teams, players, matches, config, schools, news, tournaments, donations, predictions }
 *
 * ต่างจากของเดิม 3 อย่าง:
 *   1. ไม่ส่ง adminPin ออกไปอีกแล้ว (เดิมส่งให้ทุกคนที่เปิด URL)
 *   2. ข้อมูลส่วนบุคคลถูก "ตัดที่ server" ไม่ใช่ซ่อนใน UI — เบอร์โทรผู้จัดการทีม
 *      และข้อมูลผู้บริจาคจะเป็นค่าว่างจริงถ้าไม่ใช่แอดมิน เปิด DevTools ดูก็ไม่มี
 *   3. ถ้าต่อฐานข้อมูลไม่ได้จะตอบ 500 ไม่ใช่ 200 พร้อม array ว่าง
 *
 * รองรับ ?section=teams,matches เพื่อขอเฉพาะส่วนที่ต้องใช้
 */

function handle(string $action, array $cfg): void
{
    $isAdmin  = Auth::isAdmin();
    $isStaff  = Auth::isStaff() || $isAdmin;
    $mySchool = Auth::schoolId();

    $sections = array_filter(array_map('trim',
        explode(',', (string) ($_GET['section'] ?? ''))));
    $want = static fn(string $s): bool => $sections === [] || in_array($s, $sections, true);

    $cacheKey = Cache::key('getData', [
        'sections' => implode('.', $sections),
        'school'   => $mySchool ?? '',
    ]);
    if (($hit = Cache::get($cacheKey)) !== null) {
        Response::raw($hit);
    }

    $out = [];

    // ── config ────────────────────────────────────────────────────────────
    if ($want('config')) {
        $out['config'] = Response::time('config', static function () use ($isAdmin): array {
            $rows = Db::all(
                'SELECT setting_key, setting_value, is_public FROM app_settings'
            );
            $c = [];
            foreach ($rows as $r) {
                // ค่าที่ไม่ public ต้องไม่หลุดออกไปเด็ดขาด — adminPin อยู่กลุ่มนี้
                if (!$isAdmin && (int) $r['is_public'] !== 1) {
                    continue;
                }
                $key = snake_to_camel($r['setting_key']);
                $c[$key] = str_contains($r['setting_key'], 'logo')
                    || str_contains($r['setting_key'], 'image')
                    || str_contains($r['setting_key'], 'qr_url')
                    ? drive_img($r['setting_value']) : $r['setting_value'];
            }
            foreach (['registrationFee', 'fundraisingGoal', 'locationLat', 'locationLng'] as $k) {
                if (isset($c[$k])) {
                    $c[$k] = (float) $c[$k];
                }
            }
            return $c;
        });
    }

    // ── tournaments ───────────────────────────────────────────────────────
    if ($want('tournaments')) {
        $out['tournaments'] = Response::time('tournaments', static function (): array {
            $rows = Db::all('SELECT * FROM tournaments ORDER BY created_at DESC');
            $prizes = group_by(Db::all(
                'SELECT * FROM tournament_prizes ORDER BY display_order'), 'tournament_id');
            $images = group_by(Db::all(
                'SELECT * FROM tournament_images ORDER BY display_order'), 'tournament_id');

            $list = [];
            foreach ($rows as $t) {
                $tid = $t['tournament_id'];
                // frontend อ่าน config เป็น "JSON string" — ประกอบกลับจากคอลัมน์จริง
                $config = [
                    'registrationDeadline' => iso($t['registration_deadline']),
                    'registrationEnabled' => (bool) $t['registration_enabled'],
                    'teamEditingEnabled' => (bool) $t['team_editing_enabled'],
                    'teamEditDeadline' => iso($t['team_edit_deadline']),
                    'maxTeams'         => $t['max_teams'] === null ? null : (int) $t['max_teams'],
                    'maxTeamsPerSchool' => (int) $t['max_teams_per_school'],
                    'playersPerTeam'   => (int) $t['players_per_team'],
                    'maxSubs'          => (int) $t['max_subs'],
                    'halfTimeDuration' => $t['half_time_duration'] === null
                        ? null : (int) $t['half_time_duration'],
                    'extraTime'        => (bool) $t['extra_time'],
                    'registrationFee'  => (float) $t['registration_fee'],
                    'bankName'         => $t['bank_name'],
                    'bankAccount'      => $t['bank_account'],
                    'accountName'      => $t['account_name'],
                    'locationName'     => $t['location_name'],
                    'locationLink'     => $t['location_link'],
                    'locationLat'      => $t['location_lat'] === null ? null : (float) $t['location_lat'],
                    'locationLng'      => $t['location_lng'] === null ? null : (float) $t['location_lng'],
                    'prizes'           => array_map(static fn(array $p): array => [
                        'id'          => (string) $p['id'],
                        'rankLabel'   => $p['rank_label'],
                        'amount'      => $p['amount'],
                        'description' => $p['description'],
                        'winnerTeamId' => $p['winner_team_id'],
                    ], $prizes[$tid] ?? []),
                    'objective'        => [
                        'isEnabled'   => (bool) $t['objective_enabled'],
                        'title'       => $t['objective_title'],
                        'description' => (string) $t['objective_description'],
                        'goal'        => (float) $t['objective_goal'],
                        'docUrl'      => $t['objective_doc_url'],
                        'images'      => array_map(static fn(array $im): array => [
                            'id'      => (string) $im['id'],
                            'url'     => drive_img($im['url']),
                            'type'    => $im['image_type'],
                            'caption' => $im['caption'],
                        ], $images[$tid] ?? []),
                    ],
                ];
                $list[] = [
                    'id'     => $tid,
                    'name'   => $t['name'],
                    'type'   => $t['type'],
                    'status' => $t['status'],
                    'config' => json_encode($config,
                        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ];
            }
            return $list;
        });
    }

    // ── teams ─────────────────────────────────────────────────────────────
    if ($want('teams')) {
        $out['teams'] = Response::time('teams',
            static function () use ($isStaff, $mySchool): array {
                // district/province อยู่บน schools ไม่ใช่ teams — ที่อยู่เป็นของ
                // โรงเรียนซึ่งไม่เปลี่ยนตามทัวร์นาเมนต์ จึงไม่ควรเก็บซ้ำในทุกทีม
                $rows = Db::all(
                    'SELECT t.*, s.school_name, s.district, s.province
                       FROM teams t
                       JOIN schools s ON s.school_id = t.school_id
                      ORDER BY t.created_at'
                );
                return array_map(static function (array $t) use ($isStaff, $mySchool): array {
                    // เบอร์โทรเห็นได้เฉพาะเจ้าหน้าที่ หรือโรงเรียนเจ้าของทีมเอง
                    $mine = $isStaff || ($mySchool !== null && $mySchool === $t['school_id']);
                    return [
                        'id'         => $t['team_id'],
                        'name'       => $t['name'],
                        'shortName'  => $t['short_name'],
                        // frontend เก็บสีเป็น JSON array string มาแต่เดิม
                        'color'      => json_encode(
                            [$t['color_primary'], $t['color_secondary']],
                            JSON_UNESCAPED_SLASHES),
                        'logoUrl'    => drive_img($t['logo_url']),
                        'status'     => $t['status'],
                        'group'      => (string) $t['group_name'],
                        'district'   => $t['district'],
                        'province'   => $t['province'],
                        'directorName' => $t['director_name'],
                        'managerName'  => $t['manager_name'],
                        'managerPhone' => $mine ? $t['manager_phone'] : '',
                        'coachName'    => $t['coach_name'],
                        'coachPhone'   => $mine ? $t['coach_phone'] : '',
                        'docUrl'     => $mine ? drive_img($t['doc_url']) : '',
                        'slipUrl'    => $mine ? drive_img($t['slip_url']) : '',
                        'paymentStatus' => $mine
                            ? ($t['payment_status'] ?? ((string) $t['slip_url'] !== '' ? 'Pending' : 'Unpaid'))
                            : '',
                        // "จ่ายค่าสมัครแล้วหรือยัง" เปิดให้ทุกคนเห็นได้ เป็นสถานะการ
                        // เข้าร่วมแข่งขัน ไม่ใช่ข้อมูลส่วนบุคคล — ต่างจากสลิป/หมายเหตุ
                        // ที่บอกเลขบัญชีและความเห็นของเจ้าหน้าที่ ซึ่งยังปิดไว้ตามเดิม
                        'isPaid' => ($t['payment_status'] ?? '') === 'Verified',
                        'paymentNote' => $mine ? ($t['payment_note'] ?? '') : '',
                        'paymentReviewedAt' => $mine && isset($t['payment_reviewed_at'])
                            ? iso($t['payment_reviewed_at']) : null,
                        'rejectReason' => $t['reject_reason'],
                        'registrationTime' => iso($t['created_at']),
                        'tournamentId' => $t['tournament_id'],
                        'schoolId'   => $t['school_id'],
                        'schoolName' => $t['school_name'],
                        'creatorId'  => '',
                        'rowVersion' => (int) $t['row_version'],
                    ];
                }, $rows);
            });
    }

    // ── players ───────────────────────────────────────────────────────────
    if ($want('players')) {
        $out['players'] = Response::time('players', static function (): array {
            $rows = Db::all(
                'SELECT p.*, t.tournament_id
                   FROM players p
                   JOIN teams t ON t.team_id = p.team_id
                  ORDER BY p.team_id, p.display_order, p.player_id'
            );
            return array_map(static fn(array $p): array => [
                'id'        => $p['player_id'],
                'teamId'    => $p['team_id'],
                'name'      => $p['name'],
                'number'    => (string) ($p['shirt_number'] ?? ''),
                'position'  => $p['position'],
                'photoUrl'  => drive_img($p['photo_url']),
                'birthDate' => $p['birth_date'] === null
                    ? '' : date('d/m/Y', strtotime((string) $p['birth_date'])),
                'tournamentId' => $p['tournament_id'],
            ], $rows);
        });
    }

    // ── matches (+ kicks) ─────────────────────────────────────────────────
    if ($want('matches')) {
        $out['matches'] = Response::time('matches', static function (): array {
            $rows = Db::all(
                'SELECT m.*,
                        ta.name AS team_a_current, tb.name AS team_b_current
                   FROM matches m
                   LEFT JOIN teams ta ON ta.team_id = m.team_a_id
                   LEFT JOIN teams tb ON tb.team_id = m.team_b_id
                  ORDER BY m.scheduled_time IS NULL, m.scheduled_time, m.match_id'
            );
            $kicks = group_by(Db::all(
                'SELECT * FROM kicks ORDER BY match_id, round_no, team_side'), 'match_id');

            return array_map(static function (array $m) use ($kicks): array {
                $mid = $m['match_id'];
                return [
                    // ชื่อปัจจุบันก่อน แล้วค่อย fallback ไป snapshot ตอนแข่ง
                    'teamA' => $m['team_a_current'] ?? $m['team_a_name'],
                    'teamB' => $m['team_b_current'] ?? $m['team_b_name'],
                    'id'     => $mid,
                    'teamAId' => $m['team_a_id'],
                    'teamBId' => $m['team_b_id'],
                    'scoreA' => (int) $m['score_a'],
                    'scoreB' => (int) $m['score_b'],
                    'winner' => $m['winner'],
                    'date'   => iso($m['played_at']),
                    'summary' => (string) $m['summary'],
                    'roundLabel' => $m['round_label'],
                    'status' => $m['status'],
                    'venue'  => $m['venue'],
                    'scheduledTime'   => iso($m['scheduled_time']),
                    'livestreamUrl'   => $m['livestream_url'],
                    'livestreamCover' => drive_img($m['livestream_cover']),
                    'tournamentId'    => $m['tournament_id'],
                    'rowVersion'      => (int) $m['row_version'],
                    'kicks' => array_map(static fn(array $k): array => [
                        'id'      => (string) $k['kick_id'],
                        'matchId' => $k['match_id'],
                        'round'   => (int) $k['round_no'],
                        'teamId'  => $k['team_side'],
                        'player'  => $k['player_name'],
                        'result'  => $k['result'],
                        'timestamp' => strtotime((string) $k['kicked_at']) * 1000,
                    ], $kicks[$mid] ?? []),
                ];
            }, $rows);
        });
    }

    // ── schools ───────────────────────────────────────────────────────────
    if ($want('schools')) {
        $out['schools'] = Response::time('schools', static fn(): array => array_map(
            static fn(array $s): array => [
                'id'       => $s['school_id'],
                'name'     => $s['school_name'],
                'district' => $s['district'],
                'province' => $s['province'],
            ],
            Db::all('SELECT school_id, school_name, district, province
                       FROM schools WHERE is_active = 1 ORDER BY school_name')
        ));
    }

    // ── news ──────────────────────────────────────────────────────────────
    if ($want('news')) {
        $out['news'] = Response::time('news', static fn(): array => array_map(
            static fn(array $n): array => [
                'id'      => $n['news_id'],
                'title'   => $n['title'],
                'content' => (string) $n['content'],
                'imageUrl' => drive_img($n['image_url']),
                'documentUrl' => drive_img($n['document_url']),
                'timestamp'   => strtotime((string) $n['published_at']) * 1000,
                'tournamentId' => $n['tournament_id'] ?? 'global',
            ],
            Db::all('SELECT * FROM news ORDER BY published_at DESC')
        ));
    }

    // ── donations ─────────────────────────────────────────────────────────
    if ($want('donations')) {
        $out['donations'] = Response::time('donations',
            static function () use ($isAdmin): array {
                $rows = Db::all('SELECT * FROM donations ORDER BY created_at DESC');
                return array_map(static fn(array $d): array => [
                    'id'        => $d['donation_id'],
                    'timestamp' => iso($d['created_at']),
                    'donorName' => (int) $d['is_anonymous'] === 1 && !$isAdmin
                        ? 'ผู้ไม่ประสงค์ออกนาม' : $d['donor_name'],
                    'amount'    => (float) $d['amount'],
                    'status'    => $d['status'],
                    'isEdonation' => (bool) $d['is_edonation'],
                    'isAnonymous' => (bool) $d['is_anonymous'],
                    'tournamentId' => $d['tournament_id'],
                    // ข้อมูลติดต่อและเอกสารภาษี = แอดมินเท่านั้น
                    'phone'   => $isAdmin ? $d['phone'] : '',
                    'taxId'   => $isAdmin ? $d['tax_id'] : '',
                    'address' => $isAdmin ? $d['address'] : '',
                    'slipUrl' => $isAdmin ? drive_img($d['slip_url']) : '',
                    'taxFileUrl'  => $isAdmin ? drive_img($d['tax_file_url']) : '',
                    'lineUserId'  => $isAdmin ? $d['line_user_id'] : '',
                ], $rows);
            });
    }

    // ── predictions ───────────────────────────────────────────────────────
    if ($want('predictions')) {
        $out['predictions'] = Response::time('predictions', static fn(): array => array_map(
            static fn(array $p): array => [
                'id'      => (string) $p['id'],
                'matchId' => $p['match_id'],
                'userId'  => $p['user_id'],
                'userDisplayName' => (string) $p['display_name'],
                'userPictureUrl'  => drive_img($p['picture_url']),
                'prediction' => $p['prediction'],
                'timestamp'  => iso($p['created_at']),
                'tournamentId' => $p['tournament_id'],
            ],
            Db::all('SELECT pr.*, u.display_name, u.picture_url, m.tournament_id
                       FROM predictions pr
                       JOIN users u   ON u.user_id  = pr.user_id
                       JOIN matches m ON m.match_id = pr.match_id')
        ));
    }

    // response ที่มี warning ห้าม cache — ไม่งั้นข้อมูลไม่ครบจะค้างอยู่ 5 นาที
    if (!Response::hasWarnings()) {
        Cache::put($cacheKey, $out);
    }
    Response::raw($out);
}

// ── helper ────────────────────────────────────────────────────────────────

function snake_to_camel(string $s): string
{
    return lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $s))));
}


/** DATETIME ของ MySQL -> ISO ที่ frontend เข้าใจ (เวลาไทย) */
function iso(?string $dt): string
{
    if ($dt === null || $dt === '' || str_starts_with($dt, '0000')) {
        return '';
    }
    $ts = strtotime($dt);
    return $ts === false ? '' : date('c', $ts);
}

/** @return array<string,array<int,array>> */
function group_by(array $rows, string $key): array
{
    $out = [];
    foreach ($rows as $r) {
        $out[(string) $r[$key]][] = $r;
    }
    return $out;
}
