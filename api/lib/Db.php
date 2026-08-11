<?php
declare(strict_types=1);

/**
 * PDO singleton
 *
 * ATTR_EMULATE_PREPARES = false โดยตั้งใจ — ทำให้ prepared statement เป็นของจริง
 * ผลข้างเคียงที่ต้องระวัง (pitfall P1): named placeholder ตัวหนึ่งใช้ได้ครั้งเดียว
 * ต่อ statement ถ้าใช้ซ้ำจะได้ HY093 แล้ว query พังเงียบๆ
 *
 *   ผิด  WHERE (name LIKE :q OR school LIKE :q)
 *   ถูก  WHERE (name LIKE :q_name OR school LIKE :q_school)
 */
final class Db
{
    private static ?PDO $pdo = null;
    private static array $cfg = [];
    /** @var array<int,array{sql:string,ms:float}> */
    private static array $log = [];

    public static function configure(array $cfg): void
    {
        self::$cfg = $cfg;
    }

    public static function conn(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $c = self::$cfg;
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s',
            $c['host'], $c['name'], $c['charset'] ?? 'utf8mb4');

        self::$pdo = new PDO($dsn, $c['user'], $c['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_STRINGIFY_FETCHES  => false,
        ]);
        self::$pdo->exec("SET time_zone = '+07:00'");

        return self::$pdo;
    }

    /** @param array<string,mixed> $params */
    public static function all(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    /** @param array<string,mixed> $params */
    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    /** @param array<string,mixed> $params */
    public static function value(string $sql, array $params = [])
    {
        $row = self::run($sql, $params)->fetch(PDO::FETCH_NUM);
        return $row === false ? null : $row[0];
    }

    /** @param array<string,mixed> $params @return int จำนวนแถวที่ถูกกระทบ */
    public static function exec(string $sql, array $params = []): int
    {
        return self::run($sql, $params)->rowCount();
    }

    /** @param array<string,mixed> $params */
    private static function run(string $sql, array $params): PDOStatement
    {
        self::assertNoRepeatedPlaceholder($sql);

        $t0 = microtime(true);
        $st = self::conn()->prepare($sql);
        $st->execute($params);
        self::$log[] = [
            'sql' => preg_replace('/\s+/', ' ', trim($sql)),
            'ms'  => round((microtime(true) - $t0) * 1000, 2),
        ];
        return $st;
    }

    /**
     * จับ pitfall P1 ตั้งแต่ตอน dev แทนที่จะไปเจอเป็น HY093 บน production
     * ที่ทำให้ section หนึ่งว่างเปล่าโดยไม่มีใครรู้
     */
    private static function assertNoRepeatedPlaceholder(string $sql): void
    {
        // ตัด literal และ identifier ที่ครอบด้วยเครื่องหมายออกก่อน ไม่งั้น ':'
        // ที่อยู่ในข้อความจะถูกนับเป็น placeholder
        // MySQL ถือว่า "..." เป็น string literal เหมือน '...' (เว้นแต่เปิด ANSI_QUOTES)
        $stripped = preg_replace(
            ["/'(?:[^'\\\\]|\\\\.)*'/", '/"(?:[^"\\\\]|\\\\.)*"/', '/`[^`]*`/'],
            ["''", '""', '``'],
            $sql
        ) ?? $sql;
        preg_match_all('/:([a-zA-Z_][a-zA-Z0-9_]*)/', $stripped, $m);
        $counts = array_count_values($m[1]);
        foreach ($counts as $name => $n) {
            if ($n > 1) {
                throw new LogicException(
                    "placeholder :$name ปรากฏ $n ครั้งในคิวรีเดียว — " .
                    "PDO::ATTR_EMULATE_PREPARES=false ไม่รองรับ ให้ตั้งชื่อแยก " .
                    "เช่น :{$name}_a / :{$name}_b"
                );
            }
        }
    }

    public static function transaction(callable $fn)
    {
        $pdo = self::conn();
        $pdo->beginTransaction();
        try {
            $result = $fn($pdo);
            $pdo->commit();
            return $result;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /** @return array<int,array{sql:string,ms:float}> */
    public static function queryLog(): array
    {
        return self::$log;
    }
}
