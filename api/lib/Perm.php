<?php
declare(strict_types=1);

/**
 * กติกาสิทธิ์ทั้งหมดอยู่ที่เดียว
 *
 * เหตุผลที่รวมไว้ไฟล์เดียว: ระบบเดิมกระจายการเช็คสิทธิ์ไว้ตามหน้าจอ (ซ่อนปุ่ม)
 * แล้วฝั่ง server ไม่เช็คเลย พอมีคนยิง API ตรงก็ทำได้ทุกอย่าง เมื่อรวมไว้ที่นี่
 * การตอบคำถาม "ใครทำอะไรได้บ้าง" จึงอ่านจบได้ในไฟล์เดียว
 *
 * ลำดับชั้น:
 *   admin ส่วนกลาง      -> ทุกอย่าง ทุกรายการ
 *   ผู้ดูแลประจำรายการ   -> เฉพาะรายการที่ถูกมอบหมาย (โรงเรียนเจ้าภาพ)
 *   staff               -> ช่วยงานทั่วไป ไม่ได้ตั้งค่ารายการ
 *   รหัสโรงเรียน         -> เฉพาะทีมของโรงเรียนตัวเอง
 */
final class Perm
{
    /** @var array<string,bool> จำผลไว้ ไม่ต้อง query ซ้ำในคำขอเดียว */
    private static array $cache = [];

    /** ผู้ดูแลประจำรายการนี้หรือไม่ (แอดมินส่วนกลางนับด้วยเสมอ) */
    public static function managesTournament(string $tournamentId): bool
    {
        if (Auth::isAdmin()) {
            return true;
        }
        $uid = Auth::userId();
        if ($uid === null || $tournamentId === '') {
            return false;
        }
        $key = "$tournamentId|$uid";
        if (!array_key_exists($key, self::$cache)) {
            self::$cache[$key] = Db::value(
                'SELECT 1 FROM tournament_managers
                  WHERE tournament_id = :tid AND user_id = :uid LIMIT 1',
                [':tid' => $tournamentId, ':uid' => $uid]
            ) !== null;
        }
        return self::$cache[$key];
    }

    public static function requireTournamentManager(string $tournamentId): void
    {
        if (!self::managesTournament($tournamentId)) {
            Response::fail(
                'คุณไม่มีสิทธิ์จัดการรายการแข่งขันนี้',
                403,
                ['tournamentId' => $tournamentId]
            );
        }
    }

    /**
     * ── สิทธิ์ "บันทึกผลการแข่งขัน" แยกออกจาก "จัดการรายการ" โดยตั้งใจ ──
     *
     * กรรมการที่กรอกรหัสเริ่มแข่งต้องจดผลได้ แต่ต้องแตะอย่างอื่นไม่ได้เลย
     * — ไม่ใช่แก้รายชื่อทีม ไม่ใช่ตรวจสลิปเงิน ไม่ใช่ตั้งค่ารายการ
     *
     * ⚠️ ห้ามเอาเงื่อนไขรหัสเริ่มแข่งไปใส่ใน managesTournament()
     * ที่นั่นถูกใช้คุมเกือบทุกอย่างของรายการ (บัญชี ทีม ตาราง ผู้สนับสนุน)
     * เติมเข้าไปที่เดียวเท่ากับเปิดทั้งหมดให้คนที่รู้รหัส 6 หลักที่บอกต่อ
     * กันปากเปล่าหน้าสนาม ซึ่งไม่ใช่สิ่งที่ใครสั่ง
     *
     * ตัวนี้จึงถูกเรียกเฉพาะใน routes/live.php ที่เป็นการเขียนผลแข่งเท่านั้น
     */
    public static function canScore(string $tournamentId): bool
    {
        if ($tournamentId !== '' && Auth::scorerTournamentId() === $tournamentId) {
            return true;
        }
        return self::managesTournament($tournamentId);
    }

    public static function requireScorer(string $tournamentId): void
    {
        if (self::canScore($tournamentId)) {
            return;
        }
        // แยกข้อความสองแบบ เพราะทางแก้คนละทางกันคนละเรื่อง
        if (!Auth::isLoggedIn() && Auth::scorerTournamentId() === null) {
            Response::fail(
                'ต้องเข้าสู่ระบบ หรือกรอกรหัสเริ่มแข่งของรายการนี้ก่อนจึงจะบันทึกผลได้',
                401,
                ['tournamentId' => $tournamentId, 'needScorerCode' => true]
            );
        }
        Response::fail(
            'คุณไม่มีสิทธิ์บันทึกผลของรายการแข่งขันนี้',
            403,
            ['tournamentId' => $tournamentId]
        );
    }

    /**
     * ── ใครตรวจสลิปค่าสมัครได้ ────────────────────────────────────────
     *
     * ผู้ดูแลรายการ + ผู้รับผิดชอบบัญชีของรายการนั้น
     *
     * เดิมเป็นผู้ดูแลรายการอย่างเดียว ซึ่งไม่ตรงกับคนที่ทำงานนี้จริง:
     * คนที่นั่งกระทบยอดกับสมุดบัญชีคือเหรัญญิก และเขามีหน้า /finance ของตัวเอง
     * อยู่แล้ว การบังคับให้เดินไปหาผู้ดูแลเพื่อกดยืนยันทีละทีมทำให้ยอดค่าสมัคร
     * ในบัญชีค้างอยู่ที่ "รอตรวจ" ทั้งที่เงินเข้าบัญชีไปแล้ว
     *
     * ทั้งสองกลุ่มถูกแอดมินแต่งตั้งมาเหมือนกัน (tournament_managers /
     * tournament_finance_members) ไม่ใช่ใครก็ได้ที่เข้าระบบ
     */
    public static function canReviewPayments(string $tournamentId): bool
    {
        if (self::managesTournament($tournamentId)) {
            return true;
        }
        $uid = Auth::userId();
        if ($uid === null || $tournamentId === '') {
            return false;
        }
        $key = "pay|$tournamentId|$uid";
        if (!array_key_exists($key, self::$cache)) {
            self::$cache[$key] = Db::value(
                'SELECT 1 FROM tournament_finance_members
                  WHERE tournament_id = :tid AND user_id = :uid LIMIT 1',
                [':tid' => $tournamentId, ':uid' => $uid]
            ) !== null;
        }
        return self::$cache[$key];
    }

    public static function requirePaymentReviewer(string $tournamentId): void
    {
        if (!self::canReviewPayments($tournamentId)) {
            Response::fail(
                'คุณไม่มีสิทธิ์ตรวจสอบการชำระเงินของรายการแข่งขันนี้',
                403,
                ['tournamentId' => $tournamentId]
            );
        }
    }

    /** สร้าง/ลบรายการ และมอบสิทธิ์ — แอดมินส่วนกลางเท่านั้น */
    public static function requireGlobalAdmin(): void
    {
        Auth::requireAdmin();
    }

    /** รายการที่ผู้ใช้คนนี้จัดการได้ (แอดมินส่วนกลาง = null คือทุกรายการ) */
    public static function managedTournamentIds(): ?array
    {
        if (Auth::isAdmin()) {
            return null;
        }
        $uid = Auth::userId();
        if ($uid === null) {
            return [];
        }
        return array_column(
            Db::all('SELECT tournament_id FROM tournament_managers WHERE user_id = :uid',
                [':uid' => $uid]),
            'tournament_id'
        );
    }
}
