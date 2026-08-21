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
    private static ?array $scorer = null;      // กรรมการที่เข้าด้วยรหัสเริ่มแข่ง
    private static int $ttl = 43200;
    private static int $teamTtl = 604800;
    /*
     * รหัสเริ่มแข่งมีอายุสั้นกว่าทางเข้าอื่นมาก เพราะมันคือ "ทางเข้าของงานวันนี้"
     * บอกต่อกันปากเปล่าหน้าสนาม ถือว่าหลุดตั้งแต่วันแรก
     * 16 ชั่วโมงยาวพอสำหรับงานที่เริ่มเช้ายันค่ำโดยไม่ต้องกรอกซ้ำกลางแมตช์
     * และสั้นพอที่วันรุ่งขึ้นเครื่องที่ยืมมาจะบันทึกผลไม่ได้แล้ว
     */
    private static int $scorerTtl = 57600;
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

    /**
     * token ของกรรมการมาคนละช่องกับ Authorization โดยตั้งใจ
     *
     * ครูที่เข้าระบบอยู่แล้วอาจกรอกรหัสเริ่มแข่งเพื่อช่วยจดผล ถ้าใช้ช่องเดียวกัน
     * token ของบัญชีจะถูกทับ แล้วเขาจะหลุดจากบัญชีตัวเองทันทีที่ไปช่วยจดผล
     * (อาการเดียวกับที่เคยเกิดกับ session โรงเรียน — ดูหมายเหตุใน boot())
     * แยกช่องไว้ ทั้งสองใบจึงอยู่ด้วยกันได้ ใครมีสิทธิ์อะไรก็ยังเป็นอย่างนั้น
     */
    private static function scorerToken(): string
    {
        $h = $_SERVER['HTTP_X_SCORER_TOKEN'] ?? '';
        if ($h === '' && function_exists('apache_request_headers')) {
            foreach (apache_request_headers() as $k => $v) {
                if (strcasecmp($k, 'X-Scorer-Token') === 0) {
                    $h = $v;
                    break;
                }
            }
        }
        // เผื่อ host ตัด header แปลก ๆ ทิ้ง — เหมือนที่ bearer() ทำกับ Authorization
        if ($h === '') {
            $h = (string) ($_GET['scorerToken'] ?? '');
        }
        return trim((string) $h);
    }

    /** โหลด session จาก token — เรียกครั้งเดียวต่อคำขอ */
    public static function boot(): void
    {
        self::bootScorer();
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
            'SELECT ts.school_id, ts.tournament_id, ts.user_id, s.school_name
               FROM team_sessions ts
               JOIN schools s ON s.school_id = ts.school_id
              WHERE ts.token_hash = :h3 AND ts.expires_at > NOW()
                AND ts.revoked_at IS NULL',
            [':h3' => $hash]
        );

        // session ทีมที่ออกให้ผู้ใช้ที่เข้าระบบอยู่ ให้ถือสิทธิ์ผู้ใช้ต่อไปด้วย
        //
        // ไม่งั้น token ของทีมจะไม่มีตัวตนผู้ใช้เลย คำขอที่ต้อง requireLogin()
        // (เช่น นับแจ้งเตือน) จะตอบ 401 แล้วเว็บก็เด้ง "เซสชันหมดอายุ"
        // ทั้งที่ครูเพิ่งเข้าระบบมาเอง
        //
        // ไม่ใช่การยกสิทธิ์: user_id นี้ถูกบันทึกตอนออก token จากบัญชีที่
        // ยืนยันตัวแล้วเท่านั้น เข้าด้วยรหัสโรงเรียนล้วนจะเป็น NULL เหมือนเดิม
        $tsUser = self::$teamSession['user_id'] ?? null;
        if ($tsUser !== null && $tsUser !== '') {
            self::$user = Db::one(
                'SELECT user_id, display_name, role, line_user_id,
                        phone, picture_url, username, must_change_password
                   FROM users WHERE user_id = :uid',
                [':uid' => $tsUser]
            );
        }
    }

    // ── สถานะปัจจุบัน ───────────────────────────────────────────────────

    public static function user(): ?array   { return self::$user; }
    public static function role(): ?string  { return self::$user['role'] ?? null; }
    public static function userId(): ?string { return self::$user['user_id'] ?? null; }
    public static function isLoggedIn(): bool { return self::$user !== null; }
    public static function isAdmin(): bool  { return (self::$user['role'] ?? '') === 'admin'; }
    public static function isStaff(): bool  { return (self::$user['role'] ?? '') === 'staff'; }
    /**
     * กรรมการบันทึกผล — บันทึกผลของรายการที่ถูกมอบหมายได้อย่างเดียว
     *
     * ตั้งใจไม่ให้ผ่าน requireStaff() เพราะ staff เห็นรายชื่อผู้ใช้ทั้งระบบ
     * เงินบริจาค และหลังบ้านทั้งหมด ซึ่งเกินความจำเป็นของคนที่มาช่วยจดผล
     */
    public static function isReferee(): bool { return (self::$user['role'] ?? '') === 'referee'; }

    /** school_id ของ session โรงเรียน (null ถ้าไม่ได้เข้าด้วยรหัสโรงเรียน) */
    public static function schoolId(): ?string { return self::$teamSession['school_id'] ?? null; }
    public static function teamTournamentId(): ?string { return self::$teamSession['tournament_id'] ?? null; }

    public static function actorType(): string
    {
        return match (true) {
            self::isAdmin()            => 'admin',
            self::isStaff()            => 'staff',
            self::isReferee()          => 'referee',
            self::schoolId() !== null  => 'school',
            self::isLoggedIn()         => 'user',
            // ต่ำสุดเพราะบัญชีจริงบอกตัวตนได้ดีกว่ารหัสที่ใครก็กรอกได้
            self::$scorer !== null     => 'scorer',
            default                    => 'system',
        };
    }

    public static function actorId(): string
    {
        return (string) (self::userId() ?? self::schoolId()
            ?? self::scorerTournamentId() ?? '');
    }

    public static function actorName(): string
    {
        // กรรมการที่เข้าด้วยรหัสไม่มีบัญชี — ใช้ชื่อที่กรอกไว้ตอนกรอกรหัส
        // ถ้าไม่กรอกก็ต้องยอมรับว่า audit บอกได้แค่ "มีคนถือรหัสของงานนี้"
        $scorer = self::$scorer !== null
            ? (self::scorerLabel() !== '' ? 'กรรมการ: ' . self::scorerLabel() : 'กรรมการ (รหัสเริ่มแข่ง)')
            : null;
        return (string) (self::$user['display_name']
            ?? self::$teamSession['school_name'] ?? $scorer ?? '');
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

    /**
     * ออก session โรงเรียน
     *
     * $userId คือบัญชีที่กำลังเข้าระบบอยู่ตอนกดเข้าหน้าโรงเรียน (ถ้ามี)
     * เก็บไว้เพื่อให้ token ใบนี้ถือทั้งสิทธิ์โรงเรียนและตัวผู้ใช้ ดู boot()
     */
    /**
     * session ของกรรมการ — รู้แค่ว่า "ถือรหัสของรายการไหน" ไม่ผูกกับบัญชีใคร
     *
     * ไม่ต่ออายุแบบ sliding ต่างจาก session ผู้ใช้ เพราะอันนี้ไม่ควรอยู่ข้ามงาน
     * ถ้าต่ออายุทุกครั้งที่ใช้ เครื่องที่เปิดหน้าค้างไว้จะบันทึกผลได้ไม่มีวันหมด
     */
    private static function bootScorer(): void
    {
        $token = self::scorerToken();
        if ($token === '') {
            return;
        }
        $hash = hash('sha256', $token);
        $row = Db::one(
            'SELECT tournament_id, label FROM scorer_sessions
              WHERE token_hash = :sh AND expires_at > NOW() AND revoked_at IS NULL',
            [':sh' => $hash]
        );
        if ($row === null) {
            return;
        }
        self::$scorer = $row;
        Db::exec('UPDATE scorer_sessions SET last_seen_at = NOW() WHERE token_hash = :sh2',
            [':sh2' => $hash]);
    }

    /** รายการที่กรรมการคนนี้บันทึกผลได้ (null = ไม่ได้ถือรหัสเริ่มแข่ง) */
    public static function scorerTournamentId(): ?string
    {
        return self::$scorer['tournament_id'] ?? null;
    }

    public static function scorerLabel(): string
    {
        return (string) (self::$scorer['label'] ?? '');
    }

    public static function issueScorer(string $tournamentId, string $label = ''): array
    {
        $token = bin2hex(random_bytes(32));
        $exp = date('Y-m-d H:i:s', time() + self::$scorerTtl);
        Db::exec(
            'INSERT INTO scorer_sessions
                (token_hash, tournament_id, label, expires_at, ip_hash, user_agent)
             VALUES (:h, :tid, :label, :exp, :ip, :ua)',
            [
                ':h'     => hash('sha256', $token),
                ':tid'   => $tournamentId,
                ':label' => mb_substr($label, 0, 80),
                ':exp'   => $exp,
                ':ip'    => self::ipHash(),
                ':ua'    => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ]
        );
        return ['token' => $token, 'expiresAt' => $exp];
    }

    public static function issueTeam(
        string $schoolId,
        string $tournamentId,
        ?string $userId = null
    ): array {
        $token = bin2hex(random_bytes(32));
        $exp = date('Y-m-d H:i:s', time() + self::$teamTtl);
        Db::exec(
            'INSERT INTO team_sessions
                (token_hash, school_id, tournament_id, user_id, expires_at, ip_hash, user_agent)
             VALUES (:h, :sid, :tid, :uid, :exp, :ip, :ua)',
            [
                ':h'   => hash('sha256', $token),
                ':sid' => $schoolId,
                ':tid' => $tournamentId,
                ':uid' => ($userId !== null && $userId !== '') ? $userId : null,
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
