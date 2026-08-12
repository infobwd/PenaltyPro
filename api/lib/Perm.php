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
