<?php
declare(strict_types=1);

/**
 * บันทึกทุกการเปลี่ยนแปลงที่ตรวจสอบย้อนหลังได้
 *
 * ระบบเดิมมีแค่ lastEditedBy/At ที่เขียนทับค่าเดิม ทำให้ตอบไม่ได้ว่า
 * "คะแนนทีมนี้เคยเป็นเท่าไหร่ ใครแก้ ตอนไหน" ซึ่งจำเป็นมากในงานแข่งขัน
 * ที่มีการประท้วงผล
 */
final class Audit
{
    public static function log(
        string $entity,
        string $entityId,
        string $action,
        ?array $before = null,
        ?array $after = null
    ): void {
        try {
            Db::exec(
                'INSERT INTO audit_log
                    (actor_type, actor_id, actor_name, entity, entity_id, action,
                     before_json, after_json, ip_hash)
                 VALUES (:atype, :aid, :aname, :entity, :eid, :action, :before, :after, :ip)',
                [
                    ':atype'  => Auth::actorType(),
                    ':aid'    => Auth::actorId(),
                    ':aname'  => Auth::actorName(),
                    ':entity' => $entity,
                    ':eid'    => $entityId,
                    ':action' => $action,
                    ':before' => $before === null ? null : self::enc($before),
                    ':after'  => $after === null ? null : self::enc($after),
                    ':ip'     => self::ipHash(),
                ]
            );
        } catch (Throwable $e) {
            // audit ล้มต้องไม่ทำให้การกระทำหลักล้มตาม
            Response::warn('AUDIT_WRITE_FAILED', $e->getMessage());
        }
    }

    private static function enc(array $data): string
    {
        return json_encode($data, JSON_UNESCAPED_UNICODE) ?: '{}';
    }

    /** ไม่เก็บ IP ดิบ — เก็บ hash ที่หมุน salt รายวัน */
    private static function ipHash(): string
    {
        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
        if ($ip === '') {
            return '';
        }
        $ip = trim(explode(',', $ip)[0]);
        return hash('sha256', $ip . '|' . date('Y-m-d'));
    }
}
