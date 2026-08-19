<?php
declare(strict_types=1);

/**
 * วาดใบเกียรติบัตรตามเทมเพลต
 *
 * ── ข้อจำกัดของ mPDF ที่ต้องเลี่ยงตลอดไฟล์นี้ ────────────────────────
 *  1. ไม่รองรับ flexbox — ต้นแบบ (Sillapa) จัดวางด้วย flex ทั้งหมด
 *     ที่นี่จึงใช้ตารางและ block ธรรมดาแทน
 *  2. ไม่รองรับ text-shadow — ใช้แถบพื้นโปร่ง (textPlate) แทน
 *  3. vertical-align ในเซลล์จะมีผลก็ต่อเมื่อกำหนดความสูงที่ทั้ง <tr>
 *     และแอตทริบิวต์ height ของ <td> (height บน <table> ไม่มีผล)
 *  4. ห้ามมีกฎ @page — พอมี mPDF จะไม่ระบายพื้นหลังของ body เลย
 *  5. เส้นทางรูปต้องผ่าน realpath ก่อน ไม่งั้น ".." กลางทางทำให้รูปหายเงียบ ๆ
 */

require_once __DIR__ . '/Pdf.php';
require_once __DIR__ . '/CertTemplate.php';

/** หนีอักขระ HTML — เนื้อหามาจากชื่อคนและข้อความที่เจ้าภาพพิมพ์เอง */
function cr_esc(string $v): string
{
    return htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * ฟอนต์ทั้งหมดที่เทมเพลตนี้ใช้จริง
 *
 * ลงทะเบียนเฉพาะที่ใช้ ไม่ใช่ทั้ง 7 ตระกูล เพราะ mPDF อ่านและทำ subset
 * ทุกไฟล์ที่ลงทะเบียนไว้ ซึ่งเสียเวลาและหน่วยความจำโดยเปล่าประโยชน์
 *
 * @return array{0:array<string,array<string,mixed>>,1:string} fontdata, ฟอนต์หลัก
 */
function cert_fonts_used(array $tpl): array
{
    $main = isset(CERT_FONTS[$tpl['fontFamily']]) ? $tpl['fontFamily'] : 'sarabun';
    $keys = [$main];
    foreach (CERT_PARTS as $part) {
        $k = (string) ($tpl['font' . $part] ?? '');
        if ($k !== '' && isset(CERT_FONTS[$k])) {
            $keys[] = $k;
        }
    }

    $data = [];
    foreach (array_unique($keys) as $k) {
        $data[$k] = ['R' => CERT_FONTS[$k]['R'], 'B' => CERT_FONTS[$k]['B'],
                     'useOTL' => 0xFF];
    }
    return [$data, $main];
}

/** สร้าง mPDF ที่ตั้งฟอนต์ตามเทมเพลต */
function cert_pdf_new(array $tpl): \Mpdf\Mpdf
{
    [$data, $main] = cert_fonts_used($tpl);
    return pdf_new('A4-L', $data, $main);
}

/**
 * ขอบขาวรอบตัวอักษร
 *
 * ⚠️ ต้องใช้ text-shadow 8 ทิศเท่านั้น — ทดสอบบนพื้นหลังลายจัดแล้วว่า
 * text-outline ของ mPDF ไม่ให้ผลอะไรเลย ส่วน text-shadow ทิศเดียว
 * ได้เงาข้างเดียวซึ่งยังอ่านยากอยู่
 */
function cert_outline_css(bool $on, float $w): string
{
    if (!$on) {
        return '';
    }
    $d = number_format($w, 2, '.', '');
    $h = number_format($w * 0.75, 2, '.', '');
    return "text-shadow: {$d}mm 0 #fff, -{$d}mm 0 #fff, 0 {$d}mm #fff, 0 -{$d}mm #fff,"
        . " {$h}mm {$h}mm #fff, -{$h}mm -{$h}mm #fff, {$h}mm -{$h}mm #fff, -{$h}mm {$h}mm #fff;";
}

/**
 * แถวเว้นระยะระหว่างบล็อกข้อความ
 *
 * ⚠️ ในช่องตาราง mPDF ไม่สนใจ margin, padding, height หรือ line-height ของ
 * block ที่อยู่ข้างใน — วัดแล้วตำแหน่งไม่ขยับเลยสักมิลลิเมตรทั้งสี่วิธี
 * สิ่งเดียวที่ได้ผลคือ "ตารางที่มีแถวกำหนดความสูง"
 *
 * ต้องใส่ border-collapse + cellpadding/cellspacing = 0 และ font-size/line-height
 * เป็น 0 ด้วย ไม่งั้นแถวเปล่าจะมีความสูงติดตัวมาอีกราว 2mm ทำให้ระยะที่ได้
 * ไม่ตรงกับตัวเลขที่ผู้ใช้ตั้ง (ทดสอบแล้ว: แบบนี้ได้ตรงเป๊ะทุกค่า)
 */
function cert_spacer(float $mm): string
{
    if ($mm <= 0) {
        return '';
    }
    return '<table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0">'
        . '<tr style="height:' . $mm . 'mm;"><td height="' . $mm
        . 'mm" style="padding:0;font-size:0;line-height:0;"></td></tr></table>';
}

/** style ของส่วนข้อความหนึ่ง — ฟอนต์เฉพาะส่วน + ขอบขาวเฉพาะส่วน */
function cert_part_style(array $tpl, string $part): string
{
    $font = (string) ($tpl['font' . $part] ?? '');
    return ($font !== '' ? "font-family: $font;" : '')
        . cert_outline_css((bool) ($tpl['outline' . $part] ?? false),
            (float) $tpl['outlineWidth']);
}

/** CSS ของกรอบสำเร็จรูป ใช้เมื่อไม่มีภาพพื้นหลัง */
function cert_frame_html(string $style): string
{
    return match ($style) {
        'gold-double' => '<div style="position:absolute;top:8mm;left:8mm;'
            . 'width:281mm;height:194mm;border:3px double #c7a44a;"></div>',
        'gold-corners' => '<div style="position:absolute;top:10mm;left:10mm;'
            . 'width:277mm;height:190mm;border:1px solid #c7a44a;"></div>'
            . '<div style="position:absolute;top:7mm;left:7mm;width:34mm;height:34mm;'
            . 'border-top:4px solid #c7a44a;border-left:4px solid #c7a44a;"></div>'
            . '<div style="position:absolute;top:169mm;left:256mm;width:34mm;height:34mm;'
            . 'border-bottom:4px solid #c7a44a;border-right:4px solid #c7a44a;"></div>',
        'navy-line' => '<div style="position:absolute;top:9mm;left:9mm;'
            . 'width:279mm;height:192mm;border:2px solid #1e3a8a;"></div>',
        'thai-premium' => '<div style="position:absolute;top:7mm;left:7mm;'
            . 'width:283mm;height:196mm;border:6px solid #b88746;"></div>'
            . '<div style="position:absolute;top:12mm;left:12mm;'
            . 'width:273mm;height:186mm;border:1px solid #b88746;"></div>',
        default => '',
    };
}

/**
 * แทนช่องในข้อความ
 *
 * {name} {team} {tournament} {award} {no} {date}
 * ขึ้นบรรทัดใหม่กลายเป็น <br> ไม่ใช่หายไป
 */
function cert_fill(string $tpl, array $vars): string
{
    $out = cr_esc($tpl);
    foreach ($vars as $k => $v) {
        $out = str_replace('{' . $k . '}', cr_esc((string) $v), $out);
    }
    return str_replace("\n", '<br>', $out);
}

/**
 * วาดใบทั้งชุดลงใน mPDF ที่ส่งเข้ามา
 *
 * @param array<int,array{key:string,name:string,team:string,certNo:string,
 *                        award:string,verifyUrl:string}> $people
 */
function cert_render_pages(\Mpdf\Mpdf $mpdf, array $tpl, array $people,
                           string $tournamentName, array $cfg): void
{
    $bg    = pdf_local_image($tpl['backgroundUrl'], $cfg);
    $logoL = pdf_local_image($tpl['logoLeftUrl'], $cfg);
    $logoR = pdf_local_image($tpl['logoRightUrl'], $cfg);
    $fam   = isset(CERT_FONTS[$tpl['fontFamily']]) ? $tpl['fontFamily'] : 'sarabun';

    $bgCss = $bg !== ''
        ? "background-image: url('" . str_replace('\\', '/', $bg) . "');"
          . ' background-image-resize: 6; background-repeat: no-repeat;'
        : 'background-color: #ffffff;';

    // ⚠️ ห้ามใส่ @page ที่นี่ (ดูหัวไฟล์ ข้อ 4)
    $mpdf->WriteHTML(
        "body { font-family: $fam; color: {$tpl['colorText']}; $bgCss }"
        . '.cell { text-align: center; }'
        . '.hdr { font-size: ' . $tpl['sizeHeader'] . 'pt; }'
        . '.sub { font-size: ' . $tpl['sizeSubHeader'] . 'pt; }'
        . '.ttl { font-size: ' . $tpl['sizeTitle'] . 'pt; font-weight: bold;'
              . ' color: ' . $tpl['colorTitle'] . '; }'
        . '.nm  { font-size: ' . $tpl['sizeName'] . 'pt; font-weight: bold;'
              . ' color: ' . $tpl['colorName'] . '; }'
        . '.bd  { font-size: ' . $tpl['sizeBody'] . 'pt;'
              . ' line-height: ' . $tpl['lineHeight'] . '; }'
        . '.sg  { font-size: ' . $tpl['sizeSign'] . 'pt; }'
        . '.serial { font-size: ' . $tpl['sizeSerial'] . 'pt;'
              . ' color: ' . $tpl['colorSerial'] . '; }'
        . '.qrtxt { font-size: 6pt; color: #4b5563; }',
        \Mpdf\HTMLParserMode::HEADER_CSS
    );

    // โซนกำหนด vertical-align ส่วน contentOffset ขยับต่อด้วย padding
    $align = $tpl['zone'];
    $off   = (float) $tpl['contentOffset'];
    $padTop = 14 + max(0, $off);
    $padBot = 14 + max(0, -$off);
    $rowH   = max(60, 210 - $padTop - $padBot);

    $plate = $tpl['textPlate']
        ? 'background-color: #ffffff; opacity: ' . ($tpl['textPlateOpacity'] / 100) . ';'
        : '';

    $first = true;
    foreach ($people as $p) {
        if (!$first) {
            $mpdf->AddPage();
        }
        $first = false;

        $vars = [
            'name' => $p['name'], 'team' => $p['team'],
            'tournament' => $tournamentName,
            'award' => $p['award'] ?? '',
            'no' => $p['certNo'] ?? '',
        ];

        if ($bg === '') {
            $mpdf->WriteHTML(cert_frame_html($tpl['frameStyle']),
                \Mpdf\HTMLParserMode::HTML_BODY);
        }

        // เลขที่ใบ — วางตามพิกัดที่ตั้งไว้ พร้อมพื้นรอง/ขอบขาวถ้าเปิดไว้
        if (($p['certNo'] ?? '') !== '') {
            $plate = $tpl['serialPlate']
                ? 'background-color:' . $tpl['serialPlateColor'] . ';'
                  . 'padding:' . $tpl['serialPlatePad'] . 'mm '
                  . ($tpl['serialPlatePad'] + 1) . 'mm;border-radius:1mm;'
                : '';
            $mpdf->WriteHTML(
                '<div class="serial" style="position:absolute;top:' . $tpl['serialTop']
                . 'mm;right:' . $tpl['serialRight'] . 'mm;'
                . cert_part_style($tpl, 'Serial') . $plate . '">เลขที่ '
                . cr_esc($p['certNo']) . '</div>',
                \Mpdf\HTMLParserMode::HTML_BODY);
        }

        /**
         * QR ตรวจสอบ
         *
         * ต้องกำหนด height ให้บล็อกด้วย ไม่ใช่แค่ bottom — mPDF ไล่เนื้อหาลงจาก
         * ขอบบนของบล็อก ถ้าไม่บอกความสูง บรรทัดคำอธิบายใต้ QR จะทะลุขอบกระดาษ
         * แล้วโดนตัดหายไปครึ่งบรรทัด
         */
        if (($p['verifyUrl'] ?? '') !== '') {
            /**
             * กรอบขาวรองช่วยให้กล้องจับ QR ติดบนพื้นหลังลายจัด
             *
             * ขนาดกล่องคำนวณจาก ขนาด QR + ระยะเว้น + บรรทัดคำอธิบาย
             * ถ้าใส่ความสูงตายตัวไว้ พอผู้ใช้ขยาย QR หรือเพิ่มระยะเว้น
             * คำอธิบายจะทะลุออกนอกกล่องแล้วโดนตัด
             */
            $qs   = (float) $tpl['qrSize'];
            $pad  = $tpl['qrPlate'] ? (float) $tpl['qrPlatePad'] : 0.0;
            $cap  = (string) $tpl['qrCaption'];
            $capH = $cap !== '' ? 4.0 : 0.0;
            $boxW = $qs + $pad * 2;
            $boxH = $qs + $capH + $pad * 2;

            $plateCss = $tpl['qrPlate']
                ? 'background-color:#ffffff;'
                  . ($tpl['qrPlateBorder'] ? 'border:0.25mm solid #cbd5e1;' : '')
                  . 'border-radius:1.5mm;'
                : '';

            // size ของ <barcode> คือตัวคูณจากขนาดมาตรฐาน ไม่ใช่มิลลิเมตร
            // 20mm ที่ error level M ตรงกับราว 0.75 จึงเทียบบัญญัติไตรยางศ์จากนั้น
            $scale = number_format($qs / 20 * 0.75, 3, '.', '');

            $mpdf->WriteHTML(
                '<div style="position:absolute;bottom:' . $tpl['qrBottom']
                . 'mm;right:' . $tpl['qrRight'] . 'mm;'
                . 'width:' . $boxW . 'mm;height:' . $boxH . 'mm;'
                . 'padding:' . $pad . 'mm;text-align:center;' . $plateCss . '">'
                . '<barcode code="' . cr_esc($p['verifyUrl'])
                . '" type="QR" class="barcode" size="' . $scale
                . '" error="M" disableborder="1" />'
                . ($cap !== '' ? '<div class="qrtxt">' . cr_esc($cap) . '</div>' : '')
                . '</div>',
                \Mpdf\HTMLParserMode::HTML_BODY);
        }

        // ── โลโก้ ───────────────────────────────────────────────
        $logoHtml = '';
        if ($logoL !== '' || $logoR !== '') {
            $h = $tpl['logoHeight'] . 'mm';
            $imgs = [];
            foreach ([$logoL, $logoR] as $lg) {
                if ($lg !== '') {
                    $imgs[] = '<img src="' . cr_esc(str_replace('\\', '/', $lg))
                        . '" style="height:' . $h . ';">';
                }
            }
            $logoHtml = implode('<span style="display:inline-block;width:18mm;"></span>', $imgs);
        }

        // logoTop > 0 = ตรึงห่างจากขอบบนตามที่ตั้ง ไม่ไหลไปตามความยาวข้อความ
        if ($logoHtml !== '' && $tpl['logoTop'] > 0) {
            $mpdf->WriteHTML(
                '<div style="position:absolute;top:' . $tpl['logoTop'] . 'mm;left:0;'
                . 'width:297mm;text-align:center;">' . $logoHtml . '</div>',
                \Mpdf\HTMLParserMode::HTML_BODY);
        }

        // ── ผู้ลงนาม ────────────────────────────────────────────
        $signHtml = '';
        if ($tpl['signatories'] !== []) {
            $n = count($tpl['signatories']);
            $w = (int) floor(100 / $n);
            $sh = $tpl['signatureHeight'] . 'mm';
            $cells = '';
            foreach ($tpl['signatories'] as $s) {
                $sig = pdf_local_image($s['signatureUrl'], $cfg);
                $cells .= '<td style="width:' . $w . '%;text-align:center;vertical-align:bottom;'
                    . cert_part_style($tpl, 'Sign') . '">'
                    . ($sig !== ''
                        ? '<img src="' . cr_esc(str_replace('\\', '/', $sig))
                          . '" style="height:' . $sh . ';"><br>'
                        : '<div style="height:' . $sh . ';"></div>')
                    . ($tpl['showSignatureLine']
                        ? '<div style="border-bottom:1px dotted #475569;width:58mm;'
                          . 'margin:0 auto;"></div>'
                        : '')
                    . '<div class="sg" style="margin-top:' . $tpl['signatureSpacing'] . 'mm;">'
                    . '( ' . cr_esc($s['name'] !== '' ? $s['name'] : ' ') . ' )</div>'
                    // ตำแหน่งมักยาวหลายบรรทัด เช่น ชื่อตำแหน่ง + ตำแหน่งในคณะกรรมการ
                    // ต้องขึ้นบรรทัดตามที่ผู้ใช้พิมพ์ ไม่ใช่ยุบเป็นบรรทัดเดียว
                    . '<div class="sg">'
                    . str_replace("\n", '<br>', cr_esc($s['position'])) . '</div>'
                    . '</td>';
            }
            $signHtml = '<table style="width:100%;"><tr>' . $cells . '</tr></table>';
        }

        // signBottom > 0 = ตรึงชิดขอบล่าง ชุดลายเซ็นจึงอยู่ที่เดิมทุกใบ
        // ไม่ขยับตามความยาวชื่อหรือเนื้อความที่ต่างกันในแต่ละคน
        $signPinned = $signHtml !== '' && $tpl['signBottom'] > 0;
        if ($signPinned) {
            $mpdf->WriteHTML(
                '<div style="position:absolute;bottom:' . $tpl['signBottom'] . 'mm;'
                . 'left:' . ((297 - $tpl['contentWidth']) / 2) . 'mm;'
                . 'width:' . $tpl['contentWidth'] . 'mm;">' . $signHtml . '</div>',
                \Mpdf\HTMLParserMode::HTML_BODY);
        }

        // ── บล็อกเนื้อหา ────────────────────────────────────────
        /**
         * ระยะห่าง "เหนือ" ส่วนนี้ — ไม่ได้ตั้งเฉพาะส่วนก็ใช้ค่ากลางของทั้งใบ
         *
         * คิดจากด้านบนเพราะผู้ใช้สั่งงานแบบ "ให้บรรทัดวันที่ห่างจากชุดบน"
         * ซึ่งตรงกับการดันตัวเองลง ไม่ใช่ดันตัวถัดไป
         */
        $gapOf = static function (string $part) use ($tpl): string {
            $v = $tpl['gap' . $part] ?? null;
            return cert_spacer($v === null ? (float) $tpl['blockGap'] : (float) $v);
        };

        // ชื่อหน่วยงานตรึงบน — แยกออกจากบล็อกกลาง จะได้อยู่ที่เดิมทุกใบ
        // ไม่ขยับตามความยาวชื่อผู้รับหรือจำนวนบรรทัดของเนื้อความ
        $headerPinned = $tpl['headerText'] !== '' && $tpl['headerTop'] > 0;
        if ($headerPinned) {
            $mpdf->WriteHTML(
                '<div class="hdr" style="position:absolute;top:' . $tpl['headerTop']
                . 'mm;left:' . ((297 - $tpl['contentWidth']) / 2) . 'mm;'
                . 'width:' . $tpl['contentWidth'] . 'mm;text-align:center;'
                . cert_part_style($tpl, 'Header') . '">'
                . cert_fill($tpl['headerText'], $vars) . '</div>',
                \Mpdf\HTMLParserMode::HTML_BODY);
        }

        $inner = '';

        /**
         * ส่วนแรกที่มองเห็นไม่ต้องเว้นระยะเหนือมัน — ระยะจากขอบบนคุมด้วย
         * padding ของเซลล์กับ contentOffset อยู่แล้ว ถ้าใส่อีกจะเกินไปหนึ่งช่วง
         */
        $first = true;
        $add = static function (string $part, string $html) use (&$inner, &$first, $gapOf): void {
            if (!$first) {
                $inner .= $gapOf($part);
            }
            $inner .= $html;
            $first = false;
        };

        if ($logoHtml !== '' && $tpl['logoTop'] <= 0) {
            $add('Header', '<div>' . $logoHtml . '</div>');
        }
        if ($tpl['headerText'] !== '' && !$headerPinned) {
            $add('Header', '<div class="hdr" style="' . cert_part_style($tpl, 'Header') . '">'
                . cert_fill($tpl['headerText'], $vars) . '</div>');
        }
        if ($tpl['showTitle']) {
            $add('Title', '<div class="ttl" style="' . cert_part_style($tpl, 'Title') . '">'
                . cert_fill($tpl['title'], $vars) . '</div>');
        }
        if ($tpl['subHeaderText'] !== '') {
            $add('SubHeader', '<div class="sub" style="' . cert_part_style($tpl, 'SubHeader') . '">'
                . cert_fill($tpl['subHeaderText'], $vars) . '</div>');
        }
        $add('Name', '<div class="nm" style="' . cert_part_style($tpl, 'Name') . '">'
            . cr_esc($p['name']) . '</div>');
        if (trim($tpl['bodyText']) !== '') {
            $add('Body', '<div class="bd" style="' . cert_part_style($tpl, 'Body') . '">'
                . cert_fill($tpl['bodyText'], $vars) . '</div>');
        }
        if ($tpl['dateText'] !== '') {
            $add('Date', '<div class="bd" style="' . cert_part_style($tpl, 'Date') . '">'
                . cert_fill($tpl['dateText'], $vars) . '</div>');
        }
        if ($signHtml !== '' && !$signPinned) {
            $inner .= cert_spacer(8) . $signHtml;
        }

        if ($plate !== '') {
            $inner = '<div style="' . $plate . 'padding:6mm 8mm;">' . $inner . '</div>';
        }

        $mpdf->WriteHTML(
            '<table style="width:100%;"><tr style="height:' . $rowH . 'mm;">'
            . '<td class="cell" height="' . $rowH . 'mm" style="vertical-align:' . $align
            . ';padding:' . $padTop . 'mm ' . ((297 - $tpl['contentWidth']) / 2) . 'mm '
            . $padBot . 'mm;">'
            . $inner . '</td></tr></table>',
            \Mpdf\HTMLParserMode::HTML_BODY
        );
    }
}
