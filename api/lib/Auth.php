<?php
declare(strict_types=1);

/**
 * การพิสูจน์ตัวตน 3 ช่องทาง
 *
 *   1. LINE Login   — ผู้ชมทั่วไป (โหวต ทายผล ประกวดภาพ)
 *   2. รหัสโรงเรียน — โรงเรียนเข้ามาแก้ข้อมูลทีมตัวเอง
 *   3. username/password — แอดมินและสตาฟเท่านั้น
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  สิ่งที่คลาสนี้มีไว้แก้เป็นอันดับแรก
 * ═══════════════════════════════════════════════════════════════════════
 * ระบบเดิม (Code.js บรรทัด 642) รับ `lineUserId` ที่ client ส่งมาดิบ ๆ แล้ว
 * คืน role ของแถวนั้นให้เลย ประกอบกับ `getUsers` ที่เปิดสาธารณะ ทำให้ยึด
 * สิทธิ์แอดมินได้ใน 2 คำขอ:
 *
 *   1) GET  ?action=getUsers            -> ได้ lineUserId ของแอดมิน
 *   2) POST {authType:'line', lineUserId:'<ของแอดมิน>'} -> ได้ role:'admin'
 *
 * ที่นี่จึงเชื่อเฉพาะ `sub` ที่ได้จากการ verify ID token กับเซิร์ฟเวอร์ LINE
 * เท่านั้น ค่า lineUserId ที่ client ส่งมาถูก "เพิกเฉยทั้งหมด"
 */
final class Auth
{
    private static ?array $user = null;        // ผู้ใช้ที่ล็อกอิน (LINE/แอดมิน)
    private static ?array $teamSession = null; // session ของโรงเรียน
    private static int $ttl = 43200;
    private static int $teamTtl = 604800;
    private static array $lineCfg = [];

    public static function configure(int $ttl, int $teamTtl, array $lineCfg): void
    {
        self::$ttl = $ttl;
        self::$teamTtl = $teamTtl;
        self::$lineCfg = $lineCfg;
    }

    // ── token ที่ส่งมากับคำขอ ────────────────────────────────────────────

    private static function bearer(): string
    {
        $h = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']   // บาง host ส่งมาชื่อนี้
            ?? '';
        if ($h === '' && function_exists('apache_request_headers')) {
            foreach (apache_request_headers() as $k => $v) {
                if (strcasecmp($k, 'Authorization') === 0) {
                    $h = $v;
                    break;
                }
            }
        }
        if (stripos($h, 'Bearer ') === 0) {
            return trim(substr($h, 7));
        }
        // เผื่อ host ตัด Authorization ทิ้ง — ยอมรับผ่าน query string ด้วย
        return (string) ($_GET['token'] ?? '');
    }

    /** โหลด session จาก token — เรียกครั้งเดียวต่อคำขอ */
    public static function boot(): void
    {
        $token = self::bearer();
        if ($token === '') {
            return;
        }
        $hash = hash('sha256', $token);

        $row = Db::one(
            'SELECT u.user_id, u.display_name, u.role, u.line_user_id,
                    u.phone, u.picture_url, u.username, u.must_change_password
               FROM user_sessions s
               JOIN users u ON u.user_id = s.user_id
              WHERE s.token_hash = :h AND s.expires_at > NOW()',
            [':h' => $hash]
        );
        if ($row !== null) {
            self::$user = $row;
            // ต่ออายุแบบ sliding — ใช้งานอยู่ก็ไม่หลุดกลางคัน
            // (เดิมหมดอายุตายตัวจากเวลาที่ล็อกอิน ทำให้แอดมินถูกเตะออกกลางงาน)
            Db::exec(
                'UPDATE user_sessions
                    SET last_seen_at = NOW(),
                        expires_at = DATE_ADD(NOW(), INTERVAL :ttl SECOND)
                  WHERE token_hash = :h2',
                [':ttl' => self::$ttl, ':h2' => $hash]
            );
            return;
        }

        // ชื่อ placeholder ห้ามซ้ำในคิวรีเดียว (EMULATE_PREPARES=false) จึงใช้ :h2/:h3
        self::$teamSession = Db::one(
            'SELECT ts.school_id, ts.tournament_id, s.school_name
               FROM team_sessions ts
               JOIN schools s ON s.school_id = ts.school_id
              WHERE ts.token_hash = :h3 AND ts.expires_at > NOW()
                AND ts.revoked_at IS NULL',
            [':h3' => $hash]
        );
    }

    // ── สถานะปัจจุบัน ───────────────────────────────────────────────────

    public static function user(): ?array   { return self::$user; }
    public static function role(): ?string  { return self::$user['role'] ?? null; }
    public static function userId(): ?string { return self::$user['user_id'] ?? null; }
    public static function isLoggedIn(): bool { return self::$user !== null; }
    public static function isAdmin(): bool  { return (self::$user['role'] ?? '') === 'admin'; }
    public static function isStaff(): bool  { return (self::$user['role'] ?? '') === 'staff'; }

    /** school_id ของ session โรงเรียน (null ถ้าไม่ได้เข้าด้วยรหัสโรงเรียน) */
    public static function schoolId(): ?string { return self::$teamSession['school_id'] ?? null; }
    public static function teamTournamentId(): ?string { return self::$teamSession['tournament_id'] ?? null; }

    public static function actorType(): string
    {
        return match (true) {
            self::isAdmin()            => 'admin',
            self::isStaff()            => 'staff',
            self::schoolId() !== null  => 'school',
            self::isLoggedIn()         => 'user',
            default                    => 'system',
        };
    }

    public static function actorId(): string
    {
        return (string) (self::userId() ?? self::schoolId() ?? '');
    }

    public static function actorName(): string
    {
        return (string) (self::$user['display_name']
            ?? self::$teamSession['school_name'] ?? '');
    }

    // ── ด่านตรวจสิทธิ์ ──────────────────────────────────────────────────

    public static function requireLogin(): array
    {
        if (self::$user === null) {
            Response::fail('ต้องเข้าสู่ระบบก่อน', 401);
        }
        return self::$user;
    }

    public static function requireAdmin(): array
    {
        $u = self::requireLogin();
        if ($u['role'] !== 'admin') {
            Response::fail('ต้องเป็นผู้ดูแลระบบเท่านั้น', 403);
        }
        return $u;
    }

    public static function requireStaff(): array
    {
        $u = self::requireLogin();
        if (!in_array($u['role'], ['admin', 'staff'], true)) {
            Response::fail('ต้องเป็นผู้ดูแลระบบหรือเจ้าหน้าที่', 403);
        }
        return $u;
    }

    /** โรงเรียน (หรือแอดมิน) เท่านั้น — คืน school_id ที่มีสิทธิ์แก้ */
    public static function requireSchool(): string
    {
        $sid = self::schoolId();
        if ($sid === null) {
            Response::fail('ต้องเข้าสู่ระบบด้วยรหัสโรงเรียนก่อน', 401);
        }
        return $sid;
    }

    // ── ออก session ─────────────────────────────────────────────────────

    public static function issue(string $userId): array
    {
        $token = bin2hex(random_bytes(32));
        $exp = date('Y-m-d H:i:s', time() + self::$ttl);
        Db::exec(
            'INSERT INTO user_sessions (token_hash, user_id, expires_at, user_agent)
             VALUES (:h, :uid, :exp, :ua)',
            [
                ':h'   => hash('sha256', $token),
                ':uid' => $userId,
                ':exp' => $exp,
                ':ua'  => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ]
        );
        Db::exec('UPDATE users SET last_login_at = NOW() WHERE user_id = :uid2',
            [':uid2' => $userId]);
        return ['token' => $token, 'expiresAt' => $exp];
    }

    public static function issueTeam(string $schoolId, string $tournamentId): array
    {
        $token = bin2hex(random_bytes(32));
        $exp = date('Y-m-d H:i:s', time() + self::$teamTtl);
        Db::exec(
            'INSERT INTO team_sessions
                (token_hash, school_id, tournament_id, expires_at, ip_hash, user_agent)
             VALUES (:h, :sid, :tid, :exp, :ip, :ua)',
            [
                ':h'   => hash('sha256', $token),
                ':sid' => $schoolId,
                ':tid' => $tournamentId,
                ':exp' => $exp,
                ':ip'  => self::ipHash(),
                ':ua'  => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ]
        );
        return ['token' => $token, 'expiresAt' => $exp];
    }

    public static function revokeCurrent(): void
    {
        $token = self::bearer();
        if ($token === '') {
            return;
        }
        $h = hash('sha256', $token);
        Db::exec('DELETE FROM user_sessions WHERE token_hash = :h', [':h' => $h]);
        Db::exec('UPDATE team_sessions SET revoked_at = NOW() WHERE token_hash = :h2',
            [':h2' => $h]);
    }

    // ── รหัสผ่าน ────────────────────────────────────────────────────────

    public static function verifyPassword(string $input, array $user): bool
    {
        $hash = (string) ($user['password_hash'] ?? '');
        return $hash !== '' && password_verify($input, $hash);
    }

    public static function hashPassword(string $plain): string
    {
        // argon2id ถ้ามี ไม่งั้น bcrypt — ETL เขียน bcrypt มาก่อนแล้ว
        // password_verify รองรับทั้งสองโดยดูจาก prefix ของ hash เอง
        $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
        return password_hash($plain, $algo);
    }

    // ── LINE ID token ───────────────────────────────────────────────────

    /**
     * ตรวจ ID token กับเซิร์ฟเวอร์ LINE แล้วคืน payload ที่เชื่อถือได้
     *
     * ต้องส่ง client_id ไปด้วย ไม่งั้น token ที่ออกให้ "แอปอื่น" ก็ผ่านได้
     * ซึ่งเท่ากับไม่ได้ตรวจอะไรเลย
     *
     * @return array{sub:string,name:string,picture:string}
     */
    public static function verifyLineIdToken(string $idToken): array
    {
        $channelId = trim((string) (self::$lineCfg['channel_id'] ?? ''));
        if ($channelId === '') {
            // ยอมให้ตั้งจากหน้าแอดมินได้ (เก็บใน app_settings) เหมือนของเดิม
            $channelId = (string) (Db::value(
                "SELECT setting_value FROM app_settings WHERE setting_key = 'line_channel_id'"
            ) ?? '');
        }
        if ($channelId === '') {
            Response::fail('ยังไม่ได้ตั้งค่า LINE Channel ID ในระบบ', 500);
        }

        $url = (string) (self::$lineCfg['verify_url']
            ?? 'https://api.line.me/oauth2/v2.1/verify');
        $post = http_build_query(['id_token' => $idToken, 'client_id' => $channelId]);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $post,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($body === false || $code !== 200) {
            // ข้อความจาก LINE บอกได้แค่ว่า token ใช้ไม่ได้ ไม่ต้องส่งรายละเอียดกลับ
            error_log("[auth] LINE verify ล้มเหลว code=$code err=$err body="
                . substr((string) $body, 0, 300));
            Response::fail('ตรวจสอบบัญชี LINE ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่', 401);
        }

        $data = json_decode((string) $body, true);
        if (!is_array($data) || empty($data['sub'])) {
            Response::fail('ข้อมูลบัญชี LINE ไม่ถูกต้อง', 401);
        }
        // LINE ตรวจ aud/exp ให้แล้วในขั้นตอน verify — เช็คซ้ำอีกชั้นกันพลาด
        if ((string) ($data['aud'] ?? '') !== $channelId) {
            Response::fail('ID token นี้ไม่ได้ออกให้แอปนี้', 401);
        }
        if (isset($data['exp']) && (int) $data['exp'] < time()) {
            Response::fail('ID token หมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);
        }

        return [
            'sub'     => (string) $data['sub'],
            'name'    => (string) ($data['name'] ?? ''),
            'picture' => (string) ($data['picture'] ?? ''),
        ];
    }

    // ── กันเดารหัสโรงเรียน ──────────────────────────────────────────────

    public static function ipHash(): string
    {
        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
        if ($ip === '') {
            return '';
        }
        return hash('sha256', trim(explode(',', (string) $ip)[0]) . '|' . date('Y-m-d'));
    }
}
