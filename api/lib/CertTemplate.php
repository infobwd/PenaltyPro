<?php
declare(strict_types=1);

/**
 * เทมเพลตเกียรติบัตร — โครงข้อมูลและค่าตั้งต้น
 *
 * แยกจาก routes/certificates.php เพราะทั้งตัวอ่าน ตัวบันทึก และตัววาด PDF
 * ต้องใช้ชุดค่าตั้งต้นเดียวกัน ถ้าต่างกันแม้แต่ค่าเดียว หน้าตัวอย่างกับใบจริง
 * จะไม่ตรงกันโดยไม่มีใครรู้
 *
 * โครงนี้ปรับมาจากระบบเกียรติบัตรของ Sillapa ซึ่งแยกข้อความเป็นส่วน ๆ
 * (หัวเรื่องหน่วยงาน / คำนำ / ชื่อ / เนื้อหา / วันที่) แทนที่จะเป็นก้อนเดียว
 * ทำให้คุมขนาดตัวอักษรแต่ละส่วนได้โดยผู้ใช้ไม่ต้องแตะ HTML
 */

/** ฟอนต์ที่ฝังไว้ใน api/fonts/ — ทุกไฟล์ผ่าน tools/patch-font.py แล้ว */
const CERT_FONTS = [
    'sarabun'    => ['label' => 'Sarabun (สารบรรณ — ทางการ)',
                     'R' => 'Sarabun-Regular.ttf',    'B' => 'Sarabun-Bold.ttf'],
    /**
     * ที่ไม่ใช้ Kanit ทั้งที่เป็นตัวเลือกยอดนิยม: ไฟล์ของ Kanit มี lookup ที่ตั้ง
     * flag UseMarkFilteringSet ไว้ แล้ว mPDF โยน exception ทิ้งทั้งเอกสาร
     * ("contains MarkGlyphSets - Not tested yet" ที่ Otl.php:4491)
     * แก้ได้ด้วยการล้าง flag ในตาราง GSUB/GPOS แต่นั่นคือการเปลี่ยนกติกา
     * การวางวรรณยุกต์ของฟอนต์ ซึ่งเสี่ยงเกินกว่าจะแลกกับความสวย
     */
    'prompt'     => ['label' => 'Prompt (พร้อมพ์ — ทันสมัย)',
                     'R' => 'Prompt-Regular.ttf',     'B' => 'Prompt-Bold.ttf'],
    'maitree'    => ['label' => 'Maitree (ไมตรี — มีหัว เอกสารราชการ)',
                     'R' => 'Maitree-Regular.ttf',    'B' => 'Maitree-Bold.ttf'],
    'mali'       => ['label' => 'Mali (มะลิ — ลายมือ อ่านง่าย)',
                     'R' => 'Mali-Regular.ttf',       'B' => 'Mali-Bold.ttf'],
    'charmonman' => ['label' => 'Charmonman (ชาญมนต์มาน — อ่อนช้อย)',
                     'R' => 'Charmonman-Regular.ttf', 'B' => 'Charmonman-Bold.ttf'],
    'srisakdi'   => ['label' => 'Srisakdi (ศรีศักดิ์ — ไทยโบราณ)',
                     'R' => 'Srisakdi-Regular.ttf',   'B' => 'Srisakdi-Bold.ttf'],
    'thasadith'  => ['label' => 'Thasadith (ทศดิส — หัวเรื่อง)',
                     'R' => 'Thasadith-Regular.ttf',  'B' => 'Thasadith-Bold.ttf'],
];

/** ส่วนข้อความที่เลือกฟอนต์และขอบขาวแยกกันได้ */
const CERT_PARTS = ['Header', 'SubHeader', 'Title', 'Name', 'Body', 'Date', 'Sign', 'Serial'];

/** กรอบสำเร็จรูป ใช้เมื่อยังไม่ได้อัปภาพพื้นหลัง */
const CERT_FRAMES = ['none', 'gold-double', 'gold-corners', 'navy-line', 'thai-premium'];

const CERT_ZONES_ALL = ['top', 'middle', 'bottom'];

/** ข้อความตั้งต้นแยกตามบทบาท */
const CERT_TPL_DEFAULT_BODY = [
    'Player'  => 'นักกีฬาโรงเรียน {team}' . "\n"
               . 'ได้เข้าร่วมการแข่งขัน {tournament}' . "\n" . '{award}',
    'Coach'   => 'ผู้ควบคุมทีมโรงเรียน {team}' . "\n"
               . 'ได้เข้าร่วมการแข่งขัน {tournament}',
    'Referee' => 'เป็นคณะกรรมการตัดสินการแข่งขัน' . "\n" . '{tournament}',
];

/**
 * ค่าตั้งต้นของเทมเพลต
 *
 * ตัวเลขจัดวางเป็นมิลลิเมตร อ้างอิงกระดาษ A4 แนวนอน 297 x 210
 */
function cert_tpl_defaults(string $role): array
{
    return [
        // ── ข้อความ ──────────────────────────────────────────────
        'headerText'    => '',            // ชื่อหน่วยงาน เช่น สพป.ประจวบฯ เขต 1
        // 0 = ไหลอยู่หัวบล็อกข้อความ / >0 = ตรึงห่างจากขอบบนเท่านี้
        'headerTop'     => 0,
        'subHeaderText' => 'เกียรติบัตรฉบับนี้ให้ไว้เพื่อแสดงว่า',
        'title'         => 'เกียรติบัตร',
        // พื้นหลังที่ออกแบบมาเองมักมีคำว่า "เกียรติบัตร" พิมพ์อยู่แล้ว
        'showTitle'     => true,
        'bodyText'      => CERT_TPL_DEFAULT_BODY[$role] ?? '',
        'dateText'      => '',            // ว่าง = ไม่พิมพ์บรรทัดวันที่
        'showRank'      => $role === 'Player',   // {award} แทนผลรางวัลจริง

        // ── ภาพ ─────────────────────────────────────────────────
        'backgroundUrl' => '',
        'frameStyle'    => 'gold-double',
        'logoLeftUrl'   => '',
        'logoRightUrl'  => '',
        'logoHeight'    => 22,
        // 0 = วางไว้หัวบล็อกข้อความตามเดิม / >0 = ตรึงห่างจากขอบบนเท่านี้
        'logoTop'       => 0,

        // ── ผู้ลงนาม (หลายคนได้) ────────────────────────────────
        'signatories'   => [],            // [{name, position, signatureUrl}]
        'showSignatureLine' => true,
        'signatureSpacing'  => 2,
        // 0 = ต่อท้ายเนื้อความ / >0 = ตรึงชิดขอบล่างเท่านี้
        'signBottom'    => 0,
        'signatureHeight' => 16,

        // ── การจัดวาง ───────────────────────────────────────────
        'zone'          => 'middle',      // บน / กลาง / ล่าง
        'contentOffset' => 0,             // ขยับขึ้น(-)/ลง(+) จากโซน
        'contentWidth'  => 235,           // ความกว้างบล็อกข้อความ
        'serialTop'     => 14,
        'serialRight'   => 20,
        // เลขที่มักตกไปอยู่บนลายมุมกระดาษจนอ่านไม่ออก จึงให้ใส่พื้นรองได้
        'serialPlate'      => false,
        'serialPlateColor' => '#ffffff',
        'serialPlatePad'   => 1.5,
        'sizeSerial'    => 10,
        'colorSerial'   => '#4b5563',
        'qrBottom'      => 12,
        'qrRight'       => 14,
        'qrPlate'       => true,     // กรอบขาวรองหลัง QR ให้สแกนติดบนพื้นลาย
        'qrPlatePad'    => 2,        // ระยะเว้นในกรอบ (mm)
        'qrPlateBorder' => true,     // เส้นขอบบาง ๆ รอบกรอบขาว
        'qrCaption'     => 'สแกนเพื่อตรวจสอบ',
        'qrSize'        => 20,       // ด้านของ QR (mm)

        // ── ตัวอักษร ────────────────────────────────────────────
        'fontFamily'    => 'sarabun',
        'lineHeight'    => 1.7,      // ระยะห่างระหว่างบรรทัดในเนื้อความ
        'blockGap'      => 2,        // ค่าเริ่มต้นของระยะห่างระหว่างส่วน (mm)
        'sizeHeader'    => 16,
        'sizeSubHeader' => 14,
        'sizeTitle'     => 32,
        'sizeName'      => 26,
        'sizeBody'      => 15,
        'sizeSign'      => 13,
        'colorTitle'    => '#14532d',
        'colorName'     => '#7c2d12',
        'colorText'     => '#1f2937',

        /**
         * แถบพื้นโปร่งใต้ข้อความทั้งบล็อก
         *
         * ใช้เมื่อพื้นหลังลายจัดจนขอบขาวรายตัวอักษรยังไม่พอ
         */
        'textPlate'     => false,
        'textPlateOpacity' => 70,

        /**
         * ฟอนต์และขอบขาวรายส่วน
         *
         * ฟอนต์ว่าง = ใช้ fontFamily ของทั้งใบ
         * ขอบขาวทำด้วย text-shadow 8 ทิศ (ทดสอบแล้วว่าเป็นวิธีเดียวที่ได้ผลจริง
         * บน mPDF — text-outline ไม่มีผลอะไรเลย)
         */
        'fontHeader' => '', 'fontSubHeader' => '', 'fontTitle' => '',
        'fontName' => '', 'fontBody' => '', 'fontDate' => '', 'fontSign' => '',

        /**
         * ระยะห่าง "เหนือ" ข้อความแต่ละชุด (mm)
         *
         * นับจากด้านบน เพราะผู้ใช้คิดเป็น "ดันบรรทัดนี้ให้ห่างจากชุดข้างบน"
         * ไม่ใช่ "ดันชุดถัดไปให้ห่างจากบรรทัดนี้"
         *
         * null = ใช้ blockGap ของทั้งใบ — เก็บเป็น null ไม่ใช่ 0 เพราะ 0 คือ
         * "ชิดกันสนิท" ซึ่งเป็นค่าที่ผู้ใช้ตั้งใจเลือกได้จริง ต้องแยกจาก
         * "ยังไม่ได้ตั้ง" ไม่งั้นพอตั้ง 0 แล้วระบบจะเด้งกลับไปใช้ค่ากลางเสมอ
         */
        'gapHeader' => null, 'gapTitle' => null, 'gapSubHeader' => null,
        'gapName' => null, 'gapBody' => null, 'gapDate' => null,

        'outlineHeader' => false, 'outlineSubHeader' => false, 'outlineTitle' => false,
        'outlineName' => false, 'outlineBody' => false, 'outlineDate' => false,
        'outlineSign' => false,
        'outlineWidth' => 0.4,       // ความหนาขอบขาว (mm)
    ];
}

/** รวมค่าที่บันทึกไว้เข้ากับค่าตั้งต้น แล้วกรองให้อยู่ในช่วงที่ใช้ได้จริง */
function cert_tpl_merge(string $role, ?array $saved): array
{
    $d = cert_tpl_defaults($role);
    $t = array_merge($d, is_array($saved) ? $saved : []);

    $str = static fn(string $k, int $max): string =>
        mb_substr(trim((string) ($t[$k] ?? '')), 0, $max);
    $num = static function (string $k, float $min, float $max) use ($t, $d) {
        $v = is_numeric($t[$k] ?? null) ? (float) $t[$k] : (float) $d[$k];
        return max($min, min($max, $v));
    };
    $color = static function (string $k) use ($t, $d): string {
        $v = (string) ($t[$k] ?? '');
        return preg_match('/^#[0-9a-fA-F]{6}$/', $v) === 1 ? $v : $d[$k];
    };

    $signatories = [];
    foreach ((array) ($t['signatories'] ?? []) as $s) {
        if (!is_array($s)) {
            continue;
        }
        $name = mb_substr(trim((string) ($s['name'] ?? '')), 0, 150);
        $pos  = mb_substr(trim((string) ($s['position'] ?? '')), 0, 200);
        if ($name === '' && $pos === '') {
            continue;
        }
        $signatories[] = [
            'name' => $name, 'position' => $pos,
            'signatureUrl' => mb_substr(trim((string) ($s['signatureUrl'] ?? '')), 0, 500),
        ];
        // เกิน 3 คนจะเบียดกันจนอ่านไม่ออกบนกระดาษ A4 แนวนอน
        if (count($signatories) >= 3) {
            break;
        }
    }

    $font = static function (string $k) use ($t): string {
        $v = (string) ($t[$k] ?? '');
        return isset(CERT_FONTS[$v]) ? $v : '';   // ว่าง = ใช้ฟอนต์หลักของใบ
    };

    /** ระยะห่างรายส่วน — null คือยังไม่ตั้ง ให้ตกไปใช้ blockGap ตอนวาด */
    $gap = static function (string $k) use ($t) {
        $v = $t[$k] ?? null;
        if ($v === null || $v === '') {
            return null;
        }
        return is_numeric($v) ? max(0.0, min(40.0, (float) $v)) : null;
    };

    $out = [
        'headerText'    => $str('headerText', 200),
        'headerTop'     => $num('headerTop', 0, 150),
        'subHeaderText' => $str('subHeaderText', 200),
        'title'         => $str('title', 100) ?: 'เกียรติบัตร',
        'showTitle'     => (bool) ($t['showTitle'] ?? true),
        'bodyText'      => mb_substr((string) ($t['bodyText'] ?? ''), 0, 2000),
        'dateText'      => $str('dateText', 200),
        'showRank'      => (bool) ($t['showRank'] ?? false),

        'backgroundUrl' => $str('backgroundUrl', 500),
        'frameStyle'    => in_array($t['frameStyle'] ?? '', CERT_FRAMES, true)
            ? $t['frameStyle'] : 'gold-double',
        'logoLeftUrl'   => $str('logoLeftUrl', 500),
        'logoRightUrl'  => $str('logoRightUrl', 500),
        'logoHeight'    => $num('logoHeight', 8, 45),
        'logoTop'       => $num('logoTop', 0, 150),

        'signatories'       => $signatories,
        'showSignatureLine' => (bool) ($t['showSignatureLine'] ?? true),
        'signatureSpacing'  => $num('signatureSpacing', 0, 15),
        'signBottom'        => $num('signBottom', 0, 120),
        'signatureHeight'   => $num('signatureHeight', 6, 40),

        'zone'          => in_array($t['zone'] ?? '', CERT_ZONES_ALL, true)
            ? $t['zone'] : 'middle',
        'contentOffset' => $num('contentOffset', -60, 60),
        'contentWidth'  => $num('contentWidth', 120, 275),
        'serialTop'     => $num('serialTop', 4, 100),
        'serialRight'   => $num('serialRight', 4, 140),
        'serialPlate'      => (bool) ($t['serialPlate'] ?? false),
        'serialPlateColor' => $color('serialPlateColor'),
        'serialPlatePad'   => $num('serialPlatePad', 0, 8),
        'sizeSerial'    => $num('sizeSerial', 6, 24),
        'colorSerial'   => $color('colorSerial'),
        'qrBottom'      => $num('qrBottom', 4, 100),
        'qrRight'       => $num('qrRight', 4, 140),
        'qrPlate'       => (bool) ($t['qrPlate'] ?? true),
        'qrPlatePad'    => $num('qrPlatePad', 0, 10),
        'qrPlateBorder' => (bool) ($t['qrPlateBorder'] ?? true),
        'qrCaption'     => mb_substr(trim((string) ($t['qrCaption'] ?? '')), 0, 60),
        'qrSize'        => $num('qrSize', 10, 45),

        'fontFamily'    => isset(CERT_FONTS[$t['fontFamily'] ?? ''])
            ? $t['fontFamily'] : 'sarabun',
        'lineHeight'    => $num('lineHeight', 1.0, 3.0),
        'blockGap'      => $num('blockGap', 0, 30),
        'sizeHeader'    => $num('sizeHeader', 8, 40),
        'sizeSubHeader' => $num('sizeSubHeader', 8, 40),
        'sizeTitle'     => $num('sizeTitle', 12, 60),
        'sizeName'      => $num('sizeName', 12, 50),
        'sizeBody'      => $num('sizeBody', 8, 30),
        'sizeSign'      => $num('sizeSign', 8, 24),
        'colorTitle'    => $color('colorTitle'),
        'colorName'     => $color('colorName'),
        'colorText'     => $color('colorText'),

        'textPlate'        => (bool) ($t['textPlate'] ?? false),
        'textPlateOpacity' => $num('textPlateOpacity', 10, 100),
        'outlineWidth'     => $num('outlineWidth', 0.1, 1.5),
    ];

    // ฟอนต์และขอบขาวรายส่วน — วนใส่เพื่อไม่ให้พลาดส่วนใดส่วนหนึ่งเวลาเพิ่มใหม่
    foreach (CERT_PARTS as $part) {
        $out['font' . $part]    = $font('font' . $part);
        $out['outline' . $part] = (bool) ($t['outline' . $part] ?? false);
    }
    foreach (['Header', 'Title', 'SubHeader', 'Name', 'Body', 'Date'] as $part) {
        $out['gap' . $part] = $gap('gap' . $part);
    }

    return $out;
}

/**
 * เติมค่าตั้งต้นจากค่าที่เคยตั้งไว้ก่อนมีเทมเพลต (db/21-23)
 *
 * เจ้าภาพที่ตั้งผู้ลงนามและพื้นหลังไว้แล้วต้องไม่ต้องมากรอกใหม่
 * เรียกเฉพาะตอนที่ยังไม่มีแถวใน certificate_templates
 */
function cert_tpl_from_legacy(array $t, string $role): array
{
    $col = ['Player' => 'player', 'Coach' => 'coach', 'Referee' => 'referee'][$role];

    $tpl = cert_tpl_defaults($role);
    $tpl['title'] = (string) ($t['cert_title'] ?? '') ?: 'เกียรติบัตร';

    $body = trim((string) ($t["cert_body_$col"] ?? ''));
    if ($body !== '') {
        $tpl['bodyText'] = $body;
        // ข้อความเดิมมี {name} อยู่ในเนื้อหา ส่วนโครงใหม่แยกชื่อออกมาเป็นบรรทัด
        // ของตัวเอง จึงต้องเอา {name} ออกไม่ให้ชื่อซ้ำสองที่
        $tpl['subHeaderText'] = '';
    }

    $signer = trim((string) ($t['cert_signer_name'] ?? ''));
    if ($signer !== '' || trim((string) ($t['cert_signer_title'] ?? '')) !== '') {
        $tpl['signatories'] = [[
            'name' => $signer,
            'position' => (string) ($t['cert_signer_title'] ?? ''),
            'signatureUrl' => (string) ($t['cert_signature_url'] ?? ''),
        ]];
    }

    $tpl['backgroundUrl'] = (string) ($t["cert_bg_$col"] ?? '');
    $tpl['zone'] = in_array($t["cert_zone_$col"] ?? '', CERT_ZONES_ALL, true)
        ? $t["cert_zone_$col"] : 'middle';

    return $tpl;
}
